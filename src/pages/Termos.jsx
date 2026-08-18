import { useEffect, useState, useCallback } from 'react';
import {
  listarTermos, criarTermo, itensDoTermo, listarColaboradores, listarBens, sb
} from '../lib/supabase';
import { enviarPdfDeTermo } from '../lib/storage';
import { Etiqueta, Estado, Carregando, Vazio, Modal, Aviso, data } from '../components/Comuns';

export default function Termos({ podeEditar }) {
  const [termos, setTermos] = useState(null);
  const [status, setStatus] = useState('');
  const [emitindo, setEmitindo] = useState(false);
  const [aberto, setAberto] = useState(null);

  const carregar = useCallback(async () => {
    const { data: lista } = await listarTermos();
    setTermos(lista || []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = (termos || []).filter((t) => !status || t.status === status);

  return (
    <>
      <header className="topo">
        <div>
          <h1>Termos de responsabilidade</h1>
          <p>Emissão, impressão e guarda do documento assinado</p>
        </div>
        {podeEditar && (
          <button className="btn btn-principal" onClick={() => setEmitindo(true)}>Emitir termo</button>
        )}
      </header>

      <div className="corpo">
        <div className="cartao">
          <div className="cartao-cabeca">
            <div className="filtros">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todos os status</option>
                <option value="rascunho">Rascunho</option>
                <option value="emitido">Emitido, aguardando assinatura</option>
                <option value="assinado">Assinado</option>
                <option value="devolvido">Devolvido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            {termos && <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>{filtrados.length} termos</span>}
          </div>

          {!termos ? <Carregando /> : filtrados.length === 0 ? (
            <Vazio titulo={status ? 'Nenhum termo com esse status' : 'Nenhum termo emitido'}
                   descricao={status
                     ? 'Escolha outro status para ver os demais.'
                     : 'Emita o primeiro termo escolhendo um colaborador e os bens entregues a ele.'}
                   acao={podeEditar && !status &&
                     <button className="btn btn-principal" onClick={() => setEmitindo(true)}>Emitir termo</button>} />
          ) : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Número</th><th>Colaborador</th><th>Emissão</th>
                    <th>Status</th><th>Assinatura</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((t) => (
                    <tr key={t.id}>
                      <td><span className="etiqueta">{t.numero}</span></td>
                      <td>{t.colaboradores?.nome || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{data(t.data_emissao)}</td>
                      <td><Estado valor={t.status} /></td>
                      <td style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>
                        {t.data_assinatura ? data(t.data_assinatura) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-p" onClick={() => setAberto(t)}>Abrir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {emitindo && <FormEmissao aoFechar={() => setEmitindo(false)}
                                aoEmitir={() => { setEmitindo(false); carregar(); }} />}
      {aberto && <DetalheTermo termo={aberto} podeEditar={podeEditar}
                               aoFechar={() => setAberto(null)}
                               aoMudar={() => { setAberto(null); carregar(); }} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function FormEmissao({ aoFechar, aoEmitir }) {
  const [colaboradores, setColaboradores] = useState([]);
  const [colaboradorId, setColaboradorId] = useState('');
  const [disponiveis, setDisponiveis] = useState([]);
  const [escolhidos, setEscolhidos] = useState([]);
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { listarColaboradores().then(({ data }) => setColaboradores(data || [])); }, []);

  useEffect(() => {
    (async () => {
      const [mob, imo] = await Promise.all([
        listarBens('mobiliario', { situacao: 'disponivel' }),
        listarBens('imobilizado', { situacao: 'disponivel' })
      ]);
      setDisponiveis([...(mob.data || []), ...(imo.data || [])]);
    })();
  }, []);

  function alternar(id) {
    setEscolhidos((atual) => atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]);
  }

  async function emitir(e) {
    e.preventDefault();
    setErro('');
    if (!colaboradorId) { setErro('Escolha o colaborador que vai assinar.'); return; }
    if (!escolhidos.length) { setErro('Selecione ao menos um bem.'); return; }

    setSalvando(true);
    try {
      await criarTermo(colaboradorId, escolhidos, observacoes || null);
      aoEmitir();
    } catch {
      setErro('Não foi possível emitir o termo.');
      setSalvando(false);
    }
  }

  return (
    <Modal largo titulo="Emitir termo de responsabilidade" aoFechar={aoFechar}
      rodape={<>
        <button className="btn" onClick={aoFechar}>Cancelar</button>
        <button className="btn btn-principal" onClick={emitir} disabled={salvando}>
          {salvando ? 'Emitindo…' : `Emitir com ${escolhidos.length} ${escolhidos.length === 1 ? 'bem' : 'bens'}`}
        </button>
      </>}>
      <form onSubmit={emitir}>
        <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>

        <div className="campo">
          <label>Colaborador</label>
          <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} required>
            <option value="">Selecione</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}{c.setor ? ` — ${c.setor}` : ''}</option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label>Bens entregues</label>
          {disponiveis.length === 0 ? (
            <p style={{ color: 'var(--tinta-fraca)', fontSize: 12.5, margin: 0 }}>
              Não há bens disponíveis. Um bem só aparece aqui quando está sem responsável.
            </p>
          ) : (
            <div style={{ border: '1px solid var(--borda)', borderRadius: 'var(--r)', maxHeight: 260, overflowY: 'auto' }}>
              <table>
                <tbody>
                  {disponiveis.map((b) => (
                    <tr key={b.id} onClick={() => alternar(b.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ width: 34 }}>
                        <input type="checkbox" readOnly checked={escolhidos.includes(b.id)} style={{ width: 'auto' }} />
                      </td>
                      <td style={{ width: 130 }}><Etiqueta codigo={b.codigo_patrimonio} /></td>
                      <td>{b.descricao}</td>
                      <td style={{ color: 'var(--tinta-media)' }}>
                        {[b.marca, b.modelo].filter(Boolean).join(' / ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="campo">
          <label>Observações</label>
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Opcional — aparece no rodapé do termo" />
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function DetalheTermo({ termo, podeEditar, aoFechar, aoMudar }) {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { itensDoTermo(termo.id).then(({ data }) => setItens(data || [])); }, [termo.id]);

  async function baixarPdf() {
    setErro(''); setOcupado(true);
    try {
      // O jsPDF só é baixado quando alguém realmente gera um termo:
      // mantém leve a página pública e o primeiro carregamento.
      const { gerarTermoDeRegistros } = await import('../lib/gerarTermo');
      const { blob, hash } = await gerarTermoDeRegistros(termo, termo.colaboradores, itens);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${termo.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      // Guarda o hash na primeira emissão: é o que o QR do rodapé valida.
      if (termo.status === 'rascunho') {
        const chave = await enviarPdfDeTermo(blob, termo.numero, 'emitido').catch(() => null);
        await sb.from('termos').update({
          status: 'emitido', hash_validacao: hash, pdf_key: chave
        }).eq('id', termo.id);
        setOk('Termo emitido. Imprima em duas vias para assinatura.');
      }
    } catch {
      setErro('Não foi possível gerar o PDF.');
    }
    setOcupado(false);
  }

  async function anexarAssinado(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro(''); setOcupado(true);
    try {
      const chave = await enviarPdfDeTermo(arquivo, termo.numero, 'assinado');
      const { error } = await sb.from('termos').update({
        status: 'assinado', scan_key: chave, data_assinatura: new Date().toISOString().slice(0, 10)
      }).eq('id', termo.id);
      if (error) throw error;
      setOk('Termo assinado registrado.');
      setTimeout(aoMudar, 800);
    } catch {
      setErro('Não foi possível anexar o documento assinado.');
    }
    setOcupado(false);
    e.target.value = '';
  }

  return (
    <Modal largo titulo={`Termo ${termo.numero}`} aoFechar={aoFechar}
      rodape={<>
        <button className="btn" onClick={baixarPdf} disabled={ocupado || !itens?.length}>
          {termo.status === 'rascunho' ? 'Gerar e emitir PDF' : 'Baixar PDF'}
        </button>
        <button className="btn" onClick={aoFechar}>Fechar</button>
      </>}>
      <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>
      <Aviso tipo="ok" aoFechar={() => setOk('')}>{ok}</Aviso>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Estado valor={termo.status} />
        <span style={{ fontSize: 13 }}>
          <strong>{termo.colaboradores?.nome}</strong>
          {termo.colaboradores?.setor ? ` — ${termo.colaboradores.setor}` : ''}
        </span>
        <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>
          Emitido em {data(termo.data_emissao)}
        </span>
      </div>

      {termo.status === 'emitido' && (
        <Aviso tipo="atencao">
          Este termo está aguardando a via assinada. Enquanto o documento digitalizado não
          for anexado, ele continua aparecendo nas pendências.
        </Aviso>
      )}

      <h3 style={{ marginBottom: 8 }}>Bens relacionados</h3>
      {!itens ? <Carregando /> : (
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>Patrimônio</th><th>Descrição</th><th>Marca / Modelo</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td><Etiqueta codigo={i.bens?.codigo_patrimonio} /></td>
                  <td>{i.bens?.descricao}</td>
                  <td style={{ color: 'var(--tinta-media)' }}>
                    {[i.bens?.marca, i.bens?.modelo].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td><Estado valor={i.estado_conservacao} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {podeEditar && termo.status === 'emitido' && (
        <div className="campo" style={{ marginTop: 18 }}>
          <label>Anexar termo assinado</label>
          <input type="file" accept="application/pdf,image/*" onChange={anexarAssinado} disabled={ocupado} />
          <div className="ajuda">
            Digitalize a via assinada pelo colaborador e anexe aqui. Só então o termo consta como assinado.
          </div>
        </div>
      )}

      {termo.hash_validacao && (
        <p style={{ marginTop: 16, fontSize: 11.5, color: 'var(--tinta-fraca)', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
          Validação: {termo.hash_validacao}
        </p>
      )}
    </Modal>
  );
}
