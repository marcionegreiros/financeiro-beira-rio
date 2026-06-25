import { useEffect, useState, type FormEvent } from 'react';
import {
  listarUsuarios,
  listarPermissoesCatalogo,
  listarModelos,
  criarUsuario,
  redefinirSenha,
  setAtivo,
  atualizarPerfil,
  salvarPermissoes,
  salvarContasAcesso,
  uploadFoto,
  type UsuarioAdmin,
  type PermissaoCatalogo,
  type ModeloPermissao,
} from '../../data/usuarios-admin';
import { listarContasCompletas, type ContaCompleta } from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import type { UsuarioAtual } from '../../data/usuario';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { PageHeader } from '../../components/ui/PageHeader';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import { Avatar } from '../../components/ui/Avatar';

type NivelConta = '' | 'ver' | 'movimentar';

export function Usuarios({ usuario }: { usuario: UsuarioAtual }) {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [catalogo, setCatalogo] = useState<PermissaoCatalogo[]>([]);
  const [modelos, setModelos] = useState<ModeloPermissao[]>([]);
  const [contas, setContas] = useState<ContaCompleta[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Modal de edição/criação. `null` fechado; senão o alvo (novo = id em branco).
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);
  const [ehNovo, setEhNovo] = useState(false);

  // Formulário
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [cargo, setCargo] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [contasSel, setContasSel] = useState<Map<string, NivelConta>>(new Map());
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function recarregar() {
    setUsuarios(await listarUsuarios());
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [u, p, m, c] = await Promise.all([
          listarUsuarios(),
          listarPermissoesCatalogo(),
          listarModelos(),
          listarContasCompletas(),
        ]);
        if (!ativo) return;
        setUsuarios(u);
        setCatalogo(p.sort((a, b) => a.chave.localeCompare(b.chave)));
        setModelos(m);
        setContas(c.filter((x) => x.ativo));
      } catch (e) {
        console.error(e);
        if (ativo) toast.erro('Falha ao carregar usuários.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [toast]);

  function abrirNovo() {
    setEhNovo(true);
    setEditando(null);
    setNome('');
    setEmail('');
    setSenha('');
    setCargo('');
    setPerms(new Set());
    setContasSel(new Map());
    setFotoFile(null);
    setFotoPreview(null);
  }

  function abrirEdicao(u: UsuarioAdmin) {
    setEhNovo(false);
    setEditando(u);
    setNome(u.nome);
    setEmail(u.email);
    setSenha('');
    setCargo(u.cargo ?? '');
    setPerms(new Set(u.permissoes));
    setContasSel(new Map(Array.from(u.contas.entries()) as [string, NivelConta][]));
    setFotoFile(null);
    setFotoPreview(u.fotoUrl);
  }

  function fechar() {
    setEditando(null);
    setEhNovo(false);
  }

  function aplicarModelo(modeloNome: string) {
    setCargo(modeloNome);
    const modelo = modelos.find((m) => m.nome === modeloNome);
    if (!modelo) return; // "Personalizado": mantém as escolhas atuais.
    setPerms(new Set(modelo.permissoes));

    // ACL padrão: um modelo SEM acesso global a contas (vendedor) já começa
    // podendo MOVIMENTAR o caixa principal em dinheiro. Modelos com acesso
    // global (gerente) usam as permissões globais — ACL fica vazia.
    const temAcessoGlobalContas =
      modelo.permissoes.has('transferir_entre_contas') || modelo.permissoes.has('gerenciar_contas');
    if (temAcessoGlobalContas) {
      setContasSel(new Map());
      return;
    }
    const dinheiro = contas.filter((c) => c.tipo === 'dinheiro');
    const principal = dinheiro.find((c) => /caixa/i.test(c.nome)) ?? dinheiro[0];
    setContasSel(principal ? new Map([[principal.id, 'movimentar' as NivelConta]]) : new Map());
  }

  function alternarPerm(chave: string) {
    setPerms((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  function definirNivelConta(contaId: string, nivel: NivelConta) {
    setContasSel((atual) => {
      const novo = new Map(atual);
      if (nivel === '') novo.delete(contaId);
      else novo.set(contaId, nivel);
      return novo;
    });
  }

  function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFotoFile(f);
    setFotoPreview(URL.createObjectURL(f));
  }

  const contasParaSalvar = () =>
    Array.from(contasSel.entries())
      .filter(([, n]) => n !== '')
      .map(([conta_id, n]) => ({ conta_id, nivel: n as 'ver' | 'movimentar' }));

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.erro('Informe o nome.');
      return;
    }
    if (ehNovo && (!email.trim() || senha.length < 6)) {
      toast.erro('E-mail e senha (≥ 6 caracteres) são obrigatórios.');
      return;
    }
    setSalvando(true);
    try {
      if (ehNovo) {
        const id = uuidv7();
        await criarUsuario({
          id,
          email: email.trim(),
          senha,
          nome: nome.trim(),
          cargo: cargo || null,
          permissoes: Array.from(perms),
          contas: contasParaSalvar(),
        });
        if (fotoFile) await uploadFoto(id, fotoFile);
        toast.sucesso('Usuário criado.');
      } else if (editando) {
        await atualizarPerfil(editando.id, { nome: nome.trim(), cargo: cargo || null });
        // Ninguém altera as PRÓPRIAS permissões/contas por aqui (evita o gerente
        // se rebaixar/trancar sem querer). Só mexe nas dos OUTROS.
        if (editando.id !== usuario.id) {
          await salvarPermissoes(editando.id, Array.from(perms));
          await salvarContasAcesso(editando.id, contasParaSalvar());
        }
        if (senha.length >= 6) await redefinirSenha(editando.id, senha);
        if (fotoFile) await uploadFoto(editando.id, fotoFile);
        toast.sucesso('Usuário atualizado.');
      }
      fechar();
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro(e instanceof Error ? e.message : 'Erro ao salvar usuário.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(u: UsuarioAdmin) {
    try {
      await setAtivo(u.id, !u.ativo);
      toast.sucesso(u.ativo ? 'Usuário desativado.' : 'Usuário reativado.');
      await recarregar();
    } catch (e) {
      console.error(e);
      toast.erro(e instanceof Error ? e.message : 'Erro ao alterar status.');
    }
  }

  const colunas: Coluna<UsuarioAdmin>[] = [
    {
      chave: 'nome',
      titulo: 'Usuário',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar nome={u.nome} fotoUrl={u.fotoUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-claro">{u.nome}</p>
            <p className="truncate text-xs text-suave">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      chave: 'cargo',
      titulo: 'Cargo',
      render: (u) => <span className="text-suave">{u.cargo ?? '—'}</span>,
    },
    {
      chave: 'permissoes',
      titulo: 'Permissões',
      alinhar: 'right',
      render: (u) => <span className="numeros text-suave">{u.permissoes.size}</span>,
    },
    {
      chave: 'status',
      titulo: 'Status',
      render: (u) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
            u.ativo ? 'bg-positivo/15 text-positivo' : 'bg-negativo/15 text-negativo'
          }`}
        >
          {u.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: '',
      alinhar: 'right',
      render: (u) => (
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-suave px-3 py-1.5 text-xs" onClick={() => abrirEdicao(u)}>
            Editar
          </button>
          {u.id !== usuario.id && (
            <button
              type="button"
              className="btn btn-suave px-3 py-1.5 text-xs"
              onClick={() => void alternarAtivo(u)}
            >
              {u.ativo ? 'Desativar' : 'Reativar'}
            </button>
          )}
        </div>
      ),
    },
  ];

  const modalAberto = ehNovo || editando !== null;
  // Editando a própria conta: não pode mexer nas próprias permissões/contas.
  const editandoSelf = !ehNovo && editando?.id === usuario.id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Usuários"
        subtitulo="Cadastro, cargos, permissões e acesso a contas"
        acao={
          <button type="button" onClick={abrirNovo} className="btn btn-primario px-4 py-2 text-sm">
            <IconePlus /> Novo usuário
          </button>
        }
      />

      <DataTable
        colunas={colunas}
        dados={usuarios}
        chaveLinha={(u) => u.id}
        carregando={carregando}
        vazio="Nenhum usuário cadastrado."
      />

      <Modal
        aberto={modalAberto}
        aoFechar={fechar}
        titulo={ehNovo ? 'Novo usuário' : `Editar — ${editando?.nome ?? ''}`}
        descricao="Cargo aplica um modelo de permissões; ajuste item a item depois."
        larguraMax="max-w-2xl"
      >
        <form onSubmit={aoSalvar} className="flex flex-col gap-5">
          {/* Identidade + foto */}
          <div className="flex items-center gap-4">
            <Avatar nome={nome || '?'} fotoUrl={fotoPreview} size="lg" />
            <div>
              <label className="btn btn-suave cursor-pointer px-3 py-1.5 text-xs">
                Trocar foto
                <input type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
              </label>
              <p className="mt-1 text-xs text-suave">JPG ou PNG, quadrada de preferência.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nome" obrigatorio>
              <input aria-label="Nome" className={CLASSE_CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Campo label="Cargo">
              <select aria-label="Cargo" className={CLASSE_CAMPO} value={cargo} onChange={(e) => aplicarModelo(e.target.value)}>
                <option value="">Personalizado</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.nome}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="E-mail" obrigatorio={ehNovo}>
              <input
                type="email"
                aria-label="E-mail"
                className={CLASSE_CAMPO}
                value={email}
                disabled={!ehNovo}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@pontao.com.br"
              />
            </Campo>
            <Campo label={ehNovo ? 'Senha inicial' : 'Nova senha (opcional)'} obrigatorio={ehNovo}>
              <input
                type="password"
                aria-label="Senha"
                className={CLASSE_CAMPO}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </Campo>
          </div>

          {/* Permissões */}
          <fieldset disabled={editandoSelf}>
            <legend className="mb-2 text-sm font-semibold text-claro">Permissões</legend>
            {editandoSelf && (
              <p className="mb-2 rounded-lg border border-borda bg-claro/[0.03] px-3 py-2 text-xs text-suave">
                Você não pode alterar as próprias permissões. Outro gerente faz isso, se necessário.
              </p>
            )}
            <div className={`grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-borda p-3 sm:grid-cols-2 ${editandoSelf ? 'opacity-60' : ''}`}>
              {catalogo.map((p) => {
                // Trava de segurança: o gerente não pode remover a PRÓPRIA
                // permissão de gestão (evita se trancar para fora).
                const travado =
                  !ehNovo && editando?.id === usuario.id && p.chave === 'gerenciar_permissoes';
                return (
                  <label
                    key={p.chave}
                    className={`flex items-start gap-2 rounded px-1.5 py-1 ${travado ? 'opacity-70' : 'cursor-pointer hover:bg-claro/[0.04]'}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={travado ? true : perms.has(p.chave)}
                      disabled={travado}
                      onChange={() => alternarPerm(p.chave)}
                    />
                    <span className="text-xs leading-tight">
                      <span className="font-medium text-claro">{p.chave}</span>
                      <span className="block text-suave">{p.descricao}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* ACL de contas */}
          <fieldset disabled={editandoSelf}>
            <legend className="mb-2 text-sm font-semibold text-claro">Acesso a contas</legend>
            <p className="mb-2 text-xs text-suave">
              Sem nada marcado, vale a permissão geral (transferir/gerenciar contas). Marque para
              restringir/conceder por conta.
            </p>
            <div className="flex flex-col gap-2 rounded-lg border border-borda p-3">
              {contas.length === 0 && <p className="text-xs text-suave">Nenhuma conta cadastrada.</p>}
              {contas.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-claro">
                    {c.nome} <span className="text-xs text-suave">({c.tipo})</span>
                  </span>
                  <select
                    aria-label={`Acesso à conta ${c.nome}`}
                    className={`${CLASSE_CAMPO} w-40`}
                    value={contasSel.get(c.id) ?? ''}
                    onChange={(e) => definirNivelConta(c.id, e.target.value as NivelConta)}
                  >
                    <option value="">Sem acesso explícito</option>
                    <option value="ver">Ver</option>
                    <option value="movimentar">Movimentar</option>
                  </select>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : ehNovo ? 'Criar usuário' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function IconePlus() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
