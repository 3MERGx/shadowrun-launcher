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
const { spawn } = require("child_process");

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
const VERSION_URL = "http://157.245.214.234/releases/version.txt";

// Define installation directories
let GAME_INSTALL_DIR = path.join(
  "C:\\Program Files (x86)\\Microsoft Games for Windows - LIVE\\Shadowrun"
);
const GAME_FILES_TEMP = path.join(os.tmpdir(), "Shadowrun_Downloads");

// Now we can use GAME_INSTALL_DIR in other constants
let RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");
const BACKUP_DIR = path.join(app.getPath("userData"), "BackupFiles");

// Add this constant for the NoIntroFix download URL
const NO_INTRO_FIX_URL = "http://157.245.214.234/releases/NoIntroFix.zip";
const NOINTRO_TEMP_PATH = path.join(os.tmpdir(), "NoIntroFix.zip");

// Alternatively, you can bundle the NoIntroFix files with your application:
const BUNDLED_NO_INTRO_FIX = path.join(
  app.getAppPath(),
  "resources",
  "NoIntroFix.zip"
);

// Discord application ID - you'll need to create an application in Discord Developer Portal
const CLIENT_ID = "1352066395487076406"; // Replace with your actual Discord Application ID

// Make Discord RPC completely optional
let DiscordRPC = null;
let rpc = null;

// Track if player is currently in-game
let playerInGame = false;

// Add this variable to track the game process
let gameProcess = null;

// Define modifiedFiles at the higher scope level
let modifiedFiles = [];

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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false, // Remove the standard window frame
    transparent: false, // Use false for better performance
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
    },
    icon: path.join(__dirname, "assets/icon.png"),
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    backgroundColor: "#000000", // Set a background color
  });

  // Set the window title (shown in taskbar/alt-tab)
  mainWindow.setTitle("Shadowrun FPS Launcher");

  // Fix for taskbar icon in Windows
  if (process.platform === "win32") {
    app.setAppUserModelId(app.name);
  }

  // Load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Open the DevTools automatically (optional, but helpful for debugging)
  // You can comment this out once you can open it manually
  mainWindow.webContents.openDevTools();

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

// Modify app.whenReady to include Discord setup
app.whenReady().then(async () => {
  try {
    // Load settings
    loadSettingsFromDisk();

    createWindow();
    setupDiscordIntegration();

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
      }
    );

    // Notify renderer that game is now running
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("game-state-update", { running: true });
    }

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

// Update the download-game handler
ipcMain.handle("download-game", async () => {
  try {
    if (downloadInProgress) {
      return { success: false, error: "Download already in progress" };
    }

    downloadInProgress = true;
    downloadCancelled = false;

    // Check if game directory is writable before proceeding
    const canWrite = isDirectoryWritable(GAME_INSTALL_DIR);
    if (!canWrite) {
      const isAdmin = await isRunningAsAdmin();

      if (!isAdmin) {
        return {
          success: false,
          requiresAdmin: true,
          error: "Administrator privileges required for installation",
        };
      }
    }

    // Create game directory with permissions check
    const dirCreated = await createDirectoryWithPermissions(GAME_INSTALL_DIR);
    if (!dirCreated) {
      return {
        success: false,
        requiresAdmin: true,
        error:
          "Failed to create installation directory. Administrator privileges required.",
      };
    }

    // Create temp directory
    if (!fs.existsSync(GAME_FILES_TEMP)) {
      fs.mkdirSync(GAME_FILES_TEMP, { recursive: true });
    }

    // Proceed with downloads...
    // ... rest of the download code ...
  } catch (error) {
    console.error("Download error:", error);
    mainWindow.webContents.send("download-error", error.message);
    downloadInProgress = false;
    return { success: false, error: error.message };
  }
});

// Replace the current downloadFile function with this one that handles both HTTP and HTTPS
async function downloadFile(url, destination, progressCallback) {
  return new Promise((resolve) => {
    console.log(`Downloading file from ${url} to ${destination}`);
    const file = fs.createWriteStream(destination);

    // Choose the correct protocol module based on the URL
    const httpModule = url.startsWith("https:") ? https : http;

    const request = httpModule.get(url, (response) => {
      console.log(`Download response status: ${response.statusCode}`);

      if (response.statusCode !== 200) {
        console.error(`Failed to download file: ${response.statusCode}`);
        file.close();
        fs.unlink(destination, () => {});
        resolve(false);
        return;
      }

      // Get file size for progress calculation
      const totalSize = parseInt(response.headers["content-length"], 10);
      let downloadedSize = 0;

      response.on("data", (chunk) => {
        downloadedSize += chunk.length;
        // Calculate and report progress if callback provided
        if (progressCallback && totalSize) {
          const percent = Math.floor((downloadedSize / totalSize) * 100);
          progressCallback(percent);
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        console.log("Download completed successfully");
        file.close();
        resolve(true);
      });
    });

    request.on("error", (err) => {
      console.error("Download error:", err.message);
      file.close();
      fs.unlink(destination, () => {});
      resolve(false);
    });
  });
}

// Alternative to AdmZip - use child_process to unzip
function extractZip(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    // Use PowerShell to extract zip on Windows
    const command =
      process.platform === "win32"
        ? `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destPath}' -Force"`
        : `unzip -o '${zipPath}' -d '${destPath}'`;

    exec(command, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
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
    const version = await fetchVersionNumber();
    return { success: true, version };
  } catch (error) {
    console.error("Error fetching version:", error);
    return { success: false, version: "1.0.0" };
  }
});

