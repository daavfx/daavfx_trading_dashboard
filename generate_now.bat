@echo off
REM ========================================
REM DAAVILEFX MASSIVE Setfile Generator
REM ========================================
REM This generates the complete setfile and saves to Vault_Presets
REM ========================================

echo ========================================
echo ⚡ DAAVILEFX MASSIVE Setfile Generator
echo ========================================

cd /d "%~dp0"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python not found! Please install Python 3.x
    pause
    exit /b 1
)

echo ✅ Python found
echo.
echo Generating MASSIVE setfile...
echo.

REM Run the generator
python generate_massive_setfile_v19.py

echo.
if exist "Vault_Presets\MASSIVE_DAAVILEFX_COMPLETE_v19.set" (
    echo ✅ SUCCESS!
    echo File: Vault_Presets\MASSIVE_DAAVILEFX_COMPLETE_v19.set
    echo.
    dir "Vault_Presets\MASSIVE_DAAVILEFX_COMPLETE_v19.set" | findstr /i "set"
    echo.
    echo Ready to load in Dashboard!
) else (
    echo ❌ Failed to generate file
)

pause
