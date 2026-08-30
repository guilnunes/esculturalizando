-- Os dois únicos RPCs públicos.
--
-- Existem porque a RLS, corretamente, esconde as linhas dos outros alunos —
-- e com isso esconde também a contagem de ocupação de uma aula. Estas funções
-- devolvem números agregados, nunca identidades.

create function ocupacao_das_aulas()
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
  where a.data > regras.hoje_no_atelie()
  order by a.data;
$$;

create function meus_creditos() returns integer
language sql stable security definer set search_path = public, pg_catalog as $$
  select regras.creditos_de(auth.uid());
$$;

revoke execute on function ocupacao_das_aulas() from public, anon;
revoke execute on function meus_creditos() from public, anon;
grant execute on function ocupacao_das_aulas() to authenticated;
grant execute on function meus_creditos() to authenticated;
