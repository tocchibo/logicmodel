@echo off
setlocal
cd /d "%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
  echo uv is required to start this project.
  echo Install or make uv available on PATH, then run this script again.
  exit /b 1
)

echo Starting Python HTTP server through uv isolated environment...
start "logicmodel uv server" /D "%~dp0" cmd /k "uv run python -m http.server 8000"
timeout /t 2 /nobreak > nul
echo Opening browser...
start "" "http://localhost:8000/index.html"
echo Server is running on http://localhost:8000
echo Python is launched with uv run and uses the project .venv.
echo Press Ctrl+C in the server window to stop the server.
pause
