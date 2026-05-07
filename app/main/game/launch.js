// Game launch orchestrator + DXVK env-var helper.
//
// The launch path is fragile - any change here can break game startup or
// post-game cleanup. Phase 7a extraction is verbatim: every log line,
// timeout duration, env var name, IPC channel, and ordering decision is
// preserved exactly. The only structural change is replacing closure access
// to module-scoped state in main.js with explicit DI:
//
//   - mainWindow / gameProcess / hideLauncherTimeout: injected as accessors
//     so launch.js never holds stale refs across game sessions.
//   - GAME_INSTALL_DIR: injected as a getter; the launch path only reads it.
//   - DXVK / FPS / dxvk.conf helpers (checkDxvkStatus, readCurrentFps): still
//     live in main.js and migrate to ./dxvk.js in Phase 7b. We DI them.
//   - Path-protection probe (isGamePathInProtectedDirectory) and the in-game
//     config writer (setDefaultGameConfig): DI from main.js, will move in
//     Phase 7c.
//   - PCID restoration (restoreOriginalPcid): DI from main.js. The activation
//     module owns this and migrates in Phase 8 - we MUST NOT change it.
//
// Why hideLauncherTimeout lives here:
//   It's only read/written by launch.js itself (set after a successful spawn,
//   cleared on game-exit). Owning it as a module-local closure simplifies the
//   DI surface and makes the lifecycle obvious - it can never leak into other
//   parts of the launcher.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { app } = require("electron");

const { runPreLaunchDiagnostics } = require("../diagnostics");
const { detectAllGPUs } = require("../system");
const discordRpc = require("../discord/rpc");
const { AUTO_LAUNCH_AFTER_DOWNLOAD } = require("../config/constants");
const { safeLog } = require("../logger");
const registryUtils = require("../../utils/registry");

// ============================================================================
// DXVK env-var helper
// ============================================================================
//
// Returns extra env vars passed to spawn() for the game process. The base
// settings (HUD off, log level=warn) apply to all GPUs; the AMD path adds
// frame-rate clamps + RADV_PERFTEST="nggc" which has been proven to give
// noticeably better frame pacing on RDNA cards.

// Enhanced FPS limiting for AMD GPUs using DXVK environment variables
function getEnhancedDxvkEnvVars(fps, gpuVendor) {
  const envVars = {};

  // Base DXVK configuration for all GPUs
  envVars.DXVK_HUD = "0"; // Disable HUD
  envVars.DXVK_LOG_LEVEL = "warn"; // Reduce logging

  // AMD-specific optimizations for FPS limiting
  if (gpuVendor === "amd") {
    // Force DXVK to use more aggressive frame pacing for AMD
    envVars.DXVK_FRAME_RATE = fps.toString();
    envVars.DXVK_STATE_CACHE = "1";
    envVars.RADV_PERFTEST = "nggc"; // AMD-specific optimizations

    // Use VK_LAYER for frame limiting (works better on AMD)
    envVars.VK_ICD_FILENAMES = process.env.VK_ICD_FILENAMES || "";
  }

  return envVars;
}

// ============================================================================
// Launch orchestrator
// ============================================================================
//
// `makeLaunchGameLogic(deps)` returns the actual `launchGameLogic` function
// the renderer calls via IPC. The factory pattern lets us bind deps once at
// app startup without leaking globals into this module.

