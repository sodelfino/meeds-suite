#!/usr/bin/env node
/* ------------------------------------------------------------------
 * tests/busca-snapshot.test.js — retrato do motor contra dado REAL
 * ------------------------------------------------------------------
 * Antes de mexer em core/busca.js (a funcao 'buscar' e a mais complexa
 * do projeto: 76 comandos, complexidade 43), este teste tira uma foto
 * do comportamento ATUAL contra os dados reais da REMUME (7 municipios
 * de formato bem diferente entre si) e da CID-10 completa (14.233
 * codigos) — exatos os mesmos dados que os dois modulos usam em
 * producao, nao uma fixture pequena.
 *
 * Cobre os tres caminhos do motor (exato, generico-so-desempata,
 * aproximacao) e os dois usos reais (REMUME sem sinonimos, CID-10 com
 * sinonimos por sigla). Qualquer refatoracao que mude UM resultado, UMA
 * ordem ou UM total aqui tem que justificar a mudanca — nao pode ser
 * so um efeito colateral da divisao de funcao.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
let falhas = 0;
function ok(nome, cond, obs) {
  console.log((cond ? "  ok   " : "  FALHA ") + nome + (obs !== undefined ? "  (" + obs + ")" : ""));
  if (!cond) falhas++;
}

const ctx = { console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
["core/dom-reader.js", "core/busca.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx)
);
const B = ctx.MeedsSuiteBusca;

const REMUMES = JSON.parse(fs.readFileSync(path.join(RAIZ, "modules/remume/remumes.json"), "utf8"));
const CID = JSON.parse(fs.readFileSync(path.join(RAIZ, "dados/cid10.json"), "utf8")).cids;

const MUNICIPIOS = ["Mendes", "Macaé", "Betim", "Sete Lagoas", "Itaúna", "Barbacena", "Franco da Rocha"];
const idxRem = {};
MUNICIPIOS.forEach((m) => {
  idxRem[m] = B.criarIndice(REMUMES[m], (it) => (it.local ? it.nome + " " + it.local : it.nome));
});
const idxCid = B.criarIndice(
  Object.keys(CID).map((c) => ({ codigo: c, descricao: CID[c] })),
  (it) => it.codigo + " " + it.codigo.replace(/[^A-Za-z0-9]/g, "") + " " + it.descricao
);

/* Mesmos sinonimos que modules/cid10/index.js usa de verdade, so o
 * suficiente para exercitar o caminho de sinonimo do motor. */
const CID_SINONIMOS = {
  infarto: ["iam", "ataque cardiaco"],
  "acidente vascular cerebral": ["avc"],
  hipertensao: ["pressao alta", "has"],
  diabetes: ["dm"],
};

function checarRemume(municipio, termo, esperado) {
  const r = B.buscar(termo, idxRem[municipio]);
  const nomes = r.itens.map((x) => x.nome);
  const melhor = r.melhor ? r.melhor.nome : null;
  ok(
    "REMUME " + municipio + " \"" + termo + "\": total, 1o resultado e viaFuzzy batem com o retrato",
    r.total === esperado.total && melhor === esperado.melhor && r.viaFuzzy === esperado.viaFuzzy,
    "total=" + r.total + " melhor=" + JSON.stringify(melhor)
  );
  if (esperado.total > 0 && esperado.total <= 5) {
    ok(
      "REMUME " + municipio + " \"" + termo + "\": a lista inteira bate com o retrato",
      JSON.stringify(nomes) === JSON.stringify(esperado.itens)
    );
  }
}

function checarCid(termo, opcoes, esperado) {
  const r = B.buscar(termo, idxCid, opcoes);
  const codigos = r.itens.map((x) => x.codigo + "|" + x.descricao);
  const melhor = r.melhor ? r.melhor.codigo : null;
  ok(
    "CID-10 \"" + termo + "\": total, 1o resultado e viaFuzzy batem com o retrato",
    r.total === esperado.total && melhor === esperado.melhor && r.viaFuzzy === esperado.viaFuzzy,
    "total=" + r.total + " melhor=" + JSON.stringify(melhor)
  );
  if (esperado.total > 0 && esperado.total <= 5) {
    ok(
      "CID-10 \"" + termo + "\": a lista inteira bate com o retrato",
      JSON.stringify(codigos) === JSON.stringify(esperado.itens)
    );
  }
}

