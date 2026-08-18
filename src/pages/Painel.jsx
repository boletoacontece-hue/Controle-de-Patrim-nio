import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, listarPendencias } from '../lib/supabase';
import { Carregando, Vazio, moeda } from '../components/Comuns';

const ROTULOS = {
  termo_sem_assinatura: 'Termo sem assinatura',
  bem_com_desligado: 'Bem com colaborador desligado',
  estoque_abaixo_minimo: 'Estoque abaixo do mínimo'
};

export default function Painel() {
  const [dados, setDados] = useState(null);
  const [pendencias, setPendencias] = useState([]);

  useEffect(() => {
    (async () => {
      const [bens, estoque, submissoes, pend] = await Promise.all([
        sb.from('bens').select('grupo, situacao, valor_aquisicao'),
        sb.from('vw_estoque_saldo').select('abaixo_minimo, valor_em_estoque').eq('ativo', true),
        sb.from('submissoes').select('status').eq('status', 'pendente'),
        listarPendencias()
      ]);

      const lista = bens.data || [];
      setDados({
        mobiliario: lista.filter((b) => b.grupo === 'mobiliario' && b.situacao !== 'baixado').length,
        imobilizado: lista.filter((b) => b.grupo === 'imobilizado' && b.situacao !== 'baixado').length,
        emUso: lista.filter((b) => b.situacao === 'em_uso').length,
        valor: lista.filter((b) => b.situacao !== 'baixado')
                    .reduce((s, b) => s + Number(b.valor_aquisicao || 0), 0),
        reposicao: (estoque.data || []).filter((i) => i.abaixo_minimo).length,
        aguardando: (submissoes.data || []).length
      });
      setPendencias(pend.data || []);
    })();
  }, []);

  if (!dados) return <Carregando />;

  return (
    <>
      <header className="topo">
        <div>
          <h1>Painel</h1>
          <p>Situação do patrimônio e o que precisa de atenção</p>
        </div>
      </header>

      <div className="corpo">
        <div className="indicadores">
          <div className="indicador">
            <div className="rotulo">Mobiliário</div>
            <div className="valor">{dados.mobiliario}</div>
          </div>
          <div className="indicador">
            <div className="rotulo">Imobilizado</div>
            <div className="valor">{dados.imobilizado}</div>
          </div>
          <div className="indicador">
            <div className="rotulo">Bens em uso</div>
            <div className="valor">{dados.emUso}</div>
          </div>
          <div className="indicador">
            <div className="rotulo">Valor de aquisição</div>
            <div className="valor" style={{ fontSize: 17 }}>{moeda(dados.valor)}</div>
          </div>
          <div className={`indicador${dados.reposicao ? ' alerta' : ''}`}>
            <div className="rotulo">A repor</div>
            <div className="valor">{dados.reposicao}</div>
          </div>
          <div className={`indicador${dados.aguardando ? ' alerta' : ''}`}>
            <div className="rotulo">Declarações a conferir</div>
            <div className="valor">{dados.aguardando}</div>
          </div>
        </div>

        <div className="cartao">
          <div className="cartao-cabeca">
            <h2>Pendências</h2>
            {pendencias.length > 0 && (
              <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>
                {pendencias.length} {pendencias.length === 1 ? 'item' : 'itens'}
              </span>
            )}
          </div>

          {pendencias.length === 0 ? (
            <Vazio titulo="Nada pendente"
                   descricao="Todos os termos estão assinados e o estoque está acima do mínimo." />
          ) : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Referência</th>
                    <th>Colaborador</th>
                    <th>Descrição</th>
                    <th className="num">Dias</th>
                  </tr>
                </thead>
                <tbody>
                  {pendencias.map((p, i) => (
                    <tr key={i}>
                      <td>{ROTULOS[p.tipo] || p.tipo}</td>
                      <td><span className="etiqueta">{p.identificacao}</span></td>
                      <td>{p.colaborador || '—'}</td>
                      <td style={{ color: 'var(--tinta-media)' }}>{p.descricao}</td>
                      <td className="num">{p.dias ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <Link className="btn" to="/triagem">Conferir autodeclarações</Link>
          <Link className="btn" to="/termos">Emitir termo</Link>
          <Link className="btn" to="/estoque">Repor estoque</Link>
        </div>
      </div>
    </>
  );
}
