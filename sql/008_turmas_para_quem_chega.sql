-- Quem vai se cadastrar precisa escolher a turma antes de ter conta, e a
-- política de `turmas` é `to authenticated`: sem isso a tela de cadastro
-- mostraria uma lista vazia.
--
-- A view resolve sem abrir a tabela: ela roda como dona (não é
-- `security_invoker`), então passa por cima da RLS, mas só entrega as colunas
-- que alguém de fora tem motivo para ver. O preço da mensalidade não é uma
-- delas — quanto custa se conversa com o ateliê, não se lê da rua.

create view turmas_abertas as
  select t.id, t.nome, t.dia_semana, t.horario,
         greatest(t.vagas_regulares - (
           select count(*) from matriculas m where m.turma_id = t.id and m.ativa
         ), 0)::int as vagas_livres
    from turmas t;

grant select on turmas_abertas to anon, authenticated;
