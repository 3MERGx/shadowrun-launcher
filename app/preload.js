const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", {
  launchGame: (settings) => ipcRenderer.invoke("launch-game", settings),
  downloadGame: () => ipcRenderer.invoke("download-game"),
  activateGame: () => ipcRenderer.invoke("activate-game"),
  openDiscord: () => ipcRenderer.invoke("open-discord"),
  openWebsite: () => ipcRenderer.invoke("open-website"),

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
  onGfwlProgress: (callback) => {
    ipcRenderer.on("gfwl-progress", (_, progress) => callback(progress));
  },
  onDxProgress: (callback) => {
    ipcRenderer.on("dx-progress", (_, progress) => callback(progress));
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

  // For receiving messages from main (if you use them)
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});

console.log("Preload script executed and API exposed.");
