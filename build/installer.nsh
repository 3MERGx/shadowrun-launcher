; Shadowrun FPS Launcher - Custom NSIS Installer Script
; Simple customization for shortcuts

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Insert GetParent function
!insertmacro GetParent

; Variables for shortcut selection
Var Dialog
Var DesktopShortcut
Var StartMenuShortcut

Function ShortcutPage
    nsDialogs::Create 1018
    Pop $Dialog

    ${If} $Dialog == error
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 12u "Select additional tasks:"
    Pop $0

    ${NSD_CreateCheckbox} 0 20u 100% 10u "&Create a desktop shortcut"
    Pop $DesktopShortcut
    ${NSD_Check} $DesktopShortcut  ; Checked by default

    ${NSD_CreateCheckbox} 0 35u 100% 10u "Create a &Start Menu shortcut"
    Pop $StartMenuShortcut
    ${NSD_Check} $StartMenuShortcut  ; Checked by default

    nsDialogs::Show
FunctionEnd

Function ShortcutPageLeave
    ; Nothing needed here, checkboxes are handled automatically
FunctionEnd

; Custom installer pages - order matters!
!macro customInstallPage
    ; Add the shortcut selection page after the directory selection page
    Page custom ShortcutPage ShortcutPageLeave
!macroend

; Macro to create shortcuts based on checkbox selection
!macro customInstall
    ; Create desktop shortcut if checked
    ${NSD_GetState} $DesktopShortcut $0
    ${If} $0 == ${BST_CHECKED}
        CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}

    ; Create start menu shortcut if checked
    ${NSD_GetState} $StartMenuShortcut $0
    ${If} $0 == ${BST_CHECKED}
        CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
        CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
!macroend

; Override the default install mode page to skip it
!macro customInit
    ; Force current user installation only
    SetShellVarContext current
    
    ; Automatically uninstall previous versions
    Call UninstallPreviousVersion
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

