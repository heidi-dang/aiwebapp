@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0..\.."
cd /d "%ROOT_DIR%"

set "LOG_DIR=logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

goto :main

:kill_port
set "target_port=%~1"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "0.0.0.0:%target_port% [::]:%target_port% " ^| findstr "LISTENING"') do (
    set "PID=%%a"
    if "!PID!" neq "0" if "!PID!" neq "4" (
        for /f "tokens=1" %%b in ('tasklist /FI "PID eq !PID!" /NH 2^>nul') do (
            set "IMAGE_NAME=%%b"
            if /i "!IMAGE_NAME!"=="node.exe" (
                echo Killing node process !PID! on port %target_port%...
                taskkill /F /PID !PID! >nul 2>nul
            ) else if /i "!IMAGE_NAME!"=="python.exe" (
                echo Killing python process !PID! on port %target_port%...
                taskkill /F /PID !PID! >nul 2>nul
            ) else (
                echo.
                echo ⚠️  WARNING: Port %target_port% is occupied by "!IMAGE_NAME!" (PID: !PID!^).
                echo This does not look like a standard Node or Python process.
                set /p "confirm=Are you sure you want to kill "!IMAGE_NAME!" (PID: !PID!^) on port %target_port%? (y/n) [n]: "
                if /i "!confirm!"=="y" (
                    taskkill /F /PID !PID! >nul 2>nul
                ) else (
                    echo Skipping process "!IMAGE_NAME!" (PID: !PID!^) on port %target_port%.
                )
            )
        )
    ) else (
        echo ⚠️  Cannot kill System process (PID !PID!^) on port %target_port%.
    )
)
exit /b 0

:step
echo.
echo == %~1 ==
exit /b 0

:die
echo ERROR: %~1
pause
exit /b 1

:have_cmd
where %~1 >nul 2>nul
if %errorlevel% equ 0 (
    exit /b 0
) else (
    exit /b 1
)

:check_port
set "port=%~1"
set "service=%~2"
netstat -an | findstr "0.0.0.0:%port% [::]:%port% " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo.
    echo ⚠️  Port %port% is already in use for %service%
    call :prompt_user "Would you like to kill the process on port %port%"
    if %errorlevel% equ 0 (
        call :kill_port %port%
        exit /b 0
    )
    exit /b 1
)
exit /b 0

:prompt_user
set "message=%~1"
set "default=%~2"
if "%default%"=="" set "default=y"
set /p "resp=%message% (y/n) [%default%]: "
if "%resp%"=="" set "resp=%default%"
if /i "%resp%"=="y" (
    exit /b 0
) else (
    exit /b 1
)

:prompt_value
set "message=%~1"
set "default_value=%~2"
if "%default_value%"=="" (
    set /p "result=%message%: "
) else (
    set /p "result=%message% [%default_value%]: "
    if "%result%"=="" set "result=%default_value%"
)
exit /b 0

:get_env_value
set "file=%~1"
set "key=%~2"
if not exist "%file%" exit /b 0
for /f "tokens=1,* delims==" %%a in ('findstr /b "%key%=" "%file%" 2^>nul') do (
    if "%%a"=="%key%" (
        set "result=%%b"
        exit /b 0
    )
)
exit /b 0

:set_env_value
set "file=%~1"
set "key=%~2"
set "value=%~3"
if not exist "%file%" (
    echo %key%=%value% >> "%file%"
) else (
    findstr /v /b "%key%=" "%file%" > "%file%.tmp"
    echo %key%=%value% >> "%file%.tmp"
    move /y "%file%.tmp" "%file%" >nul
)
exit /b 0

