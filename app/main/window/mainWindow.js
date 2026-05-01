/**
 * Main launcher window factory.
 *
 * Pure factory function that builds the BrowserWindow, wires up window-level
 * event handlers (close prevention while game is running, taskbar icon fix,
 * dev-mode DevTools), and returns the window. All cross-cutting concerns
 * (game-process state, cleanup, post-load installation check) are passed in
 * as callbacks so this module stays decoupled from the rest of main.js.
 *
 * Usage from main.js:
 *
 *   const win = createMainWindow({
 *     appDir: __dirname,                              // path to app/
 *     isDevMode: process.argv.includes("--dev"),
 *     isGameRunning: () => gameProcess !== null,
 *     onClosed: () => {
 *       // Kill any orphan game process, run cleanupBeforeQuit(),
 *       // null out mainWindow, etc. Caller-owned because all of these
 *       // touch state that lives in main.js.
 *     },
 *     onReady: () => checkExistingInstallation(),
 *   });
 */

const { BrowserWindow, app } = require("electron");
const path = require("path");
const fs = require("fs");
const { safeLog } = require("../logger");

/**
 * Builds and returns the main launcher BrowserWindow.
 *
 * @param {object} options
 * @param {string} options.appDir Absolute path to the app/ directory (used to
 *   resolve preload, icon, and renderer file paths).
 * @param {boolean} options.isDevMode Whether to open DevTools and bind F12.
 * @param {() => boolean} options.isGameRunning Returns true if the game is
 *   currently running. Used to block window close while in game.
 * @param {() => void} options.onClosed Single callback invoked from the
 *   BrowserWindow "closed" event. The caller is responsible for everything
 *   that touches main-process state: killing any orphan game process,
 *   running cleanupBeforeQuit(), nulling the mainWindow reference, etc.
 *   Wrapped in a try/catch so a thrown error never crashes the listener.
 * @param {() => Promise<void> | void} options.onReady Called from the
 *   "did-finish-load" handler. Used to kick off the initial install check.
 * @returns {BrowserWindow}
 */
function createMainWindow({
  appDir,
  isDevMode,
  isGameRunning,
  onClosed,
  onReady,
}) {
  const iconPath = path.join(appDir, "assets", "icon2.ico");
  const preloadPath = path.join(appDir, "preload.js");
  const rendererPath = path.join(appDir, "renderer", "index.html");

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    transparent: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDevMode,
    },
    icon: iconPath,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    backgroundColor: "#000000",
  });

  win.setTitle("Shadowrun FPS Launcher");

  // Windows: ensure the taskbar icon matches our .ico instead of falling back
  // to the Electron default.
  if (process.platform === "win32") {
    app.setAppUserModelId(app.name);
    if (fs.existsSync(iconPath)) {
      win.setIcon(iconPath);
    }
  }

  win.loadFile(rendererPath);

  if (isDevMode) {
    safeLog.info("[Dev Mode] Opening DevTools automatically...");
    win.webContents.openDevTools();

    // Allow F12 / Ctrl+Shift+I to toggle DevTools while debugging.
    win.webContents.on("before-input-event", (_event, input) => {
      const isToggleShortcut =
        input.key === "F12" ||
        (input.control && input.shift && input.key.toLowerCase() === "i");
      if (isToggleShortcut) {
        win.webContents.toggleDevTools();
        _event.preventDefault();
      }
    });
  }

  // Block window close while a game is running so the user doesn't lose their
  // session by clicking the launcher's X. Surfacing a notification keeps the
  // failure mode obvious.
  win.on("close", (event) => {
    if (!isGameRunning()) {
      return;
    }

    safeLog.info(
      "Main window close attempt detected while game is running. Preventing close."
    );
    event.preventDefault();

    if (win.isDestroyed()) {
      return;
    }

    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();

    if (win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send("show-notification", {
        message: "The launcher cannot be closed while the game is running.",
        type: "warning",
      });
    }
  });

  win.on("closed", () => {
    // The "close" handler above prevents user-initiated close while a game is
    // running, but the OS / Task Manager can still force a close. The single
    // onClosed callback owns the orphan-kill, RPC cleanup, and ref reset
    // because all of that state lives in the caller (main.js).
    safeLog.info("[Window Closed] Running cleanup...");
    try {
      onClosed();
    } catch (e) {
      safeLog.warn(`onClosed threw: ${e && e.message}`);
    }
  });

  win.webContents.on("did-finish-load", async () => {
    try {
      await onReady();
    } catch (e) {
      safeLog.error("onReady (post-load install check) failed", e);
    }
  });

  return win;
}

module.exports = { createMainWindow };
