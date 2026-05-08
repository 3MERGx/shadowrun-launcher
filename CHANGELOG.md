# Changelog

All notable changes to the Shadowrun Launcher will be documented in this file.

Each version uses **Added**, **Improved**, **Tweaks**, **Changed**, **Fixed**, and **Removed** sections as needed. Under each section, every `-` line is one discrete change.

## [0.9.114] - 2026-05-08

### Improved

- Diagnostics no longer surface License Manager Service or Xbox Live Networking Service as status rows or detected issues.
- The live player count now refreshes automatically while the launcher stays open.
- Install checks recognize Microsoft Visual C++ v14 Redistributable (x86) build `14.50.35719`.

### Changed

- Default location for new game downloads/installs is `%USERPROFILE%\Games\Shadowrun` instead of under Program Files, so extraction stays user-writable without relying on Program Files ACLs or UAC.

### Fixed

- Skip Intro (Uninstall Mod) in Settings stays in sync with the game folder after moving files or when the game is found but a system dependency still reports missing.

## [0.9.112] - 2026-04-30

### Added

- Live player counter (in-game community count; accuracy may vary while migration is ongoing).
- Diagnostics slider for launcher background music volume with the value remembered for next launch.

### Changed

- Default background music level for new installs is half of the previous default (quieter first launch).

### Removed

- Diagnostics “Common Error Fixes” (License Manager / Xbox Networking / SFC quick actions and related IPC); service rows remain with manual guidance where relevant.
- Separate Diagnostics “GPU Checker” panel (GPU still appears in full diagnostics).

## [0.9.109] - 2026-04-27

### Added

- AntHill LIVE (AHL) server toggle in Diagnostics: leave off for Microsoft GFWL endpoints or enable for AntHill LIVE; missing AHL files download automatically from releases when needed.

### Improved

- Main process refactored into smaller modules (window, downloads, game, diagnostics, updater, activation, logging, etc.) without intended behavior changes.
- Logging consolidated to `safeLog` / `%APPDATA%\Shadowrun FPS Launcher\logs\main.log` (rotate at 1 MB).
- Activation, PCID, and .NET helper code moved into dedicated files (flows unchanged).

## [0.9.100] - 2025-12-31

### Added

- Richer update error notifications (network, timeout, server, etc.).
- Stalled-download detection with ~3-minute timeout and user notification.
- One-click retry for failed downloads without re-checking for updates.
- Restart-time detection of failed installs with clearer messaging.
- Manual installer download when auto-update cannot finish.

### Improved

- Clearer error classification and troubleshooting text.
- More reliable download progress feedback.
- Post-install verification on restart.
- Error dialogs with retry, manual download, and dismiss options.

## [0.9.93] - 2025-12-24

### Added

- Browse for an existing game installation when files live outside default paths.

### Improved

- Saved game folder persists across sessions and focus changes.
- Any folder name works when it contains `Shadowrun.exe`.
- Mod statuses (Skip Intro, DXVK, FPS, srs_shadowrun.dll) refresh after changing location.
- Launcher re-checks when files move or rename while it is open.

## [0.9.92] - 2025-12-20

### Added

- Move game files after install.
- GPU vendor detection with links to vendor updaters.
- Run Windows SFC elevated via Diagnostics.
- Launcher hides while the game runs.

### Improved

- Game move workflow, UI polish, and related reliability.

## [0.9.8] - 2025-12-15

### Added

- In-app changelog and history.
- DXVK toggle for compatibility.
- srs_shadowrun.dll version switcher.
- Diagnostics and troubleshooting tools.
- Automatic launcher updates.

### Improved

- Game activation path.
- Download progress feedback.
