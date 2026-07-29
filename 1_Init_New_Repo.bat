@echo off
chcp 65001 > nul
title Saddah ERP - Initialize Repo
echo ====================================================
echo   1. Initialize & Link New GitHub Repository
echo ====================================================
echo.
cd /d "%~dp0"

echo [1/4] Initializing clean Git repository...
git init 2>nul
git branch -M main 2>nul

echo [2/4] Linking to GitHub (HazemMusallam1/saddahevent)...
git remote remove origin 2>nul
git remote add origin https://github.com/HazemMusallam1/saddahevent.git

echo [3/4] Staging & Creating Initial Commit...
git add .
git commit -m "Initial Commit - Clean Saddah ERP System" 2>nul

echo [4/4] Pushing to GitHub...
git push -u origin main --force

echo.
echo ====================================================
echo   SUCCESS! Repository is linked and pushed.
echo   To open in GitHub Desktop:
echo   File -> Add Existing Repository -> Select this folder
echo ====================================================
echo.
pause
