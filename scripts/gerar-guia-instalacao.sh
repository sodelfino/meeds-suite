#!/usr/bin/env bash
# ---------------------------------------------------------------------
# scripts/gerar-guia-instalacao.sh — monta o PDF do guia de INSTALACAO
# ---------------------------------------------------------------------
# Irmao de scripts/gerar-manual.sh: mesma pipeline (Chrome sem janela,
# --print-to-pdf), outro documento. O guia de instalacao ensina a por o
# Assistente para funcionar no Chrome/Edge; o manual de bolso ensina a
# USAR depois de instalado.
#
# A unica imagem REAL do guia e docs/manual/telas/instalacao-dock.png (o
# Assistente no Meeds). As telas do navegador (loja de extensoes, pagina
# do Tampermonkey) sao ilustracoes SVG dentro do proprio HTML — de
# proposito, ver o comentario no topo de docs/manual/instalacao.html.
#
# Para refazer a imagem real quando a interface mudar:
#   veja o bloco "instalacao-dock" no fim deste arquivo.
#
#   ./scripts/gerar-guia-instalacao.sh
# ---------------------------------------------------------------------
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
FONTE="$RAIZ/docs/manual/instalacao.html"
SAIDA="$RAIZ/docs/manual/Assistente-Meeds-Instalacao.pdf"

[ -x "$CHROME" ] || { echo "Chrome nao encontrado em $CHROME"; exit 1; }
[ -f "$FONTE" ]  || { echo "Falta $FONTE"; exit 1; }
[ -f "$RAIZ/docs/manual/telas/instalacao-dock.png" ] || {
  echo "Falta docs/manual/telas/instalacao-dock.png (ver comentario no fim deste script)."; exit 1; }

rm -f "$SAIDA"
PERFIL="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu \
  --user-data-dir="$PERFIL" \
  --no-pdf-header-footer \
  --print-to-pdf="$SAIDA" \
  --virtual-time-budget=20000 \
  "file://$FONTE" >/dev/null 2>&1 &
PID=$!
ESPERA=0
while kill -0 "$PID" 2>/dev/null && [ "$ESPERA" -lt 60 ]; do sleep 1; ESPERA=$((ESPERA + 1)); done
kill -9 "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
rm -rf "$PERFIL"

if [ -f "$SAIDA" ]; then
  echo "Gerado: docs/manual/Assistente-Meeds-Instalacao.pdf ($(du -h "$SAIDA" | cut -f1))"
else
  echo "FALHOU: o PDF nao foi escrito."
  exit 1
fi

# ---------------------------------------------------------------------
# instalacao-dock.png — como refazer
# ---------------------------------------------------------------------
# E a cena "dock" da pagina de fumaca, so que numa janela menor e com
# resolucao dobrada (nitida no PDF):
#
#   python3 -m http.server 8798 &
#   "$CHROME" --headless=new --hide-scrollbars --window-size=760,420 \
#     --force-device-scale-factor=2 --virtual-time-budget=12000 \
#     --screenshot=docs/manual/telas/instalacao-dock.png \
#     "http://localhost:8798/tests/smoke.html?cena=dock"
#
# A moldura vermelha por cima da imagem esta em instalacao.html (SVG com
# viewBox 760x420 — a mesma proporcao da janela acima). Se mudar a
# janela, ajuste a moldura.
# ---------------------------------------------------------------------
