@echo off
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
echo Cargo Path added: %USERPROFILE%\.cargo\bin
echo Starting Dashboard (Tauri)...
npm run tauri dev
pause
