import { entrar, cadastrar, trocarSenha, sair, temSessao, usuarioId, tabela, rpc } from "./api.js";

/* ---------------------------------------------------------------- datas --- */

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "long" });
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function daIso(s) {
  const [a, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d);
}

const dataCurta = (s) => fmtData.format(daIso(s));
const diaSemana = (s) => fmtDiaSemana.format(daIso(s));
// turmas guardam o dia como número (0 = domingo), do jeito que o Postgres conta
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira",
              "quinta-feira", "sexta-feira", "sábado"];
// na lista o nome da turma é o que importa; o dia por extenso o espremia
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const nomeDia = (n) => DIAS[n] || "";
const diaCurto = (n) => DIAS_CURTOS[n] || "";
const nomeMes = (s) => fmtMes.format(daIso(s));
const reais = (centavos) => fmtBRL.format(centavos / 100);

function hoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const isoHoje = () => {
  const d = hoje();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

/* --------------------------------------------------------------- estado --- */

let dados = null;
let carregando = false;
let rotaAnterior = null;

// Painéis abertos nas telas de produtos e de alunos. É estado de tela, não de
// dados: some ao trocar de rota, e as ações que só abrem e fecham painel não
// invalidam o cache.
let painelProduto = null;
let painelAluno = null;
let painelTurma = null;

// As turmas que a tela de cadastro mostra a quem ainda não tem conta.
let turmasAbertas = [];

// O menu que abre no avatar da barra de topo.
let menuUsuario = false;

const alvoApp = document.getElementById("app");
const alvoToast = document.getElementById("toast");
let timerToast = null;

function aviso(texto) {
  alvoToast.textContent = texto;
  alvoToast.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => (alvoToast.hidden = true), 4000);
}

async function carregar() {
  const conta = usuarioId();
  const [perfis, turmas, matriculas, aulas, faltas, reposicoes, mensalidades, pagamentos, produtos, compras, ocupacao, creditos] =
    await Promise.all([
      tabela("perfis").ler("select=*&order=nome"),
      tabela("turmas").ler("select=*&order=nome"),
      tabela("matriculas").ler("select=*"),
      tabela("aulas").ler("select=*&order=data"),
      tabela("faltas").ler("select=*"),
      tabela("reposicoes").ler("select=*"),
      tabela("mensalidades").ler("select=*&order=vencimento"),
      tabela("pagamentos").ler("select=*"),
      tabela("produtos").ler("select=*&order=nome"),
      tabela("compras").ler("select=*&order=criada_em.desc"),
      rpc("ocupacao_das_aulas"),
      rpc("meus_creditos"),
    ]);

  const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));

  // auth.uid() é a conta; o perfil tem identidade própria desde que o professor
  // passou a cadastrar aluno sem criar login. Quem manda no app é o perfil.
  const perfil = perfis.find((p) => p.usuario_id === conta) || null;

  dados = {
    conta,
    eu: perfil ? perfil.id : null,
    perfil,
    perfis,
    perfilPorId: porId(perfis),
    turmas,
    // encerrada continua consultável pelo histórico, mas não se escolhe mais
    turmasAtivas: turmas.filter((t) => !t.encerrada_em),
    turmaPorId: porId(turmas),
    matriculas: matriculas.filter((m) => m.ativa),
    matriculasTodas: matriculas,
    aulas,
    aulaPorId: porId(aulas),
    faltas,
    reposicoes,
    mensalidades,
    pagamentos,
    produtos,
    produtoPorId: porId(produtos),
    compras,
    ocupacao,
    creditos: typeof creditos === "number" ? creditos : 0,
  };
}

const souProfessor = () => Boolean(dados && dados.perfil && dados.perfil.papel === "professor");
const nomeDe = (id) => (dados.perfilPorId[id] ? dados.perfilPorId[id].nome : "Aluno");
const minhaTurma = () => {
  const m = dados.matriculas.find((x) => x.aluno_id === dados.eu);
  return m ? dados.turmaPorId[m.turma_id] : null;
};

// Um aluno pode frequentar mais de uma turma; a tela de aulas precisa das duas.
const minhasTurmas = () =>
  dados.matriculas
    .filter((x) => x.aluno_id === dados.eu)
    .map((x) => dados.turmaPorId[x.turma_id])
    .filter(Boolean);

const FORMAS = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  boleto: "Boleto",
};

// Mesma régua da mensalidade: quitada, vencida ou ainda no prazo.
function statusCompra(c) {
  if (c.pago_em) return "pago";
  return c.vencimento < isoHoje() ? "atrasado" : "aberto";
}

function statusDe(m) {
  if (m.pago_em) return "pago";
  return m.vencimento < isoHoje() ? "atrasado" : "aberto";
}

const pagamentoDe = (mensalidadeId) => dados.pagamentos.find((p) => p.mensalidade_id === mensalidadeId) || null;

/* ---------------------------------------------------------------- ações --- */

const acoes = {
  "avisar-falta": (aulaId) =>
    tabela("faltas").inserir({ aula_id: aulaId, aluno_id: dados.eu })
      .then(() => "Falta avisada. Você ganhou 1 crédito de reposição."),

  "desfazer-falta": (faltaId) =>
    tabela("faltas").remover("id=eq." + faltaId).then(() => "Aviso de falta cancelado."),

  "marcar-reposicao": (aulaId) =>
    tabela("reposicoes").inserir({ aula_id: aulaId, aluno_id: dados.eu })
      .then(() => "Reposição marcada."),

  "cancelar-reposicao": (id) =>
    tabela("reposicoes").remover("id=eq." + id).then(() => "Reposição cancelada."),

  "declarar-pagamento": (mensalidadeId) =>
    tabela("pagamentos").inserir({ mensalidade_id: mensalidadeId })
      .then(() => "Pagamento informado. O ateliê vai confirmar."),

  "confirmar-pagamento": (pagamentoId) =>
    tabela("pagamentos").atualizar("id=eq." + pagamentoId, { confirmado_em: new Date().toISOString() })
      .then(() => "Pagamento confirmado."),

  "marcar-paga": (mensalidadeId) =>
    tabela("mensalidades").atualizar("id=eq." + mensalidadeId, { pago_em: new Date().toISOString() })
      .then(() => "Mensalidade quitada."),

  comprar: (produtoId) =>
    tabela("compras").inserir({ aluno_id: dados.eu, produto_id: produtoId, quantidade: 1, valor_centavos: 0 })
      .then(() => "Compra registrada. Combine o pagamento com o ateliê."),

  "menu-usuario": () => { menuUsuario = !menuUsuario; return null; },

  "aluno-novo": () => { painelAluno = { modo: "novo" }; return null; },
  "aluno-editar": (id) => { painelAluno = { modo: "editar", id: id }; return null; },
  "aluno-fechar": () => { painelAluno = null; return null; },
  "aluno-ficha": (id) => {
    const aberto = painelAluno && painelAluno.modo === "ficha" && painelAluno.id === id;
    painelAluno = aberto ? null : { modo: "ficha", id: id };
    return null;
  },

  "turma-nova": () => { painelTurma = { modo: "nova" }; return null; },
  "turma-editar": (id) => { painelTurma = { modo: "editar", id: id }; return null; },
  "turma-encerrar": (id) => { painelTurma = { modo: "encerrar", id: id }; return null; },
  "turma-apagar": (id) => { painelTurma = { modo: "apagar", id: id }; return null; },
  "turma-fechar": () => { painelTurma = null; return null; },
  "turma-ficha": (id) => {
    const aberto = painelTurma && painelTurma.modo === "ficha" && painelTurma.id === id;
    painelTurma = aberto ? null : { modo: "ficha", id: id };
    return null;
  },

  // Encerrar é um update, não um delete: o gatilho checa_turma desliga as
  // matrículas, e aula, falta e reposição ficam onde estão.
  "turma-encerrar-agora": (id) =>
    tabela("turmas").atualizar("id=eq." + id, { encerrada_em: isoHoje() })
      .then(() => { painelTurma = null; return "Turma encerrada."; }),

  "turma-reabrir": (id) =>
    tabela("turmas").atualizar("id=eq." + id, { encerrada_em: null })
      .then(() => { painelTurma = null; return "Turma reaberta. Rematricule quem volta."; }),

  "turma-apagar-agora": (id) =>
    tabela("turmas").remover("id=eq." + id).then(
      () => { painelTurma = null; return "Turma excluída."; },
      (e) => {
        // matriculas.turma_id é `on delete restrict`: quem já teve aluno fica
        if (/foreign key/i.test(e.message)) {
          throw new Error("Essa turma já teve aluno: encerre em vez de excluir.");
        }
        throw e;
      },
    ),

  "produto-novo": () => { painelProduto = { modo: "novo" }; return null; },
  "produto-vender": (id) => { painelProduto = { modo: "vender", id: id }; return null; },
  "produto-editar": (id) => { painelProduto = { modo: "editar", id: id }; return null; },
  "produto-remover": (id) => { painelProduto = { modo: "remover", id: id }; return null; },
  "produto-fechar": () => { painelProduto = null; return null; },

  "produto-vendas": (id) => {
    const aberto = painelProduto && painelProduto.modo === "vendas" && painelProduto.id === id;
    painelProduto = aberto ? null : { modo: "vendas", id: id };
    return null;
  },
  "venda-receber": (compraId) => {
    painelProduto = { modo: "vendas", id: painelProduto.id, recebendo: compraId };
    return null;
  },
  "venda-fechar": () => {
    painelProduto = { modo: "vendas", id: painelProduto.id };
    return null;
  },

  "venda-desfazer": (compraId) => {
    const aberto = { modo: "vendas", id: painelProduto.id };
    return tabela("compras").atualizar("id=eq." + compraId, { pago_em: null, forma_pagamento: null })
      .then(() => { painelProduto = aberto; return "Recebimento desfeito."; });
  },

  "produto-apagar": (id) =>
    tabela("produtos").remover("id=eq." + id).then(
      () => { painelProduto = null; return "Produto excluído."; },
      (e) => {
        // compras.produto_id é `on delete restrict`: histórico de venda segura o catálogo
        if (/foreign key/i.test(e.message)) {
          throw new Error("Esse produto já foi vendido: o histórico não deixa excluir.");
        }
        throw e;
      },
    ),

  "repor-estoque": (produtoId) => {
    const p = dados.produtos.find((x) => x.id === produtoId);
    return tabela("produtos").atualizar("id=eq." + produtoId, { estoque: p.estoque + 1 }).then(() => null);
  },

  "baixar-estoque": (produtoId) => {
    const p = dados.produtos.find((x) => x.id === produtoId);
    if (p.estoque < 1) return Promise.resolve(null);
    return tabela("produtos").atualizar("id=eq." + produtoId, { estoque: p.estoque - 1 }).then(() => null);
  },

  sair: () => sair().then(() => { dados = null; location.hash = "#/entrar"; return null; }),
};

const acoesDeTela = new Set([
  "produto-novo", "produto-editar", "produto-remover", "produto-fechar",
  "produto-vendas", "venda-receber", "venda-fechar", "produto-vender",
  "aluno-novo", "aluno-editar", "aluno-fechar", "aluno-ficha",
  "turma-nova", "turma-editar", "turma-encerrar", "turma-apagar",
  "turma-fechar", "turma-ficha",
  "menu-usuario",
]);

/* ------------------------------------------------------------ fragmentos --- */

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const icone = (nome, classe) =>
  '<svg class="icon ' + (classe || "") + '" aria-hidden="true"><use href="#i-' + nome + '"/></svg>';

