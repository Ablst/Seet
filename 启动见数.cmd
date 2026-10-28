@echo off
setlocal
cd /d "%~dp0"
title Seet AI Workspace
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\package.json" (
  call npm install
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
node scripts/start.mjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo Startup failed. Keep this window open to inspect the error above.
pause
exit /b 1
