/**
 * Discord Rich Presence integration.
 *
 * Encapsulates the entire Discord RPC lifecycle that previously lived in
 * app/main.js: optional discord-rpc require, login + connection, the 30 s
 * keep-alive interval, the 15 s rate-limited update queue, the player-count
 * sidecar API call, and shutdown cleanup. Game-state ownership lives here
 * (`playerInGame`, `gameStartTime`) so the rest of the launcher only has to
 * call `markGameStarted()` / `markGameEnded()` instead of juggling globals.
 *
 * Anything we need from main.js (current game-process liveness, app version,
 * update-available banner state) is injected via the `setup()` deps object,
 * which keeps this module decoupled from the bootstrapper.
 */

const { safeLog } = require("../logger");
const { fetchPlayerStats } = require("../services/playerTrackerStats");
const { CLIENT_ID, DISCORD_UPDATE_INTERVAL } = require("../config/constants");
const REFRESH_INTERVAL_MS = 30_000; // 30 s keep-alive

// ----------------------------------------------------------------------------
// Module state. Private; do not export. Mutated by markGameStarted() /
// markGameEnded() and the internal rate-limited update queue.
// ----------------------------------------------------------------------------

let DiscordRPC = null;
let rpc = null;

let playerInGame = false;
let gameStartTime = null;

let lastUpdateAt = 0;
let pendingUpdateTimer = null;
let refreshIntervalHandle = null;
let lastReportedState = null; // Last `actuallyPlaying` value sent to Discord.

// External dependencies, populated by setup().
let deps = {
  /** @returns {boolean} */
  isGameActuallyRunning: () => false,
  /** @returns {string} */
  getAppVersion: () => "0.0.0",
  /** @returns {{ updateAvailable: boolean, latestVersion: string | null }} */
  getUpdateInfo: () => ({ updateAvailable: false, latestVersion: null }),
  /** Called when Discord detects the game is no longer running but main.js
   *  still holds a gameProcess reference. Lets main.js null its handle. */
  onStateMismatch: () => {},
  /**
   * Called once per Discord refresh with the latest player-count payload
   * from the Railway tracker. main.js uses this as a fallback signal to
   * the updater: if everyone else is on a newer version, surface the
   * update banner even when the auto-updater hasn't fired yet.
   * @param {{ totalOnline: number, inGame: number, inMenu: number,
   *           versionBreakdown: Record<string, number> } | null} stats
   */
  onPlayerStats: () => {},
};

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Best-effort load of `discord-rpc` and start the connection. The dependency
 * is optional; if it isn't available, the rest of the launcher continues
 * silently with all RPC calls becoming no-ops.
 */
function setupDiscordIntegration(injectedDeps) {
  deps = { ...deps, ...injectedDeps };

  try {
    DiscordRPC = require("discord-rpc");
    if (DiscordRPC) {
      safeLog.info("Discord RPC module found, enabling integration");
      initDiscord();
    }
  } catch (_error) {
    safeLog.info("Discord RPC not available, integration disabled");
  }
}

/** Mark the game as started and push an immediate Discord update. */
function markGameStarted() {
  playerInGame = true;
  gameStartTime = new Date();
  updateDiscordActivity(true);
}

/** Mark the game as ended and push an immediate Discord update. */
function markGameEnded() {
  playerInGame = false;
  gameStartTime = null;
  updateDiscordActivity(false);
}

/**
 * Trigger a refresh of the current activity (used when the launcher's update
 * banner changes or after we know `playerInGame` is current). Doesn't flip
 * the in-game / idle state - just re-renders the existing one.
 */
function refresh() {
  updateDiscordActivity(playerInGame);
}

/**
 * Tear down the RPC client + timers. Idempotent. Called from main.js's
 * cleanupBeforeQuit() during app shutdown.
 */
