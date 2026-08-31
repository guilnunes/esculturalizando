-- O aluno passa a existir no ateliê antes de existir como login.
--
-- A pedra: `perfis.id` era a própria chave de `auth.users`, então um perfil só
-- nascia junto com uma conta — e criar conta é Admin API do GoTrue, que pede
-- chave secreta e portanto servidor. Com isso o professor não tinha como
-- cadastrar ninguém, e o requisito de CRUD de alunos era impossível.
--
-- Agora `perfis` tem identidade própria e `usuario_id` aponta para a conta,
-- quando houver. Um aluno cadastrado pelo professor nasce sem conta; quando a
-- pessoa se cadastra com o mesmo e-mail, o gatilho reivindica o perfil que já
-- estava lá em vez de criar um segundo. São os dois caminhos de cadastro
-- chegando na mesma linha.

-- ---------------------------------------------------------------- perfis ---

alter table perfis add column usuario_id uuid unique references auth.users (id) on delete set null;
update perfis set usuario_id = id;

alter table perfis drop constraint perfis_id_fkey;
alter table perfis alter column id set default gen_random_uuid();

alter table perfis
  add column email text,
  add column telefone text;

update perfis p set email = lower(u.email) from auth.users u where u.id = p.usuario_id;

-- o e-mail é o que liga o perfil pendente à conta que vier depois, então
-- precisa ser único — senão a reivindicação não sabe qual perfil escolher
create unique index perfil_email_unico on perfis (lower(email)) where email is not null;

-- ------------------------------------------------------------ quem sou eu ---

-- auth.uid() deixou de ser o id do perfil: agora é preciso traduzir. Como toda
-- função daqui, é `security definer` — roda como dona da tabela, então a RLS de
-- perfis não se aplica e não há recursão ao usá-la dentro de uma política.
create function regras.eu() returns uuid
language sql stable security definer set search_path = public, pg_catalog as $$
  select id from perfis where usuario_id = auth.uid();
$$;

create or replace function regras.e_professor() returns boolean
language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from perfis where usuario_id = auth.uid() and papel = 'professor');
$$;

create or replace function meus_creditos() returns integer
language sql stable security definer set search_path = public, pg_catalog as $$
  select regras.creditos_de(regras.eu());
$$;

-- -------------------------------------------------------------- políticas ---
-- Todas as que comparavam com auth.uid() passam a comparar com regras.eu().

drop policy perfil_proprio on perfis;
create policy perfil_proprio on perfis for select to authenticated
  using (usuario_id = auth.uid() or regras.e_professor());

drop policy matricula_propria on matriculas;
create policy matricula_propria on matriculas for select to authenticated
  using (aluno_id = regras.eu() or regras.e_professor());

drop policy falta_propria_leitura on faltas;
create policy falta_propria_leitura on faltas for select to authenticated
  using (aluno_id = regras.eu() or regras.e_professor());
drop policy falta_propria_insercao on faltas;
create policy falta_propria_insercao on faltas for insert to authenticated
  with check (aluno_id = regras.eu());
drop policy falta_propria_remocao on faltas;
create policy falta_propria_remocao on faltas for delete to authenticated
  using (aluno_id = regras.eu());

drop policy reposicao_propria_leitura on reposicoes;
create policy reposicao_propria_leitura on reposicoes for select to authenticated
  using (aluno_id = regras.eu() or regras.e_professor());
drop policy reposicao_propria_insercao on reposicoes;
create policy reposicao_propria_insercao on reposicoes for insert to authenticated
  with check (aluno_id = regras.eu());
drop policy reposicao_propria_remocao on reposicoes;
create policy reposicao_propria_remocao on reposicoes for delete to authenticated
  using (aluno_id = regras.eu());

drop policy mensalidade_propria on mensalidades;
create policy mensalidade_propria on mensalidades for select to authenticated
  using (aluno_id = regras.eu() or regras.e_professor());

