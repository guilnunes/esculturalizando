-- A venda ganha dívida e quitação, como a mensalidade já tinha.
--
-- Antes, uma compra nascia e morria no mesmo instante: registrava quem levou
-- o quê, e nunca estava devendo nem quitada. Sem situação de pagamento não há
-- atraso de produto no painel do professor, nem dívida de material na home do
-- aluno, nem venda "aguardando pagamento" para o professor baixar depois.
--
-- Sem gateway, quem confirma o recebimento é o professor, e ele diz por onde o
-- dinheiro entrou. Por isso `forma_pagamento` nasce nula e só existe junto com
-- `pago_em`: as duas contam a mesma coisa, e o check não deixa uma sem a outra.

create type forma_pagamento as enum ('pix', 'dinheiro', 'debito', 'credito', 'boleto');

alter table compras
  add column vencimento date not null default regras.hoje_no_atelie(),
  add column pago_em timestamptz,
  add column forma_pagamento forma_pagamento,
  add constraint compra_paga_tem_forma
    check ((pago_em is null) = (forma_pagamento is null));

-- O aluno insere a própria compra, então poderia inserir uma já paga e quitar
-- a dívida antes de ela existir. O mesmo truque de `pagamento_declaracao`
-- resolve: a política de INSERT recusa a linha que já nasce paga. Quitar segue
-- sendo só do professor, que é quem tem política de UPDATE aqui.
drop policy compra_propria_insercao on compras;

create policy compra_propria_insercao on compras for insert to authenticated
  with check (aluno_id = auth.uid() and pago_em is null);

create index on compras (produto_id);
