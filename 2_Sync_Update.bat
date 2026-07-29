@echo off
chcp 65001 > nul
title Saddah ERP - Update & Sync
echo ====================================================
echo   2. Update & Push Changes to GitHub
echo ====================================================
echo.
cd /d "%~dp0"

echo [1/3] Staging modified files...
git add .

set /p commit_msg="Enter update description (or press ENTER for default): "
if "%commit_msg%"==="" set commit_msg=Update Saddah ERP System

echo.
echo [2/3] Committing changes...
git commit -m "%commit_msg%"

echo.
echo [3/3] Pushing to GitHub...
git push origin main

if %ERRORLEVEL% NEQ 0 (
    echo [!] Push rejected, syncing force push...
    git push origin main --force
)

echo.
echo ====================================================
echo   SUCCESS! Updates pushed to GitHub & Hostinger.
echo ====================================================
echo.
pause
