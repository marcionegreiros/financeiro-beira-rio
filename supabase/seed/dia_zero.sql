-- Seed — Dia zero (§3.8) + dados de catálogo do Pontão.
--
-- Cadastro inicial para começar a usar o sistema: contas, produtos, combustível,
-- tanques, preços/custos, configurações, e o "dia zero" (saldos, contagens,
-- encerrantes e níveis iniciais) que serve de base para o primeiro fechamento.
--
-- UUIDs fixos (válidos como v7: versão 7, variante 8) com sufixo numérico de 2
-- dígitos para referência cruzada. Idempotente via ON CONFLICT.
-- Mapa de códigos: 01 usuário · 02-04 modelos · 05-08 categorias · 09-10
-- combustível · 11-14 preço/custo combustível · 15-16 tanques · 17-18 bombas ·
-- 19-20 contas · 21-27 categorias de despesa · 28 sócio · 29 funcionário ·
-- 30-33 produtos · 34-41 preço/custo produtos · 42 fechamento dia-zero ·
-- 43-44 leituras · 45-47 contagens · 48-49 medições · 50-51 saldos iniciais.

-- ===================== Modelos de permissão (atalhos, §4) =====================
insert into modelo_permissao (id, nome) values
  ('00000000-0000-7000-8000-000000000002', 'Vendedor'),
  ('00000000-0000-7000-8000-000000000003', 'Gerente (leitura)'),
  ('00000000-0000-7000-8000-000000000004', 'Gerente (completo)')
on conflict (id) do nothing;

insert into modelo_permissao_item (modelo_id, permissao_chave) values
  -- Vendedor: opera o dia, sem capital/sócios/permissões.
  ('00000000-0000-7000-8000-000000000002', 'fechar_caixa'),
  ('00000000-0000-7000-8000-000000000002', 'registrar_venda_avulsa'),
  ('00000000-0000-7000-8000-000000000002', 'ver_painel_operacional'),
  ('00000000-0000-7000-8000-000000000002', 'lancar_despesa'),
  ('00000000-0000-7000-8000-000000000002', 'gerenciar_fiado'),
  -- Gerente (leitura): todos os ver_*.
  ('00000000-0000-7000-8000-000000000003', 'ver_painel_operacional'),
  ('00000000-0000-7000-8000-000000000003', 'ver_capital'),
  ('00000000-0000-7000-8000-000000000003', 'ver_retiradas_socios'),
  ('00000000-0000-7000-8000-000000000003', 'ver_auditoria'),
  -- Gerente (completo): todas as permissões.
  ('00000000-0000-7000-8000-000000000004', 'fechar_caixa'),
  ('00000000-0000-7000-8000-000000000004', 'registrar_venda_avulsa'),
  ('00000000-0000-7000-8000-000000000004', 'ver_painel_operacional'),
  ('00000000-0000-7000-8000-000000000004', 'ver_capital'),
  ('00000000-0000-7000-8000-000000000004', 'lancar_despesa'),
  ('00000000-0000-7000-8000-000000000004', 'transferir_entre_contas'),
  ('00000000-0000-7000-8000-000000000004', 'gerenciar_contas'),
  ('00000000-0000-7000-8000-000000000004', 'ver_retiradas_socios'),
  ('00000000-0000-7000-8000-000000000004', 'gerenciar_socios'),
  ('00000000-0000-7000-8000-000000000004', 'gerenciar_fiado'),
  ('00000000-0000-7000-8000-000000000004', 'gerenciar_funcionarios'),
  ('00000000-0000-7000-8000-000000000004', 'cadastrar_produto'),
  ('00000000-0000-7000-8000-000000000004', 'definir_preco_custo'),
  ('00000000-0000-7000-8000-000000000004', 'gerenciar_combustivel'),
  ('00000000-0000-7000-8000-000000000004', 'reabrir_fechamento'),
  ('00000000-0000-7000-8000-000000000004', 'gerenciar_permissoes'),
  ('00000000-0000-7000-8000-000000000004', 'ver_auditoria'),
  ('00000000-0000-7000-8000-000000000004', 'editar_configuracoes')
on conflict do nothing;

-- ===================== Usuário (dono/gerente) =====================
insert into usuario (id, nome, email) values
  ('00000000-0000-7000-8000-000000000001', 'Márcio', 'mngn.eng@gmail.com')
on conflict (id) do nothing;

insert into usuario_permissao (usuario_id, permissao_chave)
select '00000000-0000-7000-8000-000000000001', permissao_chave
from modelo_permissao_item
where modelo_id = '00000000-0000-7000-8000-000000000004'
on conflict do nothing;

-- ===================== Categorias (ordem da contagem) =====================
insert into categoria (id, nome, ordem) values
  ('00000000-0000-7000-8000-000000000005', 'Combustível', 1),
  ('00000000-0000-7000-8000-000000000006', 'Óleos',       2),
  ('00000000-0000-7000-8000-000000000007', 'Bebidas',     3),
  ('00000000-0000-7000-8000-000000000008', 'Estivas',     4)
