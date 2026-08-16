@echo off
echo This will allow other devices (phones/tablets/PCs) to connect
echo to the Evervault server on port 3000.
echo.
echo If a User Account Control prompt appears, click Yes.
echo.
netsh advfirewall firewall add rule name="Evervault Server 3000" dir=in action=allow protocol=TCP localport=3000
echo.
if %errorlevel%==0 (
  echo SUCCESS: firewall rule added.
) else (
  echo FAILED: You must run this file as Administrator.
  echo Right-click this file and choose "Run as administrator".
)
echo.
pause
