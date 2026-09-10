-- ============================================================
-- Checklist Equipamentos — coluna "papel" em servir_unidade_usuarios
-- Rode isto no SQL Editor do Supabase do projeto principal
-- (frzvcrcshkpvjdbbqkhz) -- idempotente, pode rodar mais de uma vez.
--
-- Contexto: o código já lia "vinculo.papel" desde antes (pra saber
-- quem é 'administrador'), mas a coluna nunca existiu de verdade --
-- só não dava erro porque o select era '*', que não falha pra chave
-- ausente. Ao pedir a coluna explicitamente (aba Permissões), o
-- Postgres acusou "column servir_unidade_usuarios.papel does not
-- exist". Esta coluna é compartilhada por toda a plataforma (não é
-- só do Checklist), então fica sem CHECK restringindo valores --
-- 'administrador' e 'motorista' são só os valores que o Checklist
-- Equipamentos usa hoje; deixe null/'' pra operador padrão.
-- ============================================================

alter table servir_unidade_usuarios
  add column if not exists papel text;
