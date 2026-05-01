// Misc-IPC aggregator (Phase 10).
//
// Bundles the five small IPC modules in this directory behind a single
// registerMiscIpc(deps) call so app/main.js doesn't have to know which
// module registers which channel. Each sub-module pulls only the deps
// it actually needs out of the bag.
//
// Modules (and the channels they own):
//   appInfo       - get-version, get-changelog, show-notification,
//                   ping-main, show-logs, restart-as-admin
//   systemInfo    - get-gpu-info, get-system-info
//   diagnostics   - run-diagnostics
//   settings      - load-settings, save-settings
//   installCheck  - check-game-installed, check-persistent-issues
//
// Anything still inline in app/main.js (launch-game, activate-game,
// get-current-pcid, backup-pcid) is intentionally left there: launch-game
// is already a 3-line wrapper, and the activation/PCID handlers are
// reserved for Phase 8 which the user explicitly deferred to the very end.

const { registerAppInfoIpc } = require("./appInfo");
const { registerSystemInfoIpc } = require("./systemInfo");
const { registerDiagnosticsIpc } = require("./diagnostics");
const { registerSettingsIpc } = require("./settings");
const { registerInstallCheckIpc } = require("./installCheck");

function registerMiscIpc(deps) {
  registerAppInfoIpc(deps);
  registerSystemInfoIpc(deps);
  registerDiagnosticsIpc(deps);
  registerSettingsIpc(deps);
  registerInstallCheckIpc(deps);
}

module.exports = {
  registerMiscIpc,
  registerAppInfoIpc,
  registerSystemInfoIpc,
  registerDiagnosticsIpc,
  registerSettingsIpc,
  registerInstallCheckIpc,
};
