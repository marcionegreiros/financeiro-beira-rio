import { useState, useEffect, type ReactNode } from 'react';
import { Painel } from './painel/Painel';
import { Fechamento } from './fechamento/Fechamento';
import { sair } from '../data/sessao';
import type { UsuarioAtual } from '../data/usuario';

import { ProdutosCombustivel } from './catalogo/ProdutosCombustivel';
import { Configuracoes } from './catalogo/Configuracoes';
import { ContasETransferencias } from './financeiro/ContasETransferencias';
import { Despesas } from './financeiro/Despesas';
import { Socios } from './financeiro/Socios';
import { Fiado } from './financeiro/Fiado';
import { Folha } from './financeiro/Folha';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Auditoria } from './auditoria/Auditoria';
import { Usuarios } from './usuarios/Usuarios';
import { MeuPerfil } from './usuarios/MeuPerfil';
import { Avatar } from '../components/ui/Avatar';
import { verificarSistemaInicializado } from '../data/repositorios';
import { DiaZeroSetup } from './catalogo/DiaZeroSetup';

type Tela = 'painel' | 'fechamento' | 'produtos' | 'configuracoes' | 'transferencias' | 'despesas' | 'socios' | 'fiado' | 'folha' | 'auditoria' | 'usuarios';
export type Tema = 'light' | 'dark' | 'dark2' | 'system';

// Ícones vetoriais (traço fino, grade 24) para navegação — sem emojis.
const ICONES: Record<Tela | 'sair', (className: string) => ReactNode> = {
  painel: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
    </svg>
  ),
  fechamento: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  despesas: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  transferencias: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  socios: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  produtos: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h8M5 21V5a2 2 0 012-2h2a2 2 0 012 2v16M5 11h6m4-3l3 3v8a2 2 0 01-2 2 2 2 0 01-2-2v-3a1 1 0 00-1-1h-1m4-4V6a1 1 0 00-1-1" />
    </svg>
  ),
  configuracoes: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  fiado: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h2m4 0h4M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
    </svg>
  ),
  folha: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 01-3 3" />
    </svg>
  ),
  auditoria: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  usuarios: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  sair: (className) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
};

const ICONE_MENU = (className: string) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
const ICONE_FECHAR = (className: string) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const ICONE_EDITAR = (className: string) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);



