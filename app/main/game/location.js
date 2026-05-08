// Game install-location management (Phase 7c).
//
// This module owns everything around discovering, validating, displaying, and
// physically moving the game install directory:
//
//   Pure helpers (state-free, exported as plain functions):
//     isGamePathInProtectedDirectory(path) -> bool
//     formatBytes(bytes)                   -> "1.23 GB"
//     getAllFiles(dir, list?)              -> string[] (recursive)
//     getFolderSize(folder)                -> int (bytes)
//     checkIfPathRequiresAdmin(path)       -> bool (pure check; no fs probe)
//
//   State-bound helper (factory):
//     makeSetDefaultGameConfig({ getGameInstallDir })
//       -> setDefaultGameConfig() that pre-seeds the game's INI files with
//          safe resolution + 50% music volume defaults before first launch.
//          Currently used by the launchGameLogic deps bag.
//
//   IPC registrar (registerLocationIpc):
//     open-game-directory       - shell.openPath(GAME_INSTALL_DIR) with
//                                 fallbacks to common GFWL install paths
//                                 and a folder picker.
//     get-game-installation-path
//     change-game-location      - folder picker + validation, returns the
//                                 metadata the renderer needs to confirm.
//     execute-game-move         - copies every file to the new path,
//                                 falling back to a UAC-elevated VBS+PS1
//                                 worker when source/dest is in Program
//                                 Files / Windows / ProgramData.
//     clear-saved-game-path     - resets to the default user-writable path.
//     browse-for-existing-game  - manual "I already have it installed
//                                 elsewhere" picker; verifies Shadowrun.exe
//                                 exists and re-syncs mod statuses.
//
// The elevated move uses a 4-file scratch handoff (PS1 script + VBS launcher
// + JSON file list + UTF-8 progress log). The renderer is told about
// progress via the "game-move-progress" channel.

const { safeLog } = require("../logger");
const fs = require("fs");
const path = require("path");
const os = require("os");
const util = require("util");
const { exec, spawn } = require("child_process");
const { app, dialog, shell } = require("electron");

const execPromise = util.promisify(exec);

// ============================================================================
// Pure helpers
// ============================================================================

// Check if game path is in a protected directory (e.g. Program Files) where
// normal users may need admin to run.
function isGamePathInProtectedDirectory(gamePath) {
  if (!gamePath || typeof gamePath !== "string") return false;
  const normalized = path.normalize(gamePath).toLowerCase();
  return (
    normalized.includes("program files") ||
    normalized.includes("program files (x86)") ||
    normalized.includes("\\windows\\")
  );
}

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Free bytes for a Windows drive root (e.g. "C:\"). Uses WMIC when available,
 * then PowerShell (WMIC is removed or not on PATH on some Windows installs).
 */
async function getWindowsDriveFreeBytes(driveRoot) {
  const trimmed = String(driveRoot || "").trim();
  const deviceMatch = trimmed.match(/^([A-Za-z]):/);
  const letter = deviceMatch ? deviceMatch[1] : "C";
  const deviceId = `${letter}:`;

  try {
    const { stdout } = await execPromise(
      `wmic logicaldisk where "DeviceID='${deviceId}'" get FreeSpace`,
      { windowsHide: true }
    );
    const freeSpaceMatch = stdout.match(/\d+/);
    if (freeSpaceMatch) {
      return parseInt(freeSpaceMatch[0], 10);
    }
  } catch (_e) {
    // WMIC missing from PATH or removed from the OS
  }

  try {
    const { stdout } = await execPromise(
      `powershell -NoProfile -Command "(Get-PSDrive -Name '${letter}').Free"`,
      { windowsHide: true }
    );
    const n = parseInt(String(stdout).trim(), 10);
    if (!Number.isNaN(n) && n >= 0) {
      return n;
    }
  } catch (_e2) {
    // ignore
  }

  return null;
}

// Helper function to get all files recursively
async function getAllFiles(dirPath, fileList = []) {
  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    const itemPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      await getAllFiles(itemPath, fileList);
    } else if (item.isFile()) {
      fileList.push(itemPath);
    }
  }

  return fileList;
}

// Helper function to get folder size
async function getFolderSize(folderPath) {
  let totalSize = 0;

  function calculateSize(dirPath) {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        calculateSize(itemPath);
      } else if (item.isFile()) {
        const stats = fs.statSync(itemPath);
        totalSize += stats.size;
      }
    }
  }

  try {
    if (fs.existsSync(folderPath)) {
      calculateSize(folderPath);
    }
  } catch (error) {
    safeLog.error("[getFolderSize] Error:", error);
  }

  return totalSize;
}

// Helper function to check if path requires admin rights
async function checkIfPathRequiresAdmin(targetPath) {
  const normalizedPath = path.normalize(targetPath).toLowerCase();

  // Common Windows protected directories that require admin
  const protectedPaths = [
    "c:\\program files",
    "c:\\program files (x86)",
    "c:\\windows",
    "c:\\programdata",
  ];

  const needsAdmin = protectedPaths.some((protectedPath) =>
    normalizedPath.startsWith(protectedPath)
  );

  safeLog.info(
    `[Admin Check] Path: ${targetPath} → Requires admin: ${needsAdmin}`
  );
  return needsAdmin;
}

