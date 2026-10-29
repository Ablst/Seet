@echo off
setlocal
cd /d "%~dp0"
title Seet AI Workspace
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap.ps1"
if errorlevel 1 pause
