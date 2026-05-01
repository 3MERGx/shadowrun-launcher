/**
 * Immutable configuration constants for the Shadowrun FPS Launcher main
 * process. Anything that's tied to a release-time decision (download URLs,
 * Discord client ID, fixed timing values) lives here.
 *
 * Mutable runtime state (the user's settings object, the resolved game
 * install directory, runtime flags) does NOT belong in this file - that
 * lives in app/main.js for now and will migrate to app/main/config/state.js
 * during the downloads / game-launch phases of the refactor.
 */

const path = require("path");
const os = require("os");

// ============================================================================
// Download URLs
// ============================================================================

const GAME_FILES_URL = "https://downloads.shadowrunfps.com/releases/build.zip";
const GFWL_URL = "https://downloads.shadowrunfps.com/releases/gfwlivesetup.zip";
// DirectX 9 Web Installer - direct download from Microsoft.
const DX9_URL =
  "https://download.microsoft.com/download/1/7/1/1718ccc4-6315-4d8e-9543-8e28a4e18c4c/dxwebsetup.exe";
const NO_INTRO_FIX_URL = "https://downloads.shadowrunfps.com/releases/NoIntroFix.zip";
// const NO_INTRO_FIX_URL = "http://157.245.214.234/releases/NoIntroFix.zip";
// DXVK d3d9 wrapper archive used by the "Enable DXVK" toggle.
const DXVK_ZIP_URL = "https://downloads.shadowrunfps.com/releases/d3d9.zip";
// const DXVK_ZIP_URL = "http://157.245.214.234/releases/d3d9.zip";
// Bundle containing both srs_shadowrun.dll variants (newer + older) used
// by the SRS DLL version switcher.
const SRS_DLL_ZIP_URL = "https://downloads.shadowrunfps.com/releases/srs_shadowrun.zip";
// const SRS_DLL_ZIP_URL = "http://157.245.214.234/releases/srs_shadowrun.zip";
// AHL patcher bundle: 6 files required for AntHill LIVE private server
// (dinput8.dll, GFWLProtectionDisabler2019.asi, GFWLmsidcrl40Redirector.asi,
//  msidcrl40.dll, msidcrl67.dll, patcher_conf.ini).
const AHL_ZIP_URL = "https://downloads.shadowrunfps.com/releases/AHLfiles.zip";

// ============================================================================
// Auto-updater
// ============================================================================

// Update feed URL. Change this when migrating between hosting providers.
const UPDATE_SERVER_URL = "https://downloads.shadowrunfps.com/launcher";

// Maximum time without progress before we consider an update download stalled
// and offer the user a manual download fallback.
const UPDATE_TIMEOUT_MS = 180_000; // 3 minutes

// ============================================================================
// Static filesystem paths
// ============================================================================

// Scratch directory for game-asset downloads. Cleared between sessions.
const GAME_FILES_TEMP = path.join(os.tmpdir(), "Shadowrun_Downloads");

// Scratch path for the NoIntroFix archive while we extract it.
const NOINTRO_TEMP_PATH = path.join(os.tmpdir(), "NoIntroFix.zip");

// ============================================================================
// Feature flags
// ============================================================================

// When true, the game launches immediately after a successful download.
// Kept as a build-time toggle - flipping it requires a release.
const AUTO_LAUNCH_AFTER_DOWNLOAD = false;

// ============================================================================
// Discord Rich Presence
// ============================================================================

// Discord application Client ID. Public - safe to ship; only the Client
// SECRET would need to be private (and we don't use one).
const CLIENT_ID = "1352066395487076406";

// Discord rate-limits Rich Presence updates to 1 per 15 seconds. We use
// this to throttle our update queue.
const DISCORD_UPDATE_INTERVAL = 15_000;

module.exports = {
  GAME_FILES_URL,
  GFWL_URL,
  DX9_URL,
  NO_INTRO_FIX_URL,
  DXVK_ZIP_URL,
  SRS_DLL_ZIP_URL,
  AHL_ZIP_URL,
  UPDATE_SERVER_URL,
  UPDATE_TIMEOUT_MS,
  GAME_FILES_TEMP,
  /** Resolved at access time so `app.getPath` runs after Electron is ready (avoids load-order crashes). */
  get BACKUP_DIR() {
    const { app } = require("electron");
    return path.join(app.getPath("userData"), "BackupFiles");
  },
  NOINTRO_TEMP_PATH,
  /** Resolved at access time (same as BACKUP_DIR). */
  get BUNDLED_NO_INTRO_FIX() {
    const { app } = require("electron");
    return path.join(app.getAppPath(), "resources", "NoIntroFix.zip");
  },
  AUTO_LAUNCH_AFTER_DOWNLOAD,
  CLIENT_ID,
  DISCORD_UPDATE_INTERVAL,
};
