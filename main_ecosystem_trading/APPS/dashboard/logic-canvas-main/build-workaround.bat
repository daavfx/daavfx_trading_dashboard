@echo off
REM Workaround for cargo proc-macro build order bug
REM Forces proc-macro2 to build before quote

cd /d "D:\trading_ecosystem_11\trading_ecosystem_9.0\main_ecosystem_trading\APPS\dashboard\logic-canvas-main\src-tauri"

echo Cleaning target...
rmdir /s /q target 2>nul

echo Building proc-macro2 first...
cargo build -p unicode-ident -p proc-macro2 2>&1
if errorlevel 1 (
    echo Failed to build proc-macro2
    exit /b 1
)

echo Building quote (now proc-macro2 is available)...
cargo build -p quote 2>&1
if errorlevel 1 (
    echo Failed to build quote
    exit /b 1
)

echo Building remaining dependencies...
cargo build --lib 2>&1
if errorlevel 1 (
    echo Failed to build lib
    exit /b 1
)

echo SUCCESS: All dependencies built!
pause