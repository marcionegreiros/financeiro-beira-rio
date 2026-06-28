-- Migration — Pré-instalar categorias de despesa (Fornecedores, Material, Administrativo, Impostos)
-- Evita duplicações caso as categorias já existam.

INSERT INTO public.categoria_despesa (id, nome, eh_especial)
SELECT gen_random_uuid(), val.nome, false
FROM (VALUES ('Fornecedores'), ('Material'), ('Administrativo'), ('Impostos')) as val(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categoria_despesa cd WHERE cd.nome = val.nome
);
