// Centralized logger (electron-log). Wires up the file transport
// (%APPDATA%/Shadowrun FPS Launcher/logs/main.log) and captures uncaught
// exceptions / unhandled rejections (with the discord-rpc "connection
// closed" filter preserved). We retired the transitional
// console.* -> electron-log shim now that every main-process module
// uses safeLog.* directly. installConsoleShim is still exported by the
// logger module in case a future surface needs to recapture stray
// console.* calls.

// Before any requires: silence Node's legacy `punycode` deprecation (DEP0040)
// from the Electron/dependency chain until upstream removes it.
(() => {
  const orig = process.emitWarning.bind(process);
  process.emitWarning = function suppressPunycodeDeprecation(warning, type, code, ctor) {
    if (typeof type === "object" && type !== null && type.code === "DEP0040") {
      return;
    }
    if (code === "DEP0040") {
      return;
    }
    return orig.apply(process, arguments);
  };
})();

const { safeLog, getLogFilePath } = require("./main/logger");

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const playerTracker = require("./utils/playerTracking");

// Fix Electron cache permission errors
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disk-cache-size", "0");

// Immutable configuration (URLs, static paths, timing, feature flags) lives
// in app/main/config/constants.js and is consumed directly by the modules
// that need it (downloads, discord, game/dxvk, game/srsDll, updater, ...).
// Mutable runtime state (settings object, game install dir, runtime flags)
// stays inline below.

// Default game install directory. User-writable so non-admin launches work.
// May be reassigned at runtime if the user picked a custom location in
// settings.json (see loadSettingsFromDisk below).
let GAME_INSTALL_DIR = path.join(app.getPath("home"), "Games", "Shadowrun");
let RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");

// autoUpdater feed URL, logger, autoDownload/autoInstallOnAppQuit options
// are configured by setupUpdater() when it's invoked from
// app.whenReady() below. The autoUpdater singleton is no longer touched
// directly from main.js.

// Discord Rich Presence is owned by app/main/discord/rpc.js. The module
// holds its own playerInGame / gameStartTime state; main.js only calls
// markGameStarted() / markGameEnded() / refresh() / cleanup().
const discordRpc = require("./main/discord/rpc");
const { registerLinkHandlers } = require("./main/discord/links");

// System detection (GPU + CPU + OS + NAT) lives in app/main/system. main.js
// just composes detection results - the cache for getSystemInfo() lives
// in `settings.cachedSystemInfo` and is owned by the IPC handler below.
// detectCPU is exported by the system module but only ever called inside
// getSystemInfo() today, so we don't import it here.
const {
  detectGPUVendor,
  detectAllGPUs,
  detectNATType,
  getSystemInfo,
} = require("./main/system");

// Pre-launch diagnostics composer lives in app/main/diagnostics. The composer
// still requires DI for one launcher-internal probe (isDX9Installed) since
// the install-state checks live in app/main/downloads; the three Windows
// service probes / auto-fixers come from app/main/services and are bound
// here directly.
const { runPreLaunchDiagnostics } = require("./main/diagnostics");

// Service probes for pre-launch diagnostics and the "check-persistent-issues" panel.
const {
  checkWindowsLicenseManagerService,
  checkXboxLiveNetworkingService,
} = require("./main/services");

// Downloads pipeline (build.zip + GFWL + DX9) and the install-state probes.
// `registerDownloadsIpc` owns the renderer-facing "cancel-download",
// "download-game", and "check-directx" handlers and the in-flight /
// cancellation flags that used to live at module scope here. The named
// helpers (downloadFile, extractZip, isDX9Installed, isGFWLInstalled) are
// still imported here for the NoIntroFix / DXVK / SRS DLL paths and the
// diagnostics DI bag - those callers will move to their own modules in
// later phases.
const {
  downloadFile,
  extractZip,
  isDX9Installed,
  isGFWLInstalled,
  isVcRedistX86Installed,
  registerDownloadsIpc,
} = require("./main/downloads");

