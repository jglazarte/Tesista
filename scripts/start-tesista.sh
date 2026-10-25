#!/usr/bin/env bash
# Script para iniciar Tesista (backend + frontend) en paralelo

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$PROJECT_DIR/server"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "========================================"
echo "  Iniciando Tesista"
echo "========================================"
echo ""

# Verificar que existan las dependencias
if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo "Instalando dependencias del servidor..."
  cd "$SERVER_DIR" && npm install --no-audit --no-fund
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Instalando dependencias del frontend..."
  cd "$FRONTEND_DIR" && npm install --no-audit --no-fund
fi

echo ""
echo "Iniciando backend (puerto 3001)..."
cd "$SERVER_DIR" && npx tsx src/index.ts &
SERVER_PID=$!

echo "Iniciando frontend (puerto 5173)..."
cd "$FRONTEND_DIR" && npx vite --host &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "  Tesista iniciado"
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo "========================================"
echo ""
echo "Presiona Ctrl+C para detener ambos servicios"

# Esperar a que termine cualquiera de los dos y luego matar al otro
wait -n
kill $SERVER_PID $FRONTEND_PID 2>/dev/null
wait $SERVER_PID $FRONTEND_PID 2>/dev/null
