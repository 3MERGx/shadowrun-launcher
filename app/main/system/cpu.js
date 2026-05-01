/**
 * CPU detection for the Shadowrun FPS Launcher.
 *
 * Verbatim port of detectCPU() from app/main.js. WMIC is tried first
 * (`wmic cpu get name`) for backwards compatibility, with a PowerShell
 * fallback (`Get-CimInstance Win32_Processor` / `Get-WmiObject
 * Win32_Processor`) for Windows 11 24H2+ where WMIC has been removed.
 *
 * Both branches normalize the raw vendor string into a clean display name:
 *   - Strips "X-Core Processor" / "CPU @ X.XXGHz" / "Processor" suffixes
 *   - Strips (R) / (TM) / trademark glyphs
 *   - Collapses runs of whitespace
 *
 * Examples after normalization:
 *   "Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz" -> "Intel Core i7-8700K"
 *   "AMD Ryzen 7 7800X3D 8-Core Processor"     -> "AMD Ryzen 7 7800X3D"
 *
 * Returns `{ name: "Unknown CPU" }` on total failure.
 */

const { exec } = require("child_process");
const { safeLog } = require("../logger");

/**
 * Apply the CPU-name normalization regexes used by both the WMIC and
 * PowerShell branches. ARM / Snapdragon CPUs only get the trailing
 * "Processor" suffix stripped to preserve their original product name.
 *
 * @param {string} raw
 * @returns {string}
 */
function cleanCpuName(raw) {
  let name = raw
    .replace(/\s+\d+-Core\s+Processor$/i, "")
    .replace(/\s+CPU\s+@\s+[\d.]+GHz$/i, "")
    .replace(/\s+Processor$/i, "")
    .replace(/\s*\([RT]\)/gi, "")
    .replace(/\s*™/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    name.toLowerCase().includes("arm") ||
    name.toLowerCase().includes("snapdragon")
  ) {
    name = name.replace(/\s+Processor$/i, "").trim();
  }

  return name;
}

/**
 * Detect the primary CPU. Always resolves; on total failure returns
 * `{ name: "Unknown CPU" }`.
 *
 * @returns {Promise<{ name: string }>}
 */
async function detectCPU() {
  return new Promise((resolve) => {
    safeLog.info("[CPU Detection] Detecting CPU...");

    const command = "wmic cpu get name";
    const execOpts = { timeout: 5000 };

    exec(command, execOpts, (error, stdout) => {
      if (error) {
        safeLog.error("[CPU Detection] WMIC error:", error.message);
        // PowerShell fallback for Win 11 24H2+ where WMIC is removed.
        safeLog.info("[CPU Detection] Trying PowerShell fallback...");
        const psCommand = `
          $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1;
          if (-not $cpu) { $cpu = Get-WmiObject Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1; }
          if ($cpu) { $cpu.Name }
        `;
        exec(
          `powershell -Command "${psCommand
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")}"`,
          { timeout: 5000 },
          (psError, psStdout) => {
            if (psError || !psStdout || !psStdout.trim()) {
              safeLog.error("[CPU Detection] PowerShell fallback also failed");
              resolve({ name: "Unknown CPU" });
              return;
            }
            const cpuName = cleanCpuName(psStdout.trim());
            safeLog.info(`[CPU Detection] ✅ PowerShell detected: ${cpuName}`);
            resolve({ name: cpuName });
          }
        );
        return;
      }

      safeLog.info("[CPU Detection] CPU Output:", stdout);

      const lines = stdout
        .split("\n")
        .filter((line) => line.trim() && !line.includes("Name"));
      let cpuName = "Unknown CPU";

      if (lines.length > 0) {
        cpuName = cleanCpuName(lines[0].trim());
      }

      safeLog.info(`[CPU Detection] ✅ Detected: ${cpuName}`);
      resolve({ name: cpuName });
    });
  });
}

module.exports = {
  detectCPU,
};
