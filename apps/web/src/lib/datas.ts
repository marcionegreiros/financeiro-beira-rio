/**
 * datas — fuso fixo America/Manaus (§0 da spec).
 *
 * Manaus é UTC−4 e NÃO tem horário de verão, então o offset é constante.
 * "Data do fechamento" é uma `date` (YYYY-MM-DD), não um timestamp. Movimentos
 * usam timestamp com offset −04:00.
 */

/** Offset fixo de Manaus em relação ao UTC, em milissegundos (UTC−4). */
const OFFSET_MANAUS_MS = 4 * 60 * 60 * 1000;

function partesManaus(instante: Date): {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
} {
  const local = new Date(instante.getTime() - OFFSET_MANAUS_MS);
  return {
    ano: local.getUTCFullYear(),
    mes: local.getUTCMonth() + 1,
    dia: local.getUTCDate(),
    hora: local.getUTCHours(),
    minuto: local.getUTCMinutes(),
    segundo: local.getUTCSeconds(),
  };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Data local de Manaus no formato YYYY-MM-DD para um instante. */
export function dataManaus(instante: Date = new Date()): string {
  const { ano, mes, dia } = partesManaus(instante);
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

/** A data de hoje em Manaus (YYYY-MM-DD). Use como "data do fechamento". */
export function hojeManaus(): string {
  return dataManaus();
}

/** Timestamp ISO de Manaus com offset explícito −04:00. */
export function agoraManausISO(instante: Date = new Date()): string {
  const { hora, minuto, segundo } = partesManaus(instante);
  return `${dataManaus(instante)}T${pad2(hora)}:${pad2(minuto)}:${pad2(segundo)}-04:00`;
}

/** Competência mensal (YYYY-MM) de uma data YYYY-MM-DD ou de hoje. */
export function competenciaDe(data: string = hojeManaus()): string {
  return data.slice(0, 7);
}

/**
 * Limites de um dia de Manaus como timestamps ISO (com offset −04:00), no
 * intervalo semiaberto [início, fim). Útil para filtrar `data_hora` (timestamptz)
 * por "data do fechamento" (uma DATE).
 */
export function limitesDoDiaManaus(data: string): { inicio: string; fim: string } {
  const inicio = `${data}T00:00:00-04:00`;
  const proximo = new Date(inicio);
  proximo.setUTCDate(proximo.getUTCDate() + 1);
  return { inicio, fim: `${dataManaus(proximo)}T00:00:00-04:00` };
}

/**
 * Timestamp ISO de Manaus numa DATA específica (YYYY-MM-DD) com a HORA atual.
 * Para lançar um evento "no dia X" preservando uma ordem temporal razoável.
 */
export function agoraNaDataManaus(data: string = hojeManaus()): string {
  const { hora, minuto, segundo } = partesManaus(new Date());
  return `${data}T${pad2(hora)}:${pad2(minuto)}:${pad2(segundo)}-04:00`;
}

/** Formata data YYYY-MM-DD para DD/MM/YYYY. */
export function formatarDataBR(dataIso: string | null | undefined): string {
  if (!dataIso) return '';
  const partes = dataIso.split('-');
  if (partes.length !== 3) return dataIso;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}