// Game discovery + launch core. Both functions are produced by
// factories that close over our module-scoped state via DI accessors (see
// where `findGameInstallation` and `launchGameLogic` are bound below). This
// keeps `main.js` as the sole owner of mutable state (settings,
// GAME_INSTALL_DIR, gameProcess, hideLauncherTimeout) while letting the
// extracted modules stay pure / testable. `getEnhancedDxvkEnvVars` is a
// pure function so we re-export it directly for any future caller.
const { makeFindGameInstallation } = require("./main/game/install");
const { makeLaunchGameLogic } = require("./main/game/launch");

// On-disk feature toggles. Each module exposes:
//   - one or two factory-bound probes (read-only checks main.js still
//     consumes from load-settings + the launch deps bag)
//   - one IPC registrar that wires up the renderer-facing handlers
// Behavior is preserved verbatim from the inline implementations.
const {
  makeReadCurrentFpsFromDxvkConf,
  makeCheckDxvkStatus,
  registerDxvkIpc,
} = require("./main/game/dxvk");
const {
  makeCheckSkipIntroStatus,
  makeHandleSkipIntroToggle,
  registerSkipIntroIpc,
} = require("./main/game/skipIntro");
const {
  makeCheckSrsDllVersion,
  registerSrsDllIpc,
} = require("./main/game/srsDll");
const {
  makeCheckGfwlServerStatus,
  registerGfwlServerIpc,
} = require("./main/game/gfwl");

// Game install-location management. Owns:
//   - isGamePathInProtectedDirectory (pure helper, also passed into the
//     launchGameLogic deps bag so launch.js can warn the user about
//     Program Files / Windows installs).
//   - setDefaultGameConfig (factory-bound; pre-seeds Shadowrun's INI
//     files with safe resolution + 50% music volume on first launch).
//   - registerLocationIpc which wires up the open-game-directory,
//     get-game-installation-path, change-game-location, execute-game-move
//     (with VBS+PS1 UAC elevation when source/dest is in a protected
//     directory), clear-saved-game-path and browse-for-existing-game
//     handlers.
const {
  isGamePathInProtectedDirectory,
  makeSetDefaultGameConfig,
  registerLocationIpc,
} = require("./main/game/location");

// Auto-updater. Owns autoUpdater feed configuration, all
// autoUpdater.* event listeners, the rollback flow, and the
// renderer-facing IPC handlers (check-for-updates, confirm-update-download,
// retry-update-download, confirm-rollback-download, get-manual-download-url,
// get-app-version). Returns a small public API that main.js calls into for
// the boot timer (checkForUpdates / checkForFailedInstallation) and that
// Discord RPC reads via getUpdateInfo() / bumpUpdateFromFallback().
const { setupUpdater } = require("./main/updater");

// Misc IPC bundle: get-version, get-changelog, show-notification,
// ping-main, show-logs, restart-as-admin (appInfo); get-gpu-info,
// get-system-info (systemInfo); run-diagnostics (diagnostics);
// load-settings, save-settings (settings); check-game-installed,
// check-persistent-issues (installCheck). Wired by registerMiscIpc(...) at
// app startup with one DI bag covering all five sub-modules.
const { registerMiscIpc } = require("./main/ipc");

// Activation pipeline: activate-game / get-current-pcid / backup-pcid IPC
// handlers, plus the launch-time helpers (restoreOriginalPcid,
// isRunningAsAdmin, isDirectoryWritable, createDirectoryWithPermissions,
// checkActivationStatus). VERBATIM extraction — no logic changed. Sub-modules
// (dotnet6, validation, dialogs/activationSuccessDialog) are composed inside
// the activation module itself, so main.js only sees the top-level surface.
const {
  isRunningAsAdmin,
  isDirectoryWritable,
  makeCreateDirectoryWithPermissions,
  makeCheckActivationStatus,
  restoreOriginalPcid,
  registerActivationIpc,
} = require("./main/activation");

function getDiagnosticsDeps() {
  return {
    isDX9Installed,
    isVcRedistX86Installed,
    checkLicenseManager: checkWindowsLicenseManagerService,
    checkXboxNetworking: checkXboxLiveNetworkingService,
  };
}

