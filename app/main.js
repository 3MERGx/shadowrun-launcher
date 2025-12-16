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

  // Check if running in dev mode
  const isDevMode = process.argv.includes("--dev") || !app.isPackaged;

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

// Update the launch-game handler to track the game process
ipcMain.handle("launch-game", async (event, gameSettings) => {
  try {
    // Get actual FPS from dxvk.conf instead of using the one from settings object
    const actualFps = readCurrentFpsFromDxvkConf() || gameSettings.maxFrameRate;

    // Log with the correct FPS value
    console.log("Launching game from main process with settings:", {
      ...gameSettings,
      maxFrameRate: actualFps,
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

    // Launch the game and store the process
    gameProcess = exec(
      `"${gameExePath}"`,
      {
        cwd: GAME_INSTALL_DIR,
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("Error launching game:", error);
        }

        // When game closes
        playerInGame = false;
        gameProcess = null;
        updateDiscordActivity(false);

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
      const audioHelperPath = path.join(
        app.getAppPath(),
        "resources",
        "audio-volume-helper.exe"
      );
      if (fs.existsSync(audioHelperPath)) {
        console.log(
          "[Audio] Launching audio volume helper to set game volume to 50%..."
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
          "[Audio] Audio volume helper not found, skipping volume adjustment"
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
});

// Helper function to check if DirectX 9 is installed
function isDX9Installed() {
  return new Promise((resolve) => {
    // Check registry keys for DirectX 9
    const command = 'reg query "HKLM\\SOFTWARE\\Microsoft\\DirectX" /v Version';
    exec(command, (error, stdout) => {
      if (!error && stdout && stdout.includes("9.")) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// Helper function to check if GFWL is installed
function isGFWLInstalled() {
  return new Promise((resolve) => {
    // Check for GFWL installation
    const gfwlPath =
      "C:\\Program Files (x86)\\Microsoft Games for Windows - LIVE";
    if (fs.existsSync(gfwlPath)) {
      resolve(true);
    } else {
      resolve(false);
    }
  });
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
    console.log("[Download] Checking for existing components...");
    const dx9Installed = await isDX9Installed();
    const gfwlInstalled = await isGFWLInstalled();

    // Update UI immediately for GFWL and DirectX status
    if (gfwlInstalled) {
      mainWindow.webContents.send("gfwl-progress", 100);
      mainWindow.webContents.send(
        "download-message",
        "✓ Games for Windows Live is already installed"
      );
    } else {
      mainWindow.webContents.send("gfwl-progress", 0);
    }

    if (dx9Installed) {
      mainWindow.webContents.send("dx-progress", 100);
      mainWindow.webContents.send(
        "download-message",
        "✓ DirectX 9 is already installed"
      );
    } else {
      mainWindow.webContents.send("dx-progress", 0);
    }

    // STEP 2: Download and install GFWL FIRST (if needed) - BEFORE Shadowrun download
    if (!gfwlInstalled) {
      // Download GFWL
      const gfwlPath = path.join(GAME_FILES_TEMP, "gfwlivesetup.zip");
      mainWindow.webContents.send(
        "download-message",
        "📥 Downloading Games for Windows Live (required for online play)..."
      );

      const gfwlSuccess = await downloadFile(GFWL_URL, gfwlPath, (progress) => {
        mainWindow.webContents.send("gfwl-progress", progress);
      });

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

      // Run GFWL installer
      const gfwlInstallerPath = path.join(GAME_FILES_TEMP, "gfwlivesetup.exe");
      if (fs.existsSync(gfwlInstallerPath)) {
        mainWindow.webContents.send(
          "download-message",
          "Running GFWL installer..."
        );
        await runInstaller(gfwlInstallerPath);
        mainWindow.webContents.send("gfwl-progress", 100);
      }
    }

    // STEP 3: Download and install DirectX 9 FIRST (if needed) - BEFORE Shadowrun download
    if (!dx9Installed) {
      // Download DirectX 9
      const dx9Path = path.join(GAME_FILES_TEMP, "directx_Jun2010_redist.exe");
      mainWindow.webContents.send(
        "download-message",
        "📥 Downloading DirectX 9 (required graphics library)..."
      );

      const dx9Success = await downloadFile(DX9_URL, dx9Path, (progress) => {
        mainWindow.webContents.send("dx-progress", progress);
      });

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

      // Install DirectX 9
      mainWindow.webContents.send(
        "download-message",
        "⚙️ Installing DirectX 9... This may take a minute or two."
      );
      await runInstaller(dx9Path);
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
        (progress) => {
          mainWindow.webContents.send("game-files-progress", progress);
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

    // Update game installation status BEFORE sending download-complete
    // This ensures the UI knows the game is installed
    console.log("[Download] Verifying game installation...");
    try {
      const installationStatus = await checkExistingInstallation();
      console.log(
        `[Download] Installation check result: ${installationStatus}`
      );
    } catch (checkError) {
      console.error("[Download] Error checking installation:", checkError);
    }

    // Notify renderer that download is complete and game is installed
    console.log("[Download] Sending download-complete event...");
    mainWindow.webContents.send("download-complete");
    console.log("[Download] Sending game-installation-status event...");
    mainWindow.webContents.send("game-installation-status", {
      installed: true,
    });
    console.log("[Download] All completion events sent successfully");

    // Clean up downloads
    downloadInProgress = false;

    // Auto-launch game if enabled
    if (AUTO_LAUNCH_AFTER_DOWNLOAD) {
      console.log("[Download] Auto-launch enabled, launching game...");
      setTimeout(async () => {
        // Give UI a moment to update before launching
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("auto-launching-game");
        }
        // Launch the game (use the same settings that would be used from the Play button)
        const defaultSettings = await loadSettingsFromDisk();
        ipcMain.emit("launch-game", null, defaultSettings);
      }, 2000);
    }

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
    const file = fs.createWriteStream(destination);
    let isCancelled = false;
    let isFinished = false;
    let isResolved = false;

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

      // Helper to cleanup streams (defined inside callback to access response)
      const cleanup = () => {
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
            progressCallback(percent);
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

    if (installerPath.includes("directx9")) {
      // Silent DirectX installation
      installCommand = `"${installerPath}" /Q /C /T:"${GAME_FILES_TEMP}\\dxtemp" && "${GAME_FILES_TEMP}\\dxtemp\\DXSETUP.exe" /silent`;
    } else if (installerPath.includes("gfwlivesetup")) {
      // Silent GFWL installation
      installCommand = `"${installerPath}" /q /norestart`;
    } else {
      installCommand = `"${installerPath}"`;
    }

    console.log(`Running silent install: ${installCommand}`);

    const child = exec(installCommand, (error) => {
      if (error) {
        console.error("Install error:", error);
        reject(error);
      } else {
        resolve();
      }
    });

    // Set a timeout to avoid indefinite waiting
    const timeout = setTimeout(() => {
      try {
        process.kill(child.pid);
        console.log("Killed installer process after timeout");
      } catch (e) {
        console.warn("Could not kill installer process:", e);
      }
      resolve(); // Continue anyway
    }, 5 * 60 * 1000); // 5 minutes max

    child.on("exit", () => {
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

ipcMain.handle("activate-game", async () => {
  const PRODUCT_KEY = "R9GJT-87T6K-6KV49-XTX8G-6VBWW";

  try {
    console.log("Starting game activation...");

    // 2.1 Registry Accessibility Check
    const canAccessRegistry = await registryUtils.checkPathAccess();
    if (!canAccessRegistry) {
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
    const pcidExists = await registryUtils.checkPcidInRegistry();
    if (!pcidExists) {
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
    const currentPcid = await registryUtils.getPcidFromRegistry();
    if (!currentPcid) {
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
    const backupExists = await registryUtils.checkSrPcidBackupExists();
    if (!backupExists) {
      console.log(
        "[Activation] PCID backup not found - creating mandatory backup..."
      );
      const backupResult = await registryUtils.backupPcidToRegistryViaRegFile(
        currentPcid
      );

      if (!backupResult || !backupResult.success) {
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
      console.log("[Activation] PCID backup created successfully");
    } else {
      console.log(
        "[Activation] PCID backup already exists - skipping backup step"
      );
    }

    // 4. Registry-Based Game Activation
    try {
      const activationRegResult = await registryUtils.activateGameInRegistry(
        GAME_INSTALL_DIR,
        PRODUCT_KEY
      );

      if (!activationRegResult || !activationRegResult.success) {
        throw new Error(
          (activationRegResult && activationRegResult.error) ||
            "Failed to apply registry settings for activation."
        );
      }

      console.log("[Activation] Registry activation completed successfully");

      // 5. Native Token Injection (xlive.dll) - Best-Effort
      let tokenInjectionSuccess = false;
      try {
        const helperPath = path.join(
          app.getAppPath(),
          "resources",
          "xlive-helper.exe"
        );

        // Fallback to checking in app directory if not in resources
        const helperPathFallback = path.join(
          process.resourcesPath || app.getAppPath(),
          "xlive-helper.exe"
        );

        let actualHelperPath = null;
        if (fs.existsSync(helperPath)) {
          actualHelperPath = helperPath;
        } else if (fs.existsSync(helperPathFallback)) {
          actualHelperPath = helperPathFallback;
        } else {
          // Try in the same directory as the main executable
          const exeDir = path.dirname(process.execPath);
          const exeDirHelper = path.join(exeDir, "xlive-helper.exe");
          if (fs.existsSync(exeDirHelper)) {
            actualHelperPath = exeDirHelper;
          }
        }

        if (actualHelperPath) {
          console.log(
            `[Activation] Calling xlive-helper.exe: ${actualHelperPath}`
          );

          const helperResult = await new Promise((resolve) => {
            const helperProcess = spawn(actualHelperPath, [PRODUCT_KEY], {
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
            });

            let stdout = "";
            let stderr = "";

            helperProcess.stdout.on("data", (data) => {
              stdout += data.toString();
            });

            helperProcess.stderr.on("data", (data) => {
              stderr += data.toString();
            });

            helperProcess.on("close", (code) => {
              resolve({ code, stdout, stderr });
            });

            helperProcess.on("error", (error) => {
              resolve({ code: -1, error: error.message });
            });
          });

          if (helperResult.code === 0) {
            tokenInjectionSuccess = true;
            console.log("[Activation] Token injection via xlive.dll succeeded");
          } else {
            console.warn(
              `[Activation] Token injection failed (exit code: ${helperResult.code})`
            );
            if (helperResult.stderr) {
              console.warn(
                `[Activation] Helper stderr: ${helperResult.stderr}`
              );
            }
          }
        } else {
          console.warn(
            "[Activation] xlive-helper.exe not found - skipping token injection"
          );
        }
      } catch (helperError) {
        console.warn(
          "[Activation] Error calling xlive-helper.exe:",
          helperError.message
        );
      }

      // Show warning if token injection failed (non-fatal)
      if (!tokenInjectionSuccess) {
        dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Token Injection Warning",
          message:
            "Registry activation succeeded, but automatic token injection failed.",
          detail:
            "The game may still activate normally. If you experience issues, try launching the game.",
          buttons: ["OK"],
        });
      }

      // 6. Token File Cleanup
      const tokenDeletionResult = await registryUtils.deleteTokenFiles();
      if (!tokenDeletionResult || !tokenDeletionResult.success) {
        console.warn(
          "Could not delete all token files during activation:",
          tokenDeletionResult.errors
        );
      }

      // 7. Success Completion
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Activation Successful",
        message: "Game activation process completed.",
        detail:
          "Registry activation applied, PCID safely backed up, and token cache cleared. Please try launching the game.",
        buttons: ["OK"],
      });
      return { success: true, message: "Game activated successfully." };
    } catch (error) {
      console.error("Error during activation steps:", error);
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
  // Open Discord link
  await shell.openExternal("https://discord.gg/Shadowrun");
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
      console.log(
        "Discord RPC error (Discord may not be running):",
        error.message
      );
      // Don't try to reconnect - Discord probably isn't running
      rpc = null;
    });

    // Connect with timeout to avoid hanging if Discord isn't running
    const connectionTimeout = setTimeout(() => {
      console.log(
        "Discord RPC connection timed out - Discord may not be running"
      );
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
        console.log("Discord RPC connection failed:", error.message);
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
            url: "https://discord.gg/BPcxwJwfKv",
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
            url: "https://discord.gg/BPcxwJwfKv",
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

  console.log("Searching for Shadowrun installation...");

  // Check each location
  for (const location of possibleLocations) {
    if (fs.existsSync(path.join(location, "Shadowrun.exe"))) {
      console.log(`Found Shadowrun installation at: ${location}`);
      return location;
    }
  }

  console.log("Could not find Shadowrun installation in common locations");
  return null;
}

// Update the checkExistingInstallation function to ensure it properly reports status
async function checkExistingInstallation() {
  try {
    // Try to find the game
    const foundLocation = await findGameInstallation();

    if (foundLocation) {
      console.log(`Game found at ${foundLocation}, updating paths...`);

      // Update the global path
      GAME_INSTALL_DIR = foundLocation;

      // Update dependent paths
      RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");

      // Game is installed if we found the executable
      const gameInstalled = true;

      console.log(
        `Game installation status: ${
          gameInstalled ? "Installed" : "Not installed"
        }`
      );

      // Send the status to the renderer process
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("Sending installation status to renderer:", gameInstalled);
        mainWindow.webContents.send("game-installation-status", {
          installed: gameInstalled,
          path: GAME_INSTALL_DIR,
        });
      }

      return gameInstalled;
    } else {
      console.log("Game not found, reporting as not installed");
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("game-installation-status", {
          installed: false,
          path: null,
        });
      }
      return false;
    }
  } catch (error) {
    console.error("Error checking installation:", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("game-installation-status", {
        installed: false,
        path: null,
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
      // Get the backup PCID
      const backupPcid = await registryUtils.getSrPcidBackupFromRegistry();

      if (backupPcid) {
        console.log("Restoring original PCID from backup...");

        // Create registry content to restore original PCID
        const regContent = `Windows Registry Editor Version 5.00\n\n[HKEY_CURRENT_USER\\Software\\Classes\\SOFTWARE\\Microsoft\\XLive]\n"PCID"=hex(b):${backupPcid}`;

        // Import registry changes
        await registryUtils.importRegFile(regContent);

        console.log("Original PCID restored successfully");
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Error restoring original PCID:", error);
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

// Function to check for updates
function checkForUpdates() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.log("[Updater] Main window not ready, skipping update check");
    return;
  }

  console.log("[Updater] Checking for updates...");
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

  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Send update notification to renderer for custom styled dialog
  mainWindow.webContents.send("show-update-dialog", {
    version: info.version,
    releaseNotes: info.releaseNotes,
    currentVersion: app.getVersion(),
  });
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
    autoUpdater.quitAndInstall(false, true);
    return;
  }

  // Send update ready notification to renderer for custom dialog
  mainWindow.webContents.send("update-ready-to-install", {
    version: info.version,
  });

  // Auto-install after brief delay (one-click experience)
  setTimeout(() => {
    console.log("[Updater] Auto-installing update...");
    // quitAndInstall(isSilent, isForceRunAfter)
    // false = not silent (show progress), true = force run after update
    autoUpdater.quitAndInstall(false, true);
  }, 2000); // 2 second delay so user sees the "Installing..." message

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

    // Production mode - check for normal updates
    checkForUpdates();
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
