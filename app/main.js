const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { exec } = require("child_process");
const os = require("os");
const { v4: uuidv4 } = require("uuid");

const crypto = require("crypto");
const registryUtils = require("./utils/registry");
const tokenUtils = require("./utils/token");
const playerTracker = require("./utils/playerTracking");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");

// Fix Electron cache permission errors
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disk-cache-size", "0");

// Simplified logging utility
const log = {
  info: (message) => console.log(message),
  warn: (message, error) => {
    // Only log the message and a simpler error if provided
    if (error) {
      const simplifiedError = error.message || String(error);
      console.warn(`${message}: ${simplifiedError}`);
    } else {
      console.warn(message);
    }
  },
  error: (message, error) => {
    // Only log the message and error code/message, not the full stack trace
    if (error) {
      const errorDetails = error.code
        ? `${error.code} - ${error.message}`
        : error.message || String(error);
      console.error(`${message}: ${errorDetails}`);
    } else {
      console.error(message);
    }
  },
  debug: (message) => {
    // Only log in development mode
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEBUG] ${message}`);
    }
  },
};

// Download URLs
const GAME_FILES_URL = "http://157.245.214.234/releases/build.zip";
const GFWL_URL = "http://157.245.214.234/releases/gfwlivesetup.zip";
const DX9_URL =
  "https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe";

// Define installation directories
// Use user-writable location by default (doesn't require admin)
// Program Files location is tried only if running as admin
let GAME_INSTALL_DIR = path.join(app.getPath("home"), "Games", "Shadowrun");
const GAME_FILES_TEMP = path.join(os.tmpdir(), "Shadowrun_Downloads");

// Now we can use GAME_INSTALL_DIR in other constants
let RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");
const BACKUP_DIR = path.join(app.getPath("userData"), "BackupFiles");

// Auto-launch game after successful download/installation
// Set to false to disable auto-launch, true to enable
const AUTO_LAUNCH_AFTER_DOWNLOAD = false;

// Auto-updater configuration
// Set your update server URL here
const UPDATE_SERVER_URL = "http://157.245.214.234/launcher"; // Change this to your DigitalOcean server
autoUpdater.setFeedURL({
  provider: "generic",
  url: UPDATE_SERVER_URL,
});

// Configure auto-updater logging (use simple console logging)
autoUpdater.logger = {
  info: (msg) => console.log("[Updater]", msg),
  warn: (msg) => console.warn("[Updater]", msg),
  error: (msg) => console.error("[Updater]", msg),
  debug: (msg) => console.log("[Updater Debug]", msg),
};

// Auto-updater options
autoUpdater.autoDownload = false; // We'll control when to download
autoUpdater.autoInstallOnAppQuit = true; // Install update when app quits

// Add this constant for the NoIntroFix download URL
const NO_INTRO_FIX_URL = "http://157.245.214.234/releases/NoIntroFix.zip";
const NOINTRO_TEMP_PATH = path.join(os.tmpdir(), "NoIntroFix.zip");

// Alternatively, you can bundle the NoIntroFix files with your application:
const BUNDLED_NO_INTRO_FIX = path.join(
  app.getAppPath(),
  "resources",
  "NoIntroFix.zip"
);

const CLIENT_ID = "1352066395487076406";

// Make Discord RPC completely optional
let DiscordRPC = null;
let rpc = null;

// Track if player is currently in-game
let playerInGame = false;

// Add this variable to track the game process
let gameProcess = null;

// Define modifiedFiles at the higher scope level
let modifiedFiles = [];

// Add this near the top of your file with other variable declarations
let downloadInProgress = false;

// Remove unused encryption/decryption functions if they're only for player tracking
// function simpleEncrypt(text, key) { ... }
// function simpleDecrypt(text, key) { ... }

// Store token in a file
function storeDiscordToken(token) {
  try {
    const userDataPath = app.getPath("userData");
    const tokenPath = path.join(userDataPath, "discord-token.enc");
    // Use a deterministic key based on the user's machine
    const machineKey = crypto
      .createHash("sha256")
      .update(app.getPath("userData"))
      .digest("hex");
    const encrypted = simpleEncrypt(token, machineKey);
    fs.writeFileSync(tokenPath, encrypted);
    return true;
  } catch (error) {
    console.error("Failed to store token:", error);
    return false;
  }
}

// Retrieve token from file
function getDiscordToken() {
  try {
    const userDataPath = app.getPath("userData");
    const tokenPath = path.join(userDataPath, "discord-token.enc");
    if (!fs.existsSync(tokenPath)) return null;

    const encrypted = fs.readFileSync(tokenPath, "utf8");
    const machineKey = crypto
      .createHash("sha256")
      .update(app.getPath("userData"))
      .digest("hex");
    return simpleDecrypt(encrypted, machineKey);
  } catch (error) {
    console.error("Failed to retrieve token:", error);
    return null;
  }
}

// Helper function to wait for store to be ready
function waitForStore(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (storeReady) {
        clearInterval(checkInterval);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error("Timed out waiting for store to be ready"));
      }
    }, 100);
  });
}

function generateClientId() {
  if (clientId) return clientId;

  try {
    // Check if we already stored an ID
    const userDataPath = app.getPath("userData");
    const playerIdPath = path.join(userDataPath, "player-id.txt");

    if (fs.existsSync(playerIdPath)) {
      clientId = fs.readFileSync(playerIdPath, "utf8").trim();
    } else {
      // Generate a new UUID
      clientId = uuidv4();
      // Save it for future use
      fs.writeFileSync(playerIdPath, clientId);
    }
    return clientId;
  } catch (error) {
    console.error("Error generating client ID:", error);
    // Fallback to a random ID if needed
    return Math.random().toString(36).substring(2, 15);
  }
}

// Replace these lines:
// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require("electron-squirrel-startup")) {
  app.quit();
}

// With this code that makes it conditional:
let squirrelStartup = false;
try {
  // Only try to use electron-squirrel-startup if it's installed
  const electronSquirrelStartup = require("electron-squirrel-startup");
  if (electronSquirrelStartup) {
    squirrelStartup = true;
    app.quit();
  }
} catch (error) {
  // Module not found, just continue
  console.log(
    "electron-squirrel-startup not found, skipping Windows installer checks"
  );
}

// Skip app initialization if squirrel installer is running
if (squirrelStartup) return;

let mainWindow;
let settings = {
  skipIntro: false,
  dxvk: false,
  maxFrameRate: 240,
  audioMuted: false, // Persist background audio mute state
};

const settingsPath = path.join(app.getPath("userData"), "settings.json");

// Load settings from disk
async function loadSettingsFromDisk() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf8");
      const loadedSettings = JSON.parse(data);

      // Assign properties individually rather than replacing the whole object
      Object.assign(settings, loadedSettings);
    }

    // Check skip intro status and update settings accordingly
    const skipIntroStatus = await checkSkipIntroStatus();
    settings.skipIntro = skipIntroStatus.installed;

    return settings;
  } catch (error) {
    log.error("Error loading settings", error);
    return { ...settings }; // Return a copy of default settings
  }
}

// Save settings to disk
function saveSettingsToDisk() {
  try {
    // First check the actual mod state to ensure we're saving the correct value
    checkSkipIntroStatus().then((status) => {
      settings.skipIntro = status.installed;

      // Now save settings with the correct state
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    });
  } catch (error) {
    log.error("Error saving settings", error);
  }
}

function createWindow() {
  // Create the browser window.
  // Set app icon path (use .ico for Windows)
  const iconPath = path.join(__dirname, "assets/icon2.ico");

  // Check if running in dev mode (only with --dev flag)
  const isDevMode = process.argv.includes("--dev");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false, // Remove the standard window frame
    transparent: false, // Use false for better performance
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDevMode, // Enable DevTools in dev mode
    },
    icon: iconPath,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    backgroundColor: "#000000", // Set a background color
  });

  // Set the window title (shown in taskbar/alt-tab)
  mainWindow.setTitle("Shadowrun FPS Launcher");

  // Fix for taskbar icon in Windows
  if (process.platform === "win32") {
    app.setAppUserModelId(app.name);
    // Explicitly set the icon for Windows taskbar
    if (fs.existsSync(iconPath)) {
      mainWindow.setIcon(iconPath);
    }
  }

  // Load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Open DevTools automatically in dev mode
  if (isDevMode) {
    console.log("[Dev Mode] Opening DevTools automatically...");
    mainWindow.webContents.openDevTools();
  }

  // Enable F12 and Ctrl+Shift+I to toggle DevTools in dev mode
  if (isDevMode) {
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (
        input.key === "F12" ||
        (input.control && input.shift && input.key.toLowerCase() === "i")
      ) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  // Listen for the 'close' event on the window
  mainWindow.on("close", (event) => {
    if (gameProcess !== null) {
      log.info(
        "Main window close attempt detected while game is running. Preventing close."
      );
      event.preventDefault(); // Prevent the window from closing

      // Ensure the window is visible and focused
      if (mainWindow) {
        // Check if mainWindow still exists and is not destroyed
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();

        // Send notification to renderer
        if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send("show-notification", {
            message: "The launcher cannot be closed while the game is running.",
            type: "warning",
          });
        }
      }
      return false; // For older Electron versions, though preventDefault is standard
    }
    // If game is not running, allow the window to close.
    // The 'closed' event will then fire for cleanup.
  });

  mainWindow.on("closed", function () {
    // When window is closed, this means either the game wasn't running,
    // or the close was forced (e.g., Task Manager), or it's app shutdown.
    if (gameProcess !== null) {
      log.info(
        "Main window has closed and game process was still running. Attempting to kill game process."
      );
      if (gameProcess.pid) {
        try {
          process.kill(gameProcess.pid);
        } catch (e) {
          log.warn(
            `Failed to kill game process ${gameProcess.pid} on window closed: ${e.message}`
          );
        }
      }
      gameProcess = null; // Clear the game process tracker
    }
    // Dereference the window object
    mainWindow = null;
  });

  // When window is ready, check for existing installation
  mainWindow.webContents.on("did-finish-load", async () => {
    await checkExistingInstallation();
  });
}

// Create custom themed activation success dialog
function showActivationSuccessDialog(productKey, clearAfterSeconds) {
  const iconPath = path.join(__dirname, "assets/icon2.ico");

  const activationDialog = new BrowserWindow({
    width: 700,
    height: 340,
    frame: false,
    transparent: false,
    parent: mainWindow,
    modal: true,
    resizable: false,
    backgroundColor: "#1e293b",
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Build the custom HTML for the dialog
  const dialogHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #ffffff;
      overflow: hidden;
      user-select: none;
    }
    .dialog-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .dialog-header {
      background: rgba(15, 23, 42, 0.9);
      padding: 20px;
      border-bottom: 1px solid rgba(59, 130, 246, 0.3);
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
    }
    .success-icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); }
      50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.8); }
    }
    .dialog-title {
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
      flex: 1;
    }
    .close-button {
      position: absolute;
      top: 20px;
      right: 20px;
      width: 24px;
      height: 24px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .close-button:hover {
      color: #ffffff;
      transform: scale(1.1);
    }
    .dialog-content {
      flex: 1;
      padding: 30px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    .key-container {
      width: 100%;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      position: relative;
    }
    .key-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .key-value-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    .key-value {
      font-size: 24px;
      font-weight: 700;
      color: #3b82f6;
      font-family: "Courier New", monospace;
      letter-spacing: 2px;
      text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
      white-space: nowrap;
    }
    .copy-button {
      width: 36px;
      height: 36px;
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.4);
      border-radius: 6px;
      color: #3b82f6;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .copy-button:hover {
      background: rgba(59, 130, 246, 0.3);
      border-color: rgba(59, 130, 246, 0.6);
      transform: scale(1.05);
    }
    .copy-button:active {
      transform: scale(0.95);
    }
    .copy-button svg {
      width: 18px;
      height: 18px;
    }
    .info-text {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
      text-align: center;
      line-height: 1.6;
    }
    .timer-text {
      font-size: 12px;
      color: rgba(251, 191, 36, 0.9);
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
    }
    .dialog-footer {
      padding: 20px;
      background: rgba(15, 23, 42, 0.8);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: center;
    }
    .ok-button {
      background: #3b82f6;
      color: #ffffff;
      border: none;
      padding: 12px 40px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    }
    .ok-button:hover {
      background: #2563eb;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.5);
      transform: translateY(-1px);
    }
    .ok-button:active {
      transform: translateY(0);
    }
    .copied-feedback {
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(16, 185, 129, 0.9);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .copied-feedback.show {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="dialog-container">
    <div class="dialog-header">
      <div class="success-icon">✓</div>
      <div class="dialog-title">Activation Successful</div>
      <button class="close-button" onclick="window.close()">×</button>
    </div>
    <div class="dialog-content">
      <div class="key-container">
        <div class="copied-feedback" id="copiedFeedback">Copied!</div>
        <div class="key-label">Product Key (Copied to Clipboard)</div>
        <div class="key-value-row">
          <div class="key-value">${productKey}</div>
          <button class="copy-button" onclick="copyKey()" title="Copy key again">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="info-text">
        The key is in your clipboard. Paste it (Ctrl+V) into the game if needed.
      </div>
      <div class="timer-text">
        <span>🔒</span>
        <span>Key will auto-clear from clipboard in ${clearAfterSeconds} seconds</span>
      </div>
    </div>
    <div class="dialog-footer">
      <button class="ok-button" onclick="window.close()">OK</button>
    </div>
  </div>
  <script>
    function copyKey() {
      navigator.clipboard.writeText('${productKey}').then(() => {
        const feedback = document.getElementById('copiedFeedback');
        feedback.classList.add('show');
        setTimeout(() => {
          feedback.classList.remove('show');
        }, 2000);
      });
    }
  </script>
</body>
</html>`;

  activationDialog.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(dialogHTML)
  );

  activationDialog.once("ready-to-show", () => {
    activationDialog.show();
  });

  activationDialog.on("closed", () => {
    // Dialog closed
  });
}

// Only enable Discord RPC if we find the module
function setupDiscordIntegration() {
  try {
    // Only try to load it if it exists
    DiscordRPC = require("discord-rpc");
    if (DiscordRPC) {
      console.log("Discord RPC module found, enabling integration");
      initDiscord();
    }
  } catch (error) {
    console.log("Discord RPC not available, integration disabled");
    // Don't throw errors, just disable the feature
  }
}

// Modify app.whenReady to include Discord setup and auto-updater
app.whenReady().then(async () => {
  try {
    // Load settings
    loadSettingsFromDisk();

    createWindow();
    setupDiscordIntegration();

    // Start player tracking
    playerTracker.start();

    // Check for updates after window is created
    setTimeout(() => {
      checkForUpdates();
    }, 3000); // Wait 3 seconds before checking for updates

    app.on("activate", function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Add support for dragging the frameless window
    ipcMain.on("start-drag", () => {
      mainWindow.webContents.send("start-drag");
      mainWindow.setMovable(true);
      mainWindow.moveTopLeft(0, 0);
    });

    // Check activation status on startup
    setTimeout(() => {
      checkActivationStatus();
    }, 3000); // Give the app time to fully initialize
  } catch (error) {
    console.error("App initialization error:", error);
  }
});

// Modify the window close handler to check if game is running
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    // If gameProcess is null, it means no game is running,
    // and since all windows are closed (and the close wasn't prevented by the 'close' event handler),
    // it's safe to quit the app.
    if (gameProcess === null) {
      log.info("All windows closed and game is not running. Quitting app.");
      app.quit();
    } else {
      // This case should ideally be rare if the mainWindow.on('close') event correctly prevents closure.
      // It implies the window closed despite the game running, possibly due to an unhandled scenario or force quit.
      log.warn(
        "All windows reported closed, but game is still running. App remains active. This might indicate an issue if the main window was expected to stay open."
      );
    }
  }
});

// Helper function to set default game configuration (resolution and volume)
// This runs before first launch to prevent off-screen resolution issues
function setDefaultGameConfig() {
  try {
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
          console.log(`[Game Config] Found config file at: ${configPath}`);

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
              console.log(
                `[Game Config] Set music volume to 50% in ${configPath}`
              );
            }
          }

          if (modified) {
            fs.writeFileSync(configPath, configContent, "utf8");
            console.log(`[Game Config] Updated config file: ${configPath}`);
          }
        } catch (error) {
          console.warn(
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
      console.log("[Game Config] Checking registry for game settings...");
    } catch (error) {
      console.warn("[Game Config] Could not check registry:", error.message);
    }
  } catch (error) {
    console.warn(
      "[Game Config] Error setting default game config:",
      error.message
    );
  }
}

