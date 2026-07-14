#!/bin/bash
# Doble-click para ABRIR Imperio Viral. Inicia la app, abre el navegador, y la
# APAGA cuando cerrás esta ventana. No queda nada corriendo en segundo plano.

PROJECT="/Users/sp/Documents/claude/imperio-viral"
PORT=3000
cd "$PROJECT" || exit 1
export PATH="/opt/homebrew/bin:$PATH"

cleanup() {
  echo ""
  echo "Apagando Imperio Viral..."
  lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null
  pkill -9 -f "next-server" 2>/dev/null
  exit 0
}
trap cleanup EXIT INT TERM HUP

if curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
  echo "Ya estaba abierto."
else
  echo "Iniciando Imperio Viral (unos segundos)..."
  npm start > /tmp/iv-server.log 2>&1 &
  until curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; do sleep 1; done
fi

open "http://localhost:$PORT"
echo ""
echo "======================================================"
echo "  ✅ Imperio Viral abierto en el navegador."
echo "  📱 iPhone (misma Wi-Fi): http://$(ipconfig getifaddr en0 2>/dev/null || echo 'tu-IP'):$PORT"
echo ""
echo "  Dejá ESTA ventana abierta mientras lo usás."
echo "  Para APAGARLO: cerrá esta ventana."
echo "======================================================"

# Mantener la ventana abierta hasta que la cierren (ahí el trap apaga la app).
while true; do sleep 3600; done
