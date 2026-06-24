import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  larguraMax?: string;
}

/**
 * Janela sobreposta (dialog) reutilizável — backdrop com blur, fecha no ESC e
 * no clique fora, trava o scroll do corpo. Padrão de "Adicionar / Editar".
 */
export function Modal({ aberto, aoFechar, titulo, descricao, children, larguraMax = 'max-w-lg' }: Props) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="animar-surgir fixed inset-0 h-full w-full cursor-default bg-black/55 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`cartao-realce animar-surgir relative z-10 w-full ${larguraMax} p-6`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-claro">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-suave">{descricao}</p>}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-suave transition-colors hover:bg-claro/10 hover:text-claro"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