// Update tracking (updateAvailable / latestVersion / pendingUpdateInfo /
// updateDownloadInProgress / updateDownloadTimeout / lastUpdateProgress /
// isManualUpdateCheck) is now closure-encapsulated inside
// app/main/updater/index.js. main.js holds a handle to the
// public API returned by setupUpdater() in `updater` below.
let updater = null;

let gameProcess = null;

if (require("electron-squirrel-startup")) {
  app.quit();
}

let squirrelStartup = false;
try {
  // Only try to use electron-squirrel-startup if it's installed
  const electronSquirrelStartup = require("electron-squirrel-startup");
  if (electronSquirrelStartup) {
    squirrelStartup = true;
    app.quit();
  }
} catch (error) {
  safeLog.info(
    "electron-squirrel-startup not found, skipping Windows installer checks"
  );
}

if (squirrelStartup) return;

// Prevent multiple instances of the launcher from running
// This ensures only one instance can run at a time
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  safeLog.info(
    "Another instance of Shadowrun FPS Launcher is already running. Exiting."
  );
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;
// Stored gain 0–MAX; default matches Diagnostics slider midpoint (50% UI = DEFAULT gain).
const DEFAULT_BACKGROUND_AUDIO_GAIN = 0.25;
const MAX_BACKGROUND_AUDIO_GAIN = 0.5;

let settings = {
  skipIntro: false,
  dxvk: false,
  maxFrameRate: 240,
  audioMuted: false, // Persist background audio mute state
  backgroundAudioVolume: DEFAULT_BACKGROUND_AUDIO_GAIN,
  autoScanEnabled: false, // From installer preference (one-time choice)
};

const settingsPath = path.join(app.getPath("userData"), "settings.json");

function readInstallerPreferences() {
  try {
    // The installer saves preferences to installer-prefs.json in the app installation directory
    // This is in the same directory as the app executable (process.resourcesPath is parent of app.asar)
    const appDir = path.dirname(app.getPath("exe"));
    const installerPrefsPath = path.join(appDir, "installer-prefs.json");

    safeLog.info(`[Installer Prefs] Looking for: ${installerPrefsPath}`);

    if (fs.existsSync(installerPrefsPath)) {
      const data = fs.readFileSync(installerPrefsPath, "utf8");
      const prefs = JSON.parse(data);
      safeLog.info(`[Installer Prefs] Loaded:`, prefs);
      return prefs;
    } else {
      safeLog.info(
        `[Installer Prefs] File not found, using defaults (no auto-scan)`
      );
      return { autoScanEnabled: false };
    }
  } catch (error) {
    safeLog.error("[Installer Prefs] Error reading preferences:", error);
    return { autoScanEnabled: false };
  }
}

