"use strict";

/* ---------------------------------------------------------------- dados --- */

const TURMAS = [
  { id: "t-seg", nome: "Modelagem — segunda", dia: 1, horario: "19h00 às 21h00", regulares: 8, reposicoes: 2, mensalidade: 380 },
  { id: "t-ter", nome: "Modelagem — terça", dia: 2, horario: "14h00 às 16h00", regulares: 8, reposicoes: 2, mensalidade: 380 },
  { id: "t-qui", nome: "Torno — quinta", dia: 4, horario: "19h00 às 21h00", regulares: 6, reposicoes: 2, mensalidade: 420 },
];

const ALUNOS = [
  { id: "a-marina", nome: "Marina Bastos", turmaId: "t-ter" },
  { id: "a-rafael", nome: "Rafael Aguiar", turmaId: "t-ter" },
  { id: "a-heloisa", nome: "Heloísa Prado", turmaId: "t-ter" },
  { id: "a-camila", nome: "Camila Reis", turmaId: "t-ter" },
  { id: "a-sergio", nome: "Sérgio Vasques", turmaId: "t-ter" },
  { id: "a-bruna", nome: "Bruna Antunes", turmaId: "t-ter" },
  { id: "a-otavio", nome: "Otávio Lins", turmaId: "t-ter" },
  { id: "a-dandara", nome: "Dandara Nogueira", turmaId: "t-ter" },
  { id: "a-neusa", nome: "Neusa Camargo", turmaId: "t-seg" },
  { id: "a-tiago", nome: "Tiago Meireles", turmaId: "t-seg" },
  { id: "a-lucia", nome: "Lúcia Fontes", turmaId: "t-seg" },
  { id: "a-ivo", nome: "Ivo Bertoldo", turmaId: "t-seg" },
  { id: "a-selma", nome: "Selma Prates", turmaId: "t-seg" },
  { id: "a-helio", nome: "Hélio Munhoz", turmaId: "t-seg" },
  { id: "a-aparecida", nome: "Aparecida Rangel", turmaId: "t-qui" },
  { id: "a-joel", nome: "Joel Cardim", turmaId: "t-qui" },
  { id: "a-vitoria", nome: "Vitória Sampaio", turmaId: "t-qui" },
  { id: "a-nelson", nome: "Nelson Prado", turmaId: "t-qui" },
];

const PRODUTOS = [
  { id: "p-argila", nome: "Argila branca, 10 kg", preco: 68, estoque: 12 },
  { id: "p-esmalte", nome: "Esmalte transparente, 500 ml", preco: 92.5, estoque: 4 },
  { id: "p-estecas", nome: "Kit de estecas", preco: 145, estoque: 0 },
  { id: "p-oxido", nome: "Óxido de ferro, 250 g", preco: 39.9, estoque: 7 },
  { id: "p-queima", nome: "Queima avulsa", preco: 55, estoque: 20 },
];

const INADIMPLENTES = ["a-marina", "a-tiago", "a-dandara"];
const AULAS_POR_TURMA = 4;
const CHAVE = "esculturalizando:v1";

/* ---------------------------------------------------------------- datas --- */

function hoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function iso(d) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mes + "-" + dia;
}

function daIso(s) {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d);
}

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "long" });
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function dataCurta(s) {
  return fmtData.format(daIso(s));
}

function diaSemana(s) {
  return fmtDiaSemana.format(daIso(s));
}

function chaveMes(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function nomeMes(chave) {
  const [a, m] = chave.split("-").map(Number);
  return fmtMes.format(new Date(a, m - 1, 1));
}

/* --------------------------------------------------------------- estado --- */

let estado = carregar();

function estadoNovo() {
  const estoque = {};
  PRODUTOS.forEach((p) => (estoque[p.id] = p.estoque));
  return { v: 1, alunoAtual: "a-marina", pagas: [], faltas: {}, reposicoes: {}, estoque, compras: [] };
}

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return estadoNovo();
    const salvo = JSON.parse(bruto);
    if (salvo && salvo.v === 1) return Object.assign(estadoNovo(), salvo);
  } catch (e) {
    /* armazenamento indisponível ou corrompido: segue com dados de exemplo */
  }
  return estadoNovo();
}

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch (e) {
    /* sem persistência, mas a sessão continua utilizável */
  }
}

