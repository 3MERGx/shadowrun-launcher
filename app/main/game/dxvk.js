// DXVK toggle + dxvk.conf FPS controls (Phase 7b).
//
// Two probe functions plus five IPC handlers, all of which manipulate files
// inside the game install directory:
//
//   d3d9.dll      - DXVK wrapper. Present = enabled.
//   d3d9.backup   - Renamed copy of d3d9.dll when the user disables DXVK.
//                   Lets us re-enable without re-downloading.
//   dxvk.conf     - Plain-text DXVK config. We only ever touch the
//                   dxgi.maxFrameRate and d3d9.maxFrameRate lines so users
//                   can keep their own DXVK tweaks alongside ours.
//
// Probes (read-only, exported as bound functions for callers like
// load-settings + launchGameLogic that need the value but don't want IPC):
//   readCurrentFpsFromDxvkConf() -> int | null
//   checkDxvkStatus()            -> { enabled, fileExists }
//
// IPC handlers (registered together via registerDxvkIpc):
//   open-dxvk-conf                  - opens dxvk.conf in the user's editor
//   get-current-fps-from-dxvk-conf  - returns int | null
//   set-max-frame-rate              - writes only the two FPS lines
//   toggle-dxvk                     - enable/disable d3d9.dll wrapper
//   check-dxvk-status               - returns { enabled, fileExists }
//
// All IPC handlers preserve the original progress events ("dxvk-progress")
// and error-message strings verbatim - the renderer matches on these.

const { safeLog } = require("../logger");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { shell } = require("electron");

const { DXVK_ZIP_URL } = require("../config/constants");

const DXVK_TEMP_PATH = path.join(os.tmpdir(), "d3d9.zip");

// ============================================================================
// Probes (factory-bound so tests can inject their own GAME_INSTALL_DIR)
// ============================================================================

function makeReadCurrentFpsFromDxvkConf({ getGameInstallDir }) {
  return function readCurrentFpsFromDxvkConf() {
    try {
      const dxvkConfPath = path.join(getGameInstallDir(), "dxvk.conf");

      if (!fs.existsSync(dxvkConfPath)) {
        return null; // File doesn't exist yet
      }

      const content = fs.readFileSync(dxvkConfPath, "utf8");

      // Try to find both dxgi.maxFrameRate and d3d9.maxFrameRate settings
      const dxgiMatch = content.match(/dxgi\.maxFrameRate\s*=\s*(\d+)/);
      const d3d9Match = content.match(/d3d9\.maxFrameRate\s*=\s*(\d+)/);

      const dxgiFps = dxgiMatch && dxgiMatch[1] ? parseInt(dxgiMatch[1]) : null;
      const d3d9Fps = d3d9Match && d3d9Match[1] ? parseInt(d3d9Match[1]) : null;

      // If both values exist, check if they match
      if (dxgiFps !== null && d3d9Fps !== null) {
        if (dxgiFps !== d3d9Fps) {
          safeLog.warn(
            `FPS values in dxvk.conf don't match: dxgi.maxFrameRate = ${dxgiFps}, d3d9.maxFrameRate = ${d3d9Fps}. Using dxgi value.`
          );
        }
        // Prefer dxgi value if both exist
        return dxgiFps;
      }

      // Return whichever value exists
      if (dxgiFps !== null) {
        return dxgiFps;
      }

      if (d3d9Fps !== null) {
        return d3d9Fps;
      }

      return null; // No FPS setting found
    } catch (error) {
      safeLog.error("Error reading FPS from dxvk.conf:", error);
      return null;
    }
  };
}

function makeCheckDxvkStatus({ getGameInstallDir }) {
  // Check DXVK status (d3d9.dll exists or d3d9.backup exists)
  return async function checkDxvkStatus() {
    try {
      const gameInstallDir = getGameInstallDir();
      if (!fs.existsSync(gameInstallDir)) {
        return { enabled: false, fileExists: false };
      }

      const d3d9Path = path.join(gameInstallDir, "d3d9.dll");
      const backupPath = path.join(gameInstallDir, "d3d9.backup");

      const d3d9Exists = fs.existsSync(d3d9Path);
      const backupExists = fs.existsSync(backupPath);

      // DXVK is enabled if d3d9.dll exists
      return {
        enabled: d3d9Exists,
        fileExists: d3d9Exists || backupExists,
      };
    } catch (error) {
      safeLog.error("Error checking DXVK status:", error);
      return { enabled: false, fileExists: false };
    }
  };
}

// ============================================================================
// IPC registrar
// ============================================================================

