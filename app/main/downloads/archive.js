// Zip archive extraction helpers used by the download / install pipeline.
//
// extract-zip (already a project dependency) is used as the primary extractor.
// It is stream-based and handles large archives (e.g. the 1.66 GB build.zip)
// without loading the entire file into memory, so it won't time out on slow VMs.
//
// PowerShell's Expand-Archive is kept as a fallback — it shares the same
// interface but has a generous 30-minute timeout to accommodate low-performance
// machines. The old 5-minute cap was the root cause of extraction failures on
// those machines.

const { safeLog } = require("../logger");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// extract-zip is a streaming Node.js extractor — no exec timeout risk.
let extractZipLib;
try {
  extractZipLib = require("extract-zip");
} catch (_) {
  // Graceful degradation: fall through to the PowerShell path below.
  safeLog.warn("[Extract] extract-zip not available, will use PowerShell");
}

// ─── Primary extractor (extract-zip) ─────────────────────────────────────────

/**
 * Extract a zip archive to a destination directory.
 *
 * Uses extract-zip when available (preferred: stream-based, no timeout).
 * Falls back to PowerShell Expand-Archive when extract-zip is unavailable.
 *
 * @param {string} zipPath  Absolute path to the source .zip file.
 * @param {string} destPath Absolute path to the destination directory.
 * @returns {Promise<true>}
 */
function extractZip(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    safeLog.info(`[Extract] Starting extraction: ${zipPath} -> ${destPath}`);

    // Ensure destination directory exists
    if (!fs.existsSync(destPath)) {
      try {
        fs.mkdirSync(destPath, { recursive: true });
        safeLog.info(`[Extract] Created destination directory: ${destPath}`);
      } catch (mkdirError) {
        safeLog.error(`[Extract] Failed to create destination directory:`, mkdirError);
        reject(mkdirError);
        return;
      }
    }

    safeLog.info(`[Extract] Running extraction command...`);

    if (extractZipLib) {
      // extract-zip: stream-based, works well for large archives on slow hardware.
      extractZipLib(zipPath, { dir: path.resolve(destPath) })
        .then(() => {
          safeLog.info(`[Extract] Extraction completed successfully`);
          resolve(true);
        })
        .catch((err) => {
          safeLog.warn(`[Extract] extract-zip failed, trying PowerShell fallback:`, err);
          _extractZipPowerShell(zipPath, destPath).then(resolve).catch(reject);
        });
    } else {
      // extract-zip unavailable — go straight to PowerShell.
      _extractZipPowerShell(zipPath, destPath).then(resolve).catch(reject);
    }
  });
}

// ─── PowerShell fallback ──────────────────────────────────────────────────────

/**
 * Shell out to PowerShell's Expand-Archive with a 30-minute timeout.
 * The previous 5-minute limit was enough to kill extraction of the 1.66 GB
 * game archive on low-performance VMs before it could finish.
 *
 * @param {string} zipPath
 * @param {string} destPath
 * @returns {Promise<true>}
 */
function _extractZipPowerShell(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      const cmd = `unzip -o '${zipPath}' -d '${destPath}'`;
      exec(cmd, { timeout: 1800000 }, (error, _stdout, stderr) => {
        if (error) {
          safeLog.error(`[Extract] Extraction failed:`, error);
          if (stderr) safeLog.error(`[Extract] stderr:`, stderr);
          reject(error);
        } else {
          safeLog.info(`[Extract] Extraction completed successfully (unzip)`);
          resolve(true);
        }
      });
      return;
    }

    const safeZip = zipPath.replace(/'/g, "''");
    const safeDest = destPath.replace(/'/g, "''");
    const command = `powershell -command "Expand-Archive -Path '${safeZip}' -DestinationPath '${safeDest}' -Force"`;

    // 30 minutes — enough headroom for a ~1.66 GB archive on a slow/VM disk.
    exec(command, { timeout: 1800000 }, (error, _stdout, stderr) => {
      if (error) {
        safeLog.error(`[Extract] Extraction failed:`, error);
        if (stderr) safeLog.error(`[Extract] stderr:`, stderr);
        reject(error);
      } else {
        safeLog.info(`[Extract] Extraction completed successfully (PowerShell)`);
        resolve(true);
      }
    });
  });
}

// ─── Legacy fallback (kept for callers that import it directly) ───────────────

async function extractZipFallback(zipPath, destPath) {
  safeLog.info("[Extract] Using fallback extraction method");
  return _extractZipPowerShell(zipPath, destPath);
}

module.exports = { extractZip, extractZipFallback };