const RETRATO_REMUME = {
  "Mendes|acetilcisteina comprimido": {
    "itens": [
      "Acetilcisteína 200mg - Envelope",
      "Acetilcisteína 600mg - Envelope"
    ],
    "viaFuzzy": false,
    "total": 2,
    "melhor": "Acetilcisteína 200mg - Envelope"
  },
  "Macaé|dipirona comprimido": {
    "itens": [
      "Dipirona sódica 500mg comprimido",
      "Dipirona sódica 500mg/ml solução injetável ampola 2ml",
      "Dipirona sódica 500mg/ml solução oral frasco 10ml",
      "N-butilbrometo De Escopolamina 4mg/ml + Dipirona sódica 500mg/ml solução injetável ampola 5ml",
      "N-butilbrometo De Escopolamina 6,67mg/ml \\+ Dipirona 333,4mg/ml solução oral frasco 20ml"
    ],
    "viaFuzzy": false,
    "total": 5,
    "melhor": "Dipirona sódica 500mg comprimido"
  },
  "Betim|amoxicilina": {
    "itens": [
      "Amoxicilina + Clavulanato de Potássio 1g + 200mg - Pó para Solução Injetável",
      "Amoxicilina + Clavulanato de Potássio 500mg + 125mg - Comprimido",
      "Amoxicilina + Clavulanato de Potássio 50mgml + 12,5mg/ml - Suspensão Oral",
      "Amoxicilina 500mg - Cápsula",
      "Amoxicilina 50mg/ml (5%) - Suspensão Oral"
    ],
    "viaFuzzy": false,
    "total": 5,
    "melhor": "Amoxicilina + Clavulanato de Potássio 1g + 200mg - Pó para Solução Injetável"
  },
  "Sete Lagoas|paracetamol": {
    "itens": [
      "Paracetamol 200mg/mL",
      "Paracetamol 500mg"
    ],
    "viaFuzzy": false,
    "total": 2,
    "melhor": "Paracetamol 200mg/mL"
  },
  "Itaúna|insulina": {
    "itens": [
      "Insulina Humana NPH 100ui/ml - Caneta Aplicadora Descartável 3ml",
      "Insulina Humana NPH 100ui/ml - Frasco Injetável 10ml",
      "Insulina Humana Regular 100ui/ml - Caneta Aplicadora Descartável 3ml",
      "Insulina Humana Regular 100ui/ml - Frasco Injetável 10ml"
    ],
    "viaFuzzy": false,
    "total": 4,
    "melhor": "Insulina Humana NPH 100ui/ml - Caneta Aplicadora Descartável 3ml"
  },
  "Barbacena|adrenalina ampola": {
    "itens": [
      "Adrenalina 1 mg - 1 mL - ampola",
      "Adrenalina (epinefrina), cloridrato ou hemitartarato - solução injetável 1mg/mL",
      "Ácido ascórbico (vitamina C) 100 mg/mL-5 mL - ampola",
      "Ácido tranexâmico 50 mg-5 mL - ampola",
      "Adenosina 3 mg/mL -2 mL - ampola",
      "Água Destilada 10 mL - ampola",
      "Água Destilada 500 mL - ampola",
      "Água para injeção - solução injetável ampola 10 mL",
      "Alteplase 50 mg - frasco/ampola",
      "Aminofilina 24 mg/mL-10 mL - ampola",
      "Amiodarona cloridrato 50 mg/mL - 3 mL - ampola",
      "Amoxicilina + Clavulanato de Potássio 1 g EV - ampola",
      "Ampicilina 1 g - ampola",
      "Atropina sulfato 0,25 mg - 1 mL - ampola",
      "Benzilpenicilina Benzatina 1.200.000 UI - frasco/ampola",
      "Benzilpenicilina Potássica 6.000.000 UI - frasco/ampola",
      "Bicarbonato de Sódio 8,4%- 250 mL - ampola",
      "Bicarbonato de Sódio 8,4%-10 mL - ampola",
      "Biperideno 5 mg/1 mL - ampola",
      "Bromoprida 5 mg/mL-2 mL - ampola",
      "Cetoprofeno I.m 50 mg/mL-2 mL - ampola",
      "Cimetidina 150 mg/mL 12 mL - ampola",
      "Clindamicina, Fosfato 150 mg/mL AMP 4 mL - ampola",
      "Clonidina 150 mcg/mL 1 mL - ampola",
      "Cloreto de Magnesio 10% AMP 10 mL - ampola",
      "Cloreto de Potássio 10% -10 mL - ampola",
      "Cloreto de Sódio 10% - 10 mL - ampola",
      "Cloreto de Sódio 20% - 10 mL - ampola",
      "Clorpromazina 5 mg/mL-5 mL mL - ampola",
      "Deslanosídeo 0,2 mg/2 mL - ampola",
      "Dexametasona fosfato 4 mg/2,5 mL - ampola",
      "Diazepam 5 mg/mL - 2 mL - ampola",
      "Diclofenaco Sódico 25 mg - 3 mL - ampola",
      "Dipirona Sódica 500 mg/mL- 2 mL - ampola",
      "Dobutamina 250 mg - 20 mL - ampola",
      "Dopamina 5 mg/mL - 10 mL - ampola",
      "Efedrina 50 mg - 10 mL - ampola",
      "Efedrina 50 mg/1 mL - ampola",
      "Epinefrina bitartarato 0,001 mg-mL - ampola",
      "Escetamina 50 mg/mL - ampola",
      "Escopolamina butilbrometo + Dipirona sódica 4 mg/mL+500 mg/mL AMP 5 mL - ampola",
      "Escopolamina butilbrometo 20 mg/mL - 1 mL - ampola",
      "Etilefrina 10 mg/mL-1 mL - ampola",
      "Etomidato 2 mg/mL - 10 mL - ampola",
      "Fenitoína Sódica 50 mg/mL - 5 mL - ampola",
      "Fenobarbital Sódico 100 mg/mL - 2 mL - ampola",
      "Fentanil Citrato 0,05 mg/mL - 10 mL - ampola",
      "Fitomenadiona (vitamina K) 10 mg/mL AMP 1 mL - ampola",
      "Fitomenadiona 10 mg - 1 mL - ampola",
      "Flumazenil 0,1 mg/mL - 5 mL - ampola",
      "Furosemida 10 mg/mL- 2 mL - ampola",
      "Gentamicina sulfato 40 mg/mL - 1 mL - ampola",
      "Gentamicina, Sulfato 40 mg/mL AMP 2 mL - ampola",
      "Gliconato de Calcio 10% AMP 10 mL - ampola",
      "Glicose 25% - 10 mL - ampola",
      "Glicose 50% - 10 mL - ampola",
      "Haloperidol 5 mg/mL-1 mL - ampola",
      "Heparina Sódica 5.000 UI - 0,25 mL - ampola",
      "Heparina Sódica 5.000 UI/mL - 5 mL - frasco/ampola",
      "Hidralazina cloridrato 20 mg/mL -1 mL - ampola",
      "Hidrocortisona succinato 100 mg - frasco/ampola",
      "Hidrocortisona succinato 500 mg - frasco/ampola",
      "Insulina Nph 100 UI/mL - ampola",
      "Insulina R 100 UI/mL - ampola",
      "Lidocaina cloridrato 2% S/V - 20 mL - frasco/ampola",
      "Lidocaína cloridrato com vasoconstritor 2% C/V - 20 mL - frasco/ampola",
      "Metilprednisolona (acetato) 500 mg - PO - frasco/ampola",
      "Metoclopramida cloridrato 5 mg- 2 mL - ampola",
      "Metoprolol tartarato 1 mg/mL -5 mL - ampola",
      "Midazolam maleato 5 mg/mL - 3 mL - ampola",
      "Midazolam maleato 50 mg/mL - 10 mL - ampola",
      "Morfina sulfato 10 mg/mL - 1 mL - ampola",
      "Naloxona 0,4 mg/mL AMP 1 mL - ampola",
      "Nitroglicerina 50 mg - 10 mL - ampola",
      "Nitroprusseto de Sódio 25 mg - 2 mL - frasco/ampola",
      "Nitroprusseto de sódio 25 mg-2 mL - ampola",
      "Norepinefrina hemitartarato 2 mg - 4 mL - ampola",
      "Omeprazol 40 mg - frasco/ampola",
      "Ondasetrona cloridrato 2 mg/mL 2 mL - ampola",
      "Oxacilina sódica 500 mg - frasco/ampola"
    ],
    "viaFuzzy": false,
    "total": 87,
    "melhor": "Adrenalina 1 mg - 1 mL - ampola"
  },
  "Franco da Rocha|dipirona ampola": {
    "itens": [
      "Adifenina + Dipirona + Prometazina (adifenina 25 mg + dipirona 750 mg + prometazina 25 mg) ampola 2 ml",
      "N-Butilescopolamina + Dipirona composto (N-butilescopolamina 20 mg + dipirona 2.500 mg) ampola 5 ml",
      "Dipirona 500 mg, comprimidos",
      "Dipirona sódica 500 mg/ml, gotas, frasco",
      "Isossorbida Mononitrato ampola 10 mg/1 ml",
      "Adenosina ampola 6 mg/2 ml",
      "Amiodarona ampola 150 mg/3 ml",
      "Heparina Sódica frasco-ampola 5.000 UI/0,25 ml",
      "Heparina Sódica frasco-ampola 25.000 UI/5 ml",
      "Atropina ampola 0,25 mg/1 ml",
      "Medroxiprogesterona ampola de 150 mg",
      "Noretisterona + Valerato de Estradiol ampola",
      "Fenitoína ampola 250 mg/5 ml",
      "Fenobarbital ampola 200 mg/2 ml",
      "Flumazenil ampola 0,5 mg/5 ml",
      "Naloxona ampola 0,4 mg/1 ml",
      "Metoclopramida ampola 10 mg/2 ml",
      "Dimenidrinato + Vitamina B6 (dimenidrinato 50 mg + vit. B6 50 mg) ampola 1 ml",
      "Dimenidrinato + Vitamina B6 DL + Glicose + Frutose (dimenidrinato 30 mg + vit. B6 50 mg + glicose 1 g + frutose 1 g) ampola 10 ml",
      "N-Butilescopolamina ampola 20 mg/ml",
      "Prometazina ampola 50 mg/2 ml",
      "Dexametasona frasco-ampola 10 mg/2,5 ml",
      "Hidrocortisona Succinato de Hidrocortisona frasco-ampola 100 mg",
      "Hidrocortisona Succinato de Hidrocortisona frasco-ampola 500 mg",
      "Cetoprofeno ampola 100 mg/2 ml",
      "Diclofenaco ampola 75 mg/3 ml",
      "Amicacina ampola 100 mg/2 ml",
      "Amicacina ampola 500 mg/2 ml",
      "Gentamicina ampola 80 mg/2 ml",
      "Cefalotina frasco-ampola 1 g",
      "Ceftriaxona IV frasco-ampola 1 g",
      "Clindamicina ampola 300 mg/2 ml",
      "Claritromicina frasco-ampola 500 mg",
      "Ampicilina frasco-ampola 1 g",
      "Ampicilina frasco-ampola 500 g",
      "Oxacilina frasco-ampola 500 mg",
      "Penicilina G Benzatina frasco-ampola 600.000 UI",
      "Penicilina G Benzatina frasco-ampola 1.200.000 UI",
      "Penicilina G Potássica frasco-ampola 5.000.000 UI",
      "Penicilina G Procaína + Penicilina frasco-ampola 400.000 UI (penicilina G potássica procaína 300.000 UI + penicilina G potássica 100.000 UI)",
      "Ranitidina ampola 50 mg/2 ml",
      "Aminofilina ampola 240 mg/10 ml",
      "Terbutalina ampola 0,5 mg/1 ml",
      "Furosemida ampola 20 mg/2 ml",
      "Água Destilada ampola 10 ml",
      "Bicarbonato de Sódio 8,4% ampola 10 ml",
      "Cálcio Gluconato 10% (0,45 mEq/mL de Ca++) ampola 10 ml",
      "Glicose 25% ampola 10 ml",
      "Magnésio Sulfato 10% (0,81 mEq/mL de Mg++) ampola 10 ml",
      "Potássio Cloreto 19,1% ampola 10 ml",
      "Sódio Cloreto Soro Fisiológico 0,9% ampola 10 ml",
      "Sódio Cloreto 20% ampola 10 ml",
      "Adrenalina (Epinefrina) ampola 1 mg/1 ml",
      "Noradrenalina (Norepinefrina) ampola 4 mg/4 ml",
      "Dobutamina ampola 250 mg/20 ml",
      "Dopamina ampola 50 mg/10 ml",
      "Vitamina K (Fitomenadiona) ampola 10 mg/1 ml",
      "Midazolam ampola 15 mg/3 ml",
      "Midazolam ampola 50 mg/10 ml",
      "Estreptoquinase frasco-ampola 1.500.000 UI",
      "Pentoxifilina ampola 100 mg/5 ml",
      "Vitamina C ampola 500 g/5 ml",
      "Haloperidol decanoato 70,62 mg, ampola",
      "Medroxiprogesterona 150 mg/ml, ampola",
      "Noretisterona 50 mg + Valerato de Estradiol 5 mg, ampola"
    ],
    "viaFuzzy": false,
    "total": 65,
    "melhor": "Adifenina + Dipirona + Prometazina (adifenina 25 mg + dipirona 750 mg + prometazina 25 mg) ampola 2 ml"
  },
  "Mendes|novalgina": {
    "itens": [],
    "viaFuzzy": false,
    "total": 0,
    "melhor": null
  },
  "Betim|losartana comprimido": {
    "itens": [
      "Losartana 50mg - Comprimido"
    ],
    "viaFuzzy": false,
    "total": 1,
    "melhor": "Losartana 50mg - Comprimido"
  },
  "Macaé|omeprazol": {
    "itens": [
      "Omeprazol 20mg cápsula gel.dura",
      "Omeprazol 40mg pó liof.para solução injetável Iv f/a \\+ ampola diluente 10ml"
    ],
    "viaFuzzy": false,
    "total": 2,
    "melhor": "Omeprazol 20mg cápsula gel.dura"
  },
  "Sete Lagoas|xxxxxxinexistente": {
    "itens": [],
    "viaFuzzy": false,
    "total": 0,
    "melhor": null
  },
  "Mendes|comprimido": {
    "itens": [
      "Aciclovir 200mg - Comprimido",
      "Ácido Acetilsalicílico 100mg - Comprimido",
      "Ácido Fólico 5mg - Comprimido",
      "Albendazol 400mg - Comprimido Mastigável",
      "Alendronato de Sódio 70mg - Comprimido",
      "Alopurinol 100mg - Comprimido",
      "Alopurinol 300mg - Comprimido",
      "Alprazolam 1mg - Comprimido",
      "Aminofilina 100mg - Comprimido",
      "Ampicilina Sódica 500mg - Comprimido",
      "Aripiprazol 10mg - Comprimido",
      "Atenolol 50mg - Comprimido",
      "Atomoxetina 10mg - Comprimido",
      "Atomoxetina 25mg - Comprimido",
      "Azitromicina 500mg - Comprimido",
      "Besilato de Anlodipino 10mg - Comprimido",
      "Besilato de Anlodipino 5mg - Comprimido",
      "Bisacodil 5mg - Comprimido",
      "Bromazepam 6mg - Comprimido",
      "Bromoprida 10mg - Comprimido",
      "Bupropiona 150mg - Comprimido",
      "Butilescopolamina + Dipirona Sódica 10mg+250mg - Comprimido",
      "Captopril 25mg - Comprimido",
      "Carbamazepina 200mg - Comprimido",
      "Carbonato de Cálcio + Colecalciferol 500mg+400ui - Comprimido",
      "Carbonato de Cálcio 500mg - Comprimido",
      "Carbonato de Lítio 300mg - Comprimido",
      "Carvedilol 12,5mg - Comprimido",
      "Carvedilol 3,125mg - Comprimido",
      "Carvedilol 6,25mg - Comprimido",
      "Cefalexina 500mg - Comprimido",
      "Cetoconazol 200mg - Comprimido",
      "Cinarizina 75mg - Comprimido",
      "Ciprofloxacino 500mg - Comprimido",
      "Clobazam 20mg - Comprimido",
      "Clofazimina + Rifampicina + Dapsona (Esquema MB) - Comprimido",
      "Clonazepam 0,5mg - Comprimido",
      "Clonazepam 2mg - Comprimido",
      "Clopidogrel 75mg - Comprimido",
      "Cloridrato de Amiodarona 200mg - Comprimido",
      "Cloridrato de Amitriptilina 25mg - Comprimido",
      "Cloridrato de Biperideno 2mg - Comprimido",
      "Cloridrato de Ciprofloxacino 500mg - Comprimido",
      "Cloridrato de Clomipramina 25mg - Comprimido",
      "Cloridrato de Clorpromazina 100mg - Comprimido",
      "Cloridrato de Clorpromazina 25mg - Comprimido",
      "Cloridrato de Diltiazem 30mg - Comprimido",
      "Cloridrato de Diltiazem 60mg - Comprimido",
      "Cloridrato de Hidralazina 25mg - Comprimido",
      "Cloridrato de Hidralazina 50mg - Comprimido",
      "Cloridrato de Imipramina 25mg - Comprimido",
      "Cloridrato de Metformina 500mg - Comprimido",
      "Cloridrato de Metformina 850mg - Comprimido",
      "Cloridrato de Metoclopramida 10mg - Comprimido",
      "Cloridrato de Prometazina 25mg - Comprimido",
      "Cloridrato de Propranolol 40mg - Comprimido",
      "Cloridrato de Tiamina 300mg - Comprimido",
      "Cloridrato de Tioridazina 100mg - Comprimido",
      "Cloridrato de Tioridazina 25mg - Comprimido",
      "Cloridrato de Tioridazina 50mg - Comprimido",
      "Cloridrato de Verapamil 80mg - Comprimido",
      "Dapsona + Rifampicina (Esquema PB) - Comprimido",
      "Desvenlafaxina 50mg - Comprimido",
      "Dexametasona 4mg - Comprimido",
      "Diazepam 10mg - Comprimido",
      "Diazepam 5mg - Comprimido",
      "Diclofenaco de Sódio 50mg - Comprimido",
      "Digoxina 0,25mg - Comprimido",
      "Dimeticona 40mg - Comprimido",
      "Dinitrato de Isossorbida 10mg - Comprimido",
      "Dinitrato de Isossorbida 5mg - Comprimido Sublingual",
      "Dipirona Sódica 500mg - Comprimido",
      "Escitalopram 20mg - Comprimido",
      "Escopolamina + Dipirona Sódica 10mg+250mg - Comprimido",
      "Espironolactona 25mg - Comprimido",
      "Espironolactona 50mg - Comprimido",
      "Espironolactona 50mg - Comprimido Revestido",
      "Fenitoína 100mg - Comprimido",
      "Fenitoína Sódica 100mg - Comprimido",
      "Fenobarbital 100mg - Comprimido"
    ],
    "viaFuzzy": false,
    "total": 157,
    "melhor": "Aciclovir 200mg - Comprimido"
  }
};

