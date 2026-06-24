-- Migration 0010 - Adicionar fechamento_id em venda_avulsa para auditoria e cascata
--
ALTER TABLE public.venda_avulsa 
ADD COLUMN fechamento_id uuid REFERENCES public.fechamento (id) ON DELETE CASCADE;

CREATE INDEX idx_venda_avulsa_fechamento ON public.venda_avulsa (fechamento_id);