/* ---------------------------------------------------------- derivações --- */

function turma(id) {
  return TURMAS.find((t) => t.id === id);
}

function aluno(id) {
  return ALUNOS.find((a) => a.id === id);
}

function alunoAtual() {
  return aluno(estado.alunoAtual) || ALUNOS[0];
}

function alunosDaTurma(turmaId) {
  return ALUNOS.filter((a) => a.turmaId === turmaId);
}

function proximasAulas() {
  const base = hoje();
  const lista = [];
  TURMAS.forEach((t) => {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== t.dia) d.setDate(d.getDate() + 1);
    for (let i = 0; i < AULAS_POR_TURMA; i++) {
      const data = iso(d);
      lista.push({ id: t.id + ":" + data, turmaId: t.id, data: data });
      d.setDate(d.getDate() + 7);
    }
  });
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

function faltasDe(aulaId) {
  return estado.faltas[aulaId] || [];
}

function reposicoesDe(aulaId) {
  return estado.reposicoes[aulaId] || [];
}

function ocupacao(aula) {
  const t = turma(aula.turmaId);
  return {
    regulares: { ocupadas: alunosDaTurma(t.id).length, total: t.regulares },
    reposicoes: { ocupadas: reposicoesDe(aula.id).length, total: t.reposicoes },
  };
}

function creditos(alunoId) {
  let ganhos = 0;
  let gastos = 0;
  Object.keys(estado.faltas).forEach((k) => {
    if (estado.faltas[k].includes(alunoId)) ganhos++;
  });
  Object.keys(estado.reposicoes).forEach((k) => {
    if (estado.reposicoes[k].includes(alunoId)) gastos++;
  });
  return ganhos - gastos;
}

function mensalidades() {
  const base = hoje();
  const meses = [chaveMes(base), chaveMes(new Date(base.getFullYear(), base.getMonth() + 1, 1))];
  const lista = [];
  ALUNOS.forEach((a) => {
    meses.forEach((chave) => {
      const [ano, mes] = chave.split("-");
      lista.push({
        id: a.id + ":" + chave,
        alunoId: a.id,
        chave: chave,
        referencia: nomeMes(chave),
        valor: turma(a.turmaId).mensalidade,
        vencimento: ano + "-" + mes + "-10",
      });
    });
  });
  return lista;
}

function estaPaga(m) {
  if (estado.pagas.includes(m.id)) return true;
  if (m.chave === chaveMes(hoje())) return !INADIMPLENTES.includes(m.alunoId);
  return false;
}

function statusDe(m) {
  if (estaPaga(m)) return "pago";
  return daIso(m.vencimento) < hoje() ? "atrasado" : "aberto";
}

function pendencias() {
  return mensalidades()
    .filter((m) => statusDe(m) !== "pago")
    .sort((a, b) => {
      const peso = (m) => (statusDe(m) === "atrasado" ? 0 : 1);
      return peso(a) - peso(b) || a.vencimento.localeCompare(b.vencimento) || aluno(a.alunoId).nome.localeCompare(aluno(b.alunoId).nome);
    });
}

function estoqueDe(produtoId) {
  const v = estado.estoque[produtoId];
  return typeof v === "number" ? v : 0;
}

/* ---------------------------------------------------------------- ações --- */

let restaurarArmado = false;

