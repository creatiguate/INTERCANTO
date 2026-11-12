@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Instala Node.js LTS desde https://nodejs.org/ y vuelve a intentarlo.
  pause
  exit /b 1
)
if not exist node_modules\wrangler (
  echo Instalando dependencias (solo una vez)...
  call npm install
  if errorlevel 1 goto fallo
)
if not exist .dev.vars (
  echo Configura ahora tus datos REALES de Supabase y Google.
  call npm run local:setup
  if errorlevel 1 goto fallo
)
call npm run doctor
if errorlevel 1 (
  echo Revisa la configuracion y corrige los datos antes de iniciar.
  goto fallo
)
echo.
echo Abre http://localhost:8787 en tu navegador. No uses Live Server.
echo.
call npm run dev
if errorlevel 1 goto fallo
exit /b 0
:fallo
echo Ocurrio un error. Revisa el mensaje anterior.
pause
exit /b 1
