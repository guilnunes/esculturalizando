# Esculturalizando

Webapp de gestão para um ateliê de escultura, com duas frentes: o professor
(turmas, alunos, produtos e cobranças) e o aluno (próxima aula, faltas,
reposição, mensalidade e material). Interface toda em português do Brasil e
pensada para o celular primeiro.

No ar em **https://guilnunes.github.io/esculturalizando/**

## Como rodar

Não há passo de instalação, nem build, nem dependências. Abra `index.html` no
navegador, ou sirva a pasta com qualquer servidor estático:

```bash
python3 -m http.server 3000
```

## Como é feito

HTML, CSS e JavaScript puros. Sem framework, sem bundler, sem `node_modules`.
São quatro arquivos:

```
index.html   estrutura e sprite de ícones
styles.css   tokens do sistema visual e componentes
app.js       dados, regras, telas e roteador
fonts/       Fraunces e Inter, subconjunto latino
```

O roteamento é por hash (`#/professor`, `#/aluno/reposicao`), então o app
funciona em qualquer servidor estático sem configuração de rotas. As telas são
funções que devolvem HTML; qualquer ação altera o estado, grava e redesenha.

## O que funciona

O app é operável, não uma maquete. As ações mudam estado de verdade:

- **Avisar falta** numa aula futura gera um crédito de reposição
- **Marcar reposição** consome o crédito e ocupa uma vaga; cancelar devolve
- **Pagar** quita a mensalidade e ela sai das pendências do professor
- **Comprar material** baixa o estoque, que o professor vê na tela de produtos
- **Trocar de aluno** no rodapé da tela do aluno, para ver o app por outros olhos

Tudo isso vive no `localStorage` do navegador. É por aparelho e por navegador:
o professor não vê num celular a falta que o aluno avisou em outro. O botão
"Restaurar dados de exemplo", em duas etapas, devolve o estado inicial.

## Regras que eu inventei

As regras reais de reposição e cobrança ainda não existem. Para o app funcionar
agora, adotei o mínimo defensável — troque quando as de verdade estiverem
definidas, em `app.js`, no objeto `acoes`:

- Falta avisada antes da aula vale um crédito de reposição. Não há prazo mínimo
  de antecedência nem limite de créditos por mês.
- O crédito vale em qualquer turma, desde que a aula tenha vaga de reposição.
- Vagas regulares e vagas de reposição são limites independentes e nunca viram
  um número só. Uma turma pode estar com as regulares esgotadas e ainda receber
  reposição.
- Mensalidade vence dia 10. Sem pagamento até lá, fica em atraso.
- Pagar é simulado: marca como paga, sem gateway.

As datas são calculadas a partir de hoje, então as próximas aulas e os
vencimentos continuam fazendo sentido em qualquer dia que você abrir.

## Sistema visual

Os tokens do guia são custom properties no `:root` de `styles.css`.

- Tema escuro único, sem tema claro
- Branco puro não aparece; o texto claro é sempre `--text` (#F2EAE6)
- Nenhum `box-shadow`; profundidade vem do degrau `bg` → `surface` →
  `surface-raised` e de bordas de 1px
- Escala tipográfica fechada em 32/24/20/16/14/12
- Fraunces só em título de tela e valor de destaque; Inter no resto; dinheiro
  sempre com `tabular-nums`
- Raios de 16px em cards, 12px em controles, total em chips; altura mínima de
  48px em alvo de toque
- Ícones desenhados a partir do Lucide, só contorno, traço 1.75

Vermelho não comunica atraso. A identidade inteira é avermelhada, então um
alerta vermelho se dissolveria no cenário. Atraso se comunica por posição e
peso — card no topo, fundo `surface-raised`, borda esquerda de 3px em `clay`,
raio zero e valor em corpo grande. `danger` fica reservado para ação destrutiva,
que hoje é só "Restaurar dados de exemplo" e "Cancelar reposição".

Uma regra do guia foi dobrada de propósito: quando há mensalidade em atraso, o
único botão primário da tela do aluno fica no card de atraso, e o da mensalidade
a vencer passa a neutro. O guia colocava o primário sempre no card de
mensalidade, mas isso deixaria o botão cheio na conta menos urgente. Continua
valendo um primário por tela, e ele continua sendo de pagamento.

As fontes são servidas do próprio repositório, em `fonts/`. Nenhuma requisição
sai para terceiros.

## Publicação

O workflow em `.github/workflows/deploy.yml` publica o repositório no GitHub
Pages a cada push em `main`. Como não há build, ele só empacota os arquivos e
manda — nenhum passo de compilação para quebrar.

## O que ficou de fora

- Banco de dados, autenticação e gateway de pagamento. Sem servidor, o estado é
  local ao navegador e não há login: a troca entre professor e aluno é livre.
- Histórico. Só existem as próximas quatro aulas de cada turma e as mensalidades
  do mês atual e do próximo.
- Matrícula, criação de turma, cancelamento e mês de férias.
- Testes automatizados.