const acoes = {
  "avisar-falta": function (aulaId) {
    const id = estado.alunoAtual;
    const lista = faltasDe(aulaId);
    if (lista.includes(id)) return;
    estado.faltas[aulaId] = lista.concat(id);
    aviso("Falta avisada. Você ganhou 1 crédito de reposição.");
  },
  "desfazer-falta": function (aulaId) {
    const id = estado.alunoAtual;
    if (creditos(id) < 1) {
      aviso("Cancele uma reposição marcada antes de desfazer o aviso.");
      return;
    }
    estado.faltas[aulaId] = faltasDe(aulaId).filter((x) => x !== id);
    aviso("Aviso de falta cancelado.");
  },
  "marcar-reposicao": function (aulaId) {
    const id = estado.alunoAtual;
    const aula = proximasAulas().find((a) => a.id === aulaId);
    if (!aula) return;
    if (creditos(id) < 1) {
      aviso("Sem crédito de reposição disponível.");
      return;
    }
    const oc = ocupacao(aula);
    if (oc.reposicoes.ocupadas >= oc.reposicoes.total) {
      aviso("Essa aula não tem mais vaga de reposição.");
      return;
    }
    if (reposicoesDe(aulaId).includes(id)) return;
    estado.reposicoes[aulaId] = reposicoesDe(aulaId).concat(id);
    aviso("Reposição marcada para " + diaSemana(aula.data) + ", " + dataCurta(aula.data) + ".");
  },
  "cancelar-reposicao": function (aulaId) {
    estado.reposicoes[aulaId] = reposicoesDe(aulaId).filter((x) => x !== estado.alunoAtual);
    aviso("Reposição cancelada. O crédito voltou para você.");
  },
  pagar: function (mensalidadeId) {
    if (estado.pagas.includes(mensalidadeId)) return;
    estado.pagas = estado.pagas.concat(mensalidadeId);
    aviso("Pagamento confirmado.");
  },
  comprar: function (produtoId) {
    const p = PRODUTOS.find((x) => x.id === produtoId);
    if (!p || estoqueDe(produtoId) < 1) return;
    estado.estoque[produtoId] = estoqueDe(produtoId) - 1;
    estado.compras = estado.compras.concat({
      alunoId: estado.alunoAtual,
      produtoId: produtoId,
      valor: p.preco,
      quando: iso(hoje()),
    });
    aviso(p.nome + " comprado.");
  },
  "repor-estoque": function (produtoId) {
    estado.estoque[produtoId] = estoqueDe(produtoId) + 1;
  },
  "baixar-estoque": function (produtoId) {
    if (estoqueDe(produtoId) < 1) return;
    estado.estoque[produtoId] = estoqueDe(produtoId) - 1;
  },
  restaurar: function () {
    if (!restaurarArmado) {
      restaurarArmado = true;
      aviso("Isso apaga tudo que você fez aqui. Toque de novo para confirmar.");
      return;
    }
    estado = estadoNovo();
    restaurarArmado = false;
    aviso("Dados de exemplo restaurados.");
  },
};

/* ------------------------------------------------------------ fragmentos --- */

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function icone(nome, classe) {
  return '<svg class="icon ' + (classe || "") + '" aria-hidden="true"><use href="#i-' + nome + '"/></svg>';
}

function iniciais(nome) {
  const partes = nome.trim().split(/\s+/);
  const a = partes[0] ? partes[0][0] : "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function avatar(nome, pequeno) {
  return '<span class="avatar' + (pequeno ? " avatar--sm" : "") + '" aria-hidden="true">' + esc(iniciais(nome)) + "</span>";
}

function dinheiro(valor, classe) {
  return '<span class="money ' + (classe || "") + '">' + fmtBRL.format(valor) + "</span>";
}

function iconeCirculo(nome) {
  return '<span class="icon-circle">' + icone(nome, "icon--lg") + "</span>";
}

function area(rota, nomeIcone, rotulo) {
  return (
    '<a class="area" href="#/' + rota + '">' + iconeCirculo(nomeIcone) + '<span class="area-label">' + esc(rotulo) + "</span></a>"
  );
}

