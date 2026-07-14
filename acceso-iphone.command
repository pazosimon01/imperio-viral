#!/bin/bash
# Doble-click para encender Imperio Viral + el túnel público (acceso desde
# iPhone con datos o Wi-Fi). Muestra la URL pública al final.
cd "$(dirname "$0")"

echo "→ Iniciando la app..."
if ! curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
  nohup npm start > /tmp/iv-server.log 2>&1 &
  until curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; do sleep 1; done
fi
echo "  app lista en http://localhost:3000"

echo "→ Abriendo el túnel público..."
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1
# --protocol http2: QUIC (UDP) se cae en algunas redes; http2 (TCP/443) es estable.
nohup cloudflared tunnel --url http://localhost:3000 --protocol http2 > /tmp/cf-tunnel.log 2>&1 &

URL=""
for i in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-tunnel.log | head -1)
  [ -n "$URL" ] && break
  sleep 1
done

echo ""
echo "==================================================="
if [ -n "$URL" ]; then
  echo "  URL para tu iPhone (datos o Wi-Fi):"
  echo ""
  echo "  $URL"
else
  echo "  No se pudo obtener la URL. Mira /tmp/cf-tunnel.log"
fi
echo "==================================================="
echo ""
echo "Deja esta ventana ABIERTA mientras uses la app desde el iPhone."
echo "Para apagar: cierra esta ventana o presiona Ctrl+C."

# Mantener vivo y seguir el log del túnel
tail -f /tmp/cf-tunnel.log
