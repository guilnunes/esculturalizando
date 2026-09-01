-- A mensalidade passa a nascer sozinha, todo mês.
--
-- Até aqui só existiam os dois meses da carga inicial, e nada os renovava. Com
-- turma permanente isso é um defeito com data marcada: em novembro ninguém teria
-- mais mensalidade lançada e o painel financeiro esvaziaria sozinho.
--
-- Quatro regras do ateliê entram aqui:
--
-- 1. O valor é a soma das turmas em que o aluno está, menos o desconto que o
--    professor tenha concedido a ele. Somar importa: o app deixa matricular em
--    mais de uma turma, e `mensalidades` tem uma linha por aluno e mês.
--
-- 2. O dia de vencimento é de cada aluno — ele escolhe ao se cadastrar, o
--    professor edita depois. Quem escolheu 31 vence no último dia de fevereiro.
--
-- 3. Quem entra no meio do mês paga proporcional aos dias que restam, contando
--    o dia da entrada. E essa primeira cobrança nunca vence antes de ele entrar:
--    se o dia que ele escolheu já passou naquele mês, ela vai para o mês
--    seguinte e cai junto com a primeira mensalidade cheia.
--
-- 4. Mensalidade lançada não se mexe mais. Nem quando o aluno entra numa segunda
--    turma, nem quando ganha desconto, nem quando sai: o que já foi cobrado é o
--    que foi cobrado, e mudança vale do mês seguinte em diante. O painel
--    financeiro não apaga nem reescreve nada.

alter table perfis
  add column dia_cobranca smallint not null default 10
    check (dia_cobranca between 1 and 31),
  add column desconto_percentual smallint not null default 0
    check (desconto_percentual between 0 and 100);

-- sem saber quando a matrícula começou não há como saber que mês é proporcional
alter table matriculas add column criada_em timestamptz not null default now();

-- O dono do perfil não mexe no próprio desconto (seria dar-se abatimento) nem
-- no dia de cobrança, que ele escolhe uma vez, ao se cadastrar.
create or replace function regras.protege_perfil() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if regras.e_professor() then return new; end if;

  if new.papel is distinct from old.papel then
    raise exception 'O papel não se muda por conta própria.' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.usuario_id is distinct from old.usuario_id then
    raise exception 'A conta de um perfil não se troca por aqui.' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'O e-mail é o do login: troque na conta, não no cadastro.' using errcode = '42501';
  end if;
  if new.desconto_percentual is distinct from old.desconto_percentual then
    raise exception 'Desconto quem concede é o ateliê.' using errcode = '42501';
  end if;
  if new.dia_cobranca is distinct from old.dia_cobranca then
    raise exception 'O dia de cobrança se acerta com o ateliê.' using errcode = '42501';
  end if;

  return new;
end $$;

-- Quanto esse aluno paga por mês cheio, hoje.
create function regras.mensalidade_de(quem uuid) returns integer
language sql stable security definer set search_path = public, pg_catalog as $$
  select round(
    coalesce((
      select sum(t.mensalidade_centavos)
        from matriculas m join turmas t on t.id = m.turma_id
       where m.aluno_id = quem and m.ativa
    ), 0)
    * (100 - coalesce((select desconto_percentual from perfis where id = quem), 0)) / 100.0
  )::int;
$$;

-- O dia que ele escolheu, encolhido para caber no mês.
create function regras.vencimento_de(quem uuid, comp date) returns date
language sql stable security definer set search_path = public, pg_catalog as $$
  select date_trunc('month', comp)::date + (least(
    coalesce((select dia_cobranca from perfis where id = quem), 10),
    extract(day from (date_trunc('month', comp) + interval '1 month - 1 day'))::int
  ) - 1);
$$;

-- Lança o mês para todo aluno matriculado que ainda não tem essa competência.
-- Idempotente de propósito: roda no primeiro do mês pelo pg_cron, e de novo a
-- cada matrícula nova, sem nunca duplicar nem reescrever o que já existe.
create function regras.lanca_mensalidades(comp date) returns integer
language plpgsql security definer set search_path = public, pg_catalog as $$
declare mes date; dias int; a record; cheio int; entrou date; devidos int;
        vence date; criadas int := 0;
begin
  mes := date_trunc('month', comp)::date;
  dias := extract(day from (mes + interval '1 month - 1 day'))::int;

  for a in
    select m.aluno_id as id, min(m.criada_em) as primeira
      from matriculas m
     where m.ativa
     group by m.aluno_id
  loop
    if exists (select 1 from mensalidades x where x.aluno_id = a.id and x.competencia = mes) then
      continue;
    end if;

    cheio := regras.mensalidade_de(a.id);
    entrou := (a.primeira at time zone 'America/Sao_Paulo')::date;
    vence := regras.vencimento_de(a.id, mes);

    -- só o mês em que ele entrou é quebrado, e só se não entrou no dia 1
    if date_trunc('month', entrou)::date = mes and extract(day from entrou)::int > 1 then
      devidos := dias - extract(day from entrou)::int + 1;
      cheio := round(cheio::numeric * devidos / dias)::int;
      -- quem entra dia 21 tendo escolhido o dia 5 não deve nascer em atraso
      if vence < entrou then
        vence := regras.vencimento_de(a.id, (mes + interval '1 month')::date);
      end if;
    end if;

    insert into mensalidades (aluno_id, competencia, valor_centavos, vencimento)
    values (a.id, mes, cheio, vence);
    criadas := criadas + 1;
  end loop;

  return criadas;
end $$;

-- Aluno cadastrado hoje não espera o mês virar para dever o proporcional.
--
-- É gatilho de restrição adiado, e isso não é capricho: `cadastrar_aluno` insere
-- as matrículas em laço, e um gatilho comum dispararia depois da primeira, com o
-- aluno ainda numa turma só — a mensalidade nasceria cobrando metade das turmas
-- dele. Adiado, roda no commit, quando todas já estão lá. Voltar de uma matrícula
-- desligada também lança o mês, mas cheio: o proporcional é de quem chega.
create function regras.matricula_lanca_mes() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if new.ativa then
    perform regras.lanca_mensalidades(regras.hoje_no_atelie());
  end if;
  return null;
end $$;

create constraint trigger matricula_cobra_o_mes
  after insert or update on matriculas
  deferrable initially deferred
  for each row execute function regras.matricula_lanca_mes();

-- Todo dia 1, às 3h de São Paulo. É idempotente, então um dia perdido se
-- resolve sozinho na próxima chamada — inclusive a de uma matrícula nova.
select cron.schedule('mensalidade-do-mes', '0 6 1 * *',
                     $$ select regras.lanca_mensalidades(regras.hoje_no_atelie()); $$);