async function loadSettingsFromDisk() {
  try {
    const hadSettingsFile = fs.existsSync(settingsPath);

    const installerPrefs = readInstallerPreferences();
    settings.autoScanEnabled = installerPrefs.autoScanEnabled;
    safeLog.info(`[Settings] ============================================`);
    safeLog.info(
      `[Settings] Auto-scan preference loaded: ${settings.autoScanEnabled}`
    );
    safeLog.info(`[Settings] This setting was set during installation`);
    safeLog.info(`[Settings] ============================================`);

    if (hadSettingsFile) {
      const data = fs.readFileSync(settingsPath, "utf8");
      const loadedSettings = JSON.parse(data);

      const installerAutoScanSetting = settings.autoScanEnabled;

      Object.assign(settings, loadedSettings);

      // Check if user has manually set autoScanEnabled in settings.json
      // If they have (it exists in loadedSettings), respect their manual choice
      // Otherwise, use the installer preference
      if (loadedSettings.hasOwnProperty("autoScanEnabled")) {
        safeLog.info(`[Settings] ============================================`);
        safeLog.info(`[Settings] Manual override detected in settings.json`);
        safeLog.info(
          `[Settings] Using manual auto-scan setting: ${settings.autoScanEnabled}`
        );
        safeLog.info(
          `[Settings] (Installer preference was: ${installerAutoScanSetting}, but manual override takes priority)`
        );
        safeLog.info(`[Settings] ============================================`);
      } else {
        settings.autoScanEnabled = installerAutoScanSetting;
        safeLog.info(
          `[Settings] Using installer auto-scan preference: ${settings.autoScanEnabled} (no manual override found)`
        );
      }

      if (loadedSettings.customGamePath) {
        const gameExePath = path.join(
          loadedSettings.customGamePath,
          "Shadowrun.exe"
        );
        if (fs.existsSync(gameExePath)) {
          GAME_INSTALL_DIR = loadedSettings.customGamePath;
          RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");
          safeLog.info(
            `[Settings] Loaded custom game path: ${GAME_INSTALL_DIR}`
          );
        } else {
          safeLog.warn(
            `[Settings] Saved game path exists but Shadowrun.exe not found: ${loadedSettings.customGamePath}`
          );
          safeLog.info(
            `[Settings] Clearing invalid custom game path from settings`
          );
          settings.customGamePath = undefined;
          delete loadedSettings.customGamePath;
          saveSettingsToDisk();
        }
      }
    }

    const skipIntroStatus = await checkSkipIntroStatus();
    settings.skipIntro = skipIntroStatus.installed;

    const dxvkStatus = await checkDxvkStatus();
    settings.dxvk = dxvkStatus.enabled;

    // Launcher audio (renderer Diagnostics): slider 0–100% maps to gain 0–MAX;
    // first install has no settings.json — lock defaults and persist once.
    if (!hadSettingsFile) {
      settings.backgroundAudioVolume = DEFAULT_BACKGROUND_AUDIO_GAIN;
      settings.audioMuted = false;
      safeLog.info(
        "[Settings] First launch: launcher audio default 50% on slider (gain 0.25)"
      );
    } else if (
      typeof settings.backgroundAudioVolume !== "number" ||
      Number.isNaN(settings.backgroundAudioVolume)
    ) {
      settings.backgroundAudioVolume = DEFAULT_BACKGROUND_AUDIO_GAIN;
    }
    settings.backgroundAudioVolume = Math.min(
      MAX_BACKGROUND_AUDIO_GAIN,
      Math.max(0, settings.backgroundAudioVolume)
    );

    if (!hadSettingsFile) {
      saveSettingsToDisk();
    }

    safeLog.info(`[Settings] Auto-scan: ${settings.autoScanEnabled}`);
    return settings;
  } catch (error) {
    safeLog.error("Error loading settings", error);
    return { ...settings }; // Return a copy of default settings
  }
}

function saveSettingsToDisk() {
  try {
    checkSkipIntroStatus().then((status) => {
      settings.skipIntro = status.installed;

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    });
  } catch (error) {
    safeLog.error("Error saving settings", error);
  }
}

// Window factory + window-control IPC live in app/main/window/ now. We keep
// a thin createWindow() wrapper here because the rest of main.js (lifecycle
// callbacks, single-instance handler, etc.) still calls it by name.
const { createMainWindow } = require("./main/window/mainWindow");
const { registerWindowControls } = require("./main/window/controls");

function createWindow() {
  mainWindow = createMainWindow({
    appDir: __dirname,
    isDevMode: process.argv.includes("--dev"),
    isGameRunning: () => gameProcess !== null,
    onClosed: () => {
      // Kill any orphan game process the OS / Task Manager left behind.
      if (gameProcess !== null) {
        if (gameProcess.pid) {
          try {
            process.kill(gameProcess.pid);
          } catch (e) {
            safeLog.warn(
              `Failed to kill game process ${gameProcess.pid} on window closed: ${e.message}`
            );
          }
        }
        gameProcess = null;
      }
      cleanupBeforeQuit();
      mainWindow = null;
    },
    onReady: () => checkExistingInstallation(),
  });
}


