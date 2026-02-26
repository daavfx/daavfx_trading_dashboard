@echo off
chcp 65001 >nul
echo ==========================================
echo DAAVFX Resource Monitor
echo ==========================================
echo.
echo This script monitors your app's resource usage
echo Press Ctrl+C to stop
echo.
echo Look for these warning signs:
echo - GDI Objects > 10,000 (Windows limit)
echo - Handles > 50,000
echo - Working Set growing continuously
echo.
echo ==========================================
echo.

:loop
cls
echo %date% %time%
echo ==========================================
echo.

:: Check if logic-canvas process is running
tasklist /FI "IMAGENAME eq logic-canvas*" /FO TABLE 2>nul | findstr /I "logic-canvas" >nul
if errorlevel 1 (
    echo [WAITING] logic-canvas app not running yet...
    echo.
    echo Start your app and this monitor will track it.
) else (
    echo [MONITORING] logic-canvas resource usage:
    echo.
    
    :: Get detailed process info using PowerShell
    powershell -Command "Get-Process | Where-Object {$_.ProcessName -like '*logic-canvas*'} | Select-Object ProcessName, Id, @{Name='GDI Objects';Expression={$_.MainWindowHandle}}, @{Name='Handles';Expression={$_.Handles}}, @{Name='WorkingSet(MB)';Expression={[math]::Round($_.WorkingSet/1MB,2)}}, @{Name='Threads';Expression={$_.Threads.Count}} | Format-Table -AutoSize"
    
    echo.
    echo Tip: Open Task Manager ^> Details ^> Right-click columns ^>
    echo      Add: GDI Objects, Handles, User Objects
)

echo.
echo ==========================================
echo Press Ctrl+C to stop monitoring
echo ==========================================

:: Wait 3 seconds before next check
timeout /t 3 /nobreak >nul
goto loop