function iniciais(nome) {
  const partes = nome.trim().split(/\s+/);
  const a = partes[0] ? partes[0][0] : "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

const avatar = (nome, pequeno) =>
  '<span class="avatar' + (pequeno ? " avatar--sm" : "") + '" aria-hidden="true">' + esc(iniciais(nome)) + "</span>";

const dinheiro = (centavos, classe) =>
  '<span class="money ' + (classe || "") + '">' + reais(centavos) + "</span>";

const iconeCirculo = (nome) => '<span class="icon-circle">' + icone(nome, "icon--lg") + "</span>";

// A home e as áreas de cada papel, na ordem da barra do rodapé. Os dois
// veem o mesmo ateliê de lugares diferentes: o professor cuida da casa
// inteira, o aluno cuida da vida dele dentro dela.
const AREAS_PROFESSOR = [
  ["#/professor", "home", "Início"],
  ["#/professor/produtos", "package", "Produtos"],
  ["#/professor/alunos", "users", "Alunos"],
  ["#/professor/calendario", "calendar-days", "Calendário"],
  ["#/professor/financeiro", "wallet", "Financeiro"],
];

const AREAS_ALUNO = [
  ["#/aluno", "home", "Início"],
  ["#/aluno/aulas", "calendar-days", "Aulas"],
  ["#/aluno/produtos", "package", "Produtos"],
  ["#/aluno/financeiro", "wallet", "Financeiro"],
];

const abas = (rota) =>
  '<nav class="abas" aria-label="Áreas do ateliê">' +
  (souProfessor() ? AREAS_PROFESSOR : AREAS_ALUNO).map(([destino, nomeIcone, rotulo]) =>
    '<a class="aba' + (destino === rota ? " aba--atual" : "") + '" href="' + destino + '"' +
    (destino === rota ? ' aria-current="page"' : "") + ">" +
    icone(nomeIcone) + "<span>" + esc(rotulo) + "</span></a>"
  ).join("") + "</nav>";

// Barra fina, em toda tela de quem entrou: a marca à esquerda, quem está
// logado à direita. O menu do avatar é o único lugar de onde se sai do app.
const barraTopo = () => {
  const nome = dados.perfil.nome;
  return (
    '<header class="topo-app">' +
    '<a class="topo-marca" href="#/" aria-label="Início">' +
    '<img src="logo.svg" alt="" width="28" height="28"><span>Esculturalizando</span></a>' +
    '<div class="topo-conta">' +
    '<button type="button" class="avatar avatar--sm" data-acao="menu-usuario" data-alvo=""' +
    ' aria-expanded="' + menuUsuario + '" aria-haspopup="true"' +
    ' aria-label="Conta de ' + esc(nome) + '">' + esc(iniciais(nome)) + "</button>" +
    (menuUsuario
      ? '<div class="menu" role="menu">' +
        '<p class="menu-quem"><span class="row-name">' + esc(nome) + "</span>" +
        '<span class="micro muted">' + esc(dados.perfil.email || "") + "</span></p>" +
        '<a class="menu-item" role="menuitem" href="#/conta">Atualizar cadastro</a>' +
        '<a class="menu-item" role="menuitem" href="#/senha">Trocar senha</a>' +
        '<button type="button" class="menu-item menu-item--sair" role="menuitem"' +
        ' data-acao="sair" data-alvo="">Sair</button></div>'
      : "") +
    "</div></header>"
  );
};

function botao(rotulo, variante, acao, alvo, extras) {
  const o = extras || {};
  return (
    '<button type="button" class="btn btn--' + variante + (o.full ? " btn--full" : "") + (o.sm ? " btn--sm" : "") +
    '" data-acao="' + acao + '" data-alvo="' + esc(alvo) + '"' + (o.desabilitado ? " disabled" : "") + ">" +
    (o.icone ? icone(o.icone) : "") + esc(rotulo) + "</button>"
  );
}

const vazio = (nomeIcone, titulo, descricao) =>
  '<div class="empty">' + iconeCirculo(nomeIcone) + "<p>" + esc(titulo) + "</p>" +
  (descricao ? '<p class="label muted">' + esc(descricao) + "</p>" : "") + "</div>";

const topo = (titulo, voltarPara) =>
  '<header class="topbar">' +
  (voltarPara ? '<a class="back" href="#/' + voltarPara + '" aria-label="Voltar">' + icone("arrow-left", "icon--lg") + "</a>" : "") +
  '<h1 class="screen-title">' + esc(titulo) + "</h1></header>";

const rodape = () => "";

function cartaoOcupacao(oc, extra) {
  const t = dados.turmaPorId[oc.turma_id];
  const livres = oc.reposicoes_total - oc.reposicoes_ocupadas;
  return (
    '<article class="card card--calendario"><p>' + esc(t ? t.nome : "Turma") + '</p>' +
    '<p class="label muted">' + esc(diaSemana(oc.data)) + ", " + dataCurta(oc.data) +
    (t ? " · " + esc(t.horario) : "") + "</p>" +
    '<div class="grid-2" style="margin-top:12px">' +
    '<div class="tally"><p class="micro muted">Vagas regulares</p><p class="tally-value">' +
    oc.regulares_ocupadas + " de " + oc.regulares_total + "</p></div>" +
    '<div class="tally"><p class="micro muted">Vagas de reposição</p><p class="tally-value">' +
    oc.reposicoes_ocupadas + " de " + oc.reposicoes_total + "</p></div></div>" +
    (livres > 0
      ? '<p class="inline-note micro muted" style="margin-top:12px">' + icone("circle-plus", "icon--sm icon--clay") +
        (livres === 1 ? "1 vaga de reposição livre" : livres + " vagas de reposição livres") + "</p>"
      : "") +
    (extra || "") + "</article>"
  );
}

function linhaMensalidade(m, comAcao) {
  const paga = statusDe(m) === "pago";
  const atrasada = statusDe(m) === "atrasado";
  const declarado = pagamentoDe(m.id);

  // uma mensalidade quitada não tem o que cobrar nem quando vencer: no histórico
  // ela mostra quando entrou, e nenhum botão de receber
  const abaixo = paga
    ? '<p class="inline-note micro muted">' + icone("check", "icon--sm icon--ok") +
      "Pago em " + dataCurta(m.pago_em) + "</p>"
    : '<p class="inline-note micro muted">' +
      icone(atrasada ? "alert-circle" : "clock", "icon--sm " + (atrasada ? "icon--clay" : "icon--warn")) +
      (atrasada ? "Venceu" : "Vence") + " em " + dataCurta(m.vencimento) +
      (declarado && !declarado.confirmado_em ? " · informou pagamento" : "") + "</p>";

  const acao = !comAcao || paga
    ? ""
    : declarado && !declarado.confirmado_em
      ? botao("Confirmar", "neutral", "confirmar-pagamento", declarado.id, { sm: true })
      : botao("Marcar paga", "neutral", "marcar-paga", m.id, { sm: true });

  return (
    "<li>" + avatar(nomeDe(m.aluno_id), true) +
    '<div class="row-main"><p class="row-name">' + esc(nomeDe(m.aluno_id)) + "</p>" +
    abaixo + "</div>" +
    '<div class="row-side">' + dinheiro(m.valor_centavos, atrasada ? "heading" : "muted") + acao + "</div></li>"
  );
}

/* ---------------------------------------------------------------- telas --- */

function telaEntrar(erro) {
  return (
    '<main class="entrada">' +
    '<img class="marca" src="logo.svg" alt="" width="88" height="88">' +
    '<h1 class="screen-title" style="font-size:var(--display)">Esculturalizando</h1>' +
    '<p class="label muted" style="margin-top:8px">Entre para ver suas aulas e mensalidades.</p>' +
    '<form id="login" style="margin-top:24px">' +
    '<label class="campo"><span class="micro muted">E-mail</span>' +
    '<input class="input" type="email" name="email" autocomplete="username" required></label>' +
    '<label class="campo"><span class="micro muted">Senha</span>' +
    '<input class="input" type="password" name="senha" autocomplete="current-password" required></label>' +
    (erro ? '<p class="label" style="color:var(--danger);margin-top:12px">' + esc(erro) + "</p>" : "") +
    '<button class="btn btn--primary btn--full" style="margin-top:16px" type="submit">Entrar</button>' +
    "</form>" +
    '<p class="label muted" style="margin-top:24px">Ainda não tem conta? ' +
    '<a href="#/cadastro">Cadastre-se</a></p>' +
    '<p class="micro faint" style="margin-top:16px">Demonstração: professor@atelie.test ou marina@atelie.test, senha demo1234</p>' +
    "</main>"
  );
}

// A turma vem de `turmas_abertas`, uma view que quem ainda não tem conta pode
// ler: só nome, dia, horário e vagas — o preço não é assunto de quem está do
// lado de fora.
function telaCadastro(erro) {
  return (
    '<main class="entrada">' +
    '<img class="marca" src="logo.svg" alt="" width="72" height="72">' +
    '<h1 class="screen-title">Criar conta</h1>' +
    '<p class="label muted" style="margin-top:8px">Escolha a turma que você vai frequentar.</p>' +
    '<form id="cadastro" style="margin-top:24px">' +
    '<label class="campo"><span class="micro muted">Nome completo</span>' +
    '<input class="input" name="nome" maxlength="120" required autocomplete="name"></label>' +
    '<label class="campo"><span class="micro muted">Telefone celular</span>' +
    '<input class="input" name="telefone" type="tel" maxlength="32" autocomplete="tel"></label>' +
    '<label class="campo"><span class="micro muted">E-mail</span>' +
    '<input class="input" name="email" type="email" required autocomplete="email"></label>' +
    '<label class="campo"><span class="micro muted">Senha</span>' +
    '<input class="input" name="senha" type="password" minlength="8" required autocomplete="new-password"></label>' +
    '<label class="campo"><span class="micro muted">Melhor dia do mês para pagar</span>' +
    '<input class="input" name="dia_cobranca" type="number" min="1" max="31" step="1" required value="10">' +
    '<span class="micro faint">Depois disso, quem acerta o dia com você é o ateliê.</span></label>' +
    '<fieldset class="campo turmas"><legend class="micro muted">Turmas</legend>' +
    (turmasAbertas.length
      ? turmasAbertas.map((t) =>
          '<label class="turma-opcao"><input type="checkbox" name="turmas" value="' + esc(t.id) + '"' +
          (t.vagas_livres > 0 ? "" : " disabled") + ">" +
          '<span class="turma-nome">' + esc(t.nome) + '<span class="micro muted"> · ' +
          esc(t.horario) + " · " +
          (t.vagas_livres > 0 ? t.vagas_livres + (t.vagas_livres === 1 ? " vaga" : " vagas") : "sem vaga") +
          "</span></span></label>"
        ).join("")
      : '<p class="micro muted">Nenhuma turma cadastrada ainda.</p>') +
    "</fieldset>" +
    (erro ? '<p class="label" style="color:var(--danger);margin-top:12px">' + esc(erro) + "</p>" : "") +
    '<button class="btn btn--primary btn--full" style="margin-top:16px" type="submit">Criar conta</button>' +
    "</form>" +
    '<p class="label muted" style="margin-top:24px">Já tem conta? <a href="#/entrar">Entrar</a></p>' +
    "</main>"
  );
}

function telaConta() {
  const p = dados.perfil;
  return (
    topo("Atualizar cadastro", souProfessor() ? "professor" : "aluno") +
    '<div class="card"><form data-forma="conta">' +
    '<label class="campo"><span class="micro muted">Nome completo</span>' +
    '<input class="input" name="nome" maxlength="120" required autocomplete="name" value="' + esc(p.nome) + '"></label>' +
    '<label class="campo"><span class="micro muted">Telefone celular</span>' +
    '<input class="input" name="telefone" type="tel" maxlength="32" autocomplete="tel" value="' +
    esc(p.telefone || "") + '"></label>' +
    '<label class="campo"><span class="micro muted">E-mail</span>' +
    '<input class="input" value="' + esc(p.email || "") + '" disabled></label>' +
    '<p class="micro faint" style="margin-top:8px">O e-mail é com o que você entra no app. ' +
    "Para trocar, fale com o ateliê.</p>" +
    '<button type="submit" class="btn btn--primary btn--full" style="margin-top:16px">Salvar</button>' +
    "</form></div>"
  );
}

function telaSenha() {
  return (
    topo("Trocar senha", souProfessor() ? "professor" : "aluno") +
    '<div class="card"><form data-forma="senha">' +
    '<label class="campo"><span class="micro muted">Nova senha</span>' +
    '<input class="input" name="senha" type="password" minlength="8" required autocomplete="new-password"></label>' +
    '<label class="campo"><span class="micro muted">Repita a nova senha</span>' +
    '<input class="input" name="confirmacao" type="password" minlength="8" required autocomplete="new-password"></label>' +
    '<p class="micro faint" style="margin-top:8px">Pelo menos 8 caracteres. ' +
    "Você continua conectado depois de trocar.</p>" +
    '<button type="submit" class="btn btn--primary btn--full" style="margin-top:16px">Trocar senha</button>' +
    "</form></div>"
  );
}

// O aluno leva a plastilina para usar na aula e acerta depois: a compra em
// aberto é uma pendência tanto quanto a mensalidade, e some da vista se a home
// só olhar para mensalidade.
function linhaCompraPendente(c) {
  const atrasada = statusCompra(c) === "atrasado";
  const produto = dados.produtoPorId[c.produto_id];
  const quem = nomeDe(c.aluno_id);
  return (
    "<li>" + avatar(quem, true) +
    '<div class="row-main"><p class="row-name">' + esc(quem) + "</p>" +
    '<p class="inline-note micro muted">' +
    icone(atrasada ? "alert-circle" : "package", "icon--sm " + (atrasada ? "icon--clay" : "icon--warn")) +
    esc(produto ? produto.nome : "Material do ateliê") +
    (c.quantidade > 1 ? " · " + c.quantidade + " un" : "") +
    " · " + (atrasada ? "levou em " + dataCurta(c.criada_em) : "levou hoje") + "</p></div>" +
    '<div class="row-side">' + dinheiro(c.valor_centavos, atrasada ? "heading" : "muted") + "</div></li>"
  );
}

function telaProfessor() {
  const abertas = dados.mensalidades.filter((m) => statusDe(m) !== "pago");
  const devendoMaterial = dados.compras.filter((c) => !c.pago_em);

  // as duas dívidas na mesma lista, atrasadas primeiro e mais velhas antes
  const pendencias = [
    ...abertas.map((m) => ({
      atrasada: statusDe(m) === "atrasado", quando: m.vencimento,
      quem: nomeDe(m.aluno_id), desenha: () => linhaMensalidade(m, false),
    })),
    ...devendoMaterial.map((c) => ({
      atrasada: statusCompra(c) === "atrasado", quando: c.vencimento,
      quem: nomeDe(c.aluno_id), desenha: () => linhaCompraPendente(c),
    })),
  ].sort((a, b) =>
    (a.atrasada ? 0 : 1) - (b.atrasada ? 0 : 1) ||
    a.quando.localeCompare(b.quando) ||
    a.quem.localeCompare(b.quem));

  const mesAtual = isoHoje().slice(0, 7);
  const emDia = dados.mensalidades.filter((m) => m.competencia.slice(0, 7) === mesAtual && m.pago_em).length;
  const visiveis = pendencias.slice(0, 6);

  return (
    topo("Ateliê") +
    '<section style="margin-bottom:24px">' +
    '<div class="section-head"><h2 class="section-title">Pendências</h2>' +
    '<p class="inline-note micro muted">' + icone("check", "icon--sm icon--ok") +
    "<span>" + emDia + " em dia neste mês</span></p></div>" +
    (visiveis.length
      ? '<div class="card card--financeiro"><ul class="rows">' +
        visiveis.map((x) => x.desenha()).join("") + "</ul></div>"
      : vazio("check", "Nenhuma pendência", "Mensalidades e material do período estão quitados.")) +
    (pendencias.length > visiveis.length
      ? '<p class="label" style="margin-top:12px">' +
        (abertas.length
          ? '<a href="#/professor/financeiro">Ver as ' + abertas.length +
            (abertas.length === 1 ? " mensalidade" : " mensalidades") + " no painel financeiro</a>"
          : "") +
        (abertas.length && devendoMaterial.length ? "<br>" : "") +
        (devendoMaterial.length
          ? '<a href="#/professor/produtos">' + devendoMaterial.length +
            (devendoMaterial.length === 1 ? " compra" : " compras") + " de material a receber</a>"
          : "") +
        "</p>"
      : "") +
    "</section>" +
    '<section style="margin-bottom:24px"><div class="section-head"><h2 class="section-title">Próximas aulas</h2></div>' +
    '<div class="stack stack--tight">' + dados.ocupacao.slice(0, 3).map((oc) => cartaoOcupacao(oc)).join("") + "</div></section>"
  );
}

function formaProduto(p) {
  const valor = (n) => ' value="' + esc(n) + '"';
  return (
    '<li class="produto-painel"><form data-forma="produto" data-alvo="' + esc(p ? p.id : "") + '">' +
    '<p class="section-title">' + (p ? "Editar produto" : "Novo produto") + "</p>" +
    '<label class="campo"><span class="micro muted">Nome</span>' +
    '<input class="input" name="nome" maxlength="80" required autocomplete="off"' +
    (p ? valor(p.nome) : "") + "></label>" +
    '<div class="grid-2">' +
    '<label class="campo"><span class="micro muted">Preço (R$)</span>' +
    '<input class="input" name="preco" type="number" step="0.01" min="0" required' +
    (p ? valor((p.preco_centavos / 100).toFixed(2)) : "") + "></label>" +
    '<label class="campo"><span class="micro muted">Estoque</span>' +
    '<input class="input" name="estoque" type="number" step="1" min="0" required' +
    valor(p ? p.estoque : 0) + "></label>" +
    "</div>" +
    '<div class="produto-acoes">' +
    '<button type="submit" class="btn btn--primary btn--sm">Salvar</button>' +
    botao("Cancelar", "ghost", "produto-fechar", "", { sm: true }) +
    "</div></form></li>"
  );
}

function remocaoProduto(p) {
  return (
    '<li class="produto-painel">' +
    '<p class="label">Excluir ' + esc(p.nome) + "?</p>" +
    '<p class="micro muted" style="margin-top:4px">Sai do catálogo do ateliê e da vitrine dos alunos.</p>' +
    '<div class="produto-acoes">' +
    botao("Excluir", "destructive", "produto-apagar", p.id, { sm: true }) +
    botao("Cancelar", "ghost", "produto-fechar", "", { sm: true }) +
    "</div></li>"
  );
}

// Quem está no ateliê agora. Ex-aluno não aparece na lista de venda: se voltar
// a comprar, é porque voltou, e aí a matrícula é que precisa voltar antes.
const alunosDoAtelie = () =>
  dados.perfis
    .filter((p) => p.papel === "aluno" && dados.matriculas.some((m) => m.aluno_id === p.id))
    .sort((a, b) => a.nome.localeCompare(b.nome));

// O professor registra a venda que aconteceu na mão: o aluno levou a plastilina
// e pagou em dinheiro, no pix, ou ainda não pagou. Uma escolha só resolve as
// duas perguntas — a forma de pagamento vazia é o "ainda não pagou" —, e é
// também o que o banco cobra: pago_em e forma_pagamento vivem ou morrem juntos.
function formaVenda(p) {
  const alunos = alunosDoAtelie();
  return (
    '<li class="produto-painel"><form data-forma="venda" data-alvo="' + esc(p.id) + '">' +
    '<p class="section-title">Registrar venda</p>' +
    '<p class="micro muted" style="margin-top:4px">' + esc(p.nome) + " · " + reais(p.preco_centavos) +
    " · " + (p.estoque === 1 ? "1 em estoque" : p.estoque + " em estoque") + "</p>" +
    (alunos.length
      ? '<label class="campo"><span class="micro muted">Para quem</span>' +
        '<select class="input" name="aluno" required>' +
        alunos.map((a) => '<option value="' + esc(a.id) + '">' + esc(a.nome) + "</option>").join("") +
        "</select></label>" +
        '<label class="campo"><span class="micro muted">Quantidade</span>' +
        '<input class="input" name="quantidade" type="number" min="1" max="' + p.estoque +
        '" step="1" required value="1"></label>' +
        // largura inteira: dividindo a linha com a quantidade, "Ainda não pagou"
        // — que é a opção mais importante de ler — saía cortada no celular
        '<label class="campo"><span class="micro muted">Pagamento</span>' +
        '<select class="input" name="forma">' +
        '<option value="">Ainda não pagou</option>' +
        Object.keys(FORMAS).map((k) => '<option value="' + k + '">' + esc(FORMAS[k]) + "</option>").join("") +
        "</select></label>" +
        '<p class="micro faint" style="margin-top:8px">Sem pagamento, a compra fica em aberto e aparece ' +
        "nas pendências da home.</p>" +
        '<div class="produto-acoes">' +
        '<button type="submit" class="btn btn--primary btn--sm">Registrar</button>' +
        botao("Cancelar", "ghost", "produto-fechar", "", { sm: true }) +
        "</div>"
      : '<p class="micro muted" style="margin-top:12px">Nenhum aluno matriculado para comprar.</p>' +
        '<div class="produto-acoes">' + botao("Fechar", "ghost", "produto-fechar", "", { sm: true }) + "</div>") +
    "</form></li>"
  );
}

function linhaVenda(c) {
  const st = statusCompra(c);
  const quem = nomeDe(c.aluno_id);
  const chip =
    st === "pago" ? '<span class="chip chip--ok">' + icone("check", "icon--sm icon--ok") + "recebido</span>"
    : st === "atrasado" ? '<span class="chip chip--atraso">' + icone("alert-circle", "icon--sm") + "em atraso</span>"
    : '<span class="chip">em aberto</span>';

  return (
    '<li class="venda">' + avatar(quem, true) +
    '<div class="row-main"><p class="row-name">' + esc(quem) + '</p><p class="micro muted">' +
    dataCurta(c.criada_em) + (c.quantidade > 1 ? " · " + c.quantidade + " unidades" : "") +
    (st === "pago" ? " · " + esc(FORMAS[c.forma_pagamento] || "forma não registrada") : "") + "</p></div>" +
    '<div class="row-side"><span class="money label">' + reais(c.valor_centavos) + "</span>" + chip + "</div>" +
    '<div class="venda-acoes">' +
    (st === "pago"
      ? botao("Desfazer", "ghost", "venda-desfazer", c.id, { sm: true })
      : botao("Receber", "secondary", "venda-receber", c.id, { sm: true })) +
    "</div></li>"
  );
}

function formaRecebimento(c) {
  return (
    '<li class="venda venda--painel"><form data-forma="recebimento" data-alvo="' + esc(c.id) + '">' +
    '<p class="section-title">Receber de ' + esc(nomeDe(c.aluno_id)) + "</p>" +
    '<p class="micro muted" style="margin-top:4px">' + reais(c.valor_centavos) + " · comprado em " +
    dataCurta(c.criada_em) + "</p>" +
    '<label class="campo"><span class="micro muted">Como o aluno pagou</span>' +
    '<select class="input" name="forma" required>' +
    Object.keys(FORMAS).map((k) => '<option value="' + k + '">' + esc(FORMAS[k]) + "</option>").join("") +
    "</select></label>" +
    '<div class="produto-acoes">' +
    '<button type="submit" class="btn btn--primary btn--sm">Confirmar</button>' +
    botao("Cancelar", "ghost", "venda-fechar", "", { sm: true }) +
    "</div></form></li>"
  );
}

function vendasProduto(p) {
  const vendas = dados.compras.filter((c) => c.produto_id === p.id);
  const devendo = vendas.filter((c) => !c.pago_em).reduce((s, c) => s + c.valor_centavos, 0);
  const recebendo = painelProduto.recebendo;

  return (
    '<li class="produto-painel produto-painel--gaveta">' +
    '<div class="section-head"><h3 class="section-title">Histórico de vendas</h3>' +
    (devendo ? '<p class="micro chip--atraso" style="background:none">' + reais(devendo) + " a receber</p>" : "") +
    "</div>" +
    (vendas.length
      ? '<ul class="rows">' +
        vendas.map((c) => (recebendo === c.id ? formaRecebimento(c) : linhaVenda(c))).join("") + "</ul>"
      : '<p class="micro muted">Nenhuma venda ainda.</p>') +
    "</li>"
  );
}

function linhaProduto(p) {
  const vendidos = dados.compras
    .filter((c) => c.produto_id === p.id)
    .reduce((s, c) => s + c.quantidade, 0);
  const aberto = painelProduto && painelProduto.modo === "vendas" && painelProduto.id === p.id;

  return (
    '<li class="produto' + (aberto ? " produto--aberto" : "") + '">' +
    '<button type="button" class="produto-toque" data-acao="produto-vendas" data-alvo="' + esc(p.id) +
    '" aria-expanded="' + aberto + '">' +
    '<span class="icon-circle">' + icone(p.estoque === 0 ? "package-x" : "package", "icon--lg") + "</span>" +
    '<span class="row-main"><span class="row-name">' + esc(p.nome) + '</span><span class="micro muted">' +
    reais(p.preco_centavos) + " · " + (p.estoque === 0 ? "sem estoque" : p.estoque + " em estoque") +
    (vendidos ? " · " + vendidos + (vendidos === 1 ? " vendido" : " vendidos") : "") + "</span></span>" +
    icone("chevron-down", "icon--seta") + "</button>" +
    '<div class="produto-barra"><div class="produto-estoque">' +
    botao("−", "neutral", "baixar-estoque", p.id, { sm: true, desabilitado: p.estoque === 0 }) +
    botao("+", "neutral", "repor-estoque", p.id, { sm: true }) + "</div>" +
    '<div class="produto-acoes">' +
    botao("Vender", "secondary", "produto-vender", p.id, { sm: true, desabilitado: p.estoque === 0 }) +
    botao("Editar", "ghost", "produto-editar", p.id, { sm: true }) +
    botao("Excluir", "destructive", "produto-remover", p.id, { sm: true }) + "</div></div></li>" +
    (aberto ? vendasProduto(p) : "")
  );
}

function telaProdutosProfessor() {
  const painel = painelProduto || {};
  const itens = dados.produtos.map((p) =>
    painel.id !== p.id
      ? linhaProduto(p)
      : painel.modo === "editar"
        ? formaProduto(p)
        : painel.modo === "remover"
          ? remocaoProduto(p)
          : painel.modo === "vender"
            ? formaVenda(p)
            : linhaProduto(p)
  );
  if (painel.modo === "novo") itens.unshift(formaProduto(null));

  return (
    topo("Produtos", "professor") +
    (painel.modo === "novo"
      ? ""
      : '<p style="margin-bottom:16px">' +
        botao("Novo produto", "secondary", "produto-novo", "", { full: true, icone: "circle-plus" }) + "</p>") +
    (itens.length
      ? '<div class="card card--produto"><ul class="rows">' + itens.join("") + "</ul></div>"
      : vazio("package", "Catálogo vazio", "Cadastre o primeiro material para os alunos comprarem."))
  );
}

// Turmas ativas de um aluno, e o histórico completo (que inclui de onde saiu).
const turmasDe = (alunoId) =>
  dados.matriculas.filter((m) => m.aluno_id === alunoId).map((m) => dados.turmaPorId[m.turma_id]).filter(Boolean);

const creditosDe = (alunoId) =>
  dados.faltas.filter((f) => f.aluno_id === alunoId).length -
  dados.reposicoes.filter((r) => r.aluno_id === alunoId).length;

const ocupadasEm = (turmaId) => dados.matriculas.filter((m) => m.turma_id === turmaId).length;

// A mesma conta de regras.mensalidade_de, só para mostrar na tela: soma das
// turmas em que ele está, menos o desconto. Quem cobra é o banco.
const mensalidadeDe = (a) =>
  Math.round(
    turmasDe(a.id).reduce((soma, t) => soma + t.mensalidade_centavos, 0) *
      (100 - (a.desconto_percentual || 0)) / 100,
  );

function fichaAluno(a) {
  const turmas = turmasDe(a.id);
  const cred = creditosDe(a.id);
  const linha = (rotulo, valor) =>
    '<li><span class="micro faint ficha-rotulo">' + rotulo + "</span>" +
    '<span class="ficha-valor">' + valor + "</span></li>";

  return (
    '<li class="produto-painel produto-painel--gaveta">' +
    '<ul class="ficha">' +
    linha("Turmas", turmas.length
      ? turmas.map((t) => esc(t.nome)).join("<br>")
      : '<span class="muted">Nenhuma — saiu do ateliê</span>') +
    linha("Telefone", a.telefone ? esc(a.telefone) : '<span class="muted">não informado</span>') +
    linha("E-mail", a.email ? esc(a.email) : '<span class="muted">não informado</span>') +
    linha("Conta no app", a.usuario_id
      ? '<span class="inline-note">' + icone("check", "icon--sm icon--ok") + "criada</span>"
      : '<span class="muted">ainda não se cadastrou</span>') +
    linha("Mensalidade", turmas.length
      ? reais(mensalidadeDe(a)) +
        (a.desconto_percentual
          ? ' <span class="micro muted">· ' + a.desconto_percentual + "% de desconto</span>"
          : "")
      : '<span class="muted">nada: fora de turma</span>') +
    linha("Vence todo dia", String(a.dia_cobranca || 10)) +
    (cred > 0 ? linha("Reposição", cred + (cred === 1 ? " crédito" : " créditos")) : "") +
    "</ul>" +
    '<div class="produto-acoes">' +
    botao("Editar", "secondary", "aluno-editar", a.id, { sm: true }) +
    botao("Fechar", "ghost", "aluno-fechar", "", { sm: true }) +
    "</div></li>"
  );
}

function formaAluno(a) {
  const marcadas = a ? turmasDe(a.id).map((t) => t.id) : [];
  const valor = (v) => ' value="' + esc(v) + '"';

  return (
    '<li class="produto-painel"><form data-forma="aluno" data-alvo="' + esc(a ? a.id : "") + '">' +
    '<p class="section-title">' + (a ? "Editar aluno" : "Novo aluno") + "</p>" +
    '<label class="campo"><span class="micro muted">Nome completo</span>' +
    '<input class="input" name="nome" maxlength="120" required autocomplete="off"' +
    (a ? valor(a.nome) : "") + "></label>" +
    '<label class="campo"><span class="micro muted">Telefone celular</span>' +
    '<input class="input" name="telefone" type="tel" maxlength="32" autocomplete="off"' +
    (a && a.telefone ? valor(a.telefone) : "") + "></label>" +
    '<label class="campo"><span class="micro muted">E-mail</span>' +
    '<input class="input" name="email" type="email" maxlength="120" autocomplete="off"' +
    (a && a.email ? valor(a.email) : "") + "></label>" +
    '<div class="grid-2">' +
    '<label class="campo"><span class="micro muted">Dia de cobrança</span>' +
    '<input class="input" name="dia_cobranca" type="number" min="1" max="31" step="1" required' +
    valor(a ? a.dia_cobranca : 10) + "></label>" +
    '<label class="campo"><span class="micro muted">Desconto (%)</span>' +
    '<input class="input" name="desconto" type="number" min="0" max="100" step="1" required' +
    valor(a ? a.desconto_percentual : 0) + "></label>" +
    "</div>" +
    '<fieldset class="campo turmas"><legend class="micro muted">Turmas</legend>' +
    dados.turmasAtivas.map((t) => {
      const marcada = marcadas.includes(t.id);
      const livres = t.vagas_regulares - ocupadasEm(t.id);
      return (
        // turma cheia fica fora de alcance, como na tela de quem se cadastra: o
        // banco recusaria de todo jeito, e descobrir isso ao salvar é pior
        '<label class="turma-opcao"><input type="checkbox" name="turmas" value="' + esc(t.id) + '"' +
        (marcada ? " checked" : livres > 0 ? "" : " disabled") + ">" +
        '<span class="turma-nome">' + esc(t.nome) + '<span class="micro muted"> · ' +
        (marcada ? "matriculado" : livres > 0 ? livres + (livres === 1 ? " vaga" : " vagas") : "sem vaga") +
        "</span></span></label>"
      );
    }).join("") +
    (a
      ? '<p class="micro faint" style="margin-top:8px">Desmarcar todas faz dele um ex-aluno: sai das turmas e continua no histórico.</p>'
      : '<p class="micro faint" style="margin-top:8px">Um aluno nasce em pelo menos uma turma.</p>') +
    "</fieldset>" +
    '<div class="produto-acoes">' +
    '<button type="submit" class="btn btn--primary btn--sm">Salvar</button>' +
    botao("Cancelar", "ghost", "aluno-fechar", "", { sm: true }) +
    "</div></form></li>"
  );
}

// `podeAbrir` existe porque um aluno de duas turmas aparece nas duas seções: sem
// isso a ficha e o formulário sairiam duplicados, e editar num deixaria o outro
// mostrando dado velho. Só a primeira aparição carrega o painel.
function linhaAluno(a, exAluno, podeAbrir, turmaDaSecao) {
  const painel = painelAluno || {};
  const aberto = podeAbrir && painel.id === a.id && painel.modo === "ficha";
  const mesAtual = isoHoje().slice(0, 7);
  const mes = dados.mensalidades.find((m) => m.aluno_id === a.id && m.competencia.slice(0, 7) === mesAtual);
  const cred = creditosDe(a.id);

  // repetir o nome da turma dentro da seção dela seria ruído; o que informa é
  // onde mais esse aluno está
  const outras = turmasDe(a.id).filter((t) => t.id !== turmaDaSecao).map((t) => t.nome);
  const abaixo = exAluno
    ? "saiu do ateliê"
    : outras.length
      ? "também em " + outras.join(", ")
      : cred > 0
        ? cred + (cred === 1 ? " crédito" : " créditos") + " de reposição"
        : "";

  const situacao = exAluno
    ? ""
    : mes && statusDe(mes) === "atrasado"
      ? '<span class="chip chip--atraso">' + icone("alert-circle", "icon--sm") + "em atraso</span>"
      : '<span class="chip chip--ok">' + icone("check", "icon--sm icon--ok") + "em dia</span>";

  return (
    '<li class="produto' + (aberto ? " produto--aberto" : "") + '">' +
    '<button type="button" class="produto-toque" data-acao="aluno-ficha" data-alvo="' + esc(a.id) +
    '" aria-expanded="' + aberto + '">' + avatar(a.nome, true) +
    '<span class="row-main"><span class="row-name">' + esc(a.nome) + "</span>" +
    (abaixo ? '<span class="micro muted">' + esc(abaixo) + "</span>" : "") + "</span>" +
    situacao + icone("chevron-down", "icon--seta") + "</button></li>" +
    (aberto ? fichaAluno(a) : "") +
    (podeAbrir && painel.id === a.id && painel.modo === "editar" ? formaAluno(a) : "")
  );
}

function telaAlunosProfessor() {
  const painel = painelAluno || {};
  const alunos = dados.perfis.filter((p) => p.papel === "aluno");
  const ativo = (a) => dados.matriculas.some((m) => m.aluno_id === a.id);
  const exAlunos = alunos.filter((a) => !ativo(a)).sort((x, y) => x.nome.localeCompare(y.nome));
  const jaAberto = new Set();
  const comPainel = (a) => {
    const primeira = !jaAberto.has(a.id);
    jaAberto.add(a.id);
    return primeira;
  };

  const secao = (titulo, contagem, itens) =>
    itens.length
      ? '<section style="margin-bottom:24px"><div class="section-head">' +
        '<h2 class="section-title">' + esc(titulo) + "</h2>" +
        '<p class="micro muted">' + esc(contagem) + "</p></div>" +
        '<div class="card"><ul class="rows">' + itens.join("") + "</ul></div></section>"
      : "";

  const porTurma = dados.turmasAtivas.map((t) => {
    const membros = dados.matriculas
      .filter((m) => m.turma_id === t.id)
      .map((m) => dados.perfilPorId[m.aluno_id])
      .filter(Boolean)
      .sort((x, y) => x.nome.localeCompare(y.nome));
    return secao(t.nome, membros.length + " de " + t.vagas_regulares + " vagas",
      membros.map((a) => linhaAluno(a, false, comPainel(a), t.id)));
  }).join("");

  return (
    topo("Alunos", "professor") +
    (painel.modo === "novo"
      ? '<div class="card" style="margin-bottom:24px"><ul class="rows">' + formaAluno(null) + "</ul></div>"
      : '<p style="margin-bottom:24px">' +
        botao("Novo aluno", "secondary", "aluno-novo", "", { full: true, icone: "circle-plus" }) + "</p>") +
    (alunos.length
      ? porTurma + secao("Ex-alunos", exAlunos.length, exAlunos.map((a) => linhaAluno(a, true, comPainel(a), null)))
      : vazio("users", "Nenhum aluno ainda", "Cadastre o primeiro, ou espere alguém se cadastrar pelo app."))
  );
}

function telaCalendarioProfessor() {
  return (
    topo("Calendário", "professor") +
    '<p style="margin-bottom:16px"><a class="btn btn--secondary btn--full" href="#/professor/turmas">' +
    icone("users") + "Turmas do ateliê</a></p>" +
    '<div class="stack stack--tight">' +
    dados.ocupacao.map((oc) => {
      const faltantes = dados.faltas.filter((f) => f.aula_id === oc.aula_id).map((f) => nomeDe(f.aluno_id));
      const repositores = dados.reposicoes.filter((r) => r.aula_id === oc.aula_id).map((r) => nomeDe(r.aluno_id));
      const extra =
        (faltantes.length
          ? '<p class="inline-note micro muted" style="margin-top:8px">' + icone("user-minus", "icon--sm") +
            "Falta avisada: " + esc(faltantes.join(", ")) + "</p>"
          : "") +
        (repositores.length
          ? '<p class="inline-note micro muted" style="margin-top:8px">' + icone("calendar-plus", "icon--sm") +
            "Reposição: " + esc(repositores.join(", ")) + "</p>"
          : "");
      return cartaoOcupacao(oc, extra);
    }).join("") + "</div>"
  );
}

// Quantos entraram e quantos cabem — a conta que decide se a turma recebe mais
// alguém. Conta matrícula ativa: quem saiu não ocupa vaga.
const alunosEm = (turmaId) => dados.matriculas.filter((m) => m.turma_id === turmaId).length;

// Turma em que ninguém nunca entrou é engano recente e pode sumir. Depois da
// primeira matrícula ela vira histórico, e o banco recusa o delete.
const turmaVirgem = (turmaId) => !dados.matriculasTodas.some((m) => m.turma_id === turmaId);

function fichaTurma(t) {
  const dentro = alunosEm(t.id);
  const adiante = dados.aulas.filter((a) => a.turma_id === t.id && a.data > isoHoje()).length;
  const linha = (rotulo, valor) =>
    '<li><span class="micro faint ficha-rotulo">' + rotulo + "</span>" +
    '<span class="ficha-valor">' + valor + "</span></li>";

  return (
    '<li class="produto-painel produto-painel--gaveta">' +
    '<ul class="ficha">' +
    linha("Quando", esc(nomeDia(t.dia_semana)) + ", " + esc(t.horario)) +
    linha("Vagas regulares", dentro + " de " + t.vagas_regulares) +
    linha("Vagas de reposição", String(t.vagas_reposicao)) +
    linha("Mensalidade", reais(t.mensalidade_centavos)) +
    linha("Aulas à frente", t.encerrada_em
      ? '<span class="muted">nenhuma: turma encerrada</span>'
      : String(adiante)) +
    (t.encerrada_em ? linha("Encerrada em", dataCurta(t.encerrada_em)) : "") +
    "</ul>" +
    '<div class="produto-acoes">' +
    (t.encerrada_em
      ? botao("Reabrir", "secondary", "turma-reabrir", t.id, { sm: true })
      : botao("Editar", "secondary", "turma-editar", t.id, { sm: true }) +
        botao("Encerrar", "neutral", "turma-encerrar", t.id, { sm: true })) +
    (turmaVirgem(t.id) ? botao("Excluir", "destructive", "turma-apagar", t.id, { sm: true }) : "") +
    botao("Fechar", "ghost", "turma-fechar", "", { sm: true }) +
    "</div></li>"
  );
}

function formaTurma(t) {
  const valor = (v) => ' value="' + esc(v) + '"';
  const numero = (nome, rotulo, v, min) =>
    '<label class="campo"><span class="micro muted">' + rotulo + "</span>" +
    '<input class="input" name="' + nome + '" type="number" min="' + min + '" step="1" required' +
    valor(v) + "></label>";

  return (
    '<li class="produto-painel"><form data-forma="turma" data-alvo="' + esc(t ? t.id : "") + '">' +
    '<p class="section-title">' + (t ? "Editar turma" : "Nova turma") + "</p>" +
    '<label class="campo"><span class="micro muted">Nome</span>' +
    '<input class="input" name="nome" maxlength="80" required autocomplete="off"' +
    (t ? valor(t.nome) : "") + "></label>" +
    '<label class="campo"><span class="micro muted">Dia da semana</span>' +
    '<select class="input" name="dia_semana">' +
    DIAS.map((nome, n) =>
      '<option value="' + n + '"' + (t && t.dia_semana === n ? " selected" : "") + ">" +
      esc(nome) + "</option>").join("") +
    "</select></label>" +
    '<label class="campo"><span class="micro muted">Horário</span>' +
    '<input class="input" name="horario" maxlength="40" required autocomplete="off"' +
    ' placeholder="19h00 às 21h00"' + (t ? valor(t.horario) : "") + "></label>" +
    '<div class="grid-2">' +
    numero("vagas_regulares", "Vagas regulares", t ? t.vagas_regulares : 8, 1) +
    numero("vagas_reposicao", "Vagas de reposição", t ? t.vagas_reposicao : 2, 0) +
    "</div>" +
    '<label class="campo"><span class="micro muted">Mensalidade (R$)</span>' +
    '<input class="input" name="mensalidade" type="number" min="0" step="0.01" required' +
    valor(t ? (t.mensalidade_centavos / 100).toFixed(2) : "380.00") + "></label>" +
    '<p class="micro faint" style="margin-top:8px">' +
    (t
      ? "Mudar o dia refaz as aulas à frente. As mensalidades já lançadas guardam o valor de quando nasceram."
      : "A turma não tem prazo: as aulas vão sendo abertas sozinhas, sempre umas doze semanas à frente.") +
    "</p>" +
    '<div class="produto-acoes">' +
    '<button type="submit" class="btn btn--primary btn--sm">Salvar</button>' +
    botao("Cancelar", "ghost", "turma-fechar", "", { sm: true }) +
    "</div></form></li>"
  );
}

function encerramentoTurma(t) {
  const dentro = alunosEm(t.id);
  return (
    '<li class="produto-painel">' +
    '<p class="label">Encerrar ' + esc(t.nome) + "?</p>" +
    '<p class="micro muted" style="margin-top:4px">' +
    (dentro
      ? "Os " + dentro + " alunos saem da turma — quem não estiver em outra vira ex-aluno. "
      : "") +
    "Ela sai do calendário e de quem se cadastra. Aulas, faltas e reposições ficam no histórico, " +
    "e reabrir traz a turma de volta (os alunos, não).</p>" +
    '<div class="produto-acoes">' +
    botao("Encerrar", "destructive", "turma-encerrar-agora", t.id, { sm: true }) +
    botao("Cancelar", "ghost", "turma-fechar", "", { sm: true }) +
    "</div></li>"
  );
}

function remocaoTurma(t) {
  return (
    '<li class="produto-painel">' +
    '<p class="label">Excluir ' + esc(t.nome) + "?</p>" +
    '<p class="micro muted" style="margin-top:4px">Ninguém entrou nela ainda, então some sem deixar rastro, ' +
    "com as aulas que tinha à frente.</p>" +
    '<div class="produto-acoes">' +
    botao("Excluir", "destructive", "turma-apagar-agora", t.id, { sm: true }) +
    botao("Cancelar", "ghost", "turma-fechar", "", { sm: true }) +
    "</div></li>"
  );
}

function linhaTurma(t) {
  const painel = painelTurma || {};
  const aberto = painel.id === t.id && painel.modo === "ficha";
  const dentro = alunosEm(t.id);
  const cheia = dentro >= t.vagas_regulares;

  const abaixo = t.encerrada_em
    ? "encerrada em " + dataCurta(t.encerrada_em)
    : diaCurto(t.dia_semana) + " · " + t.horario;

  return (
    '<li class="produto' + (aberto ? " produto--aberto" : "") + '">' +
    '<button type="button" class="produto-toque" data-acao="turma-ficha" data-alvo="' + esc(t.id) +
    '" aria-expanded="' + aberto + '">' +
    '<span class="row-main"><span class="row-name">' + esc(t.nome) + "</span>" +
    '<span class="micro muted">' + esc(abaixo) + "</span></span>" +
    (t.encerrada_em
      ? ""
      : '<span class="chip' + (cheia ? "" : " chip--ok") + '">' + dentro + " de " + t.vagas_regulares + "</span>") +
    icone("chevron-down", "icon--seta") + "</button></li>" +
    (aberto ? fichaTurma(t) : "") +
    (painel.id === t.id && painel.modo === "editar" ? formaTurma(t) : "") +
    (painel.id === t.id && painel.modo === "encerrar" ? encerramentoTurma(t) : "") +
    (painel.id === t.id && painel.modo === "apagar" ? remocaoTurma(t) : "")
  );
}

function telaTurmasProfessor() {
  const painel = painelTurma || {};
  const encerradas = dados.turmas.filter((t) => t.encerrada_em);

  const secao = (titulo, contagem, itens) =>
    itens.length
      ? '<section style="margin-bottom:24px"><div class="section-head">' +
        '<h2 class="section-title">' + esc(titulo) + "</h2>" +
        '<p class="micro muted">' + esc(contagem) + "</p></div>" +
        '<div class="card card--calendario"><ul class="rows">' + itens.join("") + "</ul></div></section>"
      : "";

  return (
    topo("Turmas", "professor/calendario") +
    (painel.modo === "nova"
      ? '<div class="card card--calendario" style="margin-bottom:24px"><ul class="rows">' +
        formaTurma(null) + "</ul></div>"
      : '<p style="margin-bottom:24px">' +
        botao("Nova turma", "secondary", "turma-nova", "", { full: true, icone: "circle-plus" }) + "</p>") +
    (dados.turmasAtivas.length || encerradas.length
      ? secao("Em atividade", dados.turmasAtivas.length, dados.turmasAtivas.map(linhaTurma)) +
        secao("Encerradas", encerradas.length, encerradas.map(linhaTurma))
      : vazio("calendar-days", "Nenhuma turma ainda", "Crie a primeira: o calendário dela se enche e se renova sozinho."))
  );
}

function telaFinanceiroProfessor() {
  const abertas = dados.mensalidades.filter((m) => statusDe(m) !== "pago");
  // recebido não sai de vista: o painel guarda o que entrou, não só o que falta
  const recebidas = dados.mensalidades.filter((m) => statusDe(m) === "pago")
    .slice().sort((a, b) => (a.pago_em > b.pago_em ? -1 : 1));
  const entrou = recebidas.reduce((soma, m) => soma + m.valor_centavos, 0);

  // O que falta receber se divide no tempo, não no trâmite: o que ainda vence
  // neste mês, e o que já passou do prazo. Um punhado vence num mês à frente —
  // é a primeira cobrança de quem entrou tarde — e não cabe em nenhum dos dois.
  const esteMes = isoHoje().slice(0, 7);
  const vencidas = abertas.filter((m) => statusDe(m) === "atrasado");
  const doMes = abertas.filter((m) => statusDe(m) !== "atrasado" && m.vencimento.slice(0, 7) === esteMes);
  const adiante = abertas.filter((m) => statusDe(m) !== "atrasado" && m.vencimento.slice(0, 7) > esteMes);
  const soma = (lista) => lista.reduce((t, m) => t + m.valor_centavos, 0);
  const vendido = dados.compras.reduce((s, c) => s + c.valor_centavos, 0);
  const aguardando = abertas.filter((m) => { const p = pagamentoDe(m.id); return p && !p.confirmado_em; });
  const atrasadas = abertas.filter((m) => statusDe(m) === "atrasado" && !aguardando.includes(m));
  const aVencer = abertas.filter((m) => statusDe(m) === "aberto" && !aguardando.includes(m));

  const bloco = (titulo, lista) =>
    lista.length
      ? '<section style="margin-bottom:24px"><div class="section-head"><h2 class="section-title">' + esc(titulo) +
        '</h2><p class="micro muted">' + lista.length + "</p></div>" +
        '<div class="card card--financeiro"><ul class="rows">' + lista.map((m) => linhaMensalidade(m, true)).join("") + "</ul></div></section>"
      : "";

  return (
    topo("Financeiro", "professor") +
    '<div class="card card--financeiro" style="margin-bottom:24px">' +
    '<p class="label muted">A receber em mensalidades</p>' +
    '<div class="grid-2" style="margin-top:12px">' +
    '<div class="tally"><p class="micro muted">Mês atual</p>' +
    dinheiro(soma(doMes), "money--mid") +
    '<p class="micro muted" style="margin-top:4px">' + doMes.length +
    (doMes.length === 1 ? " a vencer" : " a vencer") + "</p></div>" +
    '<div class="tally' + (vencidas.length ? " tally--atraso" : "") + '">' +
    '<p class="micro muted">Atrasos</p>' +
    dinheiro(soma(vencidas), "money--mid") +
    '<p class="micro muted" style="margin-top:4px">' + vencidas.length +
    (vencidas.length === 1 ? " vencida" : " vencidas") + "</p></div>" +
    "</div>" +
    (adiante.length
      ? '<p class="micro muted" style="margin-top:12px">Mais ' + reais(soma(adiante)) +
        " vencendo nos meses à frente.</p>"
      : "") +
    '<p class="micro muted" style="margin-top:12px">' + reais(vendido) +
    " vendido em material</p></div>" +
    bloco("Aguardando sua confirmação", aguardando) +
    bloco("Em atraso", atrasadas) +
    bloco("A vencer", aVencer) +
    (abertas.length
      ? ""
      : '<div style="margin-bottom:24px">' +
        vazio("check", "Nada em aberto", "Todas as mensalidades lançadas estão quitadas.") + "</div>") +
    (recebidas.length
      ? '<section><div class="section-head"><h2 class="section-title">Já recebidas</h2>' +
        '<p class="micro muted">' + reais(entrou) + "</p></div>" +
        '<div class="card card--financeiro"><ul class="rows">' +
        recebidas.slice(0, 30).map((m) => linhaMensalidade(m, true)).join("") + "</ul></div>" +
        (recebidas.length > 30
          ? '<p class="micro muted" style="margin-top:8px">mais ' + (recebidas.length - 30) +
            " no histórico</p>"
          : "") +
        "</section>"
      : "")
  );
}

function telaAluno() {
  const t = minhaTurma();
  const minhas = dados.mensalidades.filter((m) => m.aluno_id === dados.eu);
  const atraso = minhas.find((m) => statusDe(m) === "atrasado");
  const aberta = minhas.find((m) => statusDe(m) === "aberto");
  const proxima = t ? dados.ocupacao.find((oc) => oc.turma_id === t.id) : null;
  const falta = proxima ? dados.faltas.find((f) => f.aula_id === proxima.aula_id && f.aluno_id === dados.eu) : null;
  const declaradoAtraso = atraso ? pagamentoDe(atraso.id) : null;
  const declaradoAberta = aberta ? pagamentoDe(aberta.id) : null;

  const cartaoPagamento = (m, declarado, variante) => {
    if (declarado) {
      return '<p class="inline-note label" style="margin-top:16px;color:var(--ok)">' +
        icone("check", "icon--sm icon--ok") + "Pagamento informado, aguardando confirmação</p>";
    }
    return botao("Pagar", variante, "declarar-pagamento", m.id, { full: true });
  };

  return (
    '<header class="topbar">' + avatar(dados.perfil.nome) +
    '<div><p class="label muted">Bom te ver de novo</p><h1 class="screen-title">' +
    esc(dados.perfil.nome.split(" ")[0]) + "</h1></div></header>" +
    '<div class="stack">' +
    (atraso
      ? '<div class="alert alert--financeiro"><p class="inline-note label muted">' + icone("alert-circle", "icon--clay") +
        "Mensalidade de " + esc(nomeMes(atraso.competencia)) + " em atraso</p>" +
        dinheiro(atraso.valor_centavos, "money--big") +
        '<p class="label muted" style="margin-top:4px">Venceu em ' + dataCurta(atraso.vencimento) + "</p>" +
        cartaoPagamento(atraso, declaradoAtraso, "primary") + "</div>"
      : "") +
    (proxima
      ? '<article class="card card--calendario"><p class="label muted">Próxima aula</p>' +
        '<p class="heading" style="margin-top:4px">' + esc(diaSemana(proxima.data)) + ", " + dataCurta(proxima.data) + "</p>" +
        '<p class="label muted" style="margin-top:4px">' + esc(t.nome) + " · " + esc(t.horario) + "</p>" +
        (falta
          ? '<p class="inline-note label" style="margin-top:12px;color:var(--clay)">' + icone("calendar-x") + "Falta avisada</p>" +
            botao("Cancelar aviso", "neutral", "desfazer-falta", falta.id, { full: true })
          : botao("Vou faltar", "secondary", "avisar-falta", proxima.aula_id, { full: true, icone: "calendar-x" })) +
        "</article>"
      : "") +
    (aberta
      ? '<article class="card card--financeiro"><p class="inline-note label muted">' + icone("clock", "icon--warn") +
        '<span style="color:var(--warn)">Mensalidade de ' + esc(nomeMes(aberta.competencia)) + "</span></p>" +
        dinheiro(aberta.valor_centavos, "money--mid") +
        '<p class="label muted" style="margin-top:4px">Vence em ' + dataCurta(aberta.vencimento) + "</p>" +
        cartaoPagamento(aberta, declaradoAberta, atraso ? "neutral" : "primary") + "</article>"
      : vazio("check", "Mensalidades em dia", "Nada a pagar por enquanto.")) +
    "</div>"
  );
}

function telaProdutosAluno() {
  const minhas = dados.compras.filter((c) => c.aluno_id === dados.eu);
  const gasto = minhas.reduce((s, c) => s + c.valor_centavos, 0);
  const devendo = minhas.filter((c) => !c.pago_em).reduce((s, c) => s + c.valor_centavos, 0);
  return (
    topo("Produtos", "aluno") +
    (dados.produtos.length
      ? '<div class="card card--produto" style="margin-bottom:16px"><ul class="rows">' +
        dados.produtos.map((p) =>
          "<li>" + '<span class="icon-circle">' + icone(p.estoque === 0 ? "package-x" : "package", "icon--lg") + "</span>" +
          '<div class="row-main"><p class="row-name">' + esc(p.nome) + '</p><p class="micro muted">' +
          reais(p.preco_centavos) + (p.estoque === 0 ? " · sem estoque" : "") + "</p></div>" +
          botao(p.estoque === 0 ? "Esgotado" : "Comprar", "neutral", "comprar", p.id, { sm: true, desabilitado: p.estoque === 0 }) +
          "</li>"
        ).join("") + "</ul></div>"
      : '<div style="margin-bottom:16px">' +
        vazio("package", "Nada à venda", "O ateliê ainda não pôs material no catálogo.") + "</div>") +
    (minhas.length
      ? '<section><div class="section-head"><h2 class="section-title">Suas compras</h2>' +
        '<p class="micro ' + (devendo ? "chip--atraso" : "muted") + '" style="background:none">' +
        (devendo ? reais(devendo) + " a pagar" : reais(gasto) + " no total") + "</p></div>" +
        '<div class="card card--produto"><ul class="rows">' +
        minhas.map((c) => {
          const p = dados.produtoPorId[c.produto_id];
          const st = statusCompra(c);
          return "<li>" + iconeCirculo("package") +
            '<div class="row-main"><p class="row-name">' + esc(p ? p.nome : "Produto do catálogo") +
            '</p><p class="micro muted">' + dataCurta(c.criada_em) +
            (c.quantidade > 1 ? " · " + c.quantidade + " unidades" : "") + "</p></div>" +
            '<div class="row-side"><span class="money label">' + reais(c.valor_centavos) + "</span>" +
            (st === "pago"
              ? '<span class="chip chip--ok">' + icone("check", "icon--sm icon--ok") + "pago</span>"
              : st === "atrasado"
                ? '<span class="chip chip--atraso">' + icone("alert-circle", "icon--sm") + "em atraso</span>"
                : '<span class="chip">a pagar</span>') +
            "</div></li>";
        }).join("") + "</ul></div></section>"
      : "")
  );
}

// O calendário do aluno: quando ele tem aula, o aviso de falta que vira
// crédito, e o que fazer com os créditos que ele já tem.
function telaAulasAluno() {
  const turmas = minhasTurmas();
  const idsTurmas = turmas.map((t) => t.id);
  const todasMinhas = dados.ocupacao.filter((oc) => idsTurmas.includes(oc.turma_id));
  // O período inteiro são umas doze aulas, cada uma com seu botão de faltar.
  // Ninguém avisa falta de novembro em setembro: mostrar as próximas basta.
  const minhasAulas = todasMinhas.slice(0, 4);
  const marcadas = dados.reposicoes.filter((r) => r.aluno_id === dados.eu);
  const idsMarcados = marcadas.map((r) => r.aula_id);
  const meusFaltados = dados.faltas.filter((f) => f.aluno_id === dados.eu).map((f) => f.aula_id);
  const livres = dados.ocupacao.filter(
    (oc) => !idsMarcados.includes(oc.aula_id) && !meusFaltados.includes(oc.aula_id) &&
            oc.reposicoes_ocupadas < oc.reposicoes_total,
  );

  const quando = (oc) => {
    const t = dados.turmaPorId[oc.turma_id];
    return '<div class="row-main"><p class="row-name">' + esc(diaSemana(oc.data)) + ", " + dataCurta(oc.data) +
      '</p><p class="micro muted">' + esc(t ? t.nome : "") + (t ? " · " + esc(t.horario) : "");
  };

  const linha = (oc, acao, rotulo, variante, alvo) =>
    "<li>" + quando(oc) + " · reposição " + oc.reposicoes_ocupadas + " de " + oc.reposicoes_total +
    "</p></div>" + botao(rotulo, variante, acao, alvo, { sm: true }) + "</li>";

  const linhaMinha = (oc) => {
    const falta = dados.faltas.find((f) => f.aula_id === oc.aula_id && f.aluno_id === dados.eu);
    return "<li>" + quando(oc) + (falta ? " · falta avisada" : "") + "</p></div>" +
      (falta
        ? botao("Desfazer", "neutral", "desfazer-falta", falta.id, { sm: true })
        : botao("Vou faltar", "secondary", "avisar-falta", oc.aula_id, { sm: true })) +
      "</li>";
  };

  return (
    topo("Aulas", "aluno") +
    (turmas.length
      ? '<section style="margin-bottom:24px"><div class="section-head">' +
        '<h2 class="section-title">Suas aulas</h2><p class="micro muted">' +
        turmas.map((t) => esc(t.nome)).join(" · ") + "</p></div>" +
        (minhasAulas.length
          ? '<div class="card card--calendario"><ul class="rows">' +
            minhasAulas.map(linhaMinha).join("") + "</ul></div>" +
            (todasMinhas.length > minhasAulas.length
              ? '<p class="micro muted" style="margin-top:8px">mais ' +
                (todasMinhas.length - minhasAulas.length) + " no período</p>"
              : "")
          : vazio("calendar-days", "Nenhuma aula marcada", "O ateliê ainda não abriu as aulas do período.")) +
        "</section>"
      : '<div style="margin-bottom:24px">' +
        vazio("calendar-days", "Sem turma", "Fale com o ateliê para entrar numa turma.") + "</div>") +
    '<article class="card card--calendario" style="margin-bottom:24px">' +
    '<p class="label muted">Créditos de reposição</p>' +
    '<p class="money money--big">' + dados.creditos + "</p>" +
    '<p class="micro muted" style="margin-top:4px">Cada falta avisada antes da aula vale um crédito.</p></article>' +
    (marcadas.length
      ? '<section style="margin-bottom:24px"><div class="section-head"><h2 class="section-title">Suas reposições</h2></div>' +
        '<div class="card card--calendario"><ul class="rows">' +
        marcadas.map((r) => {
          const oc = dados.ocupacao.find((o) => o.aula_id === r.aula_id);
          return oc ? linha(oc, "cancelar-reposicao", "Cancelar", "destructive", r.id) : "";
        }).join("") + "</ul></div></section>"
      : "") +
    '<section><div class="section-head"><h2 class="section-title">Vagas livres</h2></div>' +
    (dados.creditos < 1
      ? vazio("calendar-plus", "Nada a marcar", "Sem crédito, não há reposição para escolher.")
      : livres.length
        ? '<div class="card card--calendario"><ul class="rows">' +
          livres.map((oc) => linha(oc, "marcar-reposicao", "Marcar", "neutral", oc.aula_id)).join("") + "</ul></div>"
        : vazio("calendar-plus", "Sem vaga de reposição", "As aulas do período estão com as vagas de reposição ocupadas.")) +
    "</section>"
  );
}

// O dinheiro do aluno num lugar só. As compras aparecem aqui pelo que ficou
// devendo; o histórico delas fica em Produtos, que é onde ele as fez.
function telaFinanceiroAluno() {
  const minhas = dados.mensalidades.filter((m) => m.aluno_id === dados.eu);
  const abertas = minhas.filter((m) => !m.pago_em)
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
  const pagas = minhas.filter((m) => m.pago_em)
    .sort((a, b) => (a.vencimento > b.vencimento ? -1 : 1));
  const devendo = dados.compras.filter((c) => c.aluno_id === dados.eu && !c.pago_em);
  const total = abertas.reduce((soma, m) => soma + m.valor_centavos, 0) +
    devendo.reduce((soma, c) => soma + c.valor_centavos, 0);

  const cartaoMensalidade = (m) => {
    const atrasada = statusDe(m) === "atrasado";
    const declarado = pagamentoDe(m.id);
    const cor = atrasada ? "clay" : "warn";
    return (
      '<article class="card card--financeiro" style="margin-bottom:12px">' +
      '<p class="inline-note label muted">' + icone(atrasada ? "alert-circle" : "clock", "icon--" + cor) +
      '<span style="color:var(--' + cor + ')">Mensalidade de ' + esc(nomeMes(m.competencia)) + "</span></p>" +
      dinheiro(m.valor_centavos, "money--mid") +
      '<p class="label muted" style="margin-top:4px">' + (atrasada ? "Venceu em " : "Vence em ") +
      dataCurta(m.vencimento) + "</p>" +
      (declarado
        ? '<p class="inline-note label" style="margin-top:16px;color:var(--ok)">' +
          icone("check", "icon--sm icon--ok") + "Pagamento informado, aguardando confirmação</p>"
        : botao("Pagar", atrasada ? "primary" : "secondary", "declarar-pagamento", m.id, { full: true })) +
      "</article>"
    );
  };

  return (
    topo("Financeiro", "aluno") +
    '<div class="card card--financeiro" style="margin-bottom:24px"><p class="label muted">Total a pagar</p>' +
    dinheiro(total, "money--big") +
    '<p class="micro muted" style="margin-top:4px">' +
    (total
      ? abertas.length + (abertas.length === 1 ? " mensalidade" : " mensalidades") +
        (devendo.length ? " · " + devendo.length + (devendo.length === 1 ? " compra" : " compras") : "")
      : "Nada em aberto por enquanto.") +
    "</p></div>" +
    (abertas.length
      ? '<section style="margin-bottom:24px"><div class="section-head">' +
        '<h2 class="section-title">Mensalidades em aberto</h2></div>' +
        abertas.map(cartaoMensalidade).join("") + "</section>"
      : '<div style="margin-bottom:24px">' +
        vazio("check", "Mensalidades em dia", "Nada a pagar por enquanto.") + "</div>") +
    (devendo.length
      ? '<section style="margin-bottom:24px"><div class="section-head">' +
        '<h2 class="section-title">Material a pagar</h2>' +
        '<p class="micro muted">combine com o ateliê</p></div>' +
        '<div class="card card--produto"><ul class="rows">' +
        devendo.map((c) => {
          const produto = dados.produtoPorId[c.produto_id];
          return "<li>" + iconeCirculo("package") +
            '<div class="row-main"><p class="row-name">' + esc(produto ? produto.nome : "Produto do catálogo") +
            '</p><p class="micro muted">' + dataCurta(c.criada_em) +
            (c.quantidade > 1 ? " · " + c.quantidade + " unidades" : "") + "</p></div>" +
            '<div class="row-side"><span class="money label">' + reais(c.valor_centavos) + "</span>" +
            (statusCompra(c) === "atrasado"
              ? '<span class="chip chip--atraso">' + icone("alert-circle", "icon--sm") + "em atraso</span>"
              : '<span class="chip">a pagar</span>') +
            "</div></li>";
        }).join("") + "</ul></div></section>"
      : "") +
    (pagas.length
      ? '<section><div class="section-head"><h2 class="section-title">Já pagas</h2>' +
        '<p class="micro muted">' + pagas.length + "</p></div>" +
        '<div class="card card--financeiro"><ul class="rows">' +
        pagas.map((m) =>
          "<li>" + '<div class="row-main"><p class="row-name">' + esc(nomeMes(m.competencia)) +
          '</p><p class="micro muted">Pagou em ' + dataCurta(m.pago_em) + "</p></div>" +
          '<div class="row-side"><span class="money label">' + reais(m.valor_centavos) + "</span>" +
          '<span class="chip chip--ok">' + icone("check", "icon--sm icon--ok") + "pago</span></div></li>"
        ).join("") + "</ul></div></section>"
      : "")
  );
}

/* -------------------------------------------------------------- roteador --- */

const ROTAS = {
  "#/professor": telaProfessor,
  "#/professor/produtos": telaProdutosProfessor,
  "#/professor/alunos": telaAlunosProfessor,
  "#/professor/calendario": telaCalendarioProfessor,
  "#/professor/turmas": telaTurmasProfessor,
  "#/professor/financeiro": telaFinanceiroProfessor,
  "#/aluno": telaAluno,
  "#/aluno/aulas": telaAulasAluno,
  "#/aluno/produtos": telaProdutosAluno,
  "#/aluno/financeiro": telaFinanceiroAluno,
  "#/conta": telaConta,
  "#/senha": telaSenha,
};

// Rotas de qualquer um: não levam prefixo de papel, e o guarda não as desvia.
const ROTAS_COMUNS = new Set(["#/conta", "#/senha"]);

function desenhaCarregando() {
  alvoApp.innerHTML = '<p class="label muted" style="padding:24px 0">Carregando…</p>';
}

async function render(erroLogin) {
  if (!temSessao()) {
    dados = null;
    alvoApp.classList.remove("shell--abas", "shell--topo");
    if (location.hash === "#/cadastro") {
      if (!turmasAbertas.length) {
        desenhaCarregando();
        try {
          turmasAbertas = await tabela("turmas_abertas").ler("select=*&order=nome");
        } catch (e) {
          turmasAbertas = [];
        }
      }
      alvoApp.innerHTML = telaCadastro(erroLogin);
      ligarCadastro();
      return;
    }
    alvoApp.innerHTML = telaEntrar(erroLogin);
    ligarLogin();
    return;
  }

  if (!dados && !carregando) {
    carregando = true;
    desenhaCarregando();
    try {
      await carregar();
    } catch (e) {
      alvoApp.innerHTML =
        '<div style="padding:24px 0">' +
        vazio("alert-circle", "Não deu para carregar", e.message) +
        '<p style="margin-top:16px"><button class="btn btn--neutral btn--full" data-acao="sair" data-alvo="">Sair</button></p></div>';
      carregando = false;
      return;
    }
    carregando = false;
  }
  if (!dados) return;

  if (!dados.perfil) {
    alvoApp.innerHTML =
      vazio("alert-circle", "Conta sem perfil", "Fale com o ateliê: sua conta existe mas não tem cadastro.") +
      '<p style="margin-top:16px"><button class="btn btn--neutral btn--full" data-acao="sair" data-alvo="">Sair</button></p>';
    return;
  }

  let rota = location.hash || "";
  const inicial = souProfessor() ? "#/professor" : "#/aluno";
  if (!ROTAS[rota]) rota = inicial;
  if (!ROTAS_COMUNS.has(rota)) {
    if (!souProfessor() && rota.startsWith("#/professor")) rota = "#/aluno";
    if (souProfessor() && rota.startsWith("#/aluno")) rota = "#/professor";
  }
  if (rota !== location.hash) {
    location.replace(rota);
    return;
  }

  const trocou = rota !== rotaAnterior;
  if (trocou) { painelProduto = null; painelAluno = null; painelTurma = null; menuUsuario = false; }
  // Os dois papéis navegam pela mesma barra de baixo; só as áreas mudam.
  alvoApp.classList.add("shell--abas", "shell--topo");
  alvoApp.innerHTML = barraTopo() + ROTAS[rota]() + rodape() + abas(rota);
  if (trocou) {
    rotaAnterior = rota;
    window.scrollTo(0, 0);
  }
}

function ligarLogin() {
  const forma = document.getElementById("login");
  if (!forma) return;
  forma.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const botaoEntrar = forma.querySelector("button");
    botaoEntrar.disabled = true;
    botaoEntrar.textContent = "Entrando…";
    try {
      await entrar(forma.email.value.trim(), forma.senha.value);
      rotaAnterior = null;
      location.hash = "";
      await render();
    } catch (e) {
      await render(e.rede ? e.message : "E-mail ou senha não conferem.");
    }
  });
}