app.whenReady().then(async () => {
  try {
    loadSettingsFromDisk();

    createWindow();

    // Wire the Discord module to main.js's runtime state. The module owns
    // its own playerInGame / gameStartTime; we hand it the few main-process
    // signals it can't infer on its own (game-process liveness, app version,
    // current update banner state).
    discordRpc.setupDiscordIntegration({
      isGameActuallyRunning,
      getAppVersion: () => app.getVersion(),
      getUpdateInfo: () => (updater ? updater.getUpdateInfo() : { updateAvailable: false, latestVersion: null }),
      onStateMismatch: () => {
        // Discord noticed the game process is no longer alive; sync our
        // gameProcess handle so the rest of main.js doesn't keep waiting
        // on a dead pid.
        gameProcess = null;
      },
      onPlayerStats: (stats) => {
        // Fallback updater signal: if everyone else is on a newer version,
        // surface the update banner even when the auto-updater hasn't
        // fired yet. Mirrors the original inline behavior of
        // fetchPlayerCount() in app/main.js.
        if (!stats || !stats.versionBreakdown) return;
        const currentVersion = app.getVersion();

        let mostCommonVersion = null;
        let maxCount = 0;
        for (const [version, count] of Object.entries(stats.versionBreakdown)) {
          if (count > maxCount && version !== currentVersion) {
            maxCount = count;
            mostCommonVersion = version;
          }
        }

        if (!mostCommonVersion || mostCommonVersion === currentVersion) return;

        // Simple semver comparison.
        const currentParts = currentVersion.split(".").map(Number);
        const latestParts = mostCommonVersion.split(".").map(Number);
        let isNewer = false;
        for (
          let i = 0;
          i < Math.max(currentParts.length, latestParts.length);
          i++
        ) {
          const current = currentParts[i] || 0;
          const latest = latestParts[i] || 0;
          if (latest > current) {
            isNewer = true;
            break;
          } else if (latest < current) {
            break;
          }
        }

        if (isNewer && updater) {
          updater.bumpUpdateFromFallback(mostCommonVersion);
        }
      },
    });

    registerLinkHandlers();
    registerDownloadsIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      getGameInstallDir: () => GAME_INSTALL_DIR,
      setGameInstallDir: (dir) => {
        GAME_INSTALL_DIR = dir;
      },
      setResourcesDir: (dir) => {
        RESOURCES_DIR = dir;
      },
      playerTracker,
      findGameInstallation,
      isRunningAsAdmin,
      isDirectoryWritable,
      createDirectoryWithPermissions,
      loadSettingsFromDisk,
      launchGameLogic,
    });

    // On-disk feature toggle IPC. Each registrar wires a small set of
    // renderer-facing handlers and reuses the factory-bound probes declared
    // at the top of this file (so load-settings + launchGameLogic see the
    // same status the IPC handlers report).
    registerDxvkIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      getGameInstallDir: () => GAME_INSTALL_DIR,
      getGameProcess: () => gameProcess,
      getSettings: () => settings,
      saveSettingsToDisk,
      downloadFile,
      extractZip,
      readCurrentFpsFromDxvkConf,
      checkDxvkStatus,
    });
    registerSkipIntroIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      getGameInstallDir: () => GAME_INSTALL_DIR,
      getSettings: () => settings,
      saveSettingsToDisk,
      downloadFile,
      extractZip,
      checkSkipIntroStatus,
    });
    registerSrsDllIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      getGameInstallDir: () => GAME_INSTALL_DIR,
      downloadFile,
      extractZip,
      checkSrsDllVersion,
    });
    registerGfwlServerIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      getGameInstallDir: () => GAME_INSTALL_DIR,
      checkGfwlServerStatus,
      downloadFile,
      extractZip,
    });

    // register the game install-location handlers
    // (open-game-directory, change-game-location, execute-game-move,
    // clear-saved-game-path, browse-for-existing-game,
    // get-game-installation-path). Mutable state is exposed via
    // getter/setter callbacks so the module can update GAME_INSTALL_DIR /
    // RESOURCES_DIR when the user moves or browses to a new install.
    registerLocationIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      getGameProcess: () => gameProcess,
      getGameInstallDir: () => GAME_INSTALL_DIR,
      setGameInstallDir: (dir) => {
        GAME_INSTALL_DIR = dir;
      },
      setResourcesDir: (dir) => {
        RESOURCES_DIR = dir;
      },
      getSettings: () => settings,
      saveSettingsToDisk,
      checkSkipIntroStatus,
      checkDxvkStatus,
      checkExistingInstallation,
    });

    // configure autoUpdater + register update events / IPC. Must
    // run inside whenReady because the IPC handlers want a live ipcMain
    // and the boot timers below depend on the returned API. cleanupBeforeQuit
    // is hoisted (function declaration) so passing it directly is safe.
    updater = setupUpdater({
      ipcMain,
      getMainWindow: () => mainWindow,
      getSettings: () => settings,
      saveSettingsToDisk,
      cleanupBeforeQuit,
      refreshDiscord: () => discordRpc.refresh(),
    });

    // register the misc IPC bundle (settings, install probes,
    // system info, diagnostics, app info, restart-as-admin). All five
    // sub-modules pull what they need out of a single DI bag, so we wire
    // every binding they could possibly want here. Mutable state
    // (settings, GAME_INSTALL_DIR, RESOURCES_DIR) is exposed via getter /
    // setter callbacks so the modules never reach into main.js's scope.
    registerMiscIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      cleanupBeforeQuit,
      getSettings: () => settings,
      setSettings: (next) => {
        settings = next;
      },
      saveSettingsToDisk,
      getDiagnosticsDeps,
      handleSkipIntroToggle,
      readCurrentFpsFromDxvkConf,
      checkDxvkStatus,
      findGameInstallation,
      isGFWLInstalled,
      isDX9Installed,
      isVcRedistX86Installed,
      checkWindowsLicenseManagerService,
      checkXboxLiveNetworkingService,
      setGameInstallDir: (dir) => {
        GAME_INSTALL_DIR = dir;
      },
      setResourcesDir: (dir) => {
        RESOURCES_DIR = dir;
      },
    });

    playerTracker.on("public-stats", (stats) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("player-count-update", stats);
      }
    });

    playerTracker.start();

    // Wire the activation IPC contract: activate-game (full pipeline including
    // .NET 6.0 install + XLiveActivateHelper token injection), get-current-pcid
    // (registry probe + diagnostics dump), and backup-pcid (creates the
    // SRPCIDBACKUP recovery point). All three handlers + the activate flow
    // were extracted verbatim from main.js — no logic changed.
    registerActivationIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      getGameInstallDir: () => GAME_INSTALL_DIR,
      appDir: __dirname,
    });

    setTimeout(() => {
      updater.checkForFailedInstallation();
    }, 2000); // Check before auto-update check

    setTimeout(() => {
      updater.checkForUpdates();
    }, 3000); // Wait 3 seconds before checking for updates

    app.on("activate", function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    setTimeout(() => {
      checkActivationStatus();
    }, 3000); // Give the app time to fully initialize
  } catch (error) {
    safeLog.error("App initialization error:", error);
  }
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    // If gameProcess is null, it means no game is running,
    // and since all windows are closed (and the close wasn't prevented by the 'close' event handler),
    // it's safe to quit the app.
    if (gameProcess === null) {
      safeLog.info("All windows closed and game is not running. Quitting app.");
      app.quit();
    } else {
      // This case should ideally be rare if the mainWindow.on('close') event correctly prevents closure.
      // It implies the window closed despite the game running, possibly due to an unhandled scenario or force quit.
      safeLog.warn(
        "All windows reported closed, but game is still running. App remains active. This might indicate an issue if the main window was expected to stay open."
      );
    }
  }
});

