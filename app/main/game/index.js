// Aggregator for all `app/main/game/*` modules.
//
// Re-exports the public surface from every game-related module so that
// callers (currently `app/main.js`) can do a single
// `require("./main/game")` and pull whatever they need.
//
// Phase 7c: this aggregator was added when location.js completed the
// `app/main/game/` directory. It exists purely for ergonomic imports — the
// individual files below remain the source of truth and can also be
// imported directly when desired (e.g. inside other game/* files to avoid
// a circular self-import).

module.exports = {
  // install.js — finding an existing Shadowrun install on disk
  ...require("./install"),

  // launch.js — game launch orchestration + DXVK env var bag
  ...require("./launch"),

  // dxvk.js — DXVK d3d9 wrapper toggle + dxvk.conf FPS limit
  ...require("./dxvk"),

  // skipIntro.js — NoIntroFix mod toggle + status checks
  ...require("./skipIntro"),

  // srsDll.js — switching newer/older srs_shadowrun.dll variants
  ...require("./srsDll"),

  // location.js — install dir discovery, change, move (incl. UAC), clear,
  // and "browse for existing" workflows + setDefaultGameConfig +
  // isGamePathInProtectedDirectory
  ...require("./location"),
};
