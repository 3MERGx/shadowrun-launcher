; Shadowrun FPS Launcher - Custom NSIS Installer Script
; Simple customization for shortcuts
;
; Do NOT !include MUI2.nsh here — electron-builder's generated NSIS script loads
; Modern UI first and passes MUI_HEADERIMAGE_BITMAP / MUI_WELCOMEFINISHPAGE_BITMAP
; from package.json installerHeader/installerSidebar. A duplicate MUI include can
; reorder or clash with those defines (black header / blank sidebar).

!include "FileFunc.nsh"
!include "x64.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Insert GetParent function
!insertmacro GetParent

; Override MENU_FILENAME to use "Shadowrun" instead of publisher name
; This ensures Start Menu folder is "Shadowrun" not "Sinful Hollowz"
!ifndef MENU_FILENAME
    !define MENU_FILENAME "Shadowrun"
!else
    !undef MENU_FILENAME
    !define MENU_FILENAME "Shadowrun"
!endif

; Log file for debugging installer issues
Var LogFile

; Do NOT redefine MUI_* bitmap paths here — see package.json nsis.installerHeader /
; installerSidebar (copied to build/installerHeader.bmp + installerSidebar.bmp by prebuild).

; Custom options page MUST use MUI_PAGE_CUSTOM inside !macro customInstallPage only.
; A raw top-level "Page custom" breaks the Modern UI wizard chrome (header/sidebar BMPs).

; .NET 6.0 Desktop Runtime x86 (32-bit) download URL
!define DOTNET6_DOWNLOAD_URL "https://download.visualstudio.microsoft.com/download/pr/bf0c50ea-2394-40af-a5a7-6cee0cef5572/31d359c30ff370525e06e43f92ab26aa/windowsdesktop-runtime-6.0.36-win-x86.exe"
!define DOTNET6_INSTALLER_NAME "windowsdesktop-runtime-6.0.36-win-x86.exe"

; Variables for installer options page
Var Dialog
Var DesktopShortcut
Var StartMenuShortcut
Var AutoScanCheckbox
Var MenuFolderName  ; Custom menu folder name (overrides MENU_FILENAME)

; Note: Cannot use .onInit here as electron-builder already defines it
; Variables will be initialized in customInit macro or when first used

; Custom page for installer options (shortcuts and privacy settings)
; This function creates the UI
Function CustomSettingsPageCreate
    DetailPrint "============================================"
    DetailPrint "CustomSettingsPageCreate - Page is being shown!"
    DetailPrint "============================================"
    
    nsDialogs::Create 1018
    Pop $Dialog

    ${If} $Dialog == error
        DetailPrint "ERROR: Failed to create custom page dialog!"
        Abort
    ${EndIf}
    
    DetailPrint "Custom page dialog created successfully"

    ; Title
    ${NSD_CreateLabel} 0 0 100% 12u "Choose additional installation options:"
    Pop $0

    ; Desktop shortcut checkbox
    ${NSD_CreateCheckbox} 0 20u 100% 10u "Create a &Desktop Shortcut"
    Pop $DesktopShortcut
    ${NSD_Check} $DesktopShortcut  ; Checked by default

    ; Start menu shortcut checkbox
    ${NSD_CreateCheckbox} 0 35u 100% 10u "Create a &Start Menu Shortcut"
    Pop $StartMenuShortcut
    ${NSD_Check} $StartMenuShortcut  ; Checked by default

    ; Separator line (visual spacing)
    ${NSD_CreateLabel} 0 55u 100% 1u ""
    Pop $0

    ; Privacy section label
    ${NSD_CreateLabel} 0 65u 100% 12u "Privacy Settings:"
    Pop $0

    ; Auto-scan checkbox (UNCHECKED by default for privacy)
    ${NSD_CreateCheckbox} 0 82u 100% 30u "Allow launcher to automatically search for existing game installations$\n"
    Pop $AutoScanCheckbox
    ; UNCHECKED by default - user must opt-in for privacy

    nsDialogs::Show
FunctionEnd

; This function reads the user's selections when leaving the page
Function CustomSettingsPageLeave
    Push $0
    Push $1
    Push $2
    Push $R0
    
    ; Read checkbox states - these will be used in customInstall
    ; IMPORTANT: NSD_GetState cannot write to the same variable it reads from
    ; We must use temporary variables to read the state, then copy back
    ${NSD_GetState} $DesktopShortcut $0
    ${NSD_GetState} $StartMenuShortcut $1
    ${NSD_GetState} $AutoScanCheckbox $2
    
    ; Copy the states to our variables
    StrCpy $DesktopShortcut $0
    StrCpy $StartMenuShortcut $1
    StrCpy $AutoScanCheckbox $2
    
    ; Also write to registry as backup to ensure persistence
    ; Store in HKCU so it persists across the installer session
    WriteRegStr HKCU "Software\${PRODUCT_NAME}\Installer" "DesktopShortcut" "$0"
    WriteRegStr HKCU "Software\${PRODUCT_NAME}\Installer" "StartMenuShortcut" "$1"
    WriteRegStr HKCU "Software\${PRODUCT_NAME}\Installer" "AutoScanCheckbox" "$2"
    
    ; Debug: Log the states we just read
    DetailPrint "============================================"
    DetailPrint "CustomSettingsPageLeave - Checkbox states:"
    DetailPrint "  Desktop shortcut: $DesktopShortcut (1=checked, 0=unchecked)"
    DetailPrint "  Start menu shortcut: $StartMenuShortcut (1=checked, 0=unchecked)"
    DetailPrint "  Auto-scan: $AutoScanCheckbox (1=checked, 0=unchecked)"
    DetailPrint "  Values also saved to registry for persistence"
    DetailPrint "============================================"
    
    Pop $R0
    Pop $2
    Pop $1
    Pop $0
FunctionEnd

; Electron-builder hook: Add custom page before instfiles
; IMPORTANT: This macro MUST be defined for electron-builder to insert the page
; Note: electron-builder may not call this macro - trying alternative approach
!macro customInstallPage
    ; DEBUG: This macro is being called by electron-builder
    ; This macro is called by electron-builder to insert custom pages before instfiles
    ; Add our custom options page here - this will appear after directory selection
    !echo "DEBUG: customInstallPage macro is being called!"
    !insertmacro MUI_PAGE_CUSTOM CustomSettingsPageCreate CustomSettingsPageLeave
