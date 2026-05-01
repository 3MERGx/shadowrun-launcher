/**
 * Centralized logger for the Shadowrun FPS Launcher main process.
 *
 * Wraps electron-log with project-specific configuration:
 *  - File transport at %APPDATA%/Shadowrun FPS Launcher/logs/main.log
 *    (electron-log default; rotates at 512 KB, keeps main.old.log).
 *  - Captures level "info" and above to file (info, warn, error, fatal).
 *    Console.debug calls do NOT hit the file.
 *  - Console transport: "silly" in --dev / NODE_ENV=development, "info" in prod.
 *  - Captures uncaughtException and unhandledRejection automatically,
 *    while preserving the discord-rpc "connection closed" filter that
 *    used to live in main.js.
 *
 * Usage:
 *   const { safeLog } = require("./logger");
 *   safeLog.info("starting game...");
 *   safeLog.error("failed to start", err);
 *
 * Phase 11 retired the transitional console -> safeLog shim that Phase 0
 * had installed in main.js. Every main-process module now imports safeLog
 * directly, so console.* calls only happen in the renderer (where this
 * module is unreachable anyway) and in the standalone validateConfig CLI.
 * installConsoleShim() is still exported below in case a future entry
 * point needs to recapture stray console.* output.
 */

const electronLog = require("electron-log/main");

// Detect dev mode the same way createWindow does (see app/main.js).
const isDev =
  process.env.NODE_ENV === "development" ||
  process.argv.includes("--dev");

// File transport: persistent rotating log the user can hand back to support.
electronLog.transports.file.level = "info";
electronLog.transports.file.maxSize = 512 * 1024; // 512 KB before rotation (smaller = easier to share; old log kept as main.old.log).
electronLog.transports.file.format =
  "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

// Console transport: chatty in dev, only meaningful entries in prod.
electronLog.transports.console.level = isDev ? "silly" : "info";
electronLog.transports.console.format =
  "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

// Wire automatic capture of uncaught exceptions / unhandled rejections.
// Returning `false` from onError tells electron-log to skip its built-in
// handling for the event (dialog + default log line). We use that to silence
// the long-standing expected rejection from discord-rpc when its connection
// closes during app quit. Everything else falls through to the default
// handler, which logs via `electronLog.error(errorName, error)`.
electronLog.errorHandler.startCatching({
  showDialog: false,
  onError({ error }) {
    if (
      error &&
      error.message === "connection closed" &&
      typeof error.stack === "string" &&
      (error.stack.includes("discord-rpc") ||
        error.stack.includes("discord_rpc"))
    ) {
      return false;
    }
    return undefined;
  },
});

/**
 * safeLog: project-standard logger surface.
 *
 * Mirrors the user-rule API ("safeLog.info / .warn / .error / .debug").
 * Accepts variadic args like console.* does, with one ergonomic exception:
 * a (message, ErrorOrString) call collapses to a single "message: detail"
 * line so the most common error-logging shape stays compact in the file.
 */
// Helper: when a call site passes exactly (message, ErrorOrString) we keep
// the historical "msg: detail" formatting so the file lines stay compact and
// readable. Anything else (1 arg, or 3+ args) is forwarded variadically just
// like console.* would, so the Phase 11 console -> safeLog sweep doesn't
// regress any multi-arg log calls.
function formatTwoArg(message, error) {
  if (error instanceof Error) {
    const detail = error.code
      ? `${error.code} - ${error.message}`
      : error.message;
    return [`${message}: ${detail}`];
  }
  if (typeof error === "string") {
    return [`${message}: ${error}`];
  }
  // Number, boolean, plain object, undefined, null - hand off to electronLog
  // so it can stringify the way console.* would.
  return [message, error];
}

const safeLog = {
  info: (...args) => electronLog.info(...args),
  warn: (...args) => {
    if (args.length === 2) {
      electronLog.warn(...formatTwoArg(args[0], args[1]));
    } else {
      electronLog.warn(...args);
    }
  },
  error: (...args) => {
    if (args.length === 2) {
      electronLog.error(...formatTwoArg(args[0], args[1]));
    } else {
      electronLog.error(...args);
    }
  },
  debug: (...args) => electronLog.debug(...args),
  verbose: (...args) => electronLog.verbose(...args),
  silly: (...args) => electronLog.silly(...args),
  // Expose the underlying functions object for the console shim below.
  functions: electronLog.functions,
  // Expose raw electron-log for advanced cases (auto-updater plumbing, etc).
  raw: electronLog,
};

/**
 * Install a console.* -> safeLog shim so legacy call sites flow into main.log
 * without per-call edits. console.log routes to log.info, console.debug routes
 * to log.debug (which the file transport drops by default at level "info").
 *
 * This is intended as a transitional Phase 0 capture; per-module rewrites
 * during the refactor will progressively replace console.* with explicit
 * safeLog.* calls and demote noise to safeLog.debug.
 */
function installConsoleShim() {
  Object.assign(console, electronLog.functions);
}

/**
 * Returns the absolute path to the active main.log file. Used by the
 * "show-logs" IPC handler so the renderer can offer a "View Logs" button
 * that opens the file with the OS default text editor.
 */
function getLogFilePath() {
  try {
    return electronLog.transports.file.getFile().path;
  } catch (_err) {
    return null;
  }
}

module.exports = {
  safeLog,
  installConsoleShim,
  getLogFilePath,
  electronLog,
};
