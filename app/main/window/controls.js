/**
 * Window-control IPC handlers (minimize / close / drag / move).
 *
 * The renderer drives a custom titlebar (the Electron window is frameless),
 * so the chrome buttons and drag region all round-trip through these IPC
 * channels. They were previously inlined in app/main.js at five different
 * places; consolidating them here keeps the main bootstrapper thin and
 * makes the window contract easy to audit in one shot.
 *
 * The handlers depend on two pieces of caller-owned state:
 *   - the active mainWindow BrowserWindow reference
 *   - whether a game is currently running (used to block "close-window")
 *
 * Both are passed in as accessor callbacks rather than imported globals, so
 * this module stays decoupled from main.js's mutable state.
 */

const { ipcMain } = require("electron");
const { safeLog } = require("../logger");

/**
 * Register all window-control IPC handlers.
 *
 * Should be called exactly once during main-process boot. Returns an
 * `unregister` function for symmetry / future hot-reload use; the launcher
 * doesn't currently need it but keeping the affordance avoids the
 * "register-only" anti-pattern.
 *
 * @param {object} options
 * @param {() => import('electron').BrowserWindow | null} options.getMainWindow
 *   Returns the active main BrowserWindow, or null if it has been destroyed.
 * @param {() => boolean} options.isGameRunning Returns true if a game process
 *   is currently tracked.
 * @returns {() => void} Unregister function.
 */
function registerWindowControls({ getMainWindow, isGameRunning }) {
  ipcMain.handle("minimize-window", () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      return false;
    }
    win.minimize();
    return true;
  });

  ipcMain.handle("close-window", () => {
    const win = getMainWindow();

    // Refuse to close while the game is running so the user doesn't lose
    // their session; surface a notification so the failure mode is obvious.
    if (isGameRunning()) {
      safeLog.info(
        "Close window requested but game is running. Denying request."
      );

      if (win && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send("show-notification", {
          message:
            "Cannot close launcher while the game is running. Exit the game first.",
          type: "warning",
        });
      }

      return { success: false, reason: "game-running" };
    }

    if (!win || win.isDestroyed()) {
      return { success: false, reason: "no-window" };
    }

    win.close();
    return { success: true };
  });

  // Custom-titlebar drag plumbing. The renderer pings these on mousedown
  // / mousemove inside the drag region; we just keep the window movable
  // and ensure it stays focused. Heavy lifting (cursor tracking) is done
  // by Electron itself once setMovable(true) is in effect.
  ipcMain.handle("start-drag", () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      return { success: false };
    }
    win.setMovable(true);
    return { success: true };
  });

  ipcMain.on("perform-drag", () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    win.moveTop();
    win.focus();
  });

  ipcMain.handle("move-window", (_event, deltaX, deltaY) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) {
      return { success: false };
    }
    const [x, y] = win.getPosition();
    win.setPosition(x + deltaX, y + deltaY);
    return { success: true };
  });

  return function unregister() {
    ipcMain.removeHandler("minimize-window");
    ipcMain.removeHandler("close-window");
    ipcMain.removeHandler("start-drag");
    ipcMain.removeHandler("move-window");
    ipcMain.removeAllListeners("perform-drag");
  };
}

module.exports = { registerWindowControls };