!macroend

; Alternative: Try adding page via customHeader (called early in installer generation)
!macro customHeader
    ; Add custom page here as backup - electron-builder calls this early
    !echo "DEBUG: customHeader macro is being called!"
    ; Note: Pages should be added via customInstallPage, not customHeader
    ; But we'll test if this macro is being called
!macroend


; Macro to handle post-installation tasks
; This runs during installation and uses the checkbox values saved in CustomSettingsPageLeave
!macro customInstall
    Push $0
    Push $1
    Push $2
    
    ; Initialize log file if not already done
    StrCmp $LogFile "" 0 log_initialized
        StrCpy $LogFile "$TEMP\ShadowrunLauncher_Install.log"
        FileOpen $R0 $LogFile w
        FileWrite $R0 "=== Shadowrun FPS Launcher Installer Log ===$\r$\n"
        FileWrite $R0 "customInstall macro called$\r$\n"
        FileClose $R0
    log_initialized:
    
    ; Log that we're starting
    FileOpen $R0 $LogFile a
    FileWrite $R0 "Starting installation detection...$\r$\n"
    FileClose $R0
    
    ; Detect if this is an update (existing installation) or fresh install
    ; Check multiple indicators to be absolutely sure it's an update
    ; IMPORTANT: This detection is critical for preserving user data during updates
    ; We check settings.json FIRST because it's in APPDATA and won't be deleted by the installer
    ; This ensures we detect updates even if the executable was already removed
    StrCpy $2 0  ; 0 = fresh install, 1 = update
    
    ; Check 1: Does settings.json exist? (indicates previous installation)
    ; This is checked FIRST because it's in a persistent location (APPDATA) that won't be
    ; affected by installer file operations, making it the most reliable indicator
    StrCpy $1 "$APPDATA\${PRODUCT_NAME}\settings.json"
    IfFileExists "$1" 0 check_executable
        StrCpy $2 1
        DetailPrint "Update indicator 1: settings.json exists (previous installation detected)"
        Goto update_confirmed
    
    check_executable:
    ; Check 2: Does the executable exist in the install directory?
    IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 check_launcher_settings
        StrCpy $2 1
        DetailPrint "Update indicator 2: Executable exists in install directory"
        Goto update_confirmed
    
    check_launcher_settings:
    ; Check 3: Does launcher-settings.json exist? (another indicator of previous installation)
    StrCpy $1 "$APPDATA\${PRODUCT_NAME}\launcher-settings.json"
    IfFileExists "$1" 0 check_registry
        StrCpy $2 1
        DetailPrint "Update indicator 3: launcher-settings.json exists (previous installation detected)"
        Goto update_confirmed
    
    check_registry:
    ; Check 4: Does registry entry exist? (indicates previous installation)
    ; Check for uninstall registry key which is always created on install
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "UninstallString"
    StrCmp $0 "" check_update_marker
        StrCpy $2 1
        DetailPrint "Update indicator 4: Uninstall registry entry exists (previous installation detected)"
        Goto update_confirmed
    
    check_update_marker:
    ; Check 5: Does update marker file exist? (created by launcher before quitAndInstall)
    ; This is a backup indicator that the launcher explicitly marked this as an update
    StrCpy $1 "$APPDATA\${PRODUCT_NAME}\.update-in-progress"
    IfFileExists "$1" 0 check_done
        StrCpy $2 1
        DetailPrint "Update indicator 5: Update marker file exists (launcher-initiated update detected)"
        ; Delete the marker file after reading it (cleanup)
        Delete "$1"
        DetailPrint "  - Update marker file deleted (cleanup)"
    
    update_confirmed:
        FileOpen $R0 $LogFile a
        FileWrite $R0 "============================================$\r$\n"
        FileWrite $R0 "UPDATE DETECTED - Preserving all user data$\r$\n"
        FileWrite $R0 "Installation type variable $2 = 1 (UPDATE)$\r$\n"
        FileWrite $R0 "Settings files will be PRESERVED$\r$\n"
        FileWrite $R0 "============================================$\r$\n"
        FileClose $R0
        
        DetailPrint "============================================"
        DetailPrint "UPDATE DETECTED - Preserving all user data:"
        DetailPrint "  Installation type variable $2 = 1 (UPDATE)"
        DetailPrint "  - settings.json: PRESERVED (will NOT be deleted)"
        DetailPrint "  - launcher-settings.json: PRESERVED (will NOT be deleted or overwritten)"
        DetailPrint "  - Desktop shortcuts: PRESERVED"
        DetailPrint "  - Start menu shortcuts: PRESERVED"
        DetailPrint "  - Taskbar shortcuts: PRESERVED (Windows-managed)"
        DetailPrint "  - .NET check: SKIPPED (already installed)"
        DetailPrint "============================================"
    check_done:
        ; Log final detection result
        FileOpen $R0 $LogFile a
        FileWrite $R0 "Final installation type detection: $2 (0=fresh install, 1=update)$\r$\n"
        ${If} $2 == 0
            FileWrite $R0 "This is a FRESH INSTALL - will delete old settings and run .NET check$\r$\n"
        ${Else}
            FileWrite $R0 "This is an UPDATE - will preserve settings and skip .NET check$\r$\n"
        ${EndIf}
        FileClose $R0
        DetailPrint "Final installation type: $2 (0=fresh install, 1=update)"
    
    ; Try to read checkbox states from registry if variables are empty
    ; This handles the case where custom page was shown and values were saved
    StrCmp $DesktopShortcut "" 0 check_startmenu_reg
        ReadRegStr $DesktopShortcut HKCU "Software\${PRODUCT_NAME}\Installer" "DesktopShortcut"
        DetailPrint "Read DesktopShortcut from registry: '$DesktopShortcut'"
    check_startmenu_reg:
    StrCmp $StartMenuShortcut "" 0 check_autoscan_reg
        ReadRegStr $StartMenuShortcut HKCU "Software\${PRODUCT_NAME}\Installer" "StartMenuShortcut"
        DetailPrint "Read StartMenuShortcut from registry: '$StartMenuShortcut'"
    check_autoscan_reg:
    StrCmp $AutoScanCheckbox "" 0 vars_ready
        ReadRegStr $AutoScanCheckbox HKCU "Software\${PRODUCT_NAME}\Installer" "AutoScanCheckbox"
        StrCmp $AutoScanCheckbox "" 0 vars_ready
            ; Default to 0 (unchecked) if not found
            StrCpy $AutoScanCheckbox "0"
            DetailPrint "AutoScanCheckbox not found, using default (0=disabled)"
    vars_ready:
    
    ; Debug: Log checkbox states and system paths
    DetailPrint "============================================"
    DetailPrint "Custom Install - STARTING"
    DetailPrint "Installation type: $2 (0=fresh, 1=update)"
    DetailPrint "Desktop shortcut state: '$DesktopShortcut' (1=checked, 0=unchecked)"
    DetailPrint "Start menu shortcut state: '$StartMenuShortcut' (1=checked, 0=unchecked)"
    DetailPrint "Auto-scan state: '$AutoScanCheckbox' (1=checked, 0=unchecked)"
    DetailPrint "System paths:"
    DetailPrint "  INSTDIR: $INSTDIR"
    DetailPrint "  DESKTOP: $DESKTOP"
    DetailPrint "  SMPROGRAMS: $SMPROGRAMS"
    DetailPrint "============================================"
    
    ; Log to file
    FileOpen $R0 $LogFile a
    FileWrite $R0 "===========================================$\r$\n"
    FileWrite $R0 "Custom Install - STARTING$\r$\n"
    FileWrite $R0 "Installation type: $2 (0=fresh, 1=update)$\r$\n"
    FileWrite $R0 "Desktop shortcut state: '$DesktopShortcut'$\r$\n"
    FileWrite $R0 "Start menu shortcut state: '$StartMenuShortcut'$\r$\n"
    FileWrite $R0 "Auto-scan state: '$AutoScanCheckbox'$\r$\n"
    FileWrite $R0 "INSTDIR: $INSTDIR$\r$\n"
    FileWrite $R0 "DESKTOP: $DESKTOP$\r$\n"
    FileWrite $R0 "SMPROGRAMS: $SMPROGRAMS$\r$\n"
    FileWrite $R0 "===========================================$\r$\n"
    FileWrite $R0 "Checking installation type: $2$\r$\n"
    FileClose $R0
    
    ; ============================================
    ; SHORTCUT PRESERVATION LOGIC FOR UPDATES
    ; ============================================
    ; When updating, we need to preserve user's shortcut preferences:
    ;
    ; Priority (in order):
    ; 1) Registry values (if custom page was shown - user made explicit choice)
    ; 2) Detect existing shortcuts (silent update - preserve what user had)
    ; 3) Use defaults (fresh install - create shortcuts by default)
    ;
    ; This ensures:
    ; - Silent updates (autoUpdater) preserve user's shortcut state
    ; - If user deleted a shortcut, it won't be recreated on update
    ; - If user kept a shortcut, it gets updated with new path/icon
    ; - Taskbar pins are automatically updated by Windows
    ; ============================================
    ${If} $2 == 0
        ; FRESH INSTALL - Use checkbox values from registry or defaults
        FileOpen $R0 $LogFile a
        FileWrite $R0 "FRESH INSTALL detected - will use checkbox values or defaults$\r$\n"
        FileClose $R0
        DetailPrint "Fresh install - using installer preferences..."
        
        ; Set defaults if not already set by registry (custom page)
        StrCmp $DesktopShortcut "" 0 check_startmenu_fresh
            StrCpy $DesktopShortcut "1"
            DetailPrint "Using default: Desktop shortcut enabled"
        check_startmenu_fresh:
        StrCmp $StartMenuShortcut "" 0 fresh_ready
            StrCpy $StartMenuShortcut "1"
            DetailPrint "Using default: Start menu shortcut enabled"
        fresh_ready:
    ${Else}
        ; UPDATE - Check if custom page was shown (registry values set)
        FileOpen $R0 $LogFile a
        FileWrite $R0 "UPDATE detected - checking shortcut preferences$\r$\n"
        FileClose $R0
        DetailPrint "Update detected - determining shortcut preferences..."
        
        ; ONLY detect existing shortcuts if registry values are empty (silent update)
        StrCmp $DesktopShortcut "" 0 check_startmenu_update_registry
            ; Desktop shortcut not set by custom page - detect existing
            DetailPrint "Silent update: Detecting existing desktop shortcut..."
            IfFileExists "$DESKTOP\${SHORTCUT_NAME}.lnk" desktop_exists desktop_not_exists
            desktop_exists:
                StrCpy $DesktopShortcut "1"
                DetailPrint "Desktop shortcut found - will recreate with updated path/icon"
                FileOpen $R0 $LogFile a
                FileWrite $R0 "Desktop shortcut EXISTS - will recreate$\r$\n"
                FileClose $R0
                Goto check_startmenu_update_registry
            desktop_not_exists:
                StrCpy $DesktopShortcut "0"
                DetailPrint "Desktop shortcut not found - will not create (respecting user preference)"
                FileOpen $R0 $LogFile a
                FileWrite $R0 "Desktop shortcut DOES NOT EXIST - will not create$\r$\n"
                FileClose $R0
        
        check_startmenu_update_registry:
        StrCmp $StartMenuShortcut "" 0 update_ready
            ; Start menu shortcut not set by custom page - detect existing
            DetailPrint "Silent update: Detecting existing start menu shortcut..."
            ; Check both old location (MENU_FILENAME) and new location (MenuFolderName)
            IfFileExists "$SMPROGRAMS\$MenuFolderName\${SHORTCUT_NAME}.lnk" startmenu_exists check_old_location
            check_old_location:
            IfFileExists "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" startmenu_exists startmenu_not_exists
            startmenu_exists:
                StrCpy $StartMenuShortcut "1"
                DetailPrint "Start menu shortcut found - will recreate with updated path/icon"
                FileOpen $R0 $LogFile a
                FileWrite $R0 "Start menu shortcut EXISTS - will recreate$\r$\n"
                FileClose $R0
                Goto update_ready
            startmenu_not_exists:
                StrCpy $StartMenuShortcut "0"
                DetailPrint "Start menu shortcut not found - will not create (respecting user preference)"
                FileOpen $R0 $LogFile a
                FileWrite $R0 "Start menu shortcut DOES NOT EXIST - will not create$\r$\n"
                FileClose $R0
        update_ready:
    ${EndIf}
    
    ; Now delete existing shortcuts (if any) before recreating them
    ; We'll only recreate the ones that existed (or that user selected in fresh install)
    DetailPrint "Cleaning up old shortcuts before recreation..."
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ; Delete both old location (if exists) and new location
    RMDir /r "$SMPROGRAMS\$MenuFolderName"
    RMDir /r "$SMPROGRAMS\${MENU_FILENAME}"
    
    ; ALWAYS CREATE SHORTCUTS IF USER SELECTED THEM (regardless of install type)
    FileOpen $R0 $LogFile a
    FileWrite $R0 "Now creating shortcuts (if selected)...$\r$\n"
    FileWrite $R0 "DesktopShortcut='$DesktopShortcut', StartMenuShortcut='$StartMenuShortcut'$\r$\n"
    FileClose $R0
    
    ; Create desktop shortcut if checkbox was checked (default is checked = "1")
    DetailPrint "============================================"
    DetailPrint "DESKTOP SHORTCUT CREATION STARTING"
    DetailPrint "  Variable DesktopShortcut value: '$DesktopShortcut'"
    DetailPrint "  Desktop path: $DESKTOP"
    DetailPrint "  Install dir: $INSTDIR"
    DetailPrint "  Shortcut name: ${SHORTCUT_NAME}.lnk"
    DetailPrint "  Target: ${APP_EXECUTABLE_FILENAME}"
    DetailPrint "============================================"
    
    ; Log to file
    FileOpen $R0 $LogFile a
    FileWrite $R0 "--- DESKTOP SHORTCUT CREATION ---$\r$\n"
    FileWrite $R0 "Variable='$DesktopShortcut'$\r$\n"
    FileWrite $R0 "Desktop='$DESKTOP'$\r$\n"
    FileWrite $R0 "Target='$INSTDIR\${APP_EXECUTABLE_FILENAME}'$\r$\n"
    FileWrite $R0 "Shortcut path='$DESKTOP\${SHORTCUT_NAME}.lnk'$\r$\n"
    
    ; Create shortcut if NOT explicitly set to "0" (unchecked)
    StrCmp $DesktopShortcut "0" desktop_skip_shortcut desktop_create_shortcut
    desktop_create_shortcut:
        ; Validate that target executable exists before creating shortcut
        IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 desktop_target_missing
        ; Validate that desktop path is accessible
        IfFileExists "$DESKTOP" 0 desktop_path_invalid
        
        FileWrite $R0 "Creating desktop shortcut...$\r$\n"
        DetailPrint "  CREATING DESKTOP SHORTCUT NOW..."
        DetailPrint "  Full path will be: $DESKTOP\${SHORTCUT_NAME}.lnk"
        DetailPrint "  Full target will be: $INSTDIR\${APP_EXECUTABLE_FILENAME}"
        SetOutPath "$INSTDIR"
        ; Create shortcut with explicit icon to ensure icon is always correct
        ; The executable contains the icon, so we reference it directly
        CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 SW_SHOWNORMAL "" "Launch Shadowrun FPS Launcher"
        IfErrors 0 desktop_check_success
            FileWrite $R0 "ERROR: CreateShortCut returned an error!$\r$\n"
            DetailPrint "  ERROR: CreateShortCut returned an error!"
            FileClose $R0
            Goto desktop_done
        desktop_target_missing:
            FileWrite $R0 "ERROR: Target executable not found: $INSTDIR\${APP_EXECUTABLE_FILENAME}$\r$\n"
            DetailPrint "  ERROR: Target executable not found at $INSTDIR\${APP_EXECUTABLE_FILENAME}"
            DetailPrint "  Skipping desktop shortcut creation"
            FileClose $R0
            Goto desktop_done
        desktop_path_invalid:
            FileWrite $R0 "ERROR: Desktop path is not accessible: $DESKTOP$\r$\n"
            DetailPrint "  ERROR: Desktop path is not accessible: $DESKTOP"
            DetailPrint "  Skipping desktop shortcut creation"
            FileClose $R0
            Goto desktop_done
        desktop_check_success:
        ClearErrors
        IfFileExists "$DESKTOP\${SHORTCUT_NAME}.lnk" 0 desktop_not_found
            FileWrite $R0 "SUCCESS: Desktop shortcut created and verified!$\r$\n"
            DetailPrint "  SUCCESS: Desktop shortcut verified at $DESKTOP\${SHORTCUT_NAME}.lnk"
            FileClose $R0
            Goto desktop_done
        desktop_not_found:
            FileWrite $R0 "ERROR: Shortcut file not found after creation!$\r$\n"
            DetailPrint "  ERROR: Shortcut file not found after creation!"
            FileClose $R0
        desktop_done:
        Goto desktop_end
    desktop_skip_shortcut:
        FileWrite $R0 "SKIPPED: Variable was '0' (user unchecked)$\r$\n"
        DetailPrint "  Desktop shortcut SKIPPED (variable was '0' - user unchecked)"
        FileClose $R0
    desktop_end:
    DetailPrint "============================================"

    ; Create start menu shortcut if checkbox was checked (default is checked = "1")
    DetailPrint "============================================"
    DetailPrint "START MENU SHORTCUT CREATION STARTING"
    DetailPrint "  Variable StartMenuShortcut value: '$StartMenuShortcut'"
    DetailPrint "  Start menu path: $SMPROGRAMS"
    DetailPrint "  Menu folder: $MenuFolderName (custom override)"
    DetailPrint "============================================"
    
    ; Log to file
    FileOpen $R0 $LogFile a
    FileWrite $R0 "--- START MENU SHORTCUT CREATION ---$\r$\n"
    FileWrite $R0 "Variable='$StartMenuShortcut'$\r$\n"
    FileWrite $R0 "Menu folder='$SMPROGRAMS\$MenuFolderName'$\r$\n"
    FileWrite $R0 "Target='$INSTDIR\${APP_EXECUTABLE_FILENAME}'$\r$\n"
    
    ; Create shortcut if NOT explicitly set to "0" (unchecked)
    StrCmp $StartMenuShortcut "0" startmenu_skip_shortcut startmenu_create_shortcut
    startmenu_create_shortcut:
        ; Validate that target executable exists before creating shortcut
        IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 startmenu_target_missing
        ; Validate that start menu path is accessible
        IfFileExists "$SMPROGRAMS" 0 startmenu_path_invalid
        
        FileWrite $R0 "Creating start menu shortcut...$\r$\n"
        DetailPrint "  CREATING START MENU SHORTCUT NOW..."
        CreateDirectory "$SMPROGRAMS\$MenuFolderName"
        SetOutPath "$INSTDIR"
        ; Create shortcut with explicit icon to ensure icon is always correct
        ; The executable contains the icon, so we reference it directly
        CreateShortCut "$SMPROGRAMS\$MenuFolderName\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 SW_SHOWNORMAL "" "Launch Shadowrun FPS Launcher"
        IfErrors 0 startmenu_check_success
            FileWrite $R0 "ERROR: CreateShortCut returned an error!$\r$\n"
            DetailPrint "  ERROR: CreateShortCut returned an error!"
            FileClose $R0
            Goto startmenu_done
        startmenu_target_missing:
            FileWrite $R0 "ERROR: Target executable not found: $INSTDIR\${APP_EXECUTABLE_FILENAME}$\r$\n"
            DetailPrint "  ERROR: Target executable not found at $INSTDIR\${APP_EXECUTABLE_FILENAME}"
            DetailPrint "  Skipping start menu shortcut creation"
            FileClose $R0
            Goto startmenu_done
        startmenu_path_invalid:
            FileWrite $R0 "ERROR: Start menu path is not accessible: $SMPROGRAMS$\r$\n"
            DetailPrint "  ERROR: Start menu path is not accessible: $SMPROGRAMS"
            DetailPrint "  Skipping start menu shortcut creation"
            FileClose $R0
            Goto startmenu_done
        startmenu_check_success:
        ClearErrors
        IfFileExists "$SMPROGRAMS\$MenuFolderName\${SHORTCUT_NAME}.lnk" 0 startmenu_not_found
            FileWrite $R0 "SUCCESS: Start menu shortcut created and verified!$\r$\n"
            DetailPrint "  SUCCESS: Start menu shortcut verified at $SMPROGRAMS\$MenuFolderName\${SHORTCUT_NAME}.lnk"
            FileClose $R0
            Goto startmenu_done
        startmenu_not_found:
            FileWrite $R0 "ERROR: Shortcut file not found after creation!$\r$\n"
            DetailPrint "  ERROR: Shortcut file not found after creation!"
            FileClose $R0
        startmenu_done:
        Goto startmenu_end
    startmenu_skip_shortcut:
        FileWrite $R0 "SKIPPED: Variable was '0' (user unchecked)$\r$\n"
        DetailPrint "  Start menu shortcut SKIPPED (variable was '0' - user unchecked)"
        FileClose $R0
    startmenu_end:
    DetailPrint "============================================"

    ; IMPORTANT: Delete any old installer-prefs.json from previous installations
    ; This prevents old settings from being used
    DetailPrint "Updating installer preferences..."
    Delete "$INSTDIR\installer-prefs.json"
    
    ; IMPORTANT: Delete settings files on FRESH INSTALLS/RE-INSTALLS only
    ; Always delete on fresh installs (when $2 == 0) to ensure clean start
    ; CRITICAL: $2 must be 1 for updates, 0 for fresh installs
    ; DOUBLE-CHECK: Log and verify $2 value before ANY settings operations
    FileOpen $R0 $LogFile a
    FileWrite $R0 "============================================$\r$\n"
    FileWrite $R0 "SETTINGS CLEANUP CHECK$\r$\n"
    FileWrite $R0 "Installation type variable $2: '$2'$\r$\n"
    FileWrite $R0 "If $2 == 0: Delete settings (fresh install)$\r$\n"
    FileWrite $R0 "If $2 == 1: Preserve settings (update)$\r$\n"
    FileWrite $R0 "============================================$\r$\n"
    FileClose $R0
    
    DetailPrint "============================================"
    DetailPrint "SETTINGS CLEANUP CHECK"
    DetailPrint "Installation type before settings cleanup: $2 (0=fresh, 1=update)"
    DetailPrint "============================================"
    
    ${If} $2 == 0
        ; Custom page was shown - this is a manual install/re-install
        ; Delete existing settings files to ensure fresh start with installer choices
        DetailPrint "============================================"
        DetailPrint "MANUAL INSTALL/RE-INSTALL - Cleaning old settings:"
        DetailPrint "Custom page was shown - starting fresh with installer choices"
        DetailPrint "============================================"
        
        ; Delete settings.json
        StrCpy $1 "$APPDATA\${PRODUCT_NAME}\settings.json"
        IfFileExists "$1" 0 check_launcher_settings_cleanup
            DetailPrint "Deleting existing settings.json for fresh start..."
            Delete "$1"
            DetailPrint "  - settings.json deleted"
        check_launcher_settings_cleanup:
        ; Delete launcher-settings.json
        StrCpy $1 "$APPDATA\${PRODUCT_NAME}\launcher-settings.json"
        IfFileExists "$1" 0 settings_cleanup_done
            DetailPrint "Deleting existing launcher-settings.json for fresh start..."
            Delete "$1"
            DetailPrint "  - launcher-settings.json deleted"
        settings_cleanup_done:
            DetailPrint "Settings cleanup complete - fresh start with installer choices"
            DetailPrint "============================================"
    ${Else}
        ; Update - PRESERVE ALL settings files (critical - never delete during updates)
        DetailPrint "============================================"
        DetailPrint "UPDATE DETECTED - Preserving all user data:"
        DetailPrint "  Installation type: $2 = 1 (UPDATE confirmed)"
        DetailPrint "  - settings.json: PRESERVED (NOT deleting)"
        DetailPrint "  - launcher-settings.json: PRESERVED (NOT deleting or overwriting)"
        DetailPrint "  - Desktop shortcuts: PRESERVED"
        DetailPrint "  - Start menu shortcuts: PRESERVED"
        DetailPrint "  - Taskbar shortcuts: PRESERVED (Windows-managed)"
        DetailPrint "============================================"
        ; Explicitly do NOT delete any settings files during updates
        ; Do NOT call SaveInstallerPreferences - it would overwrite launcher-settings.json
    ${EndIf}

    ; Save installer preferences ONLY on fresh installs (not updates)
    ; On updates, we preserve the existing launcher-settings.json
    ; DOUBLE-CHECK: Verify $2 value before calling SaveInstallerPreferences
    FileOpen $R0 $LogFile a
    FileWrite $R0 "============================================$\r$\n"
    FileWrite $R0 "SAVEINSTALLERPREFERENCES CHECK$\r$\n"
    FileWrite $R0 "Installation type variable $2: '$2'$\r$\n"
    FileWrite $R0 "If $2 == 0: Call SaveInstallerPreferences (fresh install)$\r$\n"
    FileWrite $R0 "If $2 == 1: Skip SaveInstallerPreferences (update)$\r$\n"
    FileWrite $R0 "============================================$\r$\n"
    FileClose $R0
    
    DetailPrint "============================================"
    DetailPrint "SAVEINSTALLERPREFERENCES CHECK"
    DetailPrint "Installation type before SaveInstallerPreferences: $2 (0=fresh, 1=update)"
    DetailPrint "============================================"
    
    ${If} $2 == 0
        ; Fresh install - save installer preferences
        DetailPrint "Saving installer preferences to launcher-settings.json and installer-prefs.json..."
        Call SaveInstallerPreferences
        
        ; Check and install .NET 6.0 Desktop Runtime x86 if needed (fresh installs only)
        DetailPrint "Fresh install - checking for .NET 6.0 Desktop Runtime..."
        Call CheckDotNet6x86
        Pop $0
        ${If} $0 == "0"
            ; .NET 6.0 not installed, prompt user
            MessageBox MB_YESNO|MB_ICONINFORMATION "Shadowrun FPS Launcher requires .NET 6.0 Desktop Runtime (x86).$\n$\nWould you like to download and install it now?$\n$\n(Recommended - Required for automatic game activation)" IDYES install_dotnet IDNO skip_dotnet
            install_dotnet:
                Call InstallDotNet6x86
                Goto dotnet_done
            skip_dotnet:
                MessageBox MB_OK|MB_ICONEXCLAMATION "Warning: The Game Activation process requires .NET 6.0 Desktop Runtime.$\n$\nWithout it, you'll need to manually enter the product key in GFWL.$\n$\nYou can install it later from:$\nhttps://dotnet.microsoft.com/download/dotnet/6.0"
            dotnet_done:
        ${Else}
            DetailPrint ".NET 6.0 Desktop Runtime already installed - skipping"
        ${EndIf}
    ${Else}
        ; Update - preserve existing launcher-settings.json, do NOT overwrite it
        DetailPrint "UPDATE: Preserving existing launcher-settings.json (not overwriting)"
        DetailPrint "UPDATE: Skipping .NET check (already installed during initial setup)"
    ${EndIf}
    
    ; Close log file and show location
    FileOpen $R0 $LogFile a
    FileWrite $R0 "=== Installation completed ===$\r$\n"
    FileWrite $R0 "Log file location: $LogFile$\r$\n"
    FileClose $R0
    
    ; Show message box with log location (only on fresh installs to avoid annoying updates)
    ${If} $2 == 0
        MessageBox MB_OK|MB_ICONINFORMATION "Installation log saved to:$\n$\n$LogFile$\n$\nYou can open this file to see detailed installation information."
    ${EndIf}
    
    Pop $2
    Pop $1
    Pop $0
