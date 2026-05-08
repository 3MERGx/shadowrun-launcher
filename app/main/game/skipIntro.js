// "Skip Intro" mod (NoIntroFix) management (Phase 7b).
//
// History note: there are TWO separate code paths for toggling the mod, both
// preserved verbatim from the original main.js:
//
//   1. handleSkipIntroToggle() - older flow invoked from the save-settings
//      IPC handler. Stores backups in BACKUP_DIR (userData/BackupFiles) and
//      uses 7-Zip (bundled or system PATH) to extract NoIntroFix.zip into
//      <userData>/NoIntroFix/. Verifies installation by file-size delta.
//
//   2. toggle-skip-intro IPC handler - newer flow invoked when the user
//      clicks the toggle directly. Stores backups in
//      <RESOURCES>/BackupIntro/ and extracts via the shared
//      app/main/downloads/archive.js extractZip() (PowerShell Expand-Archive).
//
// The flows are similar but NOT identical, and the renderer has subtly
// different expectations of the progress events and final state shape from
// each. Phase 7b just lifts both into this module unchanged.
//
// checkSkipIntroStatus() is the canonical detector - it doesn't trust the
// settings.skipIntro flag and instead checks file sizes against fixed
// thresholds (the modded BIK files are dramatically smaller than originals).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const { app } = require("electron");

const {
  BACKUP_DIR,
  NO_INTRO_FIX_URL,
  NOINTRO_TEMP_PATH,
  BUNDLED_NO_INTRO_FIX,
} = require("../config/constants");
const { safeLog } = require("../logger");

// Module-local scratch list of files that were modified during the most
// recent install/uninstall. The original code path used a module-level let
// in main.js for this; we keep that scoping here to match exactly.
let modifiedFiles = [];

// ============================================================================
// Status probe (read-only)
// ============================================================================

function makeCheckSkipIntroStatus({
  getGameInstallDir,
  getSettings,
  saveSettingsToDisk,
}) {
  // Update the skip intro status detection logic to be more reliable
  return async function checkSkipIntroStatus() {
    try {
      const gameInstallDir = getGameInstallDir();
      if (!fs.existsSync(gameInstallDir)) {
        return { installed: false, backupExists: false };
      }

      const resourcesPath = path.join(gameInstallDir, "Resources");
      const backupPath = path.join(resourcesPath, "BackupIntro");
      const targetFiles = [
        "logo_pc.bik",
        "notices_us.bik",
        "opening_en_us.bik",
      ];

      // Check if backup exists (any files should be there)
      const backupExists =
        fs.existsSync(backupPath) &&
        targetFiles.some((file) => fs.existsSync(path.join(backupPath, file)));

      // Known size thresholds for original BIK files (in bytes)
      // These are approximate values - original files are much larger than modified ones
      const sizeTresholds = {
        "logo_pc.bik": 1000000, // 1MB threshold
        "notices_us.bik": 1000000, // 1MB threshold
        "opening_en_us.bik": 1000000, // 1MB threshold
      };

      // Check each file's size
      let modifiedFilesCount = 0;
      const fileStates = [];
      for (const file of targetFiles) {
        const filePath = path.join(resourcesPath, file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const modified = stats.size < sizeTresholds[file];
          if (modified) {
            modifiedFilesCount++;
          }
          fileStates.push({ file, size: stats.size, modified });
        }
      }

      // Routine probes run often (load-settings, settings screen open, save flow).
      // Keep detailed lines at debug so logs stay quiet unless troubleshooting.
      if (modifiedFilesCount === 3) {
        safeLog.debug(
          "[Skip Intro] Skip intro active (all 3 intro BIK files replaced)",
        );
      } else {
        for (const { file, size, modified } of fileStates) {
          safeLog.debug(
            modified
              ? `Detected modified ${file}: size=${size} bytes`
              : `Detected original ${file}: size=${size} bytes`,
          );
        }
      }

      // Consider it installed if at least 2 of 3 files are modified
      const installed = modifiedFilesCount >= 2;

      // If mod is detected but no backup exists, create one automatically
      if (installed && !backupExists) {
        safeLog.info("Mod detected but no backup found. Creating backup...");
        try {
          // We can't create a true backup since we don't have the original files
          // But we can at least create a marker file so the launcher knows
          if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
          }

          // Create a marker file
          fs.writeFileSync(
            path.join(backupPath, "installed_externally.txt"),
            "NoIntroFix was detected as pre-installed. Original files not available.",
          );

          // Update settings to reflect the detected state
          const settings = getSettings();
          settings.skipIntro = true;
          saveSettingsToDisk();
        } catch (e) {
          safeLog.error("Failed to create backup marker", e);
        }
      }

      return { installed, backupExists };
    } catch (error) {
      safeLog.error("Error checking skip intro status", error);
      return { installed: false, backupExists: false };
    }
  };
}

