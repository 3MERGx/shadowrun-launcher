// System-info IPC handlers (Phase 10).
//
// Handlers registered:
//   get-gpu-info     - single-GPU probe. Delegates to detectGPUVendor() in
//                      app/main/system/gpu.js.
//   get-system-info  - GPU + CPU + OS + NAT composed report. Cached on
//                      settings.cachedSystemInfo on the first successful
//                      run (saveSettingsToDisk persists it across launches);
//                      `forceRefresh: true` from the renderer bypasses the
//                      cache and re-detects everything.

const { safeLog } = require("../logger");
const { detectGPUVendor, getSystemInfo } = require("../system");

function registerSystemInfoIpc(deps) {
  const { ipcMain, getSettings, saveSettingsToDisk } = deps;

  // Get GPU information (legacy - keeping for backwards compatibility)
  ipcMain.handle("get-gpu-info", async () => {
    try {
      const gpuInfo = await detectGPUVendor();
      return { success: true, gpu: gpuInfo };
    } catch (error) {
      safeLog.error("[IPC] Error getting GPU info:", error);
      return { success: false, error: error.message };
    }
  });

  // Get full system information (GPU + CPU + OS)
  ipcMain.handle("get-system-info", async (event, forceRefresh = false) => {
    try {
      const settings = getSettings();
      // Return cached if available and not forcing refresh
      if (!forceRefresh && settings.cachedSystemInfo) {
        safeLog.info("[System Info] Returning cached system info");
        return {
          success: true,
          system: settings.cachedSystemInfo,
          cached: true,
        };
      }

      // Detect fresh system info
      safeLog.info("[System Info] Detecting system info...");
      const systemInfo = await getSystemInfo();

      // Cache it in settings
      settings.cachedSystemInfo = systemInfo;
      saveSettingsToDisk();

      return { success: true, system: systemInfo, cached: false };
    } catch (error) {
      safeLog.error("[IPC] Error getting system info:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerSystemInfoIpc };
