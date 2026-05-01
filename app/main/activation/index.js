/**
 * Game activation pipeline + PCID backup/restore.
 *
 * VERBATIM extraction of the activation logic that previously lived inline in
 * `app/main.js` lines 696-1848 (activate-game handler), plus the helpers it
 * shares with the launch flow:
 *   - isRunningAsAdmin (probe)
 *   - isDirectoryWritable (probe)
 *   - createDirectoryWithPermissions (mutates GAME_INSTALL_DIR / RESOURCES_DIR
 *     on fallback)
 *   - checkActivationStatus (notifies the renderer of token presence)
 *   - restoreOriginalPcid (called pre-launch by app/main/game/launch.js)
 *   - the 3 IPC handlers: activate-game, get-current-pcid, backup-pcid
 *
 * No logic was changed — every safeLog message, every dialog body, every
 * registry call, every error code branch, the random key/PCID selection, and
 * the .NET 6.0 install-then-recheck loop are preserved bit-for-bit. The only
 * mechanical changes are:
 *   - Module-scope dependencies (`mainWindow`, `GAME_INSTALL_DIR`, etc.) are
 *     received via the DI bag passed to `registerActivationIpc(deps)` /
 *     factory makers.
 *   - The `__dirname` reference inside the XLiveActivateHelper.exe path search
 *     is replaced with the injected `appDir` so the same `path.join(appDir,
 *     "..", "XLiveActivateHelper.exe")` resolution is preserved.
 *
 * The module is intentionally large and non-decomposed: this is the most
 * fragile path in the launcher and we ship it the way it shipped working.
 */

const path = require("path");
const fs = require("fs");
const { app, dialog, clipboard } = require("electron");
const { spawn, exec } = require("child_process");

const { safeLog } = require("../logger");
const registryUtils = require("../../utils/registry");
const tokenUtils = require("../../utils/token");
const { validateActivationKey } = require("./validation");
const {
  checkDotNet6x86Runtime,
  downloadAndInstallDotNet6,
} = require("./dotnet6");
const {
  showActivationSuccessDialog,
} = require("../dialogs/activationSuccessDialog");

/**
 * Returns true when the launcher process is elevated (Windows only). Probes
 * `net session`, which only succeeds for admins. Resolves false on non-win32.
 *
 * @returns {Promise<boolean>}
 */
async function isRunningAsAdmin() {
  if (process.platform !== "win32") return false;

  return new Promise((resolve) => {
    exec("net session", (error) => {
      resolve(!error);
    });
  });
}

/**
 * Synchronously verify that `dirPath` is creatable + writable by the current
 * process. Creates the directory if it doesn't exist, writes a .write-test
 * tmp file, then deletes it. Errors are logged and turned into `false`.
 *
 * @param {string} dirPath Absolute path to test.
 * @returns {boolean}
 */
function isDirectoryWritable(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const testFile = path.join(dirPath, `.write-test-${Date.now()}.tmp`);
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return true;
  } catch (error) {
    safeLog.error(`Directory not writable: ${dirPath}`, error.message);
    return false;
  }
}

/**
 * Build `createDirectoryWithPermissions(dirPath)` bound to the launcher's
 * mutable install-dir state.
 *
 * On the happy path this is just `mkdir -p`. On failure it walks a fallback
 * chain (`~/Games/Shadowrun` -> `~/Documents/Shadowrun` -> `~/Shadowrun`) and
 * the first writable location wins; the install dir + resources dir are
 * updated via the injected setters so the rest of the launcher picks up the
 * new location automatically.
 *
 * @param {object} deps
 * @param {(dir: string) => void} deps.setGameInstallDir Writes the new
 *   GAME_INSTALL_DIR back to main.js's runtime state.
 * @param {(dir: string) => void} deps.setResourcesDir Writes the new
 *   RESOURCES_DIR back to main.js's runtime state.
 * @returns {(dirPath: string) => Promise<boolean>}
 */
function makeCreateDirectoryWithPermissions({ setGameInstallDir, setResourcesDir }) {
  return async function createDirectoryWithPermissions(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return true;
    } catch (error) {
      safeLog.error(`Failed to create directory: ${dirPath}`, error.message);

      const fallbackLocations = [
        path.join(app.getPath("home"), "Games", "Shadowrun"),
        path.join(app.getPath("documents"), "Shadowrun"),
        path.join(app.getPath("home"), "Shadowrun"),
      ];

      for (const fallbackDir of fallbackLocations) {
        try {
          if (!fs.existsSync(fallbackDir)) {
            fs.mkdirSync(fallbackDir, { recursive: true });
          }
          const testFile = path.join(
            fallbackDir,
            `.write-test-${Date.now()}.tmp`
          );
          fs.writeFileSync(testFile, "test");
          fs.unlinkSync(testFile);

          setGameInstallDir(fallbackDir);
          setResourcesDir(path.join(fallbackDir, "Resources"));
          safeLog.info(
            `Using fallback installation directory: ${fallbackDir}`
          );
          return true;
        } catch (fallbackError) {
          safeLog.warn(
            `Fallback location failed: ${fallbackDir}`,
            fallbackError.message
          );
          continue;
        }
      }

      safeLog.error(`All fallback locations failed`);
      return false;
    }
  };
}

