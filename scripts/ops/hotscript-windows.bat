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
    if "!result!"=="" set "result=%default_value%"
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

:main
call :step "Windows Development Setup"
echo This script will guide you through setting up the development environment on Windows.
echo.
echo Prerequisites:
echo   - Git for Windows (https://git-scm.com/download/win)
echo   - Node.js 20+ (https://nodejs.org/)
echo   - PowerShell or Git Bash terminal
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

call :step "Step 3: Environment Configuration"
set "ENV_FILE=.env"
if exist "%ENV_FILE%" (
    echo Found existing .env file
    call :prompt_user "Would you like to review/update environment variables"
    if %errorlevel% equ 0 (
        echo Current environment variables:
        type "%ENV_FILE%"
        echo.
    )
) else (
    echo Creating new .env file...
    type nul > "%ENV_FILE%"
)

call :get_env_value "%ENV_FILE%" "PORT"
if "%result%"=="" (
    call :prompt_value "Enter UI port" "4000"
    set PORT=%result%
    call :set_env_value "%ENV_FILE%" "PORT" "%PORT%"
)

call :get_env_value "%ENV_FILE%" "SERVER_PORT"
if "%result%"=="" (
    call :prompt_value "Enter Server port" "4001"
    set SERVER_PORT=%result%
    call :set_env_value "%ENV_FILE%" "SERVER_PORT" "%SERVER_PORT%"
)

call :get_env_value "%ENV_FILE%" "RUNNER_PORT"
if "%result%"=="" (
    call :prompt_value "Enter Runner port" "4002"
    set RUNNER_PORT=%result%
    call :set_env_value "%ENV_FILE%" "RUNNER_PORT" "%RUNNER_PORT%"
)

call :get_env_value "%ENV_FILE%" "RUNNER_TOKEN"
if "%result%"=="" (
    call :prompt_value "Enter Runner token (or press Enter for auto-generated)" ""
    set RUNNER_TOKEN=%result%
    if "%RUNNER_TOKEN%"=="" (
        for /f "tokens=*" %%i in ('powershell -Command "[System.Guid]::NewGuid().ToString()"') do set RUNNER_TOKEN=%%i
    )
    call :set_env_value "%ENV_FILE%" "RUNNER_TOKEN" "%RUNNER_TOKEN%"
)

call :get_env_value "%ENV_FILE%" "NEXT_PUBLIC_AI_API_URL"
if "%result%"=="" (
    call :prompt_value "Enter AI API URL" "https://api.heidiai.com.au"
    set NEXT_PUBLIC_AI_API_URL=%result%
    call :set_env_value "%ENV_FILE%" "NEXT_PUBLIC_AI_API_URL" "%NEXT_PUBLIC_AI_API_URL%"
)

call :get_env_value "%ENV_FILE%" "CLOUDFLARE_TUNNEL_NAME"
if "%result%"=="" (
    call :prompt_user "Would you like to use Cloudflare Tunnel"
    if !errorlevel! equ 0 (
        call :prompt_value "Enter Cloudflare Tunnel Name/ID" "aiwebapp-dev"
        set "CLOUDFLARE_TUNNEL_NAME=!result!"
        call :set_env_value "%ENV_FILE%" "CLOUDFLARE_TUNNEL_NAME" "!CLOUDFLARE_TUNNEL_NAME!"
    )
) else (
    set "CLOUDFLARE_TUNNEL_NAME=%result%"
)

call :step "Step 4: Dependency Installation"
call :prompt_user "Would you like to install/update dependencies"
if %errorlevel% equ 0 (
    echo Installing dependencies...
    echo This may take a few minutes...
    
    call npm install
    if %errorlevel% neq 0 call :die "Failed to install root dependencies"
    
    call npm --prefix server install
    if %errorlevel% neq 0 call :die "Failed to install server dependencies"
    
    call npm --prefix runner install
    if %errorlevel% neq 0 call :die "Failed to install runner dependencies"
    
    call npm --prefix ui install
    if %errorlevel% neq 0 call :die "Failed to install ui dependencies"
    
    echo ✓ Dependencies installed successfully
) else (
    echo Skipping dependency installation
)

call :step "Step 5: Port Availability Check"
set LANDING_PORT=6868

call :get_env_value "%ENV_FILE%" "PORT"
if "%result%"=="" set "UI_PORT=4000" else set "UI_PORT=%result%"

call :get_env_value "%ENV_FILE%" "SERVER_PORT"
if "%result%"=="" set "SERVER_PORT=4001" else set "SERVER_PORT=%result%"

call :get_env_value "%ENV_FILE%" "RUNNER_PORT"
if "%result%"=="" set "RUNNER_PORT=4002" else set "RUNNER_PORT=%result%"

echo Checking availability of critical ports...
for %%p in (4000 4001 4002 4003 4004 4005 4006 6868 8080) do (
    netstat -an | findstr "0.0.0.0:%%p [::]:%%p " | findstr "LISTENING" >nul
    if !errorlevel! equ 0 (
        echo.
        echo ⚠️  Port %%p is already in use.
        call :prompt_user "Would you like to kill the process on port %%p"
        if !errorlevel! equ 0 (
            call :kill_port %%p
        )
    )
)

echo.
echo Service URLs:
echo   Landing: http://localhost:%LANDING_PORT%
echo   UI:      http://localhost:%UI_PORT%
echo   API:     http://localhost:%SERVER_PORT%
echo   Runner:  http://localhost:%RUNNER_PORT%
echo   Ollama:  http://localhost:11434
echo   Proxy:   http://localhost:8080

call :step "Step 6: Starting Services"
echo Starting all services with hot reload...
echo.
echo Press Ctrl+C to stop all services
echo.

set PORT=%UI_PORT%
set SERVER_PORT=%SERVER_PORT%
set RUNNER_PORT=%RUNNER_PORT%
set RUNNER_URL=http://localhost:%RUNNER_PORT%
set CORS_ORIGIN=http://localhost:%UI_PORT%
set NEXT_PUBLIC_API_URL=http://localhost:%SERVER_PORT%
set NEXT_PUBLIC_RUNNER_BASE_URL=http://localhost:%RUNNER_PORT%
call :get_env_value "%ENV_FILE%" "NEXT_PUBLIC_AI_API_URL"
if "%result%"=="" (
    set NEXT_PUBLIC_AI_API_URL=https://api.heidiai.com.au
) else (
    set NEXT_PUBLIC_AI_API_URL=%result%
)

start "Landing Service" cmd /k "node landing/server.mjs"
echo ✓ Landing service started

start "Server Service" cmd /k "npm --prefix server run dev"
echo ✓ Server service started

start "Runner Service" cmd /k "npm --prefix runner run dev"
echo ✓ Runner service started

start "UI Service" cmd /k "npm --prefix ui run dev"
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
echo 🎉 All services are starting up!
echo This may take 30-60 seconds for initial compilation...
echo.
echo Monitor each service in its own window.
echo.
echo Access your application:
echo   Main UI: http://localhost:%UI_PORT%
echo.
echo Waiting for services to be ready...

timeout /t 5 /nobreak >nul

echo.
echo ✅ Development environment is ready!
echo Services are running. Check the logs above for any issues.
echo.
echo To stop all services, press Ctrl+C

echo.
echo Press any key to stop all services...
pause >nul

echo.
echo Stopping services...
taskkill /F /FI "WINDOWTITLE eq Landing Service" >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq Server Service" >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq Runner Service" >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq UI Service" >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq Cloudflare Tunnel" >nul 2>nul
echo Services stopped.

pause
