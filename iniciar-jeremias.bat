@echo off
chcp 65001 >nul
title Jeremias A.S.O.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

if not exist ".env.local" (
  copy ".env.example" ".env.local" >nul
  echo Criei o arquivo .env.local. Cole sua GEMINI_API_KEY nele, salve e feche o Bloco de Notas.
  notepad ".env.local"
)

if not exist "node_modules" (
  echo Instalando dependencias, so na primeira vez...
  call npm install
  if errorlevel 1 ( echo Falha no npm install. & pause & exit /b 1 )
)

if not exist "dist\index.html" (
  echo Gerando a interface, so na primeira vez...
  call npm run build
  if errorlevel 1 ( echo Falha no build. & pause & exit /b 1 )
)

echo.
echo Jeremias iniciando. Para encerrar, feche esta janela ou aperte Ctrl+C.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