function botao(rotulo, variante, acao, alvo, extras) {
  const o = extras || {};
  return (
    '<button class="btn btn--' +
    variante +
    (o.full ? " btn--full" : "") +
    (o.sm ? " btn--sm" : "") +
    '" data-acao="' +
    acao +
    '" data-alvo="' +
    esc(alvo) +
    '"' +
    (o.desabilitado ? " disabled" : "") +
    ">" +
    (o.icone ? icone(o.icone) : "") +
    esc(rotulo) +
    "</button>"
  );
}

function vazio(nomeIcone, titulo, descricao) {
  return (
    '<div class="empty">' +
    iconeCirculo(nomeIcone) +
    "<p>" +
    esc(titulo) +
    "</p>" +
    (descricao ? '<p class="label muted">' + esc(descricao) + "</p>" : "") +
    "</div>"
  );
}

function topo(titulo, voltarPara) {
  return (
    '<header class="topbar">' +
    (voltarPara ? '<a class="back" href="#/' + voltarPara + '" aria-label="Voltar">' + icone("arrow-left", "icon--lg") + "</a>" : "") +
    '<h1 class="screen-title">' +
    esc(titulo) +
    "</h1></header>"
  );
}

function cartaoOcupacao(aula, extra) {
  const t = turma(aula.turmaId);
  const oc = ocupacao(aula);
  const livres = oc.reposicoes.total - oc.reposicoes.ocupadas;
  return (
    '<article class="card">' +
    "<p>" +
    esc(t.nome) +
    '</p><p class="label muted">' +
    esc(diaSemana(aula.data)) +
    ", " +
    dataCurta(aula.data) +
    " · " +
    esc(t.horario) +
    "</p>" +
    '<div class="grid-2" style="margin-top:12px">' +
    '<div class="tally"><p class="micro muted">Vagas regulares</p><p class="tally-value">' +
    oc.regulares.ocupadas +
    " de " +
    oc.regulares.total +
    "</p></div>" +
    '<div class="tally"><p class="micro muted">Vagas de reposição</p><p class="tally-value">' +
    oc.reposicoes.ocupadas +
    " de " +
    oc.reposicoes.total +
    "</p></div></div>" +
    (livres > 0
      ? '<p class="inline-note micro muted" style="margin-top:12px">' +
        icone("circle-plus", "icon--sm icon--clay") +
        (livres === 1 ? "1 vaga de reposição livre" : livres + " vagas de reposição livres") +
        "</p>"
      : "") +
    (extra || "") +
    "</article>"
  );
}

function linhaPendencia(m, comBotao) {
  const a = aluno(m.alunoId);
  const atrasada = statusDe(m) === "atrasado";
  return (
    "<li>" +
    avatar(a.nome, true) +
    '<div class="row-main"><p class="row-name">' +
    esc(a.nome) +
    '</p><p class="inline-note micro muted">' +
    icone(atrasada ? "alert-circle" : "clock", "icon--sm " + (atrasada ? "icon--clay" : "icon--warn")) +
    (atrasada ? "Venceu" : "Vence") +
    " em " +
    dataCurta(m.vencimento) +
    "</p></div>" +
    '<div class="row-side">' +
    dinheiro(m.valor, atrasada ? "heading" : "muted") +
    (comBotao ? botao("Marcar paga", "neutral", "pagar", m.id, { sm: true }) : "") +
    "</div></li>"
  );
}

/* ---------------------------------------------------------------- telas --- */