// Extract launch logic into reusable function
async function launchGameLogic(gameSettings, source = "unknown") {
  try {
    // Safety check: Never auto-launch if AUTO_LAUNCH_AFTER_DOWNLOAD is false
    if (source === "auto-launch" && !AUTO_LAUNCH_AFTER_DOWNLOAD) {
      console.warn(
        "[Launch] Blocked auto-launch attempt - AUTO_LAUNCH_AFTER_DOWNLOAD is false"
      );
      return { success: false, error: "Auto-launch is disabled" };
    }

    // Run pre-launch diagnostics to detect and auto-fix common issues
    const diagnostics = await runPreLaunchDiagnostics();

    // Check for critical issues that would prevent game launch
    const criticalIssues = diagnostics.issues.filter(
      (issue) => issue.severity === "critical"
    );
    if (criticalIssues.length > 0) {
      console.error("[Launch] ❌ Critical issues detected, cannot launch game");
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

      return {
        success: false,
        error: "Critical system requirements not met",
        details: criticalIssues,
      };
    }

    // Notify user of any auto-fixes
    if (diagnostics.autoFixed.length > 0) {
      console.log(
        `[Launch] ✅ Auto-fixed ${diagnostics.autoFixed.length} issue(s):`
      );
      diagnostics.autoFixed.forEach((fix) => console.log(`  - ${fix}`));

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("show-notification", {
          message: `✅ Auto-fixed: ${diagnostics.autoFixed.join(", ")}`,
          type: "success",
        });
      }
    }

    // Detect GPU vendor for optimized FPS limiting
    const gpuInfo = diagnostics.gpuInfo || (await detectGPUVendor());
    console.log(
      `[Launch] Using GPU: ${gpuInfo.vendor.toUpperCase()} - ${gpuInfo.name}`
    );

    // Get actual FPS from dxvk.conf instead of using the one from settings object
    const actualFps = readCurrentFpsFromDxvkConf() || gameSettings.maxFrameRate;

    // Log with the correct FPS value
    console.log(`[Launch] Launching game from ${source} with settings:`, {
      ...gameSettings,
      maxFrameRate: actualFps,
      gpu: gpuInfo.vendor,
    });

    // Path to the Shadowrun executable
    const gameExePath = path.join(GAME_INSTALL_DIR, "Shadowrun.exe");

    if (!fs.existsSync(gameExePath)) {
      console.error("Game executable not found at:", gameExePath);
      return { success: false, error: "Game executable not found" };
    }

    // Set default game configuration before launching (resolution and volume)
    setDefaultGameConfig();

    // Set player as in-game and send heartbeat
    playerInGame = true;
    updateDiscordActivity(true);

    // Get GPU-specific environment variables for enhanced FPS limiting
    const dxvkEnvVars = getEnhancedDxvkEnvVars(actualFps, gpuInfo.vendor);

    // Launch the game and store the process
    gameProcess = exec(
      `"${gameExePath}"`,
      {
        cwd: GAME_INSTALL_DIR,
        env: {
          ...process.env,
          // Bypass Windows compatibility dialogs and Program Compatibility Assistant (PCA)
          __COMPAT_LAYER: "RunAsInvoker DisablePCA",
          // Apply GPU-specific DXVK optimizations (especially for AMD)
          ...dxvkEnvVars,
        },
      },
      async (error, stdout, stderr) => {
        if (error) {
          console.error("Error launching game:", error);
        }

        // When game closes
        console.log("[Game Close] Game process has exited");
        playerInGame = false;
        gameProcess = null;
        updateDiscordActivity(false);

        // Auto-restore original PCID when game closes
        try {
          const backupExists = await registryUtils.checkSrPcidBackupExists();
          if (backupExists) {
            // Get current PCID and backup PCID to compare
            const currentPcid = await registryUtils.getPcidFromRegistry();
            const backupPcid =
              await registryUtils.getSrPcidBackupFromRegistry();

            if (currentPcid && backupPcid) {
              // Compare the hex values (normalize to uppercase for comparison)
              const currentHex = currentPcid
                .toString(16)
                .toUpperCase()
                .padStart(16, "0");
              const backupHex = backupPcid.toUpperCase().replace(/,/g, "");

              if (currentHex !== backupHex) {
                console.log("[Game Close] Restoring original PCID...");
                await restoreOriginalPcid();
                console.log("[Game Close] ✅ PCID restored");
                // Toast notification removed per user request
              }
            }
          }
        } catch (restoreError) {
          console.error(
            "[Game Close] Error restoring PCID:",
            restoreError.message
          );
          // Non-fatal error, don't block game close handling
        }

        // Notify renderer that game is no longer running
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("game-state-update", { running: false });
        }

        // Update player tracking status back to menu
        playerTracker.setStatus("menu");
      }
    );

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
        console.log(
          `[Audio] Launching audio volume helper from: ${audioHelperPath}`
        );
        // Spawn the helper in detached mode so it doesn't block
        const audioHelper = spawn(audioHelperPath, ["Shadowrun.exe", "50"], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        audioHelper.unref(); // Don't wait for it to complete
        console.log("[Audio] Audio volume helper launched");
      } else {
        console.log(
          "[Audio] Audio volume helper not found at any expected location, skipping volume adjustment"
        );
      }
    } catch (audioError) {
      console.warn("[Audio] Could not set game volume:", audioError.message);
    }

    // Notify renderer that game is now running
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("game-state-update", { running: true });
    }

    // Update player tracking status
    playerTracker.setStatus("in-game");

    // Update Discord status right away
    updateDiscordActivity(true);

    return { success: true };
  } catch (error) {
    log.error("Error launching game", error);
    return { success: false, error: error.message };
  }
}

// Update the launch-game handler to track the game process
ipcMain.handle("launch-game", async (event, gameSettings) => {
  return await launchGameLogic(gameSettings, "user-click");
});