// ============================================================================
// save-settings flow (older path)
// ============================================================================

function makeHandleSkipIntroToggle(deps) {
  const {
    getMainWindow,
    getGameInstallDir,
    getResourcesDir,
    getSettings,
    saveSettingsToDisk,
    downloadFile,
    extractZip,
    checkSkipIntroStatus,
  } = deps;

  // Helper function to download and handle the NoIntroFix
  return async function handleSkipIntroToggle(skipIntro) {
    try {
      // Create necessary directories
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const RESOURCES_DIR = getResourcesDir();

      const resourcesExist = fs.existsSync(RESOURCES_DIR);
      if (!resourcesExist) {
        return { success: false, error: "Game resources not found" };
      }

      const fileList = ["opening_en_us.bik", "logo_pc.bik", "notices_us.bik"];

      const mainWindow = getMainWindow();
      const settings = getSettings();

      if (skipIntro) {
        // Enable Skip Intro

        // Check if we already have the NoIntroFix files downloaded
        const noIntroFixDir = path.join(app.getPath("userData"), "NoIntroFix");
        const noIntroFixFilesExist = fileList.every((file) =>
          fs.existsSync(path.join(noIntroFixDir, "Resources", file)),
        );

        if (!noIntroFixFilesExist) {
          try {
            // First try to download
            const zipPath = path.join(os.tmpdir(), "NoIntroFix.zip");
            await downloadFile(NO_INTRO_FIX_URL, zipPath);

            // Extract it
            await extractZip(zipPath, noIntroFixDir);
          } catch (downloadError) {
            safeLog.error("Error downloading NoIntroFix:", downloadError);

            // If download fails, check if we have a bundled version
            if (fs.existsSync(BUNDLED_NO_INTRO_FIX)) {
              await extractZip(BUNDLED_NO_INTRO_FIX, noIntroFixDir);
            } else {
              return {
                success: false,
                error: "Could not download or find NoIntroFix files",
              };
            }
          }
        }

        // Backup original files if not already backed up
        for (const file of fileList) {
          const originalPath = path.join(RESOURCES_DIR, file);
          const backupPath = path.join(BACKUP_DIR, file);

          if (fs.existsSync(originalPath) && !fs.existsSync(backupPath)) {
            fs.copyFileSync(originalPath, backupPath);
          }

          // Copy NoIntroFix file to game directory
          const fixPath = path.join(noIntroFixDir, "Resources", file);
          if (fs.existsSync(fixPath)) {
            fs.copyFileSync(fixPath, originalPath);
          }
        }

        // Add progress updates for download
        const downloadSuccess = await downloadFile(
          NO_INTRO_FIX_URL,
          NOINTRO_TEMP_PATH,
          (progress) => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("skip-intro-progress", {
                step: "download",
                status: `Downloading mod files (${progress}%)...`,
                progress,
              });
            }
          },
        );

        if (!downloadSuccess) {
          return {
            success: false,
            message: "Failed to download intro skip files",
          };
        }

        // Extract the 7z file
        safeLog.info("Extracting NoIntroFix...");
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("skip-intro-progress", {
            step: "extract",
            status: "Extracting mod files...",
            progress: 50,
          });
        }

        // Use 7-Zip to extract (assuming 7z is available in PATH or bundled)
        try {
          // First check if we have bundled 7z
          let sevenZipPath = path.join(app.getAppPath(), "bin", "7z.exe");
          safeLog.info(`Checking for bundled 7-Zip at: ${sevenZipPath}`);

          if (!fs.existsSync(sevenZipPath)) {
            // Fall back to system 7z if available
            safeLog.info("Bundled 7-Zip not found, using system 7z");
            sevenZipPath = "7z";
          } else {
            safeLog.info("Using bundled 7-Zip");
          }

          const extractCommand = `"${sevenZipPath}" x "${NOINTRO_TEMP_PATH}" -o"${RESOURCES_DIR}" -y`;
          safeLog.info(`Running extract command: ${extractCommand}`);

          await new Promise((resolve, reject) => {
            exec(extractCommand, (error, stdout, stderr) => {
              if (error) {
                safeLog.error("Extract error:", error.message);
                safeLog.error("Extract stderr:", stderr);
                reject(error);
              } else {
                safeLog.info("Extract stdout:", stdout);
                resolve();
              }
            });
          });
        } catch (error) {
          safeLog.error("Failed to extract NoIntroFix", error);
          // Remove fallback that creates minimal BIK files
          safeLog.error("Failed to extract or install NoIntroFix files", error);

          // Clean up any partial extraction
          try {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
            if (downloaded) {
              fs.unlinkSync(NOINTRO_TEMP_PATH);
            }
          } catch (e) {
            // Ignore cleanup errors
          }

          // Report error to user
          const w = getMainWindow();
          if (w && !w.isDestroyed()) {
            w.webContents.send("skip-intro-progress", {
              step: "error",
              status: "Installation failed",
              progress: 100,
              error:
                "Failed to extract or install the mod files. Please try again.",
            });
          }

          // Return error instead of continuing with custom BIK files
          return {
            success: false,
            message: "Failed to extract or apply the mod files.",
          };
        }

        // Clean up temp file
        try {
          fs.unlinkSync(NOINTRO_TEMP_PATH);
        } catch (e) {
          // Ignore error, not critical
        }

        // Update settings
        settings.skipIntro = true;
        saveSettingsToDisk();

        // Add this function to verify file modifications
        function verifyFileModification(filePath, originalSize) {
          try {
            const stats = fs.statSync(filePath);
            return stats.size !== originalSize; // If size changed, file was modified
          } catch (e) {
            return false; // File doesn't exist or can't be accessed
          }
        }

        // Store original file sizes before modification
        const originalFileSizes = {};
        for (const file of fileList) {
          const filePath = path.join(RESOURCES_DIR, file);
          try {
            const stats = fs.statSync(filePath);
            originalFileSizes[file] = stats.size;
          } catch (e) {
            // Handle missing files
            safeLog.warn(`Original file not found: ${file}`);
          }
        }

        // After extraction and file replacement, verify changes:
        modifiedFiles = [];
        for (const file of fileList) {
          const filePath = path.join(RESOURCES_DIR, file);
          if (verifyFileModification(filePath, originalFileSizes[file])) {
            modifiedFiles.push(file);
          }
        }

        const w2 = getMainWindow();

        // Report the results to the user
        if (modifiedFiles.length === fileList.length) {
          // All files modified successfully
          w2.webContents.send("skip-intro-progress", {
            step: "complete",
            status: "",
            progress: 100,
          });
        } else {
          // Some files weren't modified
          w2.webContents.send("skip-intro-progress", {
            step: "partial",
            status: "Installation incomplete",
            progress: 100,
            error:
              "Some files could not be modified. Mod may not work correctly.",
          });
        }

        // After completing, check actual state and update button
        const finalState = await checkSkipIntroStatus();
        const w3 = getMainWindow();
        if (w3 && !w3.isDestroyed()) {
          w3.webContents.send("skip-intro-final-state", finalState);
        }

        return { success: true, state: finalState };
      } else {
        // Disable Skip Intro (restore original files)
        for (const file of fileList) {
          const originalPath = path.join(RESOURCES_DIR, file);
          const backupPath = path.join(BACKUP_DIR, file);

          // If we have a backup, restore it
          if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, originalPath);
          }
        }

        // Update settings
        settings.skipIntro = false;
        saveSettingsToDisk();

        const w = getMainWindow();
        if (w && !w.isDestroyed()) {
          w.webContents.send("skip-intro-progress", {
            step: "complete",
            status: "",
            progress: 100,
          });
        }

        return { success: true };
      }
    } catch (error) {
      safeLog.error("Error toggling intro skip", error);
      return { success: false, message: error.message };
    }
  };
}