function telaProfessor() {
  const lista = pendencias();
  const emDia = mensalidades().filter((m) => m.chave === chaveMes(hoje()) && statusDe(m) === "pago").length;
  const visiveis = lista.slice(0, 6);
  const aulas = proximasAulas().slice(0, 3);

  return (
    topo("Ateliê") +
    '<section style="margin-bottom:24px">' +
    '<div class="section-head"><h2 class="section-title">Pendências</h2>' +
    '<p class="inline-note micro muted">' +
    icone("check", "icon--sm icon--ok") +
    "<span>" +
    emDia +
    " em dia neste mês</span></p></div>" +
    (visiveis.length
      ? '<div class="card"><ul class="rows">' + visiveis.map((m) => linhaPendencia(m, false)).join("") + "</ul></div>"
      : vazio("check", "Nenhuma pendência", "Todas as mensalidades do período estão quitadas.")) +
    (lista.length > visiveis.length
      ? '<p class="label" style="margin-top:12px"><a href="#/professor/financeiro">Ver as ' + lista.length + " no painel financeiro</a></p>"
      : "") +
    "</section>" +
    '<section style="margin-bottom:24px">' +
    '<div class="section-head"><h2 class="section-title">Próximas aulas</h2></div>' +
    '<div class="stack stack--tight">' +
    aulas.map(function (x) { return cartaoOcupacao(x); }).join("") +
    "</div></section>" +
    "<section>" +
    '<div class="section-head"><h2 class="section-title">Áreas</h2></div>' +
    '<div class="grid-2">' +
    area("professor/produtos", "package", "Produtos") +
    area("professor/alunos", "users", "Alunos") +
    area("professor/calendario", "calendar-days", "Calendário") +
    area("professor/financeiro", "wallet", "Financeiro") +
    "</div></section>" +
    '<p style="margin-top:24px"><a class="switch-link" href="#/aluno">' +
    icone("users") +
    "Ver a tela do aluno</a></p>"
  );
}

function telaProdutosProfessor() {
  return (
    topo("Produtos", "professor") +
    '<div class="card"><ul class="rows">' +
    PRODUTOS.map(function (p) {
      const n = estoqueDe(p.id);
      return (
        "<li>" +
        '<span class="icon-circle">' +
        icone(n === 0 ? "package-x" : "package", "icon--lg") +
        "</span>" +
        '<div class="row-main"><p class="row-name">' +
        esc(p.nome) +
        '</p><p class="micro muted">' +
        fmtBRL.format(p.preco) +
        " · " +
        (n === 0 ? "sem estoque" : n + " em estoque") +
        "</p></div>" +
        '<div style="display:flex;gap:8px">' +
        botao("−", "neutral", "baixar-estoque", p.id, { sm: true, desabilitado: n === 0 }) +
        botao("+", "neutral", "repor-estoque", p.id, { sm: true }) +
        "</div></li>"
      );
    }).join("") +
    "</ul></div>"
  );
}

function telaAlunosProfessor() {
  return (
    topo("Alunos", "professor") +
    TURMAS.map(function (t) {
      const membros = alunosDaTurma(t.id);
      return (
        '<section style="margin-bottom:24px">' +
        '<div class="section-head"><h2 class="section-title">' +
        esc(t.nome) +
        '</h2><p class="micro muted">' +
        membros.length +
        " de " +
        t.regulares +
        " vagas</p></div>" +
        '<div class="card"><ul class="rows">' +
        membros
          .map(function (a) {
            const mes = mensalidades().find((m) => m.alunoId === a.id && m.chave === chaveMes(hoje()));
            const atrasada = statusDe(mes) === "atrasado";
            const cred = creditos(a.id);
            return (
              "<li>" +
              avatar(a.nome, true) +
              '<div class="row-main"><p class="row-name">' +
              esc(a.nome) +
              "</p>" +
              (cred > 0 ? '<p class="micro muted">' + cred + (cred === 1 ? " crédito" : " créditos") + " de reposição</p>" : "") +
              "</div>" +
              (atrasada
                ? '<span class="chip chip--atraso">' + icone("alert-circle", "icon--sm") + "em atraso</span>"
                : '<span class="chip chip--ok">' + icone("check", "icon--sm") + "em dia</span>") +
              "</li>"
            );
          })
          .join("") +
        "</ul></div></section>"
      );
    }).join("")
  );
}

