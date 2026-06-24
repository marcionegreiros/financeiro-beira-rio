/**
 * formato — helpers de exibição (data/hora) na borda da UI, sempre em
 * America/Manaus. Não fazem aritmética: só formatam para o usuário.
 */

/** Timestamp ISO → "DD/MM/AAAA HH:mm" em Manaus. */
export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Manaus',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Timestamp ISO → dia local de Manaus (YYYY-MM-DD), para comparar períodos. */
export function diaIso(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });
}
