/**
 * Pre-launch diagnostics composer.
 *
 * Runs every check in series and produces a single diagnostics report
 * consumed by:
 *   1. The launch path (app/main.js launchGameLogic) - blocks launch on
 *      critical issues, surfaces auto-fix toasts on resolved issues.
 *   2. The "run-diagnostics" IPC handler - the report drives the UI's
 *      diagnostics panel and is augmented with PCID info before return.
 *
 * Why dependency injection: this module wants to call several launcher-
 * internal helpers (DX9 install check, License Manager / Xbox Live
 * service probes + fixes) that haven't been extracted from main.js yet.
 * The launch sequence (Phase 6 - downloads, Phase 7 - launch) and the
 * auto-fix services (Phase 5b) will land later; this composer accepts
 * those operations as injected dependencies so 5a is reviewable and
 * smoke-testable on its own.
 *
 * The shape of the returned report is unchanged from the inline
 * runPreLaunchDiagnostics() that previously lived in app/main.js. Any
 * callers consuming `diagnostics.gpuInfo`, `diagnostics.issues`, etc.
 * keep working without modification.
 */

const os = require("os");
const { safeLog } = require("../logger");
const { detectGPUVendor, detectNATType } = require("../system");
const {
  checkWindowsFirewall,
  checkNetworkConnectivity,
  checkDotNetFramework,
} = require("./checks");

/**
 * @typedef {Object} DiagnosticsDeps
 * @property {() => Promise<boolean>} isDX9Installed
 *   Returns true if DirectX 9 is installed.
 * @property {() => Promise<boolean>} isVcRedistX86Installed
 *   Returns true if Microsoft Visual C++ v14 Redistributable (x86) is installed.
 * @property {() => Promise<{ running: boolean, exists: boolean }>} checkLicenseManager
 *   Probes the Windows License Manager Service.
 * @property {() => Promise<{ running: boolean, exists: boolean }>} checkXboxNetworking
 *   Probes the Xbox Live Networking Service (XboxNetApiSvc).
 */

/**
 * Run the full pre-launch diagnostics suite. Always resolves; individual
 * check failures are caught so a single broken probe never aborts the
 * launch path.
 *
 * @param {DiagnosticsDeps} deps
 * @returns {Promise<{
 *   directX: boolean,
 *   vcRedistX86: boolean,
 *   licenseManager: boolean,
 *   xboxNetworking: boolean,
 *   gpuInfo: { vendor: string, name: string },
 *   natType: { type: string, status?: string },
 *   firewall: { enabled: boolean | null, status: string },
 *   network: { online: boolean, status: string },
 *   dotNet: { installed: boolean, version: string },
 *   os: string,
 *   issues: Array<{ type: string, severity: string, message: string, fix: string }>,
 *   autoFixed: string[],
 * }>}
 */