function telaCalendarioProfessor() {
  const aulas = proximasAulas();
  return (
    topo("Calendário", "professor") +
    '<div class="stack stack--tight">' +
    aulas
      .map(function (aula) {
        const faltantes = faltasDe(aula.id).map((id) => aluno(id).nome);
        const repositores = reposicoesDe(aula.id).map((id) => aluno(id).nome);
        const extra =
          (faltantes.length
            ? '<p class="inline-note micro muted" style="margin-top:8px">' +
              icone("user-minus", "icon--sm") +
              "Falta avisada: " +
              esc(faltantes.join(", ")) +
              "</p>"
            : "") +
          (repositores.length
            ? '<p class="inline-note micro muted" style="margin-top:8px">' +
              icone("calendar-plus", "icon--sm") +
              "Reposição: " +
              esc(repositores.join(", ")) +
              "</p>"
            : "");
        return cartaoOcupacao(aula, extra);
      })
      .join("") +
    "</div>"
  );
}

function telaFinanceiroProfessor() {
  const todas = mensalidades();
  const abertas = todas.filter((m) => statusDe(m) !== "pago");
  const total = abertas.reduce((s, m) => s + m.valor, 0);
  const recebido = estado.compras.reduce((s, c) => s + c.valor, 0);
  const atrasadas = abertas.filter((m) => statusDe(m) === "atrasado");
  const aVencer = abertas.filter((m) => statusDe(m) === "aberto");

  function bloco(titulo, lista) {
    if (!lista.length) return "";
    return (
      '<section style="margin-bottom:24px">' +
      '<div class="section-head"><h2 class="section-title">' +
      esc(titulo) +
      '</h2><p class="micro muted">' +
      lista.length +
      "</p></div>" +
      '<div class="card"><ul class="rows">' +
      lista.map((m) => linhaPendencia(m, true)).join("") +
      "</ul></div></section>"
    );
  }

  return (
    topo("Financeiro", "professor") +
    '<div class="card card--raised" style="margin-bottom:24px">' +
    '<p class="label muted">A receber em mensalidades</p>' +
    dinheiro(total, "money--big") +
    '<p class="micro muted" style="margin-top:4px">' +
    abertas.length +
    " em aberto · " +
    fmtBRL.format(recebido) +
    " já vendido em material</p></div>" +
    bloco("Em atraso", atrasadas) +
    bloco("A vencer", aVencer) +
    (abertas.length ? "" : vazio("check", "Nada em aberto", "Todas as mensalidades do período estão quitadas."))
  );
}

