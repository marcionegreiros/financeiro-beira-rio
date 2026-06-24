/**
 * MedidorTanque — o componente-assinatura do painel (§8.3).
 * Nível vertical proporcional, faixa de alerta destacada, litros e % grandes.
 */
import { formatLitros, type Mililitros } from '../domain/tipos';

interface Props {
  nome: string;
  combustivel: string;
  nivel: Mililitros;
  capacidade: Mililitros;
  nivelAlerta: Mililitros;
}

export function MedidorTanque({ nome, combustivel, nivel, capacidade, nivelAlerta }: Props) {
  const percentual = capacidade > 0n ? Number((nivel * 100n) / capacidade) : 0;
  const percentualAlerta = capacidade > 0n ? Number((nivelAlerta * 100n) / capacidade) : 0;
  const abaixoDoAlerta = nivel <= nivelAlerta;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-44 w-[72px] overflow-hidden rounded-2xl border border-borda bg-[color-mix(in_srgb,var(--color-claro)_6%,transparent)] shadow-inner">
        {/* faixa de alerta */}
        <div
          className="absolute bottom-0 w-full border-t border-dashed border-negativo/40 bg-negativo/[0.08]"
          style={{ height: `${percentualAlerta}%` }}
        />
        {/* nível atual */}
        <div
          className={`absolute bottom-0 w-full rounded-t-[3px] bg-gradient-to-t transition-[height] duration-700 ease-out ${
            abaixoDoAlerta
              ? 'from-negativo to-negativo/70'
              : 'from-ambar to-[color-mix(in_srgb,var(--color-ambar)_70%,transparent)]'
          }`}
          style={{ height: `${percentual}%` }}
        />
      </div>
      <span className="text-sm font-medium text-claro">{combustivel}</span>
      <span className={`numeros text-2xl font-semibold ${abaixoDoAlerta ? 'text-negativo' : 'text-claro'}`}>
        {percentual}%
      </span>
      <span className="numeros text-xs text-suave">{formatLitros(nivel)}</span>
      {abaixoDoAlerta && (
        <span className="rounded-full bg-negativo/15 px-2 py-0.5 text-xs font-medium text-negativo">
          nível baixo
        </span>
      )}
      <span className="sr-only">{nome}</span>
    </div>
  );
}