!macroend

; Function to save installer preferences to both installer-prefs.json and launcher-settings.json
Function SaveInstallerPreferences
    Push $0
    Push $1
    Push $2
    Push $3
    
    ; Determine boolean values for JSON
    ${If} $AutoScanCheckbox == 1
        StrCpy $0 "true"
    ${Else}
        StrCpy $0 "false"
    ${EndIf}
    
    ${If} $DesktopShortcut == 1
        StrCpy $1 "true"
    ${Else}
        StrCpy $1 "false"
    ${EndIf}
    
    ${If} $StartMenuShortcut == 1
        StrCpy $2 "true"
    ${Else}
        StrCpy $2 "false"
    ${EndIf}
    
    ; Save to installer-prefs.json (in installation directory)
    ; Build JSON string manually
    StrCpy $3 '{$\r$\n  "autoScanEnabled": '
    StrCpy $3 "$3$0"
    StrCpy $3 "$3,$\r$\n  $\"desktopShortcut$\": "
    StrCpy $3 "$3$1"
    StrCpy $3 "$3,$\r$\n  $\"startMenuShortcut$\": "
    StrCpy $3 "$3$2"
    StrCpy $3 "$3$\r$\n}"
    
    FileOpen $R0 "$INSTDIR\installer-prefs.json" w
    FileWrite $R0 $3
    FileClose $R0
    DetailPrint "Saved installer preferences to installer-prefs.json"
    DetailPrint "  - autoScanEnabled: $0"
    DetailPrint "  - desktopShortcut: $1"
    DetailPrint "  - startMenuShortcut: $2"
    
    ; Also save to launcher-settings.json (in userData directory for easy access)
    ; NOTE: This function is ONLY called on fresh installs (not updates)
    ; On updates, the existing launcher-settings.json is preserved
    ; Create directory if it doesn't exist
    CreateDirectory "$APPDATA\${PRODUCT_NAME}"
    FileOpen $R0 "$APPDATA\${PRODUCT_NAME}\launcher-settings.json" w
    FileWrite $R0 $3
    FileClose $R0
    DetailPrint "Saved installer preferences to launcher-settings.json in userData (fresh install only)"
    
    Pop $3
    Pop $2
    Pop $1
    Pop $0
