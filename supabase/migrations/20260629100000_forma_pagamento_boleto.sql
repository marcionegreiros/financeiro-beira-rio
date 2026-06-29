-- Migration — amplia as formas de pagamento (boleto, transferência).
--
-- Pagamentos saindo de uma conta de BANCO podem ser por boleto, transferência
-- (TED/DOC), PIX, débito ou crédito — nunca "dinheiro". Pagamentos de uma conta de
-- DINHEIRO só podem ser em dinheiro. A coerência forma↔conta é garantida na borda
-- (UI). A tarifa de PIX só incide quando a forma é exatamente 'pix' (boleto e as
-- demais NÃO pagam tarifa).

alter table public.movimento drop constraint movimento_forma_pagamento_check;
alter table public.movimento add constraint movimento_forma_pagamento_check
  check (forma_pagamento in ('dinheiro', 'pix', 'debito', 'credito', 'boleto', 'transferencia'));
