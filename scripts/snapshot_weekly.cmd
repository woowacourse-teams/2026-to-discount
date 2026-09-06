@echo off
rem Runs snapshot.py once the weekly cohort closes on Monday. Logged by date.

setlocal
set REPO=%~dp0..
set LOGDIR=%REPO%\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%d
set LOG=%LOGDIR%\snapshot-%TODAY%.log

echo ==== %DATE% %TIME% ==== >> "%LOG%"

cd /d "%REPO%"
python scripts\snapshot.py >> "%LOG%" 2>&1
echo [exit] %ERRORLEVEL% >> "%LOG%"
endlocal