/**
 * Build `checkActivationStatus()` bound to the main window. Sends the
 * "activation-status" event to the renderer and returns the boolean (so
 * the boot-time caller can also branch on it if it wants).
 *
 * @param {object} deps
 * @param {() => import("electron").BrowserWindow | null} deps.getMainWindow
 * @returns {() => boolean}
 */
function makeCheckActivationStatus({ getMainWindow }) {
  return function checkActivationStatus() {
    const isActivated = tokenUtils.checkTokenExists();

    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("activation-status", {
        activated: isActivated,
      });
    }

    return isActivated;
  };
}

/**
 * Restore the original PCID from the SRPCIDBACKUP backup we wrote during
 * activation. Called pre-launch by `app/main/game/launch.js` so the game
 * boots with the user's real PCID, not the activation PCID.
 *
 * Pure: only uses registryUtils + safeLog. Returns true on a successful
 * restore, false if there was no backup, the backup was empty, or the
 * .reg import failed.
 *
 * @returns {Promise<boolean>}
 */
async function restoreOriginalPcid() {
  try {
    const backupExists = await registryUtils.checkSrPcidBackupExists();

    if (backupExists) {
      const backupPcid = await registryUtils.getSrPcidBackupFromRegistry();

      if (backupPcid) {
        safeLog.info(
          `[PCID Restore] Restoring original PCID from SRPCIDBACKUP: ${backupPcid}`
        );

        // Format the PCID as QWORD with reversed bytes and commas (little-endian)
        // e.g., "4550B3E602EFBBF6" -> "f6,bb,ef,02,e6,b3,50,45"
        const formattedPcid = registryUtils.formatQwordRegValue(backupPcid);

        if (!formattedPcid) {
          safeLog.error("[PCID Restore] Failed to format backup PCID");
          return false;
        }

        safeLog.info(
          `[PCID Restore] Formatted PCID for registry: ${formattedPcid}`
        );

        const BOM = "\uFEFF";
        const regContent =
          BOM +
          `Windows Registry Editor Version 5.00\r\n` +
          `\r\n` +
          `[HKEY_CURRENT_USER\\Software\\Classes\\SOFTWARE\\Microsoft\\XLive]\r\n` +
          `"PCID"=hex(b):${formattedPcid}\r\n`;

        await registryUtils.importRegFile(regContent);

        safeLog.info("[PCID Restore] ✅ Original PCID restored successfully");
        return true;
      } else {
        safeLog.warn("[PCID Restore] ⚠️  Backup PCID value is empty/null");
      }
    } else {
      safeLog.warn("[PCID Restore] ⚠️  No SRPCIDBACKUP exists in registry");
    }
    return false;
  } catch (error) {
    safeLog.error("[PCID Restore] ❌ Error restoring original PCID:", error);
    return false;
  }
}

/**
 * Wire the activation IPC contract: `activate-game`, `get-current-pcid`,
 * `backup-pcid`. All three handlers are registered against the injected
 * `ipcMain` so this module never reaches into Electron's globals.
 *
 * @param {object} deps
 * @param {import("electron").IpcMain} deps.ipcMain
 * @param {() => import("electron").BrowserWindow | null} deps.getMainWindow
 *   Returns the main window for dialog parenting + show-notification IPC.
 * @param {() => string} deps.getGameInstallDir Reads the current game
 *   install dir at handler-invocation time (the user may have changed it
 *   between handler registration and the activate click).
 * @param {string} deps.appDir Absolute path to the app/ directory. Used to
 *   resolve activationKeys.json and the development-time XLiveActivateHelper
 *   fallback path (`appDir/../XLiveActivateHelper.exe`).
 */
