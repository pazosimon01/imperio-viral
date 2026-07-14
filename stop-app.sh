#!/bin/bash
# Detiene el servidor de Imperio Viral para liberar RAM.
pkill -f "next start" 2>/dev/null
pkill -f "next-server" 2>/dev/null
pkill -f "run-server.sh" 2>/dev/null
sleep 1
osascript -e 'display notification "Servidor detenido. RAM liberada." with title "Imperio Viral"'
