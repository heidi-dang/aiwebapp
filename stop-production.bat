@echo off 
echo Stopping AIWebApp Production Services... 
taskkill /F /IM node.exe > nul 2>&1 
echo Services stopped. 
pause 
