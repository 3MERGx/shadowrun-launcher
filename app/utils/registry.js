const { safeLog } = require("../main/logger");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// DEFINE CONSTANTS HERE
const REGISTRY_PATH_XLIVE =
  "HKEY_CURRENT_USER\\Software\\Classes\\SOFTWARE\\Microsoft\\XLive";
const PCID_VALUE_NAME = "PCID"; // Assuming you use this elsewhere
const PCID_BACKUP_VALUE_NAME = "SRPCIDBACKUP";

// NOTE: Activation PCID/Product Key pairs are now managed in app/config/activationKeys.json
// This allows multiple key pairs to be configured and selected by the user

// Game Activation Specific Constants
const REGISTRY_PATH_GAME_ACTIVATION =
  "HKEY_CURRENT_USER\\Software\\Classes\\Software\\Microsoft\\XLive\\Games\\4d5307d6"; // Shadowrun Title ID
const GAME_TITLE_ID_VALUE_NAME = "TitleId";
const GAME_TITLE_ID_HEX = "4d5307d6"; // Shadowrun Title ID (confirmed correct)
const GAME_ACTIVATION_VALUE_NAME = "Activation";
const GAME_ACTIVATION_DATA_HEX = "01000000000000000000000000000000"; // Example data

// GFWL Path Constants
const REGISTRY_PATH_GFWL =
  "HKEY_CURRENT_USER\\Software\\Classes\\Microsoft\\Games\\Shadowrun"; // UPDATED
const GFWL_INSTALL_DIR_VALUE_NAME = "InstallationDirectory";
const GFWL_ONLINE_KEY_VALUE_NAME = "OnlineProductKey";

// Token File Paths (Note: Title ID 4d5307d6 from C# for these paths)
const TOKEN_FILE_BASE_PATH = path.join(
  os.homedir(), // Gets C:\Users\<username>
  "AppData",
  "Local",
  "Microsoft",
  "XLive",
  "Titles",
  "4d5307d6" // Title ID from C# for token files
);
const TOKEN_FILE_PATH = path.join(TOKEN_FILE_BASE_PATH, "Token.bin");
const CONFIG_FILE_PATH = path.join(TOKEN_FILE_BASE_PATH, "config.bin");

/**
 * QWORD PCIDs from `reg query` are often shown without leading zeros (e.g. 0x1).
 * Backup / formatQwordRegValue require exactly 16 hex digits.
 */
function normalizePcidHexString(raw) {
  if (!raw || typeof raw !== "string") return null;
  const strip = raw.replace(/^0x/i, "").replace(/,/g, "").replace(/\s/g, "");
  if (!strip || !/^[0-9A-Fa-f]+$/.test(strip)) return null;
  if (strip.length > 16) return null;
  return strip.padStart(16, "0").toUpperCase();
}

