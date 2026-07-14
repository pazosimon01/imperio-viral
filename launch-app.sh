#!/bin/bash
# Lanzador de Imperio Viral: enciende el servidor si hace falta y abre el navegador.
PROJECT_DIR="/Users/sp/Documents/claude/imperio-viral"
URL="http://localhost:3000"
LOG="$PROJECT_DIR/.launcher.log"

if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

cd "$PROJECT_DIR" || exit 1

# ¿Ya responde? Solo abrir el navegador.
if curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null | grep -qE "200|307|308"; then
  open "$URL"
  exit 0
fi

# Arrancar el servidor en segundo plano (sobrevive al cierre del lanzador).
nohup npm start > "$LOG" 2>&1 &

# Esperar hasta 60s a que responda y abrir el navegador.
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
  case "$code" in
    200|307|308) open "$URL"; exit 0 ;;
  esac
  sleep 1
done

osascript -e 'display alert "Imperio Viral" message "El servidor tardo demasiado en arrancar. Revisa .launcher.log en la carpeta del proyecto."'
exit 1
