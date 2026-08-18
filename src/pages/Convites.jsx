import { useEffect, useState, useCallback } from 'react';
import { listarConvites, criarConvite, revogarConvite, listarColaboradores } from '../lib/supabase';
import { Carregando, Vazio, Modal, Aviso, data } from '../components/Comuns';

const enderecoDoLink = (token) =>
  `${window.location.origin}${window.location.pathname}#/declarar?t=${token}`;

export default function Convites() {
  const [convites, setConvites] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState('');

  const carregar = useCallback(async () => {
    const { data: lista } = await listarConvites();
    setConvites(lista || []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function copiar(token) {
    try {
      await navigator.clipboard.writeText(enderecoDoLink(token));
      setCopiado(token);
      setTimeout(() => setCopiado(''), 2000);
    } catch {
      window.prompt('Copie o link:', enderecoDoLink(token));
    }
  }

  function situacao(c) {
    if (c.revogado) return { texto: 'Cancelado', classe: 'e-cancelado' };
    if (new Date(c.expira_em) < new Date()) return { texto: 'Expirado', classe: 'e-baixado' };
    if (c.usos >= c.usos_max) return { texto: 'Usado', classe: 'e-aprovada' };
    return { texto: 'Ativo', classe: 'e-em_uso' };
  }

  return (
    <>
      <header className="topo">
        <div>
          <h1>Links de coleta</h1>
          <p>Cada colaborador recebe um endereço próprio para declarar o que tem em mãos</p>
        </div>
        <button className="btn btn-principal" onClick={() => setGerando(true)}>Gerar link</button>
      </header>

      <div className="corpo">
        <Aviso tipo="atencao">
          Quem abre o link consegue enviar a declaração, mas não vê nenhum dado do sistema.
          O link vale por 30 dias e queima após o envio.
        </Aviso>

        <div className="cartao">
          <div className="cartao-cabeca">
            <h2>Links gerados</h2>
            {convites && <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>{convites.length} links</span>}
          </div>

          {!convites ? <Carregando /> : convites.length === 0 ? (
            <Vazio titulo="Nenhum link gerado"
                   descricao="Gere um link e envie ao colaborador por e-mail ou mensagem."
                   acao={<button className="btn btn-principal" onClick={() => setGerando(true)}>Gerar link</button>} />
          ) : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Destinatário</th><th>Setor</th><th>Situação</th>
                    <th className="num">Usos</th><th>Validade</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {convites.map((c) => {
                    const s = situacao(c);
                    const ativo = s.texto === 'Ativo';
                    return (
                      <tr key={c.id}>
                        <td>{c.nome_destinatario}</td>
                        <td style={{ color: 'var(--tinta-media)' }}>{c.setor || '—'}</td>
                        <td><span className={`marca-estado ${s.classe}`}>{s.texto}</span></td>
                        <td className="num">{c.usos} / {c.usos_max}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>
                          {data(c.expira_em.slice(0, 10))}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {ativo && (
                            <>
                              <button className="btn btn-p" onClick={() => copiar(c.token)}>
                                {copiado === c.token ? 'Copiado' : 'Copiar link'}
                              </button>
                              <button className="btn btn-p btn-perigo" style={{ marginLeft: 6 }}
                                      onClick={async () => { await revogarConvite(c.id); carregar(); }}>
                                Cancelar
                              </button>
                            </>
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
      </div>

      {gerando && <FormConvite aoFechar={() => setGerando(false)}
                               aoGerar={() => { setGerando(false); carregar(); }} />}
    </>
  );
}

function FormConvite({ aoFechar, aoGerar }) {
  const [colaboradores, setColaboradores] = useState([]);
  const [escolhido, setEscolhido] = useState('');
  const [link, setLink] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { listarColaboradores().then(({ data }) => setColaboradores(data || [])); }, []);

  async function gerar(e) {
    e.preventDefault();
    setErro('');
    const colaborador = colaboradores.find((c) => c.id === escolhido);
    if (!colaborador) { setErro('Escolha o colaborador.'); return; }

    setSalvando(true);
    const { data, error } = await criarConvite(colaborador);
    if (error) { setErro('Não foi possível gerar o link.'); setSalvando(false); return; }
    setLink(enderecoDoLink(data.token));
    setSalvando(false);
  }

  return (
    <Modal titulo="Gerar link de coleta" aoFechar={aoFechar}
      rodape={link
        ? <button className="btn btn-principal" onClick={aoGerar}>Concluir</button>
        : <>
            <button className="btn" onClick={aoFechar}>Cancelar</button>
            <button className="btn btn-principal" onClick={gerar} disabled={salvando}>
              {salvando ? 'Gerando…' : 'Gerar link'}
            </button>
          </>}>
      {link ? (
        <>
          <Aviso tipo="ok">Link criado. Envie ao colaborador.</Aviso>
          <div className="campo">
            <label>Endereço</label>
            <input readOnly value={link} onFocus={(e) => e.target.select()}
                   style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
            <div className="ajuda">Vale por 30 dias e permite um único envio.</div>
          </div>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(link)}>Copiar</button>
        </>
      ) : (
        <form onSubmit={gerar}>
          <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>
          <div className="campo">
            <label>Colaborador</label>
            <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} required>
              <option value="">Selecione</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}{c.setor ? ` — ${c.setor}` : ''}</option>
              ))}
            </select>
          </div>
        </form>
      )}
    </Modal>
  );
}