function registerDxvkIpc(deps) {
  const {
    ipcMain,
    getMainWindow,
    getGameInstallDir,
    getGameProcess,
    getSettings,
    saveSettingsToDisk,
    downloadFile,
    extractZip,
    readCurrentFpsFromDxvkConf,
    checkDxvkStatus,
  } = deps;

  // Update the DXVK.conf handler to use the game installation path
  ipcMain.handle("open-dxvk-conf", async () => {
    // Path to dxvk.conf file in the game installation directory
    const dxvkConfPath = path.join(getGameInstallDir(), "dxvk.conf");

    // Create file if it doesn't exist
    if (!fs.existsSync(dxvkConfPath)) {
      fs.writeFileSync(dxvkConfPath, "# DXVK Configuration File\n");
    }

    // Open the file with default editor
    shell.openPath(dxvkConfPath);
    return { success: true };
  });

  // Handle getting current FPS from dxvk.conf
  ipcMain.handle("get-current-fps-from-dxvk-conf", async () => {
    try {
      const fps = readCurrentFpsFromDxvkConf();
      return fps;
    } catch (error) {
      safeLog.error("Error getting FPS from dxvk.conf:", error);
      return null;
    }
  });

  // Handle setting max frame rate
  ipcMain.handle("set-max-frame-rate", async (event, fps) => {
    try {
      safeLog.info("Setting max frame rate to:", fps);

      // Check if game is running
      const gameProcess = getGameProcess();
      const isGameRunning = gameProcess && !gameProcess.killed;

      // Update settings
      const settings = getSettings();
      settings.maxFrameRate = parseInt(fps);
      saveSettingsToDisk();

      // Path to dxvk.conf file
      const dxvkConfPath = path.join(getGameInstallDir(), "dxvk.conf");

      safeLog.info("DXVK config path:", dxvkConfPath);

      // Create file with default settings if it doesn't exist
      if (!fs.existsSync(dxvkConfPath)) {
        safeLog.info("Creating new dxvk.conf file");
        const defaultConfig = `dxgi.maxFrameRate = ${fps}
d3d9.maxFrameRate = ${fps}
`;
        fs.writeFileSync(dxvkConfPath, defaultConfig);
        return {
          success: true,
          requiresRestart: isGameRunning,
        };
      }

      // Read existing file
      safeLog.info("Reading existing dxvk.conf file");
      let configContent = fs.readFileSync(dxvkConfPath, "utf8");

      // Validate: Only edit the two specific FPS lines
      // Regex patterns to find the exact lines we're allowed to modify
      const dxgiPattern = /dxgi\.maxFrameRate\s*=\s*\d+/;
      const d3d9Pattern = /d3d9\.maxFrameRate\s*=\s*\d+/;

      // Check if lines exist
      const hasDxgi = dxgiPattern.test(configContent);
      const hasD3d9 = d3d9Pattern.test(configContent);

      // Update existing lines (only these two specific lines)
      if (hasDxgi) {
        safeLog.info("Updating existing dxgi.maxFrameRate setting");
        configContent = configContent.replace(
          dxgiPattern,
          `dxgi.maxFrameRate = ${fps}`
        );
      }

      if (hasD3d9) {
        safeLog.info("Updating existing d3d9.maxFrameRate setting");
        configContent = configContent.replace(
          d3d9Pattern,
          `d3d9.maxFrameRate = ${fps}`
        );
      }

      // Add missing lines at the top of the file
      const fpsLines = `dxgi.maxFrameRate = ${fps}\nd3d9.maxFrameRate = ${fps}`;

      if (!hasDxgi || !hasD3d9) {
        safeLog.info("Adding missing FPS settings at the top of file");
        const trimmedContent = configContent.trim();

        if (trimmedContent === "") {
          // File is empty, just write the FPS lines
          configContent = fpsLines + "\n";
        } else {
          // Add FPS lines at the top, with a blank line separator
          configContent = fpsLines + "\n\n" + trimmedContent;
        }
      }

      safeLog.info("New config content:", configContent);

      // Write updated config back to file
      fs.writeFileSync(dxvkConfPath, configContent);
      safeLog.info(
        "Config file updated successfully - only modified dxgi.maxFrameRate and d3d9.maxFrameRate lines"
      );

      return {
        success: true,
        requiresRestart: isGameRunning,
      };
    } catch (error) {
      safeLog.error("Error setting max frame rate:", error);
      return { success: false, error: error.message };
    }
  });

  // Handle DXVK toggle
  ipcMain.handle("toggle-dxvk", async (event, enabled) => {
    try {
      const gameInstallDir = getGameInstallDir();
      // Check if game is installed
      if (!fs.existsSync(gameInstallDir)) {
        return { success: false, message: "Game not installed" };
      }

      const d3d9Path = path.join(gameInstallDir, "d3d9.dll");
      const backupPath = path.join(gameInstallDir, "d3d9.backup");

      const mainWindow = getMainWindow();

      if (enabled) {
        // ---- ENABLE DXVK ----
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("dxvk-progress", {
            step: "init",
            status: "Enabling DXVK...",
            progress: 10,
          });
        }

        // Check if d3d9.backup exists - rename it to d3d9.dll
        if (fs.existsSync(backupPath)) {
          try {
            fs.renameSync(backupPath, d3d9Path);

            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("dxvk-progress", {
                step: "complete",
                status: "DXVK enabled successfully",
                progress: 100,
              });
            }

            return { success: true, message: "DXVK enabled" };
          } catch (error) {
            safeLog.error("Error renaming d3d9.backup:", error);
            return {
              success: false,
              message: "Unable to enable DXVK. Please check file permissions.",
            };
          }
        }

        // Neither file exists - download from server
        if (!fs.existsSync(d3d9Path)) {
          try {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("dxvk-progress", {
                step: "download",
                status: "Downloading DXVK files...",
                progress: 20,
              });
            }

            // Download d3d9.zip
            const downloaded = await downloadFile(
              DXVK_ZIP_URL,
              DXVK_TEMP_PATH,
              (progress) => {
                const w = getMainWindow();
                if (w && !w.isDestroyed()) {
                  w.webContents.send("dxvk-progress", {
                    step: "download",
                    status: `Downloading DXVK files (${progress}%)...`,
                    progress: 20 + Math.floor(progress / 2), // Scale to 20-70%
                  });
                }
              }
            );

            if (!downloaded) {
              return {
                success: false,
                message:
                  "Unable to download DXVK file. Please check your internet connection.",
              };
            }

            // Extract the zip file
            const w2 = getMainWindow();
            if (w2 && !w2.isDestroyed()) {
              w2.webContents.send("dxvk-progress", {
                step: "extract",
                status: "Extracting DXVK files...",
                progress: 70,
              });
            }

            // Create temp extraction directory
            const tempExtractDir = path.join(os.tmpdir(), "d3d9_extract");
            if (!fs.existsSync(tempExtractDir)) {
              fs.mkdirSync(tempExtractDir, { recursive: true });
            }

            try {
              await extractZip(DXVK_TEMP_PATH, tempExtractDir);

              // Find d3d9.dll in extracted files
              const extractedD3d9 = path.join(tempExtractDir, "d3d9.dll");

              if (!fs.existsSync(extractedD3d9)) {
                throw new Error("d3d9.dll not found in downloaded archive");
              }

              // Copy to game directory
              fs.copyFileSync(extractedD3d9, d3d9Path);

              // Cleanup temp files
              fs.rmSync(tempExtractDir, { recursive: true, force: true });
              if (fs.existsSync(DXVK_TEMP_PATH)) {
                fs.unlinkSync(DXVK_TEMP_PATH);
              }

              const w3 = getMainWindow();
              if (w3 && !w3.isDestroyed()) {
                w3.webContents.send("dxvk-progress", {
                  step: "complete",
                  status: "DXVK enabled successfully",
                  progress: 100,
                });
              }

              return { success: true, message: "DXVK enabled" };
            } catch (extractError) {
              safeLog.error("Error extracting DXVK files:", extractError);

              // Cleanup on error
              if (fs.existsSync(tempExtractDir)) {
                fs.rmSync(tempExtractDir, { recursive: true, force: true });
              }
              if (fs.existsSync(DXVK_TEMP_PATH)) {
                fs.unlinkSync(DXVK_TEMP_PATH);
              }

              return {
                success: false,
                message: "Downloaded file appears corrupted. Please try again.",
              };
            }
          } catch (error) {
            safeLog.error("Error downloading DXVK:", error);

            // Determine error type
            if (error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
              return {
                success: false,
                message:
                  "Unable to reach download server. Please check your internet connection.",
              };
            }

            return {
              success: false,
              message:
                "Failed to enable DXVK support. Please try again or manually place d3d9.dll in the game folder.",
            };
          }
        }

        // d3d9.dll already exists
        return { success: true, message: "DXVK already enabled" };
      } else {
        // ---- DISABLE DXVK ----
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("dxvk-progress", {
            step: "disable",
            status: "Disabling DXVK...",
            progress: 50,
          });
        }

        // Check if d3d9.dll exists
        if (!fs.existsSync(d3d9Path)) {
          return {
            success: false,
            message: "DXVK is already disabled",
          };
        }

        try {
          // If d3d9.backup exists, delete it first
          if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
          }

          // Rename d3d9.dll to d3d9.backup
          fs.renameSync(d3d9Path, backupPath);

          const w = getMainWindow();
          if (w && !w.isDestroyed()) {
            w.webContents.send("dxvk-progress", {
              step: "complete",
              status: "DXVK disabled successfully",
              progress: 100,
            });
          }

          return { success: true, message: "DXVK disabled" };
        } catch (error) {
          safeLog.error("Error disabling DXVK:", error);

          // Check if it's a permission error
          if (error.code === "EPERM" || error.code === "EACCES") {
            return {
              success: false,
              message:
                "Unable to modify d3d9.dll. Please check file permissions or close the game.",
            };
          }

          return {
            success: false,
            message: "Failed to disable DXVK. Please try again.",
          };
        }
      }
    } catch (error) {
      safeLog.error("Error toggling DXVK:", error);
      return {
        success: false,
        message: "An unexpected error occurred. Please try again.",
      };
    }
  });

  ipcMain.handle("check-dxvk-status", async () => {
    return checkDxvkStatus();
  });
}

module.exports = {
  makeReadCurrentFpsFromDxvkConf,
  makeCheckDxvkStatus,
  registerDxvkIpc,
};