async function runPreLaunchDiagnostics(deps) {
  const {
    isDX9Installed,
    isVcRedistX86Installed,
    checkLicenseManager,
    checkXboxNetworking,
  } = deps;

  safeLog.info("\n========================================");
  safeLog.info("[Diagnostics] RUNNING PRE-LAUNCH DIAGNOSTICS");
  safeLog.info("========================================");

  const diagnostics = {
    directX: false,
    vcRedistX86: false,
    licenseManager: false,
    xboxNetworking: false,
    gpuInfo: { vendor: "unknown", name: "Unknown" },
    natType: { type: "Unknown" },
    firewall: { enabled: null, status: "Unknown" },
    network: { online: false, status: "Unknown" },
    dotNet: { installed: false, version: "Unknown" },
    os: "Unknown",
    issues: [],
    autoFixed: [],
  };

  // --------------------------------------------------------------------------
  // DirectX 9
  // --------------------------------------------------------------------------
  try {
    diagnostics.directX = await isDX9Installed();
    if (!diagnostics.directX) {
      diagnostics.issues.push({
        type: "directx",
        severity: "critical",
        message:
          "DirectX 9 is not installed. This will cause 'Unable to create Direct3D Device' errors.",
        fix: "Install DirectX 9 from the launcher's setup options.",
      });
    } else {
      safeLog.info("[Diagnostics] DirectX: OK");
    }
  } catch (error) {
    safeLog.error("[Diagnostics] Error checking DirectX:", error.message);
  }

  // --------------------------------------------------------------------------
  // Microsoft Visual C++ v14 (MSVC 14.x) x86 redistributable
  // Without this the game's ASI and DLL hooks cannot be loaded by the OS,
  // which means the AHL / server-redirect patches never take effect.
  // --------------------------------------------------------------------------
  try {
    diagnostics.vcRedistX86 = await isVcRedistX86Installed();
    if (!diagnostics.vcRedistX86) {
      diagnostics.issues.push({
        type: "vcredist",
        severity: "critical",
        message:
          "Microsoft Visual C++ v14 Redistributable (x86) is not installed. Game hooks and server DLLs will not load.",
        fix: "Install Microsoft Visual C++ v14 Redistributable (x86) from the launcher's setup options.",
      });
    } else {
      safeLog.info("[Diagnostics] VC++ v14 x86 redistributable: OK");
    }
  } catch (error) {
    safeLog.error("[Diagnostics] Error checking VC++ redistributable:", error.message);
  }

  // --------------------------------------------------------------------------
  // Windows License Manager Service
  // --------------------------------------------------------------------------
  try {
    const serviceStatus = await checkLicenseManager();
    diagnostics.licenseManager = serviceStatus.running;

    if (serviceStatus.exists && !serviceStatus.running) {
      diagnostics.issues.push({
        type: "license_manager",
        severity: "high",
        message:
          "Windows License Manager Service is not running. This may cause error 0x80072746.",
        fix: "Open services.msc, find 'LicenseManager', and start it manually.",
      });
      safeLog.info("[Diagnostics] WARN License Manager Service: Not Running");
    } else if (serviceStatus.running) {
      safeLog.info("[Diagnostics] License Manager Service: OK");
    }
  } catch (error) {
    safeLog.error(
      "[Diagnostics] Error checking License Manager:",
      error.message
    );
  }

  // --------------------------------------------------------------------------
  // Xbox Live Networking Service
  // --------------------------------------------------------------------------
  try {
    const xboxServiceStatus = await checkXboxNetworking();
    diagnostics.xboxNetworking = xboxServiceStatus.running;

    if (xboxServiceStatus.exists && !xboxServiceStatus.running) {
      diagnostics.issues.push({
        type: "xbox_networking",
        severity: "high",
        message:
          "Xbox Live Networking Service is not running. This may cause P2P connection issues.",
        fix: "Open services.msc, find 'XboxNetApiSvc', and start it manually.",
      });
      safeLog.info("[Diagnostics] WARN Xbox Live Networking Service: Not Running");
    } else if (xboxServiceStatus.running) {
      safeLog.info("[Diagnostics] Xbox Live Networking Service: OK");
    }
  } catch (error) {
    safeLog.error(
      "[Diagnostics] Error checking Xbox Live Networking:",
      error.message
    );
  }

  // --------------------------------------------------------------------------
  // GPU - name + vendor only; no driver-version check. Cached on the
  // diagnostics object so the launch path can reuse it instead of re-shelling.
  // --------------------------------------------------------------------------
  try {
    const gpuInfo = await detectGPUVendor();
    diagnostics.gpuInfo = gpuInfo;
    if (
      gpuInfo &&
      gpuInfo.vendor !== "unknown" &&
      gpuInfo.name !== "Unknown"
    ) {
      safeLog.info(`[Diagnostics] GPU: ${gpuInfo.name}`);
    } else {
      safeLog.info("[Diagnostics] WARN GPU detection inconclusive");
    }
  } catch (error) {
    safeLog.error("[Diagnostics] Error detecting GPU:", error.message);
  }

  // --------------------------------------------------------------------------
  // NAT Type (P2P-relevant signal; firewall-state heuristic, see system/nat.js)
  // --------------------------------------------------------------------------
  try {
    const natInfo = await detectNATType();
    diagnostics.natType = natInfo;
    safeLog.info(`[Diagnostics] NAT Type: ${natInfo.type}`);
  } catch (error) {
    safeLog.error("[Diagnostics] Error checking NAT:", error.message);
  }

  // --------------------------------------------------------------------------
  // Windows Firewall
  // --------------------------------------------------------------------------
  try {
    const firewallInfo = await checkWindowsFirewall();
    diagnostics.firewall = firewallInfo;
    safeLog.info(`[Diagnostics] Firewall: ${firewallInfo.status}`);
  } catch (error) {
    safeLog.error("[Diagnostics] Error checking firewall:", error.message);
  }

  // --------------------------------------------------------------------------
  // Network connectivity (informational only - never blocks launch since
  // the game runs offline; ICMP can also be blocked even when HTTP works).
  // --------------------------------------------------------------------------
  try {
    const networkInfo = await checkNetworkConnectivity();
    diagnostics.network = networkInfo;
    if (!networkInfo.online) {
      safeLog.info(
        "[Diagnostics] WARN Network check failed - this is OK for offline play. Network is only needed for downloading game files/components."
      );
    } else {
      safeLog.info(`[Diagnostics] Network: ${networkInfo.status}`);
    }
  } catch (error) {
    safeLog.error("[Diagnostics] Error checking network:", error.message);
    // Don't fail diagnostics if network check errors - it's not critical for gameplay
  }

  // --------------------------------------------------------------------------
  // .NET Framework 3.5 (required by GFWL)
  // --------------------------------------------------------------------------
  try {
    const dotNetInfo = await checkDotNetFramework();
    diagnostics.dotNet = dotNetInfo;
    if (!dotNetInfo.installed) {
      diagnostics.issues.push({
        type: "dotnet",
        severity: "high",
        message:
          ".NET Framework 3.5 is not installed. GFWL requires .NET Framework 3.5.",
        fix: "Install .NET Framework 3.5 through Windows Features.",
      });
    }
    safeLog.info(`[Diagnostics] .NET Framework: ${dotNetInfo.version}`);
  } catch (error) {
    safeLog.error("[Diagnostics] Error checking .NET:", error.message);
  }

  // --------------------------------------------------------------------------
  // OS label (lightweight version - the full app/main/system getOSDisplayName
  // covers Win 7/8/8.1/Vista/XP and is used by get-system-info; this minimal
  // build-number-based check is fine for the diagnostics report).
  // --------------------------------------------------------------------------
  try {
    let osDisplay = os.type();
    if (osDisplay === "Windows_NT") {
      const release = os.release();
      const version = parseInt(release.split(".")[0], 10);
      if (version === 10) {
        const build = parseInt(release.split(".")[2] || "0", 10);
        osDisplay = build >= 22000 ? "Windows 11" : "Windows 10";
      }
    }
    diagnostics.os = osDisplay;
  } catch (error) {
    safeLog.error("[Diagnostics] Error getting OS:", error.message);
  }

  safeLog.info("========================================");
  safeLog.info(
    `[Diagnostics] Found ${diagnostics.issues.length} issue(s), auto-fixed ${diagnostics.autoFixed.length}`
  );
  safeLog.info("========================================\n");

  return diagnostics;
}

module.exports = {
  runPreLaunchDiagnostics,
  // Re-export the leaf checks so callers can use them individually if
  // needed (e.g. a future "test my firewall" button without running the
  // full suite).
  checkWindowsFirewall,
  checkNetworkConnectivity,
  checkDotNetFramework,
};