function recadoCadastro(e) {
  const m = e.message || "";
  if (/already registered|already been registered|User already/i.test(m)) {
    return "Esse e-mail já tem conta no ateliê. Tente entrar.";
  }
  if (/vagas regulares esgotadas/i.test(m)) return "A turma encheu enquanto você preenchia. Escolha outra.";
  if (/Password should be|password/i.test(m)) return "A senha precisa de pelo menos 8 caracteres.";
  if (/duplicate key|perfil_email_unico/i.test(m)) return "Esse e-mail já está cadastrado no ateliê.";
  return m;
}

function ligarCadastro() {
  const forma = document.getElementById("cadastro");
  if (!forma) return;
  forma.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const turmas = [...forma.querySelectorAll('input[name="turmas"]:checked')].map((c) => c.value);
    if (!turmas.length) {
      aviso("Escolha ao menos uma turma: é ela que define suas aulas.");
      return;
    }
    const botaoCriar = forma.querySelector('button[type="submit"]');
    botaoCriar.disabled = true;
    botaoCriar.textContent = "Criando…";
    try {
      await cadastrar(forma.elements.email.value.trim(), forma.elements.senha.value, {
        nome: forma.elements.nome.value.trim(),
        telefone: forma.elements.telefone.value.trim(),
        turmas: turmas,
        dia_cobranca: forma.elements.dia_cobranca.value,
      });
      turmasAbertas = [];
      rotaAnterior = null;
      if (!temSessao()) {
        // o Supabase está pedindo confirmação de e-mail: a conta existe, a sessão não
        location.hash = "#/entrar";
        await render();
        aviso("Conta criada. Confirme o e-mail que enviamos e depois entre.");
        return;
      }
      location.hash = "";
      await render();
    } catch (e) {
      await render(e.rede ? e.message : recadoCadastro(e));
    }
  });
}

