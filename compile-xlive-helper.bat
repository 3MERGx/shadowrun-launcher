@echo off
echo Compiling xlive-helper.exe (x64 Release, Static Runtime)...
echo.

REM Check if Visual Studio Developer Command Prompt is available
REM If not, try to find cl.exe in common VS locations
set "CL_PATH="
if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" (
    call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat" (
    call "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat" (
    call "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat"
) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat" (
    call "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat"
) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\Professional\VC\Auxiliary\Build\vcvars64.bat" (
    call "C:\Program Files (x86)\Microsoft Visual Studio\2019\Professional\VC\Auxiliary\Build\vcvars64.bat"
) else (
    echo Error: Visual Studio not found. Please install Visual Studio with C++ support.
    echo Or run this from a Visual Studio Developer Command Prompt.
    pause
    exit /b 1
)

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

