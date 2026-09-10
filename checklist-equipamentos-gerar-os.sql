-- ============================================================
-- Checklist Equipamentos — "Gerar OS automática" por item
-- Rode isto no SQL Editor do Supabase do projeto principal
-- (frzvcrcshkpvjdbbqkhz) -- idempotente, pode rodar mais de uma vez.
-- ============================================================

-- 1. Novo campo no cadastro de itens do modelo de checklist: quando
--    marcado, todo item marcado NOK num checklist gera automaticamente
--    uma solicitação de manutenção corretiva (a mesma tabela usada
--    pela aba "Manutenção Corretiva").
alter table checklist_itens_modelo
  add column if not exists gerar_os boolean not null default false;

-- 2. Parâmetros fixos por unidade pra essa OS automática. A tabela
--    estoque_requisicoes_rapidas exige almoxarifado_id, setor_id e
--    evento em toda solicitação (mesma regra de rateio do Financeiro)
--    -- como o checklist é preenchido pelo motorista/responsável, sem
--    ele escolher nada disso, esses valores ficam pré-configurados
--    aqui pelo administrador (um registro por unidade).
create table if not exists checklist_parametros_os (
  id bigint generated always as identity primary key,
  unidade_negocio_id uuid not null unique,
  almoxarifado_id bigint not null,
  setor_id bigint not null,
  evento_id bigint,
  evento_texto text not null,
  plano_contas_id bigint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);

alter table checklist_parametros_os enable row level security;

drop policy if exists "checklist_parametros_os_select" on checklist_parametros_os;
create policy "checklist_parametros_os_select" on checklist_parametros_os
  for select using (
    unidade_negocio_id in (select unidade_negocio_id from servir_unidade_usuarios where user_id = auth.uid())
  );

drop policy if exists "checklist_parametros_os_insert" on checklist_parametros_os;
create policy "checklist_parametros_os_insert" on checklist_parametros_os
  for insert with check (
    unidade_negocio_id in (select unidade_negocio_id from servir_unidade_usuarios where user_id = auth.uid())
  );

drop policy if exists "checklist_parametros_os_update" on checklist_parametros_os;
create policy "checklist_parametros_os_update" on checklist_parametros_os
  for update using (
    unidade_negocio_id in (select unidade_negocio_id from servir_unidade_usuarios where user_id = auth.uid())
  );