alvoApp.addEventListener("click", async (ev) => {
  // tocar fora fecha o menu; tocar dentro dele deixa o item agir
  if (menuUsuario && !ev.target.closest(".topo-conta")) {
    menuUsuario = false;
    await render();
    return;
  }
  const gatilho = ev.target.closest("button[data-acao]");
  if (!gatilho || gatilho.disabled) return;
  const acao = acoes[gatilho.dataset.acao];
  if (!acao) return;

  gatilho.disabled = true;
  try {
    const recado = await acao(gatilho.dataset.alvo);
    if (gatilho.dataset.acao === "sair") {
      await render();
      return;
    }
    if (!acoesDeTela.has(gatilho.dataset.acao)) dados = null;
    await render();
    if (recado) aviso(recado);
  } catch (e) {
    gatilho.disabled = false;
    aviso(e.message);
  }
});

alvoApp.addEventListener("submit", async (ev) => {
  const forma = ev.target;
  if (forma.matches('form[data-forma="recebimento"]')) {
    ev.preventDefault();
    // o professor está lendo o histórico: registrar não pode fechar o painel
    const aberto = { modo: "vendas", id: painelProduto.id };
    return salvar(forma, () =>
      tabela("compras").atualizar("id=eq." + forma.dataset.alvo, {
        pago_em: new Date().toISOString(),
        forma_pagamento: forma.elements.forma.value,
      }), "Recebimento registrado.", aberto);
  }
  if (forma.matches('form[data-forma="conta"]')) {
    ev.preventDefault();
    const nome = forma.elements.nome.value.trim();
    if (!nome) { aviso("Seu cadastro precisa de nome."); return; }
    return salvar(forma, () =>
      tabela("perfis").atualizar("id=eq." + dados.eu, {
        nome: nome,
        telefone: forma.elements.telefone.value.trim() || null,
      }), "Cadastro atualizado.", null, () => {});
  }
  if (forma.matches('form[data-forma="senha"]')) {
    ev.preventDefault();
    const senha = forma.elements.senha.value;
    if (senha !== forma.elements.confirmacao.value) {
      aviso("As duas senhas não são iguais.");
      return;
    }
    return salvar(forma, () => trocarSenha(senha), "Senha trocada.", null, () => {});
  }
  if (forma.matches('form[data-forma="aluno"]')) {
    ev.preventDefault();
    return salvarAluno(forma);
  }
  if (forma.matches('form[data-forma="turma"]')) {
    ev.preventDefault();
    return salvarTurma(forma);
  }
  if (forma.matches('form[data-forma="venda"]')) {
    ev.preventDefault();
    return salvarVenda(forma);
  }
  if (!forma.matches('form[data-forma="produto"]')) return;
  ev.preventDefault();

  const campos = {
    nome: forma.elements.nome.value.trim(),
    preco_centavos: Math.round(Number(forma.elements.preco.value) * 100),
    estoque: Number(forma.elements.estoque.value),
  };
  if (!campos.nome || !Number.isInteger(campos.preco_centavos) || campos.preco_centavos < 0 ||
      !Number.isInteger(campos.estoque) || campos.estoque < 0) {
    aviso("Confira o nome, o preço e o estoque.");
    return;
  }

  const id = forma.dataset.alvo;
  return salvar(forma, () =>
    id ? tabela("produtos").atualizar("id=eq." + id, campos) : tabela("produtos").inserir(campos),
    id ? "Produto atualizado." : "Produto criado.");
});

