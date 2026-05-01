const { safeLog } = require("../main/logger");
const fs = require("fs");
const path = require("path");
const os = require("os");

const tokenUtils = {
  deleteTokenFiles: () => {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

    const filesToDelete = [
      path.join(
        localAppData,
        "Microsoft",
        "XLive",
        "Titles",
        "4D5307D6",
        "Token.bin"
      ),
      path.join(
        localAppData,
        "Microsoft",
        "XLive",
        "Titles",
        "4D5307D6",
        "config.bin"
      ),
    ];

    filesToDelete.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          safeLog.info(`Deleted: ${filePath}`);
        } catch (error) {
          safeLog.error(`Failed to delete ${filePath}:`, error);
        }
      }
    });

    return true;
  },
  checkTokenExists: () => {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const tokenPath = path.join(
      localAppData,
      "Microsoft",
      "XLive",
      "Titles",
      "4D5307D6",
      "Token.bin"
    );

    return fs.existsSync(tokenPath);
  },
};

module.exports = tokenUtils;