function telaAluno() {
  const eu = alunoAtual();
  const t = turma(eu.turmaId);
  const minhas = mensalidades().filter((m) => m.alunoId === eu.id);
  const atraso = minhas.find((m) => statusDe(m) === "atrasado");
  const aberta = minhas.find((m) => statusDe(m) === "aberto");
  const proxima = proximasAulas().find((a) => a.turmaId === eu.turmaId);
  const avisou = proxima && faltasDe(proxima.id).includes(eu.id);
  const cred = creditos(eu.id);

  return (
    '<header class="topbar">' +
    avatar(eu.nome) +
    '<div><p class="label muted">Bom te ver de novo</p><h1 class="screen-title">' +
    esc(eu.nome.split(" ")[0]) +
    "</h1></div>" +
    "</header>" +
    '<div class="stack">' +
    (atraso
      ? '<div class="alert"><p class="inline-note label muted">' +
        icone("alert-circle", "icon--clay") +
        "Mensalidade de " +
        esc(atraso.referencia) +
        " em atraso</p>" +
        dinheiro(atraso.valor, "money--big") +
        '<p class="label muted" style="margin-top:4px">Venceu em ' +
        dataCurta(atraso.vencimento) +
        "</p>" +
        botao("Pagar agora", "primary", "pagar", atraso.id, { full: true }) +
        "</div>"
      : "") +
    (proxima
      ? '<article class="card"><p class="label muted">Próxima aula</p>' +
        '<p class="heading" style="margin-top:4px">' +
        esc(diaSemana(proxima.data)) +
        ", " +
        dataCurta(proxima.data) +
        '</p><p class="label muted" style="margin-top:4px">' +
        esc(t.nome) +
        " · " +
        esc(t.horario) +
        "</p>" +
        (avisou
          ? '<p class="inline-note label" style="margin-top:12px;color:var(--clay)">' +
            icone("calendar-x") +
            "Falta avisada</p>" +
            botao("Cancelar aviso", "neutral", "desfazer-falta", proxima.id, { full: true })
          : botao("Vou faltar", "secondary", "avisar-falta", proxima.id, { full: true, icone: "calendar-x" })) +
        "</article>"
      : "") +
    (aberta
      ? '<article class="card"><p class="inline-note label muted">' +
        icone("clock", "icon--warn") +
        '<span style="color:var(--warn)">Mensalidade de ' +
        esc(aberta.referencia) +
        "</span></p>" +
        dinheiro(aberta.valor, "money--mid") +
        '<p class="label muted" style="margin-top:4px">Vence em ' +
        dataCurta(aberta.vencimento) +
        "</p>" +
        botao("Pagar", atraso ? "neutral" : "primary", "pagar", aberta.id, { full: true }) +
        "</article>"
      : vazio("check", "Mensalidades em dia", "Nada a pagar por enquanto.")) +
    '<div class="grid-2">' +
    area("aluno/produtos", "package", "Produtos") +
    area("aluno/reposicao", "calendar-plus", cred > 0 ? "Reposição · " + cred : "Reposição") +
    "</div></div>" +
    '<p style="margin-top:24px"><a class="switch-link" href="#/professor">' +
    icone("calendar-days") +
    "Ver o painel do professor</a></p>" +
    '<div class="identidade"><span class="micro muted">Vendo como</span>' +
    '<select class="select" data-acao="trocar-aluno" aria-label="Ver como outro aluno">' +
    ALUNOS.map((a) => '<option value="' + a.id + '"' + (a.id === eu.id ? " selected" : "") + ">" + esc(a.nome) + "</option>").join("") +
    "</select></div>"
  );
}

function telaProdutosAluno() {
  const eu = alunoAtual();
  const minhas = estado.compras.filter((c) => c.alunoId === eu.id);
  const gasto = minhas.reduce((s, c) => s + c.valor, 0);

  return (
    topo("Produtos", "aluno") +
    '<div class="card" style="margin-bottom:16px"><ul class="rows">' +
    PRODUTOS.map(function (p) {
      const n = estoqueDe(p.id);
      return (
        "<li>" +
        '<span class="icon-circle">' +
        icone(n === 0 ? "package-x" : "package", "icon--lg") +
        "</span>" +
        '<div class="row-main"><p class="row-name">' +
        esc(p.nome) +
        '</p><p class="micro muted">' +
        fmtBRL.format(p.preco) +
        (n === 0 ? " · sem estoque" : "") +
        "</p></div>" +
        botao(n === 0 ? "Esgotado" : "Comprar", "neutral", "comprar", p.id, { sm: true, desabilitado: n === 0 }) +
        "</li>"
      );
    }).join("") +
    "</ul></div>" +
    (minhas.length
      ? '<div class="card card--raised"><p class="label muted">Suas compras</p>' +
        dinheiro(gasto, "money--mid") +
        '<p class="micro muted" style="margin-top:4px">' +
        minhas.length +
        (minhas.length === 1 ? " item comprado" : " itens comprados") +
        "</p></div>"
      : "")
  );
}

