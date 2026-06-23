import { formatReais, parseReais } from './lib/money';
import { formatLitros, litros, type Mililitros } from './domain/tipos';
import { dinheiroEsperado, diferencaCaixa } from './domain/caixa';

/**
 * Tela de verificação da Fase 0 — NÃO é uma tela de produto (essas vêm nas
 * Fases 4+). Serve para provar que o scaffold roda, a identidade visual (§8.2)
 * carregou e o motor financeiro (Fase 2) já calcula corretamente.
 */

// Âncora da planilha real (§11.1) calculada AO VIVO pelo domínio.
const vendaFisica = parseReais('2.204,90');
const esperado = dinheiroEsperado({
  vendaFisica,
  despesasDinheiro: parseReais('50,00'),
  pix: parseReais('383,00'),
});
const diferenca = diferencaCaixa(parseReais('1.772,00'), esperado);

// Exemplo de medidor de tanque (o componente-assinatura virá na Fase 8).
const capacidade = litros(15_000n);
const nivel = litros(9_600n);

function MedidorTanque({
  nome,
  nivelAtual,
  capacidadeTotal,
}: {
  nome: string;
  nivelAtual: Mililitros;
  capacidadeTotal: Mililitros;
}) {
  const percentual = Number((nivelAtual * 100n) / capacidadeTotal);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-40 w-16 overflow-hidden rounded-xl border border-claro/20 bg-petroleo">
        <div
          className="absolute bottom-0 w-full bg-ambar transition-[height]"
          style={{ height: `${percentual}%` }}
        />
      </div>
      <span className="text-sm text-claro/70">{nome}</span>
      <span className="numeros text-lg font-medium">{percentual}%</span>
      <span className="numeros text-xs text-claro/60">{formatLitros(nivelAtual)}</span>
    </div>
  );
}

export function App() {
  const sobra = diferenca >= 0n;
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-widest text-ambar">Pontão Beira Rio</p>
        <h1 className="font-display text-3xl font-bold text-claro">
          Controle financeiro offline-first
        </h1>
        <p className="mt-2 text-claro/70">
          Fundação pronta. Núcleo de cálculo coberto por testes. Próximo: modelo de dados e telas.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-ardosia p-5">
          <p className="text-xs uppercase tracking-wide text-claro/60">Dinheiro esperado</p>
          <p className="numeros mt-1 text-2xl font-semibold">{formatReais(esperado)}</p>
        </div>
        <div className="rounded-2xl border border-ambar/40 bg-ambar/10 p-5">
          <p className="text-xs uppercase tracking-wide text-ambar">A depositar (exemplo)</p>
          <p className="numeros mt-1 text-2xl font-semibold text-ambar">{formatReais(esperado)}</p>
        </div>
        <div className="rounded-2xl bg-ardosia p-5">
          <p className="text-xs uppercase tracking-wide text-claro/60">Diferença de caixa</p>
          <p
            className={`numeros mt-1 text-2xl font-semibold ${sobra ? 'text-positivo' : 'text-negativo'}`}
          >
            {formatReais(diferenca)}
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-ardosia p-6">
        <h2 className="font-display text-lg font-semibold text-claro">Medidor de tanque</h2>
        <p className="mb-4 text-sm text-claro/60">
          Componente-assinatura do painel (prévia; versão final na Fase 8).
        </p>
        <div className="flex gap-10">
          <MedidorTanque nome="Gasolina" nivelAtual={nivel} capacidadeTotal={capacidade} />
          <MedidorTanque nome="Diesel" nivelAtual={litros(4_200n)} capacidadeTotal={capacidade} />
        </div>
      </section>

      <footer className="rounded-2xl border border-claro/10 p-5 text-sm text-claro/60">
        <p>
          <strong className="text-claro">Pilar 1:</strong> nada de saldo editável — tudo é derivado
          de eventos imutáveis.
        </p>
        <p className="mt-1">
          <strong className="text-claro">Pilar 2:</strong> caixa, capital e dívida são três livros
          separados.
        </p>
        <p className="mt-3 text-xs">
          Âncora §11.1 validada ao vivo: esperado {formatReais(esperado)}, diferença{' '}
          {formatReais(diferenca)}.
        </p>
      </footer>
    </main>
  );
}
