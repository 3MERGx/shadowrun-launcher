// Diagnostics IPC handler (Phase 10).
//
// Handler registered:
//   run-diagnostics  - runs the full pre-launch diagnostics report (via
//                      runPreLaunchDiagnostics from app/main/diagnostics)
//                      and adds the PCID-in-registry probe on top. The
//                      diagnostics report shape is consumed by the
//                      renderer's "Run Diagnostics" panel; PCID is added
//                      here (not inside the diagnostics composer) because
//                      the registry probe lives in app/utils/registry.js
//                      and isn't otherwise needed by the launch path.

const { safeLog } = require("../logger");
const registryUtils = require("../../utils/registry");
const { runPreLaunchDiagnostics } = require("../diagnostics");

function registerDiagnosticsIpc(deps) {
  const { ipcMain, getDiagnosticsDeps } = deps;

  // Run system diagnostics
  ipcMain.handle("run-diagnostics", async () => {
    try {
      const diagnostics = await runPreLaunchDiagnostics(getDiagnosticsDeps());

      // Add PCID check
      try {
        const pcidExists = await registryUtils.checkPcidInRegistry();
        if (pcidExists) {
          const pcidValue = await registryUtils.getPcidFromRegistry();
          diagnostics.pcid = {
            exists: true,
            value: pcidValue ? pcidValue.toLowerCase() : null,
          };
        } else {
          diagnostics.pcid = {
            exists: false,
            value: null,
          };
        }
      } catch (pcidError) {
        safeLog.error("[Diagnostics] Error checking PCID:", pcidError);
        diagnostics.pcid = {
          exists: false,
          value: null,
          error: pcidError.message,
        };
      }

      return { success: true, diagnostics };
    } catch (error) {
      safeLog.error("[IPC] Error running diagnostics:", error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerDiagnosticsIpc };
