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
