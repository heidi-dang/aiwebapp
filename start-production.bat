@echo off 
echo Starting AIWebApp Production Services... 
cd /d "%~dp0" 
set NODE_ENV=production 
set ENV_FILE=.env.production 

REM Prompt for SERVER_PUBLIC_URL if not set
if "%SERVER_PUBLIC_URL%"=="" (
    echo SERVER_PUBLIC_URL is not set. This is needed for OAuth redirects.
    set /p SERVER_PUBLIC_URL="Enter SERVER_PUBLIC_URL (e.g., https://api.yourdomain.com): "
)

start "Landing Service" cmd /k "node landing/server.mjs" 
start "Server Service" cmd /k "npm --prefix server start" 
start "Runner Service" cmd /k "npm --prefix runner start" 
start "UI Service" cmd /k "npm --prefix ui start" 
 
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel run aiwebapp-prod" 
 
echo Services started. Check logs in logs/ directory. 
echo Press any key to stop services... 
pause > nul 
 
echo Stopping services... 
taskkill /F /IM node.exe > nul 2>&1 
taskkill /F /FI "WINDOWTITLE eq Cloudflare Tunnel" > nul 2>&1 
echo Services stopped. 
pause 
