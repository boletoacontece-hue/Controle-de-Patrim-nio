import { useEffect, useState, useCallback } from 'react';
import {
  listarTodosColaboradores, salvarColaborador, bensDoColaborador, listarLocalizacoes
} from '../lib/supabase';
import { Etiqueta, Estado, Carregando, Vazio, Modal, Aviso, data } from '../components/Comuns';

export default function Colaboradores({ podeEditar }) {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const { data: registros, error } = await listarTodosColaboradores(busca);
    if (error) { setErro('Não foi possível carregar a lista.'); return; }
    setLista(registros || []);
  }, [busca]);

  useEffect(() => {
    setLista(null);
    const t = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  const visiveis = (lista || []).filter((c) => mostrarInativos || c.ativo);

  return (
    <>
      <header className="topo">
        <div>
          <h1>Colaboradores</h1>
          <p>Quem pode receber bens e assinar termos de responsabilidade</p>
        </div>
        {podeEditar && (
          <button className="btn btn-principal" onClick={() => setEditando({})}>
            Cadastrar colaborador
          </button>
        )}
      </header>

      <div className="corpo">
        <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>

        <div className="cartao">
          <div className="cartao-cabeca">
            <div className="filtros">
              <input placeholder="Buscar por nome, CPF, matrícula ou setor"
                     value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 280 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={mostrarInativos}
                       onChange={(e) => setMostrarInativos(e.target.checked)} />
                Mostrar desligados
              </label>
            </div>
            {lista && <span style={{ color: 'var(--tinta-media)', fontSize: 12.5 }}>{visiveis.length} pessoas</span>}
          </div>

          {!lista ? <Carregando /> : visiveis.length === 0 ? (
            <Vazio
              titulo={busca ? 'Ninguém encontrado' : 'Nenhum colaborador cadastrado'}
              descricao={busca
                ? 'Ajuste a busca ou marque a opção de mostrar desligados.'
                : 'Cadastre as pessoas que recebem bens da empresa. Sem elas, não é possível emitir termos nem gerar links de coleta.'}
              acao={podeEditar && !busca &&
                <button className="btn btn-principal" onClick={() => setEditando({})}>Cadastrar colaborador</button>}
            />
          ) : (
            <div className="rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th><th>CPF</th><th>Cargo</th><th>Setor</th>
                    <th>Admissão</th><th>Situação</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => (
                    <tr key={c.id} style={{ opacity: c.ativo ? 1 : 0.6 }}>
                      <td>{c.nome}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{c.cpf || '—'}</td>
                      <td style={{ color: 'var(--tinta-media)' }}>{c.cargo || '—'}</td>
                      <td style={{ color: 'var(--tinta-media)' }}>{c.setor || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{data(c.data_admissao)}</td>
                      <td>
                        <span className={`marca-estado ${c.ativo ? 'e-em_uso' : 'e-baixado'}`}>
                          {c.ativo ? 'Ativo' : 'Desligado'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-p" onClick={() => setEditando(c)}>
                          {podeEditar ? 'Abrir' : 'Ver'}
                        </button>
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
        <FormColaborador colaborador={editando} podeEditar={podeEditar}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); carregar(); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

/** Máscara de CPF conforme digita, sem impedir colar. */
function formatarCPF(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Validação real dos dígitos verificadores — evita CPF digitado errado. */
function cpfValido(cpf) {
  const d = (cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (base, peso) => {
    const soma = base.split('').reduce((s, n, i) => s + Number(n) * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(d.slice(0, 9), 10) === Number(d[9]) &&
         digito(d.slice(0, 10), 11) === Number(d[10]);
}

function FormColaborador({ colaborador, podeEditar, aoFechar, aoSalvar }) {
  const [form, setForm] = useState({
    nome: '', cpf: '', matricula: '', cargo: '', setor: '', email: '', telefone: '',
    data_admissao: '', data_desligamento: '', localizacao_id: '', ativo: true,
    ...colaborador
  });
  const [locais, setLocais] = useState([]);
  const [bens, setBens] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    listarLocalizacoes().then(({ data }) => setLocais(data || []));
    if (colaborador.id) bensDoColaborador(colaborador.id).then(({ data }) => setBens(data || []));
  }, [colaborador.id]);

  const alterar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    setErro('');

    if (!form.nome.trim()) { setErro('Informe o nome do colaborador.'); return; }
    // CPF é opcional, mas se preenchido precisa ser válido: ele vai impresso no
    // termo de responsabilidade, e um número errado enfraquece o documento.
    if (form.cpf && !cpfValido(form.cpf)) {
      setErro('O CPF informado não é válido. Confira os números.');
      return;
    }
    if (!form.ativo && bens?.length) {
      setErro(`Este colaborador ainda tem ${bens.length} ${bens.length === 1 ? 'bem' : 'bens'} sob responsabilidade. Registre a devolução antes de marcar como desligado.`);
      return;
    }

    setSalvando(true);
    const payload = {
      ...form,
      cpf: form.cpf || null,
      matricula: form.matricula || null,
      email: form.email || null,
      data_admissao: form.data_admissao || null,
      data_desligamento: form.data_desligamento || null,
      localizacao_id: form.localizacao_id || null
    };

    const { error } = await salvarColaborador(payload);
    if (error) {
      setErro(error.code === '23505'
        ? 'Já existe um colaborador com esse CPF ou matrícula.'
        : 'Não foi possível salvar. Confira os campos e tente de novo.');
      setSalvando(false);
      return;
    }
    aoSalvar();
  }

  return (
    <Modal largo titulo={colaborador.id ? form.nome : 'Cadastrar colaborador'} aoFechar={aoFechar}
      rodape={podeEditar ? (
        <>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-principal" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      ) : <button className="btn" onClick={aoFechar}>Fechar</button>}>

      <form onSubmit={salvar}>
        <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>

        <div className="campo">
          <label>Nome completo</label>
          <input value={form.nome} onChange={alterar('nome')} required disabled={!podeEditar}
                 placeholder="Como deve constar no termo de responsabilidade" />
        </div>

        <div className="linha-3">
          <div className="campo">
            <label>CPF</label>
            <input value={form.cpf || ''} disabled={!podeEditar}
                   onChange={(e) => setForm({ ...form, cpf: formatarCPF(e.target.value) })}
                   placeholder="000.000.000-00" style={{ fontFamily: 'var(--mono)' }} />
            <div className="ajuda">Aparece impresso no termo.</div>
          </div>
          <div className="campo">
            <label>Matrícula</label>
            <input value={form.matricula || ''} onChange={alterar('matricula')} disabled={!podeEditar} />
          </div>
          <div className="campo">
            <label>Setor</label>
            <input value={form.setor || ''} onChange={alterar('setor')} disabled={!podeEditar}
                   placeholder="Comercial, Financeiro…" />
          </div>
        </div>

        <div className="linha">
          <div className="campo">
            <label>Cargo</label>
            <input value={form.cargo || ''} onChange={alterar('cargo')} disabled={!podeEditar} />
          </div>
          <div className="campo">
            <label>Local de trabalho</label>
            <select value={form.localizacao_id || ''} onChange={alterar('localizacao_id')} disabled={!podeEditar}>
              <option value="">Não informado</option>
              {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
        </div>

        <div className="linha">
          <div className="campo">
            <label>E-mail</label>
            <input type="email" value={form.email || ''} onChange={alterar('email')} disabled={!podeEditar} />
            <div className="ajuda">Usado para enviar o link de autodeclaração.</div>
          </div>
          <div className="campo">
            <label>Telefone</label>
            <input value={form.telefone || ''} onChange={alterar('telefone')} disabled={!podeEditar} />
          </div>
        </div>

        <div className="linha">
          <div className="campo">
            <label>Data de admissão</label>
            <input type="date" value={form.data_admissao || ''} onChange={alterar('data_admissao')} disabled={!podeEditar} />
          </div>
          <div className="campo">
            <label>Data de desligamento</label>
            <input type="date" value={form.data_desligamento || ''} onChange={alterar('data_desligamento')} disabled={!podeEditar} />
          </div>
        </div>

        {podeEditar && (
          <div className="campo">
            <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={form.ativo} style={{ width: 'auto' }}
                     onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Colaborador ativo
            </label>
            <div className="ajuda">
              Desmarque ao desligar. A pessoa deixa de aparecer nos seletores, mas o
              histórico e os termos assinados permanecem.
            </div>
          </div>
        )}

        {/* Bens sob responsabilidade: é o que trava um desligamento */}
        {colaborador.id && (
          <>
            <h3 style={{ margin: '18px 0 8px' }}>Bens sob responsabilidade</h3>
            {bens === null ? <Carregando /> : bens.length === 0 ? (
              <p style={{ color: 'var(--tinta-fraca)', fontSize: 12.5, margin: 0 }}>
                Nenhum bem em nome desta pessoa.
              </p>
            ) : (
              <>
                <div className="rolagem">
                  <table>
                    <thead>
                      <tr><th>Patrimônio</th><th>Descrição</th><th>Estado</th><th>Local</th></tr>
                    </thead>
                    <tbody>
                      {bens.map((b) => (
                        <tr key={b.id}>
                          <td><Etiqueta codigo={b.codigo_patrimonio} /></td>
                          <td>{b.descricao}</td>
                          <td><Estado valor={b.estado_conservacao} /></td>
                          <td style={{ color: 'var(--tinta-media)' }}>{b.localizacao_nome || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Aviso tipo="atencao">
                  Antes de desligar, registre a devolução de cada bem na aba correspondente.
                </Aviso>
              </>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
