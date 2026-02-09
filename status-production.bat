@echo off 
echo Checking AIWebApp Production Service Status... 
echo. 
echo Landing Service: 
tasklist /FI "WINDOWTITLE eq Landing Service" 2>nul | find "node.exe" >nul && echo   RUNNING || echo   STOPPED 
echo. 
echo Server Service: 
tasklist /FI "WINDOWTITLE eq Server Service" 2>nul | find "node.exe" >nul && echo   RUNNING || echo   STOPPED 
echo. 
echo Runner Service: 
tasklist /FI "WINDOWTITLE eq Runner Service" 2>nul | find "node.exe" >nul && echo   RUNNING || echo   STOPPED 
echo. 
echo UI Service: 
tasklist /FI "WINDOWTITLE eq UI Service" 2>nul | find "node.exe" >nul && echo   RUNNING || echo   STOPPED 
echo. 
echo Cloudflare Tunnel: 
tasklist /FI "WINDOWTITLE eq Cloudflare Tunnel" 2>nul | find "cloudflared.exe" >nul && echo   RUNNING || echo   STOPPED 
echo. 
pause 