:main
call :step "Windows Production Deployment Setup"
echo This script will guide you through deploying the application for production on Windows.
echo.
echo Prerequisites:
echo   - Git for Windows (https://git-scm.com/download/win)
echo   - Node.js 20+ (https://nodejs.org/)
echo   - PowerShell or Git Bash terminal
echo   - Windows Task Scheduler (for service management)
echo.

call :step "Step 1: Environment Check"
call :have_cmd node
if %errorlevel% neq 0 (
    call :die "Node.js not found. Please install Node.js 20+ from https://nodejs.org/"
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js found: %NODE_VERSION%

call :have_cmd npm
if %errorlevel% neq 0 (
    call :die "npm not found. Please ensure npm is installed with Node.js"
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✓ npm found: %NPM_VERSION%

call :have_cmd git
if %errorlevel% neq 0 (
    echo ⚠️  Git not found. Some features may not work.
    echo    Install Git for Windows: https://git-scm.com/download/win
) else (
    echo ✓ Git found
)

call :step "Step 2: Project Structure Check"
if not exist server (
    call :die "This script must be run from the aiwebapp root directory containing server, ui, runner"
)
if not exist ui (
    call :die "This script must be run from the aiwebapp root directory containing server, ui, runner"
)
if not exist runner (
    call :die "This script must be run from the aiwebapp root directory containing server, ui, runner"
)
echo ✓ Project structure verified

call :step "Step 3: Production Environment Configuration"
set "ENV_FILE=.env.production"
if exist "%ENV_FILE%" (
    echo Found existing production environment file
    call :prompt_user "Would you like to review/update production variables"
    if %errorlevel% equ 0 (
        echo Current production variables:
        type "%ENV_FILE%"
        echo.
    )
) else (
    echo Creating new production environment file...
    type nul > "%ENV_FILE%"
)

call :get_env_value "%ENV_FILE%" "NODE_ENV"
if "%result%"=="" (
    echo NODE_ENV=production >> "%ENV_FILE%"
)

call :get_env_value "%ENV_FILE%" "PORT"
if "%result%"=="" (
    call :prompt_value "Enter production UI port" "4000"
    set PORT=%result%
    echo PORT=%PORT% >> "%ENV_FILE%"
) else (
    set PORT=%result%
)
set "UI_PORT=%PORT%"

call :get_env_value "%ENV_FILE%" "SERVER_PORT"
if "%result%"=="" (
    call :prompt_value "Enter production Server port" "4001"
    set SERVER_PORT=%result%
    echo SERVER_PORT=%SERVER_PORT% >> "%ENV_FILE%"
) else (
    set SERVER_PORT=%result%
)

call :get_env_value "%ENV_FILE%" "RUNNER_PORT"
if "%result%"=="" (
    call :prompt_value "Enter production Runner port" "4002"
    set RUNNER_PORT=%result%
    echo RUNNER_PORT=%RUNNER_PORT% >> "%ENV_FILE%"
) else (
    set RUNNER_PORT=%result%
)

call :get_env_value "%ENV_FILE%" "RUNNER_TOKEN"
if "%result%"=="" (
    call :prompt_value "Enter secure production Runner token (or press Enter for auto-generated)" ""
    set RUNNER_TOKEN=%result%
    if "%RUNNER_TOKEN%"=="" (
        for /f "tokens=*" %%i in ('powershell -Command "[System.Guid]::NewGuid().ToString() + [System.Guid]::NewGuid().ToString()"') do set RUNNER_TOKEN=%%i
    )
    echo RUNNER_TOKEN=%RUNNER_TOKEN% >> "%ENV_FILE%"
) else (
    set RUNNER_TOKEN=%result%
)

call :get_env_value "%ENV_FILE%" "CORS_ORIGIN"
if "%result%"=="" (
    call :prompt_value "Enter production CORS origin (your domain)" "http://localhost:%PORT%"
    set CORS_ORIGIN=%result%
    echo CORS_ORIGIN=%CORS_ORIGIN% >> "%ENV_FILE%"
) else (
    set CORS_ORIGIN=%result%
)

call :get_env_value "%ENV_FILE%" "NEXT_PUBLIC_API_URL"
if "%result%"=="" (
    call :prompt_value "Enter production API URL" "http://localhost:%SERVER_PORT%"
    set NEXT_PUBLIC_API_URL=%result%
    echo NEXT_PUBLIC_API_URL=%NEXT_PUBLIC_API_URL% >> "%ENV_FILE%"
) else (
    set NEXT_PUBLIC_API_URL=%result%
)

call :get_env_value "%ENV_FILE%" "NEXT_PUBLIC_RUNNER_BASE_URL"
if "%result%"=="" (
    call :prompt_value "Enter production Runner base URL" "http://localhost:%RUNNER_PORT%"
    set NEXT_PUBLIC_RUNNER_BASE_URL=%result%
    echo NEXT_PUBLIC_RUNNER_BASE_URL=%NEXT_PUBLIC_RUNNER_BASE_URL% >> "%ENV_FILE%"
) else (
    set NEXT_PUBLIC_RUNNER_BASE_URL=%result%
)

call :get_env_value "%ENV_FILE%" "NEXT_PUBLIC_AI_API_URL"
if "%result%"=="" (
    call :prompt_value "Enter production AI API URL" "https://api.heidiai.com.au"
    set NEXT_PUBLIC_AI_API_URL=%result%
    echo NEXT_PUBLIC_AI_API_URL=%NEXT_PUBLIC_AI_API_URL% >> "%ENV_FILE%"
) else (
    set NEXT_PUBLIC_AI_API_URL=%result%
)

call :get_env_value "%ENV_FILE%" "CLOUDFLARE_TUNNEL_NAME"
if "%result%"=="" (
    call :prompt_user "Would you like to use Cloudflare Tunnel for production"
    if !errorlevel! equ 0 (
        call :prompt_value "Enter Cloudflare Tunnel Name/ID" "aiwebapp-prod"
        set "CLOUDFLARE_TUNNEL_NAME=!result!"
        echo CLOUDFLARE_TUNNEL_NAME=!CLOUDFLARE_TUNNEL_NAME! >> "%ENV_FILE%"
    )
) else (
    set "CLOUDFLARE_TUNNEL_NAME=%result%"
)

call :step "Step 4: Production Build"
call :prompt_user "Would you like to build the application for production"
if %errorlevel% equ 0 (
    echo Building production application...
    echo This may take several minutes...
    
    call npm run build
    if %errorlevel% neq 0 call :die "Production build failed"
    
    echo ✓ Production build completed successfully
) else (
    echo Skipping production build ^(you can run 'npm run build' later^)
)

call :step "Step 5: Port Configuration ^& Validation"
set LANDING_PORT=6868

echo Production service configuration:
echo   Landing: http://localhost:%LANDING_PORT%
echo   UI:      http://localhost:%UI_PORT%
echo   API:     http://localhost:%SERVER_PORT%
echo   Runner:  http://localhost:%RUNNER_PORT%
echo.

echo Checking availability of critical ports...
set PORTS_OK=true

for %%p in (4000 4001 4002 4003 4004 4005 4006 6868 8080) do (
    netstat -an | findstr "0.0.0.0:%%p [::]:%%p " | findstr "LISTENING" >nul
    if !errorlevel! equ 0 (
        echo.
        echo ⚠️  Port %%p is already in use.
        call :prompt_user "Would you like to kill the process on port %%p"
        if !errorlevel! equ 0 (
            call :kill_port %%p
        ) else (
            set PORTS_OK=false
        )
    )
)

if "%PORTS_OK%"=="false" (
    echo ⚠️  Some ports are still in use.
    call :prompt_user "Would you like to continue anyway (services may fail to start)"
    if %errorlevel% equ 0 (
        echo Continuing with port conflicts...
    ) else (
        call :die "Port conflicts detected. Please resolve before continuing."
    )
)

call :step "Step 6: Service Management Setup"
call :prompt_user "Would you like to create Windows service management scripts"
if %errorlevel% equ 0 (
    echo Creating service management scripts...
    
    echo @echo off > start-production.bat
    echo echo Starting AIWebApp Production Services... >> start-production.bat
    echo cd /d "%%~dp0" >> start-production.bat
    echo set NODE_ENV=production >> start-production.bat
    echo set ENV_FILE=.env.production >> start-production.bat
    echo. >> start-production.bat
    echo start "Landing Service" cmd /k "node landing/server.mjs" >> start-production.bat
    echo start "Server Service" cmd /k "npm --prefix server start" >> start-production.bat
    echo start "Runner Service" cmd /k "npm --prefix runner start" >> start-production.bat
    echo start "UI Service" cmd /k "npm --prefix ui start" >> start-production.bat
    echo. >> start-production.bat
    if not "%CLOUDFLARE_TUNNEL_NAME%"=="" (
        echo start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --protocol http2 run %CLOUDFLARE_TUNNEL_NAME%" >> start-production.bat
    )
    echo set NEXT_PUBLIC_AI_API_URL=%NEXT_PUBLIC_AI_API_URL% >> start-production.bat
    echo. >> start-production.bat
    echo echo Services started. Check logs in logs/ directory. >> start-production.bat
    echo echo Press any key to stop services... >> start-production.bat
    echo pause ^> nul >> start-production.bat
    echo. >> start-production.bat
    echo echo Stopping services... >> start-production.bat
    echo taskkill /F /IM node.exe ^> nul 2^>^&1 >> start-production.bat
    if not "%CLOUDFLARE_TUNNEL_NAME%"=="" (
        echo taskkill /F /FI "WINDOWTITLE eq Cloudflare Tunnel" ^> nul 2^>^&1 >> start-production.bat
    )
    echo echo Services stopped. >> start-production.bat
    echo pause >> start-production.bat

    echo @echo off > stop-production.bat
    echo echo Stopping AIWebApp Production Services... >> stop-production.bat
    echo taskkill /F /IM node.exe ^> nul 2^>^&1 >> stop-production.bat
    echo echo Services stopped. >> stop-production.bat
    echo pause >> stop-production.bat

    echo @echo off > status-production.bat
    echo echo Checking AIWebApp Production Service Status... >> status-production.bat
    echo echo. >> status-production.bat
    echo echo Landing Service: >> status-production.bat
    echo tasklist /FI "WINDOWTITLE eq Landing Service" 2^>nul ^| find "node.exe" ^>nul ^&^& echo   RUNNING ^|^| echo   STOPPED >> status-production.bat
    echo echo. >> status-production.bat
    echo echo Server Service: >> status-production.bat
    echo tasklist /FI "WINDOWTITLE eq Server Service" 2^>nul ^| find "node.exe" ^>nul ^&^& echo   RUNNING ^|^| echo   STOPPED >> status-production.bat
    echo echo. >> status-production.bat
    echo echo Runner Service: >> status-production.bat
    echo tasklist /FI "WINDOWTITLE eq Runner Service" 2^>nul ^| find "node.exe" ^>nul ^&^& echo   RUNNING ^|^| echo   STOPPED >> status-production.bat
    echo echo. >> status-production.bat
    echo echo UI Service: >> status-production.bat
    echo tasklist /FI "WINDOWTITLE eq UI Service" 2^>nul ^| find "node.exe" ^>nul ^&^& echo   RUNNING ^|^| echo   STOPPED >> status-production.bat
    echo echo. >> status-production.bat
    if not "%CLOUDFLARE_TUNNEL_NAME%"=="" (
        echo echo Cloudflare Tunnel: >> status-production.bat
        echo tasklist /FI "WINDOWTITLE eq Cloudflare Tunnel" 2^>nul ^| find "cloudflared.exe" ^>nul ^&^& echo   RUNNING ^|^| echo   STOPPED >> status-production.bat
        echo echo. >> status-production.bat
    )
    echo pause >> status-production.bat

    echo ✓ Service management scripts created
    echo   - start-production.bat: Start all services
    echo   - stop-production.bat: Stop all services
    echo   - status-production.bat: Check service status
) else (
    echo Skipping service management setup
)

call :step "Step 7: Production Deployment"
call :prompt_user "Would you like to start the production services now"
if %errorlevel% equ 0 (
    echo Starting production services...
    echo.
    echo Service URLs:
    echo   Landing: http://localhost:%LANDING_PORT%
    echo   UI:      http://localhost:%UI_PORT%
    echo   API:     http://localhost:%SERVER_PORT%
    echo   Runner:  http://localhost:%RUNNER_PORT%
    echo.
    
    set NODE_ENV=production
    set ENV_FILE=.env.production
    
    start "Landing Service" cmd /k "node landing/server.mjs"
    echo ✓ Landing service started
    
    start "Server Service" cmd /k "npm --prefix server start"
    echo ✓ Server service started
    
    start "Runner Service" cmd /k "npm --prefix runner start"
    echo ✓ Runner service started
    
    start "UI Service" cmd /k "npm --prefix ui start"
    echo ✓ UI service started
    
    if not "%CLOUDFLARE_TUNNEL_NAME%"=="" (
        call :have_cmd cloudflared
        if !errorlevel! equ 0 (
            echo Starting Cloudflare Tunnel: %CLOUDFLARE_TUNNEL_NAME%...
            start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --protocol http2 run %CLOUDFLARE_TUNNEL_NAME%"
            echo ✓ Cloudflare Tunnel started: %CLOUDFLARE_TUNNEL_NAME%
        ) else (
            echo ⚠️  cloudflared not found. Please install it to use tunnels.
        )
    )

    echo.
    echo 🎉 Production deployment started!
    echo Services are running. Check the logs above for any issues.
    echo.
    echo To stop all services, run stop-production.bat
) else (
    echo Production setup complete!
    echo.
    echo To start services later:
    echo   1. Run: start-production.bat
    echo   2. Or manually start each service:
    echo      - node landing/server.mjs
    echo      - npm --prefix server start
    echo      - npm --prefix runner start
    echo      - npm --prefix ui start
    echo.
    echo Production environment file: .env.production
    echo Service management scripts: start-production.bat, stop-production.bat, status-production.bat
)

echo.
echo ✅ Production deployment setup complete!
echo.
echo Next steps:
echo   1. Configure your firewall to allow the configured ports
echo   2. Set up reverse proxy (nginx/Apache) if needed
echo   3. Configure SSL certificates for HTTPS
echo   4. Set up monitoring and logging
echo   5. Configure automatic startup (Windows Task Scheduler)
echo.
echo For help, check the documentation or open an issue on GitHub.
echo.
pause
