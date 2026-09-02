-- O professor cancela uma aula.
--
-- A regra do ateliê é clara: quem tinha aula naquele dia ganha um crédito de
-- reposição, e quem ia repor naquele dia recebe o crédito de volta. A pergunta
-- é como guardar isso.
--
-- O caminho óbvio seria fabricar uma falta para cada aluno da turma e apagar as
-- reposições marcadas. Não é o que se faz aqui, por três motivos: falta é o
-- aluno avisando que não vem, e o ateliê cancelar não é isso; apagar a reposição
-- destrói o registro de que ela existiu; e desfazer o cancelamento viraria uma
-- operação de reparo, com tudo que isso tem de errado dar.
--
-- Em vez disso a aula ganha uma marca, e o crédito passa a ser lido através
-- dela. Nada é criado nem apagado: cancelar e reabrir são a mesma marca indo e
-- voltando, e o saldo de todo mundo acompanha sozinho.

alter table aulas add column cancelada_em timestamptz;

-- Crédito é o que o aluno tem para repor:
--   + faltas que ele avisou
--   + aulas dele que o ateliê cancelou e em que ele ainda não tinha avisado
--     falta (senão a mesma aula lhe daria dois créditos)
--   − reposições marcadas em aulas que aconteceram
create or replace function regras.creditos_de(quem uuid) returns integer
language sql stable security definer set search_path = public, pg_catalog as $$
  select (select count(*) from faltas where aluno_id = quem)
       + (select count(*)
            from aulas a
            join matriculas m on m.turma_id = a.turma_id and m.aluno_id = quem and m.ativa
           where a.cancelada_em is not null
             and not exists (select 1 from faltas f
                              where f.aula_id = a.id and f.aluno_id = quem))
       - (select count(*)
            from reposicoes r join aulas a on a.id = r.aula_id
           where r.aluno_id = quem and a.cancelada_em is null);
$$;

-- Aula cancelada não recebe mais nada: nem aviso de falta (o crédito já está
-- dado), nem reposição (não vai haver aula para repor).
create or replace function regras.checa_falta() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare quando date; turma uuid; fechada timestamptz;
begin
  select a.data, a.turma_id, a.cancelada_em into quando, turma, fechada
    from aulas a where a.id = new.aula_id;
  if quando is null then
    raise exception 'Aula inexistente.' using errcode = '23514';
  end if;
  if fechada is not null then
    raise exception 'Essa aula foi cancelada: o crédito já é seu.' using errcode = '23514';
  end if;
  if quando <= regras.hoje_no_atelie() then
    raise exception 'A falta precisa ser avisada antes da aula.' using errcode = '23514';
  end if;
  -- sem isto, o aluno avisaria falta em turma alheia e fabricaria créditos
  if not exists (
    select 1 from matriculas m
     where m.aluno_id = new.aluno_id and m.turma_id = turma and m.ativa
  ) then
    raise exception 'Você não está matriculado nessa turma.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function regras.checa_vaga_reposicao() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare limite int; usadas int; quando date; fechada date; cancelada timestamptz;
begin
  -- o for update serializa duas marcações simultâneas na mesma aula
  select t.vagas_reposicao, a.data, t.encerrada_em, a.cancelada_em
    into limite, quando, fechada, cancelada
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

-- Quem cancela é o professor, e só aula que ainda não aconteceu. A de hoje
-- conta: é justamente o imprevisto da manhã que faz cancelar a aula da noite.
--
-- Reabrir devolve os créditos que o cancelamento deu, e por isso pode faltar
-- crédito a quem já gastou o seu numa outra reposição. Nesse caso o banco
-- recusa, pela mesma razão que já recusa desfazer uma falta gasta.
create function regras.checa_cancelamento() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare devedor text;
begin
  if new.cancelada_em is not distinct from old.cancelada_em then
    return new;
  end if;
  if not regras.e_professor() then
    raise exception 'Só o ateliê cancela aula.' using errcode = '42501';
  end if;

  if new.cancelada_em is not null and old.cancelada_em is null then
    if new.data < regras.hoje_no_atelie() then
      raise exception 'Essa aula já aconteceu.' using errcode = '23514';
    end if;
    return new;
  end if;

  -- reabrindo: ninguém pode ficar devendo crédito
  select p.nome into devedor
    from matriculas m
    join perfis p on p.id = m.aluno_id
   where m.turma_id = new.turma_id and m.ativa
     and regras.creditos_de(m.aluno_id) < 1
     and not exists (select 1 from faltas f where f.aula_id = new.id and f.aluno_id = m.aluno_id)
   limit 1;
  if devedor is not null then
    raise exception 'Não dá para reabrir: % já usou o crédito deste cancelamento numa reposição.',
      devedor using errcode = '23514';
  end if;
  return new;
end $$;

create trigger aula_cancelamento before update on aulas
  for each row execute function regras.checa_cancelamento();

-- O calendário passa a incluir a aula de hoje — sem ela o professor não teria
-- onde cancelar a aula da noite — e a dizer quais foram canceladas, em vez de
-- escondê-las: aula que some sem explicação é pior do que aula marcada como
-- cancelada. A assinatura muda, então a função sai e volta.
drop function ocupacao_das_aulas();

create function ocupacao_das_aulas()
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
    t.vagas_reposicao::int,
    a.cancelada_em is not null
  from aulas a join turmas t on t.id = a.turma_id
  where a.data >= regras.hoje_no_atelie() and t.encerrada_em is null
  order by a.data;
$$;

revoke execute on function ocupacao_das_aulas() from public, anon;
grant execute on function ocupacao_das_aulas() to authenticated;
