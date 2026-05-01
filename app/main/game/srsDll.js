// SRS DLL version switcher (Phase 7b).
//
// Shadowrun ships with two binary-compatible variants of srs_shadowrun.dll
// that have different gameplay/networking behavior. The launcher lets the
// user swap between them on demand:
//
//   "newer" -> ~14 KB stub (the smaller, recent variant)
//   "older" -> ~267-268 KB original (the larger, classic variant)
//
// Detection is by file size with a +-1 KB tolerance. We never read DLL
// metadata or hashes - file size has been a reliable discriminator and
// avoids fingerprinting either binary.
//
// On-disk layout:
//   srs_shadowrun.dll      - currently-active version
//   srs_shadowrun.dll.alt  - the inactive version, ready to swap in
//   srs_shadowrun.dll.temp - scratch path used during the 3-step swap
//
// Swap (when alt already exists):
//   1. Move current -> .temp
//   2. Move .alt -> current
//   3. Move .temp -> .alt
//
// First-time install (alt missing):
//   Download SRS_DLL_ZIP_URL, extract, copy target -> current and the
//   other variant -> .alt for future swaps.

const { safeLog } = require("../logger");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { SRS_DLL_ZIP_URL } = require("../config/constants");

const SRS_DLL_TEMP_PATH = path.join(os.tmpdir(), "srs_shadowrun.zip");

// File size constants (in bytes)
const SRS_DLL_NEWER_SIZE = 14336; // 14 KB
const SRS_DLL_OLDER_SIZE = 273705; // 267-268 KB

function makeCheckSrsDllVersion({ getGameInstallDir }) {
  // Check which version of srs_shadowrun.dll is active
  return async function checkSrsDllVersion() {
    try {
      const gameInstallDir = getGameInstallDir();
      if (!fs.existsSync(gameInstallDir)) {
        return { version: null, exists: false };
      }

      const dllPath = path.join(gameInstallDir, "srs_shadowrun.dll");

      if (!fs.existsSync(dllPath)) {
        return { version: null, exists: false };
      }

      const stats = fs.statSync(dllPath);
      const fileSize = stats.size;

      // Determine version by file size (with some tolerance)
      if (Math.abs(fileSize - SRS_DLL_NEWER_SIZE) < 1000) {
        return { version: "newer", exists: true, size: fileSize };
      } else if (Math.abs(fileSize - SRS_DLL_OLDER_SIZE) < 1000) {
        return { version: "older", exists: true, size: fileSize };
      } else {
        // Unknown version
        return { version: "unknown", exists: true, size: fileSize };
      }
    } catch (error) {
      safeLog.error("Error checking srs_shadowrun.dll version:", error);
      return { version: null, exists: false };
    }
  };
}

