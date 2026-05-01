# Changelog

All notable changes to the Shadowrun Launcher will be documented in this file.

## [0.9.112] - 2026-04-30

### Added

- **Live player counter** - Shows how many players are in-game in the community (may not be fully accurate as the community hasn't fully migrated yet).
- **Background volume control** - Diagnostics includes a slider to adjust launcher background music volume; the setting is remembered for next launch.

### Changed

- **Default background volume** - Starting background music level is **half** of the previous default (50% lower) so the UI is less loud on new installs.

### Removed

- **Common Error Fixes** (Diagnostics) - Removed the License Manager / Xbox Networking / SFC quick-fix actions and related IPC; service checks still appear in diagnostics, with manual steps when something is stopped.
- **GPU Checker** (Diagnostics) - Removed the separate "detected graphics hardware" panel from the diagnostics screen (full diagnostics still report GPU in the main results).

## [0.9.109] - 2026-04-27

### Added

- **AntHill LIVE (AHL) server toggle** - Diagnostics includes a Server Configuration switch: leave it off for Microsoft's original GFWL endpoints, or turn it on for AntHill LIVE. Missing AHL patcher files are downloaded and extracted automatically when needed (`AHL Files.zip` from releases).

### Improved

- **Main process structure** - Refactored the large `main.js` into smaller, purpose-built modules (window, downloads, game, diagnostics, updater, activation, logging, and more) so the launcher is easier to maintain and review. User-facing behavior is intended to stay the same.
- **Logging** - Main process uses a single `safeLog` pipeline (electron-log); logs are written to `%APPDATA%\Shadowrun FPS Launcher\logs\main.log` (rotates to `main.old.log` at 1 MB) for support and debugging.
- **Activation & support code** - Game activation, PCID tools, and .NET 6 / helper logic now live in dedicated files; the flow and steps were not redesigned, only relocated.

## [0.9.100] - 2025-12-31

### Added

- **Update Error Notifications** - Comprehensive error messages for download failures with specific error type detection (network, timeout, server errors, etc.)
- **Download Timeout Detection** - Automatic detection of stalled downloads with 3-minute timeout and user notification
- **Update Retry Functionality** - One-click retry button for failed downloads without needing to re-check for updates
- **Installation Failure Detection** - Automatic detection of failed update installations on app restart with detailed error messages
- **Manual Download Fallback** - Direct download link option when auto-update fails, opens installer in browser

### Improved

- **Update Error Handling** - Enhanced error classification and user-friendly error messages with troubleshooting guidance
- **Update Download Reliability** - Progress tracking prevents silent failures and provides clear feedback during downloads
- **Update Installation Verification** - Automatic verification of successful installations on app restart with success confirmation
- **Update User Experience** - Improved error dialogs with retry, manual download, and close options for better user control

## [0.9.93] - 2025-12-24

### Added

- **Find Existing Location** - Manually select existing game files if located in a different location

### Improved

- **Game Path Persistence** - Selected game folder is now remembered across sessions and window focus changes
- **Folder Name Independence** - Launcher works with any folder name as long as Shadowrun.exe is present
- **Dynamic Mod Status Updates** - Mod statuses (Skip Intro, DXVK, FPS, srs_shadowrun.dll) automatically update after selecting game location
- **Window Focus Re-checking** - Launcher automatically detects when game files are moved or renamed while launcher is running

## [0.9.92] - 2025-12-20

### Added

- **Change Game Location** - Move game files to a different location after initial download
- **GPU Driver Update Detection** - Automatically detects GPU vendor and opens appropriate software
- **System File Checker (SFC) with UAC** - Run Windows SFC scan with UAC elevation
- **Launcher Visibility Management** - Launcher automatically hides when game launches

### Improved

- **Game File Move Operations**
- **UI/UX Enhancements**

## [0.9.8] - 2025-12-15

### Added

- Changelog Modal & History
- DXVK Support toggle for better compatibility
- srs_shadowrun.dll version switcher (newer/older)
- System diagnostics and troubleshooting tools
- Automatic updates

### Improved

- Game activation with auto-injection
- File download progress tracking
