-- Migration 0006 — Catálogo fixo de permissões (§4).
--
-- Dados de referência (enum-like) que a autorização depende — por isso ficam
-- numa migration, não no seed. Idempotente.

insert into permissao (chave, descricao) values
  ('fechar_caixa',            'Criar e confirmar fechamento diário.'),
  ('registrar_venda_avulsa',  'Lançar vendas individuais durante o dia.'),
  ('ver_painel_operacional',  'Ver venda do dia/mês, nível de tanque, alertas.'),
  ('ver_capital',             'Ver capital, gráficos de evolução.'),
  ('lancar_despesa',          'Registrar despesas.'),
  ('transferir_entre_contas', 'Transferências e depósitos.'),
  ('gerenciar_contas',        'Criar/editar/desativar contas.'),
  ('ver_retiradas_socios',    'Ver pró-labore, aportes, devoluções, saldo devedor.'),
  ('gerenciar_socios',        'Registrar aportes/devoluções.'),
  ('gerenciar_fiado',         'Conceder e baixar fiado.'),
  ('gerenciar_funcionarios',  'Folha, vales, salários.'),
  ('cadastrar_produto',       'Criar/editar/ativar/desativar produtos.'),
  ('definir_preco_custo',     'Alterar preços e custos (com data/hora).'),
  ('gerenciar_combustivel',   'Entradas e medições de tanque, config de tanque.'),
  ('reabrir_fechamento',      'Reabrir/ajustar fechamento travado.'),
  ('gerenciar_permissoes',    'Criar usuários e atribuir permissões.'),
  ('ver_auditoria',           'Ver log de auditoria.'),
  ('editar_configuracoes',    'Troco, taxas de cartão, alertas, modo de apuração, etc.')
on conflict (chave) do nothing;
