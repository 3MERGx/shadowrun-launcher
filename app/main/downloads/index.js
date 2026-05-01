// Downloads aggregator + IPC registrar.
//
// Owns the three renderer-facing handlers that drive the install pipeline:
//   - "cancel-download"   - flips the cancellation flag this module owns
//   - "download-game"     - the full GFWL -> DX9 -> build.zip orchestration
//   - "check-directx"     - thin wrapper around isDX9Installed
//
// This module also OWNS the two flags that were previously module-scoped in
// main.js:
//   - downloadInProgress  - set true while download-game is running, prevents
//                           re-entry; reset in the finally block.
//   - cancelDownloadRequested - set true by "cancel-download", read inside
//                           downloadFile() (via the isCancelled getter we
//                           pass in) and at every step boundary in
//                           download-game so we can short-circuit cleanly.
//
// Everything else (mainWindow, GAME_INSTALL_DIR / RESOURCES_DIR mutable state,
// playerTracker, findGameInstallation, isRunningAsAdmin, the writable-dir +
// admin-dir-creation helpers, loadSettingsFromDisk + launchGameLogic for the
// AUTO_LAUNCH_AFTER_DOWNLOAD path) is INJECTED by main.js. State migration
// itself is scheduled for Phase 7/10; this phase only moves logic.
//
// Behavior preserved verbatim from app/main.js (Phase 6 extraction). Every
// log line, emoji, IPC channel name, error code mapping, progress event,
// and ordering decision (GFWL first, then DX9, then build.zip) is untouched.

const { safeLog } = require("../logger");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");

const {
  GAME_FILES_URL,
  GFWL_URL,
  DX9_URL,
  GAME_FILES_TEMP,
  AUTO_LAUNCH_AFTER_DOWNLOAD,
} = require("../config/constants");

const { downloadFile } = require("./http");
const { extractZip, extractZipFallback } = require("./archive");
const { runSilentInstaller } = require("./installers");
const { isDX9Installed, isGFWLInstalled } = require("./installChecks");