export function Shell({ usuario }: { usuario: UsuarioAtual }) {
  const isOnline = useOnlineStatus();
  const [sistemaInicializado, setSistemaInicializado] = useState<boolean | null>(null);
  const [iniciandoDiaZero, setIniciandoDiaZero] = useState(false);
  const [tela, setTela] = useState<Tela>('painel');
  const [menuAbertoMobile, setMenuAbertoMobile] = useState(false);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [menuUsuarioAberto, setMenuUsuarioAberto] = useState(false);

  // Foto/nome exibidos: começam do usuário carregado e atualizam ao editar o
  // próprio perfil (sem precisar recarregar a sessão inteira).
  const [nomeExibido, setNomeExibido] = useState(usuario.nome);
  const [fotoExibida, setFotoExibida] = useState<string | null>(usuario.fotoUrl);

  // Tema inicial do localStorage ou padrão dark2
  const [theme, setThemeState] = useState<Tema>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pontao_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'dark2' || saved === 'system') {
        return saved as Tema;
      }
    }
    return 'dark2';
  });

  const alterarTema = (novoTema: Tema) => {
    setThemeState(novoTema);
    localStorage.setItem('pontao_theme', novoTema);
    const isDark =
      novoTema === 'dark' ||
      novoTema === 'dark2' ||
      (novoTema === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('dark2', novoTema === 'dark2');
  };

  // Efeito para monitorar tema do sistema se "system" estiver ativo
  useEffect(() => {
    if (theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const escutador = () => {
      const isDark = mediaQuery.matches;
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('dark2', false);
    };

    document.documentElement.classList.toggle('dark', mediaQuery.matches);
    document.documentElement.classList.toggle('dark2', false);

    mediaQuery.addEventListener('change', escutador);
    return () => mediaQuery.removeEventListener('change', escutador);
  }, [theme]);

  // Trava o scroll do corpo enquanto o drawer mobile está aberto
  useEffect(() => {
    document.body.style.overflow = menuAbertoMobile ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuAbertoMobile]);

  useEffect(() => {
    verificarSistemaInicializado()
      .then(setSistemaInicializado)
      .catch((err) => {
        console.error(err);
        setSistemaInicializado(false);
      });
  }, []);

  const podeFechar = usuario.permissoes.has('fechar_caixa');
  const podeVerPainel =
    usuario.permissoes.has('ver_painel_operacional') || usuario.permissoes.has('ver_capital');
  const podeCadastrarProduto = usuario.permissoes.has('cadastrar_produto');
  // A tela de Produtos abre para quem cadastra produto OU só ajusta preço/custo
  // (vendedor) — a própria tela esconde as ações que cada um não pode (§5.6).
  // "Produtos" no menu reúne combustível (cargas/medições/config) e mercadorias
  // (cadastro/estoque) — abre para quem gerencia qualquer um dos dois OU só
  // ajusta preço/custo (vendedor); a própria tela esconde o que cada um não pode.
  const podeVerProdutos =
    podeCadastrarProduto ||
    usuario.permissoes.has('definir_preco_custo') ||
    usuario.permissoes.has('gerenciar_combustivel');
  const podeGerenciarContas = usuario.permissoes.has('gerenciar_contas');
  const podeEditarConfig = usuario.permissoes.has('editar_configuracoes');

  const podeTransferir = usuario.permissoes.has('transferir_entre_contas');
  const podeLancarDespesa = usuario.permissoes.has('lancar_despesa');
  const podeGerenciarSocios = usuario.permissoes.has('gerenciar_socios');
  const podeGerenciarFiado = usuario.permissoes.has('gerenciar_fiado');
  const podeGerenciarFuncionarios = usuario.permissoes.has('gerenciar_funcionarios');
  const podeVerAuditoria = usuario.permissoes.has('ver_auditoria');
  const podeGerenciarUsuarios = usuario.permissoes.has('gerenciar_permissoes');

  const itensNav = [
    podeVerPainel && { id: 'painel' as Tela, label: 'Painel' },
    podeFechar && { id: 'fechamento' as Tela, label: 'Fechar caixa' },
    podeLancarDespesa && { id: 'despesas' as Tela, label: 'Saídas' },
    (podeTransferir || podeGerenciarContas) && {
      id: 'transferencias' as Tela,
      label: 'Contas & transferências',
    },
    podeGerenciarSocios && { id: 'socios' as Tela, label: 'Sócios' },
    podeGerenciarFiado && { id: 'fiado' as Tela, label: 'Fiado' },
    podeGerenciarFuncionarios && { id: 'folha' as Tela, label: 'Folha' },
    podeVerProdutos && { id: 'produtos' as Tela, label: 'Produtos' },
    podeEditarConfig && { id: 'configuracoes' as Tela, label: 'Configurações' },
    podeGerenciarUsuarios && { id: 'usuarios' as Tela, label: 'Usuários' },
    podeVerAuditoria && { id: 'auditoria' as Tela, label: 'Auditoria' },
  ].filter((item): item is { id: Tela; label: string } => !!item);

  // Cargo exibido: o cadastrado pelo gerente; senão deduzido das permissões.
  const isGerente = usuario.permissoes.has('ver_capital');
  const cargo = usuario.cargo ?? (isGerente ? 'Gerente' : 'Operador');

  const selecionar = (id: Tela) => {
    setTela(id);
    setMenuAbertoMobile(false);
  };

  const navLista = (
    <nav className="space-y-1">
      {itensNav.map((item) => (
        <ItemNavSidebar
          key={item.id}
          ativo={tela === item.id}
          aoClicar={() => selecionar(item.id)}
          icone={ICONES[item.id]('h-[18px] w-[18px] shrink-0')}
        >
          {item.label}
        </ItemNavSidebar>
      ))}
    </nav>
  );

  if (sistemaInicializado === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-fundo text-suave">
        <p className="text-sm font-semibold animate-pulse">Verificando inicialização do sistema...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* ───────── Sidebar desktop ───────── */}
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 select-none flex-col border-r border-sidebar-borda bg-sidebar text-sidebar-texto md:flex print:hidden">
        {/* Marca */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-borda px-5">
          <Logo />
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold tracking-tight text-sidebar-texto">Pontão</p>
            <p className="text-[11px] font-medium text-sidebar-suave">Beira Rio</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-6">{navLista}</div>

        {/* Rodapé */}
        <div className="relative border-t border-sidebar-borda p-3">
          {menuUsuarioAberto && (
            <>
              <button
                type="button"
                onClick={() => setMenuUsuarioAberto(false)}
                className="fixed inset-0 z-40 cursor-default bg-transparent"
              />
              <div className="absolute bottom-[76px] left-3 right-3 z-50 rounded-xl border border-sidebar-borda bg-sidebar-elevado p-3 shadow-xl animar-surgir flex flex-col gap-1">
                {/* Header: Nome, email e cargo */}
                <div className="px-2 py-1.5 leading-tight">
                  <p className="font-bold text-claro text-sm">{nomeExibido}</p>
                  <p className="text-[11px] text-suave mt-0.5 truncate">{usuario.email || '—'}</p>
                  <span className="mt-1.5 inline-flex items-center rounded-full bg-sidebar-hover px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sidebar-suave">
                    {cargo}
                  </span>
                </div>
                <div className="h-px bg-sidebar-borda my-1.5" />
                
                {/* Opções */}
                <button
                  type="button"
                  onClick={() => {
                    setPerfilAberto(true);
                    setMenuUsuarioAberto(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-sidebar-texto transition-colors hover:bg-sidebar-hover"
                >
                  {ICONE_EDITAR('h-4 w-4 text-suave shrink-0')}
                  Editar meu perfil
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuUsuarioAberto(false);
                    void sair();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-negativo transition-colors hover:bg-negativo/15"
                >
                  {ICONES.sair('h-4 w-4 shrink-0')}
                  Sair da conta
                </button>
              </div>
            </>
          )}

          <BadgeUsuario
            nome={nomeExibido}
            foto={fotoExibida}
            cargo={cargo}
            isOnline={isOnline}
            aoClicar={() => setMenuUsuarioAberto((v) => !v)}
          />
        </div>
      </aside>

      {/* ───────── Topbar mobile ───────── */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-sidebar-borda bg-sidebar px-4 text-sidebar-texto md:hidden print:hidden">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-base font-bold tracking-tight">Pontão Beira Rio</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${isOnline ? 'bg-positivo' : 'bg-atencao'}`}
            title={isOnline ? 'Online' : 'Offline'}
          />
          <button
            type="button"
            onClick={() => setMenuAbertoMobile((v) => !v)}
            aria-label={menuAbertoMobile ? 'Fechar menu' : 'Abrir menu'}
            className="-mr-1 rounded-lg p-2 text-sidebar-texto transition-colors hover:bg-sidebar-hover"
          >
            {menuAbertoMobile ? ICONE_FECHAR('h-6 w-6') : ICONE_MENU('h-6 w-6')}
          </button>
        </div>
      </header>

      {/* Drawer mobile sobreposto */}
      {menuAbertoMobile && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMenuAbertoMobile(false)}
            className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm"
          />
          <div className="animar-lateral absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-sidebar-borda bg-sidebar text-sidebar-texto shadow-2xl">
            <div className="flex-1 overflow-y-auto px-3 py-6">{navLista}</div>
            <div className="relative border-t border-sidebar-borda p-3">
              {menuUsuarioAberto && (
                <>
                  <button
                    type="button"
                    onClick={() => setMenuUsuarioAberto(false)}
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                  />
                  <div className="absolute bottom-[76px] left-3 right-3 z-50 rounded-xl border border-sidebar-borda bg-sidebar-elevado p-3 shadow-xl animar-surgir flex flex-col gap-1">
                    {/* Header: Nome, email e cargo */}
                    <div className="px-2 py-1.5 leading-tight">
                      <p className="font-bold text-claro text-sm">{nomeExibido}</p>
                      <p className="text-[11px] text-suave mt-0.5 truncate">{usuario.email || '—'}</p>
                      <span className="mt-1.5 inline-flex items-center rounded-full bg-sidebar-hover px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sidebar-suave">
                        {cargo}
                      </span>
                    </div>
                    <div className="h-px bg-sidebar-borda my-1.5" />
                    
                    {/* Opções */}
                    <button
                      type="button"
                      onClick={() => {
                        setPerfilAberto(true);
                        setMenuUsuarioAberto(false);
                        setMenuAbertoMobile(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-sidebar-texto transition-colors hover:bg-sidebar-hover"
                    >
                      {ICONE_EDITAR('h-4 w-4 text-suave shrink-0')}
                      Editar meu perfil
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuUsuarioAberto(false);
                        setMenuAbertoMobile(false);
                        void sair();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-negativo transition-colors hover:bg-negativo/15"
                    >
                      {ICONES.sair('h-4 w-4 shrink-0')}
                      Sair da conta
                    </button>
                  </div>
                </>
              )}

              <BadgeUsuario
                nome={nomeExibido}
                foto={fotoExibida}
                cargo={cargo}
                isOnline={isOnline}
                aoClicar={() => setMenuUsuarioAberto((v) => !v)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ───────── Conteúdo principal ───────── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10">
        <div key={tela} className="animar-surgir mx-auto w-full max-w-6xl">
          {!sistemaInicializado ? (
            !iniciandoDiaZero ? (
              <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-ambar/10 text-ambar ring-1 ring-ambar/30 shadow-xl">
                  <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-3xl font-display font-bold text-claro mb-4">Bem-vindo ao Pontão Beira Rio</h2>
                <p className="text-suave mb-8 max-w-lg leading-relaxed">
                  O sistema ainda não foi inicializado. Para começar a operar, lançar vendas e gerenciar o caixa, 
                  é necessário configurar o "Dia Zero" com os saldos e estoques iniciais.
                </p>
                <button onClick={() => setIniciandoDiaZero(true)} className="btn btn-primario px-8 py-3 text-sm font-bold shadow-lg shadow-ambar/20">
                  Iniciar Configuração do Dia Zero
                </button>
              </div>
            ) : (
              <DiaZeroSetup usuarioId={usuario.id} aoConcluir={() => { setSistemaInicializado(true); setIniciandoDiaZero(false); }} />
            )
          ) : (
            <>
              {tela === 'painel' && podeVerPainel && <Painel usuario={usuario} />}
              {tela === 'fechamento' && podeFechar && (
                <Fechamento
                  usuarioId={usuario.id}
                  usuarioNome={usuario.nome}
                  usuarioFotoUrl={usuario.fotoUrl}
                  podeReabrir={usuario.permissoes.has('reabrir_fechamento')}
                />
              )}
              {tela === 'despesas' && podeLancarDespesa && <Despesas usuario={usuario} />}
              {tela === 'transferencias' && (podeTransferir || podeGerenciarContas) && (
                <ContasETransferencias
                  usuario={usuario}
                  podeTransferir={podeTransferir}
                  podeGerenciarContas={podeGerenciarContas}
                />
              )}
              {tela === 'socios' && podeGerenciarSocios && <Socios usuarioId={usuario.id} />}
              {tela === 'fiado' && podeGerenciarFiado && <Fiado usuarioId={usuario.id} />}
              {tela === 'folha' && podeGerenciarFuncionarios && <Folha usuarioId={usuario.id} />}
              {tela === 'produtos' && podeVerProdutos && <ProdutosCombustivel usuario={usuario} />}
              {tela === 'configuracoes' && podeEditarConfig && (
                <Configuracoes tema={theme} aoTrocarTema={alterarTema} />
              )}
              {tela === 'usuarios' && podeGerenciarUsuarios && <Usuarios usuario={usuario} />}
              {tela === 'auditoria' && podeVerAuditoria && <Auditoria />}
            </>
          )}
        </div>
      </main>

      <MeuPerfil
        usuario={usuario}
        aberto={perfilAberto}
        aoFechar={() => setPerfilAberto(false)}
        aoAtualizar={({ nome, fotoUrl }) => {
          setNomeExibido(nome);
          setFotoExibida(fotoUrl);
        }}
      />
    </div>
  );
}

function Logo() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-acento to-[color-mix(in_srgb,var(--color-sidebar-acento)_60%,#000)] font-display text-base font-extrabold text-white shadow-lg shadow-black/30 ring-1 ring-white/10">
      P
    </div>
  );
}

function BadgeUsuario({
  nome,
  foto,
  cargo,
  isOnline,
  aoClicar,
}: {
  nome: string;
  foto: string | null;
  cargo: string;
  isOnline: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      title="Meu perfil"
      className="flex w-full items-center gap-3 rounded-xl border border-sidebar-borda bg-sidebar-elevado px-2.5 py-2 text-left transition-colors hover:bg-sidebar-hover"
    >
      <div className="relative shrink-0">
        <Avatar nome={nome} fotoUrl={foto} size="md" />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-sidebar-elevado ${isOnline ? 'bg-positivo' : 'bg-atencao'}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-sidebar-texto">{nome}</p>
        <span className="mt-0.5 inline-flex items-center rounded-full bg-sidebar-hover px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sidebar-suave">
          {cargo}
        </span>
      </div>
    </button>
  );
}



function ItemNavSidebar({
  ativo,
  aoClicar,
  icone,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  icone: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`group relative flex w-full items-center gap-3 rounded-lg py-2.5 pl-4 pr-3 text-left text-sm font-medium transition-all duration-200 ${
        ativo
          ? 'bg-sidebar-ativo text-sidebar-texto'
          : 'text-sidebar-suave hover:bg-sidebar-hover hover:text-sidebar-texto'
      }`}
    >
      {/* Barra indicadora de seleção */}
      <span
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-acento transition-all duration-200 ${
          ativo
            ? 'scale-y-100 opacity-100 shadow-[0_0_12px_0_var(--color-sidebar-acento)]'
            : 'scale-y-0 opacity-0'
        }`}
      />
      <span className={`transition-colors duration-200 ${ativo ? 'text-sidebar-acento' : 'text-sidebar-suave group-hover:text-sidebar-texto'}`}>
        {icone}
      </span>
      {children}
    </button>
  );
}
