/**
 * Regra ESLint local: no-float-money
 *
 * Segunda linha de defesa da convenção §0 da spec: "Dinheiro NUNCA usar float.
 * Armazenar sempre em centavos como inteiro (bigint)." O mesmo vale para volume
 * (mililitros inteiros).
 *
 * A defesa PRIMÁRIA são os tipos branded `Centavos`/`Mililitros` (bigint), que
 * tornam erro de tipo atribuir um `number` a dinheiro/volume. Esta regra reforça
 * isso no nível sintático, barrando, nos arquivos onde é aplicada:
 *   - `parseFloat(...)` e `Number.parseFloat(...)`;
 *   - literais numéricos com casa decimal (ex.: `1.5`, `0.03`) — dinheiro e
 *     volume devem ser sempre inteiros (`bigint`, sufixo `n`).
 *
 * Aplicada via globs no eslint.config.js (apenas em `domain/` e `lib/money.ts`),
 * onde nenhum float legítimo deve existir.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Proíbe float em código financeiro: sem parseFloat e sem literais numéricos decimais (use bigint/centavos).',
    },
    schema: [],
    messages: {
      noParseFloat:
        'Não use {{name}} em código financeiro. Dinheiro é centavos (bigint) e volume é mililitros (bigint). Trate o valor como inteiro.',
      noDecimalLiteral:
        'Literal decimal "{{raw}}" proibido em código financeiro. Use inteiros (centavos/mililitros) com bigint (sufixo n).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        // parseFloat(...)
        if (callee.type === 'Identifier' && callee.name === 'parseFloat') {
          context.report({ node, messageId: 'noParseFloat', data: { name: 'parseFloat' } });
          return;
        }
        // Number.parseFloat(...)
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Number' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'parseFloat'
        ) {
          context.report({
            node,
            messageId: 'noParseFloat',
            data: { name: 'Number.parseFloat' },
          });
        }
      },
      Literal(node) {
        // Apenas literais numéricos (não bigint, que tem `bigint` em node).
        if (typeof node.value !== 'number') return;
        const raw = String(node.raw ?? '');
        // Float = contém ponto decimal. Inteiros e índices continuam permitidos.
        if (raw.includes('.')) {
          context.report({ node, messageId: 'noDecimalLiteral', data: { raw } });
        }
      },
    };
  },
};