// A venda que o professor registra na mão. O preço não vai daqui: quem o
// carimba é o gatilho baixa_estoque, lendo o catálogo — mandar valor pelo
// cliente seria deixar o navegador dizer quanto custa. Pago e forma andam
// juntos porque o banco tem um check exigindo exatamente isso.
async function salvarVenda(forma) {
  const quantidade = Number(forma.elements.quantidade.value);
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    aviso("A quantidade precisa ser pelo menos 1.");
    return;
  }

  const escolhida = forma.elements.forma.value;
  const compra = {
    produto_id: forma.dataset.alvo,
    aluno_id: forma.elements.aluno.value,
    quantidade: quantidade,
    valor_centavos: 0,
  };
  if (escolhida) {
    compra.pago_em = new Date().toISOString();
    compra.forma_pagamento = escolhida;
  }

  return salvar(forma, () => tabela("compras").inserir(compra),
    escolhida ? "Venda registrada e paga." : "Venda registrada, em aberto.");
}

// Turma é PATCH/POST direto: os limites que importam — encolher vaga abaixo de
// quem já está dentro, mudar o dia com falta ou reposição marcada — são gatilho
// no banco, e chegam aqui como mensagem pronta para mostrar.
async function salvarTurma(forma) {
  const id = forma.dataset.alvo;
  const campos = {
    nome: forma.elements.nome.value.trim(),
    dia_semana: Number(forma.elements.dia_semana.value),
    horario: forma.elements.horario.value.trim(),
    vagas_regulares: Number(forma.elements.vagas_regulares.value),
    vagas_reposicao: Number(forma.elements.vagas_reposicao.value),
    mensalidade_centavos: Math.round(Number(forma.elements.mensalidade.value) * 100),
  };

  if (!campos.nome || !campos.horario) {
    aviso("A turma precisa de nome e horário.");
    return;
  }
  if (!Number.isInteger(campos.vagas_regulares) || campos.vagas_regulares < 1 ||
      !Number.isInteger(campos.vagas_reposicao) || campos.vagas_reposicao < 0 ||
      !Number.isInteger(campos.mensalidade_centavos) || campos.mensalidade_centavos < 0) {
    aviso("Confira as vagas e a mensalidade.");
    return;
  }

  return salvar(forma, () =>
    id ? tabela("turmas").atualizar("id=eq." + id, campos) : tabela("turmas").inserir(campos),
    id ? "Turma atualizada." : "Turma criada.",
    null, () => { painelTurma = null; });
}