on conflict (id) do nothing;

-- ===================== Combustível, tanques e bicos =====================
insert into combustivel (id, nome) values
  ('00000000-0000-7000-8000-000000000009', 'Gasolina'),
  ('00000000-0000-7000-8000-000000000010', 'Diesel')
on conflict (id) do nothing;

insert into tanque (id, combustivel_id, nome, capacidade_litros, nivel_alerta_litros) values
  ('00000000-0000-7000-8000-000000000015', '00000000-0000-7000-8000-000000000009', 'Tanque Gasolina', 15000.000, 2000.000),
  ('00000000-0000-7000-8000-000000000016', '00000000-0000-7000-8000-000000000010', 'Tanque Diesel',   15000.000, 2000.000)
on conflict (id) do nothing;

insert into bomba (id, tanque_id, nome) values
  ('00000000-0000-7000-8000-000000000017', '00000000-0000-7000-8000-000000000015', 'Bico Gasolina'),
  ('00000000-0000-7000-8000-000000000018', '00000000-0000-7000-8000-000000000016', 'Bico Diesel')
on conflict (id) do nothing;

-- Preço/custo do combustível (centavos por litro).
insert into preco_combustivel (id, combustivel_id, valor_centavos, valido_a_partir_de) values
  ('00000000-0000-7000-8000-000000000011', '00000000-0000-7000-8000-000000000009', 770, '2026-06-01'),
  ('00000000-0000-7000-8000-000000000012', '00000000-0000-7000-8000-000000000010', 690, '2026-06-01')
on conflict (id) do nothing;
insert into custo_combustivel (id, combustivel_id, valor_centavos, valido_a_partir_de) values
  ('00000000-0000-7000-8000-000000000013', '00000000-0000-7000-8000-000000000009', 700, '2026-06-01T00:00:00-04:00'),
  ('00000000-0000-7000-8000-000000000014', '00000000-0000-7000-8000-000000000010', 620, '2026-06-01T00:00:00-04:00')
on conflict (id) do nothing;

-- ===================== Produtos (com ordem e modo de apuração) =====================
insert into produto (id, nome, categoria_id, ordem, modo_apuracao, alerta_baixo, alerta_muito_baixo) values
  ('00000000-0000-7000-8000-000000000030', 'Óleo 2T 500ml',  '00000000-0000-7000-8000-000000000006', 10, 'contagem',   10.000, 4.000),
  ('00000000-0000-7000-8000-000000000031', 'Água 500ml',     '00000000-0000-7000-8000-000000000007', 20, 'contagem',   24.000, 6.000),
  ('00000000-0000-7000-8000-000000000032', 'Refrigerante',   '00000000-0000-7000-8000-000000000007', 21, 'contagem',   24.000, 6.000),
  ('00000000-0000-7000-8000-000000000033', 'Gelo 5kg',       '00000000-0000-7000-8000-000000000008', 30, 'individual', 5.000,  2.000)
on conflict (id) do nothing;

insert into preco_produto (id, produto_id, valor_centavos, valido_a_partir_de) values
  ('00000000-0000-7000-8000-000000000034', '00000000-0000-7000-8000-000000000030', 1500, '2026-06-01'),
  ('00000000-0000-7000-8000-000000000035', '00000000-0000-7000-8000-000000000031', 300,  '2026-06-01'),
  ('00000000-0000-7000-8000-000000000036', '00000000-0000-7000-8000-000000000032', 600,  '2026-06-01'),
  ('00000000-0000-7000-8000-000000000037', '00000000-0000-7000-8000-000000000033', 1000, '2026-06-01')
on conflict (id) do nothing;
insert into custo_produto (id, produto_id, valor_centavos, valido_a_partir_de) values
  ('00000000-0000-7000-8000-000000000038', '00000000-0000-7000-8000-000000000030', 1000, '2026-06-01T00:00:00-04:00'),
  ('00000000-0000-7000-8000-000000000039', '00000000-0000-7000-8000-000000000031', 180,  '2026-06-01T00:00:00-04:00'),
  ('00000000-0000-7000-8000-000000000040', '00000000-0000-7000-8000-000000000032', 380,  '2026-06-01T00:00:00-04:00'),
  ('00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000033', 650,  '2026-06-01T00:00:00-04:00')
on conflict (id) do nothing;

-- ===================== Contas =====================
insert into conta (id, nome, tipo, eh_destino_padrao_venda) values
  ('00000000-0000-7000-8000-000000000019', 'Caixa Físico', 'dinheiro', false),
  ('00000000-0000-7000-8000-000000000020', 'Bradesco',     'banco',    true)
on conflict (id) do nothing;