const RETRATO_CID = {
  "J06.9": {
    "itens": [
      "J06.9|Infecção Aguda Das Vias Aéreas Superiores Não Especificada",
      "J06|Infecções Agudas Das Vias Aéreas Superiores de Localizações Múltiplas e Não Especificadas",
      "J06.0|Laringofaringite Aguda",
      "J06.8|Outras Infecções Agudas Das Vias Aéreas Superiores de Localizações Múltiplas",
      "A00.9|Cólera Não Especificada",
      "A02.9|Infecção Não Especificada Por Salmonela",
      "A03.9|Shiguelose Não Especificada",
      "A04.9|Infecção Intestinal Bacteriana Não Especificada",
      "A05.9|Intoxicação Alimentar Bacteriana Não Especificada",
      "A06.9|Amebíase Não Especificada",
      "A07.9|Doença Intestinal Não Especificada Por Protozoários",
      "A09|Diarréia e Gastroenterite de Origem Infecciosa Presumível",
      "A15.9|Tuberculose Não Especificada Das Vias Respiratórias, Com Confirmação Bacteriológica e Histológica",
      "A16.9|Tuberculose Respiratória, Não Especificada, Sem Menção de Confirmação Bacteriológica ou Histológica",
      "A17.9|Tuberculose Não Especificada do Sistema Nervoso",
      "A19|Tuberculose Miliar",
      "A19.0|Tuberculose Miliar Aguda de Localização Única e Especificada",
      "A19.1|Tuberculose Miliar Aguda de Múltiplas Localizações",
      "A19.2|Tuberculose Miliar Aguda Não Especificada",
      "A19.8|Outras Tuberculoses Miliares",
      "A19.9|Tuberculose Miliar Não Especificada",
      "A20.9|Peste, Forma Não Especificada",
      "A21.9|Tularemia, Forma Não Especificada",
      "A22.9|Carbúnculo, Forma Não Especificada",
      "A23.9|Brucelose Não Especificada",
      "A25.9|Febre Transmitida Por Mordedura de Rato, Tipo Não Especificado",
      "A26.9|Erisipelóide Não Especificado",
      "A27.9|Leptospirose Não Especificada",
      "A28.9|Doença Bacteriana Zoonótica Não Especificada",
      "A30.9|Hanseníase (lepra) Não Especificada",
      "A31.9|Infecção Micobacteriana Não Especificada",
      "A32.9|Listeriose Não Especificada",
      "A36.9|Difteria Não Especificada",
      "A37.9|Coqueluche Não Especificada",
      "A39|Infecção Meningogócica",
      "A39.0|Meningite Meningocócica",
      "A39.1|Síndrome de Waterhouse-Friderichsen",
      "A39.2|Meningococcemia Aguda",
      "A39.3|Meningococcemia Crônica",
      "A39.4|Meningococcemia Não Especificada",
      "A39.5|Cardite Por Meningococos",
      "A39.8|Outras Infecções Por Meningococos",
      "A39.9|Infecção Meningocócica Não Especificada",
      "A40.9|Septicemia Estreptocócica Não Especificada",
      "A41.9|Septicemia Não Especificada",
      "A42.9|Actinomicose Não Especificada",
      "A43.9|Nocardiose Não Especificada",
      "A44.9|Bartonelose Não Especificada",
      "A49|Infecção Bacteriana de Localização Não Especificada",
      "A49.0|Infecção Estafilocócica de Localização Não Especificada",
      "A49.1|Infecção Estreptocócica de Localização Não Especificada",
      "A49.2|Infecção Por Haemophilus Influenzae de Localização Não Especificada",
      "A49.3|Infecção Por Mycoplasma de Localização Não Especificada",
      "A49.8|Outras Infecções Bacterianas de Localização Não Especificada",
      "A49.9|Infecção Bacteriana Não Especificada",
      "A50.9|Sífilis Congênita Não Especificada",
      "A51.9|Sífilis Precoce Não Especificada",
      "A52.9|Sífilis Tardia Não Especificada",
      "A53.9|Sífilis Não Especificada",
      "A54.9|Infecção Gonocócica Não Especificada",
      "A59|Tricomoníase",
      "A59.0|Tricomoníase Urogenital",
      "A59.8|Outras Localizações de Tricomoníase",
      "A59.9|Tricomoníase Não Especificada",
      "A60.9|Infecção Anogenital Não Especificada Pelo Vírus do Herpes",
      "A66.9|Bouba Não Especificada",
      "A67.9|Pinta Não Especificada",
      "A68.9|Febre Recorrente Não Especificada",
      "A69|Outras Infecções Por Espiroquetas",
      "A69.0|Estomatite Ulcerativa Necrotizante",
      "A69.1|Outras Infecções de Vincent",
      "A69.2|Doença de Lyme",
      "A69.8|Outras Infecções Especificadas Por Espiroquetas",
      "A69.9|Infecção Por Espiroqueta, Não Especificada",
      "A71.9|Tracoma Não Especificado",
      "A74.9|Infecção Causada Por Clamídias Não Especificada",
      "A75.9|Tifo Não Especificado",
      "A77.9|Febre Maculosa Não Especificada",
      "A79|Outras Rickettsioses",
      "A79.0|Febre Das Trincheiras"
    ],
    "viaFuzzy": false,
    "total": 3489,
    "melhor": "J06.9"
  },
  "fibrilacao atrial": {
    "itens": [
      "I48|Flutter e Fibrilação Atrial",
      "I23.1|Comunicação Interatrial Como Complicação Atual Subseqüente ao Infarto Agudo do Miocárdio",
      "I49.0|Flutter e Fibrilação Ventricular",
      "I49.1|Despolarização Atrial Prematura",
      "Q20.3|Comunicação Ventrículo-atrial Discordante",
      "Q21.1|Comunicação Interatrial"
    ],
    "viaFuzzy": false,
    "total": 6,
    "melhor": "I48"
  },
  "J069": {
    "itens": [
      "J06.9|Infecção Aguda Das Vias Aéreas Superiores Não Especificada",
      "A06.9|Amebíase Não Especificada",
      "B06.9|Rubéola Sem Complicação",
      "C06.9|Neoplasia Maligna da Boca, Não Especificada",
      "D06.9|Carcinoma in Situ do Colo do Útero, Não Especificado",
      "E06.9|Tireoidite Não Especificada",
      "F06.9|Transtorno Mental Não Especificado Devido a Uma Lesão e Disfunção Cerebral e a Uma Doença Física",
      "I06.9|Doença Reumática da Valva Aórtica, Não Especificada",
      "J01.9|Sinusite Aguda Não Especificada",
      "J02.9|Faringite Aguda Não Especificada",
      "J03.9|Amigdalite Aguda Não Especificada",
      "J06|Infecções Agudas Das Vias Aéreas Superiores de Localizações Múltiplas e Não Especificadas",
      "J06.0|Laringofaringite Aguda",
      "J06.8|Outras Infecções Agudas Das Vias Aéreas Superiores de Localizações Múltiplas",
      "J09|Influenza (gripe) Devida a Vírus Identificado da Gripe Aviária",
      "J69|Pneumonite Devida a Sólidos e Líquidos",
      "J69.0|Pneumonite Devida a Alimento ou Vômito",
      "J69.1|Pneumonite Devida a Óleos e Essências",
      "J69.8|Pneumonite Devida a Outros Sólidos e Líquidos",
      "J86.9|Piotórax Sem Fístula",
      "J96.9|Insuficiência Respiratória Não Especificada",
      "K06.9|Transtorno da Gengiva e do Rebordo Alveolar Sem Dentes Sem Outra Especificação",
      "M06.9|Artrite Reumatóide Não Especificada",
      "N06.9|Proteinúria Isolada Com Lesão Morfológica Especificada - Não Especificada",
      "O06.9|Aborto Não Especificado - Completo ou Não Especificado, Sem Complicações",
      "Q06.9|Malformação Congênita Não Especificada da Medula Espinal",
      "S06.9|Traumatismo Intracraniano, Não Especificado",
      "V06.9|Pedestre Traumatizado em Colisão Com Outro Veículo Não-motorizado - Acidente Não Especificado se de Trânsito ou Não de Trânsito",
      "W06.9|Queda de um Leito - Local Não Especificado",
      "X06.9|Exposição a Combustão de Outro Tipo de Roupa ou de Acessórios - Local Não Especificado",
      "Y06.9|Negligência e Abandono Por Pessoa Não Especificada"
    ],
    "viaFuzzy": false,
    "total": 31,
    "melhor": "J06.9"
  },
  "infarto": {
    "itens": [
      "D73.5|Infarto do Baço",
      "F01.1|Demência Por Infartos Múltiplos",
      "I21|Infarto Agudo do Miocárdio",
      "I21.0|Infarto Agudo Transmural da Parede Anterior do Miocárdio",
      "I21.1|Infarto Agudo Transmural da Parede Inferior do Miocárdio",
      "I21.2|Infarto Agudo Transmural do Miocárdio de Outras Localizações",
      "I21.3|Infarto Agudo Transmural do Miocárdio, de Localização Não Especificada",
      "I21.4|Infarto Agudo Subendocárdico do Miocárdio",
      "I21.9|Infarto Agudo do Miocárdio Não Especificado",
      "I22|Infarto do Miocárdio Recorrente",
      "I22.0|Infarto do Miocárdio Recorrente da Parede Anterior",
      "I22.1|Infarto do Miocárdio Recorrente da Parede Inferior",
      "I22.8|Infarto do Miocárdio Recorrente de Outras Localizações",
      "I22.9|Infarto do Miocárdio Recorrente de Localização Não Especificada",
      "I23|Algumas Complicações Atuais Subseqüentes ao Infarto Agudo do Miocárdio",
      "I23.0|Hemopericárdio Como Complicação Atual Subseqüente ao Infarto Agudo do Miocárdio",
      "I23.1|Comunicação Interatrial Como Complicação Atual Subseqüente ao Infarto Agudo do Miocárdio",
      "I23.2|Comunicação Interventricular Como Complicação Atual Subseqüente ao Infarto Agudo do Miocárdio",
      "I23.3|Ruptura da Parede do Coração Sem Ocorrência de Hemopericárdio Como Complicação Atual Subseqüente ao Infarto Agudo do Miocárdio",
      "I23.4|Ruptura de Cordoalhas Tendíneas Como Complicação Atual Subseqüente ao Infarto Agudo do Miocárdio",
      "I23.5|Ruptura de Músculos Papilares Como Complicação Atual Subseqüente ao Infarto Agudo do Miocárdio",
      "I23.6|Trombose de Átrio, Aurícula e Ventrículo Como Complicação Atual Subseqüente ao Infarto Agudo do Miocárdio",
      "I23.8|Outras Complicações Atuais Subseqüentes ao Infarto Agudo do Miocárdio",
      "I24.0|Trombose Coronária Que Não Resulta em Infarto do Miocárdio",
      "I25.2|Infarto Antigo do Miocárdio",
      "I63|Infarto Cerebral",
      "I63.0|Infarto Cerebral Devido a Trombose de Artérias Pré-cerebrais",
      "I63.1|Infarto Cerebral Devido a Embolia de Artérias Pré-cerebrais",
      "I63.2|Infarto Cerebral Devido a Oclusão ou Estenose Não Especificadas de Artérias Pré-cerebrais",
      "I63.3|Infarto Cerebral Devido a Trombose de Artérias Cerebrais",
      "I63.4|Infarto Cerebral Devido a Embolia de Artérias Cerebrais",
      "I63.5|Infarto Cerebral Devido a Oclusão ou Estenose Não Especificadas de Artérias Cerebrais",
      "I63.6|Infarto Cerebral Devido a Trombose Venosa Cerebral Não-piogênica",
      "I63.8|Outros Infartos Cerebrais",
      "I63.9|Infarto Cerebral Não Especificado",
      "I65|Oclusão e Estenose de Artérias Pré-cerebrais Que Não Resultam em Infarto Cerebral",
      "I66|Oclusão e Estenose de Artérias Cerebrais Que Não Resultam em Infarto Cerebral",
      "I69.3|Seqüelas de Infarto Cerebral",
      "K76.3|Infarto do Fígado",
      "M62.2|Infarto Isquêmico do Músculo",
      "N28.0|Isquemia e Infarto Renal",
      "Z03.4|Observação Por Suspeita de Infarto do Miocárdio"
    ],
    "viaFuzzy": false,
    "total": 42,
    "melhor": "D73.5"
  },
  "avc": {
    "itens": [
      "I64|Acidente Vascular Cerebral, Não Especificado Como Hemorrágico ou Isquêmico",
      "I69.4|Seqüelas de Acidente Vascular Cerebral Não Especificado Como Hemorrágico ou Isquêmico",
      "Z82.3|História Familiar de Acidente Vascular Cerebral"
    ],
    "viaFuzzy": false,
    "total": 3,
    "melhor": "I64"
  },
  "hipertensao": {
    "itens": [
      "G93.2|Hipertensão Intracraniana Benigna",
      "I10|Hipertensão Essencial (primária)",
      "I15|Hipertensão Secundária",
      "I15.0|Hipertensão Renovascular",
      "I15.1|Hipertensão Secundária a Outras Afecções Renais",
      "I15.2|Hipertensão Secundária a Afecções Endócrinas",
      "I15.8|Outras Formas de Hipertensão Secundária",
      "I15.9|Hipertensão Secundária, Não Especificada",
      "I27.0|Hipertensão Pulmonar Primária",
      "I27.2|Outra Hipertensão Pulmonar Secundária",
      "K76.6|Hipertensão Portal",
      "O10|Hipertensão Pré-existente Complicando a Gravidez, o Parto e o Puerpério",
      "O10.0|Hipertensão Essencial Pré-existente Complicando a Gravidez, o Parto e o Puerpério",
      "O10.4|Hipertensão Secundária Pré-existente Complicando a Gravidez, o Parto e o Puerpério",
      "O10.9|Hipertensão Pré-existente Não Especificada, Complicando a Gravidez, o Parto e o Puerpério",
      "O12|Edema e Proteinúria Gestacionais (induzidos Pela Gravidez), Sem Hipertensão",
      "O13|Hipertensão Gestacional (induzida Pela Gravidez) Sem Proteinúria Significativa",
      "O14|Hipertensão Gestacional (induzida Pela Gravidez) Com Proteinúria Significativa",
      "O16|Hipertensão Materna Não Especificada",
      "P29.2|Hipertensão Neonatal",
      "R03.0|Valor Elevado da Pressão Arterial Sem o Diagnóstico de Hipertensão"
    ],
    "viaFuzzy": false,
    "total": 21,
    "melhor": "G93.2"
  },
  "diabtes": {
    "itens": [
      "E10|Diabetes Mellitus Insulino-dependente",
      "E10.0|Diabetes Mellitus Insulino-dependente - Com Coma",
      "E10.1|Diabetes Mellitus Insulino-dependente - Com Cetoacidose",
      "E10.2|Diabetes Mellitus Insulino-dependente - Com Complicações Renais",
      "E10.3|Diabetes Mellitus Insulino-dependente - Com Complicações Oftálmicas",
      "E10.4|Diabetes Mellitus Insulino-dependente - Com Complicações Neurológicas",
      "E10.5|Diabetes Mellitus Insulino-dependente - Com Complicações Circulatórias Periféricas",
      "E10.6|Diabetes Mellitus Insulino-dependente - Com Outras Complicações Especificadas",
      "E10.7|Diabetes Mellitus Insulino-dependente - Com Complicações Múltiplas",
      "E10.8|Diabetes Mellitus Insulino-dependente - Com Complicações Não Especificadas",
      "E10.9|Diabetes Mellitus Insulino-dependente - Sem Complicações",
      "E11|Diabetes Mellitus Não-insulino-dependente",
      "E11.0|Diabetes Mellitus Não-insulino-dependente - Com Coma",
      "E11.1|Diabetes Mellitus Não-insulino-dependente - Com Cetoacidose",
      "E11.2|Diabetes Mellitus Não-insulino-dependente - Com Complicações Renais",
      "E11.3|Diabetes Mellitus Não-insulino-dependente - Com Complicações Oftálmicas",
      "E11.4|Diabetes Mellitus Não-insulino-dependente - Com Complicações Neurológicas",
      "E11.5|Diabetes Mellitus Não-insulino-dependente - Com Complicações Circulatórias Periféricas",
      "E11.6|Diabetes Mellitus Não-insulino-dependente - Com Outras Complicações Especificadas",
      "E11.7|Diabetes Mellitus Não-insulino-dependente - Com Complicações Múltiplas",
      "E11.8|Diabetes Mellitus Não-insulino-dependente - Com Complicações Não Especificadas",
      "E11.9|Diabetes Mellitus Não-insulino-dependente - Sem Complicações",
      "E12|Diabetes Mellitus Relacionado Com a Desnutrição",
      "E12.0|Diabetes Mellitus Relacionado Com a Desnutrição - Com Coma",
      "E12.1|Diabetes Mellitus Relacionado Com a Desnutrição - Com Cetoacidose",
      "E12.2|Diabetes Mellitus Relacionado Com a Desnutrição - Com Complicações Renais",
      "E12.3|Diabetes Mellitus Relacionado Com a Desnutrição - Com Complicações Oftálmicas",
      "E12.4|Diabetes Mellitus Relacionado Com a Desnutrição - Com Complicações Neurológicas",
      "E12.5|Diabetes Mellitus Relacionado Com a Desnutrição - Com Complicações Circulatórias Periféricas",
      "E12.6|Diabetes Mellitus Relacionado Com a Desnutrição - Com Outras Complicações Especificadas",
      "E12.7|Diabetes Mellitus Relacionado Com a Desnutrição - Com Complicações Múltiplas",
      "E12.8|Diabetes Mellitus Relacionado Com a Desnutrição - Com Complicações Não Especificadas",
      "E12.9|Diabetes Mellitus Relacionado Com a Desnutrição - Sem Complicações",
      "E13|Outros Tipos Especificados de Diabetes Mellitus",
      "E13.0|Outros Tipos Especificados de Diabetes Mellitus - Com Coma",
      "E13.1|Outros Tipos Especificados de Diabetes Mellitus - Com Cetoacidose",
      "E13.2|Outros Tipos Especificados de Diabetes Mellitus - Com Complicações Renais",
      "E13.3|Outros Tipos Especificados de Diabetes Mellitus - Com Complicações Oftálmicas",
      "E13.4|Outros Tipos Especificados de Diabetes Mellitus - Com Complicações Neurológicas",
      "E13.5|Outros Tipos Especificados de Diabetes Mellitus - Com Complicações Circulatórias Periféricas",
      "E13.6|Outros Tipos Especificados de Diabetes Mellitus - Com Outras Complicações Especificadas",
      "E13.7|Outros Tipos Especificados de Diabetes Mellitus - Com Complicações Múltiplas",
      "E13.8|Outros Tipos Especificados de Diabetes Mellitus - Com Complicações Não Especificadas",
      "E13.9|Outros Tipos Especificados de Diabetes Mellitus - Sem Complicações",
      "E14|Diabetes Mellitus Não Especificado",
      "E14.0|Diabetes Mellitus Não Especificado - Com Coma",
      "E14.1|Diabetes Mellitus Não Especificado - Com Cetoacidose",
      "E14.2|Diabetes Mellitus Não Especificado - Com Complicações Renais",
      "E14.3|Diabetes Mellitus Não Especificado - Com Complicações Oftálmicas",
      "E14.4|Diabetes Mellitus Não Especificado - Com Complicações Neurológicas",
      "E14.5|Diabetes Mellitus Não Especificado - Com Complicações Circulatórias Periféricas",
      "E14.6|Diabetes Mellitus Não Especificado - Com Outras Complicações Especificadas",
      "E14.7|Diabetes Mellitus Não Especificado - Com Complicações Múltiplas",
      "E14.8|Diabetes Mellitus Não Especificado - Com Complicações Não Especificadas",
      "E14.9|Diabetes Mellitus Não Especificado - Sem Complicações",
      "E23.2|Diabetes Insípido",
      "N08.3|Transtornos Glomerulares no Diabetes Mellitus",
      "N25.1|Diabetes Insípido Nefrogênico",
      "O24|Diabetes Mellitus na Gravidez",
      "O24.0|Diabetes Mellitus Pré-existente, Insulino-dependente",
      "O24.1|Diabetes Mellitus Pré-existente, Não-insulino-dependente",
      "O24.2|Diabetes Mellitus Pré-existente, Relacionado Com a Desnutrição",
      "O24.3|Diabetes Mellitus Pré-existente, Não Especificado",
      "O24.4|Diabetes Mellitus Que Surge Durante a Gravidez",
      "O24.9|Diabetes Mellitus na Gravidez, Não Especificado",
      "P70.0|Síndrome do Filho de Mãe Com Diabetes Gestacional",
      "P70.2|Diabetes Mellitus Neonatal",
      "Z13.1|Exame Especial de Rastreamento de Diabetes Mellitus",
      "Z83.3|História Familiar de Diabetes Mellitus",
      "X81|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento",
      "X81.0|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Residência",
      "X81.1|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Habitação Coletiva",
      "X81.2|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Escolas, Outras Instituições e Áreas de Administração Pública",
      "X81.3|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Área Para a Prática de Esportes e Atletismo",
      "X81.4|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Rua e Estrada",
      "X81.5|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Áreas de Comércio e de Serviços",
      "X81.6|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Áreas Industriais e em Construção",
      "X81.7|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Fazenda",
      "X81.8|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Outros Locais Especificados",
      "X81.9|Lesão Autoprovocada Intencionalmente Por Precipitação ou Permanência Diante de um Objeto em Movimento - Local Não Especificado"
    ],
    "viaFuzzy": true,
    "total": 102,
    "melhor": "E10"
  },
  "pneumonia": {
    "itens": [
      "A40.3|Septicemia Por Streptococcus Pneumonia",
      "B05.2|Sarampo Complicado Por Pneumonia",
      "B20.6|Doença Pelo HIV Resultando em Pneumonia Por Pneumocystis Jirovecii",
      "B95.3|Streptococcus Pneumoniae, Como Causa de Doenças Classificadas em Outros Capítulos",
      "B96.0|Mycoplasma Pneumoniae (M. Pneumoniae), Como Causa de Doenças Classificadas em Outros Capítulos",
      "B96.1|Klebsiella Pneumoniae (M. Pneumoniae), Como Causa de Doenças Classificadas em Outros Capítulos",
      "J10.0|Influenza Com Pneumonia Devida a Outro Vírus da Influenza (gripe) Identificado",
      "J11.0|Influenza (gripe) Com Pneumonia, Devida a Vírus Não Identificado",
      "J12|Pneumonia Viral Não Classificada em Outra Parte",
      "J12.0|Pneumonia Devida a Adenovírus",
      "J12.1|Pneumonia Devida a Vírus Respiratório Sincicial",
      "J12.2|Pneumonia Devida à Parainfluenza",
      "J12.8|Outras Pneumonias Virais",
      "J12.9|Pneumonia Viral Não Especificada",
      "J13|Pneumonia Devida a Streptococcus Pneumoniae",
      "J14|Pneumonia Devida a Haemophilus Infuenzae",
      "J15|Pneumonia Bacteriana Não Classificada em Outra Parte",
      "J15.0|Pneumonia Devida à Klebsiella Pneumoniae",
      "J15.1|Pneumonia Devida a Pseudomonas",
      "J15.2|Pneumonia Devida a Staphylococcus",
      "J15.3|Pneumonia Devida a Streptococcus do Grupo B",
      "J15.4|Pneumonia Devida a Outros Estreptococos",
      "J15.5|Pneumonia Devida a Escherichia Coli",
      "J15.6|Pneumonia Devida a Outras Bactérias Aeróbicas Gram-negativas",
      "J15.7|Pneumonia Devida a Mycoplasma Pneumoniae",
      "J15.8|Outras Pneumonias Bacterianas",
      "J15.9|Pneumonia Bacteriana Não Especificada",
      "J16|Pneumonia Devida a Outros Microorganismos Infecciosos Especificados Não Classificados em Outra Parte",
      "J16.0|Pneumonia Devida a Clamídias",
      "J16.8|Pneumonia Devida a Outros Microorganismos Infecciosos Especificados",
      "J17|Pneumonia em Doenças Classificadas em Outra Parte",
      "J17.0|Pneumonia em Doenças Bacterianas Classificadas em Outra Parte",
      "J17.1|Pneumonia em Doenças Virais Classificadas em Outra Parte",
      "J17.2|Pneumonia em Micoses Classificadas em Outra Parte",
      "J17.3|Pneumonia em Doenças Parasitárias Classificadas em Outra Parte",
      "J17.8|Pneumonia em Outras Doenças Classificadas em Outra Parte",
      "J18|Pneumonia Por Microorganismo Não Especificada",
      "J18.0|Broncopneumonia Não Especificada",
      "J18.1|Pneumonia Lobar Não Especificada",
      "J18.2|Pneumonia Hipostática Não Especificada",
      "J18.8|Outras Pneumonias Devidas a Microorganismos Não Especificados",
      "J18.9|Pneumonia Não Especificada",
      "J20.0|Bronquite Aguda Devida a Mycoplasma Pneumoniae",
      "J85.1|Abscesso do Pulmão Com Pneumonia",
      "J85.2|Abscesso do Pulmão Sem Pneumonia",
      "P23|Pneumonia Congênita",
      "P23.0|Pneumonia Congênita Devida a Agente Viral",
      "P23.1|Pneumonia Congênita Devida a Clamídia",
      "P23.2|Pneumonia Congênita Devida a Estafilococo",
      "P23.3|Pneumonia Congênita Devida a Estreptococo do Grupo B",
      "P23.4|Pneumonia Congênita Devida a Escherichia Coli",
      "P23.5|Pneumonia Congênita Devida a Pseudomonas",
      "P23.6|Pneumonia Congênita Devida a Outros Agentes Bacterianos",
      "P23.8|Pneumonia Congênita Devida a Outros Organismos",
      "P23.9|Pneumonia Congênita Não Especificada"
    ],
    "viaFuzzy": false,
    "total": 55,
    "melhor": "A40.3"
  },
  "xyzinexistentecodigo": {
    "itens": [],
    "viaFuzzy": false,
    "total": 0,
    "melhor": null
  }
};

