-- Tabelas e índices.
-- Dinheiro é sempre inteiro em centavos: float não serve para cobrança.

create type papel_usuario as enum ('professor', 'aluno');

create table perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel papel_usuario not null default 'aluno',
  criado_em timestamptz not null default now()
);

create table turmas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  horario text not null,
  vagas_regulares smallint not null check (vagas_regulares > 0),
  vagas_reposicao smallint not null check (vagas_reposicao >= 0),
  mensalidade_centavos integer not null check (mensalidade_centavos >= 0)
);

create table matriculas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references perfis (id) on delete cascade,
  turma_id uuid not null references turmas (id) on delete cascade,
  ativa boolean not null default true,
  unique (aluno_id, turma_id)
);

create table aulas (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references turmas (id) on delete cascade,
  data date not null,
  unique (turma_id, data)
);

create table faltas (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references aulas (id) on delete cascade,
  aluno_id uuid not null references perfis (id) on delete cascade,
  avisada_em timestamptz not null default now(),
  unique (aula_id, aluno_id)
);

create table reposicoes (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references aulas (id) on delete cascade,
  aluno_id uuid not null references perfis (id) on delete cascade,
  marcada_em timestamptz not null default now(),
  unique (aula_id, aluno_id)
);

create table mensalidades (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references perfis (id) on delete cascade,
  competencia date not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  vencimento date not null,
  pago_em timestamptz,
  unique (aluno_id, competencia)
);

-- O aluno declara que pagou; só o professor confirma. Sem essa separação,
-- quitar a própria dívida seria uma escrita que a RLS não teria como negar.
create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  mensalidade_id uuid not null unique references mensalidades (id) on delete cascade,
  declarado_em timestamptz not null default now(),
  confirmado_em timestamptz
);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  preco_centavos integer not null check (preco_centavos >= 0),
  estoque integer not null check (estoque >= 0)
);

-- valor_centavos é not null de propósito: o gatilho preenche a partir do
-- catálogo, e o not null garante que uma falha vire erro em vez de compra grátis.
create table compras (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references perfis (id) on delete cascade,
  produto_id uuid not null references produtos (id) on delete restrict,
  quantidade smallint not null check (quantidade > 0),
  valor_centavos integer not null,
  criada_em timestamptz not null default now()
);

create index on matriculas (turma_id);
create index on matriculas (aluno_id);
create index on aulas (turma_id, data);
create index on faltas (aluno_id);
create index on reposicoes (aluno_id);
create index on mensalidades (aluno_id);
create index on compras (aluno_id);
