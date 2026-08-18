import { useEffect, useState, useCallback } from 'react';
import {
  listarSubmissoes, itensDaSubmissao, vincularColaborador,
  aprovarSubmissao, rejeitarSubmissao, listarColaboradores
} from '../lib/supabase';
import { urlDaFoto } from '../lib/storage';
import { Etiqueta, Estado, Carregando, Vazio, Modal, Aviso } from '../components/Comuns';

export default function Triagem({ podeEditar }) {
  const [submissoes, setSubmissoes] = useState(null);
  const [status, setStatus] = useState('pendente');
  const [aberta, setAberta] = useState(null);

  const carregar = useCallback(async () => {
    const { data } = await listarSubmissoes(status || undefined);
    setSubmissoes(data || []);
  }, [status]);

  useEffect(() => { setSubmissoes(null); carregar(); }, [carregar]);

  return (
    <>
      <header className="topo">
        <div>
          <h1>Autodeclarações</h1>
          <p>O que os colaboradores informaram, antes de entrar no patrimônio</p>
        </div>
      </header>

      <div className="corpo">
        <div className="cartao">
          <div className="cartao-cabeca">
            <div className="filtros">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="pendente">Aguardando conferência</option>
                <option value="em_analise">Em análise</option>
                <option value="aprovada">Aprovadas</option>
                <option value="rejeitada">Rejeitadas</option>
                <option value="">Todas</option>
              </select>
            </div>
            {submissoes && (
              <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>{submissoes.length} declarações</span>
            )}
          </div>

          {!submissoes ? <Carregando /> : submissoes.length === 0 ? (
            <Vazio titulo="Nada por aqui"
                   descricao={status === 'pendente'
                     ? 'Nenhuma declaração aguardando conferência no momento.'
                     : 'Nenhuma declaração com esse status.'} />
          ) : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Protocolo</th><th>Quem declarou</th><th>Vinculado a</th>
                    <th className="num">Itens</th><th className="num">Fotos</th>
                    <th>Recebida</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {submissoes.map((s) => (
                    <tr key={s.id}>
                      <td><span className="etiqueta">{s.protocolo}</span></td>
                      <td>
                        {s.nome_informado}
                        {s.setor_informado && (
                          <div style={{ color: 'var(--tinta-fraca)', fontSize: 12 }}>{s.setor_informado}</div>
                        )}
                      </td>
                      <td>
                        {s.colaborador_nome || (
                          <span style={{ color: 'var(--ambar)', fontSize: 12.5 }}>Não vinculado</span>
                        )}
                      </td>
                      <td className="num">{s.qtd_itens}</td>
                      <td className="num">{s.qtd_fotos}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {new Date(s.enviado_em).toLocaleDateString('pt-BR')}
                        {s.dias_parado > 3 && s.status === 'pendente' && (
                          <div style={{ color: 'var(--ambar)', fontSize: 11 }}>há {s.dias_parado} dias</div>
                        )}
                      </td>
                      <td><Estado valor={s.status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-p" onClick={() => setAberta(s)}>Conferir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {aberta && (
        <Conferencia submissao={aberta} podeEditar={podeEditar}
                     aoFechar={() => setAberta(null)}
                     aoMudar={() => { setAberta(null); carregar(); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Conferencia({ submissao, podeEditar, aoFechar, aoMudar }) {
  const [itens, setItens] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [colaboradorId, setColaboradorId] = useState(submissao.colaborador_id || '');
  const [gerarTermo, setGerarTermo] = useState(true);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    itensDaSubmissao(submissao.id).then(({ data }) => setItens(data || []));
    listarColaboradores().then(({ data }) => setColaboradores(data || []));
  }, [submissao.id]);

  async function aprovar() {
    setErro('');
    if (!colaboradorId) { setErro('Vincule a declaração a um colaborador antes de aprovar.'); return; }

    setOcupado(true);
    if (colaboradorId !== submissao.colaborador_id) {
      const { error } = await vincularColaborador(submissao.id, colaboradorId);
      if (error) { setErro('Não foi possível vincular o colaborador.'); setOcupado(false); return; }
    }

    const { data, error } = await aprovarSubmissao(submissao.id, gerarTermo);
    if (error) {
      setErro(error.message?.includes('permissão')
        ? 'Seu perfil não permite aprovar declarações.'
        : 'Não foi possível aprovar a declaração.');
      setOcupado(false);
      return;
    }

    setOk(`Aprovada. ${data.bens_criados} ${data.bens_criados === 1 ? 'bem criado' : 'bens criados'}, ` +
          `${data.bens_vinculados} ${data.bens_vinculados === 1 ? 'vinculado' : 'vinculados'}` +
          (data.termo_id ? ' e termo gerado em rascunho.' : '.'));
    setOcupado(false);
    setTimeout(aoMudar, 1400);
  }

  async function rejeitar() {
    if (!motivo.trim()) { setErro('Descreva o motivo da recusa.'); return; }
    setOcupado(true);
    const { error } = await rejeitarSubmissao(submissao.id, motivo);
    if (error) { setErro('Não foi possível rejeitar.'); setOcupado(false); return; }
    aoMudar();
  }

  const pendente = submissao.status === 'pendente' || submissao.status === 'em_analise';

  return (
    <Modal largo titulo={`Declaração ${submissao.protocolo}`} aoFechar={aoFechar}
      rodape={
        podeEditar && pendente ? (
          <>
            <button className="btn btn-perigo" onClick={rejeitar} disabled={ocupado}>Rejeitar</button>
            <button className="btn btn-principal" onClick={aprovar} disabled={ocupado}>
              {ocupado ? 'Processando…' : 'Aprovar e registrar'}
            </button>
          </>
        ) : <button className="btn" onClick={aoFechar}>Fechar</button>
      }>
      <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>
      <Aviso tipo="ok" aoFechar={() => setOk('')}>{ok}</Aviso>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Estado valor={submissao.status} />
        <span style={{ fontSize: 13 }}><strong>{submissao.nome_informado}</strong></span>
        <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>
          {submissao.setor_informado || 'Setor não informado'}
          {submissao.local_informado ? ` · ${submissao.local_informado}` : ''}
          {' · '}
          {new Date(submissao.enviado_em).toLocaleString('pt-BR')}
        </span>
      </div>

      {submissao.observacoes && (
        <p style={{ background: 'var(--papel)', padding: '10px 12px', borderRadius: 'var(--r)',
                    fontSize: 13, color: 'var(--tinta-media)', margin: '0 0 16px' }}>
          {submissao.observacoes}
        </p>
      )}

      {podeEditar && pendente && (
        <div className="campo">
          <label>Vincular a qual colaborador</label>
          <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)}>
            <option value="">Selecione</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}{c.setor ? ` — ${c.setor}` : ''}</option>
            ))}
          </select>
          <div className="ajuda">
            O nome digitado pelo colaborador é só texto. O vínculo com o cadastro é feito aqui.
          </div>
        </div>
      )}

      <h3 style={{ margin: '16px 0 8px' }}>Itens declarados</h3>
      {!itens ? <Carregando /> : (
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Etiqueta informada</th><th>Descrição</th><th>Marca / Modelo</th>
                <th>Estado</th><th>Fotos</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.codigo_informado
                      ? <Etiqueta codigo={i.codigo_informado} />
                      : <span style={{ color: 'var(--ambar)', fontSize: 12 }}>Sem etiqueta</span>}
                  </td>
                  <td>
                    {i.descricao}
                    {i.observacao && (
                      <div style={{ color: 'var(--tinta-fraca)', fontSize: 12 }}>{i.observacao}</div>
                    )}
                  </td>
                  <td style={{ color: 'var(--tinta-media)' }}>
                    {[i.marca, i.modelo].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td><Estado valor={i.estado_conservacao} /></td>
                  <td>
                    <div className="tira-fotos">
                      {(i.submissao_fotos || []).map((f) => (
                        <a key={f.id} href={urlDaFoto(f.storage_key)} target="_blank" rel="noreferrer"
                           className="miniatura" style={{ width: 52, height: 52 }}>
                          <img src={urlDaFoto(f.storage_key)} alt="Foto declarada" loading="lazy" />
                        </a>
                      ))}
                      {!(i.submissao_fotos || []).length && (
                        <span style={{ color: 'var(--tinta-fraca)', fontSize: 12 }}>—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {podeEditar && pendente && (
        <>
          <div className="campo" style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={gerarTermo} style={{ width: 'auto' }}
                     onChange={(e) => setGerarTermo(e.target.checked)} />
              Gerar termo de responsabilidade ao aprovar
            </label>
          </div>

          <div className="campo">
            <label>Motivo, caso rejeite</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)}
                   placeholder="Ex.: itens já constam em outro termo" />
          </div>

          <Aviso tipo="atencao">
            Ao aprovar, os itens sem etiqueta recebem um código provisório e passam a constar
            no patrimônio como entregues a esse colaborador.
          </Aviso>
        </>
      )}

      {submissao.status === 'rejeitada' && submissao.motivo_rejeicao && (
        <Aviso tipo="erro">Rejeitada: {submissao.motivo_rejeicao}</Aviso>
      )}
    </Modal>
  );
}