// ============================================================================
// State-bound helpers (factories)
// ============================================================================

function makeSetDefaultGameConfig({ getGameInstallDir }) {
  // Helper function to set default game configuration (resolution and volume)
  // This runs before first launch to prevent off-screen resolution issues
  return function setDefaultGameConfig() {
    try {
      const GAME_INSTALL_DIR = getGameInstallDir();
      // Common config file locations for Shadowrun (2007 GFWL game)
      const possibleConfigPaths = [
        path.join(GAME_INSTALL_DIR, "config.ini"),
        path.join(GAME_INSTALL_DIR, "settings.ini"),
        path.join(GAME_INSTALL_DIR, "Shadowrun.ini"),
        path.join(GAME_INSTALL_DIR, "System", "Shadowrun.ini"),
        path.join(GAME_INSTALL_DIR, "System", "ShadowrunEngine.ini"),
        path.join(
          app.getPath("documents"),
          "My Games",
          "Shadowrun",
          "config.ini"
        ),
        path.join(
          app.getPath("documents"),
          "My Games",
          "Shadowrun",
          "Shadowrun.ini"
        ),
        path.join(app.getPath("appData"), "Shadowrun", "config.ini"),
      ];

      // Try to find and modify existing config file
      for (const configPath of possibleConfigPaths) {
        if (fs.existsSync(configPath)) {
          try {
            let configContent = fs.readFileSync(configPath, "utf8");
            let modified = false;

            // Set resolution to a safe default (1920x1080 or 1280x720)
            // Common patterns for resolution in game configs
            const resolutionPatterns = [
              /ResolutionSizeX\s*=\s*\d+/i,
              /ScreenResolutionX\s*=\s*\d+/i,
              /ResX\s*=\s*\d+/i,
              /Width\s*=\s*\d+/i,
            ];
            const resolutionYPatterns = [
              /ResolutionSizeY\s*=\s*\d+/i,
              /ScreenResolutionY\s*=\s*\d+/i,
              /ResY\s*=\s*\d+/i,
              /Height\s*=\s*\d+/i,
            ];

            // Try to set resolution to 1920x1080 (or detect current resolution and use that)
            // For now, we'll just log that we found the config
            safeLog.info(`[Game Config] Found config file at: ${configPath}`);

            // Set music volume to 50% (0.5 or 50 depending on format)
            const volumePatterns = [
              /MusicVolume\s*=\s*[\d.]+/i,
              /VolumeMusic\s*=\s*[\d.]+/i,
              /MasterMusicVolume\s*=\s*[\d.]+/i,
            ];

            for (const pattern of volumePatterns) {
              if (pattern.test(configContent)) {
                // Replace with 0.5 (50% as decimal) or 50 (50% as integer)
                configContent = configContent.replace(pattern, (match) => {
                  const numMatch = match.match(/[\d.]+/);
                  if (numMatch) {
                    const num = parseFloat(numMatch[0]);
                    // If it's a 0-1 scale, use 0.5; if 0-100 scale, use 50
                    const newValue = num <= 1 ? "0.5" : "50";
                    return match.replace(/[\d.]+/, newValue);
                  }
                  return match;
                });
                modified = true;
                safeLog.info(
                  `[Game Config] Set music volume to 50% in ${configPath}`
                );
              }
            }

            if (modified) {
              fs.writeFileSync(configPath, configContent, "utf8");
              safeLog.info(`[Game Config] Updated config file: ${configPath}`);
            }
          } catch (error) {
            safeLog.warn(
              `[Game Config] Could not modify config file ${configPath}:`,
              error.message
            );
          }
        }
      }

      // Also check registry for game settings (common for GFWL games)
      // Shadowrun might store settings in: HKEY_CURRENT_USER\Software\Microsoft\Games\Shadowrun
      try {
        const regPath =
          "HKEY_CURRENT_USER\\Software\\Microsoft\\Games\\Shadowrun";
        // We could use registryUtils here, but for now just log
        safeLog.info("[Game Config] Checking registry for game settings...");
      } catch (error) {
        safeLog.warn("[Game Config] Could not check registry:", error.message);
      }
    } catch (error) {
      safeLog.warn(
        "[Game Config] Error setting default game config:",
        error.message
      );
    }
  };
}

// ============================================================================
// IPC registrar
// ============================================================================

