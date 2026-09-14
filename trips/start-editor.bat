@echo off
rem start-editor.bat: Start the local trip authoring service beside this launcher.
rem Component: Trip editor; preserve quoted repository paths and foreground shutdown.
setlocal
set "TRIP_EDITOR_SCRIPT=%~dp0scripts\trip_editor_server.py"
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul
if not errorlevel 1 (
  py -3 "%TRIP_EDITOR_SCRIPT%"
  goto finished
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul
if not errorlevel 1 (
  python "%TRIP_EDITOR_SCRIPT%"
  goto finished
)
echo Install Python 3.10 or newer, enable the Python launcher or PATH option, and retry.
pause
exit /b 1
:finished
if errorlevel 1 (
  echo Editor failed. Check the message above, then retry.
  pause
)
endlocal
