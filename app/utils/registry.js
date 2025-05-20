const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// DEFINE CONSTANTS HERE
const REGISTRY_PATH_XLIVE =
  "HKEY_CURRENT_USER\\Software\\Classes\\SOFTWARE\\Microsoft\\XLive";
const PCID_VALUE_NAME = "PCID"; // Assuming you use this elsewhere
const PCID_BACKUP_VALUE_NAME = "SRPCIDBACKUP";

// --- Activation Specific Data (from C# logic) ---
const ACTIVATION_PCID_HEX = "4550B3E602EFBBF6"; // Corresponds to "f6,bb,ef,02,e6,b3,50,45" from C# GetKeyData, converted to QWORD hex
const ACTIVATION_PRODUCT_KEY = "R9GJT-87T6K-6KV49-XTX8G-6VBWW"; // From C# GetKeyData

// Game Activation Specific Constants
const REGISTRY_PATH_GAME_ACTIVATION =
  "HKEY_CURRENT_USER\\Software\\Classes\\Software\\Microsoft\\XLive\\Games\\4d5308d6"; // UPDATED
const GAME_TITLE_ID_VALUE_NAME = "TitleId";
const GAME_TITLE_ID_HEX = "4d5308d6";
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
            console.error(`Error querying PCID: ${error.message}`);
            if (stderr) console.error(`stderr: ${stderr}`);
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
            console.log(`Found PCID value line: ${stdout.trim()}`);
            console.log(`Extracted PCID hex value: ${match[1]}`);
            resolve(match[1]);
          } else {
            console.warn(
              `PCID value not found or in unexpected format in stdout: ${stdout}`
            );
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
          console.error(
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
              console.log(
                `[RegistryUtils] Deleted temp activation .reg file: ${regFilePath}`
              );
            }
          } catch (unlinkErr) {
            console.warn(
              `[RegistryUtils] Could not delete temp activation .reg file ${regFilePath}:`,
              unlinkErr
            );
          }

          if (error) {
            console.error(
              "[RegistryUtils] Error importing .reg file via 'reg import':",
              error
            );
            if (stderr)
              console.error(`[RegistryUtils] 'reg import' stderr: ${stderr}`);
            reject(error);
            return;
          }
          console.log(
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
      console.log("Converting value to hex format:", value);

      // Check if the value is already a hex string (contains letters a-f)
      const isAlreadyHex = /[a-f]/i.test(value);

      let hexString;
      if (isAlreadyHex) {
        console.log("Value is already in hex format");
        // Remove 0x prefix if present
        hexString = value.replace(/^0x/, "");
      } else {
        console.log("Converting from decimal to hex");
        // Convert from decimal to hex
        hexString = BigInt(value).toString(16);
      }

      // Ensure the string is padded to even length
      if (hexString.length % 2 !== 0) {
        hexString = "0" + hexString;
      }

      console.log("Hex string:", hexString);

      // Create pairs in the correct order (little-endian format)
      const pairs = [];
      for (let i = 0; i < hexString.length; i += 2) {
        const pair = hexString.substring(i, i + 2);
        pairs.push(pair);
      }

      const result = pairs.join(",");
      console.log("Formatted hex result:", result);
      return result;
    } catch (error) {
      console.error("Error in decimalToHexFormat:", error);
      // If conversion fails, return a safe string representation
      return String(value);
    }
  },

  // Add this function to get the backup PCID
  getSrPcidBackupFromRegistry: () => {
    return new Promise((resolve) => {
      console.log("Checking for SRPCIDBACKUP in registry...");

      exec(
        `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_BACKUP_VALUE_NAME}"`,
        (error, stdout) => {
          if (error) {
            console.error("Error querying SRPCIDBACKUP:", error.message);
            resolve(null);
            return;
          }

          console.log("Registry query output:", stdout);

          if (!stdout.includes(PCID_BACKUP_VALUE_NAME)) {
            console.log("SRPCIDBACKUP not found in registry output");
            resolve(null);
            return;
          }

          try {
            // Extract the decimal value from the output
            const lines = stdout.split("\n");
            console.log("Split lines:", lines);

            const valueLine = lines.find((line) =>
              line.trim().startsWith(PCID_BACKUP_VALUE_NAME)
            );

            console.log("Found value line:", valueLine);

            if (valueLine) {
              const parts = valueLine.trim().split(/\s+/).filter(Boolean);
              console.log("Parts:", parts);

              if (parts.length >= 3) {
                const hexValue = parts[parts.length - 1].replace("0x", "");
                console.log("Extracted hex value:", hexValue);

                // Convert to the format needed
                const backupPcid = registryUtils.decimalToHexFormat(hexValue);
                console.log("Formatted backup PCID:", backupPcid);
                resolve(backupPcid);
                return;
              }
            }
            console.log("Could not parse SRPCIDBACKUP value");
            resolve(null);
          } catch (e) {
            console.error("Error parsing backup PCID:", e);
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
          console.error("Registry path access error:", error.message);
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
      console.log("Attempting to dump registry key...");

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
      console.error(
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

  // Fix the direct registry add command function
  addSrPcidBackupDirect: (pcidValue) => {
    return new Promise((resolve, reject) => {
      console.log(
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
        console.log(".reg file created at:", tempRegPath);

        // Execute the reg file - this might work without admin rights in some cases
        const command = `regedit /s "${tempRegPath}"`;
        console.log("Executing command:", command);

        exec(command, (error, stdout, stderr) => {
          // Clean up the temp file
          try {
            fs.unlinkSync(tempRegPath);
          } catch (e) {
            /* ignore */
          }

          if (error) {
            console.error("Error importing registry file:", error);
            console.error("STDERR:", stderr);
            reject(
              new Error("Registry access denied. Try running as administrator.")
            );
            return;
          }

          console.log("Registry import completed");
          resolve(true);
        });
      } catch (error) {
        console.error("Error creating or importing registry file:", error);
        reject(error);
      }
    });
  },

  // Add this function to your registry.js file for debugging
  showRegistryPathContent: (registryPath) => {
    return new Promise((resolve, reject) => {
      exec(`reg query "${registryPath}"`, (error, stdout) => {
        if (error) {
          console.error(`Error querying registry path ${registryPath}:`, error);
          resolve({ success: false, error: error.message });
        } else {
          console.log(`Registry path ${registryPath} contents:`, stdout);
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
      if (
        !pcidValueToBackup ||
        pcidValueToBackup.length !== 16 ||
        !/^[0-9A-Fa-f]+$/.test(pcidValueToBackup)
      ) {
        const errorMsg = `Invalid PCID format for backup: ${pcidValueToBackup}. Must be 16 hex characters.`;
        console.error(`[RegistryUtils] ${errorMsg}`);
        resolve({ success: false, error: errorMsg });
        return;
      }
      const cleanPcidValue = pcidValueToBackup.toUpperCase(); // Already clean, but good practice

      const formattedQwordValue =
        registryUtils.formatQwordRegValue(cleanPcidValue);
      if (!formattedQwordValue) {
        const errorMsg = `Failed to format PCID for .reg file: ${cleanPcidValue}`;
        console.error(`[RegistryUtils] ${errorMsg}`);
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
        console.error(
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
      console.log(`[RegistryUtils] Creating .reg file at: ${regFilePath}`);

      try {
        // Write the .reg file with UTF-16 LE encoding.
        // The BOM character in the string will be written as FF FE bytes.
        fs.writeFileSync(regFilePath, regContent, "utf16le");
        console.log("[RegistryUtils] .reg file content written (with BOM).");

        const command = `regedit.exe /s "${regFilePath}"`; // RESTORED /s for silent operation
        console.log(`[RegistryUtils] Executing command: ${command}`);

        exec(command, (error, stdout, stderr) => {
          // Log content again and path for inspection - CAN BE REMOVED IF CONFIDENT
          // try {
          //   const tempFileContent = fs.readFileSync(regFilePath, "utf16le");
          //   console.log(
          //     `[RegistryUtils] Content of temp file ${regFilePath} (as read by Node):\n${tempFileContent}`
          //   );
          // } catch (readError) {
          //   console.error(
          //     `[RegistryUtils] Error reading temp file for inspection:`,
          //     readError
          //   );
          // }

          // RESTORE DELETION OF TEMP FILE
          try {
            if (fs.existsSync(regFilePath)) {
              fs.unlinkSync(regFilePath);
              console.log(
                `[RegistryUtils] Temporary .reg file DELETED: ${regFilePath}`
              );
            }
          } catch (cleanupError) {
            console.warn(
              `[RegistryUtils] Warning: Failed to delete temp .reg file ${regFilePath}:`,
              cleanupError
            );
          }
          // console.log( // No longer needed as file is deleted
          //   `[RegistryUtils] Temporary .reg file RETAINED for inspection: ${regFilePath}`
          // );

          if (error) {
            console.error(
              `[RegistryUtils] Error importing .reg file with regedit.exe:`,
              error
            );
            if (stderr)
              console.error(`[RegistryUtils] regedit.exe stderr: ${stderr}`);
            resolve({
              success: false,
              error: `Failed to import .reg file. Error: ${error.message}. Ensure regedit.exe has permissions.`,
              details: stderr,
            });
            return;
          }

          console.log(
            `[RegistryUtils] .reg file import command executed. stdout: ${stdout}`
          );

          // ADD A DELAY HERE before verification
          setTimeout(() => {
            console.log(
              "[RegistryUtils] Performing verification query after delay..."
            );
            // Verification step
            exec(
              `reg query "${REGISTRY_PATH_XLIVE}" /v "${PCID_BACKUP_VALUE_NAME}"`,
              (verifyError, verifyStdout) => {
                if (verifyError) {
                  console.error(
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
                  if (
                    match &&
                    match[1] &&
                    match[1].toUpperCase() === cleanPcidValue
                  ) {
                    console.log(
                      `[RegistryUtils] Successfully verified backup of ${PCID_BACKUP_VALUE_NAME} with value 0x${match[1]}`
                    );
                    resolve({
                      success: true,
                      message: "PCID backup created and verified successfully.",
                      backupPcid: cleanPcidValue,
                    });
                  } else {
                    console.warn(
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
        console.error(
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
      console.log("[RegistryUtils] Attempting to activate game in registry...");
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
        console.log(
          "[RegistryUtils] Importing game activation registry settings..."
        );
        await registryUtils.importRegFile(regContent);
        console.log(
          "[RegistryUtils] Game activation registry settings imported successfully."
        );
        resolve({ success: true });
      } catch (error) {
        console.error(
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
        console.error(`[RegistryUtils] ${errorMsg}`);
        resolve({ success: false, error: errorMsg });
        return;
      }
      const cleanPcidValue = pcidValueToSet.toUpperCase();
      console.log(
        `[RegistryUtils] Attempting to set PCID to: ${cleanPcidValue} in path ${REGISTRY_PATH_XLIVE} as ${PCID_VALUE_NAME}`
      );

      const formattedQwordValue =
        registryUtils.formatQwordRegValue(cleanPcidValue);
      if (!formattedQwordValue) {
        const errorMsg = `Failed to format PCID for .reg file: ${cleanPcidValue}`;
        console.error(`[RegistryUtils] ${errorMsg}`);
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
        console.log(
          "[RegistryUtils] .reg file for setting PCID written (with BOM)."
        );

        const command = `regedit.exe /s "${regFilePath}"`;
        console.log(`[RegistryUtils] Executing command: ${command}`);

        exec(command, (error, stdout, stderr) => {
          try {
            if (fs.existsSync(regFilePath)) {
              fs.unlinkSync(regFilePath);
              console.log(
                `[RegistryUtils] Temporary .reg file for setting PCID DELETED: ${regFilePath}`
              );
            }
          } catch (cleanupError) {
            console.warn(
              `[RegistryUtils] Warning: Failed to delete temp .reg file ${regFilePath}:`,
              cleanupError
            );
          }

          if (error) {
            console.error(
              `[RegistryUtils] Error setting PCID with regedit.exe:`,
              error
            );
            if (stderr)
              console.error(`[RegistryUtils] regedit.exe stderr: ${stderr}`);
            resolve({
              success: false,
              error: `Failed to set PCID. Error: ${error.message}`,
            });
            return;
          }

          console.log(
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
                  if (
                    match &&
                    match[1] &&
                    match[1].toUpperCase() === cleanPcidValue
                  ) {
                    resolve({
                      success: true,
                      message: "PCID set and verified successfully.",
                      newPcid: cleanPcidValue,
                    });
                  } else {
                    resolve({
                      success: false,
                      error:
                        "Set PCID command executed, but value mismatch or not found during verification.",
                    });
                  }
                }
              }
            );
          }, 500);
        });
      } catch (fileError) {
        console.error(
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
            console.warn(
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
            console.log(
              `[RegistryUtils] Found SRPCIDBACKUP value: 0x${match[1]}`
            );
            resolve(match[1].toUpperCase());
          } else {
            console.warn(
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
      const filesToDelete = [TOKEN_FILE_PATH, CONFIG_FILE_PATH];

      console.log("[RegistryUtils] Attempting to delete token files...");
      console.log(`[RegistryUtils] Token file path: ${TOKEN_FILE_PATH}`);
      console.log(`[RegistryUtils] Config file path: ${CONFIG_FILE_PATH}`);

      filesToDelete.forEach((filePath) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[RegistryUtils] Deleted file: ${filePath}`);
            deletedCount++;
          } else {
            console.log(
              `[RegistryUtils] File not found, skipping deletion: ${filePath}`
            );
          }
        } catch (err) {
          console.error(
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
