@echo off
title FundTrucker Server
color 0A
echo.
echo  ==========================================
echo    FundTrucker - Starting Server...
echo  ==========================================
echo.

cd /d d:\fundtrucker

:: Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Node.js is NOT installed!
    echo.
    echo  Please download it from: https://nodejs.org
    echo  Choose the "LTS" version and install it.
    echo  Then run this file again.
    echo.
    pause
    start https://nodejs.org
    exit /b 1
)

:: Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo  Installing dependencies...
    call npm install
    echo.
)

:: Get local IP for phone access
echo  Your phone URL (same WiFi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    set IP=!IP: =!
)
ipconfig | findstr "IPv4"
echo.
echo  Open on phone: http://YOUR-IP-ABOVE:3000
echo.
echo  Starting server...
echo  Press Ctrl+C to stop.
echo.

node server.js

pause
