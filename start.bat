@echo off
chcp 65001 >nul
title MentorMatch
cd /d "%~dp0backend"

where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python не найден. Установи Python 3 с https://python.org и запусти снова.
  pause
  exit /b 1
)

echo Устанавливаю зависимости...
python -m pip install -r requirements.txt

echo.
echo MentorMatch запускается на http://localhost:5000
echo Открой этот адрес в браузере. Чтобы остановить — закрой это окно.
echo.

start "" http://localhost:5000
python app.py
pause