// Cadastrar é um RPC porque o aluno nasce em pelo menos uma turma, e perfil e
// matrícula precisam entrar na mesma transação. Editar é PATCH, e as turmas são
// reconciliadas linha a linha: desmarcada vira ativa=false em vez de sumir, que
// é o que faz do aluno um ex-aluno sem apagar o histórico.
async function salvarAluno(forma) {
  const id = forma.dataset.alvo;
  const campos = {
    nome: forma.elements.nome.value.trim(),
    telefone: forma.elements.telefone.value.trim(),
    email: forma.elements.email.value.trim().toLowerCase(),
    dia_cobranca: Number(forma.elements.dia_cobranca.value),
    desconto_percentual: Number(forma.elements.desconto.value),
  };
  const escolhidas = [...forma.querySelectorAll('input[name="turmas"]:checked')].map((c) => c.value);

  if (!campos.nome) {
    aviso("O aluno precisa de nome.");
    return;
  }
  if (!Number.isInteger(campos.dia_cobranca) || campos.dia_cobranca < 1 || campos.dia_cobranca > 31) {
    aviso("O dia de cobrança vai de 1 a 31.");
    return;
  }
  if (!Number.isInteger(campos.desconto_percentual) ||
      campos.desconto_percentual < 0 || campos.desconto_percentual > 100) {
    aviso("O desconto vai de 0 a 100 por cento.");
    return;
  }
  if (!id && !escolhidas.length) {
    aviso("Escolha ao menos uma turma: um aluno nasce em turma.");
    return;
  }

  const gravar = id
    ? async () => {
        await tabela("perfis").atualizar("id=eq." + id, {
          nome: campos.nome,
          telefone: campos.telefone || null,
          email: campos.email || null,
          dia_cobranca: campos.dia_cobranca,
          desconto_percentual: campos.desconto_percentual,
        });
        const minhas = dados.matriculasTodas.filter((m) => m.aluno_id === id);
        // as saídas primeiro: assim trocar de turma não esbarra numa vaga que
        // o próprio aluno ainda está ocupando
        for (const m of minhas.filter((m) => m.ativa && !escolhidas.includes(m.turma_id))) {
          await tabela("matriculas").atualizar("id=eq." + m.id, { ativa: false });
        }
        for (const turma of escolhidas) {
          const ja = minhas.find((m) => m.turma_id === turma);
          if (!ja) await tabela("matriculas").inserir({ aluno_id: id, turma_id: turma });
          else if (!ja.ativa) await tabela("matriculas").atualizar("id=eq." + ja.id, { ativa: true });
        }
      }
    : () => rpc("cadastrar_aluno", {
        nome: campos.nome,
        email: campos.email || null,
        telefone: campos.telefone || null,
        turmas: escolhidas,
        dia_cobranca: campos.dia_cobranca,
        desconto_percentual: campos.desconto_percentual,
      });

  return salvar(forma, gravar, id ? "Aluno atualizado." : "Aluno cadastrado.", null, () => { painelAluno = null; });
}

// Todo formulário faz o mesmo: tranca o botão, grava, fecha o painel e recarrega.
async function salvar(forma, gravar, recado, painelDepois, aoFechar) {
  const botaoSalvar = forma.querySelector('button[type="submit"]');
  botaoSalvar.disabled = true;
  try {
    await gravar();
    if (aoFechar) aoFechar();
    else painelProduto = painelDepois || null;
    dados = null;
    await render();
    aviso(recado);
  } catch (e) {
    botaoSalvar.disabled = false;
    aviso(e.message);
  }
}

window.addEventListener("hashchange", () => render());

render();
