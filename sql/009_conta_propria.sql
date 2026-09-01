-- O aluno passa a poder mexer no próprio cadastro.
--
-- Até aqui `perfis` só tinha política de leitura para o dono: `perfil_proprio`
-- é `for select`. Quem editava perfil era só o professor, pela `perfil_professor`
-- (`for all`). Sem uma política de UPDATE para o dono, o "Atualizar cadastro" da
-- barra de topo não teria como gravar nada.
--
-- Mas dar UPDATE ao dono, sozinho, abre uma porta: a linha é legitimamente dele,
-- então nada na RLS impediria um aluno de trocar o próprio `papel` para
-- 'professor' e passar a enxergar o ateliê inteiro. Uma política não resolve
-- isso — `with check` não enxerga o valor antigo para comparar. Por isso o par:
-- a política deixa escrever, e um gatilho recusa mudar o que não é dele mudar.

create policy perfil_proprio_edicao on perfis for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- O que o dono NÃO muda em si mesmo: o papel (viraria promoção), a conta a que
-- o perfil está ligado (viraria roubo de identidade) e o e-mail — que é a chave
-- do login e de quem o professor cadastrou antes, e que trocar aqui deixaria
-- `perfis.email` mentindo sobre o e-mail com que a pessoa entra.
create function regras.protege_perfil() returns trigger
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

  return new;
end $$;

create trigger perfil_protegido before update on perfis
for each row execute function regras.protege_perfil();