// Registry utility functions
const registryUtils = {
  // Check if PCID exists in registry
  checkPcidInRegistry: () => {
    return new Promise((resolve) => {
      exec(
        `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_VALUE_NAME}"`,
        (error, stdout) => {
          if (error) {
            resolve(false);
            return;
          }
          resolve(stdout.includes(PCID_VALUE_NAME));
        }
      );
    });
  },

  // Get PCID from registry
  getPcidFromRegistry: () => {
    return new Promise((resolve, reject) => {
      exec(
        `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_VALUE_NAME}"`,
        (error, stdout, stderr) => {
          if (error) {
            safeLog.error(`Error querying PCID: ${error.message}`);
            if (stderr) safeLog.error(`stderr: ${stderr}`);
            resolve(null);
            return;
          }

          const match = stdout.match(
            new RegExp(
              `${PCID_VALUE_NAME}\\s+REG_QWORD\\s+0x([0-9A-Fa-f]+)`,
              "i"
            )
          );
          if (match && match[1]) {
            const normalized = normalizePcidHexString(match[1]);
            if (!normalized) {
              safeLog.warn(
                `[RegistryUtils] Could not normalize PCID from registry: ${match[1]}`
              );
              resolve(null);
              return;
            }
            resolve(normalized);
          } else {
            resolve(null);
          }
        }
      );
    });
  },

  // Check if SRPCIDBACKUP exists
  checkSrPcidBackupExists: () => {
    return new Promise((resolve) => {
      exec(
        `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_BACKUP_VALUE_NAME}"`,
        (error, stdout) => {
          resolve(!error && stdout.includes(PCID_BACKUP_VALUE_NAME));
        }
      );
    });
  },

  // Create and import a .reg file
  importRegFile: (regContent) => {
    return new Promise((resolve, reject) => {
      const tempFileName = `shadowrun_temp_reg_${Date.now()}.reg`;
      const regFilePath = path.join(
        os.tmpdir(),
        "shadowrun_launcher_temp",
        tempFileName
      );

      const tempDir = path.dirname(regFilePath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Ensure the file is written as UTF-16LE, as regContent should now include BOM
      fs.writeFile(regFilePath, regContent, "utf16le", (err) => {
        if (err) {
          safeLog.error(
            "[RegistryUtils] Error writing .reg file for importRegFile:",
            err
          );
          reject(err);
          return;
        }

        exec(`reg import "${regFilePath}"`, (error, stdout, stderr) => {
          // Delete reg file after import attempt
          try {
            if (fs.existsSync(regFilePath)) {
              fs.unlinkSync(regFilePath);
              safeLog.info(
                `[RegistryUtils] Deleted temp activation .reg file: ${regFilePath}`
              );
            }
          } catch (unlinkErr) {
            safeLog.warn(
              `[RegistryUtils] Could not delete temp activation .reg file ${regFilePath}:`,
              unlinkErr
            );
          }

          if (error) {
            safeLog.error(
              "[RegistryUtils] Error importing .reg file via 'reg import':",
              error
            );
            if (stderr)
              safeLog.error(`[RegistryUtils] 'reg import' stderr: ${stderr}`);
            reject(error);
            return;
          }
          safeLog.info(
            "[RegistryUtils] 'reg import' command executed successfully."
          );
          resolve(true);
        });
      });
    });
  },

  // Convert decimal to hex format
  decimalToHexFormat: (value) => {
    try {
      // Check if the value is already a hex string (contains letters a-f)
      const isAlreadyHex = /[a-f]/i.test(value);

      let hexString;
      if (isAlreadyHex) {
        // Remove 0x prefix if present
        hexString = value.replace(/^0x/, "");
      } else {
        // Convert from decimal to hex
        hexString = BigInt(value).toString(16);
      }

      // Ensure the string is padded to even length
      if (hexString.length % 2 !== 0) {
        hexString = "0" + hexString;
      }

      // Create pairs in the correct order (little-endian format)
      const pairs = [];
      for (let i = 0; i < hexString.length; i += 2) {
        const pair = hexString.substring(i, i + 2);
        pairs.push(pair);
      }

      const result = pairs.join(",");
      return result;
    } catch (error) {
      safeLog.error("Error in decimalToHexFormat:", error);
      // If conversion fails, return a safe string representation
      return String(value);
    }
  },

  // Add this function to get the backup PCID
  getSrPcidBackupFromRegistry: () => {
    return new Promise((resolve) => {
      exec(
        `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_BACKUP_VALUE_NAME}"`,
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }

          if (!stdout.includes(PCID_BACKUP_VALUE_NAME)) {
            resolve(null);
            return;
          }

          try {
            const lines = stdout.split("\n");
            const valueLine = lines.find((line) =>
              line.trim().startsWith(PCID_BACKUP_VALUE_NAME)
            );

            if (valueLine) {
              const parts = valueLine.trim().split(/\s+/).filter(Boolean);

              if (parts.length >= 3) {
                // Return clean hex value WITHOUT commas (formatQwordRegValue will handle formatting)
                const hexValue = parts[parts.length - 1]
                  .replace("0x", "")
                  .toUpperCase()
                  .padStart(16, "0");
                resolve(hexValue);
                return;
              }
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        }
      );
    });
  },

  // Add a test function to the registry utils
  checkPathAccess: () => {
    return new Promise((resolve) => {
      exec(`reg query "${REGISTRY_PATH_XLIVE}"`, (error, stdout, stderr) => {
        if (error) {
          safeLog.error("Registry path access error:", error.message);
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  },

  // Add a diagnostic function
  dumpRegistryKey: () => {
    return new Promise((resolve) => {
      // Use both possible registry paths
      safeLog.info("Attempting to dump registry key...");

      const paths = [
        REGISTRY_PATH_XLIVE,
        "HKEY_CURRENT_USER\\Software\\Classes\\SOFTWARE\\Microsoft\\XLive",
      ];

      let results = {};

      // Try the first path
      exec(`reg query "${paths[0]}"`, (error, stdout) => {
        results.path1 = { error: error?.message, output: stdout };

        // Try the second path
        exec(`reg query "${paths[1]}"`, (error2, stdout2) => {
          results.path2 = { error: error2?.message, output: stdout2 };

          resolve(results);
        });
      });
    });
  },

  // Add this new function to properly format REG_QWORD values
  formatQwordRegValue: (hexQwordValue) => {
    if (!hexQwordValue || hexQwordValue.length !== 16) {
      safeLog.error(
        "[RegistryUtils] Invalid hexQwordValue for formatting:",
        hexQwordValue
      );
      return "";
    }
    const cleanHex = hexQwordValue
      .replace(/^0x/, "")
      .padStart(16, "0")
      .toUpperCase();
    return cleanHex.match(/../g).reverse().join(",");
  },

  // Reverse byte pairs in a hex string (e.g., "b6377a64a9f736a3" -> "a336f7a9647a37b6")
  reversePcidByteOrder: (pcidHex) => {
    if (!pcidHex || pcidHex.length !== 16) {
      safeLog.error(
        "[RegistryUtils] Invalid PCID for byte reversal:",
        pcidHex
      );
      return pcidHex;
    }
    const cleanHex = pcidHex.replace(/^0x/, "").padStart(16, "0").toUpperCase();
    return cleanHex.match(/../g).reverse().join("");
  },

  // Fix the direct registry add command function
  addSrPcidBackupDirect: (pcidValue) => {
    return new Promise((resolve, reject) => {
      safeLog.info(
        "[RegistryUtils] Creating SRPCIDBACKUP registry value from PCID (direct attempt):",
        pcidValue
      );
      const cleanValue = pcidValue.replace(/^0x/, "").toUpperCase();

      // Ensure formatQwordRegValue is called correctly
      const formattedValue = registryUtils.formatQwordRegValue(cleanValue);
      if (!formattedValue) {
        reject(new Error("Failed to format QWORD value for direct backup."));
        return;
      }

      const regContent = `Windows Registry Editor Version 5.00

[${REGISTRY_PATH_XLIVE}] 
"${PCID_BACKUP_VALUE_NAME}"=hex(b):${formattedValue}`; // Use the constants

      const tempRegPath = path.join(
        os.tmpdir(),
        `srpcid_backup_direct_${Date.now()}.reg`
      );

      try {
        // Write the .reg file
        fs.writeFileSync(tempRegPath, regContent);
        safeLog.info(".reg file created at:", tempRegPath);

        // Execute the reg file - this might work without admin rights in some cases
        const command = `regedit /s "${tempRegPath}"`;
        safeLog.info("Executing command:", command);

        exec(command, (error, stdout, stderr) => {
          // Clean up the temp file
          try {
            fs.unlinkSync(tempRegPath);
          } catch (e) {
            /* ignore */
          }

          if (error) {
            safeLog.error("Error importing registry file:", error);
            safeLog.error("STDERR:", stderr);
            reject(
              new Error("Registry access denied. Try running as administrator.")
            );
            return;
          }

          safeLog.info("Registry import completed");
          resolve(true);
        });
      } catch (error) {
        safeLog.error("Error creating or importing registry file:", error);
        reject(error);
      }
    });
  },

  // Add this function to your registry.js file for debugging
  showRegistryPathContent: (registryPath) => {
    return new Promise((resolve, reject) => {
      exec(`reg query "${registryPath}"`, (error, stdout) => {
        if (error) {
          safeLog.error(`Error querying registry path ${registryPath}:`, error);
          resolve({ success: false, error: error.message });
        } else {
          safeLog.info(`Registry path ${registryPath} contents:`, stdout);
          resolve({ success: true, content: stdout });
        }
      });
    });
  },

  /**
   * Backs up the given PCID value to the registry as SRPCIDBACKUP (REG_QWORD)
   * using a temporary .reg file.
   * @param {string} pcidValueToBackup - The PCID hex string (e.g., "0123456789ABCDEF")
   * @returns {Promise<{success: boolean, message?: string, error?: string, backupPcid?: string}>}
   */
  backupPcidToRegistryViaRegFile: (pcidValueToBackup) => {
    return new Promise((resolve) => {
      const cleanPcidValue = normalizePcidHexString(String(pcidValueToBackup));
      if (!cleanPcidValue) {
        const errorMsg = `Invalid PCID format for backup: ${pcidValueToBackup}. Expected up to 16 hex digits (reg.exe may omit leading zeros).`;
        safeLog.error(`[RegistryUtils] ${errorMsg}`);
        resolve({ success: false, error: errorMsg });
        return;
      }

      const formattedQwordValue =
        registryUtils.formatQwordRegValue(cleanPcidValue);
      if (!formattedQwordValue) {
        const errorMsg = `Failed to format PCID for .reg file: ${cleanPcidValue}`;
        safeLog.error(`[RegistryUtils] ${errorMsg}`);
        resolve({ success: false, error: errorMsg });
        return;
      }

      // PREPEND BOM and ensure CRLF line endings
      const BOM = "\uFEFF"; // UTF-16 LE Byte Order Mark character
      const regContent =
        BOM + // Add BOM at the very beginning
        `Windows Registry Editor Version 5.00\r\n` +
        `\r\n` + // Blank line
        `[${REGISTRY_PATH_XLIVE}]\r\n` +
        `"${PCID_BACKUP_VALUE_NAME}"=hex(b):${formattedQwordValue}\r\n`;

      const tempDir = path.join(os.tmpdir(), "shadowrun_launcher_temp");
      try {
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
      } catch (dirError) {
        safeLog.error(
          `[RegistryUtils] Error creating temp directory ${tempDir}:`,
          dirError
        );
        resolve({
          success: false,
          error: `Failed to create temp directory: ${dirError.message}`,
        });
        return;
      }

      const tempFileName = `sr_pcid_backup_${Date.now()}.reg`;
      const regFilePath = path.join(tempDir, tempFileName);
      safeLog.info(`[RegistryUtils] Creating .reg file at: ${regFilePath}`);

      try {
        // Write the .reg file with UTF-16 LE encoding.
        // The BOM character in the string will be written as FF FE bytes.
        fs.writeFileSync(regFilePath, regContent, "utf16le");
        safeLog.info("[RegistryUtils] .reg file content written (with BOM).");

        const command = `regedit.exe /s "${regFilePath}"`; // RESTORED /s for silent operation
        safeLog.info(`[RegistryUtils] Executing command: ${command}`);

        exec(command, (error, stdout, stderr) => {
          // Log content again and path for inspection - CAN BE REMOVED IF CONFIDENT
          // try {
          //   const tempFileContent = fs.readFileSync(regFilePath, "utf16le");
          //   safeLog.info(
          //     `[RegistryUtils] Content of temp file ${regFilePath} (as read by Node):\n${tempFileContent}`
          //   );
          // } catch (readError) {
          //   safeLog.error(
          //     `[RegistryUtils] Error reading temp file for inspection:`,
          //     readError
          //   );
          // }

          // RESTORE DELETION OF TEMP FILE
          try {
            if (fs.existsSync(regFilePath)) {
              fs.unlinkSync(regFilePath);
              safeLog.info(
                `[RegistryUtils] Temporary .reg file DELETED: ${regFilePath}`
              );
            }
          } catch (cleanupError) {
            safeLog.warn(
              `[RegistryUtils] Warning: Failed to delete temp .reg file ${regFilePath}:`,
              cleanupError
            );
          }
          // safeLog.info( // No longer needed as file is deleted
          //   `[RegistryUtils] Temporary .reg file RETAINED for inspection: ${regFilePath}`
          // );

          if (error) {
            safeLog.error(
              `[RegistryUtils] Error importing .reg file with regedit.exe:`,
              error
            );
            if (stderr)
              safeLog.error(`[RegistryUtils] regedit.exe stderr: ${stderr}`);
            resolve({
              success: false,
              error: `Failed to import .reg file. Error: ${error.message}. Ensure regedit.exe has permissions.`,
              details: stderr,
            });
            return;
          }

          safeLog.info(
            `[RegistryUtils] .reg file import command executed. stdout: ${stdout}`
          );

          // ADD A DELAY HERE before verification
          setTimeout(() => {
            safeLog.info(
              "[RegistryUtils] Performing verification query after delay..."
            );
            // Verification step
            exec(
              `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_BACKUP_VALUE_NAME}"`,
              (verifyError, verifyStdout) => {
                if (verifyError) {
                  safeLog.error(
                    `[RegistryUtils] Verification query failed for ${PCID_BACKUP_VALUE_NAME}:`,
                    verifyError
                  );
                  resolve({
                    success: false,
                    error: `Backup command executed, but verification failed. Value may not be set. Error: ${verifyError.message}`,
                  });
                } else {
                  const match = verifyStdout.match(
                    new RegExp(
                      `${PCID_BACKUP_VALUE_NAME}\\s+REG_QWORD\\s+0x([0-9A-Fa-f]+)`,
                      "i"
                    )
                  );
                  const verifiedNorm = match?.[1]
                    ? normalizePcidHexString(match[1])
                    : null;
                  if (verifiedNorm && verifiedNorm === cleanPcidValue) {
                    safeLog.info(
                      `[RegistryUtils] Successfully verified backup of ${PCID_BACKUP_VALUE_NAME} with value 0x${match[1]}`
                    );
                    resolve({
                      success: true,
                      message: "PCID backup created and verified successfully.",
                      backupPcid: cleanPcidValue,
                    });
                  } else {
                    safeLog.warn(
                      `[RegistryUtils] Backup command executed, but verification shows incorrect or missing value. Found: ${verifyStdout}`
                    );
                    resolve({
                      success: false,
                      error:
                        "Backup command executed, but value mismatch or not found during verification.",
                    });
                  }
                }
              }
            );
          }, 500); // Delay for 500 milliseconds (half a second)
        });
      } catch (fileError) {
        safeLog.error(
          "[RegistryUtils] Error writing or executing .reg file:",
          fileError
        );
        resolve({
          success: false,
          error: `File system error during .reg backup process: ${fileError.message}`,
        });
      }
    });
  },

  activateGameInRegistry: (installPath, productKey) => {
    return new Promise(async (resolve, reject) => {
      safeLog.info("[RegistryUtils] Attempting to activate game in registry...");
      const BOM = "\uFEFF";

      let regContent =
        BOM +
        `Windows Registry Editor Version 5.00\r\n` +
        `\r\n` +
        `[${REGISTRY_PATH_GAME_ACTIVATION}]\r\n` +
        `"${GAME_TITLE_ID_VALUE_NAME}"=hex(4):${GAME_TITLE_ID_HEX.match(
          /.{1,2}/g
        ).join(",")}\r\n` +
        `"${GAME_ACTIVATION_VALUE_NAME}"=hex(7):${GAME_ACTIVATION_DATA_HEX.match(
          /.{1,2}/g
        ).join(",")}\r\n` +
        `\r\n` +
        `[${REGISTRY_PATH_GFWL}]\r\n` +
        `"${GFWL_INSTALL_DIR_VALUE_NAME}"="${installPath.replace(
          /\\/g,
          "\\\\"
        )}"\r\n`;

      if (productKey) {
        regContent += `"${GFWL_ONLINE_KEY_VALUE_NAME}"="${productKey}"\r\n`;
      }

      try {
        safeLog.info(
          "[RegistryUtils] Importing game activation registry settings..."
        );
        await registryUtils.importRegFile(regContent);
        safeLog.info(
          "[RegistryUtils] Game activation registry settings imported successfully."
        );
        resolve({ success: true });
      } catch (error) {
        safeLog.error(
          "[RegistryUtils] Failed to import game activation settings:",
          error
        );
        reject({
          success: false,
          error: `Failed to apply game activation settings: ${error.message}`,
        });
      }
    });
  },

  setPcidInRegistry: (pcidValueToSet) => {
    return new Promise((resolve) => {
      if (
        !pcidValueToSet ||
        pcidValueToSet.length !== 16 ||
        !/^[0-9A-Fa-f]+$/.test(pcidValueToSet)
      ) {
        const errorMsg = `Invalid PCID format for setting PCID: ${pcidValueToSet}. Must be 16 hex characters.`;
        safeLog.error(`[RegistryUtils] ${errorMsg}`);
        resolve({ success: false, error: errorMsg });
        return;
      }
      const cleanPcidValue = pcidValueToSet.toUpperCase();
      safeLog.info(
        `[RegistryUtils] Attempting to set PCID to: ${cleanPcidValue} in path ${REGISTRY_PATH_XLIVE} as ${PCID_VALUE_NAME}`
      );

      const formattedQwordValue =
        registryUtils.formatQwordRegValue(cleanPcidValue);
      if (!formattedQwordValue) {
        const errorMsg = `Failed to format PCID for .reg file: ${cleanPcidValue}`;
        safeLog.error(`[RegistryUtils] ${errorMsg}`);
        resolve({ success: false, error: errorMsg });
        return;
      }

      const BOM = "\uFEFF";
      const regContent =
        BOM +
        `Windows Registry Editor Version 5.00\r\n` +
        `\r\n` +
        `[${REGISTRY_PATH_XLIVE}]\r\n` +
        `"${PCID_VALUE_NAME}"=hex(b):${formattedQwordValue}\r\n`;

      const tempDir = path.join(os.tmpdir(), "shadowrun_launcher_temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFileName = `sr_set_pcid_${Date.now()}.reg`;
      const regFilePath = path.join(tempDir, tempFileName);

      try {
        fs.writeFileSync(regFilePath, regContent, "utf16le");
        safeLog.info(
          "[RegistryUtils] .reg file for setting PCID written (with BOM)."
        );

        const command = `regedit.exe /s "${regFilePath}"`;
        safeLog.info(`[RegistryUtils] Executing command: ${command}`);

        exec(command, (error, stdout, stderr) => {
          try {
            if (fs.existsSync(regFilePath)) {
              fs.unlinkSync(regFilePath);
              safeLog.info(
                `[RegistryUtils] Temporary .reg file for setting PCID DELETED: ${regFilePath}`
              );
            }
          } catch (cleanupError) {
            safeLog.warn(
              `[RegistryUtils] Warning: Failed to delete temp .reg file ${regFilePath}:`,
              cleanupError
            );
          }

          if (error) {
            safeLog.error(
              `[RegistryUtils] Error setting PCID with regedit.exe:`,
              error
            );
            if (stderr)
              safeLog.error(`[RegistryUtils] regedit.exe stderr: ${stderr}`);
            resolve({
              success: false,
              error: `Failed to set PCID. Error: ${error.message}`,
            });
            return;
          }

          safeLog.info(
            `[RegistryUtils] Set PCID command executed. stdout: ${stdout}`
          );
          // Verification step
          setTimeout(() => {
            exec(
              `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_VALUE_NAME}"`,
              (verifyError, verifyStdout) => {
                if (verifyError) {
                  resolve({
                    success: false,
                    error: `Set PCID command executed, but verification failed. Error: ${verifyError.message}`,
                  });
                } else {
                  const match = verifyStdout.match(
                    new RegExp(
                      `${PCID_VALUE_NAME}\\s+REG_QWORD\\s+0x([0-9A-Fa-f]+)`,
                      "i"
                    )
                  );
                  if (match && match[1]) {
                    // Pad the registry value to 16 characters for comparison
                    // Registry may return "2" but we need "0000000000000002"
                    const registryValue = match[1]
                      .toUpperCase()
                      .padStart(16, "0");

                    if (registryValue === cleanPcidValue) {
                      safeLog.info(
                        `[RegistryUtils] ✅ PCID set and verified successfully: ${cleanPcidValue}`
                      );
                      safeLog.info(
                        `[RegistryUtils]    Registry returned: 0x${match[1]} (normalized to: ${registryValue})`
                      );
                      resolve({
                        success: true,
                        message: "PCID set and verified successfully.",
                        newPcid: cleanPcidValue,
                      });
                    } else {
                      const actualValue = match[1].toUpperCase();
                      safeLog.error(
                        `[RegistryUtils] ❌ PCID verification failed!`
                      );
                      safeLog.error(
                        `[RegistryUtils]    Expected: ${cleanPcidValue}`
                      );
                      safeLog.error(
                        `[RegistryUtils]    Found (raw): ${actualValue}`
                      );
                      safeLog.error(
                        `[RegistryUtils]    Found (padded): ${registryValue}`
                      );
                      safeLog.error(`[RegistryUtils]    Match object:`, match);
                      resolve({
                        success: false,
                        error: `Set PCID command executed, but verification failed. Expected: ${cleanPcidValue}, Found: ${registryValue}`,
                      });
                    }
                  } else {
                    safeLog.error(
                      `[RegistryUtils] ❌ PCID verification failed - no match found!`
                    );
                    resolve({
                      success: false,
                      error:
                        "Set PCID command executed, but PCID not found in registry during verification.",
                    });
                  }
                }
              }
            );
          }, 500);
        });
      } catch (fileError) {
        safeLog.error(
          "[RegistryUtils] Error writing or executing .reg file for setting PCID:",
          fileError
        );
        resolve({
          success: false,
          error: `File system error during set PCID process: ${fileError.message}`,
        });
      }
    });
  },

  getSrPcidBackupValue: () => {
    return new Promise((resolve) => {
      exec(
        `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_BACKUP_VALUE_NAME}"`,
        (error, stdout, stderr) => {
          if (error) {
            safeLog.warn(
              `[RegistryUtils] SRPCIDBACKUP not found or error querying: ${error.message}`
            );
            resolve(null); // Not found or error
            return;
          }
          const match = stdout.match(
            new RegExp(
              `${PCID_BACKUP_VALUE_NAME}\\s+REG_QWORD\\s+0x([0-9A-Fa-f]+)`,
              "i"
            )
          );
          if (match && match[1]) {
            safeLog.info(
              `[RegistryUtils] Found SRPCIDBACKUP value: 0x${match[1]}`
            );
            resolve(match[1].toUpperCase());
          } else {
            safeLog.warn(
              `[RegistryUtils] SRPCIDBACKUP found but value format unexpected: ${stdout}`
            );
            resolve(null);
          }
        }
      );
    });
  },

  deleteTokenFiles: () => {
    return new Promise((resolve) => {
      let deletedCount = 0;
      let errors = [];
      // Only delete config.bin; do NOT delete Token.bin (required for activation)
      const filesToDelete = [CONFIG_FILE_PATH];

      safeLog.info("[RegistryUtils] Attempting to delete config.bin (token cache)...");
      safeLog.info(`[RegistryUtils] Config file path: ${CONFIG_FILE_PATH}`);

      filesToDelete.forEach((filePath) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            safeLog.info(`[RegistryUtils] Deleted file: ${filePath}`);
            deletedCount++;
          } else {
            safeLog.info(
              `[RegistryUtils] File not found, skipping deletion: ${filePath}`
            );
          }
        } catch (err) {
          safeLog.error(
            `[RegistryUtils] Error deleting file ${filePath}:`,
            err
          );
          errors.push(err.message);
        }
      });

      if (errors.length > 0) {
        resolve({
          success: false,
          message: `Completed token file deletion attempt with ${errors.length} error(s).`,
          errors: errors,
          deletedCount: deletedCount,
        });
      } else {
        resolve({
          success: true,
          message: `Successfully processed token file deletions. ${deletedCount} file(s) potentially deleted.`,
          deletedCount: deletedCount,
        });
      }
    });
  },
};

module.exports = registryUtils;
