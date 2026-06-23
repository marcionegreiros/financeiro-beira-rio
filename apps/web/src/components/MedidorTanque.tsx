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
      <div className="relative h-44 w-20 overflow-hidden rounded-xl border border-claro/20 bg-petroleo">
        {/* faixa de alerta */}
        <div
          className="absolute bottom-0 w-full border-t border-dashed border-negativo/50 bg-negativo/10"
          style={{ height: `${percentualAlerta}%` }}
        />
        {/* nível atual */}
        <div
          className={`absolute bottom-0 w-full ${abaixoDoAlerta ? 'bg-negativo' : 'bg-ambar'}`}
          style={{ height: `${percentual}%` }}
        />
      </div>
      <span className="text-sm font-medium text-claro">{combustivel}</span>
      <span className="numeros text-2xl font-semibold">{percentual}%</span>
      <span className="numeros text-xs text-claro/60">{formatLitros(nivel)}</span>
      {abaixoDoAlerta && (
        <span className="rounded-full bg-negativo/20 px-2 py-0.5 text-xs text-negativo">
          nível baixo
        </span>
      )}
      <span className="sr-only">{nome}</span>
    </div>
  );
}