function makeLaunchGameLogic(deps) {
  const {
    getMainWindow,
    getGameProcess,
    setGameProcess,
    getGameInstallDir,
    getDiagnosticsDeps,
    readCurrentFpsFromDxvkConf,
    isGamePathInProtectedDirectory,
    setDefaultGameConfig,
    checkDxvkStatus,
    restoreOriginalPcid,
    playerTracker,
  } = deps;

  // Module-local timer ref. Set on successful spawn, cleared in onGameExit.
  // Lives here (not in main.js) because nothing outside launch.js touches it.
  let hideLauncherTimeout = null;

  // PID liveness polling while a session is active — catches rare cases where the
  // OS process is gone but Node did not emit `close` (so the launcher would stay hidden).
  let gameLivenessInterval = null;

  // Extract launch logic into reusable function
  return async function launchGameLogic(gameSettings, source = "unknown") {
    try {
      // Safety check: Never auto-launch if AUTO_LAUNCH_AFTER_DOWNLOAD is false
      if (source === "auto-launch" && !AUTO_LAUNCH_AFTER_DOWNLOAD) {
        safeLog.warn(
          "[Launch] Blocked auto-launch attempt - AUTO_LAUNCH_AFTER_DOWNLOAD is false"
        );
        return { success: false, error: "Auto-launch is disabled" };
      }

      // Run pre-launch diagnostics to detect and auto-fix common issues
      const diagnostics = await runPreLaunchDiagnostics(getDiagnosticsDeps());

      const mainWindow = getMainWindow();

      // Check for critical issues that would prevent game launch
      const criticalIssues = diagnostics.issues.filter(
        (issue) => issue.severity === "critical"
      );
      if (criticalIssues.length > 0) {
        safeLog.error("[Launch] ❌ Critical issues detected, cannot launch game");
        const errorMessages = criticalIssues
          .map((issue) => issue.message)
          .join("\n");

        // Send detailed error to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("launch-error", {
            critical: true,
            issues: criticalIssues,
            autoFixed: diagnostics.autoFixed,
          });
        }

        // Build clearer error message for the return value
        let errorMessage;
        if (criticalIssues.length === 1) {
          const issue = criticalIssues[0];
          if (issue.type === "directx") {
            errorMessage =
              "DirectX 9+ isn't detected. Please install DirectX 9 from the launcher's setup options.";
          } else {
            errorMessage = `${issue.message}${
              issue.fix ? ` (${issue.fix})` : ""
            }`;
          }
        } else {
          const errorDetails = criticalIssues
            .map((issue) => {
              if (issue.type === "directx") {
                return "DirectX 9+ isn't detected/installed";
              }
              return issue.message;
            })
            .join("; ");
          errorMessage = `Critical issues detected: ${errorDetails}`;
        }

        return {
          success: false,
          error: errorMessage,
          details: criticalIssues,
        };
      }

      // GPU selection:
      // - We intentionally do NOT auto-pick a "primary" GPU on multi-GPU systems.
      // - If the user explicitly selected a GPU vendor in settings, we use that
      //   to decide whether to apply vendor-specific tuning (e.g. AMD DXVK env vars).
      // - Otherwise, treat the GPU as "unknown/multi" and avoid vendor-specific tuning.
      const allowedVendors = new Set(["amd", "nvidia", "intel"]);
      const requestedVendor =
        gameSettings && allowedVendors.has(gameSettings.gpu)
          ? gameSettings.gpu
          : null;

      const allGpus = await detectAllGPUs();
      let gpuInfo = { vendor: "unknown", name: "Unknown GPU" };

      if (allGpus.length === 1) {
        gpuInfo = allGpus[0];
      } else if (allGpus.length > 1) {
        if (requestedVendor) {
          const match = allGpus.find((g) => g.vendor === requestedVendor);
          if (match) {
            gpuInfo = match;
          } else {
            gpuInfo = { vendor: "unknown", name: "Multiple GPUs detected" };
          }
        } else {
          gpuInfo = { vendor: "unknown", name: "Multiple GPUs detected" };
        }
      }

      safeLog.info(
        `[Launch] GPU selection: ${gpuInfo.vendor.toUpperCase()} - ${gpuInfo.name}`
      );

      // Get actual FPS from dxvk.conf instead of using the one from settings object
      const actualFps = readCurrentFpsFromDxvkConf() || gameSettings.maxFrameRate;

      // Log with the correct FPS value
      safeLog.info(`[Launch] Launching game from ${source} with settings:`, {
        ...gameSettings,
        maxFrameRate: actualFps,
      });

      const gameInstallDir = getGameInstallDir();

      // Path to the Shadowrun executable
      const gameExePath = path.join(gameInstallDir, "Shadowrun.exe");

      if (!fs.existsSync(gameExePath)) {
        safeLog.error("Game executable not found at:", gameExePath);
        return {
          success: false,
          error:
            "Shadowrun.exe was not found in the game folder. Use Settings → Game location to choose the correct folder.",
          suggestMoveOrAdmin: isGamePathInProtectedDirectory(gameInstallDir),
        };
      }

      // Set default game configuration before launching (resolution and volume)
      setDefaultGameConfig();

      // Wait a moment to ensure game process actually starts before marking as in-game
      // This improves accuracy - don't mark as in-game until process is confirmed running
      setTimeout(() => {
        const proc = getGameProcess();
        if (proc && !proc.killed) {
          // markGameStarted() sets playerInGame + gameStartTime inside the
          // Discord module and triggers an immediate Rich Presence update.
          discordRpc.markGameStarted();
        }
      }, 2000); // 2 second delay to ensure game process has started

      // Get GPU-specific environment variables for enhanced FPS limiting
      const dxvkEnvVars = getEnhancedDxvkEnvVars(actualFps, gpuInfo.vendor);
      // IMPORTANT:
      // Do NOT force DXVK adapter selection via DXVK_FILTER_DEVICE_NAME.
      // On hybrid systems (iGPU + dGPU), filtering by name can cause DXVK/D3D9
      // to pick the wrong device or crash on startup. We rely on DXVK/Windows
      // to choose the appropriate adapter.

      // Create crash log file path
      const crashLogPath = path.join(app.getPath("userData"), "game-crash.log");

      // One-shot guard: `close` and the liveness probe may both try to finalize.
      let gameExitHandled = false;

      // Shared handler when the game process exits (used for both normal exit and spawn failure)
      async function onGameExit(exitCode, signal, stdoutStr, stderrStr, errorMessage) {
        if (gameExitHandled) {
          return;
        }
        gameExitHandled = true;

        if (gameLivenessInterval) {
          clearInterval(gameLivenessInterval);
          gameLivenessInterval = null;
        }

        const timestamp = new Date().toISOString();
        const hasError = exitCode !== 0 || signal || errorMessage;

        // Only persist game-crash.log for failed launches / abnormal exits — successful
        // sessions produced noisy duplicate DXVK warnings and inflated the log file.
        if (hasError) {
          try {
            const crashLog = [
              `=== Game Crash Report - ${timestamp} ===`,
              `Exit Code: ${exitCode ?? "0 (normal exit)"}`,
              signal ? `Signal: ${signal}` : "",
              `Game Path: ${gameExePath}`,
              `Working Directory: ${gameInstallDir}`,
              errorMessage ? `Error: ${errorMessage}` : "",
              stdoutStr ? `\n--- STDOUT ---\n${stdoutStr}` : "",
              stderrStr ? `\n--- STDERR ---\n${stderrStr}` : "",
              `=== End of Report ===\n\n`,
            ]
              .filter((line) => line !== "")
              .join("\n");

            fs.appendFileSync(crashLogPath, crashLog, "utf8");
            safeLog.info(`[Game Crash] Log written to: ${crashLogPath}`);
          } catch (logError) {
            safeLog.error(
              "[Game Crash] Failed to write crash log:",
              logError.message
            );
          }
        }

        if (hasError) {
          safeLog.error("Error launching game or game exited with error:", errorMessage || `code ${exitCode}, signal ${signal}`);
          const stderrText = stderrStr || "";
          const stdoutText = stdoutStr || "";
          const combinedOutput = stderrText + stdoutText + (errorMessage || "");
          const isVulkanError =
            combinedOutput.includes("vkGetInstanceProcAddr not found") ||
            combinedOutput.includes("Vulkan: vkGetInstanceProcAddr not found");

          let dxvkEnabled = false;
          if (isVulkanError) {
            try {
              const dxvkStatus = await checkDxvkStatus();
              dxvkEnabled = dxvkStatus.enabled;
            } catch (dxvkCheckError) {
              safeLog.error(
                "[Game Crash] Error checking DXVK status:",
                dxvkCheckError
              );
            }
          }

          const suggestMoveOrAdmin = isGamePathInProtectedDirectory(gameInstallDir);

          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("game-crash", {
              exitCode: exitCode ?? undefined,
              signal,
              error: errorMessage || (exitCode !== 0 ? `Exit code ${exitCode}` : undefined),
              logPath: crashLogPath,
              isVulkanError,
              dxvkEnabled,
              suggestMoveOrAdmin,
            });
          }
        }

        safeLog.info(
          `[Game Close] Game process has exited${exitCode ? ` with code ${exitCode}` : ""}${signal ? ` signal ${signal}` : ""}`
        );
        setGameProcess(null);
        // Clear Discord in-game state and push the idle update.
        discordRpc.markGameEnded();

        try {
          const backupExists = await registryUtils.checkSrPcidBackupExists();
          if (backupExists) {
            const currentPcid = await registryUtils.getPcidFromRegistry();
            const backupPcid =
              await registryUtils.getSrPcidBackupFromRegistry();

            if (currentPcid && backupPcid) {
              const currentHex = currentPcid
                .toString(16)
                .toUpperCase()
                .padStart(16, "0");
              const backupHex = backupPcid.toUpperCase().replace(/,/g, "");

              if (currentHex !== backupHex) {
                safeLog.info("[Game Close] Restoring original PCID...");
                await restoreOriginalPcid();
                safeLog.info("[Game Close] ✅ PCID restored");
              }
            }
          }
        } catch (restoreError) {
          safeLog.error(
            "[Game Close] Error restoring PCID:",
            restoreError.message
          );
        }

        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          if (hideLauncherTimeout) {
            clearTimeout(hideLauncherTimeout);
            hideLauncherTimeout = null;
            safeLog.info("[Game Close] Cleared pending launcher hide timeout");
          }

          win.setSkipTaskbar(false);
          win.show();
          win.focus();

          setTimeout(() => {
            const w = getMainWindow();
            if (w && !w.isDestroyed() && !getGameProcess()) {
              if (!w.isVisible()) {
                w.show();
                w.focus();
                safeLog.info("[Game Close] Re-showing launcher (was hidden)");
              }
            }
          }, 100);

          safeLog.info("[Game Close] Launcher restored (window and taskbar)");
          win.webContents.send("game-state-update", { running: false });
        }

        playerTracker.setStatus("menu");
      }

      // Launch with spawn (no shell) so the game starts reliably without admin when path is user-writable
      let stdoutBuf = "";
      let stderrBuf = "";
      const gameProcess = spawn(gameExePath, [], {
        cwd: gameInstallDir,
        env: {
          ...process.env,
          __COMPAT_LAYER: "RunAsInvoker DisablePCA",
          ...dxvkEnvVars,
        },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      setGameProcess(gameProcess);

      if (gameProcess.stdout) {
        gameProcess.stdout.on("data", (data) => {
          stdoutBuf += data.toString();
        });
      }
      if (gameProcess.stderr) {
        gameProcess.stderr.on("data", (data) => {
          stderrBuf += data.toString();
        });
      }

      gameProcess.on("close", (code, signal) => {
        onGameExit(code, signal, stdoutBuf, stderrBuf, null);
      });

      gameProcess.on("error", (processError) => {
        safeLog.error("[Launch] Failed to start game process:", processError);
        setGameProcess(null);
        onGameExit(
          processError.code ?? -1,
          processError.signal,
          stdoutBuf,
          stderrBuf,
          processError.message
        );
      });

      // If the tracked PID disappears without a `close` event, finish the session the same way.
      const GAME_LIVENESS_MS = 15_000;
      gameLivenessInterval = setInterval(() => {
        const proc = getGameProcess();
        if (!proc) {
          if (gameLivenessInterval) {
            clearInterval(gameLivenessInterval);
            gameLivenessInterval = null;
          }
          return;
        }
        try {
          if (proc.pid) {
            process.kill(proc.pid, 0);
          }
        } catch {
          safeLog.warn(
            "[Launch] Liveness probe: game PID no longer exists — completing session (missed close event)"
          );
          if (gameLivenessInterval) {
            clearInterval(gameLivenessInterval);
            gameLivenessInterval = null;
          }
          void onGameExit(0, null, stdoutBuf, stderrBuf, null);
        }
      }, GAME_LIVENESS_MS);

      // Set game audio volume to 50% using native helper
      // This runs in the background and doesn't block game launch
      try {
        // Try multiple possible paths for the audio helper
        const possiblePaths = [
          // Production path (packaged with electron-builder)
          path.join(process.resourcesPath, "audio-volume-helper.exe"),
          // Development path (root of project)
          path.join(app.getAppPath(), "audio-volume-helper.exe"),
          // Legacy path
          path.join(app.getAppPath(), "resources", "audio-volume-helper.exe"),
        ];

        let audioHelperPath = null;
        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            audioHelperPath = testPath;
            break;
          }
        }

        if (audioHelperPath) {
          safeLog.info(
            `[Audio] Launching audio volume helper from: ${audioHelperPath}`
          );
          // Spawn the helper in detached mode so it doesn't block
          const audioHelper = spawn(audioHelperPath, ["Shadowrun.exe", "50"], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          });
          audioHelper.unref(); // Don't wait for it to complete
          safeLog.info("[Audio] Audio volume helper launched");
        } else {
          safeLog.info(
            "[Audio] Audio volume helper not found at any expected location, skipping volume adjustment"
          );
        }
      } catch (audioError) {
        safeLog.warn("[Audio] Could not set game volume:", audioError.message);
      }

      // Notify renderer that game is now running
      const winRunning = getMainWindow();
      if (winRunning && !winRunning.isDestroyed()) {
        winRunning.webContents.send("game-state-update", { running: true });
      }

      // Warn before hiding if we're running on a virtual GPU — the game is
      // unlikely to start and we don't want to leave the launcher hidden.
      if (gpuInfo.vendor === "virtual" || gpuInfo.vendor === "unknown") {
        const warnWin = getMainWindow();
        if (warnWin && !warnWin.isDestroyed()) {
          warnWin.webContents.send("show-notification", {
            message:
              "Virtual GPU detected (VMware / VirtualBox). Shadowrun requires real GPU hardware — the game may hang or crash.",
            type: "warning",
          });
        }
        safeLog.warn(
          `[Launch] ⚠️  Virtual or unknown GPU (${gpuInfo.name}). Game may not start.`
        );
      }

      // Delay hiding launcher to allow game to load first (5 seconds)
      hideLauncherTimeout = setTimeout(() => {
        const w = getMainWindow();
        if (w && !w.isDestroyed() && getGameProcess()) {
          w.hide();
          // Hide from taskbar
          w.setSkipTaskbar(true);
          safeLog.info(
            "[Launch] Launcher hidden (window and taskbar) after delay"
          );
        }
        hideLauncherTimeout = null;
      }, 5000);

      // Update player tracking status
      playerTracker.setStatus("in-game");

      // Update Discord status right away (the markGameStarted() call inside
      // the 2 s setTimeout above sets playerInGame + gameStartTime; this
      // earlier pulse keeps Discord in sync the moment the process spawns).
      discordRpc.updateDiscordActivity(true);

      return { success: true };
    } catch (error) {
      safeLog.error("Error launching game", error);
      return {
        success: false,
        error: error.message,
        suggestMoveOrAdmin: isGamePathInProtectedDirectory(getGameInstallDir()),
      };
    }
  };
}

module.exports = { makeLaunchGameLogic, getEnhancedDxvkEnvVars };