FunctionEnd

; Override the default install mode page to skip it
!macro customInit
    ; Force current user installation only
    SetShellVarContext current
    
    ; Set custom menu folder name to "Shadowrun" instead of publisher name
    ; We use a variable instead of overriding the define since defines are compile-time
    StrCpy $MenuFolderName "Shadowrun"
    DetailPrint "Start Menu folder set to: $MenuFolderName (overriding default)"
    
    ; Initialize checkbox variables with defaults (will be overwritten by page if shown)
    ; Desktop and Start Menu shortcuts: 1 (checked/enabled by default)
    ; Auto-scan: 0 (unchecked/disabled by default for privacy)
    StrCpy $DesktopShortcut "1"
    StrCpy $StartMenuShortcut "1"
    StrCpy $AutoScanCheckbox "0"
    DetailPrint "Initialized default checkbox states: Desktop=1, StartMenu=1, AutoScan=0"
    
    ; Set default installation directory to user's LocalAppData\Programs
    ; This ensures each user gets their own recommended path (e.g., C:\Users\Username\AppData\Local\Programs\Shadowrun FPS Launcher)
    ; Only set if INSTDIR hasn't been set yet (first time installation)
    ${If} $INSTDIR == ""
        StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
    ${EndIf}
    
    ; Automatically uninstall previous versions
    Call UninstallPreviousVersion
    
    ; NOTE: .NET check is now done in customInstall macro to allow skipping during updates
    ; This improves update speed by not re-checking dependencies that are already installed