function registerDownloadsIpc(deps) {
  const {
    ipcMain,
    getMainWindow,
    getGameInstallDir,
    setGameInstallDir,
    setResourcesDir,
    playerTracker,
    findGameInstallation,
    isRunningAsAdmin,
    isDirectoryWritable,
    createDirectoryWithPermissions,
    loadSettingsFromDisk,
    launchGameLogic,
  } = deps;

  // Flags this module owns. They were `let cancelDownloadRequested` and
  // `let downloadInProgress` at module scope in main.js previously.
  let downloadInProgress = false;
  let cancelDownloadRequested = false;

  ipcMain.handle("cancel-download", () => {
    cancelDownloadRequested = true;
    return { success: true };
  });

  // Update the download-game handler to check for existing components
  ipcMain.handle("download-game", async () => {
    const mainWindow = getMainWindow();

    try {
      if (downloadInProgress) {
        return { success: false, error: "Download already in progress" };
      }

      downloadInProgress = true;
      cancelDownloadRequested = false;

      // Update player tracking status
      playerTracker.setStatus("downloading");

      // Create temp directory
      if (!fs.existsSync(GAME_FILES_TEMP)) {
        fs.mkdirSync(GAME_FILES_TEMP, { recursive: true });
      }

      // Send initial message
      mainWindow.webContents.send(
        "download-message",
        "Preparing installation... This may take a few minutes."
      );

      // STEP 1: Check for existing components FIRST
      safeLog.info("\n========================================");
      safeLog.info("📋 CHECKING EXISTING COMPONENTS");
      safeLog.info("========================================");
      const dx9Installed = await isDX9Installed();
      const gfwlInstalled = await isGFWLInstalled();
      // Use findGameInstallation() to be consistent with play button and other checks
      // This respects custom paths and autoScanEnabled setting
      const foundLocation = await findGameInstallation();
      const gameFilesAlreadyPresent = foundLocation !== null;

      safeLog.info(
        `[Component Check] DirectX 9+: ${
          dx9Installed
            ? "✅ INSTALLED (will skip)"
            : "⬇️  MISSING (will download)"
        }`
      );
      safeLog.info(
        `[Component Check] GFWL: ${
          gfwlInstalled
            ? "✅ INSTALLED (will skip)"
            : "⬇️  MISSING (will download)"
        }`
      );
      safeLog.info(
        `[Component Check] Game Files: ${
          gameFilesAlreadyPresent
            ? "✅ PRESENT (will skip)"
            : "⬇️  MISSING (will download)"
        }`
      );
      safeLog.info("========================================\n");

      // Update UI immediately for GFWL and DirectX status
      if (gfwlInstalled) {
        mainWindow.webContents.send("gfwl-progress", 100);
        mainWindow.webContents.send(
          "download-message",
          "✅ GFWL already installed - skipping"
        );
      } else {
        mainWindow.webContents.send("gfwl-progress", 0);
      }

      if (dx9Installed) {
        mainWindow.webContents.send("dx-progress", 100);
        mainWindow.webContents.send(
          "download-message",
          "✅ DirectX 9 already installed - skipping"
        );
      } else {
        mainWindow.webContents.send("dx-progress", 0);
      }

      if (gameFilesAlreadyPresent) {
        mainWindow.webContents.send("game-progress", 100);
        mainWindow.webContents.send(
          "download-message",
          "✅ Game files already present - skipping"
        );
      }

      // STEP 2: Download and install GFWL FIRST (if needed) - BEFORE Shadowrun download
      if (!gfwlInstalled) {
        // Download GFWL
        const gfwlPath = path.join(GAME_FILES_TEMP, "gfwlivesetup.zip");
        mainWindow.webContents.send(
          "download-message",
          "📥 Downloading Games for Windows Live (required for online play)..."
        );

        const gfwlResult = await downloadFile(
          GFWL_URL,
          gfwlPath,
          (progress, statusMessage) => {
            mainWindow.webContents.send("gfwl-progress", progress);
            if (statusMessage) {
              mainWindow.webContents.send("download-message", statusMessage);
            }
          },
          { isCancelled: () => cancelDownloadRequested }
        );

        if (cancelDownloadRequested) {
          downloadInProgress = false;
          mainWindow.webContents.send("download-message", "Download cancelled");
          return { success: false, cancelled: true };
        }

        if (!gfwlResult.success) {
          downloadInProgress = false;
          const errorMsg = gfwlResult.error
            ? gfwlResult.error.message
            : "Unknown error";
          mainWindow.webContents.send(
            "download-message",
            `❌ Failed to download Games for Windows Live: ${errorMsg}`
          );
          mainWindow.webContents.send(
            "download-error",
            `Failed to download Games for Windows Live: ${errorMsg}. Check your internet connection.`
          );
          return { success: false, error: "Failed to download GFWL" };
        }

        // Extract GFWL
        mainWindow.webContents.send(
          "download-message",
          "⚙️ Installing Games for Windows Live... You may see a Windows installer window."
        );
        const gfwlExtractSuccess = await extractZip(gfwlPath, GAME_FILES_TEMP);
        if (!gfwlExtractSuccess) {
          downloadInProgress = false;
          mainWindow.webContents.send(
            "download-message",
            "❌ Failed to extract Games for Windows Live installer. Please try again."
          );
          mainWindow.webContents.send(
            "download-error",
            "Failed to extract Games for Windows Live."
          );
          return { success: false, error: "Failed to extract GFWL" };
        }

        // Run GFWL installer SILENTLY
        safeLog.info("\n========================================");
        safeLog.info("🎮 INSTALLING GFWL");
        safeLog.info("========================================");

        const gfwlInstallerPath = path.join(GAME_FILES_TEMP, "gfwlivesetup.exe");
        safeLog.info(
          `[GFWL Install] Checking for installer at: ${gfwlInstallerPath}`
        );
        safeLog.info(
          `[GFWL Install] File exists: ${fs.existsSync(gfwlInstallerPath)}`
        );

        if (fs.existsSync(gfwlInstallerPath)) {
          mainWindow.webContents.send(
            "download-message",
            "⚙️ Installing GFWL..."
          );

          safeLog.info("[GFWL Install] Running installation...");

          // Start animated progress indicator for GFWL installation
          let installStartTime = Date.now();
          let progressInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - installStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeStr =
              minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            mainWindow.webContents.send(
              "gfwl-install-progress",
              `⚙️ Installing GFWL... (${timeStr})`
            );
          }, 1000);

          try {
            await runSilentInstaller(gfwlInstallerPath);
            clearInterval(progressInterval);
            safeLog.info("[GFWL Install] ✅ Installation completed");
            mainWindow.webContents.send(
              "download-message",
              "✅ GFWL installation completed"
            );
            mainWindow.webContents.send("gfwl-progress", 100);
          } catch (error) {
            clearInterval(progressInterval);
            safeLog.error(
              `[GFWL Install] ❌ Installation error: ${error.message}`
            );
            safeLog.error(`[GFWL Install] Stack: ${error.stack}`);
            // Continue anyway - GFWL install errors are non-fatal
            mainWindow.webContents.send("gfwl-progress", 100);
          }
        } else {
          safeLog.warn("[GFWL Install] ⚠️  Installer not found, skipping");
        }
        safeLog.info("========================================\n");
      }

      // STEP 3: Download and install DirectX 9 FIRST (if needed) - BEFORE Shadowrun download
      if (!dx9Installed) {
        // Download DirectX 9 Web Installer (dxwebsetup.exe)
        const dx9Path = path.join(GAME_FILES_TEMP, "dxwebsetup.exe");
        mainWindow.webContents.send(
          "download-message",
          "📥 Downloading DirectX 9 Web Installer (required graphics library)..."
        );

        const dx9Result = await downloadFile(
          DX9_URL,
          dx9Path,
          (progress, statusMessage) => {
            mainWindow.webContents.send("dx-progress", progress);
            if (statusMessage) {
              mainWindow.webContents.send("download-message", statusMessage);
            }
          },
          { isCancelled: () => cancelDownloadRequested }
        );

        if (cancelDownloadRequested) {
          downloadInProgress = false;
          mainWindow.webContents.send("download-message", "Download cancelled");
          return { success: false, cancelled: true };
        }

        if (!dx9Result.success) {
          downloadInProgress = false;
          let errorMessage = "❌ Failed to download DirectX 9";
          let detailedError = "Failed to download DirectX 9";

          // Provide specific error guidance based on error code
          if (dx9Result.error) {
            const errorCode = dx9Result.error.code || "";
            const errorMsg = dx9Result.error.message || "";

            safeLog.error(
              `[DirectX Download] Error code: ${errorCode}, Message: ${errorMsg}`
            );

            if (
              errorCode === "ETIMEDOUT" ||
              errorCode === "ESOCKETTIMEDOUT" ||
              errorMsg.includes("timeout")
            ) {
              errorMessage =
                "❌ DirectX 9 download timed out. Microsoft's servers may be slow or unreachable.";
              detailedError =
                "DirectX 9 download timed out. Try again or check if you can access Microsoft servers (download.microsoft.com). You may need to check your network settings or disable any firewall/proxy blocking the connection.";
            } else if (
              errorCode === "ENOTFOUND" ||
              errorCode === "EAI_AGAIN" ||
              errorMsg.includes("getaddrinfo")
            ) {
              errorMessage =
                "❌ Cannot reach Microsoft servers. DNS resolution failed.";
              detailedError =
                "DNS error - cannot resolve Microsoft download servers. Check your DNS settings or network configuration. Try setting DNS to 8.8.8.8 (Google DNS) or 1.1.1.1 (Cloudflare DNS) in your network adapter settings.";
            } else if (
              errorCode === "ECONNREFUSED" ||
              errorCode === "ECONNRESET" ||
              errorMsg.includes("ECONNREFUSED")
            ) {
              errorMessage =
                "❌ Connection refused by Microsoft servers. Firewall may be blocking the download.";
              detailedError =
                "Connection refused. Your firewall, antivirus, or network security software may be blocking HTTPS connections to Microsoft. Check Windows Firewall settings and any third-party security software.";
            } else {
              errorMessage = `❌ Failed to download DirectX 9: ${errorMsg}`;
              detailedError = `DirectX 9 download failed: ${errorMsg}. Check your internet connection and firewall settings.`;
            }
          } else {
            errorMessage =
              "❌ Failed to download DirectX 9. Please check your internet connection.";
            detailedError =
              "Failed to download DirectX 9. Check your internet connection, firewall, and VM network settings.";
          }

          mainWindow.webContents.send("download-message", errorMessage);
          mainWindow.webContents.send("download-error", detailedError);
          return { success: false, error: detailedError };
        }

        // Install DirectX 9 SILENTLY
        safeLog.info("\n========================================");
        safeLog.info("🎮 INSTALLING DIRECTX 9 SILENTLY");
        safeLog.info("========================================");
        safeLog.info(`[DX9 Install] Installer path: ${dx9Path}`);

        mainWindow.webContents.send(
          "download-message",
          "⚙️ Installing DirectX 9 in background..."
        );

        // Start animated progress indicator for DirectX 9 installation
        let installStartTime = Date.now();
        let progressInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - installStartTime) / 1000);
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
          mainWindow.webContents.send(
            "dx-install-progress",
            `⚙️ Installing DirectX 9... (${timeStr})`
          );
        }, 1000);

        try {
          await runSilentInstaller(dx9Path);
          clearInterval(progressInterval);
          safeLog.info("[DX9 Install] ✅ Installation completed");
          mainWindow.webContents.send(
            "download-message",
            "✅ DirectX 9 installation completed"
          );
        } catch (error) {
          clearInterval(progressInterval);
          safeLog.error(`[DX9 Install] ❌ Installation error: ${error.message}`);
          // Continue anyway - DX9 install errors are non-fatal
        }
        safeLog.info("========================================\n");
        mainWindow.webContents.send("dx-progress", 100);
      }

      // STEP 4: Determine installation directory (request admin if needed)
      const isAdmin = await isRunningAsAdmin();
      const programFilesPath = path.join(
        "C:\\Program Files (x86)\\Microsoft Games for Windows - LIVE\\Shadowrun"
      );

      // Helper function to create directory with admin privileges and set write permissions
      async function createDirectoryWithAdmin(dirPath) {
        return new Promise((resolve) => {
          const psScriptPath = path.join(
            os.tmpdir(),
            `create_dir_${Date.now()}.ps1`
          );

          // Get current username for permission setting
          const currentUser = process.env.USERNAME || process.env.USER || "Users";
          const userDomain = process.env.USERDOMAIN || "";

          // Create PowerShell script to create directory AND set permissions
          const psScript = `$dir = "${dirPath.replace(/\\/g, "\\\\")}"
$userName = "${currentUser}"
$domain = "${userDomain}"

# Create directory if it doesn't exist
if (-not (Test-Path $dir)) {
    try {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Write-Host "Directory created: $dir"
    } catch {
        Write-Host "Failed to create directory: $_"
        exit 1
    }
} else {
    Write-Host "Directory already exists: $dir"
}

# Set permissions so current user can write to it
try {
    $acl = Get-Acl $dir
    # Grant full control to current user
    $userIdentity = if ($domain) { "$domain\\$userName" } else { $userName }
    $permission = $userIdentity,"FullControl","ContainerInherit,ObjectInherit","None","Allow"
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
    $acl.SetAccessRule($accessRule)
    Set-Acl $dir $acl
    Write-Host "Permissions set for: $userIdentity"
    exit 0
} catch {
    Write-Host "Failed to set permissions: $_"
    # Directory was created, but permissions failed - still return success
    # The verification step will catch if it's not writable
    exit 0
}`;

          try {
            fs.writeFileSync(psScriptPath, psScript, "utf8");

            // Run PowerShell script with admin privileges
            const psCommand = `Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '${psScriptPath.replace(
              /\\/g,
              "\\\\"
            )}' -Verb RunAs -Wait -WindowStyle Hidden`;

            exec(
              `powershell -Command "${psCommand}"`,
              { timeout: 30000 },
              (error, stdout, stderr) => {
                // Clean up script file
                try {
                  if (fs.existsSync(psScriptPath)) {
                    fs.unlinkSync(psScriptPath);
                  }
                } catch (e) {
                  // Ignore cleanup errors
                }

                // Check if directory was actually created and is writable (with a delay for filesystem sync)
                setTimeout(() => {
                  if (fs.existsSync(dirPath)) {
                    // Verify we can actually write to it
                    const canWrite = isDirectoryWritable(dirPath);
                    if (canWrite) {
                      safeLog.info(
                        `[Download] Successfully created directory with admin and set permissions: ${dirPath}`
                      );
                      resolve(true);
                    } else {
                      safeLog.info(
                        `[Download] Directory created but still not writable - permissions may need adjustment: ${dirPath}`
                      );
                      if (stdout) {
                        safeLog.info(`[Download] PowerShell output: ${stdout}`);
                      }
                      if (stderr) {
                        safeLog.info(`[Download] PowerShell errors: ${stderr}`);
                      }
                      resolve(false);
                    }
                  } else {
                    safeLog.info(
                      `[Download] Directory creation failed or was cancelled: ${dirPath}`
                    );
                    if (error) {
                      safeLog.info(`[Download] Error: ${error.message}`);
                    }
                    resolve(false);
                  }
                }, 1000); // Increased delay to allow permissions to propagate
              }
            );
          } catch (fileError) {
            safeLog.error(
              `Error creating PowerShell script: ${fileError.message}`
            );
            resolve(false);
          }
        });
      }

      // Check if user wants Program Files location
      let useProgramFiles = false;

      if (!isAdmin) {
        // Check if Program Files path already exists and is accessible
        const programFilesExists = fs.existsSync(programFilesPath);
        const canWriteProgramFiles = programFilesExists
          ? isDirectoryWritable(programFilesPath)
          : false;

        if (!canWriteProgramFiles) {
          // Automatically attempt Program Files with admin privileges (UAC will prompt)
          // If denied/cancelled, automatically fall back to user folder
          mainWindow.webContents.send(
            "download-message",
            "🔐 Requesting administrator privileges for Program Files installation... (UAC prompt will appear)"
          );

          const dirCreated = await createDirectoryWithAdmin(programFilesPath);

          if (dirCreated) {
            mainWindow.webContents.send(
              "download-message",
              "✓ Installation directory created and configured successfully"
            );
            // Verify we can write to it
            const canWrite = isDirectoryWritable(programFilesPath);
            if (canWrite) {
              setGameInstallDir(programFilesPath);
              setResourcesDir(path.join(programFilesPath, "Resources"));
              safeLog.info(
                `[Download] Using Program Files location: ${programFilesPath}`
              );
              useProgramFiles = true;
            } else {
              // Directory created but not writable, use fallback
              safeLog.info(
                `[Download] Program Files directory created but not writable, using fallback`
              );
              mainWindow.webContents.send(
                "download-message",
                "⚠️ Could not set write permissions. Using user folder instead..."
              );
              const fallbackCreated = await createDirectoryWithPermissions(
                getGameInstallDir()
              );
              if (!fallbackCreated) {
                downloadInProgress = false;
                return {
                  success: false,
                  requiresAdmin: false,
                  error: "Failed to create installation directory.",
                };
              }
            }
          } else {
            // Failed to create with admin, automatically use fallback
            safeLog.info(
              `[Download] Failed to create Program Files directory, using fallback`
            );
            mainWindow.webContents.send(
              "download-message",
              "⚠️ Administrator privileges were denied or cancelled. Using user folder instead..."
            );
            const fallbackCreated = await createDirectoryWithPermissions(
              getGameInstallDir()
            );
            if (!fallbackCreated) {
              downloadInProgress = false;
              return {
                success: false,
                requiresAdmin: false,
                error: "Failed to create installation directory.",
              };
            }
          }
        } else {
          // Can write to Program Files (maybe it was created previously)
          setGameInstallDir(programFilesPath);
          setResourcesDir(path.join(programFilesPath, "Resources"));
          safeLog.info(
            `[Download] Using Program Files location (already accessible): ${programFilesPath}`
          );
          useProgramFiles = true;
        }
      } else {
        // Already running as admin, try Program Files first
        const canWriteProgramFiles = isDirectoryWritable(programFilesPath);
        if (canWriteProgramFiles) {
          setGameInstallDir(programFilesPath);
          setResourcesDir(path.join(programFilesPath, "Resources"));
          safeLog.info(
            `[Download] Using Program Files location (admin): ${programFilesPath}`
          );
          useProgramFiles = true;
        } else {
          // Admin but can't write to Program Files, use fallback
          safeLog.info(
            `[Download] Program Files not writable, using fallback location`
          );
          const dirCreated = await createDirectoryWithPermissions(
            getGameInstallDir()
          );
          if (!dirCreated) {
            downloadInProgress = false;
            return {
              success: false,
              requiresAdmin: false,
              error: "Failed to create installation directory.",
            };
          }
        }
      }

      // If we're using Program Files but directory doesn't exist yet, create it
      if (useProgramFiles && !fs.existsSync(getGameInstallDir())) {
        try {
          fs.mkdirSync(getGameInstallDir(), { recursive: true });
        } catch (error) {
          // If creation fails, fall back to user location
          safeLog.info(
            `[Download] Failed to create Program Files directory, using fallback`
          );
          const dirCreated = await createDirectoryWithPermissions(
            getGameInstallDir()
          );
          if (!dirCreated) {
            downloadInProgress = false;
            return {
              success: false,
              requiresAdmin: false,
              error: "Failed to create installation directory.",
            };
          }
        }
      }

      // STEP 5: Check for Shadowrun game files
      // Use findGameInstallation() to be consistent with other checks
      const foundGameLocation = await findGameInstallation();
      const gameFilesExist = foundGameLocation !== null;

      // Update GAME_INSTALL_DIR if we found a location
      if (foundGameLocation) {
        setGameInstallDir(foundGameLocation);
        setResourcesDir(path.join(foundGameLocation, "Resources"));
      }

      // Download game files if needed
      if (gameFilesExist) {
        mainWindow.webContents.send("game-files-progress", 100);
        mainWindow.webContents.send(
          "download-message",
          "✓ Shadowrun game files are already installed"
        );
      } else {
        // Download game files
        const gameFilesPath = path.join(GAME_FILES_TEMP, "build.zip");
        mainWindow.webContents.send(
          "download-message",
          "📥 Downloading Shadowrun game files... This is the largest download and may take several minutes."
        );

        const gameFilesResult = await downloadFile(
          GAME_FILES_URL,
          gameFilesPath,
          (progress, statusMessage) => {
            mainWindow.webContents.send("game-files-progress", progress);
            if (statusMessage) {
              mainWindow.webContents.send("download-message", statusMessage);
            }
          },
          { isCancelled: () => cancelDownloadRequested }
        );

        if (cancelDownloadRequested) {
          downloadInProgress = false;
          mainWindow.webContents.send("download-message", "Download cancelled");
          return { success: false, cancelled: true };
        }

        if (!gameFilesResult.success) {
          downloadInProgress = false;
          const errorMsg = gameFilesResult.error
            ? gameFilesResult.error.message
            : "Unknown error";
          mainWindow.webContents.send(
            "download-message",
            `❌ Failed to download game files: ${errorMsg}`
          );
          mainWindow.webContents.send(
            "download-error",
            `Failed to download game files: ${errorMsg}. Check your internet connection.`
          );
          return { success: false, error: "Failed to download game files" };
        }

        // Download completed successfully
        safeLog.info(
          "[Download] Shadowrun game files download completed successfully"
        );
        mainWindow.webContents.send("game-files-progress", 100);
        mainWindow.webContents.send(
          "download-message",
          "✓ Download complete. Extracting game files..."
        );

        // Extract game files
        mainWindow.webContents.send(
          "download-message",
          "📦 Extracting and installing Shadowrun game files... Please wait."
        );
        // Update status to show extraction is in progress
        mainWindow.webContents.send("game-files-extracting");

        safeLog.info("[Download] Starting extraction of game files...");
        safeLog.info(`[Download] Source: ${gameFilesPath}`);
        safeLog.info(`[Download] Destination: ${getGameInstallDir()}`);

        let extractSuccess = false;
        try {
          extractSuccess = await extractZip(gameFilesPath, getGameInstallDir());
          safeLog.info(
            `[Download] Extraction completed, result: ${extractSuccess}`
          );

          // Check if extraction created a nested "build" folder
          const nestedBuildPath = path.join(getGameInstallDir(), "build");
          if (fs.existsSync(nestedBuildPath)) {
            safeLog.info(
              "[Download] Detected nested 'build' folder, moving contents up one level..."
            );

            // Move all files from nested build folder to root
            const files = fs.readdirSync(nestedBuildPath);
            for (const file of files) {
              const srcPath = path.join(nestedBuildPath, file);
              const destPath = path.join(getGameInstallDir(), file);

              // Skip if file already exists at destination
              if (!fs.existsSync(destPath)) {
                safeLog.info(`[Download] Moving: ${file}`);
                fs.renameSync(srcPath, destPath);
              } else {
                safeLog.info(`[Download] Skipping existing file: ${file}`);
              }
            }

            // Remove the now-empty nested build folder
            try {
              fs.rmdirSync(nestedBuildPath);
              safeLog.info("[Download] Removed nested build folder");
            } catch (rmdirError) {
              safeLog.warn(
                "[Download] Could not remove nested build folder (may not be empty):",
                rmdirError.message
              );
            }
          }
        } catch (extractError) {
          safeLog.error("[Download] Extraction threw an error:", extractError);
          extractSuccess = false;
        }

        if (!extractSuccess) {
          downloadInProgress = false;
          mainWindow.webContents.send(
            "download-message",
            "❌ Failed to extract game files. Please try running the launcher as Administrator."
          );
          mainWindow.webContents.send(
            "download-error",
            "Failed to extract game files. Try running as Administrator."
          );
          return { success: false, error: "Failed to extract game files" };
        }

        safeLog.info("[Download] Game files extraction completed successfully");

        // Verify that game files were actually extracted
        const gameExePath = path.join(getGameInstallDir(), "Shadowrun.exe");
        safeLog.info(
          `[Download] Verifying game executable exists at: ${gameExePath}`
        );
        if (!fs.existsSync(gameExePath)) {
          safeLog.error(
            "[Download] ERROR: Shadowrun.exe not found after extraction!"
          );
          safeLog.error(
            `[Download] Checking if directory exists: ${getGameInstallDir()}`
          );
          safeLog.error(
            `[Download] Directory exists: ${fs.existsSync(getGameInstallDir())}`
          );
          if (fs.existsSync(getGameInstallDir())) {
            const files = fs.readdirSync(getGameInstallDir());
            safeLog.error(`[Download] Files in directory: ${files.join(", ")}`);
          }
          downloadInProgress = false;
          mainWindow.webContents.send(
            "download-message",
            "❌ Game files extraction completed but Shadowrun.exe not found. Please check the installation directory."
          );
          mainWindow.webContents.send(
            "download-error",
            "Game executable not found after extraction."
          );
          return {
            success: false,
            error: "Game executable not found after extraction",
          };
        }
        safeLog.info("[Download] ✓ Game executable verified successfully");

        // Create dxvk.conf with default values if it doesn't exist
        const dxvkConfPath = path.join(getGameInstallDir(), "dxvk.conf");
        safeLog.info(`[Download] Checking for dxvk.conf at: ${dxvkConfPath}`);
        if (!fs.existsSync(dxvkConfPath)) {
          try {
            const defaultConfig = `dxgi.maxFrameRate = 85
d3d9.maxFrameRate = 85
`;
            fs.writeFileSync(dxvkConfPath, defaultConfig);
            safeLog.info(
              "[Download] Created default dxvk.conf file with 85 FPS limit"
            );
          } catch (error) {
            safeLog.warn("[Download] Failed to create dxvk.conf file:", error);
            // Non-critical, continue with installation
          }
        } else {
          safeLog.info("[Download] dxvk.conf already exists, skipping creation");
        }

        // Ensure game files progress shows 100% after extraction
        mainWindow.webContents.send("game-files-progress", 100);
        safeLog.info("[Download] Sent game-files-progress: 100");
      }

      // GFWL and DirectX are already installed/downloaded above (before Shadowrun)
      // No need to check again here

      // Complete installation
      safeLog.info(
        "[Download] ===== Installation process completed successfully ====="
      );
      mainWindow.webContents.send(
        "download-message",
        "✅ Installation complete! Shadowrun is ready to play."
      );
      safeLog.info("[Download] Sent completion message to UI");

      // Ensure all progress bars show complete
      mainWindow.webContents.send("game-files-progress", 100);
      mainWindow.webContents.send("gfwl-progress", 100);
      mainWindow.webContents.send("dx-progress", 100);
      safeLog.info("[Download] Sent all progress bars to 100%");

      // Notify renderer that download is complete and game is installed
      safeLog.info("[Download] Sending completion events...");
      mainWindow.webContents.send("download-complete");
      mainWindow.webContents.send("game-installation-status", {
        installed: true,
      });

      // Clean up downloads
      downloadInProgress = false;

      // Update player tracking status back to menu
      playerTracker.setStatus("menu");

      // Auto-launch is DISABLED - game will NOT launch automatically after download
      // To enable auto-launch, set AUTO_LAUNCH_AFTER_DOWNLOAD = true in
      // app/main/config/constants.js
      if (AUTO_LAUNCH_AFTER_DOWNLOAD) {
        safeLog.info("[Download] Auto-launch enabled, launching game...");
        setTimeout(async () => {
          // Give UI a moment to update before launching
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("auto-launching-game");
          }
          // Launch the game (use the same settings that would be used from the Play button)
          const defaultSettings = await loadSettingsFromDisk();
          await launchGameLogic(defaultSettings, "auto-launch");
        }, 2000);
      }
      // No else block - silently skip auto-launch when disabled

      return { success: true };
    } catch (error) {
      safeLog.error("Download error:", error);
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("download-error", error.message);
      }
      downloadInProgress = false;
      return { success: false, error: error.message };
    } finally {
      // Always make sure downloadInProgress is reset even if there's an uncaught exception
      downloadInProgress = false;
    }
  });

  // Check DirectX installation
  ipcMain.handle("check-directx", async () => {
    try {
      const installed = await isDX9Installed();
      return { success: true, installed };
    } catch (error) {
      safeLog.error("[IPC] Error checking DirectX:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  // Re-exports for callers that still need direct access to the helpers
  // (diagnostics composer DI, persistent-issues panel, etc.)
  downloadFile,
  extractZip,
  extractZipFallback,
  isDX9Installed,
  isGFWLInstalled,
  runSilentInstaller,
  // IPC registrar - call once at app startup with the deps bag.
  registerDownloadsIpc,
};
