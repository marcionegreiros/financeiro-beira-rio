/**
 * MedidorTanque — o componente-assinatura do painel (§8.3).
 * Nível vertical proporcional, faixa de alerta destacada, litros e % grandes.
 * Design premium com ticks de graduação, reflexos 3D e luz de fluido.
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

  // Linhas de graduação graduais (ticks) no corpo do tanque
  const ticks = [75, 50, 25];

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-borda/50 bg-ardosia/30 p-3 shadow-sm transition-all duration-300 hover:border-borda hover:shadow-md hover:bg-ardosia/50 group select-none min-w-[120px]">
      <span className="text-[10px] font-bold uppercase tracking-wider text-suave">{nome}</span>
      
      {/* Informações textuais no topo para leitura imediata */}
      <div className="flex flex-col items-center leading-tight">
        <span className="text-xs font-bold text-claro truncate max-w-[110px] text-center" title={combustivel}>
          {combustivel}
        </span>
        <span className={`numeros text-lg font-extrabold mt-1 ${abaixoDoAlerta ? 'text-negativo font-black' : 'text-ambar font-black'}`}>
          {percentual}%
        </span>
        <span className="numeros text-[10px] text-suave mt-0.5">{formatLitros(nivel)}</span>
      </div>

      {/* Corpo tridimensional do tanque (compacto h-36) */}
      <div className="relative h-36 w-14 overflow-hidden rounded-2xl border border-borda bg-gradient-to-b from-[color-mix(in_srgb,var(--color-claro)_4%,transparent)] to-[color-mix(in_srgb,var(--color-claro)_8%,transparent)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.15)] flex items-center justify-center mt-1">
        
        {/* Faixa de nível de alerta no fundo */}
        <div
          className="absolute bottom-0 w-full border-t border-dashed border-negativo/35 bg-negativo/[0.04]"
          style={{ height: `${percentualAlerta}%` }}
        />

        {/* Graduações/escala de capacidade (ticks) */}
        <div className="absolute inset-y-0 left-0 w-full flex flex-col justify-between py-4 px-1 pointer-events-none opacity-40 z-10">
          {ticks.map((t) => (
            <div key={t} className="flex items-center justify-between w-full">
              <span className="w-1 h-[1px] bg-claro/50" />
              <span className="font-mono text-[7px] font-medium text-suave">{t}%</span>
              <span className="w-1 h-[1px] bg-claro/50" />
            </div>
          ))}
        </div>

        {/* Fluido colorido proporcional ao nível */}
        <div
          className={`absolute bottom-0 w-full rounded-t-[4px] bg-gradient-to-t transition-[height] duration-1000 ease-out shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ${
            abaixoDoAlerta
              ? 'from-negativo to-[color-mix(in_srgb,var(--color-negativo)_85%,#ffffff)] shadow-[0_0_12px_rgba(239,68,68,0.35)]'
              : 'from-ambar to-[color-mix(in_srgb,var(--color-ambar)_85%,#ffffff)] shadow-[0_0_12px_rgba(var(--acento-rgb),0.3)]'
          }`}
          style={{ height: `${percentual}%` }}
        >
          {/* Brilho de superfície líquida (menisco) */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/40 rounded-t-[4px] blur-[0.5px]" />
        </div>

        {/* Reflexo de vidro diagonal para visual 3D */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-white/[0.08] pointer-events-none rounded-2xl" />
        
        {/* Glow de borda lateral do vidro */}
        <div className="absolute inset-y-0 right-1 w-[2px] bg-white/[0.04] pointer-events-none rounded-full" />
      </div>

      {abaixoDoAlerta && (
        <span className="rounded-full bg-negativo/10 border border-negativo/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-negativo animate-pulse mt-1">
          crítico
        </span>
      )}
      <span className="sr-only">{nome}</span>
    </div>
  );
}
