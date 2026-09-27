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
SAIDA="${SAIDA:-$RAIZ/docs/manual/telas}"
PORTA="${PORTA:-8799}"
LARGURA=1500
ALTURA=1000

# A APAC saiu do pacote na v2.49.0: "apac" e "apac-modelos" deram lugar a
# "modelos", mostrado no laudo. Manter igual a lista de scripts/gerar-manual.sh.
CENAS=(dock painel alarme-ajustes alarme-completo alarme-discreto
       remume laudo modelos historico novidades)

[ -x "$CHROME" ] || { echo "Chrome nao encontrado em $CHROME"; exit 1; }

mkdir -p "$SAIDA"
npx --yes http-server "$RAIZ" -p "$PORTA" -c-1 --silent >/dev/null 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null || true' EXIT
sleep 3

FALHAS=0
for cena in "${CENAS[@]}"; do
  printf '  %-18s' "$cena"
  # O Chrome sem janela as vezes nao encerra sozinho depois de tirar a
  # foto (cena com animacao continua segura o compositor). Um limite por
  # cena evita que uma prender a fila inteira.
  rodar_chrome() {
    local perfil; perfil="$(mktemp -d)"
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --user-data-dir="$perfil" \
      --window-size="${LARGURA},${ALTURA}" \
      --virtual-time-budget=12000 \
      "$@" \
      "http://localhost:$PORTA/tests/smoke.html?cena=$cena&v=$(date +%s)" 2>/dev/null &
    local pid=$! espera=0
    while kill -0 "$pid" 2>/dev/null && [ "$espera" -lt 35 ]; do
      sleep 1; espera=$((espera + 1))
    done
    kill -9 "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    rm -rf "$perfil"
  }

  rm -f "$SAIDA/$cena.png"
  rodar_chrome --screenshot="$SAIDA/$cena.png" >/dev/null

  # Existir o PNG nao prova nada: uma cena que falhou tambem vira foto
  # (das boas-vindas, por exemplo). A pagina marca o resultado no <html>
  # — data-pronto quando terminou, data-cena-erro quando a tela nao
  # abriu —, e aqui ela e aberta de novo para ler essa marca.
  DOM="$(rodar_chrome --dump-dom)"
  # "|| true": sem erro, o grep nao acha nada e sai com 1 — com
  # "set -e" e "pipefail" isso derrubaria o script na cena que PASSOU.
  ERRO="$(printf '%s' "$DOM" | grep -o 'data-cena-erro="[^"]*"' | head -1 | sed 's/^data-cena-erro="//; s/"$//' || true)"
  if [ ! -f "$SAIDA/$cena.png" ]; then
    echo "FALHOU (sem imagem)"; FALHAS=$((FALHAS + 1))
  elif [ -n "$ERRO" ]; then
    echo "FALHOU: $ERRO"; FALHAS=$((FALHAS + 1))
  elif ! printf '%s' "$DOM" | grep -q 'data-pronto="1"'; then
    echo "FALHOU (a cena nao terminou)"; FALHAS=$((FALHAS + 1))
  else
    echo "$(du -h "$SAIDA/$cena.png" | cut -f1)"
  fi
done

echo
if [ "$FALHAS" -gt 0 ]; then
  echo "$FALHAS cena(s) falharam — as imagens delas NAO servem para o manual."
  exit 1
fi
echo "Telas em $SAIDA"
