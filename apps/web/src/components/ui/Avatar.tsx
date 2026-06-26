/**
 * Avatar redondo do usuário — foto (bucket `avatares`) com fallback para a
 * inicial do nome. Usado no Shell, na tela de Usuários e como ícone discreto
 * na Auditoria ("quem fez").
 */

type Tamanho = 'xs' | 'sm' | 'md' | 'lg';

const DIMENSOES: Record<Tamanho, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-20 w-20 text-2xl',
};

interface Props {
  nome: string;
  fotoUrl?: string | null | undefined;
  size?: Tamanho;
  /** Classe extra (ex.: ring custom no sidebar). */
  className?: string;
}

export function Avatar({ nome, fotoUrl, size = 'md', className = '' }: Props) {
  const dim = DIMENSOES[size];
  const inicial = (nome?.trim().charAt(0) || '?').toUpperCase();

  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={nome}
        title={nome}
        className={`${dim} shrink-0 rounded-full object-cover ring-1 ring-borda ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${dim} inline-flex shrink-0 items-center justify-center rounded-full bg-claro/10 font-semibold text-claro ring-1 ring-borda ${className}`}
      title={nome}
    >
      {inicial}
    </span>
  );
}
