// Install-check IPC handlers (Phase 10).
//
// Handlers registered:
//   check-game-installed     - hard probe used by the renderer's "Play"
//                              gating. Walks all three install
//                              dependencies (game files via
//                              findGameInstallation, GFWL, DirectX 9)
//                              and updates the in-memory
//                              GAME_INSTALL_DIR / RESOURCES_DIR if a
//                              new install location was discovered.
//                              Returns the per-dependency breakdown so
//                              the UI can show which piece is missing.
//   check-persistent-issues  - softer probe used by the "issues" panel
//                              in the renderer. Surfaces:
//                                * Windows License Manager not running
//                                  (warning)
//                                * Xbox Live Networking not running
//                                  (warning)
//                                * GFWL / DirectX 9 missing (error -
//                                  only when game files exist, since
//                                  those errors aren't actionable
//                                  before install)
//                              Each probe is wrapped in its own
//                              try/catch so one failure doesn't block
//                              the others.

const { safeLog } = require("../logger");
const path = require("path");

function registerInstallCheckIpc(deps) {
  const {
    ipcMain,
    findGameInstallation,
    isGFWLInstalled,
    isDX9Installed,
    checkWindowsLicenseManagerService,
    checkXboxLiveNetworkingService,
    setGameInstallDir,
    setResourcesDir,
  } = deps;

  // Add IPC handler for manual check
  ipcMain.handle("check-game-installed", async () => {
    try {
      // Check game files first (using findGameInstallation which checks custom path)
      const foundLocation = await findGameInstallation();
      const gameFilesExist = foundLocation !== null;

      // Check other dependencies
      const gfwlInstalled = await isGFWLInstalled();
      const dx9Installed = await isDX9Installed();
      const allDependenciesMet =
        gameFilesExist && gfwlInstalled && dx9Installed;

      // Update GAME_INSTALL_DIR if found
      if (foundLocation) {
        setGameInstallDir(foundLocation);
        setResourcesDir(path.join(foundLocation, "Resources"));
      }

      return {
        installed: allDependenciesMet,
        path: foundLocation,
        dependencies: {
          gameFiles: gameFilesExist,
          gfwl: gfwlInstalled,
          dx9: dx9Installed,
        },
      };
    } catch (error) {
      safeLog.error("Error checking game installation:", error);
      return {
        installed: false,
        path: null,
        dependencies: {
          gameFiles: false,
          gfwl: false,
          dx9: false,
        },
      };
    }
  });

  // Check for persistent issues (services and dependencies)
  ipcMain.handle("check-persistent-issues", async () => {
    try {
      const issues = [];

      // Check Windows License Manager Service
      try {
        const licenseManagerStatus = await checkWindowsLicenseManagerService();
        if (licenseManagerStatus.exists && !licenseManagerStatus.running) {
          issues.push({
            type: "license_manager",
            message: "Windows License Manager Service is not running",
            severity: "warning",
          });
        }
      } catch (error) {
        safeLog.error(
          "[Persistent Issues] Error checking License Manager:",
          error
        );
      }

      // Check Xbox Live Networking Service
      try {
        const xboxServiceStatus = await checkXboxLiveNetworkingService();
        if (xboxServiceStatus.exists && !xboxServiceStatus.running) {
          issues.push({
            type: "xbox_networking",
            message: "Xbox Live Networking Service is not running",
            severity: "warning",
          });
        }
      } catch (error) {
        safeLog.error(
          "[Persistent Issues] Error checking Xbox Networking:",
          error
        );
      }

      // Check dependencies (only if game files exist - don't show if game isn't installed)
      try {
        const foundLocation = await findGameInstallation();
        if (foundLocation) {
          const gfwlInstalled = await isGFWLInstalled();
          const dx9Installed = await isDX9Installed();

          if (!gfwlInstalled) {
            issues.push({
              type: "gfwl",
              message: "Games for Windows Live is not installed",
              severity: "error",
            });
          }

          if (!dx9Installed) {
            issues.push({
              type: "directx",
              message: "DirectX 9 is not installed",
              severity: "error",
            });
          }
        }
      } catch (error) {
        safeLog.error(
          "[Persistent Issues] Error checking dependencies:",
          error
        );
      }

      return {
        hasIssues: issues.length > 0,
        issues: issues,
      };
    } catch (error) {
      safeLog.error("Error checking persistent issues:", error);
      return {
        hasIssues: false,
        issues: [],
      };
    }
  });
}

module.exports = { registerInstallCheckIpc };