// Function to fetch version number from server
async function fetchVersionNumber() {
  return new Promise((resolve, reject) => {
    const httpModule = getHttpModule(VERSION_URL);
    httpModule
      .get(VERSION_URL, (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          resolve(data.trim());
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

// Add this function near the top of your file with other helper functions
function getHttpModule(url) {
  return url.startsWith("https:") ? https : http;
}

ipcMain.handle("activate-game", async () => {
  try {
    console.log("Starting game activation...");

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

    // Call the functions that actually perform the activation steps
    try {
      // Ensure GAME_INSTALL_DIR is correctly set and accessible
      // And ACTIVATION_PRODUCT_KEY is accessible from registryUtils
      const activationRegResult = await registryUtils.activateGameInRegistry(
        GAME_INSTALL_DIR, // Make sure this is up-to-date
        "R9GJT-87T6K-6KV49-XTX8G-6VBWW" // Using the key directly or accessing from registryUtils if exported
      );

      if (!activationRegResult || !activationRegResult.success) {
        throw new Error(
          (activationRegResult && activationRegResult.error) ||
            "Failed to apply registry settings for activation."
        );
      }

      const tokenDeletionResult = await registryUtils.deleteTokenFiles(); // or tokenUtils.deleteTokenFiles()
      if (!tokenDeletionResult || !tokenDeletionResult.success) {
        // This might not be critical for success, so perhaps just a warning
        console.warn(
          "Could not delete all token files during activation:",
          tokenDeletionResult.errors
        );
      }

      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Activation Successful",
        message: "Game activation process completed.",
        detail:
          "The necessary registry changes have been applied and token files cleared. Please try launching the game.",
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
    // Catch errors from pcidExists check or other unexpected issues
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
  mainWindow.close();
  return true;
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
      const defaultConfig = `# DXVK Configuration File
dxgi.maxFrameRate = ${fps}
d3d9.maxFrameRate = ${fps}
`;
      fs.writeFileSync(dxvkConfPath, defaultConfig);
      return { success: true };
    }

    // Read existing file
    console.log("Reading existing dxvk.conf file");
    let configContent = fs.readFileSync(dxvkConfPath, "utf8");

    // Update or add the frame rate settings
    const dxgiRegex = /dxgi\.maxFrameRate\s*=\s*\d+/;
    const d3d9Regex = /d3d9\.maxFrameRate\s*=\s*\d+/;

    if (dxgiRegex.test(configContent)) {
      console.log("Updating existing dxgi.maxFrameRate setting");
      configContent = configContent.replace(
        dxgiRegex,
        `dxgi.maxFrameRate = ${fps}`
      );
    } else {
      console.log("Adding new dxgi.maxFrameRate setting");
      configContent += `\ndxgi.maxFrameRate = ${fps}`;
    }

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

// Update the setDiscordActivity function to show "Shadowrun PC" instead
function updateDiscordActivity(playing) {
  if (!rpc) return;

  const activity = playing
    ? {
        details: "Playing Shadowrun",
        state: "In Game",
        largeImageKey: "game_logo",
        largeImageText: "Shadowrun",
        instance: false,
        startTimestamp: new Date(),
      }
    : {
        details: "In Launcher",
        state: "Browsing",
        largeImageKey: "launcher_logo",
        largeImageText: "Shadowrun Launcher",
        instance: false,
      };

  rpc.setActivity(activity).catch(console.error);
}

// Clean up when the app is closing
app.on("before-quit", () => {
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
    // Try to create a test file in the directory or its parent if it doesn't exist
    const testDir = fs.existsSync(dirPath) ? dirPath : path.dirname(dirPath);
    const testFile = path.join(testDir, `.write-test-${Date.now()}.tmp`);
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return true;
  } catch (error) {
    console.log(`Directory not writable: ${dirPath}`, error.message);
    return false;
  }
}

// Add this helper to create directories with elevation if needed
async function createDirectoryWithPermissions(dirPath) {
  try {
    // First try to create the directory normally
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error(`Error creating directory: ${dirPath}`, error);

    // Check if we need admin privileges (EPERM or EACCES errors)
    if (error.code === "EPERM" || error.code === "EACCES") {
      const isAdmin = await isRunningAsAdmin();

      if (!isAdmin) {
        // Not running as admin, we need to restart with elevation
        mainWindow.webContents.send("show-notification", {
          title: "Administrator Privileges Required",
          message:
            "Installation requires administrator privileges to write to protected folders.",
          type: "warning",
        });

        return false;
      } else {
        // We're admin but still couldn't create the directory
        throw new Error(
          `Failed to create directory even with admin privileges: ${error.message}`
        );
      }
    } else {
      throw error;
    }
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