function registerSrsDllIpc(deps) {
  const {
    ipcMain,
    getMainWindow,
    getGameInstallDir,
    downloadFile,
    extractZip,
    checkSrsDllVersion,
  } = deps;

  // Handle srs_shadowrun.dll version switching
  ipcMain.handle("switch-srs-dll-version", async (event, targetVersion) => {
    try {
      const gameInstallDir = getGameInstallDir();
      // Check if game is installed
      if (!fs.existsSync(gameInstallDir)) {
        return { success: false, message: "Game not installed" };
      }

      const dllPath = path.join(gameInstallDir, "srs_shadowrun.dll");
      const altPath = path.join(gameInstallDir, "srs_shadowrun.dll.alt");

      const mainWindow = getMainWindow();

      // Send initial progress
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("srs-dll-progress", {
          step: "init",
          status: "Switching version...",
          progress: 10,
        });
      }

      // Check current version
      const currentStatus = await checkSrsDllVersion();

      if (!currentStatus.exists) {
        return {
          success: false,
          message: "srs_shadowrun.dll not found. Please reinstall the game.",
        };
      }

      // If already on target version, do nothing
      if (currentStatus.version === targetVersion) {
        return {
          success: true,
          message: `Already using ${targetVersion} version`,
        };
      }

      // Check if alternative version exists
      const altExists = fs.existsSync(altPath);

      if (altExists) {
        // Alternative exists - just swap them
        try {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("srs-dll-progress", {
              step: "swap",
              status: "Swapping versions...",
              progress: 50,
            });
          }

          // Create temp backup
          const tempPath = path.join(gameInstallDir, "srs_shadowrun.dll.temp");

          // Move current to temp
          fs.renameSync(dllPath, tempPath);

          // Move alt to current
          fs.renameSync(altPath, dllPath);

          // Move temp to alt
          fs.renameSync(tempPath, altPath);

          const w = getMainWindow();
          if (w && !w.isDestroyed()) {
            w.webContents.send("srs-dll-progress", {
              step: "complete",
              status: `Switched to ${targetVersion} version successfully`,
              progress: 100,
            });
          }

          return {
            success: true,
            message: `Switched to ${targetVersion} version`,
          };
        } catch (error) {
          safeLog.error("Error swapping versions:", error);
          return {
            success: false,
            message:
              "Unable to swap versions. Please check file permissions or close the game.",
          };
        }
      } else {
        // Alternative doesn't exist - need to download from server
        try {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("srs-dll-progress", {
              step: "download",
              status: "Downloading versions from server...",
              progress: 20,
            });
          }

          // Download the ZIP containing both versions
          const downloaded = await downloadFile(
            SRS_DLL_ZIP_URL,
            SRS_DLL_TEMP_PATH,
            (progress) => {
              const w = getMainWindow();
              if (w && !w.isDestroyed()) {
                w.webContents.send("srs-dll-progress", {
                  step: "download",
                  status: `Downloading versions (${progress}%)...`,
                  progress: 20 + Math.floor(progress / 2), // Scale to 20-70%
                });
              }
            }
          );

          if (!downloaded) {
            return {
              success: false,
              message:
                "Unable to download version files. Please check your internet connection.",
            };
          }

          // Extract the ZIP
          const w2 = getMainWindow();
          if (w2 && !w2.isDestroyed()) {
            w2.webContents.send("srs-dll-progress", {
              step: "extract",
              status: "Extracting files...",
              progress: 70,
            });
          }

          const tempExtractDir = path.join(os.tmpdir(), "srs_shadowrun_extract");
          if (!fs.existsSync(tempExtractDir)) {
            fs.mkdirSync(tempExtractDir, { recursive: true });
          }

          try {
            await extractZip(SRS_DLL_TEMP_PATH, tempExtractDir);

            // Find the extracted files
            const extractedNewer = path.join(tempExtractDir, "srs_shadowrun.dll");
            const extractedOlder = path.join(tempExtractDir, "srs_shadowrun.old");

            if (
              !fs.existsSync(extractedNewer) ||
              !fs.existsSync(extractedOlder)
            ) {
              throw new Error("Required files not found in downloaded archive");
            }

            const w3 = getMainWindow();
            if (w3 && !w3.isDestroyed()) {
              w3.webContents.send("srs-dll-progress", {
                step: "install",
                status: "Installing versions...",
                progress: 85,
              });
            }

            // Determine which file to use as current and which as alt
            let targetFile, altFile;

            if (targetVersion === "newer") {
              targetFile = extractedNewer;
              altFile = extractedOlder;
            } else {
              targetFile = extractedOlder;
              altFile = extractedNewer;
            }

            // Backup current version to .alt
            if (fs.existsSync(dllPath)) {
              fs.copyFileSync(dllPath, altPath);
            }

            // Copy target version to main location
            fs.copyFileSync(targetFile, dllPath);

            // Cleanup temp files
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
            if (fs.existsSync(SRS_DLL_TEMP_PATH)) {
              fs.unlinkSync(SRS_DLL_TEMP_PATH);
            }

            const w4 = getMainWindow();
            if (w4 && !w4.isDestroyed()) {
              w4.webContents.send("srs-dll-progress", {
                step: "complete",
                status: `Switched to ${targetVersion} version successfully`,
                progress: 100,
              });
            }

            return {
              success: true,
              message: `Switched to ${targetVersion} version`,
            };
          } catch (extractError) {
            safeLog.error("Error extracting/installing versions:", extractError);

            // Cleanup on error
            if (fs.existsSync(tempExtractDir)) {
              fs.rmSync(tempExtractDir, { recursive: true, force: true });
            }
            if (fs.existsSync(SRS_DLL_TEMP_PATH)) {
              fs.unlinkSync(SRS_DLL_TEMP_PATH);
            }

            return {
              success: false,
              message: "Downloaded file appears corrupted. Please try again.",
            };
          }
        } catch (error) {
          safeLog.error("Error downloading versions:", error);

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
            message: "Failed to switch versions. Please try again.",
          };
        }
      }
    } catch (error) {
      safeLog.error("Error switching srs_shadowrun.dll version:", error);
      return {
        success: false,
        message: "An unexpected error occurred. Please try again.",
      };
    }
  });

  ipcMain.handle("check-srs-dll-version", async () => {
    return checkSrsDllVersion();
  });
}

module.exports = {
  makeCheckSrsDllVersion,
  registerSrsDllIpc,
};
