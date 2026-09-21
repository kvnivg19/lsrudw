@echo off
setlocal
cd /d "%~dp0"
echo.
echo =============================================
echo   LANSIA SMART RSUD WONOSARI
 echo   Instalasi project
 echo =============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang.
  echo Install Node.js LTS terlebih dahulu.
  pause
  exit /b 1
)
node -v
npm -v
echo.
echo Menjalankan npm install...
npm install
if errorlevel 1 (
  echo.
  echo npm install gagal. Coba jalankan lagi dengan internet aktif.
  pause
  exit /b 1
)
echo.
echo Instalasi selesai.
echo Jalankan START.bat atau ketik: npm run dev
pause