function registerActivationIpc({ ipcMain, getMainWindow, getGameInstallDir, appDir }) {
  ipcMain.handle("activate-game", async () => {
    const mainWindow = getMainWindow();
    const GAME_INSTALL_DIR = getGameInstallDir();

    try {
      // Load activation keys configuration
      const configPath = path.join(
        app.getAppPath(),
        "app",
        "config",
        "activationKeys.json"
      );
      let activationConfig;

      try {
        const configData = fs.readFileSync(configPath, "utf8");
        activationConfig = JSON.parse(configData);
      } catch (configError) {
        safeLog.error(
          "[Activation] Failed to load activation keys config:",
          configError
        );
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Configuration Error",
          message: "Failed to Load Activation Keys",
          detail:
            "Could not load the activation keys configuration file. Please check that app/config/activationKeys.json exists.",
          buttons: ["OK"],
        });
        return { success: false, error: "Failed to load activation config" };
      }

      // Validate configuration structure
      if (
        !activationConfig.activationKeys ||
        !Array.isArray(activationConfig.activationKeys)
      ) {
        safeLog.error(
          "[Activation] Invalid config: activationKeys must be an array"
        );
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Configuration Error",
          message: "Invalid Activation Keys Configuration",
          detail: 'The configuration file is missing the "activationKeys" array.',
          buttons: ["OK"],
        });
        return { success: false, error: "Invalid config structure" };
      }

      if (activationConfig.activationKeys.length === 0) {
        safeLog.error("[Activation] No activation keys defined in config");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Configuration Error",
          message: "No Activation Keys Configured",
          detail: "The configuration file does not contain any activation keys.",
          buttons: ["OK"],
        });
        return { success: false, error: "No activation keys configured" };
      }

      // Validate each activation key entry
      const allErrors = [];
      activationConfig.activationKeys.forEach((keyEntry, index) => {
        const errors = validateActivationKey(keyEntry, index);
        allErrors.push(...errors);
      });

      if (allErrors.length > 0) {
        safeLog.error("[Activation] Validation errors:", allErrors);
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Configuration Validation Failed",
          message: "Invalid Activation Key Data",
          detail:
            "The following validation errors were found:\n\n" +
            allErrors.join("\n"),
          buttons: ["OK"],
        });
        return { success: false, error: "Config validation failed" };
      }

      // Count total available PCIDs across all keys
      const totalPcids = activationConfig.activationKeys.reduce(
        (sum, key) => sum + key.pcids.length,
        0
      );
      safeLog.info(
        `[Activation] Loaded ${activationConfig.activationKeys.length} activation key(s) with ${totalPcids} total PCID(s)`
      );

      // Log all available keys
      activationConfig.activationKeys.forEach((key, idx) => {
        safeLog.info(
          `[Activation]   Key ${idx + 1}: ID=${key.id}, PCIDs=${
            key.pcids.length
          }${key.name ? `, Name="${key.name}"` : ""}`
        );
      });

      // RANDOMLY SELECT an activation key
      const randomKeyIndex = Math.floor(
        Math.random() * activationConfig.activationKeys.length
      );
      const selectedKey = activationConfig.activationKeys[randomKeyIndex];

      // RANDOMLY SELECT a PCID from that key's PCIDs array
      const randomPcidIndex = Math.floor(
        Math.random() * selectedKey.pcids.length
      );
      const ACTIVATION_PCID_HEX_STRING = selectedKey.pcids[randomPcidIndex];
      const PRODUCT_KEY = selectedKey.productKey;

      safeLog.info(`[Activation] Random selection process:`);
      safeLog.info(
        `[Activation]   - Selected key index: ${randomKeyIndex} (out of ${activationConfig.activationKeys.length})`
      );
      safeLog.info(
        `[Activation]   - Selected PCID index: ${randomPcidIndex} (out of ${selectedKey.pcids.length})`
      );
      safeLog.info(`[Activation]   - PCID to use: ${ACTIVATION_PCID_HEX_STRING}`);
      safeLog.info(`[Activation]   - Product key: ${PRODUCT_KEY}`);

      safeLog.info("========================================");
      safeLog.info("🎮 STARTING GAME ACTIVATION PROCESS");
      safeLog.info("========================================");
      safeLog.info(
        `[Activation] Randomly selected: Key ID ${selectedKey.id}${
          selectedKey.name ? ` (${selectedKey.name})` : ""
        }`
      );
      safeLog.info(`[Activation] Product Key: ${PRODUCT_KEY}`);
      safeLog.info(
        `[Activation] Activation PCID: ${ACTIVATION_PCID_HEX_STRING} (${
          randomPcidIndex + 1
        } of ${selectedKey.pcids.length})`
      );
      safeLog.info(`[Activation] Game Install Dir: ${GAME_INSTALL_DIR}`);
      safeLog.info(`[Activation] Time: ${new Date().toLocaleTimeString()}`);

      // 2.1 Registry Accessibility Check
      safeLog.info("\n[Step 1/6] Checking registry accessibility...");
      const canAccessRegistry = await registryUtils.checkPathAccess();
      safeLog.info(`[Step 1/6] Registry accessible: ${canAccessRegistry}`);
      if (!canAccessRegistry) {
        safeLog.error("[Step 1/6] ❌ FAILED: Cannot access registry");
        safeLog.info("========================================\n");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Activation Failed",
          message: "Registry Access Denied",
          detail:
            "Cannot access the required registry path. Please ensure you have proper permissions.",
          buttons: ["OK"],
        });
        return {
          success: false,
          error: "Registry access denied",
        };
      }

      // 3.1 Check PCID Exists
      safeLog.info("\n[Step 2/6] Checking if PCID exists in registry...");
      const pcidExists = await registryUtils.checkPcidInRegistry();
      safeLog.info(`[Step 2/6] PCID exists: ${pcidExists}`);
      if (!pcidExists) {
        safeLog.error("[Step 2/6] ❌ FAILED: PCID not found");
        safeLog.info("========================================\n");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Activation Failed",
          message: "PCID Not Found",
          detail:
            "Please launch the game at least once to generate a PCID before attempting activation.",
          buttons: ["OK"],
        });
        return {
          success: false,
          error: "No PCID found. Launch the game first to generate a PCID.",
        };
      }

      // 3.2 Read Current PCID
      safeLog.info("\n[Step 3/6] Reading current PCID from registry...");
      const currentPcid = await registryUtils.getPcidFromRegistry();
      safeLog.info(
        `[Step 3/6] PCID retrieved: ${
          currentPcid ? `0x${currentPcid.toString(16).toUpperCase()}` : "FAILED"
        }`
      );
      if (!currentPcid) {
        safeLog.error("[Step 3/6] ❌ FAILED: Could not read PCID value");
        safeLog.info("========================================\n");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Activation Failed",
          message: "Failed to Read PCID",
          detail: "Could not read the PCID value from registry.",
          buttons: ["OK"],
        });
        return {
          success: false,
          error: "Failed to retrieve current PCID",
        };
      }

      // 3.3 Check for Existing Backup & Create if Needed
      safeLog.info("\n[Step 4/6] Checking for PCID backup...");
      const backupExists = await registryUtils.checkSrPcidBackupExists();
      safeLog.info(`[Step 4/6] Backup exists: ${backupExists}`);
      if (!backupExists) {
        safeLog.info("[Step 4/6] Creating PCID backup...");
        const backupResult = await registryUtils.backupPcidToRegistryViaRegFile(
          currentPcid
        );
        safeLog.info(
          `[Step 4/6] Backup result: ${
            backupResult ? JSON.stringify(backupResult) : "NULL"
          }`
        );

        if (!backupResult || !backupResult.success) {
          safeLog.error("[Step 4/6] ❌ FAILED: Could not create PCID backup");
          safeLog.info("========================================\n");
          dialog.showMessageBox(mainWindow, {
            type: "error",
            title: "Activation Failed",
            message: "PCID Backup Failed",
            detail:
              "Failed to create a PCID backup. Activation cannot continue without a recovery point.",
            buttons: ["OK"],
          });
          return {
            success: false,
            error: "Failed to create PCID backup",
          };
        }
        safeLog.info("[Step 4/6] ✅ PCID backup created successfully");
      } else {
        safeLog.info("[Step 4/6] ✅ Backup already exists - skipping");
      }

      // 4. Registry-Based Game Activation
      try {
        safeLog.info("\n[Step 5/6] Applying registry-based game activation...");
        safeLog.info(`[Step 5/6] Using game directory: ${GAME_INSTALL_DIR}`);
        safeLog.info(`[Step 5/6] Using product key: ${PRODUCT_KEY}`);
        safeLog.info(
          `[Step 5/6] Using activation PCID: ${ACTIVATION_PCID_HEX_STRING}`
        );

        // Convert PCID from canonical form (JSON) to big-endian (reverse byte pairs)
        // Example: b6377a64a9f736a3 -> a336f7a9647a37b6
        const reversedPcid = registryUtils.reversePcidByteOrder(
          ACTIVATION_PCID_HEX_STRING
        );
        safeLog.info(
          `[Step 5/6] Reversed PCID (big-endian) to write: ${reversedPcid}`
        );

        // Set activation PCID paired with this key
        // The PCID is stored as a QWORD (64-bit) hexadecimal value in the registry
        // Format: 16-character hex string (e.g., "4550b3e602efbbf6")
        safeLog.info(`[Step 5/6] Setting activation PCID: ${reversedPcid}`);
        const pcidSetResult = await registryUtils.setPcidInRegistry(reversedPcid);

        if (!pcidSetResult || !pcidSetResult.success) {
          safeLog.error(`[Step 5/6] ❌ FAILED to set activation PCID`);
          throw new Error("Failed to set activation PCID");
        }
        safeLog.info(`[Step 5/6] ✅ Activation PCID set successfully`);

        const activationRegResult = await registryUtils.activateGameInRegistry(
          GAME_INSTALL_DIR,
          PRODUCT_KEY
        );

        safeLog.info(
          `[Step 5/6] Activation result: ${
            activationRegResult ? JSON.stringify(activationRegResult) : "NULL"
          }`
        );

        if (!activationRegResult || !activationRegResult.success) {
          const errorMsg =
            (activationRegResult && activationRegResult.error) ||
            "Failed to apply registry settings for activation.";
          safeLog.error(`[Step 5/6] ❌ FAILED: ${errorMsg}`);
          safeLog.info("========================================\n");
          throw new Error(errorMsg);
        }

        safeLog.info("[Step 5/6] ✅ Registry activation completed successfully");

        // 5.5. Delete config.bin (only) BEFORE Native Token Injection (do NOT delete Token.bin)
        safeLog.info(
          "\n[Pre-Step 6/6] Deleting config.bin (required before injection)..."
        );
        const tokenDeletionResult = await registryUtils.deleteTokenFiles();
        if (!tokenDeletionResult || !tokenDeletionResult.success) {
          safeLog.warn("[Pre-Step 6/6] ⚠️  Could not delete config.bin");
          safeLog.warn(
            `[Pre-Step 6/6] Errors: ${JSON.stringify(
              tokenDeletionResult?.errors
            )}`
          );
        } else {
          safeLog.info("[Pre-Step 6/6] ✅ config.bin deleted successfully");
        }

        // 6. Native Token Injection via XLiveActivateHelper.exe (x86)
        safeLog.info(
          "\n[Step 6/6] Attempting native token injection via XLiveActivateHelper.exe..."
        );
        let tokenInjectionSuccess = false;
        try {
          // Check if .NET 6.0 Desktop Runtime x86 is installed (REQUIRED for helper)
          safeLog.info(
            "[Step 6/6] Checking for .NET 6.0 Desktop Runtime (x86)..."
          );
          const dotnet6Check = await checkDotNet6x86Runtime();
          safeLog.info(
            `[Step 6/6] .NET 6.0 x86 Runtime: ${
              dotnet6Check.installed
                ? `✅ Installed (${dotnet6Check.version})`
                : "❌ Not Installed"
            }`
          );

          if (!dotnet6Check.installed) {
            safeLog.warn(
              "[Step 6/6] ⚠️  .NET 6.0 Desktop Runtime (x86) is NOT installed"
            );
            safeLog.warn(
              "[Step 6/6]    XLiveActivateHelper.exe requires .NET 6.0 to run"
            );
            safeLog.warn(
              "[Step 6/6]    Registry activation succeeded, but token injection will be skipped"
            );

            // Show custom dialog offering to install .NET 6.0
            const installDotnet = await dialog.showMessageBox(mainWindow, {
              type: "warning",
              title: "Missing .NET 6.0 Runtime",
              message: ".NET 6.0 Desktop Runtime (x86) Not Found",
              detail:
                "The activation helper requires .NET 6.0 Desktop Runtime (x86) to inject the product key automatically.\n\n" +
                "Would you like to install it now? (Required)\n\n" +
                "Installation will take 1-2 minutes and happen in the background.",
              buttons: ["Install .NET 6.0", "Cancel"],
              defaultId: 0,
              cancelId: 1,
            });

            if (installDotnet.response === 0) {
              // User wants to install .NET 6.0
              safeLog.info("[Step 6/6] User confirmed .NET 6.0 installation");
              safeLog.info("[Step 6/6] Downloading and installing .NET 6.0...");

              try {
                // Download and install .NET 6.0 silently
                const installResult = await downloadAndInstallDotNet6({
                  getMainWindow,
                });

                if (installResult.success) {
                  safeLog.info("[Step 6/6] ✅ .NET 6.0 installer completed");

                  // Wait longer for registry to update (5 seconds)
                  safeLog.info(
                    "[Step 6/6] Waiting 5 seconds for .NET 6.0 to be registered in Windows registry..."
                  );
                  await new Promise((resolve) => setTimeout(resolve, 5000));

                  // Re-check if .NET 6.0 is now installed
                  const dotnet6Recheck = await checkDotNet6x86Runtime();
                  safeLog.info(
                    `[Step 6/6] .NET 6.0 recheck: ${
                      dotnet6Recheck.installed
                        ? `✅ Installed (${dotnet6Recheck.version})`
                        : "❌ Still not detected"
                    }`
                  );

                  if (dotnet6Recheck.installed) {
                    safeLog.info("[Step 6/6] ✅ .NET 6.0 verified and ready!");
                    safeLog.info("[Step 6/6] Continuing with token injection...");
                    // Don't throw error - continue to token injection below
                  } else {
                    safeLog.warn(
                      "[Step 6/6] ⚠️  .NET 6.0 installation completed but not yet detected"
                    );
                    safeLog.warn(
                      "[Step 6/6]    This may require a system restart or the registry needs time to update"
                    );

                    await dialog.showMessageBox(mainWindow, {
                      type: "error",
                      title: ".NET 6.0 Installation Issue",
                      message: ".NET 6.0 Not Detected After Installation",
                      detail:
                        "The .NET 6.0 installer completed, but the runtime is not yet detected.\n\n" +
                        "This may require:\n" +
                        "• A system restart\n" +
                        "• Waiting a few more minutes for registry updates\n\n" +
                        "Please restart your computer and try activation again, or manually install .NET 6.0 Desktop Runtime (x86) from Microsoft's website.",
                      buttons: ["OK"],
                    });

                    return {
                      success: false,
                      error: ".NET 6.0 installation verification failed",
                    };
                  }
                } else {
                  safeLog.warn(
                    "[Step 6/6] ⚠️  .NET 6.0 installation failed or was cancelled"
                  );
                  safeLog.warn(`[Step 6/6]    Error: ${installResult.error}`);

                  await dialog.showMessageBox(mainWindow, {
                    type: "error",
                    title: ".NET 6.0 Installation Failed",
                    message: "Failed to Install .NET 6.0 Runtime",
                    detail:
                      `The .NET 6.0 installer failed: ${installResult.error}\n\n` +
                      "Please try:\n" +
                      "• Checking your internet connection\n" +
                      "• Running the launcher as Administrator\n" +
                      "• Manually downloading and installing .NET 6.0 Desktop Runtime (x86) from:\n" +
                      "https://dotnet.microsoft.com/download/dotnet/6.0",
                    buttons: ["OK"],
                  });

                  return {
                    success: false,
                    error: ".NET 6.0 installation failed",
                  };
                }
              } catch (installError) {
                safeLog.error(
                  "[Step 6/6] ❌ Error during .NET 6.0 installation:",
                  installError
                );
                throw new Error("DOTNET_INSTALL_ERROR");
              }
            } else {
              safeLog.info("[Step 6/6] User cancelled .NET 6.0 installation");

              await dialog.showMessageBox(mainWindow, {
                type: "info",
                title: "Activation Cancelled",
                message: "Game Activation Cancelled",
                detail:
                  ".NET 6.0 Desktop Runtime (x86) is required for automatic activation.\n\n" +
                  "To activate the game, you can:\n" +
                  "1. Install .NET 6.0 Desktop Runtime (x86) from:\n" +
                  "   https://dotnet.microsoft.com/download/dotnet/6.0\n" +
                  "2. Run activation again after installing .NET 6.0",
                buttons: ["OK"],
              });

              return { success: false, error: "Activation cancelled by user" };
            }
          }

          // Look for XLiveActivateHelper.exe (BlackAnt's KeyWriter)
          // Try multiple locations (dev vs production)
          const possibleHelperPaths = [
            // Production (packaged app)
            path.join(
              process.resourcesPath || app.getAppPath(),
              "XLiveActivateHelper.exe"
            ),
            // Development (project root - where we copied it)
            path.join(app.getAppPath(), "XLiveActivateHelper.exe"),
            // Development (built location)
            path.join(
              app.getAppPath(),
              "resources",
              "XLiveActivateHelper",
              "XLIVEActivateHelper",
              "bin",
              "Release",
              "net6.0",
              "win-x86",
              "XLIVEActivateHelper.exe"
            ),
            // Alternative dev location (relative to main.js's __dirname,
            // injected here as `appDir`).
            path.join(appDir, "..", "XLiveActivateHelper.exe"),
          ];

          let helperPath = null;
          for (const possiblePath of possibleHelperPaths) {
            safeLog.info(`[Step 6/6] Checking path: ${possiblePath}`);
            if (fs.existsSync(possiblePath)) {
              helperPath = possiblePath;
              safeLog.info(`[Step 6/6] ✅ Found helper at: ${possiblePath}`);
              break;
            }
          }

          if (helperPath) {
            safeLog.info(`[Step 6/6] ✅ Found XLiveActivateHelper.exe`);
            safeLog.info(
              `[Step 6/6] Calling XLiveSetSponsorToken via x86 helper...`
            );
            safeLog.info(`[Step 6/6] Product Key: ${PRODUCT_KEY}`);
            safeLog.info(`[Step 6/6] Title ID: 1297287126 (0x4D5307D6)`);

            const helperResult = await new Promise((resolve) => {
              const helperProcess = spawn(helperPath, [PRODUCT_KEY], {
                cwd: GAME_INSTALL_DIR,
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
              });
              safeLog.info(
                `[Step 6/6] Process spawned with PID: ${helperProcess.pid}`
              );

              let stdout = "";
              let stderr = "";

              helperProcess.stdout.on("data", (data) => {
                const output = data.toString();
                stdout += output;
                safeLog.info(`[Step 6/6] ${output.trim()}`);
              });

              helperProcess.stderr.on("data", (data) => {
                const error = data.toString();
                stderr += error;
                safeLog.error(`[Step 6/6] ${error.trim()}`);
              });

              helperProcess.on("close", (code) => {
                safeLog.info(`[Step 6/6] Helper exited with code: ${code}`);
                if (stdout) {
                  safeLog.info(`[Step 6/6] Full stdout:\n${stdout}`);
                }
                if (stderr) {
                  safeLog.error(`[Step 6/6] Full stderr:\n${stderr}`);
                }
                resolve({ code, stdout, stderr });
              });

              helperProcess.on("error", (error) => {
                safeLog.error(`[Step 6/6] Process error: ${error.message}`);
                resolve({ code: -1, error: error.message });
              });
            });

            if (helperResult.code === 0) {
              tokenInjectionSuccess = true;
              safeLog.info("[Step 6/6] ✅ XLiveSetSponsorToken succeeded!");
              safeLog.info(
                "[Step 6/6] Native token injection completed successfully"
              );
            } else if (helperResult.code === 1) {
              safeLog.warn("[Step 6/6] ⚠️  Invalid arguments passed to helper");
              safeLog.warn(`[Step 6/6]    Exit Code: 1 (EXIT_INVALID_ARGS)`);
              safeLog.warn(`[Step 6/6]    Product key may be malformed`);
            } else if (helperResult.code === 2) {
              safeLog.warn(
                "[Step 6/6] ⚠️  xlive.dll not found - GFWL may not be installed"
              );
              safeLog.warn(`[Step 6/6]    Exit Code: 2 (EXIT_DLL_NOT_FOUND)`);
              safeLog.warn(
                `[Step 6/6]    Check GFWL installation or xlive.dll presence`
              );
            } else if (helperResult.code === 3) {
              safeLog.warn("[Step 6/6] ⚠️  XLiveSetSponsorToken call failed");
              safeLog.warn(`[Step 6/6]    Exit Code: 3 (EXIT_CALL_FAILED)`);
              safeLog.warn(`[Step 6/6]    The DLL function returned an error`);
            } else if (helperResult.code === -1) {
              safeLog.warn("[Step 6/6] ⚠️  Helper process failed to start");
              safeLog.warn(
                `[Step 6/6]    Error: ${helperResult.error || "Unknown"}`
              );
            } else {
              safeLog.warn(
                `[Step 6/6] ⚠️  Helper failed with exit code: ${helperResult.code}`
              );
              safeLog.warn(`[Step 6/6]    This is an unexpected error code`);
            }
          } else {
            safeLog.warn(
              "[Step 6/6] ⚠️  XLiveActivateHelper.exe not found in any location:"
            );
            possibleHelperPaths.forEach((p) => safeLog.warn(`  - ${p}`));
            safeLog.warn(
              "[Step 6/6] Registry activation should still be effective"
            );
          }
        } catch (helperError) {
          if (helperError.message === "DOTNET_NOT_INSTALLED") {
            safeLog.info(
              "[Step 6/6] ⚠️  Skipping token injection - .NET 6.0 not installed"
            );
            safeLog.info(
              "[Step 6/6]    User will receive product key for manual entry"
            );
          } else if (helperError.message === "DOTNET_INSTALL_FAILED") {
            safeLog.warn(
              "[Step 6/6] ⚠️  .NET 6.0 installation failed or was cancelled"
            );
            safeLog.warn(
              "[Step 6/6]    User will receive product key for manual entry"
            );
          } else if (helperError.message === "DOTNET_INSTALL_ERROR") {
            safeLog.error(
              "[Step 6/6] ❌ Error occurred during .NET 6.0 installation"
            );
            safeLog.error(
              "[Step 6/6]    User will receive product key for manual entry"
            );
          } else {
            safeLog.error(
              `[Step 6/6] ❌ Exception calling XLiveActivateHelper: ${helperError.message}`
            );
          }
        }

        // Show warning if token injection failed (non-fatal) - auto-copy key to clipboard
        if (!tokenInjectionSuccess) {
          clipboard.writeText(PRODUCT_KEY);
          safeLog.info(
            "[Activation] Product key automatically copied to clipboard"
          );

          const clearAfterSeconds =
            activationConfig.settings?.clearClipboardAfterSeconds || 30;
          let clipboardClearTimer = null;

          if (clearAfterSeconds > 0) {
            clipboardClearTimer = setTimeout(() => {
              if (clipboard.readText() === PRODUCT_KEY) {
                clipboard.clear();
                safeLog.info("[Activation] Clipboard auto-cleared after timeout");
              }
            }, clearAfterSeconds * 1000);
          }

          showActivationSuccessDialog(PRODUCT_KEY, clearAfterSeconds, {
            appDir,
            getMainWindow,
          });
        }

        // 7. Success Completion
        safeLog.info("\n========================================");
        safeLog.info("✅ ACTIVATION PROCESS COMPLETED");
        safeLog.info("========================================");
        safeLog.info("Summary:");
        safeLog.info(`  - Registry activation: SUCCESS`);
        safeLog.info(`  - PCID backup: SUCCESS`);
        safeLog.info(`  - Activation PCID set: SUCCESS`);
        safeLog.info(
          `  - config.bin cleanup (pre-injection): ${
            tokenDeletionResult?.success ? "SUCCESS" : "PARTIAL"
          }`
        );
        safeLog.info(
          `  - Native token injection: ${
            tokenInjectionSuccess ? "SUCCESS" : "FAILED (manual key required)"
          }`
        );
        safeLog.info("========================================\n");
        safeLog.info("NOTE: Activation PCID remains set for game activation.");
        safeLog.info(
          "      Your original PCID backup is safely stored and can be restored later if needed."
        );
        safeLog.info("========================================\n");

        // Success dialog and clipboard are only shown if token injection FAILED
        // (already handled above in the `if (!tokenInjectionSuccess)` block)
        return { success: true, message: "Game activated successfully." };
      } catch (error) {
        safeLog.error("\n========================================");
        safeLog.error("❌ ACTIVATION FAILED");
        safeLog.error("========================================");
        safeLog.error(`Error during activation: ${error.message}`);
        safeLog.error(`Stack trace: ${error.stack}`);
        safeLog.error("========================================\n");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Activation Error",
          message: "An error occurred during game activation.",
          detail: error.message || "Unknown error. Please check the logs.",
          buttons: ["OK"],
        });
        return {
          success: false,
          error: `Activation process failed: ${error.message}`,
        };
      }
    } catch (error) {
      safeLog.error("Outer error during game activation:", error);
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Activation System Error",
        message: "A system error occurred in the activation process.",
        detail: error.message || "Unknown critical error. Check logs.",
        buttons: ["OK"],
      });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-current-pcid", async () => {
    try {
      safeLog.info("Getting current PCID from registry");

      const registryDump = await registryUtils.dumpRegistryKey();

      const canAccessRegistry = await registryUtils.checkPathAccess();

      if (!canAccessRegistry) {
        return {
          success: false,
          error: "Cannot access registry path",
          diagnostics: registryDump,
        };
      }

      const pcidExists = await registryUtils.checkPcidInRegistry();
      safeLog.info("PCID exists check:", pcidExists);

      if (!pcidExists) {
        safeLog.info("No PCID found in registry");
        return {
          success: false,
          error: "No PCID found",
          diagnostics: registryDump,
        };
      }

      const rawPcid = await registryUtils.getPcidFromRegistry();
      safeLog.info("Raw PCID from registry:", rawPcid);

      if (!rawPcid) {
        safeLog.info("Failed to retrieve PCID value");
        return {
          success: false,
          error: "Failed to retrieve PCID value",
          diagnostics: registryDump,
        };
      }

      safeLog.info("Converting PCID to formatted hex...");
      const formattedPcid = registryUtils.decimalToHexFormat(rawPcid);
      safeLog.info("Current PCID (decimal):", rawPcid);
      safeLog.info("Current PCID (formatted hex):", formattedPcid);

      return {
        success: true,
        pcid: formattedPcid,
        rawPcid: rawPcid,
        diagnostics: registryDump,
      };
    } catch (error) {
      safeLog.error("Error getting current PCID:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("backup-pcid", async () => {
    const mainWindow = getMainWindow();

    safeLog.info("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    safeLog.info("!!!! IPC_BACKUP_PCID_CALLED in main.js !!!!");
    safeLog.info("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    try {
      safeLog.info("[Backup PCID Handler] Starting PCID backup process...");

      const pcidExists = await registryUtils.checkPcidInRegistry();
      if (!pcidExists) {
        safeLog.info("[Backup PCID Handler] No PCID found to backup.");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "PCID Backup Failed",
          message: "No PCID Found",
          detail:
            "You need to run the game at least once to generate a PCID that can be backed up.",
          buttons: ["OK"],
        });
        return { success: false, error: "No PCID found to backup" };
      }
      safeLog.info("[Backup PCID Handler] PCID exists in registry.");

      const currentPcid = await registryUtils.getPcidFromRegistry();
      if (!currentPcid) {
        safeLog.info("[Backup PCID Handler] Failed to retrieve current PCID.");
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "PCID Backup Failed",
          message: "Failed to Read PCID",
          detail: "Could not read the PCID value from registry.",
          buttons: ["OK"],
        });
        return { success: false, error: "Failed to retrieve current PCID" };
      }
      safeLog.info("[Backup PCID Handler] Current PCID for backup:", currentPcid);

      // Use the integrated .reg file backup method from registryUtils
      try {
        safeLog.info(
          "[Backup PCID Handler] Attempting PCID backup using registryUtils.backupPcidToRegistryViaRegFile"
        );
        const result = await registryUtils.backupPcidToRegistryViaRegFile(
          currentPcid
        );
        safeLog.info(
          "[Backup PCID Handler] Backup result:",
          JSON.stringify(result, null, 2)
        );

        if (result.success) {
          dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "PCID Backup Successful",
            message: result.message || "PCID backup created successfully!",
            detail: result.backupPcid
              ? `Backed up PCID: 0x${result.backupPcid}`
              : "The PCID has been backed up.",
            buttons: ["OK"],
          });
        } else {
          dialog.showMessageBox(mainWindow, {
            type: "error",
            title: "PCID Backup Failed",
            message: result.error || "An unknown error occurred during backup.",
            detail:
              result.details ||
              "Please check the application logs for more information.",
            buttons: ["OK"],
          });
        }
        return result;
      } catch (backupError) {
        safeLog.error(
          "[Backup PCID Handler] Critical error during backupPcidToRegistryViaRegFile call:",
          backupError
        );
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "PCID Backup Error",
          message:
            "A critical error occurred while attempting to backup the PCID.",
          detail: backupError.message || "Unknown error. Check logs.",
          buttons: ["OK"],
        });
        return {
          success: false,
          error: `Backup process failed: ${backupError.message}`,
        };
      }
    } catch (error) {
      safeLog.error(
        "[Backup PCID Handler] Outer critical error in backup process:",
        error
      );
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "PCID Backup System Error",
        message: "A system error occurred in the backup process.",
        detail: error.message || "Unknown critical error. Check logs.",
        buttons: ["OK"],
      });
      return {
        success: false,
        error: error.message || "Unknown critical error in backup handler",
      };
    }
  });
}

module.exports = {
  isRunningAsAdmin,
  isDirectoryWritable,
  makeCreateDirectoryWithPermissions,
  makeCheckActivationStatus,
  restoreOriginalPcid,
  registerActivationIpc,
};
