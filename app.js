import { entrar, sair, temSessao, usuarioId, tabela, rpc } from "./api.js";

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

// Painel aberto na tela de produtos: null, {modo:"novo"}, {modo:"editar",id}
// ou {modo:"remover",id}. É estado de tela, não de dados — some ao trocar de rota.
let painelProduto = null;

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
  const eu = usuarioId();
  const [perfis, turmas, matriculas, aulas, faltas, reposicoes, mensalidades, pagamentos, produtos, compras, ocupacao, creditos] =
    await Promise.all([
      tabela("perfis").ler("select=*&order=nome"),
      tabela("turmas").ler("select=*&order=nome"),
      tabela("matriculas").ler("select=*&ativa=is.true"),
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

  dados = {
    eu,
    perfil: perfis.find((p) => p.id === eu) || null,
    perfis,
    perfilPorId: porId(perfis),
    turmas,
    turmaPorId: porId(turmas),
    matriculas,
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
      .then(() => "Compra registrada."),

  "produto-novo": () => { painelProduto = { modo: "novo" }; return null; },
  "produto-editar": (id) => { painelProduto = { modo: "editar", id: id }; return null; },
  "produto-remover": (id) => { painelProduto = { modo: "remover", id: id }; return null; },
  "produto-fechar": () => { painelProduto = null; return null; },

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

const acoesDeTela = new Set(["produto-novo", "produto-editar", "produto-remover", "produto-fechar"]);

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

const area = (rota, nomeIcone, rotulo) =>
  '<a class="area" href="#/' + rota + '">' + iconeCirculo(nomeIcone) + '<span class="area-label">' + esc(rotulo) + "</span></a>";

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

const rodape = () =>
  '<p style="margin-top:32px"><button class="btn btn--destructive btn--sm" data-acao="sair" data-alvo="">Sair</button></p>';

function cartaoOcupacao(oc, extra) {
  const t = dados.turmaPorId[oc.turma_id];
  const livres = oc.reposicoes_total - oc.reposicoes_ocupadas;
  return (
    '<article class="card"><p>' + esc(t ? t.nome : "Turma") + '</p>' +
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
  const atrasada = statusDe(m) === "atrasado";
  const declarado = pagamentoDe(m.id);
  let acao = "";
  if (comAcao) {
    acao = declarado && !declarado.confirmado_em
      ? botao("Confirmar", "neutral", "confirmar-pagamento", declarado.id, { sm: true })
      : botao("Marcar paga", "neutral", "marcar-paga", m.id, { sm: true });
  }
  return (
    "<li>" + avatar(nomeDe(m.aluno_id), true) +
    '<div class="row-main"><p class="row-name">' + esc(nomeDe(m.aluno_id)) + "</p>" +
    '<p class="inline-note micro muted">' +
    icone(atrasada ? "alert-circle" : "clock", "icon--sm " + (atrasada ? "icon--clay" : "icon--warn")) +
    (atrasada ? "Venceu" : "Vence") + " em " + dataCurta(m.vencimento) +
    (declarado && !declarado.confirmado_em ? " · informou pagamento" : "") + "</p></div>" +
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
    '<p class="micro faint" style="margin-top:24px">Demonstração: professor@atelie.test ou marina@atelie.test, senha demo1234</p>' +
    "</main>"
  );
}

function telaProfessor() {
  const abertas = dados.mensalidades.filter((m) => statusDe(m) !== "pago");
  const ordenadas = abertas.slice().sort((a, b) => {
    const peso = (m) => (statusDe(m) === "atrasado" ? 0 : 1);
    return peso(a) - peso(b) || a.vencimento.localeCompare(b.vencimento) || nomeDe(a.aluno_id).localeCompare(nomeDe(b.aluno_id));
  });
  const mesAtual = isoHoje().slice(0, 7);
  const emDia = dados.mensalidades.filter((m) => m.competencia.slice(0, 7) === mesAtual && m.pago_em).length;
  const visiveis = ordenadas.slice(0, 6);

  return (
    topo("Ateliê") +
    '<section style="margin-bottom:24px">' +
    '<div class="section-head"><h2 class="section-title">Pendências</h2>' +
    '<p class="inline-note micro muted">' + icone("check", "icon--sm icon--ok") +
    "<span>" + emDia + " em dia neste mês</span></p></div>" +
    (visiveis.length
      ? '<div class="card"><ul class="rows">' + visiveis.map((m) => linhaMensalidade(m, false)).join("") + "</ul></div>"
      : vazio("check", "Nenhuma pendência", "Todas as mensalidades do período estão quitadas.")) +
    (ordenadas.length > visiveis.length
      ? '<p class="label" style="margin-top:12px"><a href="#/professor/financeiro">Ver as ' + ordenadas.length + " no painel financeiro</a></p>"
      : "") +
    "</section>" +
    '<section style="margin-bottom:24px"><div class="section-head"><h2 class="section-title">Próximas aulas</h2></div>' +
    '<div class="stack stack--tight">' + dados.ocupacao.slice(0, 3).map((oc) => cartaoOcupacao(oc)).join("") + "</div></section>" +
    '<section><div class="section-head"><h2 class="section-title">Áreas</h2></div><div class="grid-2">' +
    area("professor/produtos", "package", "Produtos") +
    area("professor/alunos", "users", "Alunos") +
    area("professor/calendario", "calendar-days", "Calendário") +
    area("professor/financeiro", "wallet", "Financeiro") +
    "</div></section>"
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

function linhaProduto(p) {
  const vendidos = dados.compras
    .filter((c) => c.produto_id === p.id)
    .reduce((s, c) => s + c.quantidade, 0);
  return (
    '<li class="produto">' +
    '<span class="icon-circle">' + icone(p.estoque === 0 ? "package-x" : "package", "icon--lg") + "</span>" +
    '<div class="row-main"><p class="row-name">' + esc(p.nome) + '</p><p class="micro muted">' +
    reais(p.preco_centavos) + " · " + (p.estoque === 0 ? "sem estoque" : p.estoque + " em estoque") +
    (vendidos ? " · " + vendidos + (vendidos === 1 ? " vendido" : " vendidos") : "") + "</p></div>" +
    '<div class="produto-barra"><div class="produto-estoque">' +
    botao("−", "neutral", "baixar-estoque", p.id, { sm: true, desabilitado: p.estoque === 0 }) +
    botao("+", "neutral", "repor-estoque", p.id, { sm: true }) + "</div>" +
    '<div class="produto-acoes">' +
    botao("Editar", "ghost", "produto-editar", p.id, { sm: true }) +
    botao("Excluir", "destructive", "produto-remover", p.id, { sm: true }) + "</div></div></li>"
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
      ? '<div class="card"><ul class="rows">' + itens.join("") + "</ul></div>"
      : vazio("package", "Catálogo vazio", "Cadastre o primeiro material para os alunos comprarem."))
  );
}

function telaAlunosProfessor() {
  const mesAtual = isoHoje().slice(0, 7);
  return (
    topo("Alunos", "professor") +
    dados.turmas.map((t) => {
      const membros = dados.matriculas
        .filter((m) => m.turma_id === t.id)
        .map((m) => dados.perfilPorId[m.aluno_id])
        .filter(Boolean)
        .sort((a, b) => a.nome.localeCompare(b.nome));
      return (
        '<section style="margin-bottom:24px"><div class="section-head"><h2 class="section-title">' + esc(t.nome) +
        '</h2><p class="micro muted">' + membros.length + " de " + t.vagas_regulares + " vagas</p></div>" +
        '<div class="card"><ul class="rows">' +
        membros.map((a) => {
          const mes = dados.mensalidades.find((m) => m.aluno_id === a.id && m.competencia.slice(0, 7) === mesAtual);
          const atrasada = mes && statusDe(mes) === "atrasado";
          const cred = dados.faltas.filter((f) => f.aluno_id === a.id).length -
                       dados.reposicoes.filter((r) => r.aluno_id === a.id).length;
          return (
            "<li>" + avatar(a.nome, true) +
            '<div class="row-main"><p class="row-name">' + esc(a.nome) + "</p>" +
            (cred > 0 ? '<p class="micro muted">' + cred + (cred === 1 ? " crédito" : " créditos") + " de reposição</p>" : "") +
            "</div>" +
            (atrasada
              ? '<span class="chip chip--atraso">' + icone("alert-circle", "icon--sm") + "em atraso</span>"
              : '<span class="chip chip--ok">' + icone("check", "icon--sm") + "em dia</span>") + "</li>"
          );
        }).join("") + "</ul></div></section>"
      );
    }).join("")
  );
}

function telaCalendarioProfessor() {
  return (
    topo("Calendário", "professor") + '<div class="stack stack--tight">' +
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

function telaFinanceiroProfessor() {
  const abertas = dados.mensalidades.filter((m) => statusDe(m) !== "pago");
  const total = abertas.reduce((s, m) => s + m.valor_centavos, 0);
  const vendido = dados.compras.reduce((s, c) => s + c.valor_centavos, 0);
  const aguardando = abertas.filter((m) => { const p = pagamentoDe(m.id); return p && !p.confirmado_em; });
  const atrasadas = abertas.filter((m) => statusDe(m) === "atrasado" && !aguardando.includes(m));
  const aVencer = abertas.filter((m) => statusDe(m) === "aberto" && !aguardando.includes(m));

  const bloco = (titulo, lista) =>
    lista.length
      ? '<section style="margin-bottom:24px"><div class="section-head"><h2 class="section-title">' + esc(titulo) +
        '</h2><p class="micro muted">' + lista.length + "</p></div>" +
        '<div class="card"><ul class="rows">' + lista.map((m) => linhaMensalidade(m, true)).join("") + "</ul></div></section>"
      : "";

  return (
    topo("Financeiro", "professor") +
    '<div class="card card--raised" style="margin-bottom:24px"><p class="label muted">A receber em mensalidades</p>' +
    dinheiro(total, "money--big") +
    '<p class="micro muted" style="margin-top:4px">' + abertas.length + " em aberto · " + reais(vendido) +
    " vendido em material</p></div>" +
    bloco("Aguardando sua confirmação", aguardando) +
    bloco("Em atraso", atrasadas) +
    bloco("A vencer", aVencer) +
    (abertas.length ? "" : vazio("check", "Nada em aberto", "Todas as mensalidades do período estão quitadas."))
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
      ? '<div class="alert"><p class="inline-note label muted">' + icone("alert-circle", "icon--clay") +
        "Mensalidade de " + esc(nomeMes(atraso.competencia)) + " em atraso</p>" +
        dinheiro(atraso.valor_centavos, "money--big") +
        '<p class="label muted" style="margin-top:4px">Venceu em ' + dataCurta(atraso.vencimento) + "</p>" +
        cartaoPagamento(atraso, declaradoAtraso, "primary") + "</div>"
      : "") +
    (proxima
      ? '<article class="card"><p class="label muted">Próxima aula</p>' +
        '<p class="heading" style="margin-top:4px">' + esc(diaSemana(proxima.data)) + ", " + dataCurta(proxima.data) + "</p>" +
        '<p class="label muted" style="margin-top:4px">' + esc(t.nome) + " · " + esc(t.horario) + "</p>" +
        (falta
          ? '<p class="inline-note label" style="margin-top:12px;color:var(--clay)">' + icone("calendar-x") + "Falta avisada</p>" +
            botao("Cancelar aviso", "neutral", "desfazer-falta", falta.id, { full: true })
          : botao("Vou faltar", "secondary", "avisar-falta", proxima.aula_id, { full: true, icone: "calendar-x" })) +
        "</article>"
      : "") +
    (aberta
      ? '<article class="card"><p class="inline-note label muted">' + icone("clock", "icon--warn") +
        '<span style="color:var(--warn)">Mensalidade de ' + esc(nomeMes(aberta.competencia)) + "</span></p>" +
        dinheiro(aberta.valor_centavos, "money--mid") +
        '<p class="label muted" style="margin-top:4px">Vence em ' + dataCurta(aberta.vencimento) + "</p>" +
        cartaoPagamento(aberta, declaradoAberta, atraso ? "neutral" : "primary") + "</article>"
      : vazio("check", "Mensalidades em dia", "Nada a pagar por enquanto.")) +
    '<div class="grid-2">' +
    area("aluno/produtos", "package", "Produtos") +
    area("aluno/reposicao", "calendar-plus", dados.creditos > 0 ? "Reposição · " + dados.creditos : "Reposição") +
    "</div></div>"
  );
}

function telaProdutosAluno() {
  const minhas = dados.compras.filter((c) => c.aluno_id === dados.eu);
  const gasto = minhas.reduce((s, c) => s + c.valor_centavos, 0);
  return (
    topo("Produtos", "aluno") +
    (dados.produtos.length
      ? '<div class="card" style="margin-bottom:16px"><ul class="rows">' +
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
        '<p class="micro muted">' + reais(gasto) + " no total</p></div>" +
        '<div class="card"><ul class="rows">' +
        minhas.map((c) => {
          const p = dados.produtoPorId[c.produto_id];
          return "<li>" + iconeCirculo("package") +
            '<div class="row-main"><p class="row-name">' + esc(p ? p.nome : "Produto do catálogo") +
            '</p><p class="micro muted">' + dataCurta(c.criada_em) +
            (c.quantidade > 1 ? " · " + c.quantidade + " unidades" : "") + "</p></div>" +
            '<span class="money label">' + reais(c.valor_centavos) + "</span></li>";
        }).join("") + "</ul></div></section>"
      : "")
  );
}

function telaReposicaoAluno() {
  const marcadas = dados.reposicoes.filter((r) => r.aluno_id === dados.eu);
  const idsMarcados = marcadas.map((r) => r.aula_id);
  const meusFaltados = dados.faltas.filter((f) => f.aluno_id === dados.eu).map((f) => f.aula_id);
  const livres = dados.ocupacao.filter(
    (oc) => !idsMarcados.includes(oc.aula_id) && !meusFaltados.includes(oc.aula_id) &&
            oc.reposicoes_ocupadas < oc.reposicoes_total,
  );

  const linha = (oc, acao, rotulo, variante, alvo) => {
    const t = dados.turmaPorId[oc.turma_id];
    return (
      "<li>" + '<div class="row-main"><p class="row-name">' + esc(diaSemana(oc.data)) + ", " + dataCurta(oc.data) + "</p>" +
      '<p class="micro muted">' + esc(t ? t.nome : "") + (t ? " · " + esc(t.horario) : "") +
      " · reposição " + oc.reposicoes_ocupadas + " de " + oc.reposicoes_total + "</p></div>" +
      botao(rotulo, variante, acao, alvo, { sm: true }) + "</li>"
    );
  };

  return (
    topo("Reposição", "aluno") +
    '<div class="card card--raised" style="margin-bottom:24px"><p class="label muted">Créditos disponíveis</p>' +
    '<p class="money money--big">' + dados.creditos + "</p>" +
    '<p class="micro muted" style="margin-top:4px">Cada falta avisada antes da aula vale um crédito.</p></div>' +
    (marcadas.length
      ? '<section style="margin-bottom:24px"><div class="section-head"><h2 class="section-title">Suas reposições</h2></div>' +
        '<div class="card"><ul class="rows">' +
        marcadas.map((r) => {
          const oc = dados.ocupacao.find((o) => o.aula_id === r.aula_id);
          return oc ? linha(oc, "cancelar-reposicao", "Cancelar", "destructive", r.id) : "";
        }).join("") + "</ul></div></section>"
      : "") +
    '<section><div class="section-head"><h2 class="section-title">Vagas livres</h2></div>' +
    (dados.creditos < 1
      ? vazio("calendar-plus", "Nenhum crédito de reposição", "Avise uma falta na sua próxima aula para ganhar um crédito.")
      : livres.length
        ? '<div class="card"><ul class="rows">' +
          livres.map((oc) => linha(oc, "marcar-reposicao", "Marcar", "neutral", oc.aula_id)).join("") + "</ul></div>"
        : vazio("calendar-plus", "Sem vaga de reposição", "As aulas do período estão com as vagas de reposição ocupadas.")) +
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

function desenhaCarregando() {
  alvoApp.innerHTML = '<p class="label muted" style="padding:24px 0">Carregando…</p>';
}

async function render(erroLogin) {
  if (!temSessao()) {
    dados = null;
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
  if (!souProfessor() && rota.startsWith("#/professor")) rota = "#/aluno";
  if (souProfessor() && rota.startsWith("#/aluno")) rota = "#/professor";
  if (rota !== location.hash) {
    location.replace(rota);
    return;
  }

  const trocou = rota !== rotaAnterior;
  if (trocou) painelProduto = null;
  alvoApp.innerHTML = ROTAS[rota]() + rodape();
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

alvoApp.addEventListener("click", async (ev) => {
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
  const salvar = forma.querySelector('button[type="submit"]');
  salvar.disabled = true;
  try {
    if (id) await tabela("produtos").atualizar("id=eq." + id, campos);
    else await tabela("produtos").inserir(campos);
    painelProduto = null;
    dados = null;
    await render();
    aviso(id ? "Produto atualizado." : "Produto criado.");
  } catch (e) {
    salvar.disabled = false;
    aviso(e.message);
  }
});

window.addEventListener("hashchange", () => render());

render();
