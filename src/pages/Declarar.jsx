import { useEffect, useState } from 'react';
import { sb } from '../lib/supabase';
import { enviarFotoDeColeta } from '../lib/storage';
import { Carregando, Aviso } from '../components/Comuns';

/**
 * Página pública. Não exige login e não lê nada do banco: as duas únicas
 * chamadas permitidas ao papel `anon` são abrir_convite e enviar_submissao.
 */

const ITEM_VAZIO = () => ({
  chave: Math.random().toString(36).slice(2),
  grupo: 'mobiliario', codigo: '', descricao: '', marca: '', modelo: '',
  numero_serie: '', estado: 'bom', observacao: '', fotos: [], enviandoFoto: false
});

export default function Declarar() {
  const token = new URLSearchParams(window.location.hash.split('?')[1] || '').get('t');

  const [convite, setConvite] = useState(undefined);
  const [form, setForm] = useState({ nome: '', setor: '', email: '', local: '', observacoes: '' });
  const [itens, setItens] = useState([ITEM_VAZIO()]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [protocolo, setProtocolo] = useState('');

  useEffect(() => {
    if (!token) { setConvite({ valido: false, motivo: 'Link incompleto. Confira o endereço recebido.' }); return; }
    sb.rpc('abrir_convite', { p_token: token }).then(({ data, error }) => {
      // Resposta vazia ou inesperada não pode virar tela branca: o colaborador
      // precisa sempre ver uma explicação e a quem recorrer.
      if (error || !data || typeof data.valido !== 'boolean') {
        setConvite({ valido: false, motivo: 'Não foi possível abrir o formulário. Tente de novo em alguns minutos ou avise o setor Financeiro.' });
        return;
      }
      setConvite(data);
      if (data.valido) setForm((f) => ({ ...f, nome: data.nome || '', setor: data.setor || '' }));
    });
  }, [token]);

  function alterarItem(chave, campo, valor) {
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));
  }

  async function anexarFoto(chave, arquivos) {
    const lista = Array.from(arquivos || []);
    if (!lista.length) return;
    alterarItem(chave, 'enviandoFoto', true);
    setErro('');
    try {
      for (const arquivo of lista.slice(0, 5)) {
        const { key } = await enviarFotoDeColeta(arquivo, token);
        setItens((atual) => atual.map((i) =>
          i.chave === chave ? { ...i, fotos: [...i.fotos, { key }] } : i));
      }
    } catch (e) {
      setErro(e.message);
    }
    alterarItem(chave, 'enviandoFoto', false);
  }

  async function enviar(e) {
    e.preventDefault();
    setErro('');

    const validos = itens.filter((i) => i.descricao.trim());
    if (!validos.length) { setErro('Descreva ao menos um item.'); return; }
    if (!form.nome.trim()) { setErro('Informe seu nome.'); return; }

    setEnviando(true);
    const { data, error } = await sb.rpc('enviar_submissao', {
      p_token: token,
      p_dados: {
        ...form,
        itens: validos.map((i) => ({
          grupo: i.grupo, codigo: i.codigo, descricao: i.descricao, marca: i.marca,
          modelo: i.modelo, numero_serie: i.numero_serie, estado: i.estado,
          observacao: i.observacao, fotos: i.fotos
        }))
      },
      p_user_agent: navigator.userAgent
    });

    if (error) {
      setErro(error.message?.replace(/^.*?:\s*/, '') || 'Não foi possível enviar. Tente novamente.');
      setEnviando(false);
      return;
    }
    setProtocolo(data.protocolo);
  }

  if (convite === undefined) return <Carregando texto="Abrindo o formulário…" />;

  if (!convite?.valido) {
    return (
      <div className="publica">
        <div className="publica-topo">
          <h1>Link indisponível</h1>
          <p>{convite.motivo}</p>
        </div>
      </div>
    );
  }

  if (protocolo) {
    return (
      <div className="publica">
        <div className="publica-topo">
          <h1>Declaração recebida</h1>
          <p>Guarde o número do protocolo abaixo.</p>
          <div className="protocolo">{protocolo}</div>
          <p style={{ marginTop: 16 }}>
            O setor Financeiro vai conferir os itens e, se for o caso, emitir o termo de
            responsabilidade para você assinar. Não é preciso fazer mais nada agora.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="publica">
      <div className="publica-topo">
        <h1>Olá, {convite.nome?.split(' ')[0]}</h1>
        <p>
          Relacione os bens da Acontece que estão com você hoje — móveis, equipamentos ou veículo.
          Leva poucos minutos e o envio é feito uma única vez.
        </p>
      </div>

      <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>

      <form onSubmit={enviar}>
        <div className="cartao" style={{ marginBottom: 18 }}>
          <div className="cartao-corpo">
            <div className="linha">
              <div className="campo">
                <label>Seu nome</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>Setor</label>
                <input value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} />
              </div>
            </div>
            <div className="linha">
              <div className="campo">
                <label>E-mail</label>
                <input type="email" value={form.email}
                       onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="campo">
                <label>Onde os bens ficam</label>
                <input value={form.local} placeholder="Ex.: Sala 4 — Comercial"
                       onChange={(e) => setForm({ ...form, local: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        <h2 style={{ marginBottom: 10 }}>Itens em seu poder</h2>

        {itens.map((item, indice) => (
          <div className="item-declarado" key={item.chave}>
            <span className="ordem">Item {String(indice + 1).padStart(2, '0')}</span>
            {itens.length > 1 && (
              <button type="button" className="remover"
                      onClick={() => setItens(itens.filter((i) => i.chave !== item.chave))}>
                Remover
              </button>
            )}

            <div className="campo">
              <label>O que é</label>
              <input value={item.descricao} placeholder="Ex.: Notebook Dell, cadeira giratória, veículo"
                     onChange={(e) => alterarItem(item.chave, 'descricao', e.target.value)} />
            </div>

            <div className="linha">
              <div className="campo">
                <label>Número da etiqueta</label>
                <input value={item.codigo} placeholder="Se houver plaqueta colada"
                       style={{ fontFamily: 'var(--mono)' }}
                       onChange={(e) => alterarItem(item.chave, 'codigo', e.target.value)} />
                <div className="ajuda">Deixe em branco se o item não tiver etiqueta.</div>
              </div>
              <div className="campo">
                <label>Tipo</label>
                <select value={item.grupo} onChange={(e) => alterarItem(item.chave, 'grupo', e.target.value)}>
                  <option value="mobiliario">Móvel ou equipamento</option>
                  <option value="imobilizado">Veículo</option>
                </select>
              </div>
            </div>

            <div className="linha-3">
              <div className="campo">
                <label>Marca</label>
                <input value={item.marca} onChange={(e) => alterarItem(item.chave, 'marca', e.target.value)} />
              </div>
              <div className="campo">
                <label>Modelo</label>
                <input value={item.modelo} onChange={(e) => alterarItem(item.chave, 'modelo', e.target.value)} />
              </div>
              <div className="campo">
                <label>Estado de conservação</label>
                <select value={item.estado} onChange={(e) => alterarItem(item.chave, 'estado', e.target.value)}>
                  <option value="novo">Novo</option>
                  <option value="otimo">Ótimo</option>
                  <option value="bom">Bom</option>
                  <option value="regular">Regular</option>
                  <option value="ruim">Ruim</option>
                </select>
              </div>
            </div>

            <div className="campo">
              <label>Alguma avaria ou observação</label>
              <input value={item.observacao} placeholder="Opcional"
                     onChange={(e) => alterarItem(item.chave, 'observacao', e.target.value)} />
            </div>

            <div className="campo">
              <label>Fotos {item.fotos.length > 0 && `(${item.fotos.length})`}</label>
              <input type="file" accept="image/*" multiple capture="environment"
                     disabled={item.enviandoFoto || item.fotos.length >= 5}
                     onChange={(e) => { anexarFoto(item.chave, e.target.files); e.target.value = ''; }} />
              <div className="ajuda">
                {item.enviandoFoto
                  ? 'Enviando…'
                  : 'Fotografe o item e a etiqueta, se houver. Até 5 fotos.'}
              </div>
            </div>
          </div>
        ))}

        <button type="button" className="btn" style={{ marginBottom: 20 }}
                onClick={() => setItens([...itens, ITEM_VAZIO()])}>
          Adicionar outro item
        </button>

        <div className="campo">
          <label>Quer acrescentar alguma coisa?</label>
          <textarea value={form.observacoes} placeholder="Opcional"
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>

        <button className="btn btn-principal" disabled={enviando}
                style={{ width: '100%', justifyContent: 'center', padding: 11 }}>
          {enviando ? 'Enviando…' : 'Enviar declaração'}
        </button>

        <p style={{ textAlign: 'center', color: 'var(--tinta-fraca)', fontSize: 12, marginTop: 12 }}>
          Confira antes de enviar: o link permite um único envio.
        </p>
      </form>
    </div>
  );
}
