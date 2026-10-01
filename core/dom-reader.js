/* ------------------------------------------------------------------
 * core/dom-reader.js — leitura de tela com variantes de rotulo
 * ------------------------------------------------------------------
 * PROBLEMA QUE ESTE ARQUIVO RESOLVE
 * APAC, LME e CMD tinham CADA UM a sua copia (praticamente identica) de
 * valorAoLadoDoRotulo() e lerDadosDaTela(). O CMD foi o unico que evoluiu
 * a ideia: como o rotulo exato do "nome da mae" nunca pode ser conferido
 * numa gravacao, ele tenta VARIANTES em ordem ("Nome da Mãe", "Nome da
 * mãe do paciente", "Mãe", "Filiação"). O APAC so tentava duas variantes,
 * e o LME nem lia esse campo. Essa inteligencia estava presa num modulo.
 *
 * Aqui ela vira infraestrutura do nucleo, com duas melhorias:
 *   1. comparacao NORMALIZADA (sem acento, caixa baixa, espacos
 *      colapsados, ":" final ignorado) — antes a comparacao era um
 *      toUpperCase() cru, entao "Nome da Mae" nao batia com "Nome da Mãe"
 *      e cada modulo precisava listar as duas grafias na mao;
 *   2. leitura de contador numerico que RECUSA decidir sob ambiguidade,
 *      generalizando a regra do alarme de fila ("mais de um numero
 *      candidato e leituras divergentes => nao decide").
 * ------------------------------------------------------------------ */
