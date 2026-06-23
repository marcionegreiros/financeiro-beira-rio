/**
 * uuidv7 — IDs ordenáveis por tempo, gerados no cliente (§0 da spec).
 *
 * UUIDv7 é essencial para sincronização offline determinística: os eventos são
 * inseridos (append-only) e a ordenação por tempo cai "de graça" no próprio id.
 *
 * Layout (RFC 9562): 48 bits de timestamp Unix em ms, versão (7), 12 bits
 * aleatórios, variante (10), 62 bits aleatórios.
 */
export function uuidv7(): string {
  const timestampMs = BigInt(Date.now());
  const bytes = new Uint8Array(16);

  // 48 bits de timestamp (big-endian) em bytes[0..5].
  bytes[0] = Number((timestampMs >> 40n) & 0xffn);
  bytes[1] = Number((timestampMs >> 32n) & 0xffn);
  bytes[2] = Number((timestampMs >> 24n) & 0xffn);
  bytes[3] = Number((timestampMs >> 16n) & 0xffn);
  bytes[4] = Number((timestampMs >> 8n) & 0xffn);
  bytes[5] = Number(timestampMs & 0xffn);

  // 10 bytes aleatórios para o restante.
  const aleatorios = new Uint8Array(10);
  crypto.getRandomValues(aleatorios);
  bytes.set(aleatorios, 6);

  // Versão 7 no nibble alto do byte 6.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // Variante RFC 4122 (10xx) nos bits altos do byte 8.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
