@echo off
echo Compiling audio-volume-helper.exe...

:: Find Visual Studio installation path
for /f "usebackq tokens=*" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -property installationPath`) do set VSPATH=%%i

if not exist "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" (
    echo Error: vcvars64.bat not found. Please ensure Visual Studio with C++ development tools is installed.
    goto :eof
)

call "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat"

cl /EHsc /MT /Ox /W4 /Fe:audio-volume-helper.exe audio-volume-helper.cpp ole32.lib /link /SUBSYSTEM:CONSOLE

if %ERRORLEVEL% EQU 0 (
    echo Compilation successful!
    echo audio-volume-helper.exe has been created.
) else (
    echo Compilation failed!
)

pause