// launchGameLogic and findGameInstallation are now produced by factories in
// app/main/game/{launch,install}.js. We bind them here so the
// rest of main.js can keep calling launchGameLogic(...) and
// findGameInstallation() exactly as before. The factories close over our
// mutable state (settings, GAME_INSTALL_DIR, gameProcess) via getter/setter
// callbacks so the modules don't need to import main.js directly.
const findGameInstallation = makeFindGameInstallation({
  getSettings: () => settings,
  getGameInstallDir: () => GAME_INSTALL_DIR,
  setGameInstallDir: (dir) => {
    GAME_INSTALL_DIR = dir;
  },
  setResourcesDir: (dir) => {
    RESOURCES_DIR = dir;
  },
});

// Activation factory bindings. createDirectoryWithPermissions mutates
// GAME_INSTALL_DIR / RESOURCES_DIR on its fallback path; checkActivationStatus
// pings the renderer via the main window. Both close over our mutable state
// via the same getter/setter shape as the other factories above.
const createDirectoryWithPermissions = makeCreateDirectoryWithPermissions({
  setGameInstallDir: (dir) => {
    GAME_INSTALL_DIR = dir;
  },
  setResourcesDir: (dir) => {
    RESOURCES_DIR = dir;
  },
});
const checkActivationStatus = makeCheckActivationStatus({
  getMainWindow: () => mainWindow,
});

// Feature-toggle probe bindings. These need to be defined BEFORE the
// launchGameLogic factory call below because they're passed in via DI
// (TDZ protection - const reads after declaration only).
const readCurrentFpsFromDxvkConf = makeReadCurrentFpsFromDxvkConf({
  getGameInstallDir: () => GAME_INSTALL_DIR,
});
const checkDxvkStatus = makeCheckDxvkStatus({
  getGameInstallDir: () => GAME_INSTALL_DIR,
});
const checkSkipIntroStatus = makeCheckSkipIntroStatus({
  getGameInstallDir: () => GAME_INSTALL_DIR,
  getSettings: () => settings,
  saveSettingsToDisk,
});
const checkSrsDllVersion = makeCheckSrsDllVersion({
  getGameInstallDir: () => GAME_INSTALL_DIR,
});
const checkGfwlServerStatus = makeCheckGfwlServerStatus({
  getGameInstallDir: () => GAME_INSTALL_DIR,
});
const handleSkipIntroToggle = makeHandleSkipIntroToggle({
  getMainWindow: () => mainWindow,
  getGameInstallDir: () => GAME_INSTALL_DIR,
  getResourcesDir: () => RESOURCES_DIR,
  getSettings: () => settings,
  saveSettingsToDisk,
  downloadFile,
  extractZip,
  checkSkipIntroStatus,
});

// setDefaultGameConfig probe. Must be declared BEFORE launchGameLogic for
// the same TDZ reason as the feature-toggle bindings above (it's part of
// the launchGameLogic deps bag).
const setDefaultGameConfig = makeSetDefaultGameConfig({
  getGameInstallDir: () => GAME_INSTALL_DIR,
});

const launchGameLogic = makeLaunchGameLogic({
  getMainWindow: () => mainWindow,
  getGameProcess: () => gameProcess,
  setGameProcess: (proc) => {
    gameProcess = proc;
  },
  getGameInstallDir: () => GAME_INSTALL_DIR,
  getDiagnosticsDeps,
  readCurrentFpsFromDxvkConf,
  isGamePathInProtectedDirectory,
  setDefaultGameConfig,
  checkDxvkStatus,
  restoreOriginalPcid,
  playerTracker,
});

ipcMain.handle("launch-game", async (event, gameSettings) => {
  return await launchGameLogic(gameSettings, "user-click");
});


// Window-control IPC (minimize / close / start-drag / perform-drag /
// move-window) is registered in app/main/window/controls.js. Keeping all
// five handlers in one place makes the frameless-titlebar contract easy to
// audit and removes ~50 lines of boilerplate from this file.
registerWindowControls({
  getMainWindow: () => mainWindow,
  isGameRunning: () => gameProcess !== null,
});

// Helper function to verify game is actually running. Used both as a local
// guard and as a dependency injected into the Discord RPC module so it can
// detect the "thought we were playing but the process died" mismatch.
function isGameActuallyRunning() {
  if (!gameProcess) return false;
  if (gameProcess.killed) return false;

  try {
    if (gameProcess.pid) {
      // Signal 0 doesn't kill anything; it's a "does this pid exist?" probe.
      process.kill(gameProcess.pid, 0);
      return true;
    }
  } catch (_error) {
    // ESRCH - process gone.
    return false;
  }

  return true;
}

// Discord RPC lifecycle (initDiscord, fetchPlayerCount, updateDiscordActivity,
// the keep-alive interval, and shutdown teardown) lives in
// app/main/discord/rpc.js. We keep cleanupBeforeQuit() here because it also
// stops the player tracker and may grow more responsibilities later.
let cleanupCalled = false; // Prevent double cleanup
function cleanupBeforeQuit() {
  if (cleanupCalled) {
    safeLog.info("[Cleanup] Already cleaned up, skipping...");
    return;
  }
  cleanupCalled = true;
  safeLog.info("[Cleanup] Starting cleanup before quit...");

  // Discord RPC: timers + connection teardown all happen inside the module.
  discordRpc.cleanup();

  try {
    playerTracker.stop();
    safeLog.info("[Cleanup] Stopped player tracking");
  } catch (error) {
    safeLog.error("[Cleanup] Error stopping player tracking:", error);
  }

  safeLog.info("[Cleanup] Cleanup complete");
}

app.on("before-quit", () => {
  safeLog.info("[App] before-quit event fired");
  cleanupBeforeQuit();
});

// Additional cleanup on will-quit (last chance before app exits)
app.on("will-quit", () => {
  safeLog.info("[App] will-quit event fired");
  cleanupBeforeQuit(); // Safe to call multiple times due to cleanupCalled flag
});

async function checkExistingInstallation() {
  try {
    // IMPORTANT: Only auto-scan if user opted-in during installation
    // If auto-scan is disabled (default for privacy), only check explicitly saved paths
    safeLog.info(`[Install Check] Auto-scan: ${settings.autoScanEnabled}`);

    // Check 1: Game files
    // findGameInstallation will respect autoScanEnabled setting
    // If disabled, it only checks saved custom paths (no file system scanning)
    const foundLocation = await findGameInstallation();
    const gameFilesExist = foundLocation !== null;

    const gfwlInstalled = await isGFWLInstalled();

    const dx9Installed = await isDX9Installed();

    const vcRedistInstalled = await isVcRedistX86Installed();

    const allDependenciesMet =
      gameFilesExist && gfwlInstalled && dx9Installed && vcRedistInstalled;

    safeLog.info(
      `[Install Check] Game: ${gameFilesExist ? "OK" : "MISSING"} | GFWL: ${
        gfwlInstalled ? "OK" : "MISSING"
      } | DirectX: ${dx9Installed ? "OK" : "MISSING"} | VC++ x86: ${
        vcRedistInstalled ? "OK" : "MISSING"
      } | Status: ${allDependenciesMet ? "READY" : "MISSING"}`
    );

    if (foundLocation) {
      GAME_INSTALL_DIR = foundLocation;
      RESOURCES_DIR = path.join(GAME_INSTALL_DIR, "Resources");

      // If user has explicitly set a custom path, preserve it (don't overwrite with auto-found location)
      // Only update custom path if it's not already set (to preserve user's explicit choice)
      if (!settings.customGamePath) {
        settings.customGamePath = foundLocation;
        saveSettingsToDisk();
        safeLog.info(
          `[Install Check] Saved auto-found location to custom game path: ${foundLocation}`
        );
      } else if (foundLocation === settings.customGamePath) {
        // Path matches saved custom path - ensure GAME_INSTALL_DIR is synced
        safeLog.info(
          `[Install Check] Found location matches saved custom path: ${foundLocation}`
        );
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("game-installation-status", {
        installed: allDependenciesMet,
        path: foundLocation,
        dependencies: {
          gameFiles: gameFilesExist,
          gfwl: gfwlInstalled,
          dx9: dx9Installed,
          vcRedistX86: vcRedistInstalled,
        },
      });
    }

    return allDependenciesMet;
  } catch (error) {
    safeLog.error("Error checking installation:", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("game-installation-status", {
        installed: false,
        path: null,
        dependencies: {
          gameFiles: false,
          gfwl: false,
          dx9: false,
          vcRedistX86: false,
        },
      });
    }
    return false;
  }
}




