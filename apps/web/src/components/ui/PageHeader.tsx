import type { ReactNode } from 'react';

/** Cabeçalho de página padrão: título + subtítulo + slot de ação (ex.: botão Adicionar). */
export function PageHeader({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-claro sm:text-3xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-suave">{subtitulo}</p>}
      </div>
      {acao && <div className="flex items-center gap-2">{acao}</div>}
    </header>
  );
}
