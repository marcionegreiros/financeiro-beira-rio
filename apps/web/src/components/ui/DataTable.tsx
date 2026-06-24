import type { ReactNode } from 'react';

export interface Coluna<T> {
  chave: string;
  titulo: string;
  alinhar?: 'left' | 'right' | 'center';
  className?: string;
  render: (item: T) => ReactNode;
}

interface Props<T> {
  colunas: Coluna<T>[];
  dados: T[];
  chaveLinha: (item: T) => string;
  carregando?: boolean;
  vazio?: ReactNode;
}

function alinhamento(a?: 'left' | 'right' | 'center') {
  return a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
}

/** Tabela de dados reutilizável — cabeçalho sticky, hover de linha, estados de carregamento/vazio. */
export function DataTable<T>({ colunas, dados, chaveLinha, carregando, vazio }: Props<T>) {
  return (
    <div className="cartao overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-borda bg-claro/[0.03]">
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-suave ${alinhamento(c.alinhar)}`}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={colunas.length} className="px-4 py-12 text-center text-suave">
                  Carregando…
                </td>
              </tr>
            )}
            {!carregando && dados.length === 0 && (
              <tr>
                <td colSpan={colunas.length} className="px-4 py-12 text-center text-sm text-suave">
                  {vazio ?? 'Nenhum registro encontrado.'}
                </td>
              </tr>
            )}
            {!carregando &&
              dados.map((item) => (
                <tr
                  key={chaveLinha(item)}
                  className="border-b border-borda transition-colors last:border-0 hover:bg-claro/[0.04]"
                >
                  {colunas.map((c) => (
                    <td key={c.chave} className={`px-4 py-3 align-middle text-claro ${alinhamento(c.alinhar)} ${c.className ?? ''}`}>
                      {c.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
