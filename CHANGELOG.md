# Changelog

All notable changes to the Shadowrun Launcher will be documented in this file.

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
