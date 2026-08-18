import { useEffect, useState, useCallback } from 'react';
import {
  listarBens, salvarBem, fotosDoBem, movimentacoesDoBem, registrarMovimentacao,
  listarColaboradores, listarLocalizacoes, listarCategorias, sb
} from '../lib/supabase';
import { enviarFotoDeBem, urlDaFoto } from '../lib/storage';
import { Etiqueta, Estado, Carregando, Vazio, Modal, Aviso, moeda, data } from '../components/Comuns';

const TITULOS = {
  mobiliario: { h1: 'Mobiliário', sub: 'Móveis, equipamentos e utensílios permanentes' },
  imobilizado: { h1: 'Imobilizado', sub: 'Veículos e bens de maior valor' }
};

// Campos que só existem no veículo. Ficam no JSONB `atributos`.
const CAMPOS_VEICULO = [
  ['placa', 'Placa'], ['chassi', 'Chassi'], ['renavam', 'RENAVAM'],
  ['ano_fabricacao', 'Ano de fabricação'], ['ano_modelo', 'Ano do modelo'],
  ['cor', 'Cor'], ['combustivel', 'Combustível'], ['km_atual', 'Hodômetro'],
  ['vencimento_licenciamento', 'Licenciamento até'], ['seguradora', 'Seguradora'],
  ['apolice', 'Apólice'], ['vencimento_seguro', 'Seguro até']
];

