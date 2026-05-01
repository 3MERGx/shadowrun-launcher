/**
 * Shared GET /api/stats client for the Railway player-tracker service.
 * Used by Discord Rich Presence and the launcher footer player count.
 */

const https = require("https");

const TRACKING_API_URL = "https://playertracker-production.up.railway.app";

/**
 * @returns {Promise<{
 *   totalOnline: number,
 *   inGame: number,
 *   inMenu: number,
 *   versionBreakdown: Record<string, number>
 * } | null>}
 */
function fetchPlayerStats() {
  try {
    const url = new URL(`${TRACKING_API_URL}/api/stats`);
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: "GET",
          timeout: 3000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const stats = JSON.parse(data);
              resolve({
                totalOnline: stats.totalOnline || 0,
                inGame: stats.inGame || 0,
                inMenu: stats.inMenu || 0,
                versionBreakdown: stats.versionBreakdown || {},
              });
            } catch (_err) {
              resolve(null);
            }
          });
        }
      );

      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });

      req.end();
    });
  } catch (_err) {
    return Promise.resolve(null);
  }
}

module.exports = {
  TRACKING_API_URL,
  fetchPlayerStats,
};
