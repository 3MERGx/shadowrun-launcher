/**
 * IPC handlers for opening external URLs in the user's default browser.
 *
 * Three thin wrappers around `shell.openExternal`:
 *   - "open-discord"  -> Shadowrun FPS Discord invite
 *   - "open-website"  -> shadowrunfps.com
 *   - "open-external" -> generic, validated URL passed from the renderer
 *
 * The generic `open-external` handler enforces an http/https allowlist so
 * the renderer can't ask the OS to launch arbitrary URI schemes (file://,
 * shell:, etc.) from a compromised page.
 *
 * Co-located with the Discord module because the Discord/website CTAs are
 * the primary callers; if more link plumbing shows up later, this can move
 * to its own module without changing the registration entry point.
 */

const { ipcMain, shell } = require("electron");
const { safeLog } = require("../logger");

const DISCORD_INVITE_URL = "https://discord.gg/p9uzqbNPEK";
const WEBSITE_URL = "https://www.shadowrunfps.com";

/**
 * Register the link IPC handlers. Idempotent: removes any prior registration
 * first so this module is safe to call once during boot.
 *
 * @returns {() => void} Unregister callback.
 */
function registerLinkHandlers() {
  ipcMain.removeHandler("open-discord");
  ipcMain.removeHandler("open-website");
  ipcMain.removeHandler("open-external");

  ipcMain.handle("open-discord", async () => {
    await shell.openExternal(DISCORD_INVITE_URL);
    return { success: true };
  });

  ipcMain.handle("open-website", async () => {
    await shell.openExternal(WEBSITE_URL);
    return { success: true };
  });

  ipcMain.handle("open-external", async (_event, url) => {
    try {
      if (!url || typeof url !== "string") {
        safeLog.error("[open-external] Invalid URL provided");
        return { success: false, error: "Invalid URL" };
      }

      // Allowlist http/https only - keeps a compromised renderer from
      // shelling out to file://, shell:, or any custom protocol handler.
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        safeLog.error(
          "[open-external] URL must start with http:// or https://"
        );
        return { success: false, error: "Invalid URL protocol" };
      }

      safeLog.info("[open-external] Opening URL:", url);
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      safeLog.error("[open-external] Error opening URL", error);
      return { success: false, error: error.message };
    }
  });

  return function unregister() {
    ipcMain.removeHandler("open-discord");
    ipcMain.removeHandler("open-website");
    ipcMain.removeHandler("open-external");
  };
}

module.exports = { registerLinkHandlers };
