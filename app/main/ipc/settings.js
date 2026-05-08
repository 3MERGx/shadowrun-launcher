// Settings IPC handlers (Phase 10).
//
// Handlers registered:
//   load-settings  - returns the current settings object after refreshing
//                    probes that can drift behind the user's back: FPS from
//                    dxvk.conf, DXVK enable state, and Skip Intro (file probe).
//                    Those fields are written into the settings object so the
//                    renderer reflects on-disk state, not stale boot state.
//   save-settings  - replaces the active settings object with the
//                    payload from the renderer. If the skipIntro flag
//                    flipped, runs handleSkipIntroToggle FIRST so the
//                    NoIntroFix mod files get installed/uninstalled
//                    before the new settings are committed; if the
//                    toggle fails we return the toggle error and do
//                    NOT persist the change.
//
// The mutable `settings` object lives in main.js and is exposed via
// getSettings/setSettings DI hooks; saveSettingsToDisk persists the
// settings.json file on the user-data path.

const { safeLog } = require("../logger");
function registerSettingsIpc(deps) {
  const {
    ipcMain,
    getSettings,
    setSettings,
    saveSettingsToDisk,
    handleSkipIntroToggle,
    readCurrentFpsFromDxvkConf,
    checkDxvkStatus,
    checkSkipIntroStatus,
  } = deps;

  // Add this to the load-settings handler
  ipcMain.handle("load-settings", async () => {
    const settings = getSettings();

    // Try to get FPS from dxvk.conf
    const fps = readCurrentFpsFromDxvkConf();
    if (fps) {
      settings.maxFrameRate = fps;
    }

    // Check DXVK status and update settings
    const dxvkStatus = await checkDxvkStatus();
    settings.dxvk = dxvkStatus.enabled;

    // Skip Intro: like DXVK, derive from files on disk (not settings.json alone)
    const skipIntroStatus = await checkSkipIntroStatus();
    settings.skipIntro = skipIntroStatus.installed;

    return settings;
  });

  // Update the save-settings handler
  ipcMain.handle("save-settings", async (event, newSettings) => {
    try {
      const settings = getSettings();
      // Check if Skip Intro setting changed
      if (settings.skipIntro !== newSettings.skipIntro) {
        const result = await handleSkipIntroToggle(newSettings.skipIntro);
        if (!result.success) {
          return result;
        }
      }

      // Update settings
      setSettings(newSettings);
      saveSettingsToDisk();
      return { success: true };
    } catch (error) {
      safeLog.error("Error saving settings:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerSettingsIpc };
