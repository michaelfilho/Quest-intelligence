-- 003 — Escopo da versão 1.0: remove IA, voz e Modo reunião (o código foi arquivado na branch
-- archive/ia-voz-reuniao para uma evolução futura). A migration 002 NÃO é alterada: ela já foi aplicada.
-- Preserva todas as tabelas, registros e configurações históricas da 002.
-- O código ativo não consulta essas estruturas. Apenas as permissões extintas são retiradas.

-- Remove as permissões descontinuadas dos perfis e dos ajustes individuais (listas JSON).
UPDATE roles SET permissions = (
  SELECT COALESCE(json_group_array(value), '[]') FROM json_each(roles.permissions)
   WHERE value NOT IN ('rinne_ia.use', 'rinne_voz.use', 'reuniao.use')
);
UPDATE users SET
  grants = (SELECT COALESCE(json_group_array(value), '[]') FROM json_each(users.grants) WHERE value NOT IN ('rinne_ia.use', 'rinne_voz.use', 'reuniao.use')),
  denies = (SELECT COALESCE(json_group_array(value), '[]') FROM json_each(users.denies) WHERE value NOT IN ('rinne_ia.use', 'rinne_voz.use', 'reuniao.use'));