!macroend

; Function to uninstall previous version
Function UninstallPreviousVersion
    Push $0
    Push $1
    Push $2
    
    ; Check if a previous version is installed (look for uninstaller)
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    
    ${If} $0 != ""
        DetailPrint "Found previous installation, uninstalling..."
        
        ; Extract the uninstaller path (remove quotes if present)
        ${GetParent} $0 $1
        
        ; Run the uninstaller silently
        ExecWait '"$0" /S _?=$1' $2
        
        ; Clean up any remaining files
        Delete "$0"
        RMDir "$1"
        
        DetailPrint "Previous version uninstalled"
    ${EndIf}
    
    Pop $2
    Pop $1
    Pop $0
FunctionEnd

; Function to check if .NET 6.0 Desktop Runtime x86 is installed
Function CheckDotNet6x86
    Push $0
    Push $1
    
    DetailPrint "Checking for .NET 6.0 Desktop Runtime (x86)..."
    
    ; Check for .NET 6.0 Desktop Runtime x86 in registry
    ; Path: HKLM\SOFTWARE\WOW6432Node\dotnet\Setup\InstalledVersions\x86\sharedhost (on 64-bit)
    ; Path: HKLM\SOFTWARE\dotnet\Setup\InstalledVersions\x86\sharedhost (on 32-bit)
    
    ${If} ${RunningX64}
        ; On 64-bit Windows, check WOW6432Node for x86 runtime
        ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\dotnet\Setup\InstalledVersions\x86\sharedhost" "Version"
    ${Else}
        ; On 32-bit Windows
        ReadRegStr $0 HKLM "SOFTWARE\dotnet\Setup\InstalledVersions\x86\sharedhost" "Version"
    ${EndIf}
    
    ${If} $0 == ""
        ; .NET not found, need to install
        DetailPrint ".NET 6.0 Desktop Runtime (x86) not found"
        StrCpy $1 "0"
    ${Else}
        DetailPrint ".NET 6.0 Desktop Runtime (x86) found: $0"
        StrCpy $1 "1"
    ${EndIf}
    
    Pop $0
    Exch $1
