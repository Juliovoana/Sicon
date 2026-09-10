-- ============================================================
-- Staff — corrige o bug do papel que não liberava acesso
-- Rode isto no SQL Editor do Supabase do projeto principal
-- (frzvcrcshkpvjdbbqkhz) -- idempotente, pode rodar mais de uma vez.
--
-- Causa raiz: a tela de Permissões do Staff sempre gravou o papel em
-- staff_papeis_usuario, mas quem decide se a pessoa entra no módulo
-- (fn_staff_papel_usuario -> fn_papel_usuario) sempre leu de
-- servir_papeis_usuario (tabela genérica, compartilhada entre
-- módulos, com coluna "modulo"). As duas tabelas nunca se
-- comunicavam -- por isso definir um papel no Staff nunca liberava
-- acesso de verdade (só virar "principal" funcionava, porque essa
-- regra é tratada à parte, direto na função).
--
-- O código já foi corrigido pra escrever/ler servir_papeis_usuario
-- (modulo='staff') a partir de agora. Esta migração só copia pra lá
-- o que já estava gravado (errado) em staff_papeis_usuario, pra quem
-- já tinha um papel definido não precisar refazer nada.
-- ============================================================

insert into servir_papeis_usuario (unidade_negocio_id, user_id, modulo, papel)
select unidade_negocio_id, user_id, 'staff', papel
from staff_papeis_usuario
on conflict (unidade_negocio_id, user_id, modulo) do update
  set papel = excluded.papel;
