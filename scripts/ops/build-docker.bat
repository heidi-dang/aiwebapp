@echo off
echo Building Docker images with tags v0.01 and latest...

docker build -t heididang/aiwebapp:ui-v0.01 -t heididang/aiwebapp:ui-latest ./ui
if %errorlevel% neq 0 exit /b %errorlevel%

docker build -t heididang/aiwebapp:server-v0.01 -t heididang/aiwebapp:server-latest ./server
if %errorlevel% neq 0 exit /b %errorlevel%

docker build -t heididang/aiwebapp:runner-v0.01 -t heididang/aiwebapp:runner-latest ./runner
if %errorlevel% neq 0 exit /b %errorlevel%

echo Build complete!