function telaReposicaoAluno() {
  const eu = alunoAtual();
  const cred = creditos(eu.id);
  const aulas = proximasAulas();
  const marcadas = aulas.filter((a) => reposicoesDe(a.id).includes(eu.id));
  const livres = aulas.filter(function (a) {
    if (reposicoesDe(a.id).includes(eu.id)) return false;
    if (faltasDe(a.id).includes(eu.id)) return false;
    const oc = ocupacao(a);
    return oc.reposicoes.ocupadas < oc.reposicoes.total;
  });

  function linhaAula(a, acao, rotulo, variante) {
    const t = turma(a.turmaId);
    const oc = ocupacao(a);
    return (
      "<li>" +
      '<div class="row-main"><p class="row-name">' +
      esc(diaSemana(a.data)) +
      ", " +
      dataCurta(a.data) +
      '</p><p class="micro muted">' +
      esc(t.nome) +
      " · " +
      esc(t.horario) +
      " · reposição " +
      oc.reposicoes.ocupadas +
      " de " +
      oc.reposicoes.total +
      "</p></div>" +
      botao(rotulo, variante, acao, a.id, { sm: true }) +
      "</li>"
    );
  }

  return (
    topo("Reposição", "aluno") +
    '<div class="card card--raised" style="margin-bottom:24px">' +
    '<p class="label muted">Créditos disponíveis</p>' +
    '<p class="money money--big">' +
    cred +
    "</p>" +
    '<p class="micro muted" style="margin-top:4px">Cada falta avisada antes da aula vale um crédito.</p></div>' +
    (marcadas.length
      ? '<section style="margin-bottom:24px"><div class="section-head"><h2 class="section-title">Suas reposições</h2></div>' +
        '<div class="card"><ul class="rows">' +
        marcadas.map((a) => linhaAula(a, "cancelar-reposicao", "Cancelar", "destructive")).join("") +
        "</ul></div></section>"
      : "") +
    "<section><div class=\"section-head\"><h2 class=\"section-title\">Vagas livres</h2></div>" +
    (cred < 1
      ? vazio("calendar-plus", "Nenhum crédito de reposição", "Avise uma falta na sua próxima aula para ganhar um crédito.")
      : livres.length
        ? '<div class="card"><ul class="rows">' + livres.map((a) => linhaAula(a, "marcar-reposicao", "Marcar", "neutral")).join("") + "</ul></div>"
        : vazio("calendar-plus", "Sem vaga de reposição", "Todas as aulas do período estão com as vagas de reposição ocupadas.")) +
    "</section>"
  );
}

/* -------------------------------------------------------------- roteador --- */

const ROTAS = {
  "#/professor": telaProfessor,
  "#/professor/produtos": telaProdutosProfessor,
  "#/professor/alunos": telaAlunosProfessor,
  "#/professor/calendario": telaCalendarioProfessor,
  "#/professor/financeiro": telaFinanceiroProfessor,
  "#/aluno": telaAluno,
  "#/aluno/produtos": telaProdutosAluno,
  "#/aluno/reposicao": telaReposicaoAluno,
};

const alvoApp = document.getElementById("app");
const alvoToast = document.getElementById("toast");
let timerToast = null;
let rotaAnterior = null;

function aviso(texto) {
  alvoToast.textContent = texto;
  alvoToast.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(function () {
    alvoToast.hidden = true;
  }, 3200);
}

function render() {
  const rota = location.hash || "#/professor";
  const tela = ROTAS[rota] || ROTAS["#/professor"];
  alvoApp.innerHTML =
    tela() +
    '<p style="margin-top:32px"><button class="btn btn--destructive btn--sm" data-acao="restaurar" data-alvo="">' +
    (restaurarArmado ? "Confirmar restauração" : "Restaurar dados de exemplo") +
    "</button></p>";
  if (rota !== rotaAnterior) {
    rotaAnterior = rota;
    window.scrollTo(0, 0);
  }
}

alvoApp.addEventListener("click", function (ev) {
  const botao = ev.target.closest("[data-acao]");
  if (!botao || botao.tagName !== "BUTTON") return;
  const acao = acoes[botao.dataset.acao];
  if (!acao) return;
  if (botao.dataset.acao !== "restaurar") restaurarArmado = false;
  acao(botao.dataset.alvo);
  salvar();
  render();
});

alvoApp.addEventListener("change", function (ev) {
  if (ev.target.dataset.acao !== "trocar-aluno") return;
  estado.alunoAtual = ev.target.value;
  salvar();
  render();
});

window.addEventListener("hashchange", render);

if (!location.hash) location.replace("#/professor");
render();
