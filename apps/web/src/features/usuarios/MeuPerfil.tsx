import { useState, type FormEvent } from 'react';
import { atualizarPerfil, uploadFoto } from '../../data/usuarios-admin';
import type { UsuarioAtual } from '../../data/usuario';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import { Avatar } from '../../components/ui/Avatar';

/**
 * "Meu perfil" — qualquer usuário troca a PRÓPRIA foto e nome (RLS permite a
 * própria linha; o storage permite a própria pasta). Não mexe em permissões.
 */
export function MeuPerfil({
  usuario,
  aberto,
  aoFechar,
  aoAtualizar,
}: {
  usuario: UsuarioAtual;
  aberto: boolean;
  aoFechar: () => void;
  aoAtualizar: (campos: { nome: string; fotoUrl: string | null }) => void;
}) {
  const toast = useToast();
  const [nome, setNome] = useState(usuario.nome);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(usuario.fotoUrl);
  const [salvando, setSalvando] = useState(false);

  function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFotoFile(f);
    setFotoPreview(URL.createObjectURL(f));
  }

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.erro('Informe o nome.');
      return;
    }
    setSalvando(true);
    try {
      await atualizarPerfil(usuario.id, { nome: nome.trim() });
      let fotoUrl = usuario.fotoUrl;
      if (fotoFile) fotoUrl = await uploadFoto(usuario.id, fotoFile);
      aoAtualizar({ nome: nome.trim(), fotoUrl });
      toast.sucesso('Perfil atualizado.');
      aoFechar();
    } catch (err) {
      console.error(err);
      toast.erro(err instanceof Error ? err.message : 'Erro ao salvar perfil.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Meu perfil" descricao="Troque sua foto e seu nome.">
      <form onSubmit={aoSalvar} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Avatar nome={nome || '?'} fotoUrl={fotoPreview} size="lg" />
          <label className="btn btn-suave cursor-pointer px-3 py-1.5 text-xs">
            Trocar foto
            <input type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
          </label>
        </div>
        <Campo label="Nome" obrigatorio>
          <input className={CLASSE_CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
