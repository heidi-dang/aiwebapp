@echo off

REM Ensure the script is running as Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script must be run as Administrator.
    pause
    exit /b 1
)

REM Update cloudflared to the latest version
set CLOUDFLARED_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
set CLOUDFLARED_PATH=C:\Program Files (x86)\cloudflared\cloudflared.exe

REM Check if cloudflared is running and stop it before updating
tasklist | findstr /i "cloudflared.exe"
if %errorlevel%==0 (
    echo Stopping running cloudflared process...
    taskkill /IM cloudflared.exe /F
)

REM Download the latest version of cloudflared
powershell -Command "try { Invoke-WebRequest -Uri '%CLOUDFLARED_URL%' -OutFile '%CLOUDFLARED_PATH%' -ErrorAction Stop } catch { Write-Host 'ERROR: Failed to update cloudflared. Please check your permissions and try again.'; pause; exit 1 }"

REM Verify the updated version
"%CLOUDFLARED_PATH%" --version
if %errorlevel% neq 0 (
    echo ERROR: Failed to verify cloudflared version. Please check the installation. & pause & exit /b 1
)

REM Cleanup existing tunnels if requested (fresh start)
REM "%CLOUDFLARED_PATH%" tunnel cleanup

REM Check if heidiai-tunnel1 exists
"%CLOUDFLARED_PATH%" tunnel list | findstr /i "heidiai-tunnel1"
if %errorlevel%==0 (
    echo heidiai-tunnel1 already exists.
) else (
    echo Creating heidiai-tunnel1...
    "%CLOUDFLARED_PATH%" tunnel create heidiai-tunnel1
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create heidiai-tunnel1. Please check manually. & pause & exit /b 1
    )
)

REM Get the Tunnel ID
for /f "tokens=2" %%i in ('"%CLOUDFLARED_PATH%" tunnel list ^| findstr "heidiai-tunnel1"') do set TUNNEL_ID=%%i
echo Tunnel ID is %TUNNEL_ID%

REM Check if credentials file exists
if not exist "%USERPROFILE%\.cloudflared\%TUNNEL_ID%.json" (
    echo ERROR: Tunnel credentials file is missing for %TUNNEL_ID%.
    echo Please ensure you are logged in: cloudflared tunnel login
    pause
    exit /b 1
)

REM Create a new configuration file for the heidiai-tunnel1
set CONFIG_PATH=%USERPROFILE%\.cloudflared\config.yml
if exist "%CONFIG_PATH%" del "%CONFIG_PATH%"

REM Prompt for domain name
set /p DOMAIN_NAME="Enter your domain name (e.g., yourdomain.com): "
if "%DOMAIN_NAME%"=="" (
    echo ERROR: Domain name is required.
    pause
    exit /b 1
)
echo tunnel: %TUNNEL_ID% >> "%CONFIG_PATH%"
echo credentials-file: %USERPROFILE%\.cloudflared\%TUNNEL_ID%.json >> "%CONFIG_PATH%"
echo. >> "%CONFIG_PATH%"
echo ingress: >> "%CONFIG_PATH%"
echo   - hostname: code.%TUNNEL_ID%.cfargotunnel.com >> "%CONFIG_PATH%"
echo     service: http://localhost:4000 >> "%CONFIG_PATH%"
echo   - hostname: copilot.%TUNNEL_ID%.cfargotunnel.com >> "%CONFIG_PATH%"
echo     service: http://localhost:4001 >> "%CONFIG_PATH%"
echo   - hostname: %DOMAIN_NAME% >> "%CONFIG_PATH%"
echo     service: http://localhost:4002 >> "%CONFIG_PATH%"
echo   - hostname: ollama.%TUNNEL_ID%.cfargotunnel.com >> "%CONFIG_PATH%"
echo     service: http://localhost:3003 >> "%CONFIG_PATH%"
echo   - hostname: openai.%TUNNEL_ID%.cfargotunnel.com >> "%CONFIG_PATH%"
echo     service: http://localhost:3004 >> "%CONFIG_PATH%"
echo   - service: http_status:404 >> "%CONFIG_PATH%"

REM Restart the heidiai-tunnel1
"%CLOUDFLARED_PATH%" tunnel run heidiai-tunnel1
if %errorlevel% neq 0 (
    echo ERROR: Failed to start heidiai-tunnel1. Please check manually. & pause & exit /b 1
)

REM Update NSSM service
set NSSM_PATH="C:\Users\heidi\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe"
if not exist %NSSM_PATH% (
    echo ERROR: NSSM not found at %NSSM_PATH%. Please check the path and try again.
    pause
    exit /b 1
)
%NSSM_PATH% stop CloudflareTunnelUI
%NSSM_PATH% remove CloudflareTunnelUI confirm
%NSSM_PATH% install CloudflareTunnelUI "%CLOUDFLARED_PATH%"
%NSSM_PATH% set CloudflareTunnelUI AppDirectory "C:\Program Files (x86)\cloudflared"
%NSSM_PATH% set CloudflareTunnelUI AppParameters "tunnel run heidiai-tunnel1"
%NSSM_PATH% start CloudflareTunnelUI
if %errorlevel% neq 0 (
    echo ERROR: Failed to update NSSM service. Please check manually. & pause & exit /b 1
)

REM Verify the tunnel list
"%CLOUDFLARED_PATH%" tunnel list
if %errorlevel% neq 0 (
    echo ERROR: Failed to list tunnels. Please check manually. & pause & exit /b 1
)

REM Health Check
"%CLOUDFLARED_PATH%" tunnel info %TUNNEL_ID% | findstr /i "status: running"
if %errorlevel%==0 (
    echo Tunnel health: GREEN
) else (
    echo Tunnel health: RED
    echo ERROR: Tunnel is not running. Please check manually.
    pause
    exit /b 1
)

pause