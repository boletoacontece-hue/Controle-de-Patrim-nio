import { useEffect, useState, useCallback } from 'react';
import {
  listarEstoque, movimentarEstoque, extratoEstoque,
  listarColaboradores, listarCategorias, listarLocalizacoes, sb
} from '../lib/supabase';
import { Carregando, Vazio, Modal, Aviso, moeda, numero, data } from '../components/Comuns';

export default function Estoque({ podeEditar }) {
  const [itens, setItens] = useState(null);
  const [busca, setBusca] = useState('');
  const [soFalta, setSoFalta] = useState(false);
  const [movimentando, setMovimentando] = useState(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [extrato, setExtrato] = useState(null);

  const carregar = useCallback(async () => {
    const { data: lista } = await listarEstoque();
    setItens(lista || []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = (itens || []).filter((i) => {
    if (soFalta && !i.abaixo_minimo) return false;
    if (!busca) return true;
    const b = busca.toLowerCase();
    return i.descricao.toLowerCase().includes(b) || i.codigo.toLowerCase().includes(b);
  });

  const emFalta = (itens || []).filter((i) => i.abaixo_minimo).length;

  return (
    <>
      <header className="topo">
        <div>
          <h1>Limpeza e utensílios</h1>
          <p>Material de consumo, com saldo e aviso de reposição</p>
        </div>
        {podeEditar && (
          <button className="btn btn-principal" onClick={() => setCadastrando(true)}>Cadastrar item</button>
        )}
      </header>

      <div className="corpo">
        {emFalta > 0 && (
          <Aviso tipo="atencao">
            {emFalta === 1
              ? '1 item está no limite ou abaixo do estoque mínimo.'
              : `${emFalta} itens estão no limite ou abaixo do estoque mínimo.`}
          </Aviso>
        )}

        <div className="cartao">
          <div className="cartao-cabeca">
            <div className="filtros">
              <input placeholder="Buscar item" value={busca}
                     onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 240 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)}
                       style={{ width: 'auto' }} />
                Só o que precisa repor
              </label>
            </div>
            {itens && <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>{filtrados.length} itens</span>}
          </div>

          {!itens ? <Carregando /> : filtrados.length === 0 ? (
            <Vazio titulo={busca || soFalta ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}
                   descricao={busca || soFalta
                     ? 'Ajuste a busca ou desmarque o filtro.'
                     : 'Cadastre os materiais de limpeza e utensílios para acompanhar o saldo.'}
                   acao={podeEditar && !busca && !soFalta &&
                     <button className="btn btn-principal" onClick={() => setCadastrando(true)}>Cadastrar item</button>} />
          ) : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Item</th>
                    <th className="num">Saldo</th>
                    <th className="num">Mínimo</th>
                    <th className="num">Valor em estoque</th>
                    <th>Último movimento</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((i) => (
                    <tr key={i.id}>
                      <td><span className="etiqueta">{i.codigo}</span></td>
                      <td>
                        {i.descricao}
                        {i.abaixo_minimo && (
                          <span className="marca-estado e-manutencao" style={{ marginLeft: 8 }}>Repor</span>
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 600, color: i.abaixo_minimo ? 'var(--ambar)' : undefined }}>
                        {numero(i.saldo)} {i.unidade}
                      </td>
                      <td className="num" style={{ color: 'var(--tinta-fraca)' }}>{numero(i.estoque_minimo)}</td>
                      <td className="num">{moeda(i.valor_em_estoque)}</td>
                      <td style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>
                        {i.ultimo_movimento ? new Date(i.ultimo_movimento).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-p" onClick={() => setExtrato(i)}>Extrato</button>
                        {podeEditar && (
                          <button className="btn btn-p btn-principal" style={{ marginLeft: 6 }}
                                  onClick={() => setMovimentando(i)}>Movimentar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {movimentando && (
        <FormMovimento item={movimentando} aoFechar={() => setMovimentando(null)}
                       aoSalvar={() => { setMovimentando(null); carregar(); }} />
      )}
      {cadastrando && (
        <FormItem aoFechar={() => setCadastrando(false)}
                  aoSalvar={() => { setCadastrando(false); carregar(); }} />
      )}
      {extrato && <Extrato item={extrato} aoFechar={() => setExtrato(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function FormMovimento({ item, aoFechar, aoSalvar }) {
  const [form, setForm] = useState({
    tipo: 'saida', quantidade: '', valor_unitario: '', colaborador_id: '', setor: '', documento: '', observacao: ''
  });
  const [colaboradores, setColaboradores] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { listarColaboradores().then(({ data }) => setColaboradores(data || [])); }, []);

  const saldoDepois = form.quantidade
    ? Number(item.saldo) + (form.tipo === 'entrada' || form.tipo === 'ajuste' ? 1 : -1) * Number(form.quantidade)
    : Number(item.saldo);

  async function salvar(e) {
    e.preventDefault();
    setErro('');

    if (!form.quantidade || Number(form.quantidade) <= 0) {
      setErro('Informe uma quantidade maior que zero.');
      return;
    }
    if ((form.tipo === 'saida' || form.tipo === 'descarte') && saldoDepois < 0) {
      setErro(`Saldo insuficiente. Há ${numero(item.saldo)} ${item.unidade} em estoque.`);
      return;
    }

    setSalvando(true);
    const { error } = await movimentarEstoque({
      item_id: item.id,
      tipo: form.tipo,
      quantidade: Number(form.quantidade),
      valor_unitario: form.valor_unitario === '' ? null : Number(form.valor_unitario),
      colaborador_id: form.colaborador_id || null,
      setor: form.setor || null,
      documento: form.documento || null,
      observacao: form.observacao || null
    });
    if (error) { setErro('Não foi possível registrar o movimento.'); setSalvando(false); return; }
    aoSalvar();
  }

  return (
    <Modal titulo={`Movimentar — ${item.descricao}`} aoFechar={aoFechar}
      rodape={<>
        <button className="btn" onClick={aoFechar}>Cancelar</button>
        <button className="btn btn-principal" onClick={salvar} disabled={salvando}>
          {salvando ? 'Registrando…' : 'Registrar'}
        </button>
      </>}>
      <form onSubmit={salvar}>
        <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>

        <div className="linha">
          <div className="campo">
            <label>Tipo de movimento</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="entrada">Entrada (compra)</option>
              <option value="saida">Saída (retirada)</option>
              <option value="ajuste">Ajuste de inventário</option>
              <option value="descarte">Descarte</option>
            </select>
          </div>
          <div className="campo">
            <label>Quantidade ({item.unidade})</label>
            <input type="number" step="0.001" min="0.001" value={form.quantidade}
                   onChange={(e) => setForm({ ...form, quantidade: e.target.value })} required autoFocus />
            <div className="ajuda">
              Saldo atual {numero(item.saldo)} → depois {numero(saldoDepois)} {item.unidade}
            </div>
          </div>
        </div>

        {form.tipo === 'entrada' && (
          <div className="linha">
            <div className="campo">
              <label>Valor unitário</label>
              <input type="number" step="0.0001" min="0" value={form.valor_unitario}
                     onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })} />
            </div>
            <div className="campo">
              <label>Nota fiscal</label>
              <input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
            </div>
          </div>
        )}

        {form.tipo === 'saida' && (
          <div className="linha">
            <div className="campo">
              <label>Quem retirou</label>
              <select value={form.colaborador_id}
                      onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}>
                <option value="">Não informado</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Setor de destino</label>
              <input value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} />
            </div>
          </div>
        )}

        <div className="campo">
          <label>Observação</label>
          <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                 placeholder="Opcional" />
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function FormItem({ aoFechar, aoSalvar }) {
  const [form, setForm] = useState({
    codigo: '', descricao: '', unidade: 'UN', estoque_minimo: '0',
    custo_medio: '', categoria_id: '', localizacao_id: '', fornecedor: ''
  });
  const [categorias, setCategorias] = useState([]);
  const [locais, setLocais] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    listarCategorias('consumivel').then(({ data }) => setCategorias(data || []));
    listarLocalizacoes().then(({ data }) => setLocais(data || []));
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    const { error } = await sb.from('itens_estoque').insert({
      ...form,
      estoque_minimo: Number(form.estoque_minimo || 0),
      custo_medio: Number(form.custo_medio || 0),
      categoria_id: form.categoria_id || null,
      localizacao_id: form.localizacao_id || null
    });
    if (error) {
      setErro(error.code === '23505' ? 'Já existe um item com esse código.' : 'Não foi possível salvar.');
      setSalvando(false);
      return;
    }
    aoSalvar();
  }

  const alterar = (c) => (e) => setForm({ ...form, [c]: e.target.value });

  return (
    <Modal titulo="Cadastrar item de estoque" aoFechar={aoFechar}
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
            <label>Código</label>
            <input value={form.codigo} onChange={alterar('codigo')} required
                   style={{ fontFamily: 'var(--mono)' }} placeholder="LIM-001" />
          </div>
          <div className="campo">
            <label>Categoria</label>
            <select value={form.categoria_id} onChange={alterar('categoria_id')}>
              <option value="">Selecione</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="campo">
          <label>Descrição</label>
          <input value={form.descricao} onChange={alterar('descricao')} required
                 placeholder="Desinfetante concentrado 5L" />
        </div>

        <div className="linha-3">
          <div className="campo">
            <label>Unidade</label>
            <select value={form.unidade} onChange={alterar('unidade')}>
              {['UN', 'CX', 'PCT', 'FD', 'L', 'KG', 'M'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Estoque mínimo</label>
            <input type="number" step="0.001" min="0" value={form.estoque_minimo}
                   onChange={alterar('estoque_minimo')} />
            <div className="ajuda">Abaixo disso, aparece o aviso de reposição.</div>
          </div>
          <div className="campo">
            <label>Custo médio</label>
            <input type="number" step="0.0001" min="0" value={form.custo_medio} onChange={alterar('custo_medio')} />
          </div>
        </div>

        <div className="linha">
          <div className="campo">
            <label>Local de guarda</label>
            <select value={form.localizacao_id} onChange={alterar('localizacao_id')}>
              <option value="">Selecione</option>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Fornecedor</label>
            <input value={form.fornecedor} onChange={alterar('fornecedor')} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function Extrato({ item, aoFechar }) {
  const [movimentos, setMovimentos] = useState(null);

  useEffect(() => { extratoEstoque(item.id).then(({ data }) => setMovimentos(data || [])); }, [item.id]);

  const NOMES = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', descarte: 'Descarte' };

  return (
    <Modal largo titulo={`Extrato — ${item.descricao}`} aoFechar={aoFechar}
      rodape={<button className="btn" onClick={aoFechar}>Fechar</button>}>
      {!movimentos ? <Carregando /> : movimentos.length === 0 ? (
        <Vazio titulo="Sem movimentos" descricao="Este item ainda não teve entradas nem saídas." />
      ) : (
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Tipo</th><th className="num">Quantidade</th>
                <th>Documento</th><th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {new Date(m.data_movimento).toLocaleDateString('pt-BR')}
                  </td>
                  <td>{NOMES[m.tipo]}</td>
                  <td className="num" style={{ color: ['saida', 'descarte'].includes(m.tipo) ? 'var(--rubro)' : 'var(--verde)' }}>
                    {['saida', 'descarte'].includes(m.tipo) ? '−' : '+'}{numero(m.quantidade)} {item.unidade}
                  </td>
                  <td style={{ color: 'var(--tinta-media)' }}>{m.documento || '—'}</td>
                  <td style={{ color: 'var(--tinta-media)' }}>{m.observacao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
