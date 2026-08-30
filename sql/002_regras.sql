-- As regras do ateliê, no banco.
--
-- Duas decisões que parecem detalhe e não são:
--
-- 1. Tudo vive no schema `regras`, não em `public`. O PostgREST publica
--    `public` inteiro como RPC em /rest/v1/rpc/, e nada disso é para ser
--    chamado de fora.
--
-- 2. Todas são `security definer`. Sob a RLS de um aluno, `select ... for
--    update` em produtos e aulas volta vazio (o aluno não tem política de
--    UPDATE nessas tabelas), e a contagem de reposições enxergaria só as
--    linhas dele. O efeito seria desligar em silêncio o limite de vagas e a
--    baixa de estoque — o gatilho rodaria, não acusaria nada, e não faria nada.

create schema regras;
grant usage on schema regras to authenticated, service_role;

create function regras.hoje_no_atelie() returns date
language sql stable set search_path = pg_catalog as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create function regras.e_professor() returns boolean
language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from perfis where id = auth.uid() and papel = 'professor');
$$;

create function regras.creditos_de(quem uuid) returns integer
language sql stable security definer set search_path = public, pg_catalog as $$
  select (select count(*) from faltas where aluno_id = quem)
       - (select count(*) from reposicoes where aluno_id = quem);
$$;

create function regras.checa_vaga_regular() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare limite int; usadas int;
begin
  if not new.ativa then return new; end if;
  select vagas_regulares into limite from turmas where id = new.turma_id for update;
  if limite is null then
    raise exception 'Turma inexistente.' using errcode = '23514';
  end if;
  select count(*) into usadas from matriculas
   where turma_id = new.turma_id and ativa and id <> new.id;
  if usadas >= limite then
    raise exception 'A turma está com as vagas regulares esgotadas.' using errcode = '23514';
  end if;
  return new;
end $$;

create function regras.checa_vaga_reposicao() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare limite int; usadas int; quando date;
begin
  -- o for update serializa duas marcações simultâneas na mesma aula
  select t.vagas_reposicao, a.data into limite, quando
    from aulas a join turmas t on t.id = a.turma_id
   where a.id = new.aula_id for update of a;
  if quando is null then
    raise exception 'Aula inexistente.' using errcode = '23514';
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

create function regras.checa_falta() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare quando date; turma uuid;
begin
  select a.data, a.turma_id into quando, turma from aulas a where a.id = new.aula_id;
  if quando is null then
    raise exception 'Aula inexistente.' using errcode = '23514';
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

create function regras.checa_falta_removida() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if regras.creditos_de(old.aluno_id) < 1 then
    raise exception 'O crédito dessa falta já foi usado numa reposição.' using errcode = '23514';
  end if;
  return old;
end $$;

create function regras.baixa_estoque() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare preco int; disponivel int;
begin
  select preco_centavos, estoque into preco, disponivel
    from produtos where id = new.produto_id for update;
  if preco is null then
    raise exception 'Produto inexistente.' using errcode = '23514';
  end if;
  if disponivel < new.quantidade then
    raise exception 'Estoque insuficiente.' using errcode = '23514';
  end if;
  update produtos set estoque = estoque - new.quantidade where id = new.produto_id;
  -- o preço vem do catálogo, nunca do cliente
  new.valor_centavos := preco * new.quantidade;
  return new;
end $$;

create function regras.confirma_mensalidade() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if new.confirmado_em is not null and old.confirmado_em is null then
    update mensalidades set pago_em = new.confirmado_em where id = new.mensalidade_id;
  elsif new.confirmado_em is null and old.confirmado_em is not null then
    update mensalidades set pago_em = null where id = new.mensalidade_id;
  end if;
  return new;
end $$;

create function regras.cria_perfil() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- o papel nunca vem do metadado do usuário: quem se cadastra entra como aluno
  insert into perfis (id, nome, papel)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email), 'aluno');
  return new;
end $$;

create trigger vaga_regular before insert or update on matriculas
for each row execute function regras.checa_vaga_regular();
create trigger vaga_reposicao before insert on reposicoes
for each row execute function regras.checa_vaga_reposicao();
create trigger falta_antecipada before insert on faltas
for each row execute function regras.checa_falta();
create trigger falta_com_credito_gasto before delete on faltas
for each row execute function regras.checa_falta_removida();
create trigger compra_baixa_estoque before insert on compras
for each row execute function regras.baixa_estoque();
create trigger pagamento_confirmado after update on pagamentos
for each row execute function regras.confirma_mensalidade();
create trigger perfil_para_novo_usuario after insert on auth.users
for each row execute function regras.cria_perfil();
