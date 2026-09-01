-- Turma não tem duração: o aluno pratica pelos anos que quiser, e a turma só
-- acaba quando o professor a encerra.
--
-- A carga inicial abria doze semanas de aula e parou por aí, e o gatilho que
-- escrevi para a turma nova copiou a conta como se doze semanas fossem a vida
-- dela. Não são: são só o quanto se enxerga à frente. Do jeito que estava, toda
-- turma tinha uma data para morrer em silêncio — o calendário esvaziaria, a
-- próxima aula sumiria da tela do aluno, e não haveria mais o que faltar nem o
-- que repor. Nenhum erro, nenhum aviso: a tela simplesmente ficaria vazia.
--
-- O conserto é a janela andar. `abre_aulas` já preenche de amanhã até doze
-- semanas à frente pulando o que existe (`on conflict do nothing`), então
-- chamá-la de novo a cada dia empurra o horizonte um dia. Falta quem chame:
-- é o pg_cron, todo dia de madrugada.

create function regras.abre_aulas_de_todas() returns void
language plpgsql security definer set search_path = public, pg_catalog as $$
declare t record;
begin
  for t in select id from turmas where encerrada_em is null loop
    perform regras.abre_aulas(t.id);
  end loop;
end $$;

create extension if not exists pg_cron;

-- 06:00 UTC é 03:00 em São Paulo: ninguém no ateliê, e a data já virou dos dois
-- lados do fuso, então a aula do dia nunca é aberta com um dia de atraso.
select cron.schedule('aulas-sempre-a-frente', '0 6 * * *',
                     $$ select regras.abre_aulas_de_todas(); $$);