FunctionEnd

; Function to download and install .NET 6.0 Desktop Runtime x86
Function InstallDotNet6x86
    Push $0
    Push $1
    
    DetailPrint "Downloading .NET 6.0 Desktop Runtime (x86)..."
    
    ; Create temp directory for download
    InitPluginsDir
    StrCpy $0 "$PLUGINSDIR\${DOTNET6_INSTALLER_NAME}"
    
    ; Download .NET 6.0 Desktop Runtime x86
    NSISdl::download "${DOTNET6_DOWNLOAD_URL}" "$0"
    Pop $1
    
    ${If} $1 != "success"
        DetailPrint "Failed to download .NET 6.0 Runtime: $1"
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Failed to download .NET 6.0 Desktop Runtime (required).$\n$\nError: $1$\n$\nYou can download it manually from:$\nhttps://dotnet.microsoft.com/download/dotnet/6.0$\n$\nContinue installation anyway?" IDOK continue IDCANCEL abort
        abort:
            Abort
        continue:
            Pop $1
            Pop $0
            Return
    ${EndIf}
    
    DetailPrint "Installing .NET 6.0 Desktop Runtime (x86)..."
    DetailPrint "This may take a few minutes. Please wait..."
    
    ; Install silently with /install /quiet /norestart flags
    ExecWait '"$0" /install /quiet /norestart' $1
    
    ${If} $1 == 0
        DetailPrint ".NET 6.0 Desktop Runtime (x86) installed successfully"
    ${ElseIf} $1 == 1641
        DetailPrint ".NET 6.0 Desktop Runtime (x86) installed successfully (reboot required)"
    ${ElseIf} $1 == 3010
        DetailPrint ".NET 6.0 Desktop Runtime (x86) installed successfully (reboot required)"
    ${Else}
        DetailPrint ".NET 6.0 Desktop Runtime (x86) installation returned code: $1"
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION ".NET 6.0 Desktop Runtime installation completed with code: $1$\n$\nThe application may not work properly without it.$\n$\nContinue installation anyway?" IDOK continue2 IDCANCEL abort2
        abort2:
            Abort
        continue2:
    ${EndIf}
    
    ; Clean up installer
    Delete "$0"
    
    Pop $1
    Pop $0
