-- Dados de exemplo: três turmas, dezoito alunos, um professor.
--
-- As contas são criadas direto em auth.users porque não há CLI aqui. A senha
-- é a mesma para todo mundo e está no README: isto é um ateliê de mentira.
--
-- O papel de professor é atribuído por UPDATE depois da criação, nunca pelo
-- metadado do usuário — o gatilho cria todo mundo como aluno de propósito.

do $$
declare
  senha text := 'demo1234';
  t_seg uuid; t_ter uuid; t_qui uuid;
  r record; novo uuid; alvo uuid; quando date; i int; d int; prof uuid;
begin
  insert into turmas (nome, dia_semana, horario, vagas_regulares, vagas_reposicao, mensalidade_centavos)
  values ('Modelagem — segunda', 1, '19h00 às 21h00', 8, 2, 38000) returning id into t_seg;
  insert into turmas (nome, dia_semana, horario, vagas_regulares, vagas_reposicao, mensalidade_centavos)
  values ('Modelagem — terça', 2, '14h00 às 16h00', 8, 2, 38000) returning id into t_ter;
  insert into turmas (nome, dia_semana, horario, vagas_regulares, vagas_reposicao, mensalidade_centavos)
  values ('Torno — quinta', 4, '19h00 às 21h00', 6, 2, 42000) returning id into t_qui;

  insert into produtos (nome, preco_centavos, estoque) values
    ('Argila branca, 10 kg', 6800, 12),
    ('Esmalte transparente, 500 ml', 9250, 4),
    ('Kit de estecas', 14500, 0),
    ('Óxido de ferro, 250 g', 3990, 7),
    ('Queima avulsa', 5500, 20);

  for r in
    select * from (values
      ('Professor',        'professor@atelie.test', null),
      ('Marina Bastos',    'marina@atelie.test',    'ter'),
      ('Rafael Aguiar',    'rafael@atelie.test',    'ter'),
      ('Heloísa Prado',    'heloisa@atelie.test',   'ter'),
      ('Camila Reis',      'camila@atelie.test',    'ter'),
      ('Sérgio Vasques',   'sergio@atelie.test',    'ter'),
      ('Bruna Antunes',    'bruna@atelie.test',     'ter'),
      ('Otávio Lins',      'otavio@atelie.test',    'ter'),
      ('Dandara Nogueira', 'dandara@atelie.test',   'ter'),
      ('Neusa Camargo',    'neusa@atelie.test',     'seg'),
      ('Tiago Meireles',   'tiago@atelie.test',     'seg'),
      ('Lúcia Fontes',     'lucia@atelie.test',     'seg'),
      ('Ivo Bertoldo',     'ivo@atelie.test',       'seg'),
      ('Selma Prates',     'selma@atelie.test',     'seg'),
      ('Hélio Munhoz',     'helio@atelie.test',     'seg'),
      ('Aparecida Rangel', 'aparecida@atelie.test', 'qui'),
      ('Joel Cardim',      'joel@atelie.test',      'qui'),
      ('Vitória Sampaio',  'vitoria@atelie.test',   'qui'),
      ('Nelson Prado',     'nelson@atelie.test',    'qui')
    ) as v(nome, email, turma)
  loop
    novo := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', novo, 'authenticated', 'authenticated',
      r.email, extensions.crypt(senha, extensions.gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', r.nome), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), novo, novo::text,
      jsonb_build_object('sub', novo::text, 'email', r.email), 'email',
      now(), now(), now()
    );

    if r.turma is null then
      prof := novo;
    else
      alvo := case r.turma when 'seg' then t_seg when 'ter' then t_ter else t_qui end;
      insert into matriculas (aluno_id, turma_id) values (novo, alvo);
    end if;
  end loop;

  update perfis set papel = 'professor' where id = prof;

  -- doze semanas de aula à frente, a partir de hoje
  for r in select id, dia_semana from turmas loop
    d := r.dia_semana;
    quando := regras.hoje_no_atelie() + 1;
    while extract(dow from quando)::int <> d loop
      quando := quando + 1;
    end loop;
    for i in 0..11 loop
      insert into aulas (turma_id, data) values (r.id, quando + (i * 7));
    end loop;
  end loop;

  insert into mensalidades (aluno_id, competencia, valor_centavos, vencimento)
  select m.aluno_id, c.comp, t.mensalidade_centavos, c.comp + 9
    from matriculas m
    join turmas t on t.id = m.turma_id
   cross join (values
      (date_trunc('month', regras.hoje_no_atelie())::date),
      ((date_trunc('month', regras.hoje_no_atelie()) + interval '1 month')::date)
   ) as c(comp);

  -- três em atraso de propósito, para as telas terem o que mostrar
  update mensalidades set pago_em = now()
   where competencia = date_trunc('month', regras.hoje_no_atelie())::date
     and aluno_id not in (
       select id from perfis
        where nome in ('Marina Bastos', 'Tiago Meireles', 'Dandara Nogueira')
     );
end $$;
