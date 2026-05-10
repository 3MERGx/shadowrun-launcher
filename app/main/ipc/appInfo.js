// "App info" / OS-level IPC handlers (Phase 10).
//
// Handlers registered:
//   get-version          - app version from package.json (via app.getVersion())
//   get-changelog        - reads bundled changelog.json (multi-path probe;
//                          renderer falls back to fetching from server when
//                          we return success: false)
//   show-notification    - main->renderer pass-through for toasts
//   ping-main            - simple IPC heartbeat used for "is the bridge
//                          alive?" diagnostics from the renderer
//   show-logs            - opens the active main.log in the OS default
//                          viewer (with explorer fallback)
//   restart-as-admin     - writes a single-shot elevation .bat, spawns it,
//                          then quits the launcher so PowerShell's
//                          Start-Process -Verb RunAs can prompt UAC and
//                          relaunch the same exe with admin rights.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { app, dialog, shell } = require("electron");
const { safeLog, getLogFilePath } = require("../logger");
const { fetchPlayerStats } = require("../services/playerTrackerStats");

function registerAppInfoIpc(deps) {
  const { ipcMain, getMainWindow, cleanupBeforeQuit } = deps;

  // Add handler to get version number
  ipcMain.handle("get-version", async () => {
    try {
      // Get version from package.json (via Electron's app.getVersion())
      const version = app.getVersion();
      return { success: true, version };
    } catch (error) {
      safeLog.error("Error fetching version:", error);
      return { success: false, version: "1.0.0" };
    }
  });

  // Handle getting changelog (tries local file first for dev, then server)
  ipcMain.handle("get-changelog", async () => {
    try {
      // Try multiple paths for changelog.json
      const possiblePaths = [
        // Dev / unpacked app (project root)
        path.join(app.getAppPath(), "changelog.json"),
        // Packaged app: electron-builder places extraResources into the resources folder
        path.join(process.resourcesPath || "", "changelog.json"),
        // Alternative path for packaged app
        path.join(__dirname, "..", "..", "..", "changelog.json"),
        // Another alternative (app.asar parent)
        path.join(path.dirname(app.getAppPath()), "changelog.json"),
      ];

      for (const changelogPath of possiblePaths) {
        if (changelogPath && fs.existsSync(changelogPath)) {
          try {
            const changelogData = fs.readFileSync(changelogPath, "utf8");
            safeLog.info(`[Changelog] Found at: ${changelogPath}`);
            return {
              success: true,
              data: JSON.parse(changelogData),
              source: "local",
            };
          } catch (readError) {
            safeLog.warn(
              `[Changelog] Error reading ${changelogPath}:`,
              readError.message
            );
            continue;
          }
        }
      }

      // If no local/resource changelog, signal fallback to server
      safeLog.info(
        "[Changelog] Local/resource file not found in any path, trying server..."
      );
      return {
        success: false,
        message: "Changelog not found locally. Fetching from server...",
      };
    } catch (error) {
      safeLog.error("[Changelog] Error reading changelog:", error);
      return { success: false, message: error.message };
    }
  });

  // Forward show-notification requests from one renderer (e.g. settings) to
  // the main BrowserWindow so the toast appears via the same code path the
  // launcher uses elsewhere.
  ipcMain.handle("show-notification", (event, data) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("show-notification", data);
    }
    return { success: true };
  });

  // Add this simple handler to test IPC
  ipcMain.handle("ping-main", async () => {
    safeLog.info("Ping received from renderer!");
    return { success: true, message: "Pong from main process!" };
  });

  // Live player counts from Railway /api/stats (GET; used on first paint before heartbeat returns)
  ipcMain.handle("get-player-count", async () => {
    try {
      const stats = await fetchPlayerStats();
      if (!stats) {
        return { success: false, inGame: null, totalOnline: null };
      }
      const payload = {
        success: true,
        inGame: stats.inGame,
        totalOnline: stats.totalOnline,
      };
      if (
        typeof stats.inGameAhl === "number" &&
        typeof stats.inGameGfwl === "number" &&
        typeof stats.inGameUnknown === "number"
      ) {
        payload.inGameAhl = stats.inGameAhl;
        payload.inGameGfwl = stats.inGameGfwl;
        payload.inGameUnknown = stats.inGameUnknown;
      }
      return payload;
    } catch (error) {
      safeLog.warn("[IPC] get-player-count failed:", error.message);
      return { success: false, inGame: null, totalOnline: null };
    }
  });

  // Open the active main.log file (electron-log) in the OS default editor.
  // Users hitting "Show Logs" can grab the file directly to send to support.
  ipcMain.handle("show-logs", async () => {
    try {
      const logPath = getLogFilePath();
      if (!logPath) {
        dialog.showErrorBox(
          "Logs unavailable",
          "Could not determine the log file location. Please report this issue."
        );
        return { success: false, error: "Log path unavailable" };
      }

      // Open the parent folder so users can also see main.old.log if it has rotated.
      const result = await shell.openPath(logPath);
      if (result) {
        // shell.openPath returns a non-empty error string on failure.
        safeLog.warn(`[Show Logs] openPath returned: ${result}`);
        // Fall back to revealing the file in Explorer.
        shell.showItemInFolder(logPath);
      }

      return { success: true, path: logPath };
    } catch (error) {
      safeLog.error("Error showing logs", error);
      return { success: false, error: error.message };
    }
  });

  // Add this handler
  ipcMain.handle("restart-as-admin", async () => {
    // Create a batch file to elevate privileges
    const batchPath = path.join(os.tmpdir(), "elevate.bat");
    const appPath = process.execPath;

    const batchContent = `
@echo off
echo Requesting administrator privileges...
powershell -Command "Start-Process -FilePath '${appPath.replace(
      /\\/g,
      "\\\\"
    )}' -Verb RunAs"
exit
  `;

    try {
      fs.writeFileSync(batchPath, batchContent);
      spawn("cmd.exe", ["/c", batchPath], { detached: true });
      // Clean up before restarting with elevated permissions
      safeLog.info("[Restart] Cleaning up before restart as admin...");
      if (cleanupBeforeQuit) cleanupBeforeQuit();
      app.quit();
      return { success: true };
    } catch (error) {
      safeLog.error("Error creating elevation script:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerAppInfoIpc };
