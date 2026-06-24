import { useEffect, useState } from 'react';

export interface CoresTema {
  acento: string;
  texto: string;
  suave: string;
  superficie: string;
  borda: string;
}

function lerCores(): CoresTema {
  if (typeof window === 'undefined') {
    return { acento: '#2563eb', texto: '#0f172a', suave: '#64748b', superficie: '#ffffff', borda: 'rgba(15,23,42,0.09)' };
  }
  const s = getComputedStyle(document.documentElement);
  const v = (nome: string) => s.getPropertyValue(nome).trim();
  return {
    acento: v('--color-ambar'),
    texto: v('--color-claro'),
    suave: v('--color-suave'),
    superficie: v('--color-elevado'),
    borda: v('--color-borda'),
  };
}

/**
 * Lê os tokens de cor do tema ativo (CSS custom properties) para alimentar
 * bibliotecas que exigem valores concretos (ex.: Recharts). Reage à troca de
 * tema observando mudanças de classe em <html>.
 */
export function useCoresTema(): CoresTema {
  const [cores, setCores] = useState<CoresTema>(lerCores);

  useEffect(() => {
    const atualizar = () => setCores(lerCores());
    atualizar();
    const observador = new MutationObserver(atualizar);
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observador.disconnect();
  }, []);

  return cores;
}
