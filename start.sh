#!/usr/bin/env bash
# MentorMatch — запуск в один шаг (Mac/Linux)
cd "$(dirname "$0")/backend" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "[!] Python 3 не найден. Установи с https://python.org и запусти снова."
  exit 1
fi

echo "Устанавливаю зависимости..."
python3 -m pip install -r requirements.txt

echo
echo "MentorMatch запускается на http://localhost:5000"
( sleep 2; open http://localhost:5000 >/dev/null 2>&1 || xdg-open http://localhost:5000 >/dev/null 2>&1 ) &
python3 app.py
