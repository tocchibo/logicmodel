@echo off
cd /d "%~dp0"
echo Starting Python HTTP server...
start python -m http.server 8000
timeout /t 2 /nobreak > nul
echo Opening browser...
start http://localhost:8000/index.html
echo Server is running on http://localhost:8000
echo Press Ctrl+C to stop the server
pause