// Helper function to check if DirectX 9 is installed
function isDX9Installed() {
  return new Promise((resolve) => {
    console.log("[DirectX Check] Checking for DirectX 9+ installation...");

    // Check registry keys for DirectX
    const command = 'reg query "HKLM\\SOFTWARE\\Microsoft\\DirectX" /v Version';
    console.log(`[DirectX Check] Running command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (!error && stdout) {
        // Check for DirectX 9 specifically (version 4.09.x.x)
        if (stdout.includes("4.09") || stdout.includes("9.")) {
          resolve(true);
          return;
        }

        // Check for any DirectX version present (Windows 10/11 have DirectX 12 built-in)
        if (stdout.includes("REG_SZ") || stdout.includes("Version")) {
          resolve(true);
          return;
        }
      }

      // Fallback 1: Check for d3d9.dll in System32 (DirectX 9 DLL - present on all Windows with DX9+)
      const dx9DllPath = path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "d3d9.dll"
      );

      if (fs.existsSync(dx9DllPath)) {
        resolve(true);
        return;
      }

      // Fallback 2: Check for d3d11.dll (DirectX 11 - present on Windows 7+)
      const dx11DllPath = path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "d3d11.dll"
      );

      if (fs.existsSync(dx11DllPath)) {
        resolve(true);
        return;
      }

      // Fallback 3: On Windows 10/11, DirectX 12 is built-in
      const osVersion = os.release();
      const majorVersion = parseInt(osVersion.split(".")[0]);
      if (majorVersion >= 10) {
        console.log(
          "[DirectX Check] ✅ Windows 10+ detected - DirectX 12 is built-in (includes DX9)"
        );
        resolve(true);
        return;
      }

      console.log("[DirectX Check] ❌ DirectX 9+ not found");
      resolve(false);
    });
  });
}

// Helper function to check if GFWL is installed
function isGFWLInstalled() {
  return new Promise((resolve) => {
    // Check for GFWL directory
    const gfwlPath =
      "C:\\Program Files (x86)\\Microsoft Games for Windows - LIVE";

    if (!fs.existsSync(gfwlPath)) {
      resolve(false);
      return;
    }

    // Check for actual GFWL executable files (more reliable than just directory)
    const gfwlExecutables = [
      path.join(gfwlPath, "Client", "gfwlclient.exe"),
      path.join(gfwlPath, "Client", "GFWLClient.exe"),
    ];

    let foundExecutable = false;
    for (const exePath of gfwlExecutables) {
      if (fs.existsSync(exePath)) {
        foundExecutable = true;
        break;
      }
    }

    resolve(foundExecutable);
  });
}

// ============================================================================
// GPU DETECTION AND FPS LIMITING
// ============================================================================

// Helper function to detect GPU vendor (AMD, NVIDIA, Intel)
async function detectGPUVendor() {
  return new Promise((resolve) => {
    console.log("[GPU Detection] Detecting GPU vendor...");

    // Use WMIC to query GPU information
    const command = "wmic path win32_VideoController get name";

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("[GPU Detection] Error detecting GPU:", error.message);
        resolve({ vendor: "unknown", name: "Unknown GPU" });
        return;
      }

      console.log("[GPU Detection] GPU Output:", stdout);

      let vendor = "unknown";
      let gpuName = "Unknown GPU";

      // Extract GPU name from output - get first discrete GPU (usually the gaming GPU)
      const lines = stdout.split("\n").filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed &&
          !trimmed.includes("Name") &&
          !trimmed.toLowerCase().includes("microsoft basic")
        );
      });

      if (lines.length > 0) {
        gpuName = lines[0].trim();
      }

      // Detect vendor from the specific GPU name, not the entire output
      const gpuLower = gpuName.toLowerCase();
      if (
        gpuLower.includes("amd") ||
        gpuLower.includes("radeon") ||
        gpuLower.includes("advanced micro devices")
      ) {
        vendor = "amd";
      } else if (
        gpuLower.includes("nvidia") ||
        gpuLower.includes("geforce") ||
        gpuLower.includes("quadro") ||
        gpuLower.includes("rtx")
      ) {
        vendor = "nvidia";
      } else if (
        gpuLower.includes("intel") ||
        gpuLower.includes("uhd") ||
        gpuLower.includes("iris") ||
        gpuLower.includes("arc")
      ) {
        vendor = "intel";
      }

      console.log(
        `[GPU Detection] ✅ Detected: ${vendor.toUpperCase()} - ${gpuName}`
      );
      resolve({ vendor, name: gpuName });
    });
  });
}

// Helper function to detect CPU
async function detectCPU() {
  return new Promise((resolve) => {
    console.log("[CPU Detection] Detecting CPU...");

    // Use WMIC to query CPU information
    const command = "wmic cpu get name";

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("[CPU Detection] Error detecting CPU:", error.message);
        resolve({ name: "Unknown CPU" });
        return;
      }

      console.log("[CPU Detection] CPU Output:", stdout);

      // Extract CPU name from output
      const lines = stdout
        .split("\n")
        .filter((line) => line.trim() && !line.includes("Name"));
      let cpuName = "Unknown CPU";

      if (lines.length > 0) {
        cpuName = lines[0].trim();

        // Clean up CPU name - remove processor core count and extra details
        // Example: "AMD Ryzen 7 7800X3D 8-Core Processor" -> "AMD Ryzen 7 7800X3D"
        cpuName = cpuName.replace(/\s+\d+-Core\s+Processor$/i, "");
        cpuName = cpuName.replace(/\s+CPU\s+@\s+[\d.]+GHz$/i, "");
      }

      console.log(`[CPU Detection] ✅ Detected: ${cpuName}`);
      resolve({ name: cpuName });
    });
  });
}

// Helper function to detect NAT type
async function detectNATType() {
  return new Promise((resolve) => {
    // Use netsh to check NAT type via UPnP status
    const command = "netsh interface ipv4 show interfaces";

    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve({ type: "Unknown", status: "Unable to detect" });
        return;
      }

      // Check Windows Firewall and UPnP status
      const upnpCommand = "netsh advfirewall show allprofiles state";

      exec(upnpCommand, (upnpError, upnpStdout) => {
        let natType = "Unknown";

        if (!upnpError && upnpStdout) {
          // Check if firewall is on/off - affects NAT strictness
          const firewallOff =
            upnpStdout.toLowerCase().includes("state") &&
            upnpStdout.toLowerCase().includes("off");

          if (firewallOff) {
            natType = "Open (Likely)";
          } else {
            // Firewall on - likely Moderate or Strict
            natType = "Moderate/Strict";
          }
        }

        resolve({
          type: natType,
          status: "Detected via firewall analysis",
        });
      });
    });
  });
}

// Get system information (GPU + CPU + NAT)
async function getSystemInfo() {
  const gpuInfo = await detectGPUVendor();
  const cpuInfo = await detectCPU();
  const natInfo = await detectNATType();

  // Clean up OS display
  let osDisplay = os.type();
  if (osDisplay === "Windows_NT") {
    const release = os.release();
    const version = parseInt(release.split(".")[0]);
    // Windows 10 is version 10.0.x, Windows 11 is 10.0.22000+
    if (version === 10) {
      const build = parseInt(release.split(".")[2] || "0");
      osDisplay = build >= 22000 ? "Windows 11" : "Windows 10";
    } else {
      osDisplay = `Windows ${version}`;
    }
  }

  return {
    gpu: gpuInfo,
    cpu: cpuInfo,
    os: osDisplay,
    nat: natInfo,
  };
}

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
// ERROR DETECTION AND AUTO-FIX
// ============================================================================

// Check if Windows License Manager Service is running
async function checkWindowsLicenseManagerService() {
  return new Promise((resolve) => {
    exec("sc query LicenseManager", (error, stdout, stderr) => {
      if (error) {
        resolve({ running: false, exists: false });
        return;
      }

      const isRunning = stdout.includes("RUNNING");
      const isStopped = stdout.includes("STOPPED");

      if (isRunning) {
        resolve({ running: true, exists: true });
      } else if (isStopped) {
        resolve({ running: false, exists: true });
      } else {
        resolve({ running: false, exists: true });
      }
    });
  });
}

// Auto-start Windows License Manager Service
async function startWindowsLicenseManagerService() {
  return new Promise((resolve) => {
    console.log(
      "[Service Fix] Attempting to start Windows License Manager Service..."
    );

    // Try to start the service (may require admin privileges)
    exec("sc start LicenseManager", (error, stdout, stderr) => {
      if (error) {
        // Check if it's already running
        if (
          stderr.includes("1056") ||
          stdout.includes("already been started")
        ) {
          console.log("[Service Fix] ✅ Service is already running");
          resolve({ success: true, message: "Service is already running" });
          return;
        }

        // Check if we need admin privileges
        if (stderr.includes("1058") || stderr.includes("disabled")) {
          console.log(
            "[Service Fix] ❌ Service is disabled - needs manual intervention"
          );
          resolve({
            success: false,
            needsAdmin: true,
            message:
              "Service is disabled. Please run services.msc and set LicenseManager to Automatic startup type.",
          });
          return;
        }

        console.error(
          "[Service Fix] ❌ Failed to start service:",
          error.message
        );
        resolve({
          success: false,
          needsAdmin: true,
          message:
            "Failed to start service. You may need administrator privileges.",
        });
        return;
      }

      console.log(
        "[Service Fix] ✅ Successfully started Windows License Manager Service"
      );
      resolve({ success: true, message: "Service started successfully" });
    });
  });
}

// Check Xbox Live Networking Service status
async function checkXboxLiveNetworkingService() {
  return new Promise((resolve) => {
    exec("sc query XboxNetApiSvc", (error, stdout, stderr) => {
      if (error) {
        resolve({ running: false, exists: false });
        return;
      }

      const isRunning = stdout.includes("RUNNING");
      const isStopped = stdout.includes("STOPPED");

      if (isRunning) {
        resolve({ running: true, exists: true });
      } else if (isStopped) {
        resolve({ running: false, exists: true });
      } else {
        resolve({ running: false, exists: true });
      }
    });
  });
}

// Restart Xbox Live Networking Service with UAC elevation
async function restartXboxLiveNetworkingServiceWithElevation() {
  return new Promise((resolve) => {
    console.log(
      "[Service Fix] Attempting to restart Xbox Live Networking Service with UAC elevation..."
    );

    // Create VBScript to elevate PowerShell (more reliable than nested PowerShell)
    const fs = require("fs");
    const os = require("os");
    const path = require("path");

    const tempDir = os.tmpdir();
    const psScriptPath = path.join(tempDir, "xbox_service_restart.ps1");
    const vbsScriptPath = path.join(tempDir, "xbox_service_restart.vbs");
    const logPath = path.join(tempDir, "xbox_service_restart_log.txt");

    // Delete old log if it exists
    try {
      if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
    } catch (e) {
      /* ignore */
    }

    // PowerShell script content with detailed logging
    const psScript = `
$logFile = "${logPath.replace(/\\/g, "\\\\")}"
$service = Get-Service -Name XboxNetApiSvc -ErrorAction SilentlyContinue

if ($null -eq $service) {
    "NOT_FOUND" | Out-File -FilePath $logFile -Encoding UTF8
    exit 1
}

if ($service.StartType -eq 'Disabled') {
    "DISABLED" | Out-File -FilePath $logFile -Encoding UTF8
    exit 2
}

try {
    $initialStatus = $service.Status
    "INITIAL_STATUS:$initialStatus" | Out-File -FilePath $logFile -Encoding UTF8
    
    if ($service.Status -eq 'Running') {
        "STOPPING_SERVICE" | Out-File -FilePath $logFile -Encoding UTF8 -Append
        Stop-Service -Name XboxNetApiSvc -Force -ErrorAction Stop
        "SERVICE_STOPPED" | Out-File -FilePath $logFile -Encoding UTF8 -Append
        Start-Sleep -Milliseconds 1000
        "STARTING_SERVICE" | Out-File -FilePath $logFile -Encoding UTF8 -Append
        Start-Service -Name XboxNetApiSvc -ErrorAction Stop
        "RESTARTED" | Out-File -FilePath $logFile -Encoding UTF8 -Append
    } else {
        "STARTING_SERVICE" | Out-File -FilePath $logFile -Encoding UTF8 -Append
        Start-Service -Name XboxNetApiSvc -ErrorAction Stop
        "STARTED" | Out-File -FilePath $logFile -Encoding UTF8 -Append
    }
    
    $finalStatus = (Get-Service -Name XboxNetApiSvc).Status
    "FINAL_STATUS:$finalStatus" | Out-File -FilePath $logFile -Encoding UTF8 -Append
    exit 0
} catch {
    "ERROR:$($_.Exception.Message)" | Out-File -FilePath $logFile -Encoding UTF8 -Append
    exit 3
}
`;

    // VBScript to run PowerShell with UAC elevation
    const vbsScript = `Set UAC = CreateObject("Shell.Application")
UAC.ShellExecute "powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File ""${psScriptPath.replace(
      /\\/g,
      "\\\\"
    )}""", "", "runas", 0
WScript.Sleep 3000`;

    try {
      // Write scripts to temp files
      fs.writeFileSync(psScriptPath, psScript, "utf8");
      fs.writeFileSync(vbsScriptPath, vbsScript, "utf8");

      // Execute VBScript (triggers UAC)
      exec(
        `cscript //nologo "${vbsScriptPath}"`,
        { timeout: 10000 },
        (error, stdout, stderr) => {
          // Clean up temp files
          try {
            if (fs.existsSync(psScriptPath)) fs.unlinkSync(psScriptPath);
            if (fs.existsSync(vbsScriptPath)) fs.unlinkSync(vbsScriptPath);
          } catch (cleanupError) {
            console.warn(
              "[Service Fix] Could not clean up temp files:",
              cleanupError.message
            );
          }

          if (error) {
            console.error("[Service Fix] ❌ Execution error:", error.message);
            resolve({
              success: false,
              message:
                "Failed to execute restart script. The service may be disabled or require manual intervention.",
            });
            return;
          }

          // Wait for the elevated script to complete, then read the log
          setTimeout(() => {
            try {
              if (fs.existsSync(logPath)) {
                const logContent = fs.readFileSync(logPath, "utf8").trim();
                console.log("[Service Fix] Restart log:", logContent);

                // Clean up log file
                try {
                  fs.unlinkSync(logPath);
                } catch (e) {
                  /* ignore */
                }

                if (logContent.includes("NOT_FOUND")) {
                  console.log("[Service Fix] ❌ Service not found");
                  resolve({
                    success: false,
                    error:
                      "Xbox Live Networking Service not found on this system.",
                  });
                } else if (logContent.includes("DISABLED")) {
                  console.log("[Service Fix] ❌ Service is disabled");
                  resolve({
                    success: false,
                    isDisabled: true,
                    message:
                      "Xbox Live Networking Service is disabled. Please enable it in services.msc.",
                  });
                } else if (logContent.includes("RESTARTED")) {
                  const lines = logContent.split("\n");
                  const initialStatus =
                    lines
                      .find((l) => l.startsWith("INITIAL_STATUS:"))
                      ?.split(":")[1] || "Unknown";
                  const finalStatus =
                    lines
                      .find((l) => l.startsWith("FINAL_STATUS:"))
                      ?.split(":")[1] || "Unknown";
                  console.log(
                    `[Service Fix] ✅ Service successfully restarted! (${initialStatus} → Stopped → ${finalStatus})`
                  );
                  resolve({
                    success: true,
                    message: `Service restarted successfully (${initialStatus} → Stopped → ${finalStatus})`,
                  });
                } else if (logContent.includes("STARTED")) {
                  const finalStatus =
                    logContent
                      .split("\n")
                      .find((l) => l.startsWith("FINAL_STATUS:"))
                      ?.split(":")[1] || "Running";
                  console.log(
                    `[Service Fix] ✅ Service started successfully! (was stopped, now ${finalStatus})`
                  );
                  resolve({
                    success: true,
                    message: `Service started successfully (now ${finalStatus})`,
                  });
                } else if (logContent.includes("ERROR:")) {
                  const errorMsg =
                    logContent.split("ERROR:")[1] || "Unknown error";
                  console.error("[Service Fix] ❌ Script error:", errorMsg);
                  resolve({
                    success: false,
                    message: `Failed to restart service: ${errorMsg}`,
                  });
                } else {
                  console.warn(
                    "[Service Fix] ⚠️  Unknown log content:",
                    logContent
                  );
                  resolve({
                    success: false,
                    message: "Unknown result from restart operation.",
                  });
                }
              } else {
                // Log file doesn't exist - UAC was probably cancelled or script didn't run
                console.warn(
                  "[Service Fix] ⚠️  No log file found - UAC may have been cancelled"
                );
                resolve({
                  success: false,
                  cancelled: true,
                  message: "UAC prompt may have been cancelled.",
                });
              }
            } catch (readError) {
              console.error(
                "[Service Fix] Error reading log:",
                readError.message
              );
              resolve({
                success: false,
                message: "Could not verify service status after restart.",
              });
            }
          }, 3500);
        }
      );
    } catch (fileError) {
      console.error(
        "[Service Fix] ❌ Failed to create temp scripts:",
        fileError.message
      );
      resolve({
        success: false,
        message: "Failed to create temporary scripts for elevation.",
      });
    }
  });
}

// Check for GPU driver issues
async function checkGPUDrivers() {
  return new Promise((resolve) => {
    exec(
      "wmic path win32_VideoController get driverVersion,name",
      (error, stdout) => {
        if (error) {
          resolve({ hasDrivers: false, drivers: [] });
          return;
        }

        const lines = stdout.split("\n").filter((line) => {
          const trimmed = line.trim();
          return (
            trimmed &&
            !trimmed.startsWith("Name") &&
            !trimmed.startsWith("DriverVersion")
          );
        });

        const drivers = lines.map((line) => {
          const parts = line.trim().split(/\s{2,}/);
          return {
            name: parts[0] || "Unknown",
            version: parts[1] || "Unknown",
          };
        });

        resolve({ hasDrivers: drivers.length > 0, drivers });
      }
    );
  });
}

// Check Windows Firewall status
async function checkWindowsFirewall() {
  return new Promise((resolve) => {
    exec("netsh advfirewall show allprofiles state", (error, stdout) => {
      if (error) {
        resolve({ enabled: null, status: "Unknown" });
        return;
      }

      // Check if any profile has firewall ON
      const firewallOn =
        stdout.toLowerCase().includes("state") &&
        stdout.toLowerCase().includes("on");

      resolve({ enabled: firewallOn, status: firewallOn ? "ON" : "OFF" });
    });
  });
}

// Check network connectivity
async function checkNetworkConnectivity() {
  return new Promise((resolve) => {
    // Ping Google DNS
    exec("ping -n 1 8.8.8.8", (error, stdout) => {
      if (error) {
        resolve({ online: false, status: "Offline" });
        return;
      }

      const success =
        stdout.toLowerCase().includes("reply from") ||
        stdout.toLowerCase().includes("bytes=");
      resolve({ online: success, status: success ? "Online" : "Offline" });
    });
  });
}

// Check .NET Framework
async function checkDotNetFramework() {
  return new Promise((resolve) => {
    exec(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v3.5" /v Install',
      (error, stdout) => {
        if (error || !stdout.includes("0x1")) {
          resolve({ installed: false, version: "Not Installed" });
          return;
        }

        resolve({ installed: true, version: "3.5+" });
      }
    );
  });
}

// Check .NET 6.0 Desktop Runtime x86 (required for XLiveActivateHelper.exe)
async function checkDotNet6x86Runtime() {
  return new Promise((resolve) => {
    // Check for .NET 6.0 Desktop Runtime x86 in registry
    // Path: HKLM\SOFTWARE\WOW6432Node\dotnet\Setup\InstalledVersions\x86\sharedhost (on 64-bit)
    // Path: HKLM\SOFTWARE\dotnet\Setup\InstalledVersions\x86\sharedhost (on 32-bit)

    // Check if running on 64-bit Windows first
    exec(
      'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v PROCESSOR_ARCHITECTURE',
      (error, stdout) => {
        const is64bit = stdout && stdout.includes("AMD64");
        const registryPath = is64bit
          ? "HKLM\\SOFTWARE\\WOW6432Node\\dotnet\\Setup\\InstalledVersions\\x86\\sharedhost"
          : "HKLM\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x86\\sharedhost";

        exec(`reg query "${registryPath}" /v Version`, (error, stdout) => {
          if (error || !stdout) {
            resolve({ installed: false, version: "Not Installed" });
            return;
          }

          // Extract version from registry output
          const versionMatch = stdout.match(/Version\s+REG_SZ\s+([\d.]+)/);
          if (versionMatch && versionMatch[1]) {
            resolve({ installed: true, version: versionMatch[1] });
          } else {
            resolve({ installed: false, version: "Not Installed" });
          }
        });
      }
    );
  });
}

// Download and install .NET 6.0 Desktop Runtime x86 silently
async function downloadAndInstallDotNet6() {
  return new Promise(async (resolve) => {
    try {
      console.log("[.NET 6.0 Installer] Starting download and installation...");

      // .NET 6.0 Desktop Runtime x86 (32-bit) - Latest LTS
      const DOTNET6_URL =
        "https://download.visualstudio.microsoft.com/download/pr/bf0c50ea-2394-40af-a5a7-6cee0cef5572/31d359c30ff370525e06e43f92ab26aa/windowsdesktop-runtime-6.0.36-win-x86.exe";
      const installerPath = path.join(os.tmpdir(), "dotnet6-installer.exe");

      // Show progress message to user
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("show-notification", {
          message: "⬇️ Downloading .NET 6.0 Runtime...",
          type: "info",
        });
      }

      console.log("[.NET 6.0 Installer] Downloading from Microsoft CDN...");
      console.log(`[.NET 6.0 Installer] Destination: ${installerPath}`);

      // Download the installer
      const downloadSuccess = await new Promise((downloadResolve) => {
        const file = fs.createWriteStream(installerPath);
        const request = https.get(DOTNET6_URL, (response) => {
          if (response.statusCode !== 200) {
            console.error(
              `[.NET 6.0 Installer] Download failed: HTTP ${response.statusCode}`
            );
            downloadResolve(false);
            return;
          }

          const totalSize = parseInt(response.headers["content-length"], 10);
          let downloadedSize = 0;

          response.on("data", (chunk) => {
            downloadedSize += chunk.length;
            const progress = Math.round((downloadedSize / totalSize) * 100);

            // Log progress every 10%
            if (progress % 10 === 0) {
              console.log(
                `[.NET 6.0 Installer] Download progress: ${progress}%`
              );
            }
          });

          response.pipe(file);

          file.on("finish", () => {
            file.close(() => {
              console.log("[.NET 6.0 Installer] ✅ Download complete");
              downloadResolve(true);
            });
          });
        });

        request.on("error", (error) => {
          console.error(
            `[.NET 6.0 Installer] Download error: ${error.message}`
          );
          fs.unlink(installerPath, () => {});
          downloadResolve(false);
        });

        file.on("error", (error) => {
          console.error(
            `[.NET 6.0 Installer] File write error: ${error.message}`
          );
          fs.unlink(installerPath, () => {});
          downloadResolve(false);
        });
      });

      if (!downloadSuccess) {
        resolve({
          success: false,
          error: "Failed to download .NET 6.0 installer",
        });
        return;
      }

      // Show installation message
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("show-notification", {
          message: "⚙️ Installing .NET 6.0 Runtime (1-2 min)...",
          type: "info",
        });
      }

      console.log("[.NET 6.0 Installer] Starting silent installation...");
      console.log(
        "[.NET 6.0 Installer] Running installer with /install /quiet /norestart flags..."
      );

      // Run installer silently
      exec(
        `"${installerPath}" /install /quiet /norestart`,
        { timeout: 300000 }, // 5 minute timeout
        (error, stdout, stderr) => {
          // Clean up installer file
          try {
            fs.unlinkSync(installerPath);
            console.log("[.NET 6.0 Installer] Cleaned up installer file");
          } catch (cleanupError) {
            // Ignore cleanup errors
          }

          if (error) {
            console.error(
              `[.NET 6.0 Installer] Installation error: ${error.message}`
            );
            console.error(`[.NET 6.0 Installer] Exit code: ${error.code}`);

            // Check if it's a "success with reboot required" code
            if (error.code === 1641 || error.code === 3010) {
              console.log(
                "[.NET 6.0 Installer] ✅ Installation succeeded (reboot recommended but not required)"
              );

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("show-notification", {
                  message: "✅ .NET 6.0 installed successfully!",
                  type: "success",
                });
              }

              resolve({ success: true, rebootRecommended: true });
            } else {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("show-notification", {
                  message: "❌ .NET 6.0 installation failed",
                  type: "error",
                });
              }

              resolve({
                success: false,
                error: `Installation failed with exit code ${error.code}`,
              });
            }
            return;
          }

          console.log(
            "[.NET 6.0 Installer] ✅ Installation completed successfully"
          );

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("show-notification", {
              message: "✅ .NET 6.0 installed successfully!",
              type: "success",
            });
          }

          resolve({ success: true });
        }
      );
    } catch (error) {
      console.error(`[.NET 6.0 Installer] Unexpected error: ${error.message}`);
      resolve({
        success: false,
        error: error.message,
      });
    }
  });
}

// Comprehensive pre-launch diagnostics
async function runPreLaunchDiagnostics() {
  console.log("\n========================================");
  console.log("🔍 RUNNING PRE-LAUNCH DIAGNOSTICS");
  console.log("========================================");

  const diagnostics = {
    directX: false,
    licenseManager: false,
    xboxNetworking: false,
    gpuDrivers: false,
    gpuInfo: { vendor: "unknown", name: "Unknown" },
    natType: { type: "Unknown" },
    firewall: { enabled: null, status: "Unknown" },
    network: { online: false, status: "Unknown" },
    dotNet: { installed: false, version: "Unknown" },
    os: "Unknown",
    issues: [],
    autoFixed: [],
  };

  // Check DirectX
  try {
    diagnostics.directX = await isDX9Installed();
    if (!diagnostics.directX) {
      diagnostics.issues.push({
        type: "directx",
        severity: "critical",
        message:
          "DirectX 9 is not installed. This will cause 'Unable to create Direct3D Device' errors.",
        fix: "Install DirectX 9 from the launcher's setup options.",
      });
    } else {
      console.log("[Diagnostics] ✅ DirectX: OK");
    }
  } catch (error) {
    console.error("[Diagnostics] Error checking DirectX:", error.message);
  }

  // Check Windows License Manager Service
  try {
    const serviceStatus = await checkWindowsLicenseManagerService();
    diagnostics.licenseManager = serviceStatus.running;

    if (serviceStatus.exists && !serviceStatus.running) {
      diagnostics.issues.push({
        type: "license_manager",
        severity: "high",
        message:
          "Windows License Manager Service is not running. This may cause error 0x80072746.",
        fix: "auto-fixable",
      });

      // Attempt auto-fix
      console.log(
        "[Diagnostics] Attempting to auto-start Windows License Manager..."
      );
      const fixResult = await startWindowsLicenseManagerService();

      if (fixResult.success) {
        diagnostics.autoFixed.push("Started Windows License Manager Service");
        diagnostics.licenseManager = true;
        console.log(
          "[Diagnostics] ✅ Auto-fixed: License Manager Service started"
        );
      } else {
        console.log(
          "[Diagnostics] ⚠️  Could not auto-start License Manager (may need admin)"
        );
      }
    } else if (serviceStatus.running) {
      console.log("[Diagnostics] ✅ License Manager Service: OK");
    }
  } catch (error) {
    console.error(
      "[Diagnostics] Error checking License Manager:",
      error.message
    );
  }

  // Check Xbox Live Networking Service
  try {
    const xboxServiceStatus = await checkXboxLiveNetworkingService();
    diagnostics.xboxNetworking = xboxServiceStatus.running;

    if (xboxServiceStatus.exists && !xboxServiceStatus.running) {
      diagnostics.issues.push({
        type: "xbox_networking",
        severity: "high",
        message:
          "Xbox Live Networking Service is not running. This may cause P2P connection issues.",
        fix: "Restart the service using the 'Restart Xbox Live Networking' button in diagnostics.",
      });
    }

    if (xboxServiceStatus.running) {
      console.log("[Diagnostics] ✅ Xbox Live Networking Service: OK");
    } else if (xboxServiceStatus.exists) {
      console.log(
        "[Diagnostics] ⚠️  Xbox Live Networking Service: Not Running"
      );
    }
  } catch (error) {
    console.error(
      "[Diagnostics] Error checking Xbox Live Networking:",
      error.message
    );
  }

  // Check GPU and drivers
  try {
    const gpuInfo = await detectGPUVendor();
    diagnostics.gpuInfo = gpuInfo;

    const driverInfo = await checkGPUDrivers();
    diagnostics.gpuDrivers = driverInfo.hasDrivers;

    if (!driverInfo.hasDrivers) {
      diagnostics.issues.push({
        type: "gpu_drivers",
        severity: "critical",
        message:
          "GPU drivers may be missing or outdated. This can cause graphics errors.",
        fix: "Update your GPU drivers through Windows Update (Optional Updates) or from your GPU manufacturer's website.",
      });
    } else {
      console.log(`[Diagnostics] ✅ GPU Drivers: OK (${gpuInfo.name})`);
    }
  } catch (error) {
    console.error("[Diagnostics] Error checking GPU:", error.message);
  }

  // Check NAT Type (important for P2P!)
  try {
    const natInfo = await detectNATType();
    diagnostics.natType = natInfo;
    console.log(`[Diagnostics] NAT Type: ${natInfo.type}`);
  } catch (error) {
    console.error("[Diagnostics] Error checking NAT:", error.message);
  }

  // Check Windows Firewall
  try {
    const firewallInfo = await checkWindowsFirewall();
    diagnostics.firewall = firewallInfo;
    console.log(`[Diagnostics] Firewall: ${firewallInfo.status}`);
  } catch (error) {
    console.error("[Diagnostics] Error checking firewall:", error.message);
  }

  // Check Network Connectivity
  try {
    const networkInfo = await checkNetworkConnectivity();
    diagnostics.network = networkInfo;
    if (!networkInfo.online) {
      diagnostics.issues.push({
        type: "network",
        severity: "critical",
        message:
          "No internet connection detected. Online multiplayer requires internet access.",
        fix: "Check your internet connection.",
      });
    }
    console.log(`[Diagnostics] Network: ${networkInfo.status}`);
  } catch (error) {
    console.error("[Diagnostics] Error checking network:", error.message);
  }

  // Check .NET Framework
  try {
    const dotNetInfo = await checkDotNetFramework();
    diagnostics.dotNet = dotNetInfo;
    if (!dotNetInfo.installed) {
      diagnostics.issues.push({
        type: "dotnet",
        severity: "high",
        message:
          ".NET Framework 3.5 is not installed. GFWL requires .NET Framework 3.5.",
        fix: "Install .NET Framework 3.5 through Windows Features.",
      });
    }
    console.log(`[Diagnostics] .NET Framework: ${dotNetInfo.version}`);
  } catch (error) {
    console.error("[Diagnostics] Error checking .NET:", error.message);
  }

  // Get OS info
  try {
    let osDisplay = os.type();
    if (osDisplay === "Windows_NT") {
      const release = os.release();
      const version = parseInt(release.split(".")[0]);
      if (version === 10) {
        const build = parseInt(release.split(".")[2] || "0");
        osDisplay = build >= 22000 ? "Windows 11" : "Windows 10";
      }
    }
    diagnostics.os = osDisplay;
  } catch (error) {
    console.error("[Diagnostics] Error getting OS:", error.message);
  }

  console.log("========================================");
  console.log(
    `[Diagnostics] Found ${diagnostics.issues.length} issue(s), auto-fixed ${diagnostics.autoFixed.length}`
  );
  console.log("========================================\n");

  return diagnostics;
}

// Add this handler
let cancelDownloadRequested = false;

ipcMain.handle("cancel-download", () => {
  cancelDownloadRequested = true;
  return { success: true };
});

// Update the download-game handler to check for existing components
ipcMain.handle("download-game", async () => {
  try {
    if (downloadInProgress) {
      return { success: false, error: "Download already in progress" };
    }

    downloadInProgress = true;
    cancelDownloadRequested = false;

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
    console.log("\n========================================");
    console.log("📋 CHECKING EXISTING COMPONENTS");
    console.log("========================================");
    const dx9Installed = await isDX9Installed();
    const gfwlInstalled = await isGFWLInstalled();
    const gameFilesAlreadyPresent = checkGameFilesExist();

    console.log(
      `[Component Check] DirectX 9+: ${
        dx9Installed
          ? "✅ INSTALLED (will skip)"
          : "⬇️  MISSING (will download)"
      }`
    );
    console.log(
      `[Component Check] GFWL: ${
        gfwlInstalled
          ? "✅ INSTALLED (will skip)"
          : "⬇️  MISSING (will download)"
      }`
    );
    console.log(
      `[Component Check] Game Files: ${
        gameFilesAlreadyPresent
          ? "✅ PRESENT (will skip)"
          : "⬇️  MISSING (will download)"
      }`
    );
    console.log("========================================\n");

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

      const gfwlSuccess = await downloadFile(
        GFWL_URL,
        gfwlPath,
        (progress, statusMessage) => {
          mainWindow.webContents.send("gfwl-progress", progress);
          if (statusMessage) {
            mainWindow.webContents.send("download-message", statusMessage);
          }
        }
      );

      if (cancelDownloadRequested) {
        downloadInProgress = false;
        mainWindow.webContents.send("download-message", "Download cancelled");
        return { success: false, cancelled: true };
      }

      if (!gfwlSuccess) {
        downloadInProgress = false;
        mainWindow.webContents.send(
          "download-message",
          "❌ Failed to download Games for Windows Live. Please check your internet connection."
        );
        mainWindow.webContents.send(
          "download-error",
          "Failed to download Games for Windows Live. Check your internet connection."
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
      console.log("\n========================================");
      console.log("🎮 INSTALLING GFWL SILENTLY");
      console.log("========================================");

      const gfwlInstallerPath = path.join(GAME_FILES_TEMP, "gfwlivesetup.exe");
      console.log(
        `[GFWL Install] Checking for installer at: ${gfwlInstallerPath}`
      );
      console.log(
        `[GFWL Install] File exists: ${fs.existsSync(gfwlInstallerPath)}`
      );

      if (fs.existsSync(gfwlInstallerPath)) {
        mainWindow.webContents.send(
          "download-message",
          "⚙️ Installing GFWL silently in background..."
        );

        console.log("[GFWL Install] Running silent installation...");
        try {
          await runSilentInstaller(gfwlInstallerPath);
          console.log("[GFWL Install] ✅ Installation completed");
          mainWindow.webContents.send("gfwl-progress", 100);
        } catch (error) {
          console.error(
            `[GFWL Install] ❌ Installation error: ${error.message}`
          );
          console.error(`[GFWL Install] Stack: ${error.stack}`);
          // Continue anyway - GFWL install errors are non-fatal
          mainWindow.webContents.send("gfwl-progress", 100);
        }
      } else {
        console.warn("[GFWL Install] ⚠️  Installer not found, skipping");
      }
      console.log("========================================\n");
    }

    // STEP 3: Download and install DirectX 9 FIRST (if needed) - BEFORE Shadowrun download
    if (!dx9Installed) {
      // Download DirectX 9
      const dx9Path = path.join(GAME_FILES_TEMP, "directx_Jun2010_redist.exe");
      mainWindow.webContents.send(
        "download-message",
        "📥 Downloading DirectX 9 (required graphics library)..."
      );

      const dx9Success = await downloadFile(
        DX9_URL,
        dx9Path,
        (progress, statusMessage) => {
          mainWindow.webContents.send("dx-progress", progress);
          if (statusMessage) {
            mainWindow.webContents.send("download-message", statusMessage);
          }
        }
      );

      if (cancelDownloadRequested) {
        downloadInProgress = false;
        mainWindow.webContents.send("download-message", "Download cancelled");
        return { success: false, cancelled: true };
      }

      if (!dx9Success) {
        downloadInProgress = false;
        mainWindow.webContents.send(
          "download-message",
          "❌ Failed to download DirectX 9. Please check your internet connection."
        );
        mainWindow.webContents.send(
          "download-error",
          "Failed to download DirectX 9. Check your internet connection."
        );
        return { success: false, error: "Failed to download DirectX 9" };
      }

      // Install DirectX 9 SILENTLY
      console.log("\n========================================");
      console.log("🎮 INSTALLING DIRECTX 9 SILENTLY");
      console.log("========================================");
      console.log(`[DX9 Install] Installer path: ${dx9Path}`);

      mainWindow.webContents.send(
        "download-message",
        "⚙️ Installing DirectX 9 silently in background..."
      );

      try {
        await runSilentInstaller(dx9Path);
        console.log("[DX9 Install] ✅ Installation completed");
      } catch (error) {
        console.error(`[DX9 Install] ❌ Installation error: ${error.message}`);
        // Continue anyway - DX9 install errors are non-fatal
      }
      console.log("========================================\n");
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
                    console.log(
                      `[Download] Successfully created directory with admin and set permissions: ${dirPath}`
                    );
                    resolve(true);
                  } else {
                    console.log(
                      `[Download] Directory created but still not writable - permissions may need adjustment: ${dirPath}`
                    );
                    if (stdout) {
                      console.log(`[Download] PowerShell output: ${stdout}`);
                    }
                    if (stderr) {
                      console.log(`[Download] PowerShell errors: ${stderr}`);
                    }
                    resolve(false);
                  }
                } else {
                  console.log(
                    `[Download] Directory creation failed or was cancelled: ${dirPath}`
                  );
                  if (error) {
                    console.log(`[Download] Error: ${error.message}`);
                  }
                  resolve(false);
                }
              }, 1000); // Increased delay to allow permissions to propagate
            }
          );
        } catch (fileError) {
          console.error(
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
            GAME_INSTALL_DIR = programFilesPath;
            RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");
            console.log(
              `[Download] Using Program Files location: ${GAME_INSTALL_DIR}`
            );
            useProgramFiles = true;
          } else {
            // Directory created but not writable, use fallback
            console.log(
              `[Download] Program Files directory created but not writable, using fallback`
            );
            mainWindow.webContents.send(
              "download-message",
              "⚠️ Could not set write permissions. Using user folder instead..."
            );
            const fallbackCreated = await createDirectoryWithPermissions(
              GAME_INSTALL_DIR
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
          console.log(
            `[Download] Failed to create Program Files directory, using fallback`
          );
          mainWindow.webContents.send(
            "download-message",
            "⚠️ Administrator privileges were denied or cancelled. Using user folder instead..."
          );
          const fallbackCreated = await createDirectoryWithPermissions(
            GAME_INSTALL_DIR
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
        GAME_INSTALL_DIR = programFilesPath;
        RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");
        console.log(
          `[Download] Using Program Files location (already accessible): ${GAME_INSTALL_DIR}`
        );
        useProgramFiles = true;
      }
    } else {
      // Already running as admin, try Program Files first
      const canWriteProgramFiles = isDirectoryWritable(programFilesPath);
      if (canWriteProgramFiles) {
        GAME_INSTALL_DIR = programFilesPath;
        RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");
        console.log(
          `[Download] Using Program Files location (admin): ${GAME_INSTALL_DIR}`
        );
        useProgramFiles = true;
      } else {
        // Admin but can't write to Program Files, use fallback
        console.log(
          `[Download] Program Files not writable, using fallback location`
        );
        const dirCreated = await createDirectoryWithPermissions(
          GAME_INSTALL_DIR
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
    if (useProgramFiles && !fs.existsSync(GAME_INSTALL_DIR)) {
      try {
        fs.mkdirSync(GAME_INSTALL_DIR, { recursive: true });
      } catch (error) {
        // If creation fails, fall back to user location
        console.log(
          `[Download] Failed to create Program Files directory, using fallback`
        );
        const dirCreated = await createDirectoryWithPermissions(
          GAME_INSTALL_DIR
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
    const gameFilesExist = checkGameFilesExist();

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

      const gameFilesSuccess = await downloadFile(
        GAME_FILES_URL,
        gameFilesPath,
        (progress, statusMessage) => {
          mainWindow.webContents.send("game-files-progress", progress);
          if (statusMessage) {
            mainWindow.webContents.send("download-message", statusMessage);
          }
        }
      );

      if (cancelDownloadRequested) {
        downloadInProgress = false;
        mainWindow.webContents.send("download-message", "Download cancelled");
        return { success: false, cancelled: true };
      }

      if (!gameFilesSuccess) {
        downloadInProgress = false;
        mainWindow.webContents.send(
          "download-message",
          "❌ Failed to download game files. Please check your internet connection and try again."
        );
        mainWindow.webContents.send(
          "download-error",
          "Failed to download game files. Check your internet connection."
        );
        return { success: false, error: "Failed to download game files" };
      }

      // Download completed successfully
      console.log(
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

      console.log("[Download] Starting extraction of game files...");
      console.log(`[Download] Source: ${gameFilesPath}`);
      console.log(`[Download] Destination: ${GAME_INSTALL_DIR}`);

      let extractSuccess = false;
      try {
        extractSuccess = await extractZip(gameFilesPath, GAME_INSTALL_DIR);
        console.log(
          `[Download] Extraction completed, result: ${extractSuccess}`
        );

        // Check if extraction created a nested "build" folder
        const nestedBuildPath = path.join(GAME_INSTALL_DIR, "build");
        if (fs.existsSync(nestedBuildPath)) {
          console.log(
            "[Download] Detected nested 'build' folder, moving contents up one level..."
          );

          // Move all files from nested build folder to root
          const files = fs.readdirSync(nestedBuildPath);
          for (const file of files) {
            const srcPath = path.join(nestedBuildPath, file);
            const destPath = path.join(GAME_INSTALL_DIR, file);

            // Skip if file already exists at destination
            if (!fs.existsSync(destPath)) {
              console.log(`[Download] Moving: ${file}`);
              fs.renameSync(srcPath, destPath);
            } else {
              console.log(`[Download] Skipping existing file: ${file}`);
            }
          }

          // Remove the now-empty nested build folder
          try {
            fs.rmdirSync(nestedBuildPath);
            console.log("[Download] Removed nested build folder");
          } catch (rmdirError) {
            console.warn(
              "[Download] Could not remove nested build folder (may not be empty):",
              rmdirError.message
            );
          }
        }
      } catch (extractError) {
        console.error("[Download] Extraction threw an error:", extractError);
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

      console.log("[Download] Game files extraction completed successfully");

      // Verify that game files were actually extracted
      const gameExePath = path.join(GAME_INSTALL_DIR, "Shadowrun.exe");
      console.log(
        `[Download] Verifying game executable exists at: ${gameExePath}`
      );
      if (!fs.existsSync(gameExePath)) {
        console.error(
          "[Download] ERROR: Shadowrun.exe not found after extraction!"
        );
        console.error(
          `[Download] Checking if directory exists: ${GAME_INSTALL_DIR}`
        );
        console.error(
          `[Download] Directory exists: ${fs.existsSync(GAME_INSTALL_DIR)}`
        );
        if (fs.existsSync(GAME_INSTALL_DIR)) {
          const files = fs.readdirSync(GAME_INSTALL_DIR);
          console.error(`[Download] Files in directory: ${files.join(", ")}`);
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
      console.log("[Download] ✓ Game executable verified successfully");

      // Create dxvk.conf with default values if it doesn't exist
      const dxvkConfPath = path.join(GAME_INSTALL_DIR, "dxvk.conf");
      console.log(`[Download] Checking for dxvk.conf at: ${dxvkConfPath}`);
      if (!fs.existsSync(dxvkConfPath)) {
        try {
          const defaultConfig = `dxgi.maxFrameRate = 85
d3d9.maxFrameRate = 85
`;
          fs.writeFileSync(dxvkConfPath, defaultConfig);
          console.log(
            "[Download] Created default dxvk.conf file with 85 FPS limit"
          );
        } catch (error) {
          console.warn("[Download] Failed to create dxvk.conf file:", error);
          // Non-critical, continue with installation
        }
      } else {
        console.log("[Download] dxvk.conf already exists, skipping creation");
      }

      // Ensure game files progress shows 100% after extraction
      mainWindow.webContents.send("game-files-progress", 100);
      console.log("[Download] Sent game-files-progress: 100");
    }

    // GFWL and DirectX are already installed/downloaded above (before Shadowrun)
    // No need to check again here

    // Complete installation
    console.log(
      "[Download] ===== Installation process completed successfully ====="
    );
    mainWindow.webContents.send(
      "download-message",
      "✅ Installation complete! Shadowrun is ready to play."
    );
    console.log("[Download] Sent completion message to UI");

    // Ensure all progress bars show complete
    mainWindow.webContents.send("game-files-progress", 100);
    mainWindow.webContents.send("gfwl-progress", 100);
    mainWindow.webContents.send("dx-progress", 100);
    console.log("[Download] Sent all progress bars to 100%");

    // Notify renderer that download is complete and game is installed
    console.log("[Download] Sending completion events...");
    mainWindow.webContents.send("download-complete");
    mainWindow.webContents.send("game-installation-status", {
      installed: true,
    });

    // Clean up downloads
    downloadInProgress = false;

    // Auto-launch is DISABLED - game will NOT launch automatically after download
    // To enable auto-launch, set AUTO_LAUNCH_AFTER_DOWNLOAD = true at line 66
    if (AUTO_LAUNCH_AFTER_DOWNLOAD) {
      console.log("[Download] Auto-launch enabled, launching game...");
      setTimeout(async () => {
        // Give UI a moment to update before launching
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-launching-game");
        }
        // Launch the game (use the same settings that would be used from the Play button)
        const defaultSettings = await loadSettingsFromDisk();
        await launchGameLogic(defaultSettings, "auto-launch");
      }, 2000);
    }
    // No else block - silently skip auto-launch when disabled

    return { success: true };
  } catch (error) {
    console.error("Download error:", error);
    mainWindow.webContents.send("download-error", error.message);
    downloadInProgress = false;
    return { success: false, error: error.message };
  } finally {
    // Always make sure downloadInProgress is reset even if there's an uncaught exception
    downloadInProgress = false;
  }
});

// Add this function to check if game files already exist
function checkGameFilesExist() {
  try {
    const exePath = path.join(GAME_INSTALL_DIR, "Shadowrun.exe");
    return fs.existsSync(exePath);
  } catch (error) {
    console.error("Error checking game files:", error);
    return false;
  }
}

// Add this helper function to run installers
async function runInstaller(installerPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(installerPath)) {
      console.error(`Installer not found: ${installerPath}`);
      resolve(false);
      return;
    }

    const process = spawn(installerPath, ["/quiet", "/passive"], {
      detached: true,
      windowsHide: false,
    });

    process.on("error", (error) => {
      console.error(`Installer error: ${error.message}`);
      resolve(false);
    });

    process.on("exit", (code) => {
      console.log(`Installer exited with code ${code}`);
      resolve(code === 0);
    });
  });
}

// Replace the current downloadFile function with this one that handles both HTTP and HTTPS
async function downloadFile(url, destination, progressCallback) {
  return new Promise((resolve) => {
    console.log(`Downloading file from ${url} to ${destination}`);

    // Report "connecting" immediately
    if (progressCallback) {
      progressCallback(0, "Connecting to server...");
    }

    const file = fs.createWriteStream(destination);
    let isCancelled = false;
    let isFinished = false;
    let isResolved = false;
    let firstChunkReceived = false;

    // Helper to safely resolve
    const safeResolve = (success) => {
      if (isResolved) return;
      isResolved = true;
      resolve(success);
    };

    // Choose the correct protocol module based on the URL
    const httpModule = url.startsWith("https:") ? https : http;

    const request = httpModule.get(url, (response) => {
      console.log(`Download response status: ${response.statusCode}`);

      // Report that connection established
      if (progressCallback && response.statusCode === 200) {
        progressCallback(0, "Download starting...");
      }

      // Set up a timeout warning if first chunk takes too long
      const firstChunkTimeout = setTimeout(() => {
        if (!firstChunkReceived && !isCancelled && !isFinished) {
          console.warn(
            `[Download] Warning: No data received after 10 seconds. Server may be slow or preparing large file.`
          );
          if (progressCallback) {
            progressCallback(
              0,
              "Waiting for server response... (this may take a minute for large files)"
            );
          }
        }
      }, 10000); // 10 second warning

      // Helper to cleanup streams (defined inside callback to access response)
      const cleanup = () => {
        clearTimeout(firstChunkTimeout);
        if (!isFinished) {
          try {
            response.destroy();
          } catch (e) {}
          try {
            file.destroy();
          } catch (e) {}
          try {
            fs.unlink(destination, () => {});
          } catch (e) {}
        }
      };

      if (response.statusCode !== 200) {
        console.error(`Failed to download file: ${response.statusCode}`);
        cleanup();
        safeResolve(false);
        return;
      }

      // Get file size for progress calculation
      const totalSize = parseInt(response.headers["content-length"], 10);
      let downloadedSize = 0;
      let isPaused = false;

      // Handle backpressure: pause response when file buffer is full, resume on drain
      file.on("drain", () => {
        if (!isCancelled && !isFinished && isPaused) {
          isPaused = false;
          response.resume();
        }
      });

      // Manually handle data chunks for better cancellation control
      response.on("data", (chunk) => {
        // Log first chunk arrival
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          clearTimeout(firstChunkTimeout);
          console.log(
            `[Download] First data chunk received (${chunk.length} bytes)`
          );
          console.log(
            `[Download] Total file size: ${totalSize} bytes (${(
              totalSize /
              1024 /
              1024
            ).toFixed(2)} MB)`
          );
        }

        // Check if download was cancelled
        if (cancelDownloadRequested && !isCancelled) {
          isCancelled = true;
          console.log("Download cancelled by user");
          request.abort();
          cleanup();
          safeResolve(false);
          return;
        }

        if (isCancelled || isFinished) {
          return;
        }

        // Write chunk to file
        try {
          const canContinue = file.write(chunk);
          if (!canContinue && !isPaused) {
            // Buffer is full, pause the response stream
            isPaused = true;
            response.pause();
          }

          downloadedSize += chunk.length;
          // Calculate and report progress if callback provided
          if (progressCallback && totalSize) {
            const percent = Math.floor((downloadedSize / totalSize) * 100);
            const mbDownloaded = (downloadedSize / 1024 / 1024).toFixed(2);
            const mbTotal = (totalSize / 1024 / 1024).toFixed(2);
            progressCallback(
              percent,
              `Downloading: ${mbDownloaded} MB / ${mbTotal} MB`
            );
          }
        } catch (err) {
          if (!isCancelled) {
            console.error("Error writing chunk:", err.message);
            cleanup();
            safeResolve(false);
          }
        }
      });

      response.on("end", () => {
        if (!isCancelled && !isFinished) {
          console.log("[Download] Response stream ended, finalizing file...");
          // Don't set isFinished here - let the file 'finish' event handle it
          file.end();
        }
      });

      file.on("finish", () => {
        if (!isCancelled) {
          isFinished = true;
          console.log("Download completed successfully");
          file.close();
          safeResolve(true);
        }
      });

      file.on("error", (err) => {
        if (!isCancelled) {
          console.error("File write error:", err.message);
          cleanup();
          safeResolve(false);
        }
      });

      response.on("error", (err) => {
        if (!isCancelled && !isFinished) {
          console.error("Response error:", err.message);
          cleanup();
          safeResolve(false);
        }
      });
    });

    request.on("error", (err) => {
      // Don't log error if it was due to cancellation
      if (!cancelDownloadRequested && !isCancelled) {
        console.error("Download error:", err.message);
      }
      if (!isFinished && !isResolved) {
        try {
          file.destroy();
        } catch (e) {}
        try {
          fs.unlink(destination, () => {});
        } catch (e) {}
        safeResolve(false);
      }
    });
  });
}

// Alternative to AdmZip - use child_process to unzip
function extractZip(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`[Extract] Starting extraction: ${zipPath} -> ${destPath}`);

    // Ensure destination directory exists
    if (!fs.existsSync(destPath)) {
      try {
        fs.mkdirSync(destPath, { recursive: true });
        console.log(`[Extract] Created destination directory: ${destPath}`);
      } catch (mkdirError) {
        console.error(
          `[Extract] Failed to create destination directory:`,
          mkdirError
        );
        reject(mkdirError);
        return;
      }
    }

    // Use PowerShell to extract zip on Windows
    const command =
      process.platform === "win32"
        ? `powershell -command "Expand-Archive -Path '${zipPath.replace(
            /'/g,
            "''"
          )}' -DestinationPath '${destPath.replace(/'/g, "''")}' -Force"`
        : `unzip -o '${zipPath}' -d '${destPath}'`;

    console.log(`[Extract] Running extraction command...`);
    exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Extract] Extraction failed:`, error);
        console.error(`[Extract] stderr:`, stderr);
        reject(error);
      } else {
        console.log(`[Extract] Extraction completed successfully`);
        if (stdout) console.log(`[Extract] stdout:`, stdout);
        resolve(true); // Return true on success
      }
    });
  });
}

// Add this function for silent installations
function runSilentInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    let installCommand;

    if (
      installerPath.includes("directx9") ||
      installerPath.includes("directx_Jun2010")
    ) {
      // Silent DirectX installation
      console.log("[Silent Installer] Detected DirectX installer");
      installCommand = `"${installerPath}" /Q /C /T:"${GAME_FILES_TEMP}\\dxtemp" && "${GAME_FILES_TEMP}\\dxtemp\\DXSETUP.exe" /silent`;
    } else if (installerPath.includes("gfwlivesetup")) {
      // Silent GFWL installation - run the bootstrapper setup.exe
      console.log("[Silent Installer] Detected GFWL installer");
      console.log(
        "[Silent Installer] Running gfwlivesetup.exe bootstrapper to install all GFWL components"
      );
      // Note: GFWL installer may briefly show a progress window - this is unavoidable
      // The gfwlivesetup.exe installer doesn't support fully hidden installation
      installCommand = `"${installerPath}" /quiet /norestart`;
    } else {
      console.log("[Silent Installer] Using default silent flags");
      installCommand = `"${installerPath}" /silent /quiet /qn /norestart`;
    }

    console.log(`[Silent Installer] Command: ${installCommand}`);
    console.log(`[Silent Installer] Starting installation...`);

    const child = exec(installCommand, (error, stdout, stderr) => {
      if (stdout) console.log(`[Silent Installer] STDOUT: ${stdout}`);
      if (stderr) console.error(`[Silent Installer] STDERR: ${stderr}`);

      if (error) {
        console.error(`[Silent Installer] Error code: ${error.code}`);
        console.error(`[Silent Installer] Error message: ${error.message}`);
        // Don't reject - installer errors are often non-fatal
        resolve();
      } else {
        console.log("[Silent Installer] Installation completed successfully");
        resolve();
      }
    });

    // Set a timeout to avoid indefinite waiting
    const timeout = setTimeout(() => {
      console.warn(
        "[Silent Installer] Installation timeout (5 min) - continuing anyway"
      );
      try {
        process.kill(child.pid);
        console.log(
          "[Silent Installer] Killed installer process after timeout"
        );
      } catch (e) {
        console.warn(
          `[Silent Installer] Could not kill installer process: ${e.message}`
        );
      }
      resolve(); // Continue anyway
    }, 5 * 60 * 1000); // 5 minutes max

    child.on("exit", (code) => {
      console.log(`[Silent Installer] Process exited with code: ${code}`);
      clearTimeout(timeout);
    });
  });
}

// Add handler to get version number
ipcMain.handle("get-version", async () => {
  try {
    // Get version from package.json (via Electron's app.getVersion())
    const version = app.getVersion();
    return { success: true, version };
  } catch (error) {
    console.error("Error fetching version:", error);
    return { success: false, version: "1.0.0" };
  }
});

// Version is now fetched from package.json via app.getVersion() - see "get-version" handler above

// Add this function near the top of your file with other helper functions
function getHttpModule(url) {
  return url.startsWith("https:") ? https : http;
}

// Validation function for activation key entries (1 key with multiple PCIDs)
function validateActivationKey(keyEntry, index) {
  const errors = [];

  // Validate ID
  if (typeof keyEntry.id !== "number") {
    errors.push(`Key ${index + 1}: 'id' must be a number`);
  }

  // Validate name (optional, but if present must be string)
  if (keyEntry.name !== undefined && typeof keyEntry.name !== "string") {
    errors.push(`Key ${index + 1}: 'name' must be a string if provided`);
  }

  // Validate product key format (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)
  if (!keyEntry.productKey || typeof keyEntry.productKey !== "string") {
    errors.push(
      `Key ${index + 1}: 'productKey' is required and must be a string`
    );
  } else if (
    !/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/i.test(
      keyEntry.productKey
    )
  ) {
    errors.push(
      `Key ${
        index + 1
      }: 'productKey' must follow format XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`
    );
  }

  // Validate PCIDs array
  if (!keyEntry.pcids || !Array.isArray(keyEntry.pcids)) {
    errors.push(`Key ${index + 1}: 'pcids' must be an array`);
  } else {
    if (keyEntry.pcids.length === 0) {
      errors.push(`Key ${index + 1}: 'pcids' array cannot be empty`);
    } else if (keyEntry.pcids.length > 15) {
      errors.push(
        `Key ${index + 1}: 'pcids' array cannot have more than 15 PCIDs (got ${
          keyEntry.pcids.length
        })`
      );
    }

    // Validate each PCID format
    keyEntry.pcids.forEach((pcid, pcidIndex) => {
      if (typeof pcid !== "string") {
        errors.push(
          `Key ${index + 1}, PCID ${pcidIndex + 1}: must be a string`
        );
      } else if (!/^[0-9A-Fa-f]{16}$/.test(pcid)) {
        errors.push(
          `Key ${index + 1}, PCID ${
            pcidIndex + 1
          }: must be exactly 16 hexadecimal characters (got: '${pcid}')`
        );
      }
    });

    // Check for duplicate PCIDs within this key entry
    const uniquePcids = [...new Set(keyEntry.pcids)];
    if (uniquePcids.length !== keyEntry.pcids.length) {
      errors.push(`Key ${index + 1}: contains duplicate PCIDs`);
    }
  }

  return errors;
}

ipcMain.handle("activate-game", async () => {
  try {
    // Load activation keys configuration
    const configPath = path.join(
      app.getAppPath(),
      "app",
      "config",
      "activationKeys.json"
    );
    let activationConfig;

    try {
      const configData = fs.readFileSync(configPath, "utf8");
      activationConfig = JSON.parse(configData);
    } catch (configError) {
      console.error(
        "[Activation] Failed to load activation keys config:",
        configError
      );
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Configuration Error",
        message: "Failed to Load Activation Keys",
        detail:
          "Could not load the activation keys configuration file. Please check that app/config/activationKeys.json exists.",
        buttons: ["OK"],
      });
      return { success: false, error: "Failed to load activation config" };
    }

    // Validate configuration structure
    if (
      !activationConfig.activationKeys ||
      !Array.isArray(activationConfig.activationKeys)
    ) {
      console.error(
        "[Activation] Invalid config: activationKeys must be an array"
      );
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Configuration Error",
        message: "Invalid Activation Keys Configuration",
        detail: 'The configuration file is missing the "activationKeys" array.',
        buttons: ["OK"],
      });
      return { success: false, error: "Invalid config structure" };
    }

    if (activationConfig.activationKeys.length === 0) {
      console.error("[Activation] No activation keys defined in config");
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Configuration Error",
        message: "No Activation Keys Configured",
        detail: "The configuration file does not contain any activation keys.",
        buttons: ["OK"],
      });
      return { success: false, error: "No activation keys configured" };
    }

    // Validate each activation key entry
    const allErrors = [];
    activationConfig.activationKeys.forEach((keyEntry, index) => {
      const errors = validateActivationKey(keyEntry, index);
      allErrors.push(...errors);
    });

    if (allErrors.length > 0) {
      console.error("[Activation] Validation errors:", allErrors);
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Configuration Validation Failed",
        message: "Invalid Activation Key Data",
        detail:
          "The following validation errors were found:\n\n" +
          allErrors.join("\n"),
        buttons: ["OK"],
      });
      return { success: false, error: "Config validation failed" };
    }

    // Count total available PCIDs across all keys
    const totalPcids = activationConfig.activationKeys.reduce(
      (sum, key) => sum + key.pcids.length,
      0
    );
    console.log(
      `[Activation] Loaded ${activationConfig.activationKeys.length} activation key(s) with ${totalPcids} total PCID(s)`
    );

    // Log all available keys
    activationConfig.activationKeys.forEach((key, idx) => {
      console.log(
        `[Activation]   Key ${idx + 1}: ID=${key.id}, PCIDs=${
          key.pcids.length
        }${key.name ? `, Name="${key.name}"` : ""}`
      );
    });

    // RANDOMLY SELECT an activation key
    const randomKeyIndex = Math.floor(
      Math.random() * activationConfig.activationKeys.length
    );
    const selectedKey = activationConfig.activationKeys[randomKeyIndex];

    // RANDOMLY SELECT a PCID from that key's PCIDs array
    const randomPcidIndex = Math.floor(
      Math.random() * selectedKey.pcids.length
    );
    const ACTIVATION_PCID_HEX_STRING = selectedKey.pcids[randomPcidIndex];
    const PRODUCT_KEY = selectedKey.productKey;

    console.log(`[Activation] Random selection process:`);
    console.log(
      `[Activation]   - Selected key index: ${randomKeyIndex} (out of ${activationConfig.activationKeys.length})`
    );
    console.log(
      `[Activation]   - Selected PCID index: ${randomPcidIndex} (out of ${selectedKey.pcids.length})`
    );
    console.log(`[Activation]   - PCID to use: ${ACTIVATION_PCID_HEX_STRING}`);
    console.log(`[Activation]   - Product key: ${PRODUCT_KEY}`);

    console.log("========================================");
    console.log("🎮 STARTING GAME ACTIVATION PROCESS");
    console.log("========================================");
    console.log(
      `[Activation] Randomly selected: Key ID ${selectedKey.id}${
        selectedKey.name ? ` (${selectedKey.name})` : ""
      }`
    );
    console.log(`[Activation] Product Key: ${PRODUCT_KEY}`);
    console.log(
      `[Activation] Activation PCID: ${ACTIVATION_PCID_HEX_STRING} (${
        randomPcidIndex + 1
      } of ${selectedKey.pcids.length})`
    );
    console.log(`[Activation] Game Install Dir: ${GAME_INSTALL_DIR}`);
    console.log(`[Activation] Time: ${new Date().toLocaleTimeString()}`);

    // 2.1 Registry Accessibility Check
    console.log("\n[Step 1/6] Checking registry accessibility...");
    const canAccessRegistry = await registryUtils.checkPathAccess();
    console.log(`[Step 1/6] Registry accessible: ${canAccessRegistry}`);
    if (!canAccessRegistry) {
      console.error("[Step 1/6] ❌ FAILED: Cannot access registry");
      console.log("========================================\n");
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Activation Failed",
        message: "Registry Access Denied",
        detail:
          "Cannot access the required registry path. Please ensure you have proper permissions.",
        buttons: ["OK"],
      });
      return {
        success: false,
        error: "Registry access denied",
      };
    }

    // 3.1 Check PCID Exists
    console.log("\n[Step 2/6] Checking if PCID exists in registry...");
    const pcidExists = await registryUtils.checkPcidInRegistry();
    console.log(`[Step 2/6] PCID exists: ${pcidExists}`);
    if (!pcidExists) {
      console.error("[Step 2/6] ❌ FAILED: PCID not found");
      console.log("========================================\n");
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Activation Failed",
        message: "PCID Not Found",
        detail:
          "Please launch the game at least once to generate a PCID before attempting activation.",
        buttons: ["OK"],
      });
      return {
        success: false,
        error: "No PCID found. Launch the game first to generate a PCID.",
      };
    }

    // 3.2 Read Current PCID
    console.log("\n[Step 3/6] Reading current PCID from registry...");
    const currentPcid = await registryUtils.getPcidFromRegistry();
    console.log(
      `[Step 3/6] PCID retrieved: ${
        currentPcid ? `0x${currentPcid.toString(16).toUpperCase()}` : "FAILED"
      }`
    );
    if (!currentPcid) {
      console.error("[Step 3/6] ❌ FAILED: Could not read PCID value");
      console.log("========================================\n");
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Activation Failed",
        message: "Failed to Read PCID",
        detail: "Could not read the PCID value from registry.",
        buttons: ["OK"],
      });
      return {
        success: false,
        error: "Failed to retrieve current PCID",
      };
    }

    // 3.3 Check for Existing Backup & Create if Needed
    console.log("\n[Step 4/6] Checking for PCID backup...");
    const backupExists = await registryUtils.checkSrPcidBackupExists();
    console.log(`[Step 4/6] Backup exists: ${backupExists}`);
    if (!backupExists) {
      console.log("[Step 4/6] Creating PCID backup...");
      const backupResult = await registryUtils.backupPcidToRegistryViaRegFile(
        currentPcid
      );
      console.log(
        `[Step 4/6] Backup result: ${
          backupResult ? JSON.stringify(backupResult) : "NULL"
        }`
      );

      if (!backupResult || !backupResult.success) {
        console.error("[Step 4/6] ❌ FAILED: Could not create PCID backup");
        console.log("========================================\n");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Activation Failed",
          message: "PCID Backup Failed",
          detail:
            "Failed to create a PCID backup. Activation cannot continue without a recovery point.",
          buttons: ["OK"],
        });
        return {
          success: false,
          error: "Failed to create PCID backup",
        };
      }
      console.log("[Step 4/6] ✅ PCID backup created successfully");
    } else {
      console.log("[Step 4/6] ✅ Backup already exists - skipping");
    }

    // 4. Registry-Based Game Activation
    try {
      console.log("\n[Step 5/6] Applying registry-based game activation...");
      console.log(`[Step 5/6] Using game directory: ${GAME_INSTALL_DIR}`);
      console.log(`[Step 5/6] Using product key: ${PRODUCT_KEY}`);
      console.log(
        `[Step 5/6] Using activation PCID: ${ACTIVATION_PCID_HEX_STRING}`
      );

      // Set activation PCID paired with this key
      // The PCID is stored as a QWORD (64-bit) hexadecimal value in the registry
      // Format: 16-character hex string (e.g., "4550b3e602efbbf6")
      console.log(
        `[Step 5/6] Setting activation PCID: ${ACTIVATION_PCID_HEX_STRING}`
      );
      const pcidSetResult = await registryUtils.setPcidInRegistry(
        ACTIVATION_PCID_HEX_STRING
      );

      if (!pcidSetResult || !pcidSetResult.success) {
        console.error(`[Step 5/6] ❌ FAILED to set activation PCID`);
        throw new Error("Failed to set activation PCID");
      }
      console.log(`[Step 5/6] ✅ Activation PCID set successfully`);

      const activationRegResult = await registryUtils.activateGameInRegistry(
        GAME_INSTALL_DIR,
        PRODUCT_KEY
      );

      console.log(
        `[Step 5/6] Activation result: ${
          activationRegResult ? JSON.stringify(activationRegResult) : "NULL"
        }`
      );

      if (!activationRegResult || !activationRegResult.success) {
        const errorMsg =
          (activationRegResult && activationRegResult.error) ||
          "Failed to apply registry settings for activation.";
        console.error(`[Step 5/6] ❌ FAILED: ${errorMsg}`);
        console.log("========================================\n");
        throw new Error(errorMsg);
      }

      console.log("[Step 5/6] ✅ Registry activation completed successfully");

      // 5.5. Delete Token Cache Files BEFORE Native Token Injection
      console.log(
        "\n[Pre-Step 6/6] Deleting token cache files (required before injection)..."
      );
      const tokenDeletionResult = await registryUtils.deleteTokenFiles();
      if (!tokenDeletionResult || !tokenDeletionResult.success) {
        console.warn("[Pre-Step 6/6] ⚠️  Could not delete all token files");
        console.warn(
          `[Pre-Step 6/6] Errors: ${JSON.stringify(
            tokenDeletionResult?.errors
          )}`
        );
      } else {
        console.log("[Pre-Step 6/6] ✅ Token files deleted successfully");
      }

      // 6. Native Token Injection via XLiveActivateHelper.exe (x86)
      console.log(
        "\n[Step 6/6] Attempting native token injection via XLiveActivateHelper.exe..."
      );
      let tokenInjectionSuccess = false;
      try {
        // Check if .NET 6.0 Desktop Runtime x86 is installed (REQUIRED for helper)
        console.log(
          "[Step 6/6] Checking for .NET 6.0 Desktop Runtime (x86)..."
        );
        const dotnet6Check = await checkDotNet6x86Runtime();
        console.log(
          `[Step 6/6] .NET 6.0 x86 Runtime: ${
            dotnet6Check.installed
              ? `✅ Installed (${dotnet6Check.version})`
              : "❌ Not Installed"
          }`
        );

        if (!dotnet6Check.installed) {
          console.warn(
            "[Step 6/6] ⚠️  .NET 6.0 Desktop Runtime (x86) is NOT installed"
          );
          console.warn(
            "[Step 6/6]    XLiveActivateHelper.exe requires .NET 6.0 to run"
          );
          console.warn(
            "[Step 6/6]    Registry activation succeeded, but token injection will be skipped"
          );

          // Show custom dialog offering to install .NET 6.0
          const installDotnet = await dialog.showMessageBox(mainWindow, {
            type: "warning",
            title: "Missing .NET 6.0 Runtime",
            message: ".NET 6.0 Desktop Runtime (x86) Not Found",
            detail:
              "The activation helper requires .NET 6.0 Desktop Runtime (x86) to inject the product key automatically.\n\n" +
              "Would you like to install it now? (Recommended)\n\n" +
              "Installation will take 1-2 minutes and happen in the background.",
            buttons: ["Install .NET 6.0", "Skip (Use Manual Key)"],
            defaultId: 0,
            cancelId: 1,
          });

          if (installDotnet.response === 0) {
            // User wants to install .NET 6.0
            console.log("[Step 6/6] User confirmed .NET 6.0 installation");
            console.log("[Step 6/6] Downloading and installing .NET 6.0...");

            try {
              // Download and install .NET 6.0 silently
              const installResult = await downloadAndInstallDotNet6();

              if (installResult.success) {
                console.log("[Step 6/6] ✅ .NET 6.0 installed successfully!");
                console.log("[Step 6/6] Continuing with token injection...");
                // Don't throw error - continue to token injection below
              } else {
                console.warn(
                  "[Step 6/6] ⚠️  .NET 6.0 installation failed or was cancelled"
                );
                console.warn(`[Step 6/6]    Error: ${installResult.error}`);
                throw new Error("DOTNET_INSTALL_FAILED");
              }
            } catch (installError) {
              console.error(
                "[Step 6/6] ❌ Error during .NET 6.0 installation:",
                installError
              );
              throw new Error("DOTNET_INSTALL_ERROR");
            }
          } else {
            console.log("[Step 6/6] User chose to skip .NET 6.0 installation");
            // Skip token injection, continue to show product key
            throw new Error("DOTNET_NOT_INSTALLED");
          }
        }

        // Look for XLiveActivateHelper.exe (BlackAnt's KeyWriter)
        // Try multiple locations (dev vs production)
        const possibleHelperPaths = [
          // Production (packaged app)
          path.join(
            process.resourcesPath || app.getAppPath(),
            "XLiveActivateHelper.exe"
          ),
          // Development (project root - where we copied it)
          path.join(app.getAppPath(), "XLiveActivateHelper.exe"),
          // Development (built location)
          path.join(
            app.getAppPath(),
            "resources",
            "XLiveActivateHelper",
            "XLIVEActivateHelper",
            "bin",
            "Release",
            "net6.0",
            "win-x86",
            "XLIVEActivateHelper.exe"
          ),
          // Alternative dev location (relative to __dirname)
          path.join(__dirname, "..", "XLiveActivateHelper.exe"),
        ];

        let helperPath = null;
        for (const possiblePath of possibleHelperPaths) {
          console.log(`[Step 6/6] Checking path: ${possiblePath}`);
          if (fs.existsSync(possiblePath)) {
            helperPath = possiblePath;
            console.log(`[Step 6/6] ✅ Found helper at: ${possiblePath}`);
            break;
          }
        }

        if (helperPath) {
          console.log(`[Step 6/6] ✅ Found XLiveActivateHelper.exe`);
          console.log(
            `[Step 6/6] Calling XLiveSetSponsorToken via x86 helper...`
          );
          console.log(`[Step 6/6] Product Key: ${PRODUCT_KEY}`);
          console.log(`[Step 6/6] Title ID: 1297287126 (0x4D5307D6)`);

          const helperResult = await new Promise((resolve) => {
            // Set working directory to game directory so xlive.dll can be found
            const helperProcess = spawn(helperPath, [PRODUCT_KEY], {
              cwd: GAME_INSTALL_DIR,
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
            });
            console.log(
              `[Step 6/6] Process spawned with PID: ${helperProcess.pid}`
            );

            let stdout = "";
            let stderr = "";

            helperProcess.stdout.on("data", (data) => {
              const output = data.toString();
              stdout += output;
              console.log(`[Step 6/6] ${output.trim()}`);
            });

            helperProcess.stderr.on("data", (data) => {
              const error = data.toString();
              stderr += error;
              console.error(`[Step 6/6] ${error.trim()}`);
            });

            helperProcess.on("close", (code) => {
              console.log(`[Step 6/6] Helper exited with code: ${code}`);
              if (stdout) {
                console.log(`[Step 6/6] Full stdout:\n${stdout}`);
              }
              if (stderr) {
                console.error(`[Step 6/6] Full stderr:\n${stderr}`);
              }
              resolve({ code, stdout, stderr });
            });

            helperProcess.on("error", (error) => {
              console.error(`[Step 6/6] Process error: ${error.message}`);
              resolve({ code: -1, error: error.message });
            });
          });

          // Check exit code
          if (helperResult.code === 0) {
            tokenInjectionSuccess = true;
            console.log("[Step 6/6] ✅ XLiveSetSponsorToken succeeded!");
            console.log(
              "[Step 6/6] Native token injection completed successfully"
            );
          } else if (helperResult.code === 1) {
            console.warn("[Step 6/6] ⚠️  Invalid arguments passed to helper");
            console.warn(`[Step 6/6]    Exit Code: 1 (EXIT_INVALID_ARGS)`);
            console.warn(`[Step 6/6]    Product key may be malformed`);
          } else if (helperResult.code === 2) {
            console.warn(
              "[Step 6/6] ⚠️  xlive.dll not found - GFWL may not be installed"
            );
            console.warn(`[Step 6/6]    Exit Code: 2 (EXIT_DLL_NOT_FOUND)`);
            console.warn(
              `[Step 6/6]    Check GFWL installation or xlive.dll presence`
            );
          } else if (helperResult.code === 3) {
            console.warn("[Step 6/6] ⚠️  XLiveSetSponsorToken call failed");
            console.warn(`[Step 6/6]    Exit Code: 3 (EXIT_CALL_FAILED)`);
            console.warn(`[Step 6/6]    The DLL function returned an error`);
          } else if (helperResult.code === -1) {
            console.warn("[Step 6/6] ⚠️  Helper process failed to start");
            console.warn(
              `[Step 6/6]    Error: ${helperResult.error || "Unknown"}`
            );
          } else {
            console.warn(
              `[Step 6/6] ⚠️  Helper failed with exit code: ${helperResult.code}`
            );
            console.warn(`[Step 6/6]    This is an unexpected error code`);
          }
        } else {
          console.warn(
            "[Step 6/6] ⚠️  XLiveActivateHelper.exe not found in any location:"
          );
          possibleHelperPaths.forEach((p) => console.warn(`  - ${p}`));
          console.warn(
            "[Step 6/6] Registry activation should still be effective"
          );
        }
      } catch (helperError) {
        if (helperError.message === "DOTNET_NOT_INSTALLED") {
          console.log(
            "[Step 6/6] ⚠️  Skipping token injection - .NET 6.0 not installed"
          );
          console.log(
            "[Step 6/6]    User will receive product key for manual entry"
          );
        } else if (helperError.message === "DOTNET_INSTALL_FAILED") {
          console.warn(
            "[Step 6/6] ⚠️  .NET 6.0 installation failed or was cancelled"
          );
          console.warn(
            "[Step 6/6]    User will receive product key for manual entry"
          );
        } else if (helperError.message === "DOTNET_INSTALL_ERROR") {
          console.error(
            "[Step 6/6] ❌ Error occurred during .NET 6.0 installation"
          );
          console.error(
            "[Step 6/6]    User will receive product key for manual entry"
          );
        } else {
          console.error(
            `[Step 6/6] ❌ Exception calling XLiveActivateHelper: ${helperError.message}`
          );
        }
      }

      // Show warning if token injection failed (non-fatal) - auto-copy key to clipboard
      if (!tokenInjectionSuccess) {
        // AUTOMATICALLY copy the product key to clipboard
        const { clipboard } = require("electron");
        clipboard.writeText(PRODUCT_KEY);
        console.log(
          "[Activation] Product key automatically copied to clipboard"
        );

        // Setup clipboard auto-clear if configured
        const clearAfterSeconds =
          activationConfig.settings?.clearClipboardAfterSeconds || 30;
        let clipboardClearTimer = null;

        if (clearAfterSeconds > 0) {
          clipboardClearTimer = setTimeout(() => {
            // Only clear if it's still our key in the clipboard
            if (clipboard.readText() === PRODUCT_KEY) {
              clipboard.clear();
              console.log("[Activation] Clipboard auto-cleared after timeout");
              // Toast notification removed per user request
            }
          }, clearAfterSeconds * 1000);
        }

        // Show custom themed activation success dialog
        showActivationSuccessDialog(PRODUCT_KEY, clearAfterSeconds);
      }

      // 7. Success Completion
      console.log("\n========================================");
      console.log("✅ ACTIVATION PROCESS COMPLETED");
      console.log("========================================");
      console.log("Summary:");
      console.log(`  - Registry activation: SUCCESS`);
      console.log(`  - PCID backup: SUCCESS`);
      console.log(`  - Activation PCID set: SUCCESS`);
      console.log(
        `  - Token cache cleanup (pre-injection): ${
          tokenDeletionResult?.success ? "SUCCESS" : "PARTIAL"
        }`
      );
      console.log(
        `  - Native token injection: ${
          tokenInjectionSuccess ? "SUCCESS" : "FAILED (manual key required)"
        }`
      );
      console.log("========================================\n");
      console.log("NOTE: Activation PCID remains set for game activation.");
      console.log(
        "      Your original PCID backup is safely stored and can be restored later if needed."
      );
      console.log("========================================\n");

      // Success dialog and clipboard are only shown if token injection FAILED
      // (already handled above in the `if (!tokenInjectionSuccess)` block)
      return { success: true, message: "Game activated successfully." };
    } catch (error) {
      console.error("\n========================================");
      console.error("❌ ACTIVATION FAILED");
      console.error("========================================");
      console.error(`Error during activation: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
      console.error("========================================\n");
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Activation Error",
        message: "An error occurred during game activation.",
        detail: error.message || "Unknown error. Please check the logs.",
        buttons: ["OK"],
      });
      return {
        success: false,
        error: `Activation process failed: ${error.message}`,
      };
    }
  } catch (error) {
    // Catch errors from validation checks or other unexpected issues
    console.error("Outer error during game activation:", error);
    dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Activation System Error",
      message: "A system error occurred in the activation process.",
      detail: error.message || "Unknown critical error. Check logs.",
      buttons: ["OK"],
    });
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-discord", async () => {
  // Open Discord invite link - browser will handle opening Discord app if installed
  await shell.openExternal("https://discord.gg/p9uzqbNPEK");
  return { success: true };
});

ipcMain.handle("open-website", async () => {
  // Open game website
  await shell.openExternal("https://www.shadowrunfps.com");
  return { success: true };
});

// Helper function to download and handle the NoIntroFix
async function handleSkipIntroToggle(skipIntro) {
  try {
    // Create necessary directories
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const resourcesExist = fs.existsSync(RESOURCES_DIR);
    if (!resourcesExist) {
      return { success: false, error: "Game resources not found" };
    }

    const fileList = ["opening_en_us.bik", "logo_pc.bik", "notices_us.bik"];

    if (skipIntro) {
      // Enable Skip Intro

      // Check if we already have the NoIntroFix files downloaded
      const noIntroFixDir = path.join(app.getPath("userData"), "NoIntroFix");
      const noIntroFixFilesExist = fileList.every((file) =>
        fs.existsSync(path.join(noIntroFixDir, "Resources", file))
      );

      if (!noIntroFixFilesExist) {
        try {
          // First try to download
          const zipPath = path.join(os.tmpdir(), "NoIntroFix.zip");
          await downloadFile(NO_INTRO_FIX_URL, zipPath);

          // Extract it
          await extractZip(zipPath, noIntroFixDir);
        } catch (downloadError) {
          console.error("Error downloading NoIntroFix:", downloadError);

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
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("skip-intro-progress", {
              step: "download",
              status: `Downloading mod files (${progress}%)...`,
              progress,
            });
          }
        }
      );

      if (!downloadSuccess) {
        return {
          success: false,
          message: "Failed to download intro skip files",
        };
      }

      // Extract the 7z file
      log.info("Extracting NoIntroFix...");
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-progress", {
          step: "extract",
          status: "Extracting mod files...",
          progress: 50,
        });
      }

      // Use 7-Zip to extract (assuming 7z is available in PATH or bundled)
      try {
        // First check if we have bundled 7z
        let sevenZipPath = path.join(app.getAppPath(), "bin", "7z.exe");
        console.log(`Checking for bundled 7-Zip at: ${sevenZipPath}`);

        if (!fs.existsSync(sevenZipPath)) {
          // Fall back to system 7z if available
          console.log("Bundled 7-Zip not found, using system 7z");
          sevenZipPath = "7z";
        } else {
          console.log("Using bundled 7-Zip");
        }

        const extractCommand = `"${sevenZipPath}" x "${NOINTRO_TEMP_PATH}" -o"${RESOURCES_DIR}" -y`;
        console.log(`Running extract command: ${extractCommand}`);

        await new Promise((resolve, reject) => {
          exec(extractCommand, (error, stdout, stderr) => {
            if (error) {
              console.error("Extract error:", error.message);
              console.error("Extract stderr:", stderr);
              reject(error);
            } else {
              console.log("Extract stdout:", stdout);
              resolve();
            }
          });
        });
      } catch (error) {
        log.error("Failed to extract NoIntroFix", error);
        // Remove fallback that creates minimal BIK files
        log.error("Failed to extract or install NoIntroFix files", error);

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
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("skip-intro-progress", {
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
          log.warn(`Original file not found: ${file}`);
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

      // Report the results to the user
      if (modifiedFiles.length === fileList.length) {
        // All files modified successfully
        mainWindow.webContents.send("skip-intro-progress", {
          step: "complete",
          status: "",
          progress: 100,
        });
      } else {
        // Some files weren't modified
        mainWindow.webContents.send("skip-intro-progress", {
          step: "partial",
          status: "Installation incomplete",
          progress: 100,
          error:
            "Some files could not be modified. Mod may not work correctly.",
        });
      }

      // After completing, check actual state and update button
      const finalState = await checkSkipIntroStatus();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-final-state", finalState);
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

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-progress", {
          step: "complete",
          status: "",
          progress: 100,
        });
      }

      return { success: true };
    }
  } catch (error) {
    log.error("Error toggling intro skip", error);
    return { success: false, message: error.message };
  }
}

// Update the save-settings handler
ipcMain.handle("save-settings", async (event, newSettings) => {
  try {
    // Check if Skip Intro setting changed
    if (settings.skipIntro !== newSettings.skipIntro) {
      const result = await handleSkipIntroToggle(newSettings.skipIntro);
      if (!result.success) {
        return result;
      }
    }

    // Update settings
    settings = newSettings;
    saveSettingsToDisk();
    return { success: true };
  } catch (error) {
    console.error("Error saving settings:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// IPC HANDLERS FOR DIAGNOSTICS AND ERROR HANDLING
// ============================================================================

// Run system diagnostics
ipcMain.handle("run-diagnostics", async () => {
  try {
    const diagnostics = await runPreLaunchDiagnostics();
    return { success: true, diagnostics };
  } catch (error) {
    console.error("[IPC] Error running diagnostics:", error);
    return { success: false, error: error.message };
  }
});

// Get GPU information (legacy - keeping for backwards compatibility)
ipcMain.handle("get-gpu-info", async () => {
  try {
    const gpuInfo = await detectGPUVendor();
    return { success: true, gpu: gpuInfo };
  } catch (error) {
    console.error("[IPC] Error getting GPU info:", error);
    return { success: false, error: error.message };
  }
});

// Get full system information (GPU + CPU + OS)
ipcMain.handle("get-system-info", async () => {
  try {
    const systemInfo = await getSystemInfo();
    return { success: true, system: systemInfo };
  } catch (error) {
    console.error("[IPC] Error getting system info:", error);
    return { success: false, error: error.message };
  }
});

// Check and start Windows License Manager Service
ipcMain.handle("fix-license-manager", async () => {
  try {
    const serviceStatus = await checkWindowsLicenseManagerService();

    if (!serviceStatus.exists) {
      return {
        success: false,
        error: "Windows License Manager Service not found on this system",
      };
    }

    if (serviceStatus.running) {
      return {
        success: true,
        message: "Service is already running",
        alreadyRunning: true,
      };
    }

    const result = await startWindowsLicenseManagerService();
    return result;
  } catch (error) {
    console.error("[IPC] Error fixing License Manager:", error);
    return { success: false, error: error.message };
  }
});

// Restart Xbox Live Networking Service with UAC elevation
ipcMain.handle("restart-xbox-networking", async () => {
  try {
    const serviceStatus = await checkXboxLiveNetworkingService();

    if (!serviceStatus.exists) {
      return {
        success: false,
        error: "Xbox Live Networking Service not found on this system",
      };
    }

    // Use elevated version which prompts for UAC
    const result = await restartXboxLiveNetworkingServiceWithElevation();
    return result;
  } catch (error) {
    console.error(
      "[IPC] Error restarting Xbox Live Networking Service:",
      error
    );
    return { success: false, error: error.message };
  }
});

// Check DirectX installation
ipcMain.handle("check-directx", async () => {
  try {
    const installed = await isDX9Installed();
    return { success: true, installed };
  } catch (error) {
    console.error("[IPC] Error checking DirectX:", error);
    return { success: false, error: error.message };
  }
});

// Check GPU drivers
ipcMain.handle("check-gpu-drivers", async () => {
  try {
    const driverInfo = await checkGPUDrivers();
    return { success: true, drivers: driverInfo };
  } catch (error) {
    console.error("[IPC] Error checking GPU drivers:", error);
    return { success: false, error: error.message };
  }
});

// Run Windows System File Checker (for error 1603/1722)
ipcMain.handle("run-sfc-scan", async () => {
  try {
    console.log("[SFC] User requested System File Checker scan");

    // Check if running as admin
    const isAdmin = await isRunningAsAdmin();

    if (!isAdmin) {
      return {
        success: false,
        needsAdmin: true,
        error: "Administrator privileges required to run System File Checker",
      };
    }

    // Open command prompt as admin with SFC command
    exec(
      'start cmd.exe /k "echo Running System File Checker... && sfc /scannow"',
      (error) => {
        if (error) {
          console.error("[SFC] Error opening cmd:", error);
        }
      }
    );

    return {
      success: true,
      message:
        "System File Checker launched in new window. This may take several minutes to complete.",
    };
  } catch (error) {
    console.error("[IPC] Error running SFC scan:", error);
    return { success: false, error: error.message };
  }
});

// Open Windows Update (for driver updates)
ipcMain.handle("open-windows-update", async () => {
  try {
    console.log("[Windows Update] Opening Windows Update settings");
    exec("start ms-settings:windowsupdate", (error) => {
      if (error) {
        console.error("[Windows Update] Error opening settings:", error);
      }
    });
    return { success: true };
  } catch (error) {
    console.error("[IPC] Error opening Windows Update:", error);
    return { success: false, error: error.message };
  }
});

// Add this to enable Skip Intro functionality in the UI (update the setting-item)

// Add this function to read FPS from the dxvk.conf file
function readCurrentFpsFromDxvkConf() {
  try {
    const dxvkConfPath = path.join(GAME_INSTALL_DIR, "dxvk.conf");

    if (!fs.existsSync(dxvkConfPath)) {
      return null; // File doesn't exist yet
    }

    const content = fs.readFileSync(dxvkConfPath, "utf8");

    // Try to find the dxgi.maxFrameRate setting
    const dxgiMatch = content.match(/dxgi\.maxFrameRate\s*=\s*(\d+)/);
    if (dxgiMatch && dxgiMatch[1]) {
      return parseInt(dxgiMatch[1]);
    }

    // If not found, try the d3d9.maxFrameRate setting
    const d3d9Match = content.match(/d3d9\.maxFrameRate\s*=\s*(\d+)/);
    if (d3d9Match && d3d9Match[1]) {
      return parseInt(d3d9Match[1]);
    }

    return null; // No FPS setting found
  } catch (error) {
    console.error("Error reading FPS from dxvk.conf:", error);
    return null;
  }
}

// Add this to the load-settings handler
ipcMain.handle("load-settings", async () => {
  // Try to get FPS from dxvk.conf
  const fps = readCurrentFpsFromDxvkConf();
  if (fps) {
    settings.maxFrameRate = fps;
  }

  return settings;
});

// Update the DXVK.conf handler to use the game installation path
ipcMain.handle("open-dxvk-conf", async () => {
  // Path to dxvk.conf file in the game installation directory
  const dxvkConfPath = path.join(GAME_INSTALL_DIR, "dxvk.conf");

  // Create file if it doesn't exist
  if (!fs.existsSync(dxvkConfPath)) {
    fs.writeFileSync(dxvkConfPath, "# DXVK Configuration File\n");
  }

  // Open the file with default editor
  shell.openPath(dxvkConfPath);
  return { success: true };
});

// Handle window control operations
ipcMain.handle("minimize-window", () => {
  mainWindow.minimize();
  return true;
});

ipcMain.handle("close-window", () => {
  // Check if game is running before attempting to close
  if (gameProcess !== null) {
    log.info("Close window requested but game is running. Denying request.");

    // Show notification to user
    if (
      mainWindow &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send("show-notification", {
        message:
          "Cannot close launcher while the game is running. Exit the game first.",
        type: "warning",
      });
    }

    return { success: false, reason: "game-running" };
  }

  // Game is not running, allow close
  mainWindow.close();
  return { success: true };
});

// Use a more reliable dragging approach
ipcMain.handle("start-drag", () => {
  if (mainWindow) {
    // Use BrowserWindow.startDrag which is more reliable than webContents.startWindowDrag
    mainWindow.setMovable(true);
    return { success: true };
  }
  return { success: false };
});

// Add this to handle the window dragging from the renderer side
ipcMain.on("perform-drag", () => {
  if (mainWindow) {
    // More compatible approach
    mainWindow.moveTop();
    mainWindow.focus();
  }
});

// Then in the download-game handler, check this flag periodically
if (cancelDownloadRequested) {
  cancelDownloadRequested = false;
  throw new Error("Download cancelled by user");
}

// Handle setting max frame rate
ipcMain.handle("set-max-frame-rate", async (event, fps) => {
  try {
    console.log("Setting max frame rate to:", fps);

    // Update settings
    settings.maxFrameRate = parseInt(fps);
    saveSettingsToDisk();

    // Path to dxvk.conf file
    const dxvkConfPath = path.join(GAME_INSTALL_DIR, "dxvk.conf");

    console.log("DXVK config path:", dxvkConfPath);

    // Create file with default settings if it doesn't exist
    if (!fs.existsSync(dxvkConfPath)) {
      console.log("Creating new dxvk.conf file");
      const defaultConfig = `dxgi.maxFrameRate = ${fps}
d3d9.maxFrameRate = ${fps}
`;
      fs.writeFileSync(dxvkConfPath, defaultConfig);
      return { success: true };
    }

    // Read existing file
    console.log("Reading existing dxvk.conf file");
    let configContent = fs.readFileSync(dxvkConfPath, "utf8");

    // Update or add the frame rate settings - always update both together
    const dxgiRegex = /dxgi\.maxFrameRate\s*=\s*\d+/;
    const d3d9Regex = /d3d9\.maxFrameRate\s*=\s*\d+/;

    // Update or add dxgi.maxFrameRate
    if (dxgiRegex.test(configContent)) {
      console.log("Updating existing dxgi.maxFrameRate setting");
      configContent = configContent.replace(
        dxgiRegex,
        `dxgi.maxFrameRate = ${fps}`
      );
    } else {
      console.log("Adding new dxgi.maxFrameRate setting");
      // Add at the beginning if file is empty, otherwise add newline
      if (configContent.trim() === "") {
        configContent = `dxgi.maxFrameRate = ${fps}`;
      } else {
        configContent += `\ndxgi.maxFrameRate = ${fps}`;
      }
    }

    // Update or add d3d9.maxFrameRate - always ensure it matches dxgi
    if (d3d9Regex.test(configContent)) {
      console.log("Updating existing d3d9.maxFrameRate setting");
      configContent = configContent.replace(
        d3d9Regex,
        `d3d9.maxFrameRate = ${fps}`
      );
    } else {
      console.log("Adding new d3d9.maxFrameRate setting");
      configContent += `\nd3d9.maxFrameRate = ${fps}`;
    }

    console.log("New config content:", configContent);

    // Write updated config back to file
    fs.writeFileSync(dxvkConfPath, configContent);
    console.log("Config file updated successfully");

    return { success: true };
  } catch (error) {
    console.error("Error setting max frame rate:", error);
    return { success: false, error: error.message };
  }
});

// Function to initialize Discord RPC
function initDiscord() {
  if (!DiscordRPC) {
    console.log("Discord RPC integration skipped (module not available)");
    return;
  }

  try {
    // Register client ID
    DiscordRPC.register(CLIENT_ID);
    rpc = new DiscordRPC.Client({ transport: "ipc" });

    // Set activity once connected
    rpc.on("ready", () => {
      console.log("Discord RPC connected");
      updateDiscordActivity(false);

      // Update activity every minute to keep it fresh
      setInterval(() => {
        updateDiscordActivity(false);
      }, 60000);
    });

    // Handle connection errors gracefully
    rpc.on("error", (error) => {
      // Only log if it's not a common "Discord not running" error
      if (error.message !== "RPC_CONNECTION_TIMEOUT") {
        console.log("Discord RPC error:", error.message);
      }
      rpc = null;
    });

    // Connect with timeout to avoid hanging if Discord isn't running
    const connectionTimeout = setTimeout(() => {
      // Silent timeout - Discord is simply not running, which is normal
      rpc = null;
    }, 5000);

    // Try to login
    rpc
      .login({ clientId: CLIENT_ID })
      .then(() => {
        clearTimeout(connectionTimeout);
      })
      .catch((error) => {
        clearTimeout(connectionTimeout);
        // Only log non-timeout errors
        if (error.message !== "RPC_CONNECTION_TIMEOUT") {
          console.log("Discord RPC connection failed:", error.message);
        }
        rpc = null;
      });
  } catch (error) {
    console.log("Discord RPC initialization error:", error);
    rpc = null;
  }
}

// Update Discord Activity with enhanced information
function updateDiscordActivity(playing) {
  if (!rpc) return;

  const activity = playing
    ? {
        details: "Playing Shadowrun (2007)",
        state: "First-Person Shooter",
        largeImageKey: "game_logo",
        largeImageText: "Shadowrun",
        smallImageKey: "controller", // Optional: add a controller icon if you upload one
        smallImageText: "PC",
        startTimestamp: new Date(), // Shows "elapsed" time
        buttons: [
          {
            label: "🌐 Visit Website",
            url: "https://www.shadowrunfps.com",
          },
          {
            label: "💬 Join Discord",
            url: "https://discord.gg/p9uzqbNPEK",
          },
        ],
        instance: false,
      }
    : {
        details: "In Launcher",
        state: "Browsing Menu",
        largeImageKey: "launcher_logo",
        largeImageText: "Shadowrun Launcher",
        smallImageKey: "menu", // Optional: add a menu icon if you upload one
        smallImageText: "Idle",
        buttons: [
          {
            label: "🌐 Visit Website",
            url: "https://www.shadowrunfps.com",
          },
          {
            label: "💬 Join Discord",
            url: "https://discord.gg/p9uzqbNPEK",
          },
        ],
        instance: false,
      };

  rpc.setActivity(activity).catch(console.error);
}

// Clean up when the app is closing
app.on("before-quit", () => {
  // Stop player tracking
  playerTracker.stop();

  // Clean up Discord RPC
  if (rpc) {
    rpc.destroy().catch(console.error);
  }
});

// Add this handler for window movement
ipcMain.handle("move-window", (event, deltaX, deltaY) => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + deltaX, y + deltaY);
    return { success: true };
  }
  return { success: false };
});

// Add this function to find the game in multiple locations
async function findGameInstallation() {
  // Potential locations to check (in order of priority)
  const possibleLocations = [
    // Default location
    path.join(
      "C:\\Program Files (x86)\\Microsoft Games for Windows - LIVE\\Shadowrun"
    ),

    // Other common locations
    path.join(
      "C:\\Program Files\\Microsoft Games for Windows - LIVE\\Shadowrun"
    ),
    path.join("C:\\Program Files (x86)\\Shadowrun"),
    path.join("C:\\Program Files\\Shadowrun"),

    // Desktop
    path.join(app.getPath("desktop"), "Shadowrun"),

    // Documents
    path.join(app.getPath("documents"), "Shadowrun"),

    // Check for other drive letters
    ...[
      "D:",
      "E:",
      "F:",
      "G:",
      "H:",
      "I:",
      "J:",
      "K:",
      "L:",
      "M:",
      "N:",
      "O:",
      "P:",
      "Q:",
      "R:",
      "S:",
      "T:",
      "U:",
      "V:",
      "W:",
      "X:",
      "Y:",
      "Z:",
    ].map((drive) => path.join(drive, "\\Shadowrun")),

    // Program Files on other drives
    ...["D:", "E:", "F:", "G:"].map((drive) =>
      path.join(
        drive,
        "\\Program Files (x86)\\Microsoft Games for Windows - LIVE\\Shadowrun"
      )
    ),

    // User's game-specific folders
    path.join(app.getPath("home"), "Games", "Shadowrun"),

    // Steam default location
    path.join("C:\\Program Files (x86)\\Steam\\steamapps\\common\\Shadowrun"),

    // User's AppData location
    path.join(app.getPath("appData"), "Shadowrun"),
  ];

  // Check each location
  for (const location of possibleLocations) {
    if (fs.existsSync(path.join(location, "Shadowrun.exe"))) {
      return location;
    }
  }

  return null;
}

// Update the checkExistingInstallation function to check ALL dependencies
async function checkExistingInstallation() {
  try {
    // Check 1: Game files
    const foundLocation = await findGameInstallation();
    const gameFilesExist = foundLocation !== null;

    // Check 2: GFWL
    const gfwlInstalled = await isGFWLInstalled();

    // Check 3: DirectX 9+
    const dx9Installed = await isDX9Installed();

    // Game is only considered "ready to play" if ALL dependencies are met
    const allDependenciesMet = gameFilesExist && gfwlInstalled && dx9Installed;

    // Simple summary log (using plain text to avoid encoding issues)
    console.log(
      `[Install Check] Game: ${gameFilesExist ? "OK" : "MISSING"} | GFWL: ${
        gfwlInstalled ? "OK" : "MISSING"
      } | DirectX: ${dx9Installed ? "OK" : "MISSING"} | Status: ${
        allDependenciesMet ? "READY" : "MISSING"
      }`
    );

    if (foundLocation) {
      // Update the global path even if dependencies are missing
      GAME_INSTALL_DIR = foundLocation;
      RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");
    }

    // Send the status to the renderer process
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("game-installation-status", {
        installed: allDependenciesMet,
        path: foundLocation,
        dependencies: {
          gameFiles: gameFilesExist,
          gfwl: gfwlInstalled,
          dx9: dx9Installed,
        },
      });
    }

    return allDependenciesMet;
  } catch (error) {
    console.error("Error checking installation:", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("game-installation-status", {
        installed: false,
        path: null,
        dependencies: {
          gameFiles: false,
          gfwl: false,
          dx9: false,
        },
      });
    }
    return false;
  }
}

// Add IPC handler for manual check
ipcMain.handle("check-game-installed", async () => {
  const isInstalled = await checkExistingInstallation();
  return { installed: isInstalled };
});

// Add this function to check if a directory is writable
function isDirectoryWritable(dirPath) {
  try {
    // Create the directory if it doesn't exist
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Try to write a temporary file
    const testFile = path.join(dirPath, `.write-test-${Date.now()}.tmp`);
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return true;
  } catch (error) {
    console.error(`Directory not writable: ${dirPath}`, error.message);
    return false;
  }
}

// Add this function to create directory with proper permissions
async function createDirectoryWithPermissions(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error(`Failed to create directory: ${dirPath}`, error.message);

    // Try fallback locations in order of preference
    const fallbackLocations = [
      path.join(app.getPath("home"), "Games", "Shadowrun"), // Best: Dedicated Games folder
      path.join(app.getPath("documents"), "Shadowrun"), // Good: Documents folder
      path.join(app.getPath("home"), "Shadowrun"), // Last resort: Home folder
    ];

    for (const fallbackDir of fallbackLocations) {
      try {
        if (!fs.existsSync(fallbackDir)) {
          fs.mkdirSync(fallbackDir, { recursive: true });
        }
        // Verify we can write to it
        const testFile = path.join(
          fallbackDir,
          `.write-test-${Date.now()}.tmp`
        );
        fs.writeFileSync(testFile, "test");
        fs.unlinkSync(testFile);

        // Update the global installation directory
        GAME_INSTALL_DIR = fallbackDir;
        RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");
        console.log(
          `Using fallback installation directory: ${GAME_INSTALL_DIR}`
        );
        return true;
      } catch (fallbackError) {
        console.warn(
          `Fallback location failed: ${fallbackDir}`,
          fallbackError.message
        );
        continue; // Try next fallback
      }
    }

    console.error(`All fallback locations failed`);
    return false;
  }
}

// Add this function to check activation status
function checkActivationStatus() {
  const isActivated = tokenUtils.checkTokenExists();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("activation-status", {
      activated: isActivated,
    });
  }

  return isActivated;
}

// Add this function to restore original PCID
async function restoreOriginalPcid() {
  try {
    // Check if a backup PCID exists
    const backupExists = await registryUtils.checkSrPcidBackupExists();

    if (backupExists) {
      // Get the backup PCID (returns as hex string like "4550B3E602EFBBF6")
      const backupPcid = await registryUtils.getSrPcidBackupFromRegistry();

      if (backupPcid) {
        console.log(
          `[PCID Restore] Restoring original PCID from SRPCIDBACKUP: ${backupPcid}`
        );

        // Format the PCID as QWORD with reversed bytes and commas (little-endian)
        // e.g., "4550B3E602EFBBF6" -> "f6,bb,ef,02,e6,b3,50,45"
        const formattedPcid = registryUtils.formatQwordRegValue(backupPcid);

        if (!formattedPcid) {
          console.error("[PCID Restore] Failed to format backup PCID");
          return false;
        }

        console.log(
          `[PCID Restore] Formatted PCID for registry: ${formattedPcid}`
        );

        // Create registry content to restore original PCID (with proper BOM and CRLF)
        const BOM = "\uFEFF";
        const regContent =
          BOM +
          `Windows Registry Editor Version 5.00\r\n` +
          `\r\n` +
          `[HKEY_CURRENT_USER\\Software\\Classes\\SOFTWARE\\Microsoft\\XLive]\r\n` +
          `"PCID"=hex(b):${formattedPcid}\r\n`;

        // Import registry changes
        await registryUtils.importRegFile(regContent);

        console.log("[PCID Restore] ✅ Original PCID restored successfully");
        return true;
      } else {
        console.warn("[PCID Restore] ⚠️  Backup PCID value is empty/null");
      }
    } else {
      console.warn("[PCID Restore] ⚠️  No SRPCIDBACKUP exists in registry");
    }
    return false;
  } catch (error) {
    console.error("[PCID Restore] ❌ Error restoring original PCID:", error);
    return false;
  }
}

// Handle toggling skip intro
ipcMain.handle("toggle-skip-intro", async (event, enabled) => {
  try {
    // Check if game is installed
    if (!fs.existsSync(GAME_INSTALL_DIR)) {
      return { success: false, message: "Game not installed" };
    }

    // Path to Resources folder
    const resourcesPath = path.join(GAME_INSTALL_DIR, "Resources");

    // Correct files to backup/replace - these are the actual BIK files
    const targetFiles = ["logo_pc.bik", "notices_us.bik", "opening_en_us.bik"];

    // Ensure the backup folder exists
    const backupPath = path.join(resourcesPath, "BackupIntro");

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

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-progress", {
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-progress", {
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
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("skip-intro-progress", {
              step: "download",
              status: `Downloading mod files (${progress}%)...`,
              progress: 50 + Math.floor(progress / 5), // Scale to 50-70% range
            });
          }
        }
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-progress", {
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
              file
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

        // Report results
        if (modifiedFiles.length === targetFiles.length) {
          // All files modified successfully
          mainWindow.webContents.send("skip-intro-progress", {
            step: "complete",
            status: "", // Remove success message
            progress: 100,
          });
        } else {
          // Not all files were processed
          if (modifiedFiles.length > 0) {
            mainWindow.webContents.send("skip-intro-progress", {
              step: "partial",
              status: "Installation incomplete",
              progress: 100,
              error:
                "Some files could not be modified. Mod may not work correctly.",
            });
          } else {
            // No files were processed
            throw new Error(
              "No files were copied from the NoIntroFix archive."
            );
          }
        }
      } catch (error) {
        // Remove fallback that creates minimal BIK files
        log.error("Failed to extract or install NoIntroFix files", error);

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
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("skip-intro-progress", {
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-final-state", finalState);
      }

      return { success: true, state: finalState };
    } else {
      // ---- DISABLE INTRO SKIP (Uninstall the mod) ----
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-progress", {
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

        if (mainWindow && !mainWindow.isDestroyed()) {
          const progressValue =
            20 + Math.floor((fileIndex / targetFiles.length) * 60);
          mainWindow.webContents.send("skip-intro-progress", {
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
            log.error(`Failed to restore ${file}`, error);
          }
        }
      }

      // Update settings
      settings.skipIntro = false;
      saveSettingsToDisk();

      // Report results - simplified without success message
      if (restoredFiles.length === targetFiles.length) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("skip-intro-progress", {
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
            log.warn("Error cleaning up backup files (non-critical)", e);
          }
        }
      } else {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("skip-intro-progress", {
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("skip-intro-final-state", finalState);
      }

      return { success: true, state: finalState };
    }
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("skip-intro-progress", {
        step: "error",
        status: "Operation failed",
        progress: 100,
        error: error.message,
      });
    }

    return { success: false, message: error.message };
  }
});

// Add this fallback extraction method using Node.js built-in modules
async function extractZipFallback(zipPath, destPath) {
  console.log("Using fallback extraction method");
  try {
    // Use a simpler extraction method through exec
    return new Promise((resolve, reject) => {
      // On Windows, we can use PowerShell's Expand-Archive
      const command = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`;
      console.log(`Running PowerShell extract: ${command}`);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error("PowerShell extract error:", error);
          reject(error);
        } else {
          console.log("PowerShell extract success");
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error("Fallback extraction failed:", error);
    throw error;
  }
}

// Update the skip intro status detection logic to be more reliable
async function checkSkipIntroStatus() {
  try {
    if (!fs.existsSync(GAME_INSTALL_DIR)) {
      return { installed: false, backupExists: false };
    }

    const resourcesPath = path.join(GAME_INSTALL_DIR, "Resources");
    const backupPath = path.join(resourcesPath, "BackupIntro");
    const targetFiles = ["logo_pc.bik", "notices_us.bik", "opening_en_us.bik"];

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
    for (const file of targetFiles) {
      const filePath = path.join(resourcesPath, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);

        // If file is smaller than the threshold, it's likely modified
        // Original intro videos should be several megabytes in size
        if (stats.size < sizeTresholds[file]) {
          modifiedFilesCount++;
          log.info(`Detected modified ${file}: size=${stats.size} bytes`);
        } else {
          log.info(`Detected original ${file}: size=${stats.size} bytes`);
        }
      }
    }

    // Consider it installed if at least 2 of 3 files are modified
    const installed = modifiedFilesCount >= 2;

    // If mod is detected but no backup exists, create one automatically
    if (installed && !backupExists) {
      log.info("Mod detected but no backup found. Creating backup...");
      try {
        // We can't create a true backup since we don't have the original files
        // But we can at least create a marker file so the launcher knows
        if (!fs.existsSync(backupPath)) {
          fs.mkdirSync(backupPath, { recursive: true });
        }

        // Create a marker file
        fs.writeFileSync(
          path.join(backupPath, "installed_externally.txt"),
          "NoIntroFix was detected as pre-installed. Original files not available."
        );

        // Update settings to reflect the detected state
        settings.skipIntro = true;
        saveSettingsToDisk();
      } catch (e) {
        log.error("Failed to create backup marker", e);
      }
    }

    return { installed, backupExists };
  } catch (error) {
    log.error("Error checking skip intro status", error);
    return { installed: false, backupExists: false };
  }
}

// Add this IPC handler to check the mod status
ipcMain.handle("check-skip-intro-status", async () => {
  return await checkSkipIntroStatus();
});

// Add a listener for the final state update
ipcMain.on("skip-intro-final-state", (state) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("skip-intro-final-state", state);
  }
});

// Update the open-game-directory handler to use GAME_INSTALL_DIR
ipcMain.handle("open-game-directory", async () => {
  console.log("Main process: Opening game directory:", GAME_INSTALL_DIR);

  try {
    // Check if directory exists
    if (!fs.existsSync(GAME_INSTALL_DIR)) {
      console.log("Game directory not found, checking alternatives");

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
          console.log("Found alternative game location:", altPath);
          // Update the global path variable for future use
          GAME_INSTALL_DIR = altPath;
          RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");

          await shell.openPath(altPath);
          return { success: true };
        }
      }

      // If no alternative found, show a file browser dialog to let the user select the folder
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("No standard paths found, prompting user");
        const { canceled, filePaths } = await dialog.showOpenDialog(
          mainWindow,
          {
            title: "Select Shadowrun Game Directory",
            defaultPath: "C:\\Program Files (x86)",
            properties: ["openDirectory"],
          }
        );

        if (!canceled && filePaths.length > 0) {
          // Store this path for future use
          GAME_INSTALL_DIR = filePaths[0];
          RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");

          console.log("User selected:", GAME_INSTALL_DIR);
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
      console.log("Shell.openPath failed with: ", result, "trying explorer");
      exec(`explorer "${GAME_INSTALL_DIR}"`, (err) => {
        if (err) console.error("Explorer exec error:", err);
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error opening game directory:", error);

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
ipcMain.handle("show-notification", (event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("show-notification", data);
  }
  return { success: true };
});

// Handler to get current PCID
ipcMain.handle("get-current-pcid", async () => {
  try {
    console.log("Getting current PCID from registry");

    // Dump registry for diagnostics
    const registryDump = await registryUtils.dumpRegistryKey();

    // Test registry access first
    const canAccessRegistry = await registryUtils.checkPathAccess();

    if (!canAccessRegistry) {
      return {
        success: false,
        error: "Cannot access registry path",
        diagnostics: registryDump,
      };
    }

    // Check if PCID exists
    const pcidExists = await registryUtils.checkPcidInRegistry();
    console.log("PCID exists check:", pcidExists);

    if (!pcidExists) {
      console.log("No PCID found in registry");
      return {
        success: false,
        error: "No PCID found",
        diagnostics: registryDump,
      };
    }

    // Get PCID in raw form
    const rawPcid = await registryUtils.getPcidFromRegistry();
    console.log("Raw PCID from registry:", rawPcid);

    if (!rawPcid) {
      console.log("Failed to retrieve PCID value");
      return {
        success: false,
        error: "Failed to retrieve PCID value",
        diagnostics: registryDump,
      };
    }

    // Convert to formatted hex
    console.log("Converting PCID to formatted hex...");
    const formattedPcid = registryUtils.decimalToHexFormat(rawPcid);
    console.log("Current PCID (decimal):", rawPcid);
    console.log("Current PCID (formatted hex):", formattedPcid);

    return {
      success: true,
      pcid: formattedPcid,
      rawPcid: rawPcid,
      diagnostics: registryDump,
    };
  } catch (error) {
    console.error("Error getting current PCID:", error);
    return { success: false, error: error.message };
  }
});

// Add this near the top of your file
const isRunningAsAdmin = async () => {
  if (process.platform !== "win32") return false;

  return new Promise((resolve) => {
    const { exec } = require("child_process");
    exec("net session", (error) => {
      resolve(!error);
    });
  });
};

// Then update your backup-pcid handler (replace your existing one)
ipcMain.handle("backup-pcid", async () => {
  console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.log("!!!! IPC_BACKUP_PCID_CALLED in main.js !!!!");
  console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

  try {
    console.log("[Backup PCID Handler] Starting PCID backup process...");

    const pcidExists = await registryUtils.checkPcidInRegistry();
    if (!pcidExists) {
      console.log("[Backup PCID Handler] No PCID found to backup.");
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "PCID Backup Failed",
        message: "No PCID Found",
        detail:
          "You need to run the game at least once to generate a PCID that can be backed up.",
        buttons: ["OK"],
      });
      return { success: false, error: "No PCID found to backup" };
    }
    console.log("[Backup PCID Handler] PCID exists in registry.");

    const currentPcid = await registryUtils.getPcidFromRegistry();
    if (!currentPcid) {
      console.log("[Backup PCID Handler] Failed to retrieve current PCID.");
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "PCID Backup Failed",
        message: "Failed to Read PCID",
        detail: "Could not read the PCID value from registry.",
        buttons: ["OK"],
      });
      return { success: false, error: "Failed to retrieve current PCID" };
    }
    console.log("[Backup PCID Handler] Current PCID for backup:", currentPcid);

    // Use the integrated .reg file backup method from registryUtils
    try {
      console.log(
        "[Backup PCID Handler] Attempting PCID backup using registryUtils.backupPcidToRegistryViaRegFile"
      );
      const result = await registryUtils.backupPcidToRegistryViaRegFile(
        currentPcid
      );
      console.log(
        "[Backup PCID Handler] Backup result:",
        JSON.stringify(result, null, 2)
      );

      if (result.success) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "PCID Backup Successful",
          message: result.message || "PCID backup created successfully!",
          detail: result.backupPcid
            ? `Backed up PCID: 0x${result.backupPcid}`
            : "The PCID has been backed up.",
          buttons: ["OK"],
        });
      } else {
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "PCID Backup Failed",
          message: result.error || "An unknown error occurred during backup.",
          detail:
            result.details ||
            "Please check the application logs for more information.",
          buttons: ["OK"],
        });
      }
      return result; // Return the full result object
    } catch (backupError) {
      console.error(
        "[Backup PCID Handler] Critical error during backupPcidToRegistryViaRegFile call:",
        backupError
      );
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "PCID Backup Error",
        message:
          "A critical error occurred while attempting to backup the PCID.",
        detail: backupError.message || "Unknown error. Check logs.",
        buttons: ["OK"],
      });
      return {
        success: false,
        error: `Backup process failed: ${backupError.message}`,
      };
    }
  } catch (error) {
    console.error(
      "[Backup PCID Handler] Outer critical error in backup process:",
      error
    );
    dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "PCID Backup System Error",
      message: "A system error occurred in the backup process.",
      detail: error.message || "Unknown critical error. Check logs.",
      buttons: ["OK"],
    });
    return {
      success: false,
      error: error.message || "Unknown critical error in backup handler",
    };
  }
});

// Add this simple handler to test IPC
ipcMain.handle("ping-main", async () => {
  console.log("Ping received from renderer!");
  return { success: true, message: "Pong from main process!" };
});

// Add this handler
ipcMain.handle("restart-as-admin", async () => {
  const { spawn } = require("child_process");
  const path = require("path");

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
    app.quit();
    return { success: true };
  } catch (error) {
    console.error("Error creating elevation script:", error);
    return { success: false, error: error.message };
  }
});

// Add an IPC handler to show logs for debugging
ipcMain.handle("show-logs", () => {
  try {
    // Open a simple dialog with the last few log entries
    const logEntries = [];
    // Add your important log entries here

    dialog.showMessageBox({
      type: "info",
      title: "Debug Logs",
      message: "Recent application logs:",
      detail: logEntries.join("\n"),
      buttons: ["OK"],
    });

    return { success: true };
  } catch (error) {
    console.error("Error showing logs:", error);
    return { success: false, error: error.message };
  }
});

// ========================================
// AUTO-UPDATER IMPLEMENTATION
// ========================================

// Track whether the current check is manual (from button) or automatic (on startup)
let isManualUpdateCheck = false;

// Function to check for updates
function checkForUpdates(manual = false) {
  isManualUpdateCheck = manual;

  if (!mainWindow || mainWindow.isDestroyed()) {
    console.log("[Updater] Main window not ready, skipping update check");
    return;
  }

  console.log(
    `[Updater] Checking for updates... (${manual ? "MANUAL" : "AUTOMATIC"})`
  );
  console.log("[Updater] Current version:", app.getVersion());
  console.log("[Updater] Update server:", UPDATE_SERVER_URL);

  // Check for updates
  autoUpdater.checkForUpdates().catch((error) => {
    console.error("[Updater] Error checking for updates:", error);
    // Silently fail - don't bother the user if update check fails
  });
}

// When update is available
autoUpdater.on("update-available", (info) => {
  console.log("[Updater] Update available:", info.version);
  console.log("[Updater] Release notes:", info.releaseNotes);

  if (!mainWindow || mainWindow.isDestroyed()) {
    // No window, start download anyway
    autoUpdater.downloadUpdate();
    return;
  }

  // If this is a manual check, show the full dialog
  if (isManualUpdateCheck) {
    console.log("[Updater] Manual check - showing dialog");
    mainWindow.webContents.send("show-update-dialog", {
      version: info.version,
      releaseNotes: info.releaseNotes,
      currentVersion: app.getVersion(),
    });
  } else {
    // Automatic check - show minimal toast and auto-download
    console.log("[Updater] Automatic check - silent download");
    mainWindow.webContents.send("update-available-silent", {
      version: info.version,
      releaseNotes: info.releaseNotes,
      currentVersion: app.getVersion(),
    });

    // Automatically start downloading in background
    console.log("[Updater] Starting automatic background download...");
    autoUpdater.downloadUpdate();
  }
});

// When no update is available
autoUpdater.on("update-not-available", (info) => {
  console.log(
    "[Updater] No update available. Current version is latest:",
    info.version
  );

  // Send to renderer for UI feedback
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-not-available", {
      version: info.version,
    });
  }
});

// Download progress
autoUpdater.on("download-progress", (progressObj) => {
  const logMessage = `[Updater] Download progress: ${Math.round(
    progressObj.percent
  )}% (${progressObj.transferred}/${progressObj.total})`;
  console.log(logMessage);

  // Send progress to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-download-progress", {
      percent: Math.round(progressObj.percent),
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  }
});

// When update is downloaded
autoUpdater.on("update-downloaded", (info) => {
  console.log("[Updater] Update downloaded, ready to install");
  console.log("[Updater] New version:", info.version);

  if (!mainWindow || mainWindow.isDestroyed()) {
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
    console.log("[Updater] Auto-installing update silently...");
    if (gameProcess) {
      console.log("[Updater] Closing game before update...");
      try {
        gameProcess.kill();
      } catch (e) {
        console.error("[Updater] Error closing game:", e);
      }
    }
    // quitAndInstall(isSilent, isForceRunAfter)
    // true = silent install (no window), true = force run after update
    autoUpdater.quitAndInstall(true, true);
  }, 3000); // 3 second delay so user sees the toast

  /* OLD CODE - Required user to click "Restart Now"
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready",
      message: "Update downloaded successfully!",
      detail: "The launcher will restart to apply the update.",
      buttons: ["Restart Now", "Restart Later"],
      defaultId: 0,
      cancelId: 1,
    })
    .then((result) => {
      if (result.response === 0) {
        // User clicked "Restart Now"
        console.log("[Updater] User approved restart, installing update...");
        // Close game if running
        if (gameProcess) {
          console.log("[Updater] Closing game before update...");
          try {
            gameProcess.kill();
          } catch (e) {
            console.error("[Updater] Error closing game:", e);
          }
        }
        // Quit and install (false = don't force close, true = restart after install)
        autoUpdater.quitAndInstall(false, true);
      } else {
        console.log("[Updater] User chose to restart later");
        // Update will be installed when app quits (autoInstallOnAppQuit = true)
      }
    });
  */
});

// Error handling
autoUpdater.on("error", (error) => {
  console.error("[Updater] Error:", error);
  // Silently fail - don't bother user with update errors
  // They can always download manually from website
});

// Check for rollback configuration
async function checkRollbackConfig() {
  return new Promise((resolve) => {
    const rollbackUrl = "http://157.245.214.234/launcher/rollback.json";
    console.log("[Rollback] Checking rollback config:", rollbackUrl);

    const protocol = rollbackUrl.startsWith("https") ? https : http;
    protocol
      .get(rollbackUrl, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const config = JSON.parse(data);
            console.log("[Rollback] Config loaded:", config);
            resolve(config);
          } catch (error) {
            console.error("[Rollback] Failed to parse config:", error);
            resolve({ enabled: false });
          }
        });
      })
      .on("error", (error) => {
        console.error("[Rollback] Failed to fetch config:", error);
        resolve({ enabled: false });
      });
  });
}

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

// Force download a specific version (for rollback)
async function forceVersionDownload(targetVersion, reason) {
  const currentVersion = app.getVersion();
  const comparison = compareVersions(currentVersion, targetVersion);

  console.log(
    `[Rollback] Version comparison: ${currentVersion} vs ${targetVersion}`
  );

  // Only rollback if current version is NEWER than target
  if (comparison <= 0) {
    console.log(
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

  const updateUrl = `http://157.245.214.234/launcher/Shadowrun%20FPS%20Launcher%20Setup%20${targetVersion}.exe`;
  console.log("[Rollback] Forcing download of version:", targetVersion);

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

// IPC handler for manual update check (optional - can be triggered from UI)
ipcMain.handle("check-for-updates", async () => {
  try {
    console.log("");
    console.log("=================================================");
    console.log("🔍 CHECK FOR UPDATES - IPC CALL RECEIVED");
    console.log("=================================================");
    console.log("[Updater] Manual update check requested");
    console.log("[Updater] Time:", new Date().toLocaleTimeString());

    // Check if we're in development mode
    const isDev = !app.isPackaged;

    if (isDev) {
      console.log("[Updater] ==========================================");
      console.log("[Updater] 🔧 DEVELOPMENT MODE - CHECK FOR UPDATES");
      console.log("[Updater] ==========================================");
      console.log(
        "[Updater] Development mode detected - auto-updater disabled"
      );
      console.log(
        "[Updater] In production, this would check: http://157.245.214.234/launcher/latest.yml"
      );

      // Add a small delay so user can see the "Checking..." button state
      await new Promise((resolve) => setTimeout(resolve, 1500));

      console.log("[Updater] Sending dev mode message to renderer...");

      // Send dev mode message to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("update-check-dev-mode");
      }

      console.log("[Updater] ==========================================");

      return { success: true, devMode: true };
    }

    // First check for rollback config
    const rollbackConfig = await checkRollbackConfig();
    if (rollbackConfig.enabled) {
      console.log(
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
      console.log(
        "[Rollback] User already on safe version - checking for normal updates"
      );
    }

    // Production mode - check for normal updates (mark as manual)
    checkForUpdates(true); // true = manual check
    return { success: true, devMode: false, rollback: false };
  } catch (error) {
    console.error("[Updater] Manual update check error:", error);
    return { success: false, error: error.message };
  }
});

// Handle rollback download confirmation
ipcMain.handle("confirm-rollback-download", async (event, downloadUrl) => {
  try {
    console.log("[Rollback] User confirmed rollback download:", downloadUrl);

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
              console.log("[Rollback] Download complete, launching installer");

              // Launch the installer
              exec(`"${downloadPath}"`, (error) => {
                if (error) {
                  console.error(
                    "[Rollback] Failed to launch installer:",
                    error
                  );
                  reject(error);
                } else {
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
          console.error("[Rollback] Download failed:", error);
          reject(error);
        });
    });
  } catch (error) {
    console.error("[Rollback] Error:", error);
    return { success: false, error: error.message };
  }
});

// Handle user confirming update download from custom dialog
ipcMain.handle("confirm-update-download", async () => {
  try {
    console.log("[Updater] User confirmed update download");
    autoUpdater.downloadUpdate();

    // Show download progress notification
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-download-started");
    }

    return { success: true };
  } catch (error) {
    console.error("[Updater] Error starting update download:", error);
    return { success: false, error: error.message };
  }
});

// IPC handler to get current app version
ipcMain.handle("get-app-version", async () => {
  return app.getVersion();
});
