// Game installation discovery.
//
// findGameInstallation() is the canonical "where is Shadowrun.exe on this
// machine?" probe. It's called by:
//   - The Play button (launchGameLogic in app/main/game/launch.js).
//   - The Download flow (registerDownloadsIpc in app/main/downloads).
//   - The persistent-issues panel + change-game-location UI in main.js.
// Sharing one implementation keeps those flows consistent.
//
// Resolution order (preserved verbatim from app/main.js Phase 7a extraction):
//   1. settings.customGamePath - highest priority. The user explicitly chose
//      this folder via "Change game location", so respect it even if a
//      prettier auto-found path exists. Side effect: also syncs
//      GAME_INSTALL_DIR / RESOURCES_DIR to the saved path.
//   2. The currently-set GAME_INSTALL_DIR if it points at a real Shadowrun.exe
//      (covers the case where the launcher just installed the game and we
//      don't want to re-scan the file system).
//   3. settings.autoScanEnabled gates the file-system scan. We default this
//      to OFF for privacy; the installer asks the user to opt in. With it
//      off we return null and let the caller prompt for a path.
//   4. A fixed list of common install locations on every drive letter
//      (C:..Z:), Program Files variants, the Steam default path, and the
//      user's Desktop / Documents / AppData / Home/Games folders.

const { safeLog } = require("../logger");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function makeFindGameInstallation(deps) {
  const {
    getSettings,
    getGameInstallDir,
    setGameInstallDir,
    setResourcesDir,
  } = deps;

  // Add this function to find the game in multiple locations
  return async function findGameInstallation() {
    const settings = getSettings();

    // FIRST: Check saved custom game path from settings (highest priority - user explicitly selected this)
    if (
      settings.customGamePath &&
      fs.existsSync(path.join(settings.customGamePath, "Shadowrun.exe"))
    ) {
      safeLog.debug(
        `[Find Game] Using saved custom game path: ${settings.customGamePath}`
      );
      // Update GAME_INSTALL_DIR to match saved path
      setGameInstallDir(settings.customGamePath);
      setResourcesDir(path.join(settings.customGamePath, "Resources"));
      return settings.customGamePath;
    }

    const currentInstallDir = getGameInstallDir();

    // SECOND: Check if GAME_INSTALL_DIR is already set and valid (e.g., from user selection or settings)
    if (
      currentInstallDir &&
      fs.existsSync(path.join(currentInstallDir, "Shadowrun.exe"))
    ) {
      safeLog.debug(
        `[Find Game] Using existing GAME_INSTALL_DIR: ${currentInstallDir}`
      );
      return currentInstallDir;
    }

    // THIRD: Only scan for existing installations if user opted-in during installation
    if (!settings.autoScanEnabled) {
      safeLog.debug(
        `[Find Game] Auto-scan disabled (privacy setting). Skipping file system scan.`
      );
      return null;
    }

    safeLog.debug(`[Find Game] Auto-scan enabled. Searching common locations...`);

    // Potential locations to check (in order of priority)
    const possibleLocations = [
      // Default location
      path.join(
        "C:\\Program Files (x86)\\Microsoft Games for Windows - LIVE\\Shadowrun"
      ),

      // Other common locations
      path.join(
        "C:\\Program Files\\Microsoft Games for Windows - LIVE\\Shadowrun"
      ),
      path.join("C:\\Program Files (x86)\\Shadowrun"),
      path.join("C:\\Program Files\\Shadowrun"),

      // Desktop
      path.join(app.getPath("desktop"), "Shadowrun"),

      // Documents
      path.join(app.getPath("documents"), "Shadowrun"),

      // Check for other drive letters
      ...[
        "D:",
        "E:",
        "F:",
        "G:",
        "H:",
        "I:",
        "J:",
        "K:",
        "L:",
        "M:",
        "N:",
        "O:",
        "P:",
        "Q:",
        "R:",
        "S:",
        "T:",
        "U:",
        "V:",
        "W:",
        "X:",
        "Y:",
        "Z:",
      ].map((drive) => path.join(drive, "\\Shadowrun")),

      // Program Files on other drives
      ...["D:", "E:", "F:", "G:"].map((drive) =>
        path.join(
          drive,
          "\\Program Files (x86)\\Microsoft Games for Windows - LIVE\\Shadowrun"
        )
      ),

      // User's game-specific folders
      path.join(app.getPath("home"), "Games", "Shadowrun"),

      // Steam default location
      path.join("C:\\Program Files (x86)\\Steam\\steamapps\\common\\Shadowrun"),

      // User's AppData location
      path.join(app.getPath("appData"), "Shadowrun"),
    ];

    // Check each location
    for (const location of possibleLocations) {
      if (fs.existsSync(path.join(location, "Shadowrun.exe"))) {
        return location;
      }
    }

    return null;
  };
}

module.exports = { makeFindGameInstallation };
