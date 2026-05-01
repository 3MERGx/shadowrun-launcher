/**
 * System info aggregator (GPU + CPU + OS + NAT) for the Shadowrun FPS
 * Launcher. This module is the single entry point most callers should use:
 *
 *   const { getSystemInfo, detectGPUVendor, detectAllGPUs,
 *           detectVendorFromName, detectCPU, detectNATType }
 *     = require("./main/system");
 *
 * `getSystemInfo()` is what the `get-system-info` IPC handler calls. It
 * runs each detector in series (intentional - they each shell out, no
 * point flooding the OS with parallel WMIC processes), then attaches a
 * cleaned-up Windows-version label parsed from `os.release()` so the UI
 * can render "Windows 11" / "Windows 10" / "Windows 7" instead of the raw
 * "10.0.22631" build numbers.
 *
 * Caching is intentionally NOT done here - the IPC layer in main.js owns
 * the `settings.cachedSystemInfo` cache and the `forceRefresh` flag that
 * busts it. This keeps the module side-effect-free and easy to unit test.
 */

const os = require("os");
const { safeLog } = require("../logger");
const {
  detectGPUVendor,
  detectAllGPUs,
  detectVendorFromName,
} = require("./gpu");
const { detectCPU } = require("./cpu");
const { detectNATType } = require("./nat");

/**
 * Map `os.release()` -> a human-readable OS label. Windows 10 and 11 both
 * report `10.0.x` so we have to look at the build number (22000+ -> Win 11,
 * older -> Win 10). Older NT versions (5.x / 6.x) and unknown future
 * versions degrade to a generic `Windows X.Y` label.
 *
 * @returns {string}
 */
function getOSDisplayName() {
  const osType = os.type();
  if (osType !== "Windows_NT") {
    return osType;
  }

  const release = os.release();
  safeLog.info("[OS Detection] Raw release:", release);

  const parts = release.split(".");
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  const build = parseInt(parts[2], 10) || 0;

  let osDisplay;
  if (major === 10 && minor === 0) {
    if (build >= 22000) {
      osDisplay = "Windows 11";
    } else {
      // Windows 10 (any build below 22000, including 2004+ at 19041+).
      osDisplay = "Windows 10";
    }
  } else if (major === 6) {
    if (minor === 1) {
      osDisplay = "Windows 7";
    } else if (minor === 2) {
      osDisplay = "Windows 8";
    } else if (minor === 3) {
      osDisplay = "Windows 8.1";
    } else if (minor === 0) {
      osDisplay = "Windows Vista";
    } else {
      osDisplay = `Windows ${major}.${minor}`;
    }
  } else if (major === 5) {
    if (minor === 1) {
      osDisplay = "Windows XP";
    } else if (minor === 2) {
      osDisplay = "Windows Server 2003";
    } else {
      osDisplay = `Windows ${major}.${minor}`;
    }
  } else {
    osDisplay = `Windows ${major}${minor > 0 ? `.${minor}` : ""}`;
  }

  safeLog.info("[OS Detection] Detected:", osDisplay);
  return osDisplay;
}

/**
 * Composite system info used by the `get-system-info` IPC handler and
 * cached in user settings. Detectors run sequentially (GPU -> CPU -> NAT)
 * to avoid stacking concurrent shell-outs on the user's machine.
 *
 * @returns {Promise<{
 *   gpu: { vendor: string, name: string },
 *   cpu: { name: string },
 *   os:  string,
 *   nat: { type: string, status: string }
 * }>}
 */
async function getSystemInfo() {
  const gpu = await detectGPUVendor();
  const cpu = await detectCPU();
  const nat = await detectNATType();
  return {
    gpu,
    cpu,
    os: getOSDisplayName(),
    nat,
  };
}

module.exports = {
  getSystemInfo,
  getOSDisplayName,
  // Re-export detectors so callers don't have to know about the sub-files.
  detectGPUVendor,
  detectAllGPUs,
  detectVendorFromName,
  detectCPU,
  detectNATType,
};
