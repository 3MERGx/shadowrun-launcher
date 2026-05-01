// Auto-updater orchestration (Phase 9).
//
// Owns the entire electron-updater integration that used to live inline in
// app/main.js: feed URL configuration, autoUpdater.* event listeners,
// the manual + automatic update flows, the rollback flow, and the
// renderer-facing IPC handlers.
//
// Single entry point: setupUpdater(deps) returns a small public API the
// rest of main.js can call:
//
//   - checkForUpdates(manual?)         -> kick off an update check, used
//                                         by the boot timer and the
//                                         "check-for-updates" IPC handler
//   - checkForFailedInstallation()     -> startup probe that detects when
//                                         a previously-pending update
//                                         failed to install
//   - getUpdateInfo()                  -> { updateAvailable, latestVersion }
//                                         consumed by Discord RPC for the
//                                         "Update: vX -> vY" footer
//   - bumpUpdateFromFallback(version)  -> Discord RPC fallback: when peers
//                                         report a higher version than us,
//                                         flip the update banner even if
//                                         autoUpdater hasn't fired yet
//
// All previously-global mutable state (updateAvailable, latestVersion,
// pendingUpdateInfo, updateDownloadInProgress, updateDownloadTimeout,
// lastUpdateProgress, isManualUpdateCheck) lives as closure-locals inside
// setupUpdater so main.js never sees it.

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { exec } = require("child_process");
const { app } = require("electron");
const { autoUpdater } = require("electron-updater");
const { safeLog } = require("../logger");
const { UPDATE_SERVER_URL, UPDATE_TIMEOUT_MS } = require("../config/constants");

// Compare semantic versions (returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2)
function compareVersions(v1, v2) {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

// Check for rollback configuration. Pulled out as a free function because
// it has no DI dependencies - it just hits the rollback URL and returns a
// JSON config object (or { enabled: false } on any error).
async function checkRollbackConfig() {
  return new Promise((resolve) => {
    const rollbackUrl = `${UPDATE_SERVER_URL}/rollback.json`;
    safeLog.info("[Rollback] Checking rollback config:", rollbackUrl);

    const protocol = rollbackUrl.startsWith("https") ? https : http;
    protocol
      .get(rollbackUrl, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const config = JSON.parse(data);
            safeLog.info("[Rollback] Config loaded:", config);
            resolve(config);
          } catch (error) {
            safeLog.error("[Rollback] Failed to parse config:", error);
            resolve({ enabled: false });
          }
        });
      })
      .on("error", (error) => {
        safeLog.error("[Rollback] Failed to fetch config:", error);
        resolve({ enabled: false });
      });
  });
}

function setupUpdater(deps) {
  const {
    ipcMain,
    getMainWindow,
    getSettings,
    saveSettingsToDisk,
    cleanupBeforeQuit,
    refreshDiscord,
  } = deps;

  // ---- Encapsulated mutable state ----

  // Update availability flags consumed by Discord RPC's "Update: vX -> vY"
  // footer (and exposed via getUpdateInfo()).
  let updateAvailable = false;
  let latestVersion = null;

  // Download tracking. updateDownloadTimeout fires UPDATE_TIMEOUT_MS after
  // the last observed transferred-byte increase to detect stalled
  // downloads, which electron-updater can't surface natively.
  let updateDownloadInProgress = false;
  let updateDownloadTimeout = null;
  let lastUpdateProgress = { transferred: 0, time: Date.now() };

  // Cached info from the most recent "update-available" event so we can
  // re-show the dialog on retry, build a manual download URL, and so on.
  let pendingUpdateInfo = null;

  // Whether the in-flight check was manual (button) or automatic (boot
  // timer). Used by the "update-not-available" handler to suppress the
  // "you're up to date" toast for automatic checks.
  let isManualUpdateCheck = false;

  // ---- One-time autoUpdater configuration ----

  autoUpdater.setFeedURL({
    provider: "generic",
    url: UPDATE_SERVER_URL,
  });

  // Configure auto-updater logging (route through safeLog -> main.log)
  autoUpdater.logger = {
    info: (msg) => safeLog.info("[Updater]", msg),
    warn: (msg) => safeLog.warn(`[Updater] ${msg}`),
    error: (msg) => safeLog.error(`[Updater] ${msg}`),
    debug: (msg) => safeLog.debug("[Updater]", msg),
  };

  // Auto-updater options
  autoUpdater.autoDownload = false; // We'll control when to download
  autoUpdater.autoInstallOnAppQuit = true; // Install update when app quits

  // ---- Helpers ----

  // Check if a previous update installation failed
  function checkForFailedInstallation() {
    try {
      const settings = getSettings();
      const currentVersion = app.getVersion();
      const pendingVersion = settings.pendingUpdateVersion;

      // Clean up stale update marker file (if it exists)
      const updateMarkerPath = path.join(
        app.getPath("userData"),
        ".update-in-progress"
      );
      if (fs.existsSync(updateMarkerPath)) {
        try {
          const markerData = JSON.parse(
            fs.readFileSync(updateMarkerPath, "utf8")
          );
          safeLog.info(
            `[Updater] Found stale update marker file (version: ${
              markerData.version
            }, timestamp: ${new Date(markerData.timestamp).toLocaleString()})`
          );
          fs.unlinkSync(updateMarkerPath);
          safeLog.info("[Updater] Cleaned up stale update marker file");
        } catch (e) {
          safeLog.warn("[Updater] Failed to clean up marker file:", e);
          // Try to delete it anyway
          try {
            fs.unlinkSync(updateMarkerPath);
          } catch (e2) {
            // Ignore
          }
        }
      }

      const mainWindow = getMainWindow();
      if (pendingVersion && pendingVersion !== currentVersion) {
        safeLog.error(
          `[Updater] Installation failure detected - Expected v${pendingVersion}, but still on v${currentVersion}`
        );

        // Clear pending version
        delete settings.pendingUpdateVersion;
        saveSettingsToDisk();

        // Notify user of installation failure
        if (mainWindow && !mainWindow.isDestroyed()) {
          setTimeout(() => {
            mainWindow.webContents.send("update-installation-failed", {
              expectedVersion: pendingVersion,
              currentVersion: currentVersion,
              message: `Update to v${pendingVersion} failed to install. You're still on v${currentVersion}.`,
            });
          }, 3000); // Wait for UI to be ready
        }
      } else if (pendingVersion && pendingVersion === currentVersion) {
        safeLog.info(
          `[Updater] ✅ Update installed successfully - Now on v${currentVersion}`
        );

        // Clear pending version
        delete settings.pendingUpdateVersion;
        saveSettingsToDisk();

        // Show success toast
        if (mainWindow && !mainWindow.isDestroyed()) {
          setTimeout(() => {
            mainWindow.webContents.send("update-installation-success", {
              version: currentVersion,
            });
          }, 2000);
        }
      }
    } catch (error) {
      safeLog.error(
        "[Updater] Error checking for failed installation:",
        error
      );
    }
  }

  // Function to check for updates
  function checkForUpdates(manual = false) {
    isManualUpdateCheck = manual;

    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      // Typical on quit when a deferred check runs after the window is gone — not actionable.
      safeLog.verbose("[Updater] Main window not ready, skipping update check");
      return;
    }

    safeLog.info(
      `[Updater] Checking for updates... (${manual ? "MANUAL" : "AUTOMATIC"})`
    );
    safeLog.info("[Updater] Current version:", app.getVersion());
    safeLog.info("[Updater] Update server:", UPDATE_SERVER_URL);

    // Check for updates
    autoUpdater.checkForUpdates().catch((error) => {
      safeLog.error("[Updater] Error checking for updates:", error);
      // Silently fail - don't bother the user if update check fails
    });
  }

  // Force download a specific version (for rollback)
  async function forceVersionDownload(targetVersion, reason) {
    const currentVersion = app.getVersion();
    const comparison = compareVersions(currentVersion, targetVersion);

    safeLog.info(
      `[Rollback] Version comparison: ${currentVersion} vs ${targetVersion}`
    );

    const mainWindow = getMainWindow();

    // Only rollback if current version is NEWER than target
    if (comparison <= 0) {
      safeLog.info(
        "[Rollback] User is already on target version or older - skipping rollback"
      );
      // Send message to renderer that they're up to date
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("update-not-available-feedback", {
          version: currentVersion,
        });
      }
      return false;
    }

    const updateUrl = `${UPDATE_SERVER_URL}/Shadowrun%20FPS%20Launcher%20Setup%20${targetVersion}.exe`;
    safeLog.info("[Rollback] Forcing download of version:", targetVersion);

    // Send rollback dialog to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("show-rollback-dialog", {
        currentVersion: currentVersion,
        targetVersion,
        reason,
        downloadUrl: updateUrl,
      });
    }

    return true;
  }

  // ---- autoUpdater events ----

  // When update is available
  autoUpdater.on("update-available", (info) => {
    safeLog.info("[Updater] Update available:", info.version);
    safeLog.info("[Updater] Release notes:", info.releaseNotes);

    // Track for Discord RPC
    updateAvailable = true;
    latestVersion = info.version;

    // Store update info for potential retry
    pendingUpdateInfo = {
      version: info.version,
      releaseNotes: info.releaseNotes,
      currentVersion: app.getVersion(),
    };

    // Re-render the current Discord activity so the version footer flips to
    // the "Update: vX -> vY" string. discordRpc.refresh() preserves the
    // current playing/idle state - it never flips it.
    if (refreshDiscord) refreshDiscord();

    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      safeLog.info(
        "[Updater] Main window not available - update will be shown on next launch"
      );
      return;
    }

    // Always show the confirmation dialog (both manual and automatic checks)
    // User must confirm before downloading
    safeLog.info(
      `[Updater] ${
        isManualUpdateCheck ? "Manual" : "Automatic"
      } check - showing confirmation dialog`
    );
    mainWindow.webContents.send("show-update-dialog", pendingUpdateInfo);
  });

  // When no update is available
  autoUpdater.on("update-not-available", (info) => {
    safeLog.info(
      "[Updater] No update available. Current version is latest:",
      info?.version || app.getVersion()
    );

    // Clear update tracking
    updateAvailable = false;
    latestVersion = null;

    // Re-render Discord activity now that the update banner is cleared.
    if (refreshDiscord) refreshDiscord();

    const mainWindow = getMainWindow();
    // Send to renderer for UI feedback
    if (isManualUpdateCheck && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-not-available", {
        version: info?.version || app.getVersion(),
      });
    }
  });

  // Download progress
  autoUpdater.on("download-progress", (progressObj) => {
    // Calculate percent manually if not provided or is 0/invalid
    // This ensures progress always updates correctly, even when electron-updater
    // doesn't provide a percent value or provides it inconsistently
    let percent = progressObj.percent;

    // Always prefer calculated value if we have valid transferred/total
    // This is more reliable than trusting the percent property
    if (
      progressObj.transferred !== undefined &&
      progressObj.transferred !== null &&
      progressObj.total !== undefined &&
      progressObj.total !== null &&
      progressObj.total > 0
    ) {
      const calculatedPercent =
        (progressObj.transferred / progressObj.total) * 100;

      // Use calculated value if:
      // 1. percent is missing/invalid, OR
      // 2. percent is 0 but we have transferred bytes (download has started)
      if (
        !percent ||
        percent === 0 ||
        isNaN(percent) ||
        (percent === 0 && progressObj.transferred > 0)
      ) {
        percent = calculatedPercent;
      } else {
        // If both are available, use the calculated one for consistency
        // (calculated is more accurate as it's based on actual bytes)
        percent = calculatedPercent;
      }
    } else if (!percent || isNaN(percent)) {
      // If we can't calculate and percent is invalid, default to 0
      percent = 0;
    }

    const roundedPercent = Math.max(0, Math.min(100, Math.round(percent))); // Clamp between 0-100
    const logMessage = `[Updater] Download progress: ${roundedPercent}% (${
      progressObj.transferred || 0
    }/${progressObj.total || 0})`;
    safeLog.info(logMessage);

    // Track progress for timeout detection
    const now = Date.now();
    const transferred = progressObj.transferred || 0;

    const mainWindow = getMainWindow();

    // Check if progress has actually increased
    if (transferred > lastUpdateProgress.transferred) {
      // Progress detected - reset timeout
      lastUpdateProgress = { transferred, time: now };

      // Clear and restart timeout
      if (updateDownloadTimeout) {
        clearTimeout(updateDownloadTimeout);
      }

      updateDownloadTimeout = setTimeout(() => {
        safeLog.error("[Updater] Download timeout - no progress for 3 minutes");

        // Send timeout error to renderer
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("update-error", {
            message:
              "Download timed out. Your connection may be too slow or unstable. Please try again.",
            type: "timeout",
            canRetry: true,
            updateInfo: pendingUpdateInfo,
          });
        }

        // Cancel the download (electron-updater doesn't have a native cancel, so we restart the app)
        updateDownloadInProgress = false;
        updateDownloadTimeout = null;
      }, UPDATE_TIMEOUT_MS);
    } else if (now - lastUpdateProgress.time > UPDATE_TIMEOUT_MS) {
      // Already timed out - don't send duplicate error
      safeLog.info(
        "[Updater] Download already timed out, ignoring progress event"
      );
      return;
    }

    // Send progress to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-download-progress", {
        percent: roundedPercent,
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0,
      });
    }
  });

  // When update is downloaded
  autoUpdater.on("update-downloaded", (info) => {
    safeLog.info("[Updater] Update downloaded, ready to install");
    safeLog.info("[Updater] New version:", info.version);

    // Clear download state and timeouts
    updateDownloadInProgress = false;
    if (updateDownloadTimeout) {
      clearTimeout(updateDownloadTimeout);
      updateDownloadTimeout = null;
    }

    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      // Clean up Discord RPC and player tracking before update
      safeLog.info(
        "[Updater] Cleaning up before update install (window destroyed)..."
      );
      if (cleanupBeforeQuit) cleanupBeforeQuit();
      // If window is destroyed, just quit and install
      autoUpdater.quitAndInstall(true, true);
      return;
    }

    // Send toast notification to renderer
    mainWindow.webContents.send("update-downloaded-silent", {
      version: info.version,
    });

    // Auto-install after brief delay (silent one-click install)
    setTimeout(() => {
      safeLog.info("[Updater] Auto-installing update silently...");

      // Store expected version for installation verification
      try {
        const settings = getSettings();
        settings.pendingUpdateVersion = info.version;
        saveSettingsToDisk();
        safeLog.info(`[Updater] Stored pending update version: ${info.version}`);

        // Create a marker file to help installer detect this is an update
        // This is a backup indicator in case other detection methods fail
        const updateMarkerPath = path.join(
          app.getPath("userData"),
          ".update-in-progress"
        );
        try {
          fs.writeFileSync(
            updateMarkerPath,
            JSON.stringify({
              version: info.version,
              timestamp: Date.now(),
              currentVersion: app.getVersion(),
            }),
            "utf8"
          );
          safeLog.info(
            `[Updater] Created update marker file: ${updateMarkerPath}`
          );
        } catch (markerError) {
          safeLog.warn(
            "[Updater] Failed to create update marker file (non-critical):",
            markerError
          );
        }
      } catch (e) {
        safeLog.error("[Updater] Failed to store pending update version:", e);
      }

      // Do not kill the game - installer only updates the launcher. Let the user
      // keep playing; launcher will restart after update and game can stay running.

      // Clean up Discord RPC and player tracking before update
      safeLog.info("[Updater] Cleaning up before update install...");
      if (cleanupBeforeQuit) cleanupBeforeQuit();

      // quitAndInstall(isSilent, isForceRunAfter)
      // true = silent install (no window), true = force run after update
      autoUpdater.quitAndInstall(true, true);
    }, 5000); // 5 second delay so user can read the toast
  });

  // Error handling
  autoUpdater.on("error", (error) => {
    safeLog.error("[Updater] Error:", error);

    // Clear download tracking
    updateDownloadInProgress = false;
    if (updateDownloadTimeout) {
      clearTimeout(updateDownloadTimeout);
      updateDownloadTimeout = null;
    }

    // Determine error type and create user-friendly message
    let errorMessage = "Update failed. Please try again.";
    let errorType = "unknown";

    if (error.message) {
      const msg = error.message.toLowerCase();

      if (
        msg.includes("network") ||
        msg.includes("enotfound") ||
        msg.includes("etimedout")
      ) {
        errorMessage =
          "Network error. Please check your internet connection and try again.";
        errorType = "network";
      } else if (msg.includes("404") || msg.includes("not found")) {
        errorMessage = "Update file not found on server. Please try again later.";
        errorType = "not_found";
      } else if (msg.includes("403") || msg.includes("forbidden")) {
        errorMessage = "Server access denied. Please try again later.";
        errorType = "forbidden";
      } else if (msg.includes("timeout")) {
        errorMessage =
          "Download timed out. Please check your connection and try again.";
        errorType = "timeout";
      } else if (msg.includes("corrupted") || msg.includes("checksum")) {
        errorMessage = "Downloaded file is corrupted. Please try again.";
        errorType = "corrupted";
      } else if (msg.includes("permission") || msg.includes("eacces")) {
        errorMessage =
          "Permission denied. Try running launcher as Administrator.";
        errorType = "permission";
      }
    }

    safeLog.error(`[Updater] Error type: ${errorType} - ${errorMessage}`);

    const mainWindow = getMainWindow();
    // Send error notification to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-error", {
        message: errorMessage,
        type: errorType,
        canRetry: true,
        updateInfo: pendingUpdateInfo, // Include update info for retry
      });
    }
  });

  // ---- IPC handlers ----

  // IPC handler for manual update check (optional - can be triggered from UI)
  ipcMain.handle("check-for-updates", async () => {
    try {
      safeLog.info("");
      safeLog.info("=================================================");
      safeLog.info("🔍 CHECK FOR UPDATES - IPC CALL RECEIVED");
      safeLog.info("=================================================");
      safeLog.info("[Updater] Manual update check requested");
      safeLog.info("[Updater] Time:", new Date().toLocaleTimeString());

      // Check if we're in development mode
      const isDev = !app.isPackaged;

      if (isDev) {
        safeLog.info("[Updater] ==========================================");
        safeLog.info("[Updater] 🔧 DEVELOPMENT MODE - CHECK FOR UPDATES");
        safeLog.info("[Updater] ==========================================");
        safeLog.info(
          "[Updater] Development mode detected - auto-updater disabled"
        );
        safeLog.info(
          `[Updater] In production, this would check: ${UPDATE_SERVER_URL}/latest.yml`
        );

        // Add a small delay so user can see the "Checking..." button state
        await new Promise((resolve) => setTimeout(resolve, 1500));

        safeLog.info("[Updater] Sending dev mode message to renderer...");

        const mainWindow = getMainWindow();
        // Send dev mode message to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("update-check-dev-mode");
        }

        safeLog.info("[Updater] ==========================================");

        return { success: true, devMode: true };
      }

      // First check for rollback config
      const rollbackConfig = await checkRollbackConfig();
      if (rollbackConfig.enabled) {
        safeLog.info(
          "[Rollback] Rollback mode enabled - checking if rollback needed"
        );
        const rollbackTriggered = await forceVersionDownload(
          rollbackConfig.targetVersion,
          rollbackConfig.reason
        );

        // If rollback was shown to user, stop here
        if (rollbackTriggered) {
          return { success: true, devMode: false, rollback: true };
        }

        // If user is already on target version or older, continue to normal update check
        safeLog.info(
          "[Rollback] User already on safe version - checking for normal updates"
        );
      }

      // Production mode - check for normal updates (mark as manual)
      checkForUpdates(true); // true = manual check
      return { success: true, devMode: false, rollback: false };
    } catch (error) {
      safeLog.error("[Updater] Manual update check error:", error);
      return { success: false, error: error.message };
    }
  });

  // Handle rollback download confirmation
  ipcMain.handle("confirm-rollback-download", async (event, downloadUrl) => {
    try {
      safeLog.info("[Rollback] User confirmed rollback download:", downloadUrl);

      // Download the installer and save it
      const downloadPath = path.join(
        app.getPath("temp"),
        "rollback-installer.exe"
      );

      return new Promise((resolve, reject) => {
        const protocol = downloadUrl.startsWith("https") ? https : http;
        const file = fs.createWriteStream(downloadPath);

        protocol
          .get(downloadUrl, (response) => {
            const totalBytes = parseInt(response.headers["content-length"], 10);
            let downloadedBytes = 0;

            response.pipe(file);

            response.on("data", (chunk) => {
              downloadedBytes += chunk.length;
              const progress = (downloadedBytes / totalBytes) * 100;

              const mainWindow = getMainWindow();
              // Send progress to renderer
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(
                  "rollback-download-progress",
                  progress
                );
              }
            });

            file.on("finish", () => {
              file.close(() => {
                safeLog.info(
                  "[Rollback] Download complete, launching installer"
                );

                // Launch the installer
                exec(`"${downloadPath}"`, (error) => {
                  if (error) {
                    safeLog.error(
                      "[Rollback] Failed to launch installer:",
                      error
                    );
                    reject(error);
                  } else {
                    // Clean up before quitting for rollback installation
                    safeLog.info(
                      "[Rollback] Cleaning up before rollback installation..."
                    );
                    if (cleanupBeforeQuit) cleanupBeforeQuit();
                    // Quit the app so installer can proceed
                    app.quit();
                  }
                });

                resolve({ success: true });
              });
            });
          })
          .on("error", (error) => {
            fs.unlink(downloadPath, () => {});
            safeLog.error("[Rollback] Download failed:", error);
            reject(error);
          });
      });
    } catch (error) {
      safeLog.error("[Rollback] Error:", error);
      return { success: false, error: error.message };
    }
  });

  // Handle user confirming update download from custom dialog
  ipcMain.handle("confirm-update-download", async () => {
    try {
      safeLog.info("[Updater] User confirmed update download");

      // Initialize download tracking
      updateDownloadInProgress = true;
      lastUpdateProgress = { transferred: 0, time: Date.now() };

      // Clear any existing timeout
      if (updateDownloadTimeout) {
        clearTimeout(updateDownloadTimeout);
      }

      // Start initial timeout
      updateDownloadTimeout = setTimeout(() => {
        safeLog.error("[Updater] Download timeout - no progress detected");

        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("update-error", {
            message:
              "Download failed to start. Please check your internet connection and try again.",
            type: "timeout",
            canRetry: true,
            updateInfo: pendingUpdateInfo,
          });
        }

        updateDownloadInProgress = false;
        updateDownloadTimeout = null;
      }, UPDATE_TIMEOUT_MS);

      autoUpdater.downloadUpdate();

      const mainWindow = getMainWindow();
      // Show download progress notification
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("update-download-started");
      }

      return { success: true };
    } catch (error) {
      safeLog.error("[Updater] Error starting update download:", error);

      // Clear download state on error
      updateDownloadInProgress = false;
      if (updateDownloadTimeout) {
        clearTimeout(updateDownloadTimeout);
        updateDownloadTimeout = null;
      }

      return { success: false, error: error.message };
    }
  });

  // Handle retry of failed update download
  ipcMain.handle("retry-update-download", async () => {
    try {
      safeLog.info("[Updater] User requested retry of update download");

      if (!pendingUpdateInfo) {
        safeLog.error("[Updater] No pending update info available for retry");
        return { success: false, error: "No update information available" };
      }

      const mainWindow = getMainWindow();
      // Re-show the update dialog so user can confirm again
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("show-update-dialog", pendingUpdateInfo);
      }

      return { success: true };
    } catch (error) {
      safeLog.error("[Updater] Error retrying update:", error);
      return { success: false, error: error.message };
    }
  });

  // Provide manual download URL
  ipcMain.handle("get-manual-download-url", async () => {
    try {
      const version = pendingUpdateInfo?.version || app.getVersion();
      const downloadUrl = `${UPDATE_SERVER_URL}/Shadowrun%20FPS%20Launcher%20Setup%20${version}.exe`;

      return {
        success: true,
        url: downloadUrl,
        version: version,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // IPC handler to get current app version
  ipcMain.handle("get-app-version", async () => {
    return app.getVersion();
  });

  // ---- Public API ----

  return {
    checkForUpdates,
    checkForFailedInstallation,
    getUpdateInfo: () => ({ updateAvailable, latestVersion }),
    bumpUpdateFromFallback: (version) => {
      // Used by the Discord RPC fallback path: peers report a higher
      // version than us, so flip the banner even though autoUpdater
      // hasn't fired update-available yet. Mirrors the original inline
      // behavior of fetchPlayerCount() in app/main.js.
      if (!updateAvailable) {
        updateAvailable = true;
        latestVersion = version;
      }
    },
  };
}

module.exports = { setupUpdater };
