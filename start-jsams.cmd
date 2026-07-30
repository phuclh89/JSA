@echo off
setlocal

cd /d "%~dp0"

where corepack >nul 2>&1
if errorlevel 1 (
  echo [JSAMS] corepack was not found. Install Node.js 20 or newer first.
  pause
  exit /b 1
)

netstat -ano -p tcp | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  echo [JSAMS] Port 3000 is already in use. Stop the existing API process first.
  pause
  exit /b 1
)

netstat -ano -p tcp | findstr /R /C:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo [JSAMS] Port 5173 is already in use. Stop the existing frontend process first.
  pause
  exit /b 1
)

echo [JSAMS] Starting API on http://localhost:3000 ...
start "JSAMS API - port 3000" cmd /k "cd /d ""%~dp0"" && set APP_PORT=3000 && corepack pnpm --filter @jsams/api dev"

echo [JSAMS] Starting frontend on http://localhost:5173 ...
start "JSAMS Web - port 5173" cmd /k "cd /d ""%~dp0"" && corepack pnpm --filter @jsams/web dev -- --port 5173"

echo.
echo [JSAMS] Two command windows have been opened.
echo [JSAMS] Open http://localhost:5173 after both services finish starting.
timeout /t 3 /nobreak >nul

endlocal
