/**
 * Diagnostics-only system checks (firewall, ICMP reachability, .NET 3.5).
 *
 * These are pure helpers used by runPreLaunchDiagnostics() and only by it.
 * They have no external dependencies beyond `child_process.exec` and the
 * shared safeLog. Behavior is verbatim with the inline implementations
 * that previously lived in app/main.js.
 *
 * Notes preserved from the original:
 *   - Network check uses `ping` and may fail behind firewalls / VPNs / ISPs
 *     that block ICMP. A failed ping is NOT treated as offline; it's
 *     reported as "Unable to verify". Network is only required for
 *     downloads, not for offline play, so the diagnostics composer never
 *     escalates this to a critical issue.
 *   - .NET Framework 3.5 must be checked under WOW6432Node too because
 *     GFWL is a 32-bit consumer and on 64-bit Windows the relevant key
 *     can live under either view.
 */

const { exec } = require("child_process");
const { safeLog } = require("../logger");

/**
 * Inspect Windows Firewall state via `netsh advfirewall`. Returns
 * `{ enabled, status }` where `enabled` is `true|false|null` (null if the
 * probe failed) and `status` is "ON" / "OFF" / "Unknown" for display.
 *
 * @returns {Promise<{ enabled: boolean | null, status: string }>}
 */
async function checkWindowsFirewall() {
  return new Promise((resolve) => {
    exec(
      "netsh advfirewall show allprofiles state",
      { timeout: 5000 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve({ enabled: null, status: "Unknown" });
          return;
        }

        const out = stdout.toLowerCase();
        const firewallOn = out.includes("state") && out.includes("on");
        resolve({ enabled: firewallOn, status: firewallOn ? "ON" : "OFF" });
      }
    );
  });
}

/**
 * Check basic internet reachability by pinging Google DNS once with a 2 s
 * timeout. A failed ping is treated as "Unable to verify" (not "offline")
 * because firewalls / VPNs / ISPs commonly block ICMP even when the
 * connection works fine for HTTP. The diagnostics composer never blocks
 * launch on this signal.
 *
 * @returns {Promise<{ online: boolean, status: string }>}
 */
async function checkNetworkConnectivity() {
  return new Promise((resolve) => {
    // -n 1 -w 2000  ->  one echo request, 2 s timeout (in milliseconds).
    exec("ping -n 1 -w 2000 8.8.8.8", { timeout: 3000 }, (error, stdout) => {
      if (error) {
        safeLog.info(
          "[Network Check] Ping failed - may be offline or blocked by firewall/VPN"
        );
        resolve({
          online: false,
          status: "Unable to verify (may be blocked by firewall/VPN)",
        });
        return;
      }

      const success =
        stdout.toLowerCase().includes("reply from") ||
        stdout.toLowerCase().includes("bytes=");

      if (success) {
        resolve({ online: true, status: "Online" });
      } else {
        resolve({
          online: false,
          status: "Unable to verify (may be blocked by firewall/VPN)",
        });
      }
    });
  });
}

/**
 * Detect .NET Framework 3.5. GFWL is a 32-bit installer, so on 64-bit
 * Windows the Install registry value can show up under either
 * `HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v3.5` (default view) or
 * `HKLM\SOFTWARE\WOW6432Node\Microsoft\NET Framework Setup\NDP\v3.5`
 * (32-bit view). Either path with `Install = 0x1` counts as installed.
 *
 * @returns {Promise<{ installed: boolean, version: string }>}
 */
async function checkDotNetFramework() {
  const checkKey = (key) =>
    new Promise((res) => {
      exec(
        `reg query "${key}" /v Install`,
        { timeout: 3000 },
        (err, stdout) => {
          res(!err && stdout && stdout.includes("0x1"));
        }
      );
    });

  const defaultKey =
    "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v3.5";
  const wowKey =
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\NET Framework Setup\\NDP\\v3.5";

  const [defaultOk, wowOk] = await Promise.all([
    checkKey(defaultKey),
    checkKey(wowKey),
  ]);
  const installed = defaultOk || wowOk;
  return {
    installed,
    version: installed ? "3.5+" : "Not Installed",
  };
}

module.exports = {
  checkWindowsFirewall,
  checkNetworkConnectivity,
  checkDotNetFramework,
};
