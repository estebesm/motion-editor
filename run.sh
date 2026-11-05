#!/usr/bin/env bash
# Генератор motion-видео: задаёт вопросы и делает видео из папки videos/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

command -v node >/dev/null || { echo "Нужен Node.js 23.6+ — установите: brew install node"; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 23 ] || { echo "Нужен Node.js 23.6+, сейчас $(node -v) — обновите: brew upgrade node"; exit 1; }
command -v ffmpeg >/dev/null || { echo "Нужен ffmpeg — установите: brew install ffmpeg"; exit 1; }
[ -f "$ROOT/.env" ] || { echo "Нет файла .env с GEMINI_API_KEY=... в $ROOT"; exit 1; }

if [ ! -d "$ROOT/engine/node_modules" ]; then
  echo "Первый запуск: ставлю зависимости…"
  (cd "$ROOT/engine" && npm install --silent)
fi
mkdir -p "$ROOT/videos"

cd "$ROOT/engine"
exec node --disable-warning=ExperimentalWarning scripts/cli.ts "$@"
