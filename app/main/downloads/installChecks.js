// Runtime checks for "is component X installed on this machine".
//
// These are ALSO used by the diagnostics composer (app/main/diagnostics) and
// the persistent-issues panel - exporting them here lets us share a single
// implementation between the download flow and the diagnostics flow without
// any DI gymnastics. main.js still imports `isDX9Installed` separately to
// feed it into the diagnostics DI bag, since the diagnostics module itself
// stays storage-agnostic.
//
// Behavior preserved verbatim from app/main.js (Phase 6 extraction):
//   - isDX9Installed: looks for d3dx9_43.dll (preferred) or d3dx9_42.dll
//     (older installs) under %SystemRoot%\System32 OR %SystemRoot%\SysWOW64.
//     Either DLL on either path counts as "installed" - we don't require both.
//   - isGFWLInstalled: requires the GFWL Live Client folder AND at least one
//     of the two known executable names (gfwlclient.exe / GFWLClient.exe -
//     casing varies between installer versions).

const { safeLog } = require("../logger");
const fs = require("fs");
const path = require("path");

// Helper function to check if DirectX 9 is installed
// Checks for d3dx9_43.dll which indicates DirectX 9 runtime components are installed
function isDX9Installed() {
  return new Promise((resolve) => {
    safeLog.debug("[DirectX Check] Checking for DirectX 9 runtime components...");

    const systemRoot = process.env.SystemRoot || "C:\\Windows";

    const paths = [
      path.join(systemRoot, "System32"),
      path.join(systemRoot, "SysWOW64"),
    ];

    // Check for DirectX 9 Extensions DLLs (43 is latest; 42 as fallback for older installs)
    const dllsToCheck = ["d3dx9_43.dll", "d3dx9_42.dll"];

    for (const dir of paths) {
      if (!fs.existsSync(dir)) continue;

      for (const dll of dllsToCheck) {
        const dllPath = path.join(dir, dll);
        if (fs.existsSync(dllPath)) {
          safeLog.debug(
            `[DirectX Check] ✅ Found DirectX 9 component: ${path.basename(dir)}\\${dll}`
          );
          resolve(true);
          return;
        }
      }
    }

    safeLog.debug(
      "[DirectX Check] ❌ DirectX 9 runtime components not found (d3dx9_43/42.dll missing)"
    );
    resolve(false);
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

module.exports = { isDX9Installed, isGFWLInstalled };
