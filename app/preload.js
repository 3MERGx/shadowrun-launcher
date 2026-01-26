const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  launchGame: (settings) => ipcRenderer.invoke("launch-game", settings),
  downloadGame: () => ipcRenderer.invoke("download-game"),
  activateGame: () => ipcRenderer.invoke("activate-game"),
  openDiscord: () => ipcRenderer.invoke("open-discord"),
  openWebsite: () => ipcRenderer.invoke("open-website"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // Settings
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  loadSettings: () => ipcRenderer.invoke("load-settings"),
  openDxvkConf: () => ipcRenderer.invoke("open-dxvk-conf"),

  // Version
  getVersion: () => ipcRenderer.invoke("get-version"),

  // Window control functions
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  startDrag: () => ipcRenderer.invoke("start-drag"),
  moveWindow: (deltaX, deltaY) =>
    ipcRenderer.invoke("move-window", deltaX, deltaY),

  // Download progress events
  onGameFilesProgress: (callback) => {
    ipcRenderer.on("game-files-progress", (_, progress) => callback(progress));
  },
  onGameFilesExtracting: (callback) => {
    ipcRenderer.on("game-files-extracting", () => callback());
  },
  onGfwlProgress: (callback) => {
    ipcRenderer.on("gfwl-progress", (_, progress) => callback(progress));
  },
  onDxProgress: (callback) => {
    ipcRenderer.on("dx-progress", (_, progress) => callback(progress));
  },
  onDxInstallProgress: (callback) => {
    ipcRenderer.on("dx-install-progress", (_, message) => callback(message));
  },
  onGfwlInstallProgress: (callback) => {
    ipcRenderer.on("gfwl-install-progress", (_, message) => callback(message));
  },
  onDownloadMessage: (callback) => {
    ipcRenderer.on("download-message", (_, message) => callback(message));
  },
  onDownloadComplete: (callback) => {
    ipcRenderer.on("download-complete", () => callback());
  },
  onDownloadError: (callback) => {
    ipcRenderer.on("download-error", (_, error) => callback(error));
  },
  cancelDownload: () => ipcRenderer.invoke("cancel-download"),

  // Add this with other event handlers
  onComponentSkipped: (callback) => {
    ipcRenderer.on("component-skipped", (_, component, message) =>
      callback(component, message)
    );
  },

  // Add this with the other methods
  setMaxFrameRate: (fps) => ipcRenderer.invoke("set-max-frame-rate", fps),
  getCurrentFpsFromDxvkConf: () =>
    ipcRenderer.invoke("get-current-fps-from-dxvk-conf"),

  // Add this method
  checkGameInstalled: () => ipcRenderer.invoke("check-game-installed"),

  // Add this event listener
  onGameInstallationStatus: (callback) => {
    ipcRenderer.on("game-installation-status", (_, status) => callback(status));
  },

  // Add player count methods
  getPlayerCount: () => ipcRenderer.invoke("get-player-count"),

  // Add player count event listener
  onPlayerCountUpdate: (callback) => {
    ipcRenderer.on("player-count-update", (_, count) => callback(count));
  },

  // Add this with other event listeners
  onShowNotification: (callback) => {
    ipcRenderer.on("show-notification", (_, data) => callback(data));
  },

  // Add this with other event listeners
  onGameStateUpdate: (callback) => {
    ipcRenderer.on("game-state-update", (_, state) => callback(state));
  },

  // Add this to your exposed API in preload.js
  onActivationStatus: (callback) => {
    ipcRenderer.on("activation-status", (_, status) => callback(status));
  },

  // Add this to your existing exposed API in preload.js
  toggleSkipIntro: (enabled) =>
    ipcRenderer.invoke("toggle-skip-intro", enabled),

  // Clear saved game path
  clearSavedGamePath: () => ipcRenderer.invoke("clear-saved-game-path"),

  // Add this to your exposed API in preload.js
  onSkipIntroProgress: (callback) => {
    ipcRenderer.on("skip-intro-progress", (_, data) => callback(data));
  },

  // Add this to your exposed API in preload.js
  checkSkipIntroStatus: () => ipcRenderer.invoke("check-skip-intro-status"),

  // Add to the exposed API
  onSkipIntroFinalState: (callback) => {
    ipcRenderer.on("skip-intro-final-state", (_, state) => callback(state));
  },

  // DXVK Support methods
  toggleDxvk: (enabled) => ipcRenderer.invoke("toggle-dxvk", enabled),
  checkDxvkStatus: () => ipcRenderer.invoke("check-dxvk-status"),
  onDxvkProgress: (callback) => {
    ipcRenderer.on("dxvk-progress", (_, data) => callback(data));
  },

  // srs_shadowrun.dll version switching methods
  switchSrsDllVersion: (version) =>
    ipcRenderer.invoke("switch-srs-dll-version", version),
  checkSrsDllVersion: () => ipcRenderer.invoke("check-srs-dll-version"),
  onSrsDllProgress: (callback) => {
    ipcRenderer.on("srs-dll-progress", (_, data) => callback(data));
  },

  // Changelog methods
  getChangelog: () => ipcRenderer.invoke("get-changelog"),

  // Add this with the other exposed methods
  openGameDirectory: () => ipcRenderer.invoke("open-game-directory"),

  // Make sure the notification API is exposed if not already
  showNotification: (data) => ipcRenderer.invoke("show-notification", data),

  // Get current PCID
  getCurrentPcid: () => ipcRenderer.invoke("get-current-pcid"),

  // Backup current PCID - this should trigger the UAC prompt
  backupPcid: () => ipcRenderer.invoke("backup-pcid"),

  // Add a simple test function to verify IPC is working
  pingMain: () => ipcRenderer.invoke("ping-main"),

  // Add this to your exposed API
  restartAsAdmin: () => ipcRenderer.invoke("restart-as-admin"),

  // Diagnostics and error handling methods
  runDiagnostics: () => ipcRenderer.invoke("run-diagnostics"),
  getGpuInfo: () => ipcRenderer.invoke("get-gpu-info"),
  getAllGpus: () => ipcRenderer.invoke("get-all-gpus"),
  getSystemInfo: (forceRefresh) =>
    ipcRenderer.invoke("get-system-info", forceRefresh),
  fixLicenseManager: () => ipcRenderer.invoke("fix-license-manager"),
  restartXboxNetworking: () => ipcRenderer.invoke("restart-xbox-networking"),
  checkDirectX: () => ipcRenderer.invoke("check-directx"),
  checkGpuDrivers: () => ipcRenderer.invoke("check-gpu-drivers"),
  runSfcScan: () => ipcRenderer.invoke("run-sfc-scan"),
  openWindowsUpdate: () => ipcRenderer.invoke("open-windows-update"),

  // Auto-updater methods
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  confirmUpdateDownload: () => ipcRenderer.invoke("confirm-update-download"),
  retryUpdateDownload: () => ipcRenderer.invoke("retry-update-download"),
  getManualDownloadUrl: () => ipcRenderer.invoke("get-manual-download-url"),
  confirmRollbackDownload: (downloadUrl) =>
    ipcRenderer.invoke("confirm-rollback-download", downloadUrl),
  onShowUpdateDialog: (callback) => {
    ipcRenderer.on("show-update-dialog", (event, data) => callback(data));
  },
  onShowRollbackDialog: (callback) => {
    ipcRenderer.on("show-rollback-dialog", (event, data) => callback(data));
  },
  onRollbackDownloadProgress: (callback) => {
    ipcRenderer.on("rollback-download-progress", (event, progress) =>
      callback(progress)
    );
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on("update-not-available", (event, data) => callback(data));
  },
  onUpdateCheckDevMode: (callback) => {
    ipcRenderer.on("update-check-dev-mode", () => callback());
  },
  onUpdateReadyToInstall: (callback) => {
    ipcRenderer.on("update-ready-to-install", (event, data) => callback(data));
  },
  onUpdateDownloadStarted: (callback) => {
    ipcRenderer.on("update-download-started", callback);
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on("update-download-progress", (event, progress) =>
      callback(progress)
    );
  },
  onUpdateDownloadComplete: (callback) => {
    ipcRenderer.on("update-download-complete", callback);
  },
  // Silent update handlers (deprecated - automatic updates disabled)
  // Kept for backward compatibility but no longer triggered
  onUpdateAvailableSilent: (callback) => {
    ipcRenderer.on("update-available-silent", (event, data) => callback(data));
  },
  onUpdateDownloadedSilent: (callback) => {
    ipcRenderer.on("update-downloaded-silent", (event, data) => callback(data));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on("update-error", (event, data) => callback(data));
  },
  onUpdateInstallationFailed: (callback) => {
    ipcRenderer.on("update-installation-failed", (event, data) =>
      callback(data)
    );
  },
  onUpdateInstallationSuccess: (callback) => {
    ipcRenderer.on("update-installation-success", (event, data) =>
      callback(data)
    );
  },

  // Game location management
  getGameInstallationPath: () =>
    ipcRenderer.invoke("get-game-installation-path"),
  changeGameLocation: () => ipcRenderer.invoke("change-game-location"),
  executeGameMove: (newPath) =>
    ipcRenderer.invoke("execute-game-move", newPath),
  onGameMoveProgress: (callback) => {
    ipcRenderer.on("game-move-progress", (_, data) => callback(data));
  },
  browseForExistingGame: () => ipcRenderer.invoke("browse-for-existing-game"),

  // Listen for settings updates
  onSettingsUpdated: (callback) => {
    ipcRenderer.on("settings-updated", (_, settings) => callback(settings));
  },

  // Launch error handler
  onLaunchError: (callback) => {
    ipcRenderer.on("launch-error", (_, data) => callback(data));
  },

  // Game crash handler
  onGameCrash: (callback) => {
    ipcRenderer.on("game-crash", (_, data) => callback(data));
  },

  // Check for persistent issues (services, dependencies)
  checkPersistentIssues: () => ipcRenderer.invoke("check-persistent-issues"),

  // For receiving messages from main (if you use them)
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});

console.log("Preload script executed and API exposed.");
