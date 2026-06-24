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
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-claro">
        {label}
        {obrigatorio && <span className="text-negativo"> *</span>}
      </span>
      {children}
      {dica && <span className="text-xs text-suave">{dica}</span>}
    </label>
  );
}
