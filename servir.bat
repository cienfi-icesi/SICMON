@echo off
REM ===========================================================================
REM  servir.bat - Levanta el portal en el navegador. Doble clic y listo.
REM
REM  No requiere instalar nada: usa PowerShell, que viene con Windows.
REM  -ExecutionPolicy Bypass aplica SOLO a esta ejecucion; no cambia ninguna
REM  configuracion del equipo.
REM
REM  Para detenerlo: cierre la ventana que se abre, o pulse Ctrl+C en ella.
REM ===========================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\servir.ps1" %*
if errorlevel 1 pause
