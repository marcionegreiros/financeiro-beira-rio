import { useState, useEffect, type FormEvent } from 'react';
import {
  listarTanquesConfig,
  listarCombustiveis,
  salvarCombustivel,
  salvarTanque,
  listarBombasTanque,
  salvarBomba,
  listarEntradasCombustivel,
  adicionarEntradaCombustivel,
  listarMedicoesTanque,
  adicionarMedicaoTanque,
  listarPrecosCombustivel,
  adicionarPrecoCombustivel,
  listarCustosCombustivel,
  adicionarCustoCombustivel,
  removerPrecoCombustivel,
  removerCustoCombustivel,
  removerEntradaCombustivel,
  verificarFechamentoStatus,
  removerTanque,
  removerBomba,
  removerCombustivel,
  type TanqueConfig,
  type Combustivel,
  type BombaConfig,
  type EntradaCombustivel,
  type MedicaoTanque,
  type VigenciaCombustivel,
  temFechamentoOperacional,
  definirLeituraInicialBomba,
  buscarLeituraInicialBomba,
} from '../../data/repositorios';
import { uuidv7 } from '../../lib/uuidv7';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { DataTable, type Coluna } from '../../components/ui/DataTable';
import { Campo, CLASSE_CAMPO } from '../../components/ui/Campo';
import { hojeManaus, formatarDataBR } from '../../lib/datas';
import { parseReais, formatReais, asCentavos } from '../../lib/money';
import { asMililitros, formatLitros } from '../../domain/tipos';
import type { UsuarioAtual } from '../../data/usuario';

