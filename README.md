# Esculturalizando

Webapp de gestão para um ateliê de escultura, com duas frentes: o professor
(turmas, alunos, produtos e cobranças) e o aluno (próxima aula, faltas,
reposição, mensalidade e material). Interface toda em português do Brasil e
pensada para o celular primeiro.

No ar em **https://guilnunes.github.io/esculturalizando/**

## Contas de demonstração

| Papel | E-mail | Senha |
|---|---|---|
| Professor | `professor@atelie.test` | `demo1234` |
| Aluna com mensalidade em atraso | `marina@atelie.test` | `demo1234` |
| Aluna em dia | `heloisa@atelie.test` | `demo1234` |

Todos os dezoito alunos usam a mesma senha. Os e-mails seguem o primeiro nome,
em `@atelie.test`. **Antes de usar isso com gente de verdade**, troque as senhas,
tire a dica de login do rodapé da tela de entrada e desligue o cadastro aberto
nas configurações de Auth do Supabase.

## Como rodar

Não há instalação, dependência nem build. Sirva a pasta com qualquer servidor
estático:

```bash
python3 -m http.server 3000
```

Abrir o `index.html` direto pelo `file://` não funciona: o `app.js` é um módulo
ES, e módulo exige origem HTTP.

## Como é feito

HTML, CSS e JavaScript puros no navegador; Postgres no Supabase por trás.

```
index.html   estrutura e sprite de ícones
logo.svg     a marca do ateliê, também usada como favicon
styles.css   tokens do sistema visual e componentes
api.js       acesso à API REST do Supabase, sem SDK
app.js       telas, ações e roteador
fonts/       Fraunces e Inter, subconjunto latino
sql/         schema, regras, políticas e dados iniciais
```

Sem framework, sem bundler, sem `node_modules`. O acesso ao Supabase é `fetch`
direto contra a API REST — nem o SDK oficial entra, para o app não depender de
nenhum CDN em tempo de execução. As fontes também são servidas daqui.

O roteamento é por hash (`#/professor`, `#/aluno/reposicao`), então funciona em
qualquer servidor estático sem configuração de rotas.

## O que funciona

- **Login** por e-mail e senha, com sessão renovada automaticamente
- **Cadastro por dois caminhos**: a pessoa se cadastra e escolhe a turma, ou o
  professor a cadastra pelo app; quando ela cria a conta depois, o perfil que já
  existia é reivindicado pelo e-mail em vez de virar um segundo aluno
- **CRUD de alunos** com nome, telefone, e-mail e turmas; quem sai de todas as
  turmas vira ex-aluno e continua no histórico
- **Avisar falta** numa aula futura gera um crédito de reposição
- **Marcar reposição** consome o crédito e ocupa uma vaga; cancelar devolve
- **Informar pagamento** avisa o ateliê; o professor confirma e a mensalidade
  é quitada
- **Comprar material** baixa o estoque, que o professor vê na hora
- **O catálogo é do professor**: ele cria, edita e exclui produtos pelo app
- **Cada produto guarda seu histórico de vendas**: tocar no item abre quem
  comprou, quando, quanto e por onde pagou; o professor dá baixa ali mesmo
- O professor vê tudo: pendências, ocupação das aulas, quem faltou, quem repõe

Agora é um sistema, não mais um protótipo: dois aparelhos diferentes veem o
mesmo estado. O que o aluno avisa no celular dele aparece no painel do professor.

## As regras vivem no banco

Isto é o ponto do projeto, e está em `sql/002_regras.sql`. As regras não são
disciplina do JavaScript — são coisas que o Postgres recusa a gravar:

- Vagas regulares e vagas de reposição são limites independentes. Uma turma
  pode estar com as regulares esgotadas e ainda receber reposição.
- Ninguém marca reposição sem crédito, em aula já passada, ou numa aula com as
  vagas de reposição cheias.
- Ninguém avisa falta em turma que não cursa (senão fabricaria créditos).
- Ninguém desfaz um aviso de falta cujo crédito já foi gasto.
- O preço de uma compra vem do catálogo, nunca do que o cliente enviou.
- Estoque nunca fica negativo.
- Um aluno nasce em pelo menos uma turma: perfil e matrícula entram na mesma
  transação, e turma cheia derruba o cadastro inteiro sem deixar perfil órfão.
- Produto já vendido não se apaga: a compra guarda a referência, e a chave
  estrangeira é `on delete restrict`.
- Ninguém compra já pago: a política de INSERT em `compras` recusa a linha que
  nasce quitada, e só o professor tem política de UPDATE ali.
- Venda quitada tem forma de pagamento, e forma de pagamento só existe em venda
  quitada — as duas colunas andam juntas ou o check recusa.

O cliente é público: qualquer pessoa pode abrir o console e mandar o que
quiser. Regra que só existe no JavaScript não é regra.

## Segurança

Toda a separação entre um aluno e outro está nas políticas de Row Level
Security, em `sql/003_politicas.sql`. A chave publicável do Supabase fica
exposta no `api.js` — isso é o desenho, não descuido.

Duas decisões que sustentam o resto:

**O aluno não tem nenhuma política de escrita em `mensalidades`.** Quitar a
própria dívida seria uma escrita que a RLS não teria como negar, porque a linha
é legitimamente dele. Por isso pagamento é declaração: o aluno insere em
`pagamentos`, e só o professor pode confirmar. Sem gateway, é o mais honesto
possível.

**As funções de regra moram no schema `regras`, não em `public`.** O PostgREST
publica `public` inteiro como RPC em `/rest/v1/rpc/`, e nada daquilo é para ser
chamado de fora. Os dois únicos RPCs públicos devolvem números agregados,
nunca identidades.

## Publicação

O workflow em `.github/workflows/deploy.yml` publica o repositório no GitHub
Pages a cada push em `main`. Como não há build, ele só empacota os arquivos.

## O que ficou de fora

- **Gateway de pagamento.** Confirmar recebimento é manual. Cobrança de verdade
  precisa de webhook num servidor — Edge Function do Supabase resolve, mas aí
  entra Deno e a CLI.
- **Criação de turma, cancelamento e mês de férias** ainda são trabalho de
  banco. Aluno e matrícula já se fazem pelo app.
- **Geração contínua de aulas.** O banco tem doze semanas à frente, criadas uma
  vez. Um sistema de verdade geraria isso periodicamente.
- **Proteção contra senha vazada** está desligada nas configurações de Auth.
- **Testes automatizados.** As regras foram verificadas por SQL, trocando de
  papel e tentando furá-las; o app, contra um dublê da API.
