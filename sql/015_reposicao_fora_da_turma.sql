-- Reposição é para repor noutra turma.
--
-- Toda aula da turma do aluno já é aula dele: ele está matriculado, ocupa vaga
-- regular em todas elas. Marcar "reposição" numa delas seria pedir uma vaga de
-- visitante na própria casa — e a vaga de reposição existe para quem vem de
-- fora, repor o que perdeu.

create or replace function regras.checa_vaga_reposicao() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare limite int; usadas int; quando date; fechada date; cancelada timestamptz; turma uuid;
begin
  -- o for update serializa duas marcações simultâneas na mesma aula
  select t.vagas_reposicao, a.data, t.encerrada_em, a.cancelada_em, t.id
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