-- ===================== Categorias de despesa =====================
insert into categoria_despesa (id, nome, eh_especial) values
  ('00000000-0000-7000-8000-000000000021', 'Fornecedores',       false),
  ('00000000-0000-7000-8000-000000000022', 'Despesas',           false),
  ('00000000-0000-7000-8000-000000000023', 'Descontos',          false),
  ('00000000-0000-7000-8000-000000000024', 'Vales',              false),
  ('00000000-0000-7000-8000-000000000025', 'Perda',              true),
  ('00000000-0000-7000-8000-000000000026', 'Taxa de cartão',     true),
  ('00000000-0000-7000-8000-000000000027', 'Diferença de caixa', true)
on conflict (id) do nothing;

-- ===================== Sócio e funcionário =====================
insert into socio (id, nome, contato) values
  ('00000000-0000-7000-8000-000000000028', 'Márcio', null)
on conflict (id) do nothing;
insert into funcionario (id, nome, salario_base_centavos) values
  ('00000000-0000-7000-8000-000000000029', 'Vendedor 1', 180000)
on conflict (id) do nothing;

-- ===================== Configurações (§5.11) =====================
insert into config (chave, valor_json) values
  ('troco_fixo_centavos',       '10000'::jsonb),
  ('taxa_cartao_debito',        '{"percentual_bp": 150, "fixa_centavos": 0}'::jsonb),
  ('taxa_cartao_credito',       '{"percentual_bp": 300, "fixa_centavos": 10}'::jsonb),
  ('data_corte_folha_dia',      '5'::jsonb),
  ('modo_apuracao_padrao',      '"contagem"'::jsonb),
  ('conta_destino_padrao_venda','"00000000-0000-7000-8000-000000000020"'::jsonb)
on conflict (chave) do nothing;

-- ===================== DIA ZERO (§3.8) =====================
-- Fechamento de abertura (travado) que fixa o estado inicial: encerrantes,
-- contagens e níveis. Os fechamentos seguintes comparam contra este.
insert into fechamento (id, data, status, troco_fixo_centavos, responsavel_id, observacao, travado_em) values
  ('00000000-0000-7000-8000-000000000042', '2026-06-01', 'travado', 10000,
   '00000000-0000-7000-8000-000000000001', 'Dia zero — cadastro inicial.', now())
on conflict (id) do nothing;

-- Encerrantes iniciais (leitura atual das bombas no dia zero).
insert into leitura_bomba (id, fechamento_id, bomba_id, leitura) values
  ('00000000-0000-7000-8000-000000000043', '00000000-0000-7000-8000-000000000042', '00000000-0000-7000-8000-000000000017', 1485284.000),
  ('00000000-0000-7000-8000-000000000044', '00000000-0000-7000-8000-000000000042', '00000000-0000-7000-8000-000000000018', 980000.000)
on conflict (id) do nothing;

-- Contagens iniciais de produtos (estoque no dia zero).
insert into contagem_produto (id, fechamento_id, produto_id, quantidade) values
  ('00000000-0000-7000-8000-000000000045', '00000000-0000-7000-8000-000000000042', '00000000-0000-7000-8000-000000000030', 40.000),
  ('00000000-0000-7000-8000-000000000046', '00000000-0000-7000-8000-000000000042', '00000000-0000-7000-8000-000000000031', 120.000),
  ('00000000-0000-7000-8000-000000000047', '00000000-0000-7000-8000-000000000042', '00000000-0000-7000-8000-000000000032', 96.000)
on conflict (id) do nothing;

-- Nível inicial dos tanques (medição de régua no dia zero).
insert into medicao_tanque (id, tanque_id, litros_medidos, data_hora, observacao) values
  ('00000000-0000-7000-8000-000000000048', '00000000-0000-7000-8000-000000000015', 9600.000, '2026-06-01T08:00:00-04:00', 'Dia zero.'),
  ('00000000-0000-7000-8000-000000000049', '00000000-0000-7000-8000-000000000016', 4200.000, '2026-06-01T08:00:00-04:00', 'Dia zero.')
on conflict (id) do nothing;

-- Saldos iniciais das contas (movimento tipo ajuste = saldo de abertura).
insert into movimento (id, tipo, conta_id, valor_centavos, data_hora, descricao, criado_por) values
  ('00000000-0000-7000-8000-000000000050', 'ajuste', '00000000-0000-7000-8000-000000000019', 50000,   '2026-06-01T08:00:00-04:00', 'Saldo inicial (dia zero).', '00000000-0000-7000-8000-000000000001'),
  ('00000000-0000-7000-8000-000000000051', 'ajuste', '00000000-0000-7000-8000-000000000020', 1500000, '2026-06-01T08:00:00-04:00', 'Saldo inicial (dia zero).', '00000000-0000-7000-8000-000000000001')
on conflict (id) do nothing;
