import { useState, useEffect, useRef } from 'react';
import { CLASSE_CAMPO } from './Campo';

interface ComboboxOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  options: ComboboxOption[];
  value: string; // ID selecionado
  onChange: (id: string) => void;
  placeholder?: string;
}

export function Combobox({ options, value, onChange, placeholder = 'Digite para buscar...' }: Props) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sincroniza o label da opção selecionada no input de busca
  useEffect(() => {
    const selecionado = options.find((o) => o.id === value);
    setBusca(selecionado ? selecionado.label : '');
  }, [value, options]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
        const selecionado = options.find((o) => o.id === value);
        setBusca(selecionado ? selecionado.label : '');
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [value, options]);

  const filtrados = options.filter((o) =>
    o.label.toLowerCase().includes(busca.toLowerCase()) ||
    (o.sublabel && o.sublabel.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        type="text"
        placeholder={placeholder}
        className={CLASSE_CAMPO}
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
          const exato = options.find((o) => o.label.toLowerCase() === e.target.value.toLowerCase());
          if (exato) {
            onChange(exato.id);
          } else {
            onChange('');
          }
        }}
        onFocus={() => setAberto(true)}
      />
      
      {/* Indicador visual de dropdown (flecha) */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-suave">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {aberto && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-borda bg-elevado p-1 shadow-lg backdrop-blur-md">
          {filtrados.length === 0 ? (
            <div className="p-2 text-xs text-suave">Nenhum resultado encontrado</div>
          ) : (
            filtrados.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setBusca(o.label);
                  setAberto(false);
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-claro/5 ${
                  o.id === value ? 'bg-claro/10 text-claro font-semibold' : 'text-claro'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>{o.label}</span>
                  {o.sublabel && <span className="text-xs text-suave font-normal ml-2">{o.sublabel}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
