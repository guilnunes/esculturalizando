-- Vagas de reposição a mais, num dia só.
--
-- A turma define quantas vagas de reposição cada aula tem. Às vezes um dia
-- comporta mais gente — a peça é pequena, a turma está desfalcada, o professor
-- simplesmente quer abrir espaço — e isso é do dia, não da turma: mudar
-- `turmas.vagas_reposicao` mudaria todas as aulas, inclusive as que já
-- aconteceram.
--
-- Então a aula ganha um extra próprio, e o total é a soma dos dois. Zero é o
-- normal, e a turma continua mandando no resto.

alter table aulas add column vagas_reposicao_extras smallint not null default 0
  check (vagas_reposicao_extras >= 0);

create or replace function regras.checa_vaga_reposicao() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare limite int; usadas int; quando date; fechada date; cancelada timestamptz; turma uuid;
begin
  -- o for update serializa duas marcações simultâneas na mesma aula
  select t.vagas_reposicao + a.vagas_reposicao_extras, a.data, t.encerrada_em, a.cancelada_em, t.id
    into limite, quando, fechada, cancelada, turma
    from aulas a join turmas t on t.id = a.turma_id
   where a.id = new.aula_id for update of a;
  if quando is null then
    raise exception 'Aula inexistente.' using errcode = '23514';
  end if;
  if fechada is not null then
    raise exception 'Essa turma foi encerrada.' using errcode = '23514';
  end if;
  if cancelada is not null then
    raise exception 'Essa aula foi cancelada.' using errcode = '23514';
  end if;
  if quando <= regras.hoje_no_atelie() then
    raise exception 'Só dá para marcar reposição em aula futura.' using errcode = '23514';
  end if;
  -- toda aula da turma dele já é aula dele: a vaga de reposição é para quem vem
  -- de fora repor o que perdeu, não para assistir de novo na própria casa
  if exists (
    select 1 from matriculas m
     where m.aluno_id = new.aluno_id and m.turma_id = turma and m.ativa
  ) then
    raise exception 'Essa aula é da sua turma: a reposição é para repor em outra.'
      using errcode = '23514';
  end if;
  select count(*) into usadas from reposicoes where aula_id = new.aula_id and id <> new.id;
  if usadas >= limite then
    raise exception 'Essa aula não tem mais vaga de reposição.' using errcode = '23514';
  end if;
  if exists (select 1 from faltas where aula_id = new.aula_id and aluno_id = new.aluno_id) then
    raise exception 'Você avisou falta nessa aula.' using errcode = '23514';
  end if;
  if regras.creditos_de(new.aluno_id) < 1 then
    raise exception 'Sem crédito de reposição disponível.' using errcode = '23514';
  end if;
  return new;
end $$;

-- Quem abre vaga é o professor, e só em aula que ainda vai acontecer e não foi
-- cancelada. Tirar vaga abaixo do que já foi marcado é recusado: o aluno que
-- marcou contava com ela, e o crédito dele já está gasto.
create function regras.checa_vagas_extras() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare base int; marcadas int;
begin
  if new.vagas_reposicao_extras is not distinct from old.vagas_reposicao_extras then
    return new;
  end if;
  if not regras.e_professor() then
    raise exception 'Só o ateliê abre vaga de reposição.' using errcode = '42501';
  end if;
  if new.data < regras.hoje_no_atelie() then
    raise exception 'Essa aula já aconteceu.' using errcode = '23514';
  end if;
  if new.cancelada_em is not null then
    raise exception 'Essa aula foi cancelada.' using errcode = '23514';
  end if;

  select vagas_reposicao into base from turmas where id = new.turma_id;
  select count(*) into marcadas from reposicoes where aula_id = new.id;
  if base + new.vagas_reposicao_extras < marcadas then
    raise exception 'Essa aula já tem % reposição(ões) marcada(s): não dá para deixar % vaga(s).',
      marcadas, base + new.vagas_reposicao_extras using errcode = '23514';
  end if;
  return new;
end $$;

create trigger aula_vagas before update on aulas
  for each row execute function regras.checa_vagas_extras();

-- O calendário passa a contar a soma.
create or replace function ocupacao_das_aulas()
returns table (
  aula_id uuid, turma_id uuid, data date,
  regulares_ocupadas int, regulares_total int,
  reposicoes_ocupadas int, reposicoes_total int,
  cancelada boolean
)
language sql stable security definer set search_path = public, pg_catalog as $$
  select a.id, t.id, a.data,
    (select count(*)::int from matriculas m where m.turma_id = t.id and m.ativa),
    t.vagas_regulares::int,
    (select count(*)::int from reposicoes r where r.aula_id = a.id),
    (t.vagas_reposicao + a.vagas_reposicao_extras)::int,
    a.cancelada_em is not null
  from aulas a join turmas t on t.id = a.turma_id
  where a.data >= regras.hoje_no_atelie() and t.encerrada_em is null
  order by a.data;
$$;
