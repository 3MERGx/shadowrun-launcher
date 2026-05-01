// AntHill LIVE (AHL) server toggle — patcher_conf.ini management.
//
// AHL replaces the GFWL matchmaking servers with a private community
// infrastructure. It requires 6 files to be present in the game directory:
//
//   dinput8.dll                   - ASI loader (injects the patcher)
//   GFWLProtectionDisabler2019.asi - disables GFWL DRM checks
//   GFWLmsidcrl40Redirector.asi   - msidcrl40 server redirect shim
//   msidcrl40.dll                 - replaced Microsoft credential DLL
//   msidcrl67.dll                 - replaced Microsoft credential DLL
//   patcher_conf.ini              - server endpoint config (this module owns it)
//
// The other 5 files are static and downloaded as a zip bundle from AHL_ZIP_URL
// if any are missing. The .ini is always written fresh from the known constant
// for the requested mode — no file swapping, no .old files.
//
// Exports:
//   makeCheckGfwlServerStatus({ getGameInstallDir })
//     → async checkGfwlServerStatus()
//       → { mode: 'ahl'|'gfwl'|'none', allFilesPresent: boolean, missingFiles: string[] }
//
//   registerGfwlServerIpc({ ipcMain, getMainWindow, getGameInstallDir,
//                           checkGfwlServerStatus, downloadFile, extractZip })
//     Registers IPC channels:
//       check-gfwl-server   → checkGfwlServerStatus()
//       toggle-gfwl-server  → write config, download if AHL files missing
//
//   Push channel: "ahl-progress" { step, status, progress? }
//     step values: 'download' | 'extract' | 'complete' | 'error'

const fs = require("fs");
const path = require("path");
const os = require("os");

const { safeLog } = require("../logger");
const { AHL_ZIP_URL } = require("../config/constants");

// ============================================================================
// Known server config content
// ============================================================================

const AHL_CONFIG = `[server]
login = "login.shadowrunfps.com"
as = "kdc.shadowrunfps.com"
macs = "kdc.shadowrunfps.com"
tgs = "kdc.shadowrunfps.com"
`;

const GFWL_CONFIG = `[server]
login = "login.live.com"
as = "xeas.xboxlive.com"
macs = "xemacs.xboxlive.com"
tgs = "xetgs.xboxlive.com"
`;

// The full set of files AHL requires in the game directory.
const AHL_FILES = [
  "dinput8.dll",
  "GFWLProtectionDisabler2019.asi",
  "GFWLmsidcrl40Redirector.asi",
  "msidcrl40.dll",
  "msidcrl67.dll",
  "patcher_conf.ini",
];

const AHL_ZIP_TEMP = path.join(os.tmpdir(), "AHL_Files.zip");

// ============================================================================
// Status probe (read-only)
// ============================================================================

/**
 * Factory that returns an async function which reads patcher_conf.ini and
 * checks file presence to determine the current server configuration.
 *
 * @param {{ getGameInstallDir: () => string }} deps
 * @returns {() => Promise<{ mode: 'ahl'|'gfwl'|'none', allFilesPresent: boolean, missingFiles: string[] }>}
 */
function makeCheckGfwlServerStatus({ getGameInstallDir }) {
  return async function checkGfwlServerStatus() {
    try {
      const gameDir = getGameInstallDir();
      if (!gameDir || !fs.existsSync(gameDir)) {
        return { mode: "none", allFilesPresent: false, missingFiles: AHL_FILES.slice() };
      }

      const missingFiles = AHL_FILES.filter(
        (f) => !fs.existsSync(path.join(gameDir, f))
      );
      const allFilesPresent = missingFiles.length === 0;

      const iniPath = path.join(gameDir, "patcher_conf.ini");
      if (!fs.existsSync(iniPath)) {
        return { mode: "none", allFilesPresent, missingFiles };
      }

      const content = fs.readFileSync(iniPath, "utf8");
      let mode = "none";
      if (content.includes("shadowrunfps.com")) {
        mode = "ahl";
      } else if (content.includes("login.live.com")) {
        mode = "gfwl";
      }

      return { mode, allFilesPresent, missingFiles };
    } catch (error) {
      safeLog.error("[AHL] Error checking server status:", error);
      return { mode: "none", allFilesPresent: false, missingFiles: AHL_FILES.slice() };
    }
  };
}

// ============================================================================
// IPC registrar
// ============================================================================

/**
 * Register the AHL server toggle IPC handlers.
 *
 * @param {{
 *   ipcMain: import("electron").IpcMain,
 *   getMainWindow: () => import("electron").BrowserWindow | null,
 *   getGameInstallDir: () => string,
 *   checkGfwlServerStatus: () => Promise<object>,
 *   downloadFile: (url: string, dest: string, onProgress: Function) => Promise<void>,
 *   extractZip: (zipPath: string, destDir: string) => Promise<void>,
 * }} deps
 */