(function (raiz) {
  "use strict";

  function normalizarTexto(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/\s+/g, " ")
      .replace(/[:：]\s*$/, "") // rotulos costumam vir com ":" no fim
      .trim()
      .toLowerCase();
  }

  /* Todos os elementos-FOLHA da pagina (sem filhos), que sao os que
   * carregam texto puro. Uma unica varredura serve para varias buscas
   * no mesmo "pulso" de leitura — os originais varriam
   * document.querySelectorAll('body *') de novo a cada rotulo, o que em
   * telas grandes custava caro. */
  function coletarFolhas() {
    const folhas = [];
    try {
      const todos = document.querySelectorAll("body *");
      for (let i = 0; i < todos.length; i++) {
        if (todos[i].children.length === 0) folhas.push(todos[i]);
      }
    } catch (e) {
      /* silencioso */
    }
    return folhas;
  }

  function textoDe(el) {
    return (el.textContent || "").trim();
  }

  /* Valor que aparece AO LADO de um rotulo. Aceita uma string ou uma
   * lista de variantes e devolve a primeira que casar — mesma estrategia
   * do CMD, agora com normalizacao de acento embutida. */
  /* Percorre as variantes do rotulo, acha o leaf com esse texto e entrega
   * o elemento AO LADO (irmao seguinte, ou o seguinte do pai) para
   * `extrair`. Devolve o primeiro resultado nao vazio. Base comum de
   * lerValorPorRotulo (texto) e lerLinhasPorRotulo (linhas). */
  function procurarAoLadoDoRotulo(variantes, folhasOpcional, extrair) {
    const lista = Array.isArray(variantes) ? variantes : [variantes];
    const folhas = folhasOpcional || coletarFolhas();
    for (let v = 0; v < lista.length; v++) {
      const alvo = normalizarTexto(lista[v]);
      if (!alvo) continue;
      for (let i = 0; i < folhas.length; i++) {
        const el = folhas[i];
        if (normalizarTexto(textoDe(el)) !== alvo) continue;
        let prox = el.nextElementSibling;
        if (!prox && el.parentElement) prox = el.parentElement.nextElementSibling;
        const valor = prox ? extrair(prox) : null;
        if (valor) return valor;
      }
    }
    return null;
  }

  function lerValorPorRotulo(variantes, folhasOpcional) {
    return procurarAoLadoDoRotulo(variantes, folhasOpcional, function (prox) {
      return textoDe(prox) || null;
    });
  }

  /* Mesmo achado de lerValorPorRotulo, mas devolve o valor LINHA A
   * LINHA. O campo "Vinculos" do Meeds novo mostra a prefeitura numa linha
   * e a unidade na de baixo ("PREFEITURA MUNICIPAL DE MACAÉ" / "UPA ...");
   * o textContent gruda as duas ("MACAÉUPA ..."), e ai nao da para
   * comparar o nome da unidade inteiro. innerText respeita a quebra de
   * linha que a tela mostra. Devolve null se nao achar o rotulo. */
  function lerLinhasPorRotulo(variantes, folhasOpcional) {
    return procurarAoLadoDoRotulo(variantes, folhasOpcional, function (prox) {
      const bruto = typeof prox.innerText === "string" && prox.innerText ? prox.innerText : textoDe(prox);
      const linhas = String(bruto)
        .split(/\n+/)
        .map(function (l) { return l.trim(); })
        .filter(Boolean);
      return linhas.length ? linhas : null;
    });
  }


  /* Procura um texto exato isolado na tela (ex: "Masculino"/"Feminino").
   * Devolve o primeiro valor mapeado que aparecer. */
  function lerPorTextoExato(mapa, folhasOpcional) {
    const folhas = folhasOpcional || coletarFolhas();
    const chaves = Object.keys(mapa).map(function (k) {
      return { normalizado: normalizarTexto(k), valor: mapa[k] };
    });
    for (let i = 0; i < folhas.length; i++) {
      const t = normalizarTexto(textoDe(folhas[i]));
      if (!t) continue;
      for (let j = 0; j < chaves.length; j++) {
        if (t === chaves[j].normalizado) return chaves[j].valor;
      }
    }
    return null;
  }

  /* CPF isolado dentro de um texto que pode trazer o CNS junto — caso do
   * rotulo "Documentos" do Meeds novo (ver docs/MIGRACAO-V2.md, secao 2.2):
   * desde 22/09/2026 o cartao do paciente nao mostra mais "CPF" sozinho,
   * e sim "Documentos" com CPF e CNS (15 digitos) lado a lado. NUNCA junta
   * os dois: um CPF errado no laudo e pior que nenhum.
   *
   * Duas tentativas, nessa ordem, e SO decide se uma delas achar
   * exatamente um candidato:
   *   1. CPF com a pontuacao normal (###.###.###-##) — inconfundivel com
   *      o CNS, que nao tem esse formato.
   *   2. Um token de EXATAMENTE 11 digitos, separado dos vizinhos por
   *      espaco, barra ou quebra de linha (o innerText separa CPF/CNS em
   *      linhas, do mesmo jeito que ja faz com prefeitura/unidade em
   *      "Vinculos" — ver lerLinhasPorRotulo). Nunca fatia um bloco de
   *      digitos grudados (CPF+CNS sem separador nenhum): sem separador
   *      para confiar, nao decide. */
  function extrairCpfIsolado(texto) {
    if (!texto) return null;
    const formatado = String(texto).match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    if (formatado) return formatado[0].replace(/\D/g, "");
    const tokens = String(texto).trim().split(/[\s/|,;]+/).filter(Boolean);
    const candidatos = tokens.filter(function (t) { return /^\d{11}$/.test(t); });
    return candidatos.length === 1 ? candidatos[0] : null;
  }

  function lerCpfPorRotulo(variantes, folhasOpcional) {
    const linhas = lerLinhasPorRotulo(variantes, folhasOpcional);
    if (linhas) {
      for (let i = 0; i < linhas.length; i++) {
        const achado = extrairCpfIsolado(linhas[i]);
        if (achado) return achado;
      }
    }
    return extrairCpfIsolado(lerValorPorRotulo(variantes, folhasOpcional));
  }

  /* Texto do elemento imediatamente ANTERIOR ao que casa com um regex.
   * E como os tres geradores acham o nome do paciente: o nome fica logo
   * antes da linha "NN anos e MM meses" no cartao do paciente. */
  function lerAnteriorAoPadrao(regex, folhasOpcional) {
    const folhas = folhasOpcional || coletarFolhas();
    for (let i = 0; i < folhas.length; i++) {
      const t = textoDe(folhas[i]);
      if (!t || !regex.test(t)) continue;
      let ant = folhas[i].previousElementSibling;
      if (!ant && folhas[i].parentElement) ant = folhas[i].parentElement.previousElementSibling;
      const texto = ant && textoDe(ant);
      if (texto && texto.length > 2 && !/^\d/.test(texto)) return texto;
      return null;
    }
    return null;
  }

  const numeroPuroRx = /^\d{1,4}$/;

  /* Contador numerico associado a um rotulo (ex: o card "Aguardando" do
   * dashboard). REGRA HERDADA DO ALARME DE FILA, agora no nucleo: se
   * houver mais de uma leitura candidata e elas nao baterem entre si,
   * devolve null — preferimos NAO decidir a arriscar um falso disparo. */
  function lerContadorPorRotulo(variantes, folhasOpcional) {
    const lista = Array.isArray(variantes) ? variantes : [variantes];
    const folhas = folhasOpcional || coletarFolhas();
    const normalizadas = lista.map(normalizarTexto);

    const rotulos = folhas.filter(function (el) {
      return normalizadas.indexOf(normalizarTexto(textoDe(el))) !== -1;
    });
    if (rotulos.length === 0) return null;

    const leituras = {};
    let quantas = 0;
    rotulos.forEach(function (rotulo) {
      const pai = rotulo.parentElement;
      if (!pai) return;
      for (let i = 0; i < pai.children.length; i++) {
        const irmao = pai.children[i];
        if (irmao === rotulo) continue;
        const t = textoDe(irmao);
        if (numeroPuroRx.test(t)) {
          const n = parseInt(t, 10);
          if (!(n in leituras)) {
            leituras[n] = true;
            quantas++;
          }
        }
      }
    });

    if (quantas !== 1) return null; // ambiguo ou nao encontrado: nao decide
    return parseInt(Object.keys(leituras)[0], 10);
  }

  /* Texto normalizado da pagina inteira — usado pelo REMUME para achar
   * o nome do municipio na tela. */
  function textoDaPaginaNormalizado() {
    try {
      return normalizarTexto(document.body ? document.body.innerText : "");
    } catch (e) {
      return "";
    }
  }

  /* Leitura padronizada do cartao de paciente do Meeds, unificando o que
   * APAC/LME/CMD faziam separado. Devolve so o que conseguiu ler; nunca
   * inventa valor. Os campos ficam em memoria e vao direto para o
   * formulario — nada e gravado em disco. */
  const VARIANTES = {
    nascimento: ["Data de Nascimento", "Data de nascimento", "Nascimento", "Dt. Nascimento"],
    /* "Documentos" confirmado pela sonda em 22/09/2026 (ver
     * docs/MIGRACAO-V2.md, secao 2.2): o cartao do paciente do Meeds novo
     * nao tem mais um rotulo "CPF" isolado, e sim "Documentos" com CPF e
     * CNS juntos. lerPaciente() usa lerCpfPorRotulo (nao lerValorPorRotulo)
     * exatamente por causa dessa variante — ela separa os dois em vez de
     * colar. Variantes antigas mantidas para telas que ainda tenham "CPF"
     * sozinho. */
    cpf: ["CPF", "C.P.F.", "CPF do paciente", "Documentos"],
    /* "Parentesco" confirmado pela sonda em 22/09/2026 (relatorio real
     * contra des-doctor-calltech): "Nome da Mae" nao existe mais como leaf
     * isolado no cartao do paciente do v2 — o rotulo agora e "Parentesco".
     * Variantes antigas mantidas para nao quebrar telas que ainda usem
     * "Mae". Mantenha esta lista em sincronia com SELETORES_FALLBACK.rotulos
     * em core/core.user.js e com seletores.json — sao 3 copias do mesmo dado
     * (nucleo puro aqui, config remota+fallback la). */
    mae: ["Nome da Mãe", "Nome da mãe do paciente", "Nome da Mae", "Mãe", "Filiação", "Filiacao", "Parentesco"],
    telefone: ["Telefone", "Celular", "Contato"],
  };

  const RX_IDADE = /^\d+\s*anos?(\s+e\s+\d+\s*m[eê]s(es)?)?$/i;

  /* Nome e sexo, pelo rotulo "Paciente" (confirmado por print real em
   * 30/09/2026, atendimento de Macaé): o nome vem numa linha e o sexo
   * ("Masculino"/"Feminino") na linha de baixo, dentro do MESMO valor —
   * o textContent cru gruda as duas ("DARA ARRUDA MAGALHÃESFeminino"),
   * exatamente o problema ja resolvido para "Vinculos" (prefeitura/
   * unidade) e "Documentos" (CPF/CNS). Mesma solucao: ler LINHA A LINHA
   * (lerLinhasPorRotulo, que usa innerText). Devolve {} se o rotulo
   * "Paciente" nao existir nessa tela — quem chama cai pros metodos
   * antigos (lerPorTextoExato / lerAnteriorAoPadrao), que continuam
   * valendo pra qualquer tela onde esse rotulo nao apareca assim. */
  function lerNomeESexoDoPaciente(folhas) {
    const linhas = lerLinhasPorRotulo(["Paciente"], folhas);
    const achado = {};
    if (!linhas) return achado;
    linhas.forEach(function (linha) {
      const n = normalizarTexto(linha);
      if (n === "feminino") achado.sexo = "F";
      else if (n === "masculino") achado.sexo = "M";
      else if (!achado.nome && linha.length > 2) achado.nome = linha;
    });
    return achado;
  }

  function lerPaciente() {
    const folhas = coletarFolhas();
    const out = {};
    const doCartao = lerNomeESexoDoPaciente(folhas);

    const nascimento = lerValorPorRotulo(VARIANTES.nascimento, folhas);
    if (nascimento) {
      const m = nascimento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        out.nascimentoBR = m[1] + "/" + m[2] + "/" + m[3]; // dd/mm/aaaa (LME, CMD)
        out.nascimentoISO = m[3] + "-" + m[2] + "-" + m[1]; // aaaa-mm-dd (APAC, input date)
      }
    }

    const cpf = lerCpfPorRotulo(VARIANTES.cpf, folhas);
    if (cpf) out.cpf = cpf;

    const mae = lerValorPorRotulo(VARIANTES.mae, folhas);
    if (mae) out.nomeDaMae = mae;

    const telefone = lerValorPorRotulo(VARIANTES.telefone, folhas);
    if (telefone) out.telefone = telefone;

    // sexo: le a PALAVRA exibida na tela, nao um enum de API. Decisao
    // herdada do APAC, onde o enum nunca pode ser confirmado com um caso
    // feminino real — a palavra na tela e o dado mais confiavel.
    const sexo = doCartao.sexo || lerPorTextoExato({ Masculino: "M", Feminino: "F" }, folhas);
    if (sexo) out.sexo = sexo;

    const nome = doCartao.nome || lerAnteriorAoPadrao(RX_IDADE, folhas);
    if (nome) out.nome = nome;

    return out;
  }

  raiz.MeedsSuiteDom = {
    normalizarTexto: normalizarTexto,
    coletarFolhas: coletarFolhas,
    lerValorPorRotulo: lerValorPorRotulo,
    lerLinhasPorRotulo: lerLinhasPorRotulo,
    lerPorTextoExato: lerPorTextoExato,
    lerCpfPorRotulo: lerCpfPorRotulo,
    lerAnteriorAoPadrao: lerAnteriorAoPadrao,
    lerContadorPorRotulo: lerContadorPorRotulo,
    textoDaPaginaNormalizado: textoDaPaginaNormalizado,
    lerPaciente: lerPaciente,
    VARIANTES: VARIANTES,
  };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : typeof window !== "undefined" ? window : globalThis);
