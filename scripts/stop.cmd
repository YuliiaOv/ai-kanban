@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set PROJECT_DIR=%%~fI
cd /d "%PROJECT_DIR%"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker is required but was not found in PATH.
  exit /b 1
)

docker compose down
