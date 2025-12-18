; Shadowrun FPS Launcher - Custom NSIS Installer Script
; Simple customization for shortcuts

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

; Insert GetParent function
!insertmacro GetParent

; .NET 6.0 Desktop Runtime x86 (32-bit) download URL
!define DOTNET6_DOWNLOAD_URL "https://download.visualstudio.microsoft.com/download/pr/bf0c50ea-2394-40af-a5a7-6cee0cef5572/31d359c30ff370525e06e43f92ab26aa/windowsdesktop-runtime-6.0.36-win-x86.exe"
!define DOTNET6_INSTALLER_NAME "windowsdesktop-runtime-6.0.36-win-x86.exe"

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
    
    ; Check and install .NET 6.0 Desktop Runtime x86 if needed
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
    ${EndIf}
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

