# Esculturalizando

Webapp de gestão para um ateliê de escultura, com duas frentes: o professor
(turmas, alunos, produtos e cobranças) e o aluno (próxima aula, faltas,
reposição, mensalidade e material). Interface toda em português do Brasil e
pensada para o celular primeiro.

Esta é a fundação visual — sem banco, sem autenticação e sem regra de negócio.

## Como rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. A raiz redireciona para `/professor`; a home do
aluno fica em `/aluno`.

Outros scripts: `npm run build`, `npm run typecheck`, `npm run lint`.

## Stack

Next.js 15 com App Router, TypeScript em modo estrito, Tailwind CSS 4,
lucide-react e as fontes Fraunces e Inter via `next/font`.

## O que existe

```
app/
  globals.css        tokens do tema e camada base
  layout.tsx         fontes e metadados
  aluno/page.tsx     home do aluno
  professor/page.tsx home do professor
components/ui/       primitivas
lib/                 tipos, dados fixos e formatação
```

### Sistema visual

Os tokens do guia vivem em `app/globals.css`, dentro de `@theme`. O Tailwind 4
publica cada um como custom property em `:root` e como utilitário — `bg-surface`,
`text-clay`, `border-border`, `rounded-card` e assim por diante.

As namespaces padrão do Tailwind para cor, fonte, tamanho de texto, raio e sombra
são zeradas com `--<namespace>-*: initial`. Isso não é decoração: significa que
`bg-white`, `text-red-500`, `text-lg` ou `shadow-md` simplesmente não existem no
projeto. Só os tokens do guia compilam, e um desvio do sistema vira erro visível
em vez de passar despercebido.

- Tema escuro único, sem tema claro e sem `dark:` em lugar nenhum
- Branco puro não aparece; o texto claro é sempre `text` (#F2EAE6)
- Nenhum `box-shadow`; profundidade vem do degrau `bg` → `surface` →
  `surface-raised` e de bordas de 1px
- Escala tipográfica fechada em 32/24/20/16/14/12, exposta como `text-display`,
  `text-title`, `text-heading`, `text-body`, `text-label` e `text-micro`
- Fraunces (`font-display`) só em título de tela e valor de destaque; Inter no
  resto
- Raios: `rounded-card` (16px), `rounded-control` (12px), `rounded-full`
- Espaçamento em múltiplos de 4 e altura mínima de 48px em alvo de toque
- Ícones lucide sempre de contorno, traço 1.75, em 24/20/16px

Vermelho não comunica atraso. A identidade inteira é avermelhada, então um
alerta vermelho se dissolveria no cenário. Atraso se comunica por posição e
peso — card no topo, fundo `surface-raised`, borda esquerda de 3px em `clay` e
valor em corpo grande. `danger` fica reservado para validação de campo e ação
destrutiva, e por isso não aparece em nenhuma das duas telas ainda.

### Primitivas

Em `components/ui`: `Button` (primary, secondary, neutral, destructive), `Card`
(padrão e raised), `AlertCard`, `IconCircle`, `AreaLink`, `Money`, `EmptyState` e
`Avatar`.

`Avatar` não estava na lista original. As duas telas pedem avatar circular e
`IconCircle` não serve — é ícone em `clay`, não iniciais, e o diâmetro é outro.

### Dados

`lib/mock.ts` traz turmas, alunos, mensalidades e próximas aulas fixos, cobrindo
os casos que as telas precisam mostrar: aluna em atraso, alunos em dia e uma
turma com as vagas regulares esgotadas mas uma vaga de reposição livre. Vagas
regulares e vagas de reposição são limites independentes e aparecem sempre como
dois números rotulados, nunca somados.

## O que ficou de fora

- Banco de dados, autenticação e gateway de pagamento
- Regras de reposição e de cobrança, que são a parte complexa do produto
- Telas de Produtos, Alunos, Calendário, Financeiro e Reposição — os `AreaLink`
  já apontam para essas rotas, que ainda não existem e respondem 404
- Botões sem comportamento: "Pagar" e "Vou faltar" são visuais
- `EmptyState` está pronto mas ainda não tem onde ser usado
- Testes

A raiz redireciona para `/professor` com um 307 temporário, configurado em
`next.config.ts`. É temporário de propósito: quando existir autenticação, quem
decide o destino é a sessão do usuário, e um 308 permanente ficaria cravado no
cache dos navegadores.