FunctionEnd

; Function to check if launcher is running (called from uninstaller)
Function un.CheckLauncherRunning
    Push $0
    Push $1
    Push $2
    
    DetailPrint "Checking if Shadowrun FPS Launcher is running..."
    
    ; Check if process is running using Windows tasklist command
    ; Use nsExec plugin (built-in, no include needed) for silent execution
    ClearErrors
    nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq Shadowrun FPS Launcher.exe" 2>NUL | find /I "Shadowrun FPS Launcher.exe" >NUL'
    Pop $0  ; Exit code
    Pop $1  ; Output (we don't need it)
    
    ${If} $0 == 0
        ; Process is running (tasklist found it, exit code 0 means found)
        DetailPrint "Shadowrun FPS Launcher is currently running!"
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Shadowrun FPS Launcher is currently running.$\n$\nPlease close the launcher before uninstalling.$\n$\nClick OK to attempt to close it automatically, or Cancel to abort uninstallation." IDOK try_close IDCANCEL abort_uninstall
        
        try_close:
            DetailPrint "Attempting to close launcher..."
            ; Try to close the launcher using taskkill
            ; Use nsExec for silent execution (no CMD window)
            ClearErrors
            nsExec::ExecToStack 'taskkill /IM "Shadowrun FPS Launcher.exe" /F >NUL 2>&1'
            Pop $1  ; Exit code
            Pop $2  ; Output (we don't need it)
            Sleep 2000 ; Wait for process to close
            
            ; Check again if it's still running
            ; Use nsExec for silent execution (no CMD window)
            ClearErrors
            nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq Shadowrun FPS Launcher.exe" 2>NUL | find /I "Shadowrun FPS Launcher.exe" >NUL'
            Pop $0  ; Exit code
            Pop $2  ; Output (we don't need it)
            
            ${If} $0 == 0
                ; Still running after kill attempt
                DetailPrint "Unable to close launcher automatically"
                MessageBox MB_OK|MB_ICONSTOP "Unable to close Shadowrun FPS Launcher automatically.$\n$\nPlease close it manually using Task Manager and try uninstalling again."
                Pop $2
                Pop $1
                Pop $0
                Abort
            ${EndIf}
            DetailPrint "Launcher closed successfully"
            Goto continue_check
        
        abort_uninstall:
            DetailPrint "User chose to cancel uninstallation"
            Pop $2
            Pop $1
            Pop $0
            Abort
    ${EndIf}
    
    continue_check:
        DetailPrint "Launcher is not running, proceeding with uninstallation"
        Pop $2
        Pop $1
        Pop $0
FunctionEnd

; Custom uninstaller code - check if launcher is running before uninstalling
; This macro is called by electron-builder during uninstaller creation
!macro customUninstall
    Push $0
    Push $1
    
    ; Call our check function at the start of uninstall
    Call un.CheckLauncherRunning
    
    ; Check if this is an update or a full uninstall
    ; When updating, NSIS runs the uninstaller first, then the new installer
    ; We need to preserve settings during updates, but delete them on full uninstalls
    ; 
    ; Detection method: Check if new installer is waiting (_?=$INSTDIR flag)
    ; If $_OUTDIR contains the install directory, it's an update
    StrCpy $1 0  ; 0 = full uninstall (delete settings), 1 = update (preserve settings)
    
    ; Check for update marker file (created by launcher before quitAndInstall)
    StrCpy $0 "$APPDATA\${PRODUCT_NAME}\.update-in-progress"
    IfFileExists "$0" 0 check_registry_for_update
        ; Update marker exists - this is definitely an update
        StrCpy $1 1
        DetailPrint "Update marker detected - preserving settings during uninstall"
        Delete "$0"  ; Clean up marker
        Goto uninstall_decision
    
    check_registry_for_update:
    ; Check if /UPDATE flag was passed to uninstaller
    ; (electron-updater doesn't pass this by default, but we can check for other indicators)
    ; For now, we'll default to FULL UNINSTALL unless marker file exists
    ; This is safer - if user manually uninstalls, we clean up properly
    
    DetailPrint "No update marker - treating as full uninstall"
    StrCpy $1 0
    
    uninstall_decision:
    DetailPrint "============================================"
    ${If} $1 == 1
        DetailPrint "UPDATE UNINSTALL - Preserving user settings:"
        DetailPrint "  - settings.json: PRESERVED"
        DetailPrint "  - launcher-settings.json: PRESERVED"
        DetailPrint "  New version will use existing settings"
        DetailPrint "============================================"
        ; Skip settings deletion entirely
        Goto skip_settings_deletion
    ${Else}
        DetailPrint "FULL UNINSTALL - Cleaning up settings files:"
        DetailPrint "============================================"
        
        ; Delete settings.json from userData
        StrCpy $0 "$APPDATA\${PRODUCT_NAME}\settings.json"
        IfFileExists "$0" 0 check_launcher_settings_uninstall
            DetailPrint "Deleting settings.json..."
            Delete "$0"
            DetailPrint "  - settings.json deleted"
        check_launcher_settings_uninstall:
        
        ; Delete launcher-settings.json from userData
        StrCpy $0 "$APPDATA\${PRODUCT_NAME}\launcher-settings.json"
        IfFileExists "$0" 0 check_installer_prefs_uninstall
            DetailPrint "Deleting launcher-settings.json..."
            Delete "$0"
            DetailPrint "  - launcher-settings.json deleted"
        check_installer_prefs_uninstall:
        
        ; Delete installer-prefs.json from installation directory
        StrCpy $0 "$INSTDIR\installer-prefs.json"
        IfFileExists "$0" 0 check_appdata_folder_uninstall
            DetailPrint "Deleting installer-prefs.json..."
            Delete "$0"
            DetailPrint "  - installer-prefs.json deleted"
        check_appdata_folder_uninstall:
        
        ; Remove userData directory if it's empty
        StrCpy $0 "$APPDATA\${PRODUCT_NAME}"
        IfFileExists "$0" 0 cleanup_done_uninstall
            DetailPrint "Removing userData directory if empty..."
            RMDir "$0"
            DetailPrint "  - userData directory cleaned up"
        cleanup_done_uninstall:
        
        DetailPrint "Settings cleanup complete"
        DetailPrint "============================================"
    ${EndIf}
    
    skip_settings_deletion:
    
    ; ALWAYS delete shortcuts on uninstall (both update and full uninstall)
    ; Shortcuts will be recreated by new installer during update
    DetailPrint "============================================"
    DetailPrint "REMOVING SHORTCUTS"
    DetailPrint "============================================"
    
    ; Delete desktop shortcut
    StrCpy $0 "$DESKTOP\${SHORTCUT_NAME}.lnk"
    IfFileExists "$0" 0 check_start_menu_uninstall
        DetailPrint "Deleting desktop shortcut..."
        Delete "$0"
        DetailPrint "  - Desktop shortcut deleted"
    check_start_menu_uninstall:
    
    ; Delete start menu shortcuts (both old and new locations)
    ; Check for MenuFolderName location first
    StrCpy $0 "$SMPROGRAMS\$MenuFolderName"
    IfFileExists "$0" 0 check_old_menu_location
        DetailPrint "Deleting start menu folder: $MenuFolderName..."
        RMDir /r "$0"
        DetailPrint "  - Start menu folder deleted"
    check_old_menu_location:
    
    ; Also check old MENU_FILENAME location
    StrCpy $0 "$SMPROGRAMS\${MENU_FILENAME}"
    IfFileExists "$0" 0 shortcut_cleanup_done
        DetailPrint "Deleting start menu folder: ${MENU_FILENAME}..."
        RMDir /r "$0"
        DetailPrint "  - Start menu folder deleted"
    shortcut_cleanup_done:
    
    DetailPrint "Shortcut cleanup complete"
    DetailPrint "============================================"
    
    Pop $1
    Pop $0
!macroend