function cleanup() {
  if (refreshIntervalHandle) {
    clearInterval(refreshIntervalHandle);
    refreshIntervalHandle = null;
    safeLog.info("[Cleanup] Cleared Discord update interval");
  }

  if (pendingUpdateTimer) {
    clearTimeout(pendingUpdateTimer);
    pendingUpdateTimer = null;
    safeLog.info("[Cleanup] Cleared pending Discord update");
  }

  if (rpc) {
    const rpcClient = rpc;
    rpc = null;
    const silent = () => {};
    try {
      const clearResult = rpcClient.clearActivity?.();
      if (clearResult && typeof clearResult.catch === "function") {
        clearResult.catch(silent);
      }
      safeLog.info("[Cleanup] Cleared Discord activity");
    } catch (error) {
      if (
        error.message !== "connection closed" &&
        !error.message.includes("Connection")
      ) {
        safeLog.error("[Cleanup] Error clearing Discord activity", error);
      }
    }
    try {
      const destroyResult = rpcClient.destroy?.();
      if (destroyResult && typeof destroyResult.catch === "function") {
        destroyResult.catch(silent);
      }
      safeLog.info("[Cleanup] Destroyed Discord RPC connection");
    } catch (error) {
      if (
        error.message !== "connection closed" &&
        !error.message.includes("Connection")
      ) {
        safeLog.error("[Cleanup] Error destroying Discord RPC", error);
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Internal: connection lifecycle
// ----------------------------------------------------------------------------

function initDiscord() {
  if (!DiscordRPC) {
    safeLog.info("Discord RPC integration skipped (module not available)");
    return;
  }

  try {
    DiscordRPC.register(CLIENT_ID);
    rpc = new DiscordRPC.Client({ transport: "ipc" });

    rpc.on("ready", () => {
      safeLog.info("Discord RPC connected");
      lastReportedState = false;
      updateDiscordActivity(false);

      // Refresh every 30 s. Two purposes:
      //   1. Keep the activity entry fresh while idle.
      //   2. Catch state drift (game crash w/o exit handler firing).
      refreshIntervalHandle = setInterval(() => {
        const isPlaying = playerInGame && deps.isGameActuallyRunning();
        updateDiscordActivity(isPlaying);
      }, REFRESH_INTERVAL_MS);
    });

    rpc.on("error", (error) => {
      // RPC_CONNECTION_TIMEOUT is the expected outcome when Discord isn't
      // running; log only the unexpected ones.
      if (error.message !== "RPC_CONNECTION_TIMEOUT") {
        safeLog.info("Discord RPC error:", error.message);
      }
      rpc = null;
    });

    // Cap the login wait at 5 s so a missing Discord client doesn't hold
    // anything up.
    const connectionTimeout = setTimeout(() => {
      rpc = null;
    }, 5_000);

    rpc
      .login({ clientId: CLIENT_ID })
      .then(() => clearTimeout(connectionTimeout))
      .catch((error) => {
        clearTimeout(connectionTimeout);
        if (error.message !== "RPC_CONNECTION_TIMEOUT") {
          safeLog.info("Discord RPC connection failed:", error.message);
        }
        rpc = null;
      });
  } catch (error) {
    safeLog.info("Discord RPC initialization error:", error);
    rpc = null;
  }
}

// ----------------------------------------------------------------------------
// Internal: player-count sidecar
// ----------------------------------------------------------------------------

/**
 * Fetch the live player counts from the Railway player-tracker. Returns null
 * on any error/timeout; the caller falls back to a generic activity string.
 */
function fetchPlayerCount() {
  return fetchPlayerStats();
}

// ----------------------------------------------------------------------------
// Internal: rate-limited activity update
// ----------------------------------------------------------------------------

/**
 * Push a new activity to Discord, respecting the 15 s rate limit but
 * allowing immediate updates on state transitions (idle -> playing or
 * vice-versa). Verifies the actual game-process liveness before reporting
 * "playing" so a crashed game doesn't leave a stuck Rich Presence entry.
 */
async function updateDiscordActivity(playing) {
  if (!rpc) return;

  const actuallyPlaying = playing && deps.isGameActuallyRunning();

  // Defensive: if the caller still thinks we're in-game but the process
  // disappeared, correct our local state and notify main.js so it can null
  // its gameProcess handle too.
  if (playing && !actuallyPlaying) {
    safeLog.info(
      "[Discord RPC] Game state mismatch detected - correcting to idle",
    );
    playerInGame = false;
    gameStartTime = null;
    try {
      deps.onStateMismatch();
    } catch (_err) {
      /* swallow - main.js cleanup is best-effort */
    }
  }

  const now = Date.now();
  const timeSinceLastUpdate = now - lastUpdateAt;
  const stateChanged = lastReportedState !== actuallyPlaying;

  // Throttle to one update every 15 s unless the state flipped.
  if (timeSinceLastUpdate < DISCORD_UPDATE_INTERVAL && !stateChanged) {
    const delay = DISCORD_UPDATE_INTERVAL - timeSinceLastUpdate;
    if (pendingUpdateTimer) {
      clearTimeout(pendingUpdateTimer);
    }
    pendingUpdateTimer = setTimeout(() => {
      updateDiscordActivity(actuallyPlaying);
    }, delay);
    return;
  }

  if (pendingUpdateTimer) {
    clearTimeout(pendingUpdateTimer);
    pendingUpdateTimer = null;
  }

  lastUpdateAt = now;
  lastReportedState = actuallyPlaying;

  const playerStats = await fetchPlayerCount();

  // Hand the raw stats to main.js for the version-fallback side effect
  // before we read getUpdateInfo() - that way the updater banner reflects
  // any version drift detected from this refresh.
  try {
    deps.onPlayerStats(playerStats);
  } catch (_err) {
    /* swallow - best effort */
  }

  const currentVersion = deps.getAppVersion();
  const { updateAvailable, latestVersion } = deps.getUpdateInfo();
  const versionText =
    updateAvailable && latestVersion
      ? `Update: v${currentVersion} -> v${latestVersion}`
      : `v${currentVersion}`;

  let activity;

  if (actuallyPlaying) {
    // Discord auto-renders "Playing for X hours Y minutes" from startTimestamp.
    const state = playerStats
      ? typeof playerStats.inGameAhl === "number" &&
          typeof playerStats.inGameGfwl === "number"
        ? `${playerStats.totalOnline} online • ${playerStats.inGame} in-game (AHL ${playerStats.inGameAhl} · GFWL ${playerStats.inGameGfwl})`
        : `${playerStats.totalOnline} online • ${playerStats.inGame} in-game`
      : "In-Game";
    activity = {
      details: "Playing Shadowrun (2007)",
      state,
      largeImageKey: "game_logo",
      largeImageText: "Shadowrun FPS",
      smallImageKey: "launcher_logo",
      smallImageText: versionText,
      startTimestamp: gameStartTime || new Date(),
      buttons: [
        { label: "🌐 Visit Website", url: "https://www.shadowrunfps.com" },
        { label: "💬 Join Discord", url: "https://discord.gg/p9uzqbNPEK" },
      ],
      instance: false,
    };
  } else {
    const state = playerStats
      ? typeof playerStats.inGameAhl === "number" &&
          typeof playerStats.inGameGfwl === "number"
        ? `${playerStats.totalOnline} online • ${playerStats.inGame} in-game (AHL ${playerStats.inGameAhl} · GFWL ${playerStats.inGameGfwl})`
        : `${playerStats.totalOnline} online • ${playerStats.inGame} in-game`
      : "Idle in Launcher";
    activity = {
      details: "Idle in Launcher",
      state,
      largeImageKey: "launcher_logo",
      largeImageText: "Shadowrun FPS Launcher",
      smallImageKey: "menu",
      smallImageText: versionText,
      buttons: [
        { label: "🌐 Visit Website", url: "https://www.shadowrunfps.com" },
        { label: "💬 Join Discord", url: "https://discord.gg/p9uzqbNPEK" },
      ],
      instance: false,
    };
  }

  rpc.setActivity(activity).catch((error) => {
    const msg = (error && error.message) || String(error || "");
    // discord-rpc often reports generic "Unknown Error" when IPC is flaky, the
    // Discord client restarted, or assets/buttons fail validation — not worth an
    // info log every 30s keep-alive. Unexpected messages still surface at debug.
    const benign =
      !msg.trim() ||
      /rpc_connection|enoent|unknown error|connection closed|socket|econnrefused|ipc/i.test(
        msg,
      );
    if (!benign) {
      safeLog.info("[Discord RPC] Activity update error:", msg);
    } else {
      safeLog.debug(
        "[Discord RPC] Activity update skipped:",
        msg || "(no message)",
      );
    }
  });
}

module.exports = {
  setupDiscordIntegration,
  markGameStarted,
  markGameEnded,
  refresh,
  cleanup,
  // Exposed for the launch path: it calls update(true) immediately after
  // spawn (without owning playerInGame yet) and again 2 s later via
  // markGameStarted() once the spawn is confirmed healthy. Preserving both
  // timing points keeps Rich Presence behaving exactly as it did pre-refactor.
  updateDiscordActivity,
};