[
  ["Mendes", "acetilcisteina comprimido"],
  ["Macaé", "dipirona comprimido"],
  ["Betim", "amoxicilina"],
  ["Sete Lagoas", "paracetamol"],
  ["Itaúna", "insulina"],
  ["Barbacena", "adrenalina ampola"],
  ["Franco da Rocha", "dipirona ampola"],
  ["Mendes", "novalgina"],
  ["Betim", "losartana comprimido"],
  ["Macaé", "omeprazol"],
  ["Sete Lagoas", "xxxxxxinexistente"],
  ["Mendes", "comprimido"],
].forEach(function (c) { checarRemume(c[0], c[1], RETRATO_REMUME[c[0] + "|" + c[1]]); });

[
  ["J06.9", {}],
  ["fibrilacao atrial", {}],
  ["J069", {}],
  ["infarto", { sinonimos: CID_SINONIMOS }],
  ["avc", { sinonimos: CID_SINONIMOS }],
  ["hipertensao", { sinonimos: CID_SINONIMOS }],
  ["diabtes", { sinonimos: CID_SINONIMOS }],
  ["pneumonia", {}],
  ["xyzinexistentecodigo", {}],
].forEach(function (c) { checarCid(c[0], c[1], RETRATO_CID[c[0]]); });

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "todos passaram"));
if (falhas) process.exit(1);