drop policy pagamento_leitura on pagamentos;
create policy pagamento_leitura on pagamentos for select to authenticated
  using (
    regras.e_professor()
    or exists (select 1 from mensalidades m where m.id = mensalidade_id and m.aluno_id = regras.eu())
  );
drop policy pagamento_declaracao on pagamentos;
create policy pagamento_declaracao on pagamentos for insert to authenticated
  with check (
    confirmado_em is null
    and exists (select 1 from mensalidades m where m.id = mensalidade_id and m.aluno_id = regras.eu())
  );

drop policy compra_propria_leitura on compras;
create policy compra_propria_leitura on compras for select to authenticated
  using (aluno_id = regras.eu() or regras.e_professor());
drop policy compra_propria_insercao on compras;
create policy compra_propria_insercao on compras for insert to authenticated
  with check (aluno_id = regras.eu() and pago_em is null);

-- ------------------------------------------------- os dois cadastros ---

-- Quem se cadastra sozinho escolhe a turma na tela de cadastro, e ela chega
-- aqui pelo metadado do usuário. O papel nunca vem de lá: quem se cadastra
-- entra como aluno, e ponto. A turma vem, mas o gatilho de vaga continua
-- decidindo se cabe — turma cheia derruba o cadastro inteiro.
create or replace function regras.cria_perfil() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare alvo uuid; t uuid;
begin
  -- perfil que o professor já cadastrou e ainda não tem login: é reivindicado
  select id into alvo from perfis
   where usuario_id is null and lower(email) = lower(new.email);

  if alvo is not null then
    update perfis set
      usuario_id = new.id,
      nome = coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), nome),
      telefone = coalesce(nullif(new.raw_user_meta_data ->> 'telefone', ''), telefone)
    where id = alvo;
  else
    insert into perfis (nome, papel, email, telefone, usuario_id)
    values (
      coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), new.email),
      'aluno',
      lower(new.email),
      nullif(new.raw_user_meta_data ->> 'telefone', ''),
      new.id
    )
    returning id into alvo;
  end if;

  for t in
    select value::uuid
      from jsonb_array_elements_text(coalesce(new.raw_user_meta_data -> 'turmas', '[]'::jsonb)) as value
  loop
    insert into matriculas (aluno_id, turma_id) values (alvo, t)
    on conflict (aluno_id, turma_id) do update set ativa = true;
  end loop;

  return new;
end $$;

-- O professor cadastra pelo app. É RPC, e não INSERT direto, porque um aluno
-- nasce em pelo menos uma turma: perfil e matrícula precisam entrar na mesma
-- transação, senão um aluno sem turma existiria no intervalo entre as duas
-- requisições. Turma cheia derruba o cadastro inteiro, pelo gatilho de vaga.
--
-- É o primeiro RPC público que escreve. Os outros dois só devolvem agregados;
-- este é atomicidade, não conveniência.
create function cadastrar_aluno(nome text, email text, telefone text, turmas uuid[])
returns uuid
language plpgsql security definer set search_path = public, pg_catalog as $$
declare novo uuid; t uuid;
begin
  if not regras.e_professor() then
    raise exception 'Só o professor cadastra aluno.' using errcode = '42501';
  end if;
  if nullif(btrim(nome), '') is null then
    raise exception 'O aluno precisa de nome.' using errcode = '23514';
  end if;
  if turmas is null or array_length(turmas, 1) is null then
    raise exception 'Um aluno nasce em pelo menos uma turma.' using errcode = '23514';
  end if;

  insert into perfis (nome, papel, email, telefone)
  values (btrim(nome), 'aluno', lower(nullif(btrim(email), '')), nullif(btrim(telefone), ''))
  returning id into novo;

  foreach t in array turmas loop
    insert into matriculas (aluno_id, turma_id) values (novo, t);
  end loop;

  return novo;
end $$;

revoke execute on function cadastrar_aluno(text, text, text, uuid[]) from public, anon;
grant execute on function cadastrar_aluno(text, text, text, uuid[]) to authenticated;

create index on perfis (usuario_id);
