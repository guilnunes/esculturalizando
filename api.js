// Acesso ao Supabase pela API REST, sem SDK.
//
// A chave abaixo é publicável: ela nasce para ficar exposta no navegador.
// Quem separa um aluno do outro são as políticas de RLS em sql/003_politicas.sql,
// não o segredo desta constante.

const URL_BASE = "https://farlvkslltiwfsnxymff.supabase.co";
const CHAVE = "sb_publishable_2ri0PZZOvaJ_mccJo_mqWA_EuyoZp2U";
const GUARDA = "esculturalizando:sessao";

let sessao = recuperar();

function recuperar() {
  try {
    const bruto = localStorage.getItem(GUARDA);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) {
    return null;
  }
}

function guardar(nova) {
  sessao = nova;
  try {
    if (nova) localStorage.setItem(GUARDA, JSON.stringify(nova));
    else localStorage.removeItem(GUARDA);
  } catch (e) {
    /* sem persistência: a sessão vale só enquanto a aba estiver aberta */
  }
}

function explica(corpo, status) {
  if (!corpo) return "Erro " + status;
  return (
    corpo.message ||
    corpo.msg ||
    corpo.error_description ||
    corpo.error ||
    "Erro " + status
  );
}

async function chamar(caminho, opcoes = {}, renovavel = true) {
  const cabecalhos = Object.assign(
    { apikey: CHAVE, "Content-Type": "application/json" },
    opcoes.headers || {},
  );
  if (sessao && sessao.access_token) {
    cabecalhos.Authorization = "Bearer " + sessao.access_token;
  }

  let resposta;
  try {
    resposta = await fetch(URL_BASE + caminho,
      Object.assign({}, opcoes, { headers: cabecalhos }));
  } catch (falha) {
    const erro = new Error("Não foi possível falar com o servidor do ateliê.");
    erro.rede = true;
    throw erro;
  }

  if (resposta.status === 401 && renovavel && sessao && sessao.refresh_token) {
    const renovou = await renovar();
    if (renovou) return chamar(caminho, opcoes, false);
  }

  const texto = await resposta.text();
  let corpo = null;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch (e) {
      corpo = { message: texto };
    }
  }

  if (!resposta.ok) throw new Error(explica(corpo, resposta.status));
  return corpo;
}

async function renovar() {
  try {
    const nova = await chamar(
      "/auth/v1/token?grant_type=refresh_token",
      { method: "POST", body: JSON.stringify({ refresh_token: sessao.refresh_token }) },
      false,
    );
    guardar(nova);
    return true;
  } catch (e) {
    guardar(null);
    return false;
  }
}

export function temSessao() {
  return Boolean(sessao && sessao.access_token);
}

export function usuarioId() {
  return sessao && sessao.user ? sessao.user.id : null;
}

export async function entrar(email, senha) {
  const nova = await chamar(
    "/auth/v1/token?grant_type=password",
    { method: "POST", body: JSON.stringify({ email: email, password: senha }) },
    false,
  );
  guardar(nova);
  return nova;
}

// O nome, o telefone e as turmas escolhidas viajam como metadado do usuário;
// quem os lê é o gatilho cria_perfil, que monta o perfil e as matrículas. O
// papel não vai junto de propósito: quem se cadastra aqui entra como aluno.
export async function cadastrar(email, senha, extras) {
  const nova = await chamar(
    "/auth/v1/signup",
    { method: "POST", body: JSON.stringify({ email: email, password: senha, data: extras }) },
    false,
  );
  if (nova && nova.access_token) guardar(nova);
  return nova;
}

export async function sair() {
  try {
    if (temSessao()) await chamar("/auth/v1/logout", { method: "POST" }, false);
  } catch (e) {
    /* o servidor já pode ter descartado o token; encerrar localmente basta */
  }
  guardar(null);
}

export function tabela(nome) {
  const raiz = "/rest/v1/" + nome;
  return {
    ler: (consulta) => chamar(raiz + (consulta ? "?" + consulta : "")),
    inserir: (dados) =>
      chamar(raiz, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(dados),
      }),
    atualizar: (consulta, dados) =>
      chamar(raiz + "?" + consulta, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(dados),
      }),
    remover: (consulta) => chamar(raiz + "?" + consulta, { method: "DELETE" }),
  };
}

export function rpc(nome, argumentos) {
  return chamar("/rest/v1/rpc/" + nome, {
    method: "POST",
    body: JSON.stringify(argumentos || {}),
  });
}