/** Litros (possivelmente fracionário, formato BR) → number. Espelha litrosParaMililitros. */
function parseLitros(s: string): number {
  const n = Number(s.trim().replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? NaN : n;
}

/** Formata um number em litros para exibição BR: 1500.5 → "1.500,5 L". */
function fmtLitrosNum(litros: number): string {
  return `${litros.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} L`;
}

interface CombustivelProps {
  usuario?: UsuarioAtual;
  dataSelecionada: string;
}

export function Combustivel({ usuario, dataSelecionada }: CombustivelProps) {
  const toast = useToast();
  const [tanques, setTanques] = useState<TanqueConfig[]>([]);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'ativos' | 'inativos' | 'todos'>('ativos');

  const podeGerenciar = usuario?.permissoes.has('gerenciar_combustivel') ?? true;
  const podeDefinirPrecoCusto = usuario?.permissoes.has('definir_preco_custo') ?? true;

  const [selecionado, setSelecionado] = useState<TanqueConfig | null>(null);

  // Modais
  const [modalAcoesAberto, setModalAcoesAberto] = useState(false);
  const [modalTanqueAberto, setModalTanqueAberto] = useState(false);
  const [editandoTanque, setEditandoTanque] = useState(false);
  const [modalEntradaAberto, setModalEntradaAberto] = useState(false);
  const [modalMedicaoAberto, setModalMedicaoAberto] = useState(false);
  const [modalPrecoAberto, setModalPrecoAberto] = useState(false);
  const [modalCustoAberto, setModalCustoAberto] = useState(false);
  const [modalBombasAberto, setModalBombasAberto] = useState(false);

  // Form: tanque
  const [nomeTanque, setNomeTanque] = useState('');
  const [combustivelId, setCombustivelId] = useState('');
  const [capacidadeStr, setCapacidadeStr] = useState('');
  const [alertaStr, setAlertaStr] = useState('');
  const [ativoTanque, setAtivoTanque] = useState(true);

  // Wizard unificado: criação rápida de combustível.
  const [modalNovoCombustivelAberto, setModalNovoCombustivelAberto] = useState(false);
  const [nomeNovoCombustivel, setNomeNovoCombustivel] = useState('');
  const [salvandoNovoCombustivel, setSalvandoNovoCombustivel] = useState(false);

  // Form: combustível (modal de gestão de combustíveis)
  const [nomeCombustivel, setNomeCombustivel] = useState('');
  const [modalCombustiveisAberto, setModalCombustiveisAberto] = useState(false);

  // Form: entrada de carga
  const [entradaLitrosStr, setEntradaLitrosStr] = useState('');
  const [entradaCustoStr, setEntradaCustoStr] = useState('');
  const [entradaData, setEntradaData] = useState('');
  const [entradasHistorico, setEntradasHistorico] = useState<EntradaCombustivel[]>([]);
  const [carregandoEntradas, setCarregandoEntradas] = useState(false);

  // Form: medição de régua
  const [medicaoLitrosStr, setMedicaoLitrosStr] = useState('');
  const [medicaoData, setMedicaoData] = useState('');
  const [medicaoHora, setMedicaoHora] = useState('');
  const [medicaoObs, setMedicaoObs] = useState('');
  const [medicoesHistorico, setMedicoesHistorico] = useState<MedicaoTanque[]>([]);
  const [carregandoMedicoes, setCarregandoMedicoes] = useState(false);

  // Form: preço / custo
  const [novoPrecoStr, setNovoPrecoStr] = useState('');
  const [precoDataVigencia, setPrecoDataVigencia] = useState('');
  const [precosHistorico, setPrecosHistorico] = useState<VigenciaCombustivel[]>([]);
  const [carregandoPrecos, setCarregandoPrecos] = useState(false);

  const [novoCustoStr, setNovoCustoStr] = useState('');
  const [custoDataVigencia, setCustoDataVigencia] = useState('');
  const [custoHoraVigencia, setCustoHoraVigencia] = useState('');
  const [custosHistorico, setCustosHistorico] = useState<VigenciaCombustivel[]>([]);
  const [carregandoCustos, setCarregandoCustos] = useState(false);

  // Form: bombas
  const [bombas, setBombas] = useState<BombaConfig[]>([]);
  const [carregandoBombas, setCarregandoBombas] = useState(false);
  const [novaBombaNome, setNovaBombaNome] = useState('');
  const [leituraInicial, setLeituraInicial] = useState('');
  const [bloquearDiaZero, setBloquearDiaZero] = useState(false);
  const [leiturasIniciais, setLeiturasIniciais] = useState<Record<string, number>>({});

  const [salvando, setSalvando] = useState(false);

  async function carregarTanques() {
    setCarregando(true);
    try {
      const [t, c] = await Promise.all([listarTanquesConfig(dataSelecionada), listarCombustiveis()]);
      setTanques(t);
      setCombustiveis(c);
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar tanques de combustível.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarTanques();
    temFechamentoOperacional().then(setBloquearDiaZero).catch(console.error);
  }, [dataSelecionada]);

  // ---- Aberturas de modal ----
  function abrirAcoes(t: TanqueConfig) {
    setSelecionado(t);
    setModalAcoesAberto(true);
  }

  function abrirNovoTanque() {
    setEditandoTanque(false);
    setNomeTanque('');
    setCombustivelId(combustiveis[0]?.id ?? '');
    setCapacidadeStr('');
    setAlertaStr('');
    setAtivoTanque(true);
    setModalTanqueAberto(true);
  }

  function abrirEditarTanque(t: TanqueConfig) {
    setEditandoTanque(true);
    setSelecionado(t);
    setNomeTanque(t.nome);
    setCombustivelId(t.combustivelId);
    setCapacidadeStr(fmtLitrosNum(Number(t.capacidade) / 1000).replace(' L', ''));
    setAlertaStr(fmtLitrosNum(Number(t.nivelAlerta) / 1000).replace(' L', ''));
    setAtivoTanque(t.ativo);
    setModalTanqueAberto(true);
  }

  function abrirCombustiveis() {
    setNomeCombustivel('');
    setModalCombustiveisAberto(true);
  }



  async function abrirEntrada(t: TanqueConfig) {
    setSelecionado(t);
    setEntradaLitrosStr('');
    setEntradaCustoStr('');
    setEntradaData(dataSelecionada);
    setModalEntradaAberto(true);
    setCarregandoEntradas(true);
    try {
      setEntradasHistorico(await listarEntradasCombustivel(t.id));
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar histórico de entradas.');
    } finally {
      setCarregandoEntradas(false);
    }
  }

  async function abrirMedicao(t: TanqueConfig) {
    setSelecionado(t);
    setMedicaoLitrosStr('');
    setMedicaoData(dataSelecionada);
    const agora = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setMedicaoHora(`${pad(agora.getHours())}:${pad(agora.getMinutes())}`);
    setMedicaoObs('');
    setModalMedicaoAberto(true);
    setCarregandoMedicoes(true);
    try {
      setMedicoesHistorico(await listarMedicoesTanque(t.id));
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar histórico de medições.');
    } finally {
      setCarregandoMedicoes(false);
    }
  }

  async function abrirPreco(t: TanqueConfig) {
    setSelecionado(t);
    setNovoPrecoStr('');
    setPrecoDataVigencia(dataSelecionada);
    setModalPrecoAberto(true);
    setCarregandoPrecos(true);
    try {
      setPrecosHistorico(await listarPrecosCombustivel(t.combustivelId));
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar histórico de preços.');
    } finally {
      setCarregandoPrecos(false);
    }
  }

  async function abrirCusto(t: TanqueConfig) {
    setSelecionado(t);
    setNovoCustoStr('');
    setCustoDataVigencia(dataSelecionada);
    const agora = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setCustoHoraVigencia(`${pad(agora.getHours())}:${pad(agora.getMinutes())}`);
    setModalCustoAberto(true);
    setCarregandoCustos(true);
    try {
      setCustosHistorico(await listarCustosCombustivel(t.combustivelId));
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar histórico de custos.');
    } finally {
      setCarregandoCustos(false);
    }
  }

  async function abrirBombas(t: TanqueConfig) {
    setSelecionado(t);
    setNovaBombaNome('');
    setLeituraInicial('');
    setModalBombasAberto(true);
    setCarregandoBombas(true);
    try {
      const lista = await listarBombasTanque(t.id);
      setBombas(lista);
      const mapaLeituras: Record<string, number> = {};
      await Promise.all(
        lista.map(async (b) => {
          const val = await buscarLeituraInicialBomba(b.id);
          if (val !== null) mapaLeituras[b.id] = val;
        })
      );
      setLeiturasIniciais(mapaLeituras);
    } catch (err) {
      console.error(err);
      toast.erro('Falha ao carregar bombas.');
    } finally {
      setCarregandoBombas(false);
    }
  }

  // ---- Submits ----
  async function aoSalvarTanque(e: FormEvent) {
    e.preventDefault();
    if (!nomeTanque.trim()) return toast.erro('Informe o nome do tanque.');
    if (!combustivelId) return toast.erro('Selecione o combustível (ou crie um em "+ Novo").');
    const capacidade = parseLitros(capacidadeStr);
    if (isNaN(capacidade) || capacidade <= 0) return toast.erro('Informe a capacidade em litros.');
    const alerta = alertaStr.trim() ? parseLitros(alertaStr) : 0;
    if (isNaN(alerta) || alerta < 0) return toast.erro('Nível de alerta inválido.');

    setSalvando(true);
    try {
      // 1) Tanque.
      const tanqueId = editandoTanque && selecionado ? selecionado.id : uuidv7();
      await salvarTanque({
        id: tanqueId,
        nome: nomeTanque.trim(),
        combustivelId,
        capacidadeLitros: capacidade,
        nivelAlertaLitros: alerta,
        ativo: ativoTanque,
      });

      toast.sucesso(editandoTanque ? 'Tanque atualizado.' : 'Tanque cadastrado.');
      setModalTanqueAberto(false);
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao salvar tanque.');
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Criação rápida de combustível pelo mini-modal aberto sobre o form do tanque.
   * Cria, recarrega a lista e já deixa selecionado — sem perder o que já foi
   * digitado no tanque (o modal do tanque continua montado por trás).
   */
  async function aoCriarCombustivelRapido(e: FormEvent) {
    e.preventDefault();
    if (!nomeNovoCombustivel.trim()) return toast.erro('Informe o nome do combustível.');
    setSalvandoNovoCombustivel(true);
    try {
      const novoId = uuidv7();
      await salvarCombustivel(novoId, nomeNovoCombustivel.trim());
      setCombustiveis(await listarCombustiveis());
      setCombustivelId(novoId);
      toast.sucesso('Combustível criado e selecionado.');
      setModalNovoCombustivelAberto(false);
      setNomeNovoCombustivel('');
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao criar combustível.');
    } finally {
      setSalvandoNovoCombustivel(false);
    }
  }

  async function aoExcluirTanque(t: TanqueConfig) {
    if (!confirm(`Excluir o tanque "${t.nome}" e seus bicos? Esta ação é definitiva.`)) return;
    try {
      await removerTanque(t.id);
      toast.sucesso('Tanque excluído.');
      setModalAcoesAberto(false);
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro(
        (err as Error)?.message === 'NAO_EXCLUIDO'
          ? 'Este tanque já foi usado (carga, medição ou leitura) — apenas inative-o.'
          : 'Erro ao excluir tanque.',
      );
    }
  }

  async function aoExcluirBomba(b: BombaConfig) {
    if (!confirm(`Excluir o bico "${b.nome}"? Esta ação é definitiva.`)) return;
    try {
      await removerBomba(b.id);
      toast.sucesso('Bico excluído.');
      setBombas((prev) => prev.filter((x) => x.id !== b.id));
    } catch (err) {
      console.error(err);
      toast.erro(
        (err as Error)?.message === 'NAO_EXCLUIDO'
          ? 'Este bico já tem leitura de encerrante — apenas inative-o.'
          : 'Erro ao excluir bico.',
      );
    }
  }

  async function aoExcluirCombustivel(c: Combustivel) {
    if (!confirm(`Excluir o combustível "${c.nome}"? Esta ação é definitiva.`)) return;
    try {
      await removerCombustivel(c.id);
      toast.sucesso('Combustível excluído.');
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro(
        (err as Error)?.message === 'NAO_EXCLUIDO'
          ? 'Este combustível está em uso por algum tanque — remova/realoque o tanque antes.'
          : 'Erro ao excluir combustível.',
      );
    }
  }

  async function aoSalvarCombustivel(e: FormEvent) {
    e.preventDefault();
    if (!nomeCombustivel.trim()) return toast.erro('Informe o nome do combustível.');
    setSalvando(true);
    try {
      await salvarCombustivel(uuidv7(), nomeCombustivel.trim());
      toast.sucesso('Combustível cadastrado.');
      setNomeCombustivel('');
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao cadastrar combustível.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoAdicionarEntrada(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    const litros = parseLitros(entradaLitrosStr);
    if (isNaN(litros) || litros <= 0) return toast.erro('Informe os litros da carga.');
    const custo = parseReais(entradaCustoStr);
    if (custo <= 0n) return toast.erro('Informe o custo por litro.');
    if (!entradaData) return toast.erro('Informe a data da entrada.');
    setSalvando(true);
    try {
      await adicionarEntradaCombustivel(uuidv7(), selecionado.id, litros, custo, entradaData);
      toast.sucesso('Entrada de combustível registrada.');
      setEntradaLitrosStr('');
      setEntradasHistorico(await listarEntradasCombustivel(selecionado.id));
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao registrar entrada.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoAdicionarMedicao(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    const litros = parseLitros(medicaoLitrosStr);
    if (isNaN(litros) || litros < 0) return toast.erro('Informe os litros medidos.');
    if (!medicaoData || !medicaoHora) return toast.erro('Informe data e hora da medição.');
    setSalvando(true);
    try {
      const dataHora = `${medicaoData}T${medicaoHora}:00-04:00`;
      await adicionarMedicaoTanque(uuidv7(), selecionado.id, litros, dataHora, medicaoObs);
      toast.sucesso('Medição registrada.');
      setMedicaoLitrosStr('');
      setMedicaoObs('');
      setMedicoesHistorico(await listarMedicoesTanque(selecionado.id));
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao registrar medição.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoAdicionarPreco(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    const valor = parseReais(novoPrecoStr);
    if (valor <= 0n) return toast.erro('Informe um preço de venda válido.');
    if (!precoDataVigencia) return toast.erro('Informe a data de vigência.');
    setSalvando(true);
    try {
      await adicionarPrecoCombustivel(uuidv7(), selecionado.combustivelId, valor, precoDataVigencia);
      toast.sucesso('Preço de venda adicionado.');
      setNovoPrecoStr('');
      setPrecosHistorico(await listarPrecosCombustivel(selecionado.combustivelId));
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao adicionar preço.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoAdicionarCusto(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    const valor = parseReais(novoCustoStr);
    if (valor <= 0n) return toast.erro('Informe um custo válido.');
    if (!custoDataVigencia || !custoHoraVigencia) return toast.erro('Informe data e hora da vigência.');
    setSalvando(true);
    try {
      const validoAPartirDe = `${custoDataVigencia}T${custoHoraVigencia}:00-04:00`;
      await adicionarCustoCombustivel(uuidv7(), selecionado.combustivelId, valor, validoAPartirDe);
      toast.sucesso('Custo adicionado.');
      setNovoCustoStr('');
      setCustosHistorico(await listarCustosCombustivel(selecionado.combustivelId));
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao adicionar custo.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoAdicionarBomba(e: FormEvent) {
    e.preventDefault();
    if (!selecionado) return;
    if (!novaBombaNome.trim()) return toast.erro('Informe o nome da bomba/bico.');
    setSalvando(true);
    try {
      const bombaId = uuidv7();
      await salvarBomba({ id: bombaId, tanqueId: selecionado.id, nome: novaBombaNome.trim(), ativo: true });

      if (!bloquearDiaZero && leituraInicial.trim() !== '') {
        const leitura = Number(leituraInicial.replace(',', '.'));
        if (!isNaN(leitura)) {
          await definirLeituraInicialBomba(bombaId, leitura);
          setLeiturasIniciais((prev) => ({ ...prev, [bombaId]: leitura }));
        }
      }

      toast.sucesso('Bomba adicionada.');
      setNovaBombaNome('');
      setLeituraInicial('');
      setBombas(await listarBombasTanque(selecionado.id));
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao adicionar bomba.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarBomba(b: BombaConfig) {
    try {
      await salvarBomba({ ...b, ativo: !b.ativo });
      setBombas((prev) => prev.map((x) => (x.id === b.id ? { ...x, ativo: !x.ativo } : x)));
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao atualizar bomba.');
    }
  }

  async function aoExcluirEntrada(e: EntradaCombustivel) {
    try {
      const status = await verificarFechamentoStatus(e.data);
      if (status === 'travado') {
        const podeExcluirRetroativo = usuario?.permissoes.has('editar_lancamentos_retroativos') ?? false;
        if (!podeExcluirRetroativo) {
          toast.erro('Esta entrada não pode ser excluída porque o caixa do dia ' + formatarDataBR(e.data) + ' já está encerrado. Solicite a um gerente.');
          return;
        }
        if (!confirm('O caixa do dia ' + formatarDataBR(e.data) + ' já foi encerrado. Como gerente, deseja prosseguir com a exclusão desta entrada de combustível? Isso recalculará a cascata dos saldos.')) {
          return;
        }
      } else {
        if (!confirm('Deseja realmente excluir esta entrada de combustível?')) {
          return;
        }
      }

      await removerEntradaCombustivel(e.id);
      toast.sucesso('Entrada de combustível excluída.');
      
      if (selecionado) {
        setEntradasHistorico(await listarEntradasCombustivel(selecionado.id));
      }
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao excluir entrada.');
    }
  }

  async function aoExcluirPreco(p: VigenciaCombustivel) {
    try {
      const status = await verificarFechamentoStatus(p.validoAPartirDe);
      if (status === 'travado') {
        const podeExcluirRetroativo = usuario?.permissoes.has('editar_lancamentos_retroativos') ?? false;
        if (!podeExcluirRetroativo) {
          toast.erro('Este preço não pode ser excluído porque o caixa do dia ' + formatarDataBR(p.validoAPartirDe) + ' já está encerrado. Solicite a um gerente.');
          return;
        }
        if (!confirm('O caixa do dia ' + formatarDataBR(p.validoAPartirDe) + ' já foi encerrado. Como gerente, deseja prosseguir com a exclusão do histórico de preço? Isso pode impactar relatórios retroativos.')) {
          return;
        }
      } else {
        if (!confirm('Deseja realmente excluir esta alteração de preço?')) {
          return;
        }
      }

      await removerPrecoCombustivel(p.id);
      toast.sucesso('Alteração de preço excluída.');

      if (selecionado) {
        setPrecosHistorico(await listarPrecosCombustivel(selecionado.combustivelId));
      }
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao excluir preço.');
    }
  }

  async function aoExcluirCusto(c: VigenciaCombustivel) {
    try {
      const dataItem = c.validoAPartirDe.split('T')[0]!;
      const status = await verificarFechamentoStatus(dataItem);
      if (status === 'travado') {
        const podeExcluirRetroativo = usuario?.permissoes.has('editar_lancamentos_retroativos') ?? false;
        if (!podeExcluirRetroativo) {
          toast.erro('Este custo não pode ser excluído porque o caixa do dia ' + formatarDataBR(dataItem) + ' já está encerrado. Solicite a um gerente.');
          return;
        }
        if (!confirm('O caixa do dia ' + formatarDataBR(dataItem) + ' já foi encerrado. Como gerente, deseja prosseguir com a exclusão do histórico de custo? Isso pode impactar relatórios retroativos.')) {
          return;
        }
      } else {
        if (!confirm('Deseja realmente excluir esta alteração de custo?')) {
          return;
        }
      }

      await removerCustoCombustivel(c.id);
      toast.sucesso('Alteração de custo excluída.');

      if (selecionado) {
        setCustosHistorico(await listarCustosCombustivel(selecionado.combustivelId));
      }
      await carregarTanques();
    } catch (err) {
      console.error(err);
      toast.erro('Erro ao excluir custo.');
    }
  }

  // Divergência ao vivo no modal de medição: medido − nível calculado atual.
  const divergenciaPrevista = (() => {
    if (!selecionado || !medicaoLitrosStr.trim()) return null;
    const litros = parseLitros(medicaoLitrosStr);
    if (isNaN(litros)) return null;
    const medidoMl = BigInt(Math.round(litros * 1000));
    return asMililitros(medidoMl - selecionado.nivel);
  })();

  const colunas: Coluna<TanqueConfig>[] = [
    {
      chave: 'nome',
      titulo: 'Tanque',
      render: (t) => (
        <div>
          <span className="font-semibold text-claro">{t.nome}</span>
          {t.bombas && t.bombas.length > 0 && (
            <span className="text-xs text-suave block mt-0.5 font-normal">
              ({t.bombas.join(', ')})
            </span>
          )}
        </div>
      ),
    },
    {
      chave: 'combustivel',
      titulo: 'Combustível',
      render: (t) => (
        <span className="inline-flex rounded-full bg-claro/[0.06] px-2 py-0.5 text-xs font-medium text-claro">
          {t.combustivelNome}
        </span>
      ),
    },
    {
      chave: 'nivel',
      titulo: 'Estoque',
      alinhar: 'right',
      render: (t) => {
        const abaixo = t.nivel <= t.nivelAlerta;
        const pct = t.capacidade > 0n ? Number((t.nivel * 100n) / t.capacidade) : 0;
        return (
          <span className={`numeros font-bold ${abaixo ? 'text-negativo' : 'text-positivo'}`}>
            {formatLitros(t.nivel)} <span className="text-suave font-normal">({pct}%)</span>
          </span>
        );
      },
    },
    {
      chave: 'capacidade',
      titulo: 'Capacidade',
      alinhar: 'right',
      render: (t) => <span className="numeros text-suave">{formatLitros(t.capacidade)}</span>,
    },
    {
      chave: 'preco',
      titulo: 'Preço venda',
      alinhar: 'right',
      render: (t) => (
        <span className="numeros text-claro">{t.precoVenda !== null ? formatReais(t.precoVenda) : '—'}</span>
      ),
    },
    {
      chave: 'custo',
      titulo: 'Custo',
      alinhar: 'right',
      render: (t) => (
        <span className="numeros text-suave">{t.custo !== null ? formatReais(t.custo) : '—'}</span>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      render: (t) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
            t.ativo ? 'bg-positivo/10 text-positivo' : 'bg-claro/10 text-claro/40'
          }`}
        >
          {t.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'right',
      render: (t) => (
        <button
          type="button"
          onClick={() => abrirAcoes(t)}
          className="rounded-lg p-2 text-suave bg-claro/5 hover:bg-ambar hover:text-sobreacento transition-all"
          title="Ações do tanque/combustível"
        >
          <IconeEditar />
        </button>
      ),
    },
  ];

  const tanquesFiltrados = tanques.filter((t) => {
    if (filtroStatus === 'ativos') return t.ativo;
    if (filtroStatus === 'inativos') return !t.ativo;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-borda/40">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-lg font-bold text-claro">Tanques & Combustíveis</h2>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as any)}
            className="rounded border border-borda bg-transparent px-2 py-1 text-xs text-suave focus:ring-ambar focus:border-ambar outline-none"
          >
            <option value="ativos" className="bg-ardosia">Apenas Ativos</option>
            <option value="inativos" className="bg-ardosia">Apenas Inativos</option>
            <option value="todos" className="bg-ardosia">Todos</option>
          </select>
        </div>
        {podeGerenciar && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={abrirCombustiveis} className="btn btn-suave px-4 py-2 text-sm">
              Combustíveis
            </button>
            <button type="button" onClick={abrirNovoTanque} className="btn btn-primario px-4 py-2 text-sm">
              <IconePlus /> Novo tanque
            </button>
          </div>
        )}
      </div>

      <DataTable
        colunas={colunas}
        dados={tanquesFiltrados}
        chaveLinha={(t) => t.id}
        carregando={carregando}
        vazio="Nenhum tanque cadastrado. Crie um combustível e depois um tanque."
      />

      {/* Modal: Novo/Editar tanque */}
      <Modal
        aberto={modalTanqueAberto}
        aoFechar={() => setModalTanqueAberto(false)}
        titulo={editandoTanque ? `Editar tanque: ${selecionado?.nome ?? ''}` : 'Novo tanque'}
        descricao={
          editandoTanque
            ? 'Capacidade e nível de alerta são informados em litros.'
            : 'Cadastre o tanque, o combustível e os bicos de uma vez só.'
        }
        larguraMax="max-w-xl"
      >
        <form onSubmit={aoSalvarTanque} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nome do tanque" obrigatorio>
              <input
                className={CLASSE_CAMPO}
                placeholder="Ex.: Tanque 1"
                value={nomeTanque}
                onChange={(e) => setNomeTanque(e.target.value)}
              />
            </Campo>
            <Campo label="Combustível" obrigatorio>
              <div className="flex gap-2">
                <select
                  aria-label="Combustível"
                  className={CLASSE_CAMPO}
                  value={combustivelId}
                  onChange={(e) => setCombustivelId(e.target.value)}
                >
                  <option value="" disabled>
                    {combustiveis.length === 0 ? 'Nenhum — clique em + Novo' : 'Selecione…'}
                  </option>
                  {combustiveis.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setNomeNovoCombustivel('');
                    setModalNovoCombustivelAberto(true);
                  }}
                  className="btn btn-suave px-3 py-2 text-sm whitespace-nowrap"
                >
                  + Novo
                </button>
              </div>
            </Campo>
            <Campo label="Capacidade (litros)" obrigatorio>
              <input
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="Ex.: 15000"
                value={capacidadeStr}
                onChange={(e) => setCapacidadeStr(e.target.value)}
              />
            </Campo>
            <Campo label="Nível de alerta (litros)" dica="Abaixo disso, alerta no painel">
              <input
                className={`${CLASSE_CAMPO} numeros text-right`}
                placeholder="Ex.: 2000"
                value={alertaStr}
                onChange={(e) => setAlertaStr(e.target.value)}
              />
            </Campo>
          </div>



          <label className="flex items-center gap-2 text-sm text-claro mt-2">
            <input
              type="checkbox"
              checked={ativoTanque}
              onChange={(e) => setAtivoTanque(e.target.checked)}
              className="rounded border-borda bg-transparent text-ambar focus:ring-ambar"
            />
            Tanque ativo
          </label>
          <div className="mt-4 flex justify-end gap-2 border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalTanqueAberto(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn btn-primario px-4 py-2 text-sm">
              {salvando ? 'Salvando…' : editandoTanque ? 'Salvar alterações' : 'Cadastrar tanque'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Mini-modal: criação rápida de combustível (abre sobre o form do tanque) */}
      <Modal
        aberto={modalNovoCombustivelAberto}
        aoFechar={() => setModalNovoCombustivelAberto(false)}
        titulo="Novo combustível"
        descricao="Cria o combustível e já seleciona no tanque. Você volta sem perder o que digitou."
        larguraMax="max-w-sm"
      >
        <form onSubmit={aoCriarCombustivelRapido} className="flex flex-col gap-4">
          <Campo label="Nome do combustível" obrigatorio>
            <input
              autoFocus
              className={CLASSE_CAMPO}
              placeholder="Ex.: Gasolina Comum, Diesel S10"
              value={nomeNovoCombustivel}
              onChange={(e) => setNomeNovoCombustivel(e.target.value)}
            />
          </Campo>
          <div className="mt-2 flex justify-end gap-2 border-t border-borda pt-4">
            <button
              type="button"
              className="btn btn-suave px-4 py-2 text-sm"
              onClick={() => setModalNovoCombustivelAberto(false)}
            >
              Cancelar
            </button>
            <button type="submit" disabled={salvandoNovoCombustivel} className="btn btn-primario px-4 py-2 text-sm">
              {salvandoNovoCombustivel ? 'Criando…' : 'Criar e selecionar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Gestão de combustíveis (listar / adicionar / excluir) */}
      <Modal
        aberto={modalCombustiveisAberto}
        aoFechar={() => setModalCombustiveisAberto(false)}
        titulo="Combustíveis"
        descricao="O preço e o custo são definidos por combustível e valem para todos os tanques que o usam. Só dá para excluir um combustível que não esteja em nenhum tanque."
        larguraMax="max-w-md"
      >
        <div className="flex flex-col gap-6">
          <form onSubmit={aoSalvarCombustivel} className="flex items-end gap-2 rounded-xl border border-borda bg-claro/[0.02] p-4">
            <Campo label="Novo combustível" obrigatorio>
              <input
                className={CLASSE_CAMPO}
                placeholder="Ex.: Gasolina Comum, Diesel S10"
                value={nomeCombustivel}
                onChange={(e) => setNomeCombustivel(e.target.value)}
              />
            </Campo>
            <button type="submit" disabled={salvando} className="btn btn-primario py-2 px-4 text-sm">
              {salvando ? '…' : 'Adicionar'}
            </button>
          </form>

          {combustiveis.length === 0 ? (
            <div className="text-center text-xs text-suave py-4">Nenhum combustível cadastrado.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {combustiveis.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-borda px-3 py-2">
                  <span className="text-sm font-medium text-claro">{c.nome}</span>
                  <button
                    type="button"
                    onClick={() => void aoExcluirCombustivel(c)}
                    className="text-negativo hover:text-negativo/80 p-1"
                    title="Excluir combustível"
                  >
                    <IconeLixeira />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalCombustiveisAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Entrada de carga */}
      <Modal
        aberto={modalEntradaAberto}
        aoFechar={() => setModalEntradaAberto(false)}
        titulo={`Entrada de carga: ${selecionado?.nome ?? ''}`}
        descricao="Registra a chegada de combustível. Aumenta o nível do tanque (não é venda)."
        larguraMax="max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          <form onSubmit={aoAdicionarEntrada} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end">
              <Campo label="Litros" obrigatorio>
                <input
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="Ex.: 5000"
                  value={entradaLitrosStr}
                  onChange={(e) => setEntradaLitrosStr(e.target.value)}
                />
              </Campo>
              <Campo label="Custo por litro (R$)" obrigatorio>
                <input
                  className={CLASSE_CAMPO}
                  placeholder="Ex.: 5,49"
                  value={entradaCustoStr}
                  onChange={(e) => setEntradaCustoStr(e.target.value)}
                />
              </Campo>
              <Campo label="Data" obrigatorio>
                <input type="date" aria-label="Data da entrada" className={CLASSE_CAMPO} value={entradaData} onChange={(e) => setEntradaData(e.target.value)} />
              </Campo>
              <div>
                <button type="submit" disabled={salvando} className="w-full btn btn-primario py-2 text-sm">
                  {salvando ? 'Registrando…' : 'Registrar'}
                </button>
              </div>
            </div>
          </form>
          <HistoricoEntradas carregando={carregandoEntradas} entradas={entradasHistorico} aoExcluir={aoExcluirEntrada} podeExcluir={podeGerenciar} />
          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalEntradaAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Medição de régua */}
      <Modal
        aberto={modalMedicaoAberto}
        aoFechar={() => setModalMedicaoAberto(false)}
        titulo={`Medição de régua: ${selecionado?.nome ?? ''}`}
        descricao="A régua reconcilia contra o nível calculado. A divergência é o sinal de furto/evaporação/erro."
        larguraMax="max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          <form onSubmit={aoAdicionarMedicao} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end">
              <Campo label="Litros medidos" obrigatorio>
                <input
                  className={`${CLASSE_CAMPO} numeros text-right`}
                  placeholder="Ex.: 8200"
                  value={medicaoLitrosStr}
                  onChange={(e) => setMedicaoLitrosStr(e.target.value)}
                />
              </Campo>
              <Campo label="Data" obrigatorio>
                <input type="date" aria-label="Data da medição" className={CLASSE_CAMPO} value={medicaoData} onChange={(e) => setMedicaoData(e.target.value)} />
              </Campo>
              <Campo label="Hora" obrigatorio>
                <input type="time" aria-label="Hora da medição" className={CLASSE_CAMPO} value={medicaoHora} onChange={(e) => setMedicaoHora(e.target.value)} />
              </Campo>
              <div>
                <button type="submit" disabled={salvando} className="w-full btn btn-primario py-2 text-sm">
                  {salvando ? 'Registrando…' : 'Registrar'}
                </button>
              </div>
            </div>
            <Campo label="Observação">
              <input
                className={CLASSE_CAMPO}
                placeholder="Opcional"
                value={medicaoObs}
                onChange={(e) => setMedicaoObs(e.target.value)}
              />
            </Campo>
            {divergenciaPrevista !== null && selecionado && (
              <div className="rounded-lg border border-borda bg-claro/[0.02] px-3 py-2 text-xs">
                <span className="text-suave">Nível calculado atual: </span>
                <span className="numeros text-claro">{formatLitros(selecionado.nivel)}</span>
                <span className="mx-2 text-suave">·</span>
                <span className="text-suave">Divergência: </span>
                <span
                  className={`numeros font-bold ${
                    divergenciaPrevista === 0n ? 'text-positivo' : 'text-ambar'
                  }`}
                >
                  {divergenciaPrevista > 0n ? '+' : ''}
                  {formatLitros(divergenciaPrevista)}
                </span>
              </div>
            )}
          </form>
          <HistoricoMedicoes carregando={carregandoMedicoes} medicoes={medicoesHistorico} />
          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalMedicaoAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Preço de venda */}
      <Modal
        aberto={modalPrecoAberto}
        aoFechar={() => setModalPrecoAberto(false)}
        titulo={`Preço de venda: ${selecionado?.combustivelNome ?? ''}`}
        descricao="Preço por litro com vigência por data. Não reescreve fechamentos passados."
        larguraMax="max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          {podeDefinirPrecoCusto ? (
            <form onSubmit={aoAdicionarPreco} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-end">
                <Campo label="Preço por litro (R$)" obrigatorio>
                  <input className={CLASSE_CAMPO} placeholder="Ex.: 6,29" value={novoPrecoStr} onChange={(e) => setNovoPrecoStr(e.target.value)} />
                </Campo>
                <Campo label="Válido a partir de" obrigatorio>
                  <input type="date" aria-label="Vigência do preço" className={CLASSE_CAMPO} value={precoDataVigencia} onChange={(e) => setPrecoDataVigencia(e.target.value)} />
                </Campo>
                <div>
                  <button type="submit" disabled={salvando} className="w-full btn btn-primario py-2 text-sm">
                    {salvando ? 'Adicionando…' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-500">
              Você não tem permissão para alterar preços e custos.
            </div>
          )}
          <HistoricoVigencias carregando={carregandoPrecos} registros={precosHistorico} porData rotulo="Preço" aoExcluir={aoExcluirPreco} podeExcluir={podeDefinirPrecoCusto} />
          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalPrecoAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Custo */}
      <Modal
        aberto={modalCustoAberto}
        aoFechar={() => setModalCustoAberto(false)}
        titulo={`Custo: ${selecionado?.combustivelNome ?? ''}`}
        descricao="Custo por litro com vigência por data/hora (controle fino)."
        larguraMax="max-w-2xl"
      >
        <div className="flex flex-col gap-6">
          {podeDefinirPrecoCusto ? (
            <form onSubmit={aoAdicionarCusto} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end">
                <Campo label="Custo por litro (R$)" obrigatorio>
                  <input className={CLASSE_CAMPO} placeholder="Ex.: 5,49" value={novoCustoStr} onChange={(e) => setNovoCustoStr(e.target.value)} />
                </Campo>
                <Campo label="Data de início" obrigatorio>
                  <input type="date" aria-label="Data de início do custo" className={CLASSE_CAMPO} value={custoDataVigencia} onChange={(e) => setCustoDataVigencia(e.target.value)} />
                </Campo>
                <Campo label="Hora de início" obrigatorio>
                  <input type="time" aria-label="Hora de início do custo" className={CLASSE_CAMPO} value={custoHoraVigencia} onChange={(e) => setCustoHoraVigencia(e.target.value)} />
                </Campo>
                <div>
                  <button type="submit" disabled={salvando} className="w-full btn btn-primario py-2 text-sm">
                    {salvando ? 'Adicionando…' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-500">
              Você não tem permissão para alterar preços e custos.
            </div>
          )}
          <HistoricoVigencias carregando={carregandoCustos} registros={custosHistorico} rotulo="Custo" aoExcluir={aoExcluirCusto} podeExcluir={podeDefinirPrecoCusto} />
          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalCustoAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Bombas */}
      <Modal
        aberto={modalBombasAberto}
        aoFechar={() => setModalBombasAberto(false)}
        titulo={`Bombas / Bicos: ${selecionado?.nome ?? ''}`}
        descricao="Cadastre e gerencie os bicos de combustível do tanque. Defina o encerrante inicial do Dia Zero ao adicionar um bico."
        larguraMax="max-w-lg"
      >
        <div className="flex flex-col gap-6">
          <form onSubmit={aoAdicionarBomba} className="flex flex-col gap-4 rounded-xl border border-borda bg-claro/[0.02] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Nome da bomba/bico" obrigatorio>
                <input className={CLASSE_CAMPO} placeholder="Ex.: Bico 1" value={novaBombaNome} onChange={(e) => setNovaBombaNome(e.target.value)} />
              </Campo>
              {!bloquearDiaZero && (
                <Campo label="Encerrante inicial do Dia Zero (Litros)" dica="Leitura de partida do sistema">
                  <input className={CLASSE_CAMPO} placeholder="Ex.: 0,00" value={leituraInicial} onChange={(e) => setLeituraInicial(e.target.value)} />
                </Campo>
              )}
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={salvando} className="btn btn-primario py-2 px-4 text-sm">
                {salvando ? 'Salvando…' : 'Adicionar bico'}
              </button>
            </div>
          </form>
          {carregandoBombas ? (
            <div className="text-center text-xs text-suave py-4">Carregando…</div>
          ) : bombas.length === 0 ? (
            <div className="text-center text-xs text-suave py-4">Nenhum bico cadastrado.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {bombas.map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg border border-borda px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-claro">{b.nome}</span>
                    {leiturasIniciais[b.id] !== undefined && (
                      <span className="text-xs text-suave font-semibold text-ambar">
                        Encerrante inicial (Dia Zero): {leiturasIniciais[b.id]?.toLocaleString('pt-BR')} L
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => alternarBomba(b)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        b.ativo ? 'bg-positivo/10 text-positivo' : 'bg-claro/10 text-claro/40'
                      }`}
                    >
                      {b.ativo ? 'Ativa' : 'Inativa'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void aoExcluirBomba(b)}
                      className="text-negativo hover:text-negativo/80 p-1"
                      title="Excluir bico"
                    >
                      <IconeLixeira />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end border-t border-borda pt-4">
            <button type="button" className="btn btn-suave px-4 py-2 text-sm" onClick={() => setModalBombasAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Ações de Combustível */}
      <Modal
        aberto={modalAcoesAberto}
        aoFechar={() => setModalAcoesAberto(false)}
        titulo="Ações do Tanque"
        descricao={`Selecione a operação para o tanque ${selecionado?.nome ?? ''}:`}
        larguraMax="max-w-sm"
      >
        <div className="flex flex-col gap-2 py-1">
          {podeGerenciar && (
            <>
              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) abrirEditarTanque(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconeEditar />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Editar Tanque</span>
                <IconeChevronDireita />
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) void abrirEntrada(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconeEstoque />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Entrada de Combustível</span>
                <IconeChevronDireita />
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) void abrirMedicao(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconeRegua />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Medição de Régua</span>
                <IconeChevronDireita />
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) void abrirBombas(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconeBomba />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Gerenciar Bombas</span>
                <IconeChevronDireita />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (selecionado) void aoExcluirTanque(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-negativo/20 bg-negativo/[0.04] hover:bg-negativo/10 hover:border-negativo/40 transition-all text-left text-sm font-semibold text-negativo group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-negativo/10 text-negativo transition-colors">
                  <IconeLixeira />
                </div>
                <span className="flex-1">Excluir Tanque</span>
                <IconeChevronDireita />
              </button>
            </>
          )}

          {podeDefinirPrecoCusto && (
            <>
              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) void abrirPreco(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconePreco />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Alterar Preço</span>
                <IconeChevronDireita />
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalAcoesAberto(false);
                  if (selecionado) void abrirCusto(selecionado);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-borda bg-claro/[0.02] hover:bg-ambar/10 hover:border-ambar/40 transition-all text-left text-sm font-semibold text-claro group"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-claro/5 text-suave group-hover:bg-ambar/20 group-hover:text-ambar transition-colors">
                  <IconeCusto />
                </div>
                <span className="flex-1 text-claro group-hover:text-ambar transition-colors">Alterar Custo</span>
                <IconeChevronDireita />
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function HistoricoEntradas({
  carregando,
  entradas,
  aoExcluir,
  podeExcluir = false,
}: {
  carregando: boolean;
  entradas: EntradaCombustivel[];
  aoExcluir?: (e: EntradaCombustivel) => void;
  podeExcluir?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-bold text-claro">Histórico de entradas</h4>
      {carregando ? (
        <div className="text-center text-xs text-suave py-4">Carregando histórico…</div>
      ) : entradas.length === 0 ? (
        <div className="text-center text-xs text-suave py-4">Nenhuma entrada registrada.</div>
      ) : (
        <div className="overflow-y-auto rounded-xl border border-borda max-h-60">
          <table className="w-full text-left text-xs table-fixed">
            <thead className="bg-claro/[0.02] text-suave border-b border-borda sticky top-0 z-10">
              <tr>
                <th className="p-3 w-[25%] font-semibold">Data</th>
                <th className="p-3 w-[20%] text-right font-semibold">Litros</th>
                <th className="p-3 w-[20%] text-right font-semibold">Custo/L</th>
                <th className="p-3 w-[25%] text-right font-semibold">Total</th>
                <th className="p-3 w-[10%] text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {entradas.map((e) => {
                const total = asCentavos(BigInt(Math.round(Number(e.custoLitroCentavos) * e.litros)));
                return (
                  <tr key={e.id} className="hover:bg-claro/[0.01]">
                    <td className="p-3 font-medium text-claro truncate">{formatarDataBR(e.data)}</td>
                    <td className="p-3 numeros text-right text-claro">{fmtLitrosNum(e.litros)}</td>
                    <td className="p-3 numeros text-right text-claro">{formatReais(e.custoLitroCentavos)}</td>
                    <td className="p-3 numeros text-right font-semibold text-positivo">{formatReais(total)}</td>
                    <td className="p-3 text-right">
                      {podeExcluir && aoExcluir && (
                        <button
                          type="button"
                          onClick={() => void aoExcluir(e)}
                          className="text-negativo hover:text-negativo/80 p-1"
                          title="Excluir entrada"
                        >
                          <IconeLixeira />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoricoMedicoes({ carregando, medicoes }: { carregando: boolean; medicoes: MedicaoTanque[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-bold text-claro">Histórico de medições</h4>
      {carregando ? (
        <div className="text-center text-xs text-suave py-4">Carregando histórico…</div>
      ) : medicoes.length === 0 ? (
        <div className="text-center text-xs text-suave py-4">Nenhuma medição registrada.</div>
      ) : (
        <div className="overflow-y-auto rounded-xl border border-borda max-h-60">
          <table className="w-full text-left text-xs table-fixed">
            <thead className="bg-claro/[0.02] text-suave border-b border-borda sticky top-0 z-10">
              <tr>
                <th className="p-3 w-[34%] font-semibold">Data/Hora</th>
                <th className="p-3 w-[26%] text-right font-semibold">Litros medidos</th>
                <th className="p-3 w-[40%] font-semibold">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {medicoes.map((m) => {
                const partes = m.dataHora.split('T');
                const quando =
                  partes.length > 1
                    ? `${formatarDataBR(partes[0])} ${(partes[1] ?? '').slice(0, 5)}`
                    : formatarDataBR(m.dataHora);
                return (
                  <tr key={m.id} className="hover:bg-claro/[0.01]">
                    <td className="p-3 font-medium text-claro truncate">{quando}</td>
                    <td className="p-3 numeros text-right text-claro">{fmtLitrosNum(m.litrosMedidos)}</td>
                    <td className="p-3 text-suave truncate">{m.observacao ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoricoVigencias({
  carregando,
  registros,
  porData = false,
  rotulo,
  aoExcluir,
  podeExcluir = false,
}: {
  carregando: boolean;
  registros: VigenciaCombustivel[];
  porData?: boolean;
  rotulo: string;
  aoExcluir?: (v: VigenciaCombustivel) => void;
  podeExcluir?: boolean;
}) {
  const agora = new Date().toISOString();
  const hoje = hojeManaus();
  const referencia = porData ? hoje : agora;
  const vigenteIndex = registros.findIndex((x) => x.validoAPartirDe <= referencia);
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-bold text-claro">Histórico de {rotulo.toLowerCase()}s</h4>
      {carregando ? (
        <div className="text-center text-xs text-suave py-4">Carregando histórico…</div>
      ) : registros.length === 0 ? (
        <div className="text-center text-xs text-suave py-4">Nenhum {rotulo.toLowerCase()} definido.</div>
      ) : (
        <div className="overflow-y-auto rounded-xl border border-borda max-h-60">
          <table className="w-full text-left text-xs table-fixed">
            <thead className="bg-claro/[0.02] text-suave border-b border-borda sticky top-0 z-10">
              <tr>
                <th className="p-3 w-[40%] font-semibold">Início da vigência</th>
                <th className="p-3 w-[25%] font-semibold">{rotulo}/L</th>
                <th className="p-3 w-[20%] text-right font-semibold">Situação</th>
                <th className="p-3 w-[15%] text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {registros.map((r, idx) => {
                const situacao =
                  r.validoAPartirDe > referencia
                    ? { label: 'Futuro', classe: 'bg-ambar/10 text-ambar' }
                    : idx === vigenteIndex
                      ? { label: 'Vigente', classe: 'bg-positivo/10 text-positivo' }
                      : { label: 'Histórico', classe: 'bg-claro/5 text-suave' };
                const partes = r.validoAPartirDe.split('T');
                const quando =
                  partes.length > 1
                    ? `${formatarDataBR(partes[0])} ${(partes[1] ?? '').slice(0, 5)}`
                    : formatarDataBR(r.validoAPartirDe);
                return (
                  <tr key={r.id} className="hover:bg-claro/[0.01]">
                    <td className="p-3 font-medium text-claro truncate">{quando}</td>
                    <td className="p-3 numeros text-claro">{formatReais(r.valorCentavos)}</td>
                    <td className="p-3 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${situacao.classe}`}>
                        {situacao.label}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {podeExcluir && aoExcluir && (
                        <button
                          type="button"
                          onClick={() => void aoExcluir(r)}
                          className="text-negativo hover:text-negativo/80 p-1"
                          title={`Excluir ${rotulo.toLowerCase()}`}
                        >
                          <IconeLixeira />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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

function IconeEditar() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function IconeEstoque() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function IconeRegua() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2H9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11h6m-6 4h3" />
    </svg>
  );
}

function IconeBomba() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function IconePreco() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconeCusto() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function IconeChevronDireita() {
  return (
    <svg className="h-4 w-4 text-suave group-hover:text-ambar group-hover:translate-x-0.5 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconeLixeira() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
