-- Row Level Security.
--
-- A chave publicável fica exposta no JavaScript — isso é o desenho, não um
-- descuido. Toda a segurança do app está neste arquivo.
--
-- A regra que organiza tudo: o aluno lê e escreve o que é dele; o professor
-- lê e escreve tudo; ninguém marca a própria mensalidade como paga.

alter table perfis enable row level security;
alter table turmas enable row level security;
alter table matriculas enable row level security;
alter table aulas enable row level security;
alter table faltas enable row level security;
alter table reposicoes enable row level security;
alter table mensalidades enable row level security;
alter table pagamentos enable row level security;
alter table produtos enable row level security;
alter table compras enable row level security;

create policy perfil_proprio on perfis for select to authenticated
  using (id = auth.uid() or regras.e_professor());
create policy perfil_professor on perfis for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());

create policy turma_leitura on turmas for select to authenticated using (true);
create policy turma_professor on turmas for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());

create policy aula_leitura on aulas for select to authenticated using (true);
create policy aula_professor on aulas for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());

create policy produto_leitura on produtos for select to authenticated using (true);
create policy produto_professor on produtos for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());

create policy matricula_propria on matriculas for select to authenticated
  using (aluno_id = auth.uid() or regras.e_professor());
create policy matricula_professor on matriculas for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());

create policy falta_propria_leitura on faltas for select to authenticated
  using (aluno_id = auth.uid() or regras.e_professor());
create policy falta_propria_insercao on faltas for insert to authenticated
  with check (aluno_id = auth.uid());
create policy falta_propria_remocao on faltas for delete to authenticated
  using (aluno_id = auth.uid());
create policy falta_professor on faltas for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());

create policy reposicao_propria_leitura on reposicoes for select to authenticated
  using (aluno_id = auth.uid() or regras.e_professor());
create policy reposicao_propria_insercao on reposicoes for insert to authenticated
  with check (aluno_id = auth.uid());
create policy reposicao_propria_remocao on reposicoes for delete to authenticated
  using (aluno_id = auth.uid());
create policy reposicao_professor on reposicoes for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());

-- o aluno lê as próprias mensalidades e não tem nenhuma política de escrita:
-- quitar a própria dívida não é possível nem com a chave na mão
create policy mensalidade_propria on mensalidades for select to authenticated
  using (aluno_id = auth.uid() or regras.e_professor());
create policy mensalidade_professor on mensalidades for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());

create policy pagamento_leitura on pagamentos for select to authenticated
  using (
    regras.e_professor()
    or exists (select 1 from mensalidades m where m.id = mensalidade_id and m.aluno_id = auth.uid())
  );
-- o `confirmado_em is null` impede o aluno de inserir um pagamento já confirmado
create policy pagamento_declaracao on pagamentos for insert to authenticated
  with check (
    confirmado_em is null
    and exists (select 1 from mensalidades m where m.id = mensalidade_id and m.aluno_id = auth.uid())
  );
create policy pagamento_confirmacao on pagamentos for update to authenticated
  using (regras.e_professor()) with check (regras.e_professor());
create policy pagamento_remocao on pagamentos for delete to authenticated
  using (regras.e_professor());

create policy compra_propria_leitura on compras for select to authenticated
  using (aluno_id = auth.uid() or regras.e_professor());
create policy compra_propria_insercao on compras for insert to authenticated
  with check (aluno_id = auth.uid());
create policy compra_professor on compras for all to authenticated
  using (regras.e_professor()) with check (regras.e_professor());