function registerGfwlServerIpc({
  ipcMain,
  getMainWindow,
  getGameInstallDir,
  checkGfwlServerStatus,
  downloadFile,
  extractZip,
}) {
  const sendProgress = (step, status, progress = null) => {
    try {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("ahl-progress", { step, status, progress });
      }
    } catch (_) {}
  };

  // ── check-gfwl-server ───────────────────────────────────────────────────
  ipcMain.handle("check-gfwl-server", async () => {
    try {
      return await checkGfwlServerStatus();
    } catch (error) {
      safeLog.error("[AHL] check-gfwl-server error:", error);
      return { mode: "none", allFilesPresent: false, missingFiles: AHL_FILES.slice() };
    }
  });

  // ── toggle-gfwl-server ──────────────────────────────────────────────────
  ipcMain.handle("toggle-gfwl-server", async (_, mode) => {
    const gameDir = getGameInstallDir();

    if (!gameDir || !fs.existsSync(gameDir)) {
      return {
        success: false,
        message: "Game directory not found. Please locate the game first.",
      };
    }

    try {
      // ── Enable AHL ────────────────────────────────────────────────────
      if (mode === "ahl") {
        const missingFiles = AHL_FILES.filter(
          (f) => !fs.existsSync(path.join(gameDir, f))
        );

        if (missingFiles.length > 0) {
          safeLog.info(
            `[AHL] Missing ${missingFiles.length} file(s): ${missingFiles.join(", ")}`
          );
          safeLog.info("[AHL] Downloading AHL patcher bundle...");

          sendProgress("download", "Downloading AHL patcher files...");

          try {
            await downloadFile(AHL_ZIP_URL, AHL_ZIP_TEMP, (progress) => {
              sendProgress(
                "download",
                `Downloading AHL files… ${progress}%`,
                progress
              );
            });
          } catch (downloadError) {
            safeLog.error("[AHL] Download failed:", downloadError);
            sendProgress("error", "Download failed");
            return {
              success: false,
              message: `Failed to download AHL files: ${downloadError.message}`,
            };
          }

          safeLog.info("[AHL] Extracting AHL patcher bundle to game directory...");
          sendProgress("extract", "Extracting AHL files...");

          try {
            await extractZip(AHL_ZIP_TEMP, gameDir);
          } catch (extractError) {
            safeLog.error("[AHL] Extraction failed:", extractError);
            sendProgress("error", "Extraction failed");
            // Clean up temp file
            try { fs.unlinkSync(AHL_ZIP_TEMP); } catch (_) {}
            return {
              success: false,
              message: `Failed to extract AHL files: ${extractError.message}`,
            };
          }

          // Clean up temp zip
          try { fs.unlinkSync(AHL_ZIP_TEMP); } catch (_) {}

          // Verify all files are now present
          const stillMissing = AHL_FILES.filter(
            (f) => !fs.existsSync(path.join(gameDir, f))
          );
          if (stillMissing.length > 0) {
            safeLog.warn(
              `[AHL] Still missing after extract: ${stillMissing.join(", ")}`
            );
            sendProgress("error", "Some files still missing after extract");
            return {
              success: false,
              message: `AHL install incomplete. Still missing: ${stillMissing.join(", ")}`,
            };
          }

          safeLog.info("[AHL] AHL files installed successfully.");
        }

        // Write AHL config
        const iniPath = path.join(gameDir, "patcher_conf.ini");
        fs.writeFileSync(iniPath, AHL_CONFIG, "utf8");
        safeLog.info("[AHL] patcher_conf.ini written with AHL server endpoints.");

        sendProgress("complete", "AHL enabled");
        return {
          success: true,
          message: "AntHill LIVE (AHL) is now active. Restart the game to apply.",
        };
      }

      // ── Enable real GFWL ──────────────────────────────────────────────
      if (mode === "gfwl") {
        const iniPath = path.join(gameDir, "patcher_conf.ini");
        fs.writeFileSync(iniPath, GFWL_CONFIG, "utf8");
        safeLog.info("[AHL] patcher_conf.ini written with real GFWL server endpoints.");

        sendProgress("complete", "Real GFWL enabled");
        return {
          success: true,
          message: "Real GFWL servers are now active. Restart the game to apply.",
        };
      }

      return { success: false, message: `Unknown mode: ${mode}` };
    } catch (error) {
      safeLog.error("[AHL] toggle-gfwl-server error:", error);
      sendProgress("error", error.message);
      return {
        success: false,
        message: error.message || "Unknown error during server toggle.",
      };
    }
  });
}

module.exports = {
  makeCheckGfwlServerStatus,
  registerGfwlServerIpc,
};
