#!/usr/bin/env bash
# ---------------------------------------------------------------------
# scripts/capturar-telas.sh — gera as imagens do manual de treinamento
# ---------------------------------------------------------------------
# Roda a pagina de fumaca no Chrome sem janela, uma cena por vez, e
# salva um PNG de cada. As cenas vivem em tests/smoke.html (?cena=).
#
# Existe para o manual poder ser REGERADO quando a interface mudar:
# manual com print velho ensina o que o produto nao faz mais, e o medico
# confia no manual e nao na tela.
#
#   ./scripts/capturar-telas.sh
# ---------------------------------------------------------------------
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SAIDA="$RAIZ/docs/manual/telas"
PORTA="${PORTA:-8799}"
LARGURA=1500
ALTURA=1000

CENAS=(dock painel alarme-ajustes alarme-completo alarme-discreto
       apac apac-modelos remume laudo historico novidades)

[ -x "$CHROME" ] || { echo "Chrome nao encontrado em $CHROME"; exit 1; }

mkdir -p "$SAIDA"
npx --yes http-server "$RAIZ" -p "$PORTA" -c-1 --silent >/dev/null 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null || true' EXIT
sleep 3

for cena in "${CENAS[@]}"; do
  printf '  %-18s' "$cena"
  PERFIL="$(mktemp -d)"
  # O Chrome sem janela as vezes nao encerra sozinho depois de tirar a
  # foto (cena com animacao continua segura o compositor). Um limite por
  # cena evita que uma prender a fila inteira: a imagem ja foi escrita.
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --user-data-dir="$PERFIL" \
    --window-size="${LARGURA},${ALTURA}" \
    --virtual-time-budget=12000 \
    --screenshot="$SAIDA/$cena.png" \
    "http://localhost:$PORTA/tests/smoke.html?cena=$cena&v=$(date +%s)" >/dev/null 2>&1 &
  CHROME_PID=$!
  ESPERA=0
  while kill -0 "$CHROME_PID" 2>/dev/null && [ "$ESPERA" -lt 35 ]; do
    sleep 1; ESPERA=$((ESPERA + 1))
  done
  kill -9 "$CHROME_PID" 2>/dev/null || true
  wait "$CHROME_PID" 2>/dev/null || true
  rm -rf "$PERFIL"
  if [ -f "$SAIDA/$cena.png" ]; then
    echo "$(du -h "$SAIDA/$cena.png" | cut -f1)"
  else
    echo "FALHOU"
  fi
done

echo
echo "Telas em docs/manual/telas/"
