-- Os dois caminhos de cadastro passam a carregar o dia de cobrança.
--
-- Quem se cadastra sozinho escolhe o dia na tela de entrada, e ele viaja como
-- metadado do usuário até o gatilho. Quem é cadastrado pelo professor recebe o
-- dia (e o desconto, se houver) direto no RPC. Desconto não vem do formulário
-- de quem se cadastra: ninguém se dá abatimento.

create or replace function regras.cria_perfil() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare alvo uuid; t uuid; dia int;
begin
  dia := least(greatest(coalesce(
    nullif(new.raw_user_meta_data ->> 'dia_cobranca', '')::int, 10), 1), 31);

  -- perfil que o professor já cadastrou e ainda não tem login: é reivindicado
  select id into alvo from perfis
   where usuario_id is null and lower(email) = lower(new.email);

  if alvo is not null then
    -- o dia que o professor já tinha combinado com ele manda; o do formulário
    -- só entra se lá ainda estiver o padrão
    update perfis set
      usuario_id = new.id,
      nome = coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), nome),
      telefone = coalesce(nullif(new.raw_user_meta_data ->> 'telefone', ''), telefone),
      dia_cobranca = case when dia_cobranca = 10 then dia else dia_cobranca end
    where id = alvo;
  else
    insert into perfis (nome, papel, email, telefone, usuario_id, dia_cobranca)
    values (
      coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), new.email),
      'aluno',
      lower(new.email),
      nullif(new.raw_user_meta_data ->> 'telefone', ''),
      new.id,
      dia
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

-- A assinatura muda, então a antiga sai: o PostgREST escolhe a função pelos
-- nomes dos parâmetros que chegam no corpo, e duas candidatas dariam ambiguidade.
drop function cadastrar_aluno(text, text, text, uuid[]);

create function cadastrar_aluno(
  nome text, email text, telefone text, turmas uuid[],
  dia_cobranca int default 10, desconto_percentual int default 0)
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

  insert into perfis (nome, papel, email, telefone, dia_cobranca, desconto_percentual)
  values (btrim(nome), 'aluno', lower(nullif(btrim(email), '')), nullif(btrim(telefone), ''),
          least(greatest(coalesce(dia_cobranca, 10), 1), 31),
          least(greatest(coalesce(desconto_percentual, 0), 0), 100))
  returning id into novo;

  foreach t in array turmas loop
    insert into matriculas (aluno_id, turma_id) values (novo, t);
  end loop;

  return novo;
end $$;

revoke execute on function cadastrar_aluno(text, text, text, uuid[], int, int) from public, anon;
grant execute on function cadastrar_aluno(text, text, text, uuid[], int, int) to authenticated;
