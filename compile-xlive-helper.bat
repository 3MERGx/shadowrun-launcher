@echo off
echo Compiling xlive-helper.exe (x64 Release, Static Runtime)...
echo.

set "VCVARS="
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"

REM Find VS using vswhere (works for any install path/edition)
if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do set "VCVARS=%%i\VC\Auxiliary\Build\vcvars64.bat"
    if not defined VCVARS for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -property installationPath 2^>nul`) do set "VCVARS=%%i\VC\Auxiliary\Build\vcvars64.bat"
)

REM Fallback: try common paths if vswhere didn't find one
if not defined VCVARS if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS if exist "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat"

if defined VCVARS if not exist "%VCVARS%" set "VCVARS="
if not defined VCVARS (
    echo Error: Visual Studio not found.
    echo Make sure "Desktop development with C++" workload is installed.
    echo If VS is installed elsewhere, run this from "Developer Command Prompt for VS" instead.
    pause
    exit /b 1
)

echo Using: %VCVARS%
call "%VCVARS%" >nul 2>&1

REM Compile with x64, Release, Static Runtime (/MT)
cl.exe /nologo /W3 /O2 /DNDEBUG /MT /EHsc /Fe:xlive-helper.exe xlive-helper.cpp /link /SUBSYSTEM:CONSOLE

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Success! xlive-helper.exe compiled.
) else (
    echo.
    echo Compilation failed!
    pause
    exit /b 1
)

pause