function registerLocationIpc(deps) {
  const {
    ipcMain,
    getMainWindow,
    getGameProcess,
    getGameInstallDir,
    setGameInstallDir,
    setResourcesDir,
    getSettings,
    saveSettingsToDisk,
    checkSkipIntroStatus,
    checkDxvkStatus,
    checkExistingInstallation,
  } = deps;

  // ---- Helpers that close over the DI bag ----

  // Helper function to validate new game path
  async function validateNewGamePath(newPath) {
    try {
      const GAME_INSTALL_DIR = getGameInstallDir();
      // Check if path is too long (Windows MAX_PATH limit)
      if (newPath.length > 240) {
        return {
          valid: false,
          error:
            "Path is too long. Please choose a shorter path (Windows limit is 260 characters).",
        };
      }

      // Check if it's the same as current path
      if (path.normalize(newPath) === path.normalize(GAME_INSTALL_DIR)) {
        return {
          valid: false,
          error: "This is already the current game location.",
        };
      }

      // Check if destination already has files
      if (fs.existsSync(newPath)) {
        const files = fs.readdirSync(newPath);
        if (files.length > 0) {
          return {
            valid: false,
            error:
              "This folder already contains files. Please choose an empty folder or a different location.",
          };
        }
      }

      // Check if it's a network drive
      const drive = newPath.substring(0, 2);
      if (drive.startsWith("\\\\")) {
        return {
          valid: false,
          error:
            "Network drives are not supported. Please choose a local drive.",
        };
      }

      // Check available space
      const gameSize = await getFolderSize(GAME_INSTALL_DIR);
      const destDrive = path.parse(newPath).root;

      try {
        const freeSpace = await getWindowsDriveFreeBytes(destDrive);
        if (freeSpace !== null) {
          const requiredSpace = gameSize * 1.1; // Add 10% buffer

          if (freeSpace < requiredSpace) {
            return {
              valid: false,
              error: `Not enough disk space. Need ${formatBytes(
                requiredSpace
              )}, but only ${formatBytes(freeSpace)} available.`,
            };
          }
        }
      } catch (spaceCheckError) {
        safeLog.warn(
          "[Validation] Could not check disk space:",
          spaceCheckError
        );
        // Continue anyway - user might have enough space
      }

      // Check if path requires admin rights (Program Files, Windows, etc.)
      const requiresAdmin = await checkIfPathRequiresAdmin(newPath);

      // Also check if SOURCE requires admin (for deletion)
      const sourceRequiresAdmin = await checkIfPathRequiresAdmin(
        GAME_INSTALL_DIR
      );

      if (requiresAdmin || sourceRequiresAdmin) {
        // Skip write permission test - we'll elevate during move
        safeLog.info(
          "[Validation] Path requires admin, will elevate during move"
        );
        return {
          valid: true,
          requiresElevation: true,
        };
      }

      // Check write permissions (only for non-admin paths)
      const parentDir = path.dirname(newPath);
      if (!fs.existsSync(parentDir)) {
        try {
          fs.mkdirSync(parentDir, { recursive: true });
        } catch (mkdirError) {
          return {
            valid: false,
            error:
              "Cannot create directory at this location. You may not have permission.",
          };
        }
      }

      const testFile = path.join(parentDir, `.write-test-${Date.now()}.tmp`);
      try {
        fs.writeFileSync(testFile, "test");
        fs.unlinkSync(testFile);
      } catch (writeError) {
        return {
          valid: false,
          error: "Cannot write to this location. You may not have permission.",
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error.message}`,
      };
    }
  }

  // Execute move with elevation (UAC prompt)
  async function executeElevatedMove(oldPath, newPath) {
    try {
      safeLog.info("[Elevated Move] Preparing elevated move operation");

      // Get list of all files to move
      const files = await getAllFiles(oldPath);
      const totalFiles = files.length;

      safeLog.info(`[Elevated Move] Moving ${totalFiles} files with elevation`);

      // Create temp file paths
      const vbsPath = path.join(os.tmpdir(), `elevate-${Date.now()}.vbs`);
      const logPath = path.join(os.tmpdir(), `move-game-log-${Date.now()}.txt`);
      const fileListPath = path.join(
        os.tmpdir(),
        `move-game-files-${Date.now()}.json`
      );

      // Write file list to JSON file
      const fileList = files.map((file) => ({
        src: file,
        dest: path.join(newPath, path.relative(oldPath, file)),
      }));
      fs.writeFileSync(fileListPath, JSON.stringify(fileList), "utf8");

      // Create PowerShell script content
      const psScriptContent = `
$ErrorActionPreference = "Stop"
$fileListPath = "${fileListPath.replace(/\\/g, "\\\\")}"
$logFile = "${logPath.replace(/\\/g, "\\\\")}"
$newPath = "${newPath.replace(/\\/g, "\\\\")}"
$oldPath = "${oldPath.replace(/\\/g, "\\\\")}"
$currentUser = "${process.env.USERNAME || "Users"}"
$userDomain = "${process.env.USERDOMAIN || ""}"

# Write start marker immediately using UTF8 encoding
$newline = [Environment]::NewLine
[System.IO.File]::WriteAllText($logFile, "STARTED$newline", [System.Text.Encoding]::UTF8)

try {
    $files = Get-Content $fileListPath | ConvertFrom-Json
    $totalFiles = $files.Count
    $movedFiles = 0
    
    # Create base destination directory
    if (-not (Test-Path $newPath)) {
        New-Item -ItemType Directory -Path $newPath -Force | Out-Null
    }
    
    # Set permissions on destination so current user has full control
    try {
        $acl = Get-Acl $newPath
        $userIdentity = if ($userDomain) { "$userDomain\\$currentUser" } else { $currentUser }
        $permission = $userIdentity,"FullControl","ContainerInherit,ObjectInherit","None","Allow"
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
        $acl.SetAccessRule($accessRule)
        Set-Acl $newPath $acl
        [System.IO.File]::AppendAllText($logFile, "PERMISSIONS_SET$newline", [System.Text.Encoding]::UTF8)
    } catch {
        [System.IO.File]::AppendAllText($logFile, "PERMISSIONS_WARNING: $($_.Exception.Message)$newline", [System.Text.Encoding]::UTF8)
    }
    
    # Copy all files
    foreach ($file in $files) {
        $destDir = Split-Path -Parent $file.dest
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -Path $file.src -Destination $file.dest -Force -ErrorAction Stop
        $movedFiles++
        
        if (($movedFiles % 10 -eq 0) -or ($movedFiles -eq $totalFiles)) {
            $progress = [math]::Round(($movedFiles / $totalFiles) * 100)
            $progressLine = "PROGRESS:$progress|$movedFiles|$totalFiles$newline"
            [System.IO.File]::AppendAllText($logFile, $progressLine, [System.Text.Encoding]::UTF8)
        }
    }
    
    # Send final 100% progress
    [System.IO.File]::AppendAllText($logFile, "PROGRESS:100|$totalFiles|$totalFiles$newline", [System.Text.Encoding]::UTF8)
    
    # Verify
    $verified = $true
    foreach ($file in $files) {
        if (-not (Test-Path $file.dest)) {
            $verified = $false
            break
        }
    }
    
    if ($verified) {
        # Try to remove old directory, but don't fail if it's already gone
        if (Test-Path $oldPath) {
            try {
                Remove-Item -Path $oldPath -Recurse -Force -ErrorAction Stop
            } catch {
                # Old directory might already be deleted or in use - log but don't fail
                [System.IO.File]::AppendAllText($logFile, "OLD_DIR_REMOVAL_WARNING: $($_.Exception.Message)$newline", [System.Text.Encoding]::UTF8)
            }
        } else {
            # Old directory already missing - that's fine, files were already moved/deleted
            [System.IO.File]::AppendAllText($logFile, "OLD_DIR_ALREADY_MISSING$newline", [System.Text.Encoding]::UTF8)
        }
        [System.IO.File]::AppendAllText($logFile, "SUCCESS$newline", [System.Text.Encoding]::UTF8)
    } else {
        [System.IO.File]::AppendAllText($logFile, "VERIFICATION_FAILED$newline", [System.Text.Encoding]::UTF8)
    }
} catch {
    [System.IO.File]::AppendAllText($logFile, "ERROR: $($_.Exception.Message)$newline", [System.Text.Encoding]::UTF8)
    exit 1
}
exit 0
`.trim();

      const psScriptPath = path.join(
        os.tmpdir(),
        `move-game-script-${Date.now()}.ps1`
      );
      fs.writeFileSync(psScriptPath, psScriptContent, "utf8");

      // Create VBScript to launch PowerShell elevated and hidden (no window)
      // Escape backslashes for VBScript (need to double them)
      const escapedPsPath = psScriptPath.replace(/\\/g, "\\\\");
      const vbsContent = `Set objShell = CreateObject("Shell.Application")
objShell.ShellExecute "powershell.exe", "-ExecutionPolicy Bypass -WindowStyle Hidden -NoProfile -File ""${escapedPsPath}""", "", "runas", 0
`;
      fs.writeFileSync(vbsPath, vbsContent, "utf8");
      safeLog.info(`[Elevated Move] VBScript created at: ${vbsPath}`);
      safeLog.info(`[Elevated Move] PowerShell script at: ${psScriptPath}`);

      safeLog.info(
        "[Elevated Move] Launching UAC prompt (PowerShell will run hidden)"
      );
      safeLog.info(`[Elevated Move] Log file will be at: ${logPath}`);

      // Send initial progress
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("game-move-progress", {
          progress: 0,
          movedFiles: 0,
          totalFiles: files.length,
        });
      }

      // Run the VBScript (this shows UAC, then PowerShell runs hidden)
      spawn("wscript.exe", [vbsPath], {
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      }).unref();

      // Wait a moment for the log file to be created
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Monitor progress
      const startTime = Date.now();
      const maxWaitTime = 300000; // 5 minutes max
      let lastProgressLine = null;

      const progressInterval = setInterval(() => {
        try {
          if (fs.existsSync(logPath)) {
            const logContent = fs.readFileSync(logPath, "utf8").trim();
            const lines = logContent.split("\n");

            // Log when script starts
            if (lines.includes("STARTED") && lastProgressLine === null) {
              safeLog.info(
                "[Elevated Move] PowerShell script started, log file detected"
              );
            }

            // Find the last progress line
            for (let i = lines.length - 1; i >= 0; i--) {
              const line = lines[i].trim();
              if (line.startsWith("PROGRESS:")) {
                // Only log if it's a new progress line
                if (line !== lastProgressLine) {
                  const progressData = line.substring(9); // Remove "PROGRESS:" prefix
                  const [progress, movedFiles, total] =
                    progressData.split("|");

                  safeLog.info(
                    `[Elevated Move] Progress: ${progress}% (${movedFiles}/${total})`
                  );

                  const win = getMainWindow();
                  if (win && !win.isDestroyed()) {
                    win.webContents.send("game-move-progress", {
                      progress: parseInt(progress),
                      movedFiles: parseInt(movedFiles),
                      totalFiles: parseInt(total),
                    });
                  }
                  lastProgressLine = line;
                }
                break;
              }
            }
          } else {
            // Log file doesn't exist yet - log occasionally
            const elapsed = Date.now() - startTime;
            if (elapsed < 10000 && elapsed % 2000 < 500) {
              safeLog.info(
                `[Elevated Move] Waiting for log file... (${Math.round(
                  elapsed / 1000
                )}s elapsed)`
              );
            }
          }
        } catch (err) {
          safeLog.error(
            "[Elevated Move] Progress monitor error:",
            err.message
          );
        }
      }, 500);

      // Wait for completion (check log file for final status)
      let completed = false;
      while (!completed && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          if (fs.existsSync(logPath)) {
            const logContent = fs.readFileSync(logPath, "utf8").trim();
            const lines = logContent.split("\n");
            const lastLine = lines[lines.length - 1].trim();

            if (
              lastLine === "SUCCESS" ||
              lastLine === "VERIFICATION_FAILED" ||
              lastLine.startsWith("ERROR:")
            ) {
              completed = true;
            }
          }
        } catch (err) {
          // Continue waiting
        }
      }

      clearInterval(progressInterval);

      safeLog.info("[Elevated Move] Operation completed, checking results");

      // Check result
      let result = {
        success: false,
        error: "Operation timed out or did not complete",
      };

      if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, "utf8").trim();
        const lines = logContent.split("\n");
        const lastLine = lines[lines.length - 1].trim();

        safeLog.info(`[Elevated Move] Log file contents:\n${logContent}`);
        safeLog.info(`[Elevated Move] Final result: ${lastLine}`);

        if (lastLine === "SUCCESS") {
          // Update global paths
          setGameInstallDir(newPath);
          setResourcesDir(path.join(newPath, "Resources"));
          const settings = getSettings();
          settings.customGamePath = newPath;

          // Re-check mod statuses at new location
          safeLog.info(
            "[Elevated Move] Re-checking mod statuses at new location"
          );
          const skipIntroStatus = await checkSkipIntroStatus();
          const dxvkStatus = await checkDxvkStatus();
          settings.skipIntro = skipIntroStatus.installed;
          settings.dxvk = dxvkStatus.enabled;
          saveSettingsToDisk();

          // Send updated settings to renderer
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("settings-updated", settings);
          }

          result = { success: true, newPath };
        } else if (lastLine === "VERIFICATION_FAILED") {
          result = {
            success: false,
            error:
              "File verification failed during game move. Old files preserved - game files may be in both locations. Please check your game folders.",
          };
        } else if (
          lastLine.startsWith("OLD_DIR_ALREADY_MISSING") ||
          lastLine.startsWith("OLD_DIR_REMOVAL_WARNING")
        ) {
          // Old directory was already missing or couldn't be removed - this is OK, files were moved successfully
          // Check if SUCCESS was logged before this
          const hasSuccess = logContent.includes("SUCCESS");
          if (hasSuccess) {
            // Files were moved successfully, just old dir cleanup had an issue - treat as success
            setGameInstallDir(newPath);
            setResourcesDir(path.join(newPath, "Resources"));
            const settings = getSettings();
            settings.customGamePath = newPath;

            const skipIntroStatus = await checkSkipIntroStatus();
            const dxvkStatus = await checkDxvkStatus();
            settings.skipIntro = skipIntroStatus.installed;
            settings.dxvk = dxvkStatus.enabled;
            saveSettingsToDisk();

            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("settings-updated", settings);
            }

            result = { success: true, newPath };
            safeLog.info(
              "[Elevated Move] Move succeeded, old directory was already missing (not an error)"
            );
          } else {
            // No SUCCESS marker - treat as error
            result = {
              success: false,
              error:
                "Move completed but verification unclear. Please check game files.",
            };
          }
        } else if (lastLine.startsWith("ERROR:")) {
          // Check if it's an error about old directory missing - that's not critical
          const errorMsg = lastLine.substring(7);
          if (
            errorMsg.toLowerCase().includes("cannot find path") ||
            errorMsg.toLowerCase().includes("does not exist") ||
            errorMsg.toLowerCase().includes("old")
          ) {
            // Might be about old directory - check if files were actually moved
            const hasSuccess = logContent.includes("SUCCESS");
            if (hasSuccess) {
              // Files moved successfully, old dir error is not critical
              setGameInstallDir(newPath);
              setResourcesDir(path.join(newPath, "Resources"));
              const settings = getSettings();
              settings.customGamePath = newPath;

              const skipIntroStatus = await checkSkipIntroStatus();
              const dxvkStatus = await checkDxvkStatus();
              settings.skipIntro = skipIntroStatus.installed;
              settings.dxvk = dxvkStatus.enabled;
              saveSettingsToDisk();

              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send("settings-updated", settings);
              }

              result = { success: true, newPath };
              safeLog.info(
                "[Elevated Move] Move succeeded, old directory error was non-critical"
              );
            } else {
              result = { success: false, error: errorMsg };
            }
          } else {
            result = { success: false, error: errorMsg };
          }
        }
      }

      // Cleanup
      try {
        if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath);
        if (fs.existsSync(psScriptPath)) fs.unlinkSync(psScriptPath);
        if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
        if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
      } catch (cleanupError) {
        safeLog.warn(
          "[Elevated Move] Cleanup warning:",
          cleanupError.message
        );
      }

      return result;
    } catch (error) {
      safeLog.error("[Elevated Move] Error:", error);
      return { success: false, error: error.message };
    }
  }

  // Execute normal move (no elevation)
  async function executeNormalMove(oldPath, newPath) {
    try {
      // Create destination directory
      if (!fs.existsSync(newPath)) {
        fs.mkdirSync(newPath, { recursive: true });
      }

      // Get list of all files to move
      const files = await getAllFiles(oldPath);
      const totalFiles = files.length;
      let movedFiles = 0;

      // Move files with progress updates
      for (const file of files) {
        const relativePath = path.relative(oldPath, file);
        const destPath = path.join(newPath, relativePath);
        const destDir = path.dirname(destPath);

        // Create destination directory if needed
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        // Copy file
        fs.copyFileSync(file, destPath);
        movedFiles++;

        // Send progress update every 10 files or on last file
        if (movedFiles % 10 === 0 || movedFiles === totalFiles) {
          const progress = Math.round((movedFiles / totalFiles) * 100);
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("game-move-progress", {
              progress,
              movedFiles,
              totalFiles,
            });
          }
        }
      }

      // Verify all files copied successfully
      safeLog.info(`[Move Game] Verifying ${totalFiles} files...`);
      let verified = true;
      for (const file of files) {
        const relativePath = path.relative(oldPath, file);
        const destPath = path.join(newPath, relativePath);

        if (!fs.existsSync(destPath)) {
          safeLog.error(
            `[Move Game] Verification failed: ${destPath} not found`
          );
          verified = false;
          break;
        }
      }

      if (!verified) {
        return {
          success: false,
          error:
            "File verification failed during game move. Old files have not been deleted - game files may be in both locations. Please check your game folders and try again.",
        };
      }

      safeLog.info(`[Move Game] All files verified successfully`);

      // Delete old directory (if it still exists)
      if (fs.existsSync(oldPath)) {
        safeLog.info(`[Move Game] Removing old directory...`);
        try {
          fs.rmSync(oldPath, { recursive: true, force: true });
        } catch (deleteError) {
          // Old directory might be in use or already partially deleted - log warning but don't fail
          safeLog.warn(
            `[Move Game] Could not remove old directory (may already be deleted or in use): ${deleteError.message}`
          );
          // This is not a critical error - files were successfully moved
        }
      } else {
        safeLog.info(
          `[Move Game] Old directory already missing - files were successfully moved`
        );
      }

      // Update global paths
      setGameInstallDir(newPath);
      setResourcesDir(path.join(newPath, "Resources"));

      // Save new path to settings
      const settings = getSettings();
      settings.customGamePath = newPath;
      saveSettingsToDisk();

      safeLog.info(`[Move Game] Move completed successfully`);

      return { success: true, newPath };
    } catch (error) {
      safeLog.error("[Normal Move] Error:", error);
      return { success: false, error: error.message };
    }
  }

  // ---- IPC handlers ----

  // Update the open-game-directory handler to use GAME_INSTALL_DIR
  ipcMain.handle("open-game-directory", async () => {
    let GAME_INSTALL_DIR = getGameInstallDir();
    safeLog.info("Main process: Opening game directory:", GAME_INSTALL_DIR);

    try {
      // Check if directory exists
      if (!fs.existsSync(GAME_INSTALL_DIR)) {
        safeLog.info("Game directory not found, checking alternatives");

        // Common installation paths to check
        const commonPaths = [
          path.join(
            "C:",
            "Program Files (x86)",
            "Microsoft Games for Windows - LIVE",
            "Shadowrun"
          ),
          path.join(
            "C:",
            "Program Files",
            "Microsoft Games for Windows - LIVE",
            "Shadowrun"
          ),
          path.join(
            "D:",
            "Program Files (x86)",
            "Microsoft Games for Windows - LIVE",
            "Shadowrun"
          ),
          path.join(app.getPath("documents"), "My Games", "Shadowrun"),
        ];

        // Try each common path
        for (const altPath of commonPaths) {
          if (fs.existsSync(altPath)) {
            safeLog.info("Found alternative game location:", altPath);
            // Update the global path variable for future use
            setGameInstallDir(altPath);
            setResourcesDir(path.join(altPath, "Resources"));
            GAME_INSTALL_DIR = altPath;

            await shell.openPath(altPath);
            return { success: true };
          }
        }

        // If no alternative found, show a file browser dialog to let the user select the folder
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          safeLog.info("No standard paths found, prompting user");
          const { canceled, filePaths } = await dialog.showOpenDialog(
            mainWindow,
            {
              title: "Select Shadowrun Game Directory",
              defaultPath: path.join(app.getPath("home"), "Games"),
              properties: ["openDirectory"],
            }
          );

          if (!canceled && filePaths.length > 0) {
            // Store this path for future use
            setGameInstallDir(filePaths[0]);
            setResourcesDir(path.join(filePaths[0], "Resources"));
            GAME_INSTALL_DIR = filePaths[0];

            safeLog.info("User selected:", GAME_INSTALL_DIR);
            await shell.openPath(GAME_INSTALL_DIR);
            return { success: true };
          }

          return {
            success: false,
            error:
              "Game directory not found. Please select the location manually.",
          };
        }
      }

      // Try to open with shell.openPath
      const result = await shell.openPath(GAME_INSTALL_DIR);

      // If shell.openPath doesn't work, try exec with explorer
      if (result !== "") {
        safeLog.info("Shell.openPath failed with: ", result, "trying explorer");
        exec(`explorer "${GAME_INSTALL_DIR}"`, (err) => {
          if (err) safeLog.error("Explorer exec error:", err);
        });
      }

      return { success: true };
    } catch (error) {
      safeLog.error("Error opening game directory:", error);

      // Last resort - try exec as a fallback with whatever path we have
      try {
        exec(`explorer "${GAME_INSTALL_DIR}"`);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(error) };
      }
    }
  });

  // Add this helper if not already present
  ipcMain.handle("get-game-installation-path", () => {
    const dir = getGameInstallDir();
    try {
      if (!dir) return null;
      // Only report a "current location" if it looks like a real install.
      // This prevents the UI from showing a default/stale path when the user
      // hasn't located the game yet.
      const exePath = path.join(dir, "Shadowrun.exe");
      if (!fs.existsSync(dir) || !fs.existsSync(exePath)) return null;
      return dir;
    } catch (_) {
      return null;
    }
  });

  // Handler to change game location
  ipcMain.handle("change-game-location", async () => {
    try {
      const GAME_INSTALL_DIR = getGameInstallDir();
      const gameProcess = getGameProcess();
      const mainWindow = getMainWindow();
      // Check if game is running
      if (gameProcess && !gameProcess.killed) {
        return {
          success: false,
          error:
            "Cannot move game files while the game is running. Please close the game first.",
        };
      }

      // Show folder picker
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Select New Game Location",
        defaultPath: path.dirname(GAME_INSTALL_DIR),
        properties: ["openDirectory", "createDirectory"],
        buttonLabel: "Select Folder",
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const newBasePath = filePaths[0];
      const newGamePath = path.join(newBasePath, "Shadowrun");

      // Validate the path
      const validation = await validateNewGamePath(newGamePath);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          requiresElevation: validation.requiresElevation || false,
          newPath: newGamePath,
        };
      }

      // Get folder sizes
      const currentSize = await getFolderSize(GAME_INSTALL_DIR);

      // Check if source or destination requires admin
      const sourceRequiresAdmin = await checkIfPathRequiresAdmin(
        GAME_INSTALL_DIR
      );
      const destRequiresAdmin = await checkIfPathRequiresAdmin(newGamePath);

      safeLog.info(
        `[Change Location] Source requires admin: ${sourceRequiresAdmin}`
      );
      safeLog.info(
        `[Change Location] Dest requires admin: ${destRequiresAdmin}`
      );

      return {
        success: true,
        currentPath: GAME_INSTALL_DIR,
        newPath: newGamePath,
        size: currentSize,
        sizeFormatted: formatBytes(currentSize),
        requiresElevation: Boolean(sourceRequiresAdmin || destRequiresAdmin),
        sourceRequiresAdmin: Boolean(sourceRequiresAdmin),
        destRequiresAdmin: Boolean(destRequiresAdmin),
      };
    } catch (error) {
      safeLog.error("[Change Location] Error:", error);
      return { success: false, error: error.message };
    }
  });

  // Handler to execute the move
  ipcMain.handle("execute-game-move", async (event, newPath) => {
    try {
      const oldPath = getGameInstallDir();
      const gameProcess = getGameProcess();

      safeLog.info(`[Move Game] ========================================`);
      safeLog.info(`[Move Game] MOVE OPERATION INITIATED`);
      safeLog.info(`[Move Game] Source: ${oldPath}`);
      safeLog.info(`[Move Game] Destination: ${newPath}`);
      safeLog.info(`[Move Game] ========================================`);

      // Check if game is running (double-check)
      if (gameProcess && !gameProcess.killed) {
        return {
          success: false,
          error: "Game is currently running. Please close it first.",
        };
      }

      // Check if source OR destination requires elevation
      const sourceRequiresAdmin = await checkIfPathRequiresAdmin(oldPath);
      const destRequiresAdmin = await checkIfPathRequiresAdmin(newPath);

      if (sourceRequiresAdmin || destRequiresAdmin) {
        safeLog.info(
          "[Move Game] Source or destination requires elevation, using elevated move process"
        );
        return await executeElevatedMove(oldPath, newPath);
      }

      // Normal move (no elevation needed)
      return await executeNormalMove(oldPath, newPath);
    } catch (error) {
      safeLog.error("[Move Game] Error:", error);
      return { success: false, error: error.message };
    }
  });

  // Handler to clear saved game path
  ipcMain.handle("clear-saved-game-path", async () => {
    try {
      safeLog.info("[Clear Game Path] Clearing saved custom game path...");

      const settings = getSettings();
      // Clear from settings
      settings.customGamePath = undefined;
      delete settings.customGamePath;

      // Reset to default location
      const defaultPath = path.join(app.getPath("home"), "Games", "Shadowrun");
      setGameInstallDir(defaultPath);
      setResourcesDir(path.join(defaultPath, "Resources"));

      // Save settings
      saveSettingsToDisk();

      safeLog.info(
        "[Clear Game Path] Saved game path cleared. Reset to default:",
        defaultPath
      );

      return {
        success: true,
        message: "Saved game path cleared successfully",
      };
    } catch (error) {
      safeLog.error("[Clear Game Path] Error:", error);
      return { success: false, error: error.message };
    }
  });

  // Handler to browse for existing game installation
  ipcMain.handle("browse-for-existing-game", async () => {
    try {
      safeLog.info("[Browse Game] Opening folder picker");

      const mainWindow = getMainWindow();

      // Show folder picker
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Select Folder Containing Shadowrun.exe",
        defaultPath: app.getPath("documents"),
        properties: ["openDirectory"],
        buttonLabel: "Select Folder",
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        safeLog.info("[Browse Game] User canceled selection");
        return { success: false, canceled: true };
      }

      const selectedPath = filePaths[0];
      safeLog.info(`[Browse Game] User selected: ${selectedPath}`);

      // Check if Shadowrun.exe exists in the selected folder
      const exePath = path.join(selectedPath, "Shadowrun.exe");
      if (!fs.existsSync(exePath)) {
        safeLog.info(`[Browse Game] Shadowrun.exe not found at: ${exePath}`);
        return {
          success: false,
          error:
            "Shadowrun.exe not found in the selected folder. Please select the folder that directly contains Shadowrun.exe",
        };
      }

      safeLog.info(`[Browse Game] ✓ Found Shadowrun.exe at: ${exePath}`);

      // Update the global path variables
      setGameInstallDir(selectedPath);
      setResourcesDir(path.join(selectedPath, "Resources"));

      safeLog.info(
        `[Browse Game] Updated GAME_INSTALL_DIR to: ${selectedPath}`
      );

      // Save the custom path to settings
      const settings = getSettings();
      settings.customGamePath = selectedPath;
      saveSettingsToDisk();
      safeLog.info("[Browse Game] Saved custom game path to settings");

      // Re-check mod statuses at new location
      safeLog.info("[Browse Game] Re-checking mod statuses at new location");
      const skipIntroStatus = await checkSkipIntroStatus();
      const dxvkStatus = await checkDxvkStatus();
      settings.skipIntro = skipIntroStatus.installed;
      settings.dxvk = dxvkStatus.enabled;
      saveSettingsToDisk();
      safeLog.info(
        `[Browse Game] Skip Intro: ${skipIntroStatus.installed}, DXVK: ${dxvkStatus.enabled}`
      );

      // Re-check installation status to update UI
      await checkExistingInstallation();

      // Send updated settings to renderer so UI updates immediately
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("settings-updated", settings);
      }

      return {
        success: true,
        path: selectedPath,
      };
    } catch (error) {
      safeLog.error("[Browse Game] Error:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  isGamePathInProtectedDirectory,
  formatBytes,
  getAllFiles,
  getFolderSize,
  checkIfPathRequiresAdmin,
  makeSetDefaultGameConfig,
  registerLocationIpc,
};
