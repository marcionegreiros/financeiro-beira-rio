-- Migration — PIX da maquininha também tem taxa.
--
-- O PIX recebido pela maquininha (QR Code da adquirente) cobra taxa, ao contrário
-- do PIX direto na chave do banco (grátis). Passa a ser mais um canal com taxa
-- versionada por data, igual a débito/crédito: a venda registra o bruto, o banco
-- recebe o líquido e a diferença vira despesa automática "Taxa de cartão (PIX)".

alter table public.taxa_cartao drop constraint taxa_cartao_forma_check;
alter table public.taxa_cartao
  add constraint taxa_cartao_forma_check check (forma in ('debito', 'credito', 'pix'));

-- Vigência-base zerada para o PIX (sem taxa até o gerente configurar), para a
-- leitura nunca falhar. Idempotente.
insert into public.taxa_cartao (id, forma, percentual_bp, fixa_centavos, valido_a_partir_de)
select gen_random_uuid(), 'pix', 0, 0, date '2000-01-01'
where not exists (select 1 from public.taxa_cartao where forma = 'pix');
