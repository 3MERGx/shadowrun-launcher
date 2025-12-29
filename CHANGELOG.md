# Changelog

All notable changes to the Shadowrun Launcher will be documented in this file.

## [0.9.94] - 2025-12-29

### Added

- **FAQ Section** - Comprehensive FAQ section with search, accordion-style questions, and quick actions
- **FAQ Content** - Added 10 common troubleshooting FAQs including Direct3D errors, compatibility warnings, and connection issues
- **AMD GPU Warning** - Warning note that FPS limiting may not work on AMD GPUs

### Improved

- **System Requirements Check** - Network connectivity check no longer blocks game launch (game can run offline)

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
