#!/usr/bin/env bash
# ---------------------------------------------------------------------
# scripts/gerar-manual.sh — monta o PDF do manual de treinamento
# ---------------------------------------------------------------------
# Depende das imagens em docs/manual/telas/, geradas por
# ./scripts/capturar-telas.sh. Rode aquele primeiro quando a interface
# mudar — manual com print velho ensina o que o produto nao faz mais.
#
#   ./scripts/capturar-telas.sh && ./scripts/gerar-manual.sh
# ---------------------------------------------------------------------
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
FONTE="$RAIZ/docs/manual/manual.html"
SAIDA="$RAIZ/docs/manual/Assistente-Meeds-Manual.pdf"

[ -x "$CHROME" ] || { echo "Chrome nao encontrado em $CHROME"; exit 1; }
[ -f "$FONTE" ]  || { echo "Falta $FONTE"; exit 1; }

FALTANDO=0
for tela in dock painel alarme-ajustes alarme-completo alarme-discreto \
            apac apac-modelos remume laudo historico novidades; do
  [ -f "$RAIZ/docs/manual/telas/$tela.png" ] || { echo "AVISO: falta a tela $tela.png"; FALTANDO=1; }
done
[ "$FALTANDO" = "1" ] && echo "Rode ./scripts/capturar-telas.sh antes."

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
  echo "Gerado: docs/manual/Assistente-Meeds-Manual.pdf ($(du -h "$SAIDA" | cut -f1))"
else
  echo "FALHOU: o PDF nao foi escrito."
  exit 1
fi
