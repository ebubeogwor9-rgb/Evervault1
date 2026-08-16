@echo off
echo Adding Windows Defender exclusion for ngrok (this is a known false
echo positive - ngrok is safe but Defender flags the updated binary).
echo.
echo If a User Account Control prompt appears, click Yes.
echo.
powershell -NoProfile -Command "Add-MpPreference -ExclusionPath 'C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe'"
echo.
if %errorlevel%==0 (
  echo SUCCESS: exclusion added.
) else (
  echo FAILED: You must run this file as Administrator.
  echo Right-click this file and choose "Run as administrator".
)
echo.
pause