// ============================================================================
// IPC registrar (newer toggle-skip-intro / check-skip-intro-status flow)
// ============================================================================

function registerSkipIntroIpc(deps) {
  const {
    ipcMain,
    getMainWindow,
    getGameInstallDir,
    getSettings,
    saveSettingsToDisk,
    downloadFile,
    extractZip,
    checkSkipIntroStatus,
  } = deps;

  // Handle toggling skip intro
  ipcMain.handle("toggle-skip-intro", async (event, enabled) => {
    try {
      const gameInstallDir = getGameInstallDir();
      // Check if game is installed
      if (!fs.existsSync(gameInstallDir)) {
        return { success: false, message: "Game not installed" };
      }

      // Path to Resources folder
      const resourcesPath = path.join(gameInstallDir, "Resources");

      // Correct files to backup/replace - these are the actual BIK files
      const targetFiles = [
        "logo_pc.bik",
        "notices_us.bik",
        "opening_en_us.bik",
      ];

      // Ensure the backup folder exists
      const backupPath = path.join(resourcesPath, "BackupIntro");

      const mainWindow = getMainWindow();
      const settings = getSettings();

      if (enabled) {
        // ---- ENABLE INTRO SKIP ----
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("skip-intro-progress", {
            step: "init",
            status: "Preparing...",
            progress: 10,
          });
        }

        // Create backup directory if needed
        if (!fs.existsSync(backupPath)) {
          fs.mkdirSync(backupPath, { recursive: true });
        }

        // First backup original files if not already backed up
        const backedUpFiles = [];

        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("skip-intro-progress", {
            step: "backup",
            status: "Backing up files...",
            progress: 30,
          });
        }

        for (const file of targetFiles) {
          const originalPath = path.join(resourcesPath, file);
          const backupFilePath = path.join(backupPath, file);

          if (fs.existsSync(originalPath) && !fs.existsSync(backupFilePath)) {
            fs.copyFileSync(originalPath, backupFilePath);
            backedUpFiles.push(file);
          } else if (fs.existsSync(backupFilePath)) {
            backedUpFiles.push(file); // Already backed up
          }
        }

        // Download the proper NoIntroFix files instead of creating empty ones
        const w2 = getMainWindow();
        if (w2 && !w2.isDestroyed()) {
          w2.webContents.send("skip-intro-progress", {
            step: "download",
            status: "Downloading mod files...",
            progress: 50,
          });
        }

        // Use the existing download URL for NoIntroFix
        const downloaded = await downloadFile(
          NO_INTRO_FIX_URL,
          NOINTRO_TEMP_PATH,
          (progress) => {
            const w = getMainWindow();
            if (w && !w.isDestroyed()) {
              w.webContents.send("skip-intro-progress", {
                step: "download",
                status: `Downloading mod files (${progress}%)...`,
                progress: 50 + Math.floor(progress / 5), // Scale to 50-70% range
              });
            }
          },
        );

        if (!downloaded) {
          // Try using bundled files if download fails
          if (!fs.existsSync(BUNDLED_NO_INTRO_FIX)) {
            return {
              success: false,
              message: "Could not download or find NoIntroFix files",
            };
          }
        }

        // Extract and install the files
        const w3 = getMainWindow();
        if (w3 && !w3.isDestroyed()) {
          w3.webContents.send("skip-intro-progress", {
            step: "install",
            status: "Installing mod...",
            progress: 70,
          });
        }

        // Extract to a temp directory first
        const tempExtractDir = path.join(os.tmpdir(), "NoIntroFixExtract");
        if (!fs.existsSync(tempExtractDir)) {
          fs.mkdirSync(tempExtractDir, { recursive: true });
        }

        try {
          // Use the downloaded file or bundled file
          const zipToExtract = downloaded
            ? NOINTRO_TEMP_PATH
            : BUNDLED_NO_INTRO_FIX;
          await extractZip(zipToExtract, tempExtractDir);

          // Copy the extracted files to the game directory
          modifiedFiles = [];
          for (const file of targetFiles) {
            // Check for both possible paths - direct or through NoIntroFix folder
            let sourcePath = path.join(tempExtractDir, "Resources", file);

            // If file not found at direct path, check for it in the NoIntroFix subdirectory
            if (!fs.existsSync(sourcePath)) {
              sourcePath = path.join(
                tempExtractDir,
                "NoIntroFix",
                "Resources",
                file,
              );
            }

            const destPath = path.join(resourcesPath, file);

            if (fs.existsSync(sourcePath)) {
              fs.copyFileSync(sourcePath, destPath);
              modifiedFiles.push(file);
            }
          }

          // Clean up
          try {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
            if (downloaded) {
              fs.unlinkSync(NOINTRO_TEMP_PATH);
            }
          } catch (e) {
            // Ignore cleanup errors
          }

          const w4 = getMainWindow();

          // Report results
          if (modifiedFiles.length === targetFiles.length) {
            // All files modified successfully
            w4.webContents.send("skip-intro-progress", {
              step: "complete",
              status: "", // Remove success message
              progress: 100,
            });
          } else {
            // Not all files were processed
            if (modifiedFiles.length > 0) {
              w4.webContents.send("skip-intro-progress", {
                step: "partial",
                status: "Installation incomplete",
                progress: 100,
                error:
                  "Some files could not be modified. Mod may not work correctly.",
              });
            } else {
              // No files were processed
              throw new Error(
                "No files were copied from the NoIntroFix archive.",
              );
            }
          }
        } catch (error) {
          // Remove fallback that creates minimal BIK files
          safeLog.error("Failed to extract or install NoIntroFix files", error);

          // Clean up any partial extraction
          try {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
            if (downloaded) {
              fs.unlinkSync(NOINTRO_TEMP_PATH);
            }
          } catch (e) {
            // Ignore cleanup errors
          }

          // Report error to user
          const w5 = getMainWindow();
          if (w5 && !w5.isDestroyed()) {
            w5.webContents.send("skip-intro-progress", {
              step: "error",
              status: "Installation failed",
              progress: 100,
              error:
                "Failed to extract or install the mod files. Please try again.",
            });
          }

          // Return error instead of continuing with custom BIK files
          return {
            success: false,
            message: "Failed to extract or apply the mod files.",
          };
        }

        // Update settings
        settings.skipIntro = true;
        saveSettingsToDisk();

        // After completing, check actual state and update button
        const finalState = await checkSkipIntroStatus();
        const w6 = getMainWindow();
        if (w6 && !w6.isDestroyed()) {
          w6.webContents.send("skip-intro-final-state", finalState);
        }

        return { success: true, state: finalState };
      } else {
        // ---- DISABLE INTRO SKIP (Uninstall the mod) ----
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("skip-intro-progress", {
            step: "init",
            status: "Preparing to restore original files...",
            progress: 10,
          });
        }

        // Restore original files from backup
        const restoredFiles = [];

        for (const [fileIndex, file] of targetFiles.entries()) {
          const originalPath = path.join(resourcesPath, file);
          const backupFilePath = path.join(backupPath, file);

          const w = getMainWindow();
          if (w && !w.isDestroyed()) {
            const progressValue =
              20 + Math.floor((fileIndex / targetFiles.length) * 60);
            w.webContents.send("skip-intro-progress", {
              step: "restore",
              status: "Restoring original files...",
              progress: progressValue,
            });
          }

          if (fs.existsSync(backupFilePath)) {
            try {
              // Remove modified file and restore backup
              if (fs.existsSync(originalPath)) {
                fs.unlinkSync(originalPath);
              }
              fs.copyFileSync(backupFilePath, originalPath);
              restoredFiles.push(file);
            } catch (error) {
              safeLog.error(`Failed to restore ${file}`, error);
            }
          }
        }

        // Update settings
        settings.skipIntro = false;
        saveSettingsToDisk();

        // Report results - simplified without success message
        if (restoredFiles.length === targetFiles.length) {
          const w2 = getMainWindow();
          if (w2 && !w2.isDestroyed()) {
            w2.webContents.send("skip-intro-progress", {
              step: "complete",
              status: "", // Remove success message
              progress: 100,
            });
          }

          // Now we remove backup files to prevent false detection on next check
          // Only remove backups if all files were successfully restored
          if (fs.existsSync(backupPath)) {
            try {
              for (const file of targetFiles) {
                const backupFilePath = path.join(backupPath, file);
                if (fs.existsSync(backupFilePath)) {
                  fs.unlinkSync(backupFilePath);
                }
              }

              // Try to remove the backup directory (will fail if not empty)
              try {
                fs.rmdirSync(backupPath);
              } catch (e) {
                // Directory not empty or other error, this is not critical
              }
            } catch (e) {
              // Error cleaning up backup files, not critical
              safeLog.warn("Error cleaning up backup files (non-critical)", e);
            }
          }
        } else {
          const w3 = getMainWindow();
          if (w3 && !w3.isDestroyed()) {
            w3.webContents.send("skip-intro-progress", {
              step: "partial",
              status: "Uninstall incomplete",
              progress: 100,
              error:
                "Some files could not be restored. You may need to verify game files.",
            });
          }
        }

        // After completing, check actual state and update button
        const finalState = await checkSkipIntroStatus();
        const w4 = getMainWindow();
        if (w4 && !w4.isDestroyed()) {
          w4.webContents.send("skip-intro-final-state", finalState);
        }

        return { success: true, state: finalState };
      }
    } catch (error) {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("skip-intro-progress", {
          step: "error",
          status: "Operation failed",
          progress: 100,
          error: error.message,
        });
      }

      return { success: false, message: error.message };
    }
  });

  // Add this IPC handler to check the mod status
  ipcMain.handle("check-skip-intro-status", async () => {
    return await checkSkipIntroStatus();
  });

  // Add a listener for the final state update
  ipcMain.on("skip-intro-final-state", (state) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("skip-intro-final-state", state);
    }
  });
}

module.exports = {
  makeCheckSkipIntroStatus,
  makeHandleSkipIntroToggle,
  registerSkipIntroIpc,
};