export default function Bens({ grupo, podeEditar }) {
  const [bens, setBens] = useState(null);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [editando, setEditando] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const { data: lista, error } = await listarBens(grupo, { busca, situacao });
    if (error) { setErro('Não foi possível carregar a lista.'); return; }
    setBens(lista || []);
  }, [grupo, busca, situacao]);

  useEffect(() => {
    setBens(null);
    const t = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  const t = TITULOS[grupo];

  return (
    <>
      <header className="topo">
        <div>
          <h1>{t.h1}</h1>
          <p>{t.sub}</p>
        </div>
        {podeEditar && (
          <button className="btn btn-principal" onClick={() => setEditando({ grupo })}>
            Cadastrar bem
          </button>
        )}
      </header>

      <div className="corpo">
        <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>

        <div className="cartao">
          <div className="cartao-cabeca">
            <div className="filtros">
              <input placeholder="Buscar por código, descrição, marca ou série"
                     value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 280 }} />
              <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
                <option value="">Todas as situações</option>
                <option value="em_uso">Em uso</option>
                <option value="disponivel">Disponível</option>
                <option value="manutencao">Em manutenção</option>
                <option value="emprestado">Emprestado</option>
                <option value="baixado">Baixado</option>
              </select>
            </div>
            {bens && <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>{bens.length} registros</span>}
          </div>

          {!bens ? <Carregando /> : bens.length === 0 ? (
            <Vazio
              titulo={busca || situacao ? 'Nenhum bem encontrado' : 'Nenhum bem cadastrado'}
              descricao={busca || situacao
                ? 'Ajuste a busca ou o filtro de situação.'
                : 'Cadastre o primeiro bem ou aprove uma autodeclaração para começar.'}
              acao={podeEditar && !busca && !situacao &&
                <button className="btn btn-principal" onClick={() => setEditando({ grupo })}>Cadastrar bem</button>}
            />
          ) : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Patrimônio</th>
                    <th>Descrição</th>
                    <th>Marca / Modelo</th>
                    <th>Situação</th>
                    <th>Responsável</th>
                    <th>Local</th>
                    <th className="num">Valor</th>
                    <th className="meio">Fotos</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bens.map((b) => (
                    <tr key={b.id}>
                      <td><Etiqueta codigo={b.codigo_patrimonio} /></td>
                      <td>{b.descricao}</td>
                      <td style={{ color: 'var(--tinta-media)' }}>
                        {[b.marca, b.modelo].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td><Estado valor={b.situacao} /></td>
                      <td>{b.responsavel_nome || '—'}</td>
                      <td style={{ color: 'var(--tinta-media)' }}>{b.localizacao_nome || '—'}</td>
                      <td className="num">{moeda(b.valor_aquisicao)}</td>
                      <td className="meio" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {b.qtd_fotos || 0}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-p" onClick={() => setDetalhe(b)}>Abrir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editando && (
        <FormularioBem bem={editando} grupo={grupo}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); carregar(); }} />
      )}

      {detalhe && (
        <DetalheBem bem={detalhe} podeEditar={podeEditar}
          aoFechar={() => setDetalhe(null)}
          aoMudar={() => { setDetalhe(null); carregar(); }}
          aoEditar={() => { setEditando(detalhe); setDetalhe(null); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function FormularioBem({ bem, grupo, aoFechar, aoSalvar }) {
  const [form, setForm] = useState({
    codigo_patrimonio: '', descricao: '', marca: '', modelo: '', numero_serie: '',
    data_aquisicao: '', valor_aquisicao: '', fornecedor: '', nota_fiscal: '',
    estado_conservacao: 'bom', categoria_id: '', localizacao_id: '', observacoes: '',
    ...bem, grupo
  });
  const [atributos, setAtributos] = useState(bem.atributos || {});
  const [categorias, setCategorias] = useState([]);
  const [locais, setLocais] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    listarCategorias(grupo).then(({ data }) => setCategorias(data || []));
    listarLocalizacoes().then(({ data }) => setLocais(data || []));
  }, [grupo]);

  const alterar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);

    const payload = {
      ...form,
      atributos,
      valor_aquisicao: form.valor_aquisicao === '' ? null : Number(form.valor_aquisicao),
      data_aquisicao: form.data_aquisicao || null,
      categoria_id: form.categoria_id || null,
      localizacao_id: form.localizacao_id || null
    };
    // Campos calculados pela view não podem voltar para a tabela.
    ['categoria_nome', 'localizacao_nome', 'responsavel_nome', 'responsavel_setor',
     'foto_principal', 'qtd_fotos', 'criado_em', 'atualizado_em'].forEach((k) => delete payload[k]);

    const { error } = await salvarBem(payload);
    if (error) {
      setErro(error.code === '23505'
        ? 'Já existe um bem com esse código de patrimônio.'
        : 'Não foi possível salvar. Confira os campos e tente de novo.');
      setSalvando(false);
      return;
    }
    aoSalvar();
  }

  return (
    <Modal largo titulo={bem.id ? 'Editar bem' : 'Cadastrar bem'} aoFechar={aoFechar}
      rodape={<>
        <button className="btn" onClick={aoFechar}>Cancelar</button>
        <button className="btn btn-principal" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </>}>
      <form onSubmit={salvar}>
        <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>

        <div className="linha">
          <div className="campo">
            <label>Código de patrimônio</label>
            <input value={form.codigo_patrimonio} onChange={alterar('codigo_patrimonio')} required
                   style={{ fontFamily: 'var(--mono)' }} placeholder="PAT-000001" />
            <div className="ajuda">O mesmo código da plaqueta colada no bem.</div>
          </div>
          <div className="campo">
            <label>Categoria</label>
            <select value={form.categoria_id || ''} onChange={alterar('categoria_id')}>
              <option value="">Selecione</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="campo">
          <label>Descrição</label>
          <input value={form.descricao} onChange={alterar('descricao')} required
                 placeholder="Cadeira giratória presidente" />
        </div>

        <div className="linha-3">
          <div className="campo">
            <label>Marca</label>
            <input value={form.marca || ''} onChange={alterar('marca')} />
          </div>
          <div className="campo">
            <label>Modelo</label>
            <input value={form.modelo || ''} onChange={alterar('modelo')} />
          </div>
          <div className="campo">
            <label>Número de série</label>
            <input value={form.numero_serie || ''} onChange={alterar('numero_serie')} />
          </div>
        </div>

        <div className="linha-3">
          <div className="campo">
            <label>Data de aquisição</label>
            <input type="date" value={form.data_aquisicao || ''} onChange={alterar('data_aquisicao')} />
          </div>
          <div className="campo">
            <label>Valor de aquisição</label>
            <input type="number" step="0.01" min="0" value={form.valor_aquisicao ?? ''}
                   onChange={alterar('valor_aquisicao')} />
          </div>
          <div className="campo">
            <label>Estado de conservação</label>
            <select value={form.estado_conservacao} onChange={alterar('estado_conservacao')}>
              <option value="novo">Novo</option>
              <option value="otimo">Ótimo</option>
              <option value="bom">Bom</option>
              <option value="regular">Regular</option>
              <option value="ruim">Ruim</option>
              <option value="inservivel">Inservível</option>
            </select>
          </div>
        </div>

        <div className="linha-3">
          <div className="campo">
            <label>Fornecedor</label>
            <input value={form.fornecedor || ''} onChange={alterar('fornecedor')} />
          </div>
          <div className="campo">
            <label>Nota fiscal</label>
            <input value={form.nota_fiscal || ''} onChange={alterar('nota_fiscal')} />
          </div>
          <div className="campo">
            <label>Localização</label>
            <select value={form.localizacao_id || ''} onChange={alterar('localizacao_id')}>
              <option value="">Selecione</option>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
        </div>

        {grupo === 'imobilizado' && (
          <>
            <h3 style={{ margin: '18px 0 10px' }}>Dados do veículo</h3>
            <div className="linha-3">
              {CAMPOS_VEICULO.map(([chave, rotulo]) => (
                <div className="campo" key={chave}>
                  <label>{rotulo}</label>
                  <input
                    type={chave.startsWith('vencimento') ? 'date' : chave.startsWith('ano') || chave === 'km_atual' ? 'number' : 'text'}
                    value={atributos[chave] ?? ''}
                    onChange={(e) => setAtributos({ ...atributos, [chave]: e.target.value })}
                    style={['placa', 'chassi', 'renavam'].includes(chave) ? { fontFamily: 'var(--mono)' } : undefined}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="campo">
          <label>Observações</label>
          <textarea value={form.observacoes || ''} onChange={alterar('observacoes')} />
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function DetalheBem({ bem, podeEditar, aoFechar, aoMudar, aoEditar }) {
  const [fotos, setFotos] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [locais, setLocais] = useState([]);
  const [mov, setMov] = useState({ tipo: 'entrega', colaborador_destino_id: '', localizacao_destino_id: '', estado_conservacao: bem.estado_conservacao, observacao: '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const recarregar = useCallback(() => {
    fotosDoBem(bem.id).then(({ data }) => setFotos(data || []));
    movimentacoesDoBem(bem.id).then(({ data }) => setHistorico(data || []));
  }, [bem.id]);

  useEffect(() => {
    recarregar();
    listarColaboradores().then(({ data }) => setColaboradores(data || []));
    listarLocalizacoes().then(({ data }) => setLocais(data || []));
  }, [recarregar]);

  async function subirFoto(e) {
    const arquivos = Array.from(e.target.files || []);
    if (!arquivos.length) return;
    setErro(''); setEnviando(true);
    try {
      for (const arquivo of arquivos) {
        const { key, width, height, tamanho } = await enviarFotoDeBem(arquivo, bem.codigo_patrimonio);
        await sb.from('bem_fotos').insert({
          bem_id: bem.id, storage_key: key, largura_px: width, altura_px: height,
          tamanho_bytes: tamanho, principal: fotos.length === 0
        });
      }
      recarregar();
    } catch (err) {
      setErro(err.message);
    }
    setEnviando(false);
    e.target.value = '';
  }

  async function removerFoto(id) {
    await sb.from('bem_fotos').delete().eq('id', id);
    recarregar();
  }

  async function movimentar(e) {
    e.preventDefault();
    setErro(''); setOk(''); setEnviando(true);

    if (mov.tipo === 'entrega' && !mov.colaborador_destino_id) {
      setErro('Escolha para quem o bem está sendo entregue.');
      setEnviando(false);
      return;
    }

    const { error } = await registrarMovimentacao({
      bem_id: bem.id,
      tipo: mov.tipo,
      colaborador_origem_id: bem.responsavel_id || null,
      colaborador_destino_id: mov.colaborador_destino_id || null,
      localizacao_destino_id: mov.localizacao_destino_id || null,
      estado_conservacao: mov.estado_conservacao,
      observacao: mov.observacao || null
    });

    if (error) { setErro('Não foi possível registrar a movimentação.'); setEnviando(false); return; }
    setOk('Movimentação registrada.');
    setEnviando(false);
    setTimeout(aoMudar, 700);
  }

  const atributos = bem.atributos || {};
  const temAtributos = Object.keys(atributos).some((k) => atributos[k]);

  return (
    <Modal largo titulo={bem.descricao} aoFechar={aoFechar}
      rodape={<>
        {podeEditar && <button className="btn" onClick={aoEditar}>Editar cadastro</button>}
        <button className="btn" onClick={aoFechar}>Fechar</button>
      </>}>
      <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>
      <Aviso tipo="ok" aoFechar={() => setOk('')}>{ok}</Aviso>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Etiqueta codigo={bem.codigo_patrimonio} />
        <Estado valor={bem.situacao} />
        <Estado valor={bem.estado_conservacao} />
        <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>
          {bem.responsavel_nome ? `Com ${bem.responsavel_nome}` : 'Sem responsável'}
          {bem.localizacao_nome ? ` · ${bem.localizacao_nome}` : ''}
        </span>
      </div>

      {temAtributos && (
        <div style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 8 }}>Dados do veículo</h3>
          <div className="rolagem">
            <table>
              <tbody>
                {CAMPOS_VEICULO.filter(([k]) => atributos[k]).map(([k, r]) => (
                  <tr key={k}>
                    <td style={{ width: 170, fontWeight: 600, fontSize: 12.5 }}>{r}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                      {k.startsWith('vencimento') ? data(atributos[k]) : atributos[k]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3 style={{ marginBottom: 8 }}>Fotos</h3>
      <div className="tira-fotos" style={{ marginBottom: 10 }}>
        {fotos.map((f) => (
          <div className="miniatura" key={f.id}>
            <img src={urlDaFoto(f.storage_key)} alt={f.legenda || 'Foto do bem'} loading="lazy" />
            {podeEditar && <button onClick={() => removerFoto(f.id)} aria-label="Remover foto">×</button>}
          </div>
        ))}
        {fotos.length === 0 && (
          <p style={{ color: 'var(--tinta-fraca)', fontSize: 12.5, margin: 0 }}>Nenhuma foto anexada.</p>
        )}
      </div>
      {podeEditar && (
        <div className="campo">
          <input type="file" accept="image/*" multiple capture="environment"
                 onChange={subirFoto} disabled={enviando} />
          <div className="ajuda">As fotos são reduzidas no navegador antes do envio.</div>
        </div>
      )}

      {podeEditar && bem.situacao !== 'baixado' && (
        <>
          <h3 style={{ margin: '18px 0 8px' }}>Registrar movimentação</h3>
          <form onSubmit={movimentar}>
            <div className="linha">
              <div className="campo">
                <label>O que aconteceu</label>
                <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>
                  <option value="entrega">Entrega a colaborador</option>
                  <option value="devolucao">Devolução</option>
                  <option value="transferencia">Transferência</option>
                  <option value="envio_manutencao">Envio para manutenção</option>
                  <option value="retorno_manutencao">Retorno da manutenção</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
              <div className="campo">
                <label>Estado na movimentação</label>
                <select value={mov.estado_conservacao}
                        onChange={(e) => setMov({ ...mov, estado_conservacao: e.target.value })}>
                  <option value="novo">Novo</option>
                  <option value="otimo">Ótimo</option>
                  <option value="bom">Bom</option>
                  <option value="regular">Regular</option>
                  <option value="ruim">Ruim</option>
                  <option value="inservivel">Inservível</option>
                </select>
              </div>
            </div>

            {(mov.tipo === 'entrega' || mov.tipo === 'transferencia') && (
              <div className="linha">
                <div className="campo">
                  <label>Colaborador</label>
                  <select value={mov.colaborador_destino_id}
                          onChange={(e) => setMov({ ...mov, colaborador_destino_id: e.target.value })}>
                    <option value="">Selecione</option>
                    {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label>Local de destino</label>
                  <select value={mov.localizacao_destino_id}
                          onChange={(e) => setMov({ ...mov, localizacao_destino_id: e.target.value })}>
                    <option value="">Manter o atual</option>
                    {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="campo">
              <label>Observação</label>
              <input value={mov.observacao} onChange={(e) => setMov({ ...mov, observacao: e.target.value })}
                     placeholder="Opcional" />
            </div>

            <button className="btn btn-principal" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar movimentação'}
            </button>
          </form>
        </>
      )}

      <h3 style={{ margin: '18px 0 8px' }}>Histórico</h3>
      {historico.length === 0 ? (
        <p style={{ color: 'var(--tinta-fraca)', fontSize: 12.5 }}>Sem movimentações registradas.</p>
      ) : (
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>Data</th><th>Movimento</th><th>Observação</th></tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {new Date(h.data_movimento).toLocaleString('pt-BR')}
                  </td>
                  <td>{h.tipo.replace(/_/g, ' ')}</td>
                  <td style={{ color: 'var(--tinta-media)' }}>{h.observacao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
