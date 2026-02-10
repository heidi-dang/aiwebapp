@echo off 
echo Starting AIWebApp Production Services... 
cd /d "%~dp0" 
set NODE_ENV=production 
set ENV_FILE=.env.production 
 
start "Landing Service" cmd /k "node landing/server.mjs" 
start "Server Service" cmd /k "npm --prefix server start" 
start "Runner Service" cmd /k "npm --prefix runner start" 
start "UI Service" cmd /k "npm --prefix ui start" 
 
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --protocol http2 run 54b189f4-b8c2-443e-acd3-7080a1112360" 
set NEXT_PUBLIC_AI_API_URL=https://api.heidiai.com.au 
 
echo Services started. Check logs in logs/ directory. 
echo Press any key to stop services... 
pause > nul 
 
echo Stopping services... 
taskkill /F /IM node.exe > nul 2>&1 
taskkill /F /FI "WINDOWTITLE eq Cloudflare Tunnel" > nul 2>&1 
echo Services stopped. 
pause 
