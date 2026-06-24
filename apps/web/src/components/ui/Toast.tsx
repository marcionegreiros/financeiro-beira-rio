import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type TipoToast = 'sucesso' | 'erro' | 'info';
interface ToastItem {
  id: number;
  tipo: TipoToast;
  mensagem: string;
}
interface ToastApi {
  mostrar: (mensagem: string, tipo?: TipoToast) => void;
  sucesso: (mensagem: string) => void;
  erro: (mensagem: string) => void;
}

const Contexto = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([]);
  const proximoId = useRef(1);

  const remover = useCallback((id: number) => {
    setItens((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const mostrar = useCallback(
    (mensagem: string, tipo: TipoToast = 'info') => {
      const id = proximoId.current++;
      setItens((xs) => [...xs, { id, tipo, mensagem }]);
      setTimeout(() => remover(id), 4200);
    },
    [remover],
  );

  const api: ToastApi = {
    mostrar,
    sucesso: (m) => mostrar(m, 'sucesso'),
    erro: (m) => mostrar(m, 'erro'),
  };

  return (
    <Contexto.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {itens.map((t) => (
          <ToastCard key={t.id} item={t} aoFechar={() => remover(t.id)} />
        ))}
      </div>
    </Contexto.Provider>
  );
}

function ToastCard({ item, aoFechar }: { item: ToastItem; aoFechar: () => void }) {
  const borda =
    item.tipo === 'sucesso'
      ? 'border-l-positivo'
      : item.tipo === 'erro'
        ? 'border-l-negativo'
        : 'border-l-ambar';
  const corIcone =
    item.tipo === 'sucesso' ? 'text-positivo' : item.tipo === 'erro' ? 'text-negativo' : 'text-ambar';

  return (
    <div
      className={`cartao-realce animar-lateral pointer-events-auto flex items-start gap-3 border-l-4 p-3.5 pr-3 ${borda}`}
      role="status"
    >
      <span className={`mt-0.5 shrink-0 ${corIcone}`}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
          {item.tipo === 'sucesso' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          ) : item.tipo === 'erro' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          )}
        </svg>
      </span>
      <p className="flex-1 pt-0.5 text-sm font-medium text-claro">{item.mensagem}</p>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar aviso"
        className="shrink-0 rounded p-0.5 text-suave transition-colors hover:text-claro"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
