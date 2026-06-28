import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import { autorizarAcaoGerente } from '../../data/usuario';
import { useToast } from '../../components/ui/Toast';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  permissaoRequerida?: string;
  aoAutorizado: (client: SupabaseClient, managerUsuarioId: string) => void;
}

export function AutorizacaoGerenteModal({
  aberto,
  aoFechar,
  permissaoRequerida = 'editar_lancamentos_retroativos',
  aoAutorizado,
}: Props) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verificando, setVerificando] = useState(false);

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    if (!email || !senha) {
      toast.erro('Preencha o e-mail e a senha.');
      return;
    }

    setVerificando(true);
    try {
      const res = await autorizarAcaoGerente(email, senha, permissaoRequerida);
      if (res.sucesso && res.client && res.usuarioId) {
        toast.sucesso('Autorizado com sucesso.');
        aoAutorizado(res.client, res.usuarioId);
        aoFechar();
        setEmail('');
        setSenha('');
      } else {
        toast.erro(res.erro || 'Falha ao autorizar.');
      }
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao verificar autorização.');
    } finally {
      setVerificando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Autorização de Gerente"
      descricao="Esta operação exige privilégios de gerente devido ao dia de caixa estar fechado."
      larguraMax="max-w-md"
    >
      <form onSubmit={aoSubmeter} className="flex flex-col gap-4">
        <p className="text-xs text-suave">
          Para prosseguir, insira o e-mail e senha de um gerente ou dono que possua a permissão:
          <span className="ml-1 rounded bg-suave/10 px-1 py-0.5 font-mono text-claro">
            {permissaoRequerida}
          </span>
        </p>

        <Campo label="E-mail do gerente" obrigatorio>
          <input
            type="email"
            className={CLASSE_CAMPO}
            placeholder="gerente@pontao.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={verificando}
            autoFocus
          />
        </Campo>

        <Campo label="Senha" obrigatorio>
          <input
            type="password"
            className={CLASSE_CAMPO}
            placeholder="••••••••"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={verificando}
          />
        </Campo>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-suave px-4 py-2 text-sm"
            onClick={aoFechar}
            disabled={verificando}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={verificando}
            className="btn btn-primario px-4 py-2 text-sm"
          >
            {verificando ? 'Verificando…' : 'Confirmar e Executar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
