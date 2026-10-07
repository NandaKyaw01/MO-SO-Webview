@echo off
title Launch TV Display Client (Kiosk Mode)
echo ====================================================
echo   Digital Signage - Launching TV Kiosk Mode
echo ====================================================
echo.

set TARGET_URL=http://localhost:3000/tv

:: Try Google Chrome Kiosk mode
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    echo Launching Google Chrome in Kiosk mode...
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 "%TARGET_URL%"
    goto done
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    echo Launching Google Chrome (x86) in Kiosk mode...
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --kiosk --noerrdialogs --disable-infobars "%TARGET_URL%"
    goto done
)

if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    echo Launching Google Chrome (User) in Kiosk mode...
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --kiosk --noerrdialogs --disable-infobars "%TARGET_URL%"
    goto done
)

:: Try Microsoft Edge Kiosk mode
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    echo Launching Microsoft Edge in Kiosk mode...
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --kiosk "%TARGET_URL%" --edge-kiosk-type=fullscreen --no-first-run
    goto done
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    echo Launching Microsoft Edge in Kiosk mode...
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --kiosk "%TARGET_URL%" --edge-kiosk-type=fullscreen --no-first-run
    goto done
)

:: Fallback: Open in default browser
echo Dedicated browser kiosk not found. Opening in default browser...
start "" "%TARGET_URL%"
echo Press F11 to switch to full-screen mode on your TV.

:done
echo Done. Press any key to close this window.
exit /b 0
