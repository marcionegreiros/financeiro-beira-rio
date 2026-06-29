import { useState } from 'react';
import { Transferencias } from './Transferencias';
import { Contas } from '../catalogo/Contas';
import type { UsuarioAtual } from '../../data/usuario';

type Aba = 'transferencias' | 'contas';

/**
 * Reúne as duas telas relacionadas numa só janela com abas:
 * - "Transferências" (operação diária) é a aba padrão.
 * - "Contas" (catálogo/configuração) fica ao lado.
 * As abas aparecem só conforme a permissão; com uma única permissão,
 * a barra de abas some e a tela correspondente é renderizada direto.
 */
export function ContasETransferencias({
  usuario,
  podeTransferir,
  podeGerenciarContas,
}: {
  usuario: UsuarioAtual;
  podeTransferir: boolean;
  podeGerenciarContas: boolean;
}) {
  const abas = [
    podeTransferir && { id: 'transferencias' as Aba, label: 'Transferências' },
    podeGerenciarContas && { id: 'contas' as Aba, label: 'Contas' },
  ].filter((a): a is { id: Aba; label: string } => !!a);

  const [aba, setAba] = useState<Aba>(abas[0]?.id ?? 'transferencias');

  // Com uma só aba permitida, não faz sentido mostrar a barra.
  const mostrarAbas = abas.length > 1;
  const ativa = abas.some((a) => a.id === aba) ? aba : (abas[0]?.id ?? 'transferencias');

  return (
    <div className="flex flex-col gap-6">
      {mostrarAbas && (
        <div className="border-b border-borda">
          <nav className="-mb-px flex gap-1" role="tablist" aria-label="Contas e transferências">
            {abas.map((a) => {
              const selecionada = ativa === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={selecionada}
                  onClick={() => setAba(a.id)}
                  className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                    selecionada ? 'text-claro' : 'text-suave hover:text-claro'
                  }`}
                >
                  {a.label}
                  <span
                    className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-ambar transition-opacity ${
                      selecionada ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </button>
              );
            })}
          </nav>
        </div>
      )}

      <div key={ativa} className="animar-surgir">
        {ativa === 'transferencias' && podeTransferir && <Transferencias usuario={usuario} />}
        {ativa === 'contas' && podeGerenciarContas && <Contas />}
      </div>
    </div>
  );
}
