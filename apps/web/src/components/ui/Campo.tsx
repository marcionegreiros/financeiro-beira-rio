import type { ReactNode } from 'react';

/** Classe padrão para inputs/selects dentro de formulários (o foco vem do CSS global). */
export const CLASSE_CAMPO = 'w-full rounded-lg px-3 py-2 text-sm';

/** Rótulo + controle + dica opcional, padronizando o espaçamento dos formulários. */
export function Campo({
  label,
  obrigatorio,
  dica,
  children,
}: {
  label: string;
  obrigatorio?: boolean;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex h-full flex-col">
      <span className="flex items-end pb-1.5 text-sm font-medium text-claro leading-tight">
        <span>
          {label}
          {obrigatorio && <span className="text-negativo"> *</span>}
        </span>
      </span>
      {children}
      {dica && <span className="mt-1 text-[11px] text-suave">{dica}</span>}
    </label>
  );
}
