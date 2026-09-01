-- O CRUD de turmas do professor.
--
-- Três decisões que o app sozinho não teria como garantir:
--
-- 1. Turma não se apaga depois que alguém entrou nela. Matrícula é histórico —
--    o app nunca apaga uma, só desliga (`ativa = false`) —, então a FK vira
--    `restrict` e o caminho passa a ser encerrar, não excluir. Só uma turma em
--    que ninguém nunca entrou, criada por engano, ainda pode sumir.
--
-- 2. Encerrar não apaga nada. A turma sai do calendário e das listas e as
--    matrículas se desligam; aulas passadas, faltas e reposições ficam onde
--    estão. O crédito que um aluno de outra turma gastou marcando reposição
--    aqui é dele, não desta turma, e encerrar não pode tomá-lo de volta.
--
-- 3. Turma nasce com as aulas dela. Sem aula ela não aparece no calendário e
--    ninguém consegue faltar nem repor — ficaria de pé e inútil. O gatilho
--    abre doze semanas à frente, a mesma conta que a carga inicial fazia à mão.

alter table turmas add column encerrada_em date;

-- era `cascade`: apagar a turma levava junto matrícula, aula, falta e reposição
alter table matriculas drop constraint matriculas_turma_id_fkey;
alter table matriculas add constraint matriculas_turma_id_fkey
  foreign key (turma_id) references turmas (id) on delete restrict;

create function regras.abre_aulas(turma uuid) returns void
language plpgsql security definer set search_path = public, pg_catalog as $$
declare dia int; quando date;
begin
  select dia_semana into dia from turmas where id = turma;
  if dia is null then return; end if;

  -- a primeira aula é a próxima vez que esse dia da semana cai
  quando := regras.hoje_no_atelie() + 1;
  while extract(dow from quando)::int <> dia loop
    quando := quando + 1;
  end loop;

  for i in 0..11 loop
    insert into aulas (turma_id, data) values (turma, quando + (i * 7))
      on conflict (turma_id, data) do nothing;
  end loop;
end $$;

create function regras.turma_nasce() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  perform regras.abre_aulas(new.id);
  return null;
end $$;

create trigger turma_abre_aulas after insert on turmas
  for each row execute function regras.turma_nasce();

create function regras.checa_turma() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare matriculados int; marcadas int;
begin
  select count(*) into matriculados from matriculas
   where turma_id = new.id and ativa;
  if new.vagas_regulares < matriculados then
    raise exception 'A turma tem % aluno(s) matriculado(s): não dá para deixar % vaga(s).',
      matriculados, new.vagas_regulares using errcode = '23514';
  end if;

  -- a aula mais cheia de reposição manda no mínimo que sobra
  select coalesce(max(quantas), 0) into marcadas from (
    select count(*) as quantas from reposicoes r
      join aulas a on a.id = r.aula_id
     where a.turma_id = new.id and a.data > regras.hoje_no_atelie()
     group by r.aula_id
  ) por_aula;
  if new.vagas_reposicao < marcadas then
    raise exception 'Há aula com % reposição(ões) marcada(s): não dá para deixar % vaga(s).',
      marcadas, new.vagas_reposicao using errcode = '23514';
  end if;

  -- mudar o dia refaz as aulas futuras, e o que estivesse marcado nelas iria junto
  if new.dia_semana is distinct from old.dia_semana and exists (
    select 1 from aulas a
     where a.turma_id = new.id and a.data > regras.hoje_no_atelie()
       and (exists (select 1 from faltas f where f.aula_id = a.id)
         or exists (select 1 from reposicoes r where r.aula_id = a.id))
  ) then
    raise exception 'Já há falta avisada ou reposição marcada nas próximas aulas: desmarque antes de mudar o dia.'
      using errcode = '23514';
  end if;

  if new.encerrada_em is not null and old.encerrada_em is null then
    update matriculas set ativa = false where turma_id = new.id and ativa;
  end if;

  return new;
end $$;

create trigger turma_checa before update on turmas
  for each row execute function regras.checa_turma();

-- Mudar o dia e reabrir têm o mesmo efeito: as aulas à frente são refeitas a
-- partir do dia que a turma tem agora. Rodam depois do update porque leem
-- `turmas`, e antes dele a linha ainda é a antiga.
create function regras.turma_remarca() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if new.dia_semana is distinct from old.dia_semana then
    delete from aulas where turma_id = new.id and data > regras.hoje_no_atelie();
  end if;
  perform regras.abre_aulas(new.id);
  return null;
end $$;

create trigger turma_remarca_aulas after update on turmas
  for each row
  when (new.encerrada_em is null
        and (old.dia_semana is distinct from new.dia_semana
             or old.encerrada_em is not null))
  execute function regras.turma_remarca();

-- Turma encerrada some do calendário sem que nada seja apagado.
create or replace function ocupacao_das_aulas()
returns table (
  aula_id uuid, turma_id uuid, data date,
  regulares_ocupadas int, regulares_total int,
  reposicoes_ocupadas int, reposicoes_total int
)
language sql stable security definer set search_path = public, pg_catalog as $$
  select a.id, t.id, a.data,
    (select count(*)::int from matriculas m where m.turma_id = t.id and m.ativa),
    t.vagas_regulares::int,
    (select count(*)::int from reposicoes r where r.aula_id = a.id),
    t.vagas_reposicao::int
  from aulas a join turmas t on t.id = a.turma_id
  where a.data > regras.hoje_no_atelie() and t.encerrada_em is null
  order by a.data;
$$;

-- E some da lista de quem está se cadastrando.
create or replace view turmas_abertas as
  select t.id, t.nome, t.dia_semana, t.horario,
         greatest(t.vagas_regulares - (
           select count(*) from matriculas m where m.turma_id = t.id and m.ativa
         ), 0)::int as vagas_livres
    from turmas t
   where t.encerrada_em is null;

-- E não recebe mais ninguém, nem matriculado nem repositor.
create or replace function regras.checa_vaga_regular() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare limite int; usadas int; fechada date;
begin
  if not new.ativa then return new; end if;
  select vagas_regulares, encerrada_em into limite, fechada
    from turmas where id = new.turma_id for update;
  if limite is null then
    raise exception 'Turma inexistente.' using errcode = '23514';
  end if;
  if fechada is not null then
    raise exception 'Essa turma foi encerrada.' using errcode = '23514';
  end if;
  select count(*) into usadas from matriculas
   where turma_id = new.turma_id and ativa and id <> new.id;
  if usadas >= limite then
    raise exception 'A turma está com as vagas regulares esgotadas.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function regras.checa_vaga_reposicao() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare limite int; usadas int; quando date; fechada date;
begin
  -- o for update serializa duas marcações simultâneas na mesma aula
  select t.vagas_reposicao, a.data, t.encerrada_em into limite, quando, fechada
    from aulas a join turmas t on t.id = a.turma_id
   where a.id = new.aula_id for update of a;
  if quando is null then
    raise exception 'Aula inexistente.' using errcode = '23514';
  end if;
  if fechada is not null then
    raise exception 'Essa turma foi encerrada.' using errcode = '23514';
  end if;
  if quando <= regras.hoje_no_atelie() then
    raise exception 'Só dá para marcar reposição em aula futura.' using errcode = '23514';
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
