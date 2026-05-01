/**
 * NAT type detection for the Shadowrun FPS Launcher.
 *
 * Verbatim port of detectNATType() from app/main.js. There's no real
 * STUN-style NAT probe here; this is a "best-effort signal" inferred from
 * the local Windows firewall state:
 *   - Firewall fully off  -> "Open (Likely)"
 *   - Firewall on at all  -> "Moderate/Strict"
 *   - Anything else       -> "Unknown"
 *
 * It is good enough for the Diagnostics panel as a quick gut-check; users
 * who need a real NAT-type test should use Xbox / their router. Keep this
 * light - the heavier P2P troubleshooting lives in
 * app/main/diagnostics/* (Phase 5).
 */

const { exec } = require("child_process");

/**
 * Always resolves. Falls back to `{ type: "Unknown", status: "Unable to
 * detect" }` if the netsh probe fails outright.
 *
 * @returns {Promise<{ type: string, status: string }>}
 */
async function detectNATType() {
  const opts = { timeout: 5000 };
  return new Promise((resolve) => {
    const command = "netsh interface ipv4 show interfaces";
    exec(command, opts, (error) => {
      if (error) {
        resolve({ type: "Unknown", status: "Unable to detect" });
        return;
      }

      const upnpCommand = "netsh advfirewall show allprofiles state";
      exec(upnpCommand, opts, (upnpError, upnpStdout) => {
        let natType = "Unknown";

        if (!upnpError && upnpStdout) {
          const out = upnpStdout.toLowerCase();
          const firewallOff = out.includes("state") && out.includes("off");
          if (firewallOff) {
            natType = "Open (Likely)";
          } else {
            natType = "Moderate/Strict";
          }
        }

        resolve({
          type: natType,
          status: "Detected via firewall analysis",
        });
      });
    });
  });
}

module.exports = {
  detectNATType,
};
