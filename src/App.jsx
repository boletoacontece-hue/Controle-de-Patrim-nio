import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { sb, temAcesso, papelDoUsuario, listarPendencias, faltaConfiguracao } from './lib/supabase';
import { Carregando } from './components/Comuns';
import logoBranca from './lib/logo-acontece-branca.png';

import Login from './pages/Login';
import Painel from './pages/Painel';
import Bens from './pages/Bens';
import Estoque from './pages/Estoque';
import Termos from './pages/Termos';
import Triagem from './pages/Triagem';
import Convites from './pages/Convites';
import Colaboradores from './pages/Colaboradores';
import Declarar from './pages/Declarar';

function ConfiguracaoAusente() {
  return (
    <div style={{ maxWidth: 520, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ marginBottom: 12 }}>Configuração incompleta</h1>
      <p style={{ color: 'var(--tinta-media)' }}>
        O sistema não recebeu o endereço do banco de dados e por isso não consegue iniciar.
      </p>
      <p style={{ color: 'var(--tinta-media)', fontSize: 13 }}>
        Quem administra o sistema precisa definir <code>VITE_SUPABASE_URL</code> e{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> — no arquivo <code>.env</code> para execução local,
        ou nos secrets do GitHub Actions para a versão publicada. Após cadastrar, é necessário
        publicar novamente.
      </p>
    </div>
  );
}

export default function App() {
  const [sessao, setSessao] = useState(undefined); // undefined = ainda verificando
  const [acesso, setAcesso] = useState(null);
  const local = useLocation();

  // A página de autodeclaração é pública: não passa pelo portão de login.
  const ehPublica = local.pathname.startsWith('/declarar');

  useEffect(() => {
    if (faltaConfiguracao) return;
    sb.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao?.user?.email) { setAcesso(null); return; }
    (async () => {
      const liberado = await temAcesso();
      if (!liberado) { setAcesso({ autorizado: false }); return; }
      const registro = await papelDoUsuario(sessao.user.email);
      // Quem não é admin não consegue ler a allowlist; nesse caso o acesso
      // já foi confirmado pela leitura das demais tabelas.
      setAcesso({
        autorizado: true,
        papel: registro?.papel || 'gestor',
        nome: registro?.nome || sessao.user.email
      });
    })();
  }, [sessao]);

  if (faltaConfiguracao) return <ConfiguracaoAusente />;

  if (ehPublica) {
    return (
      <Routes>
        <Route path="/declarar" element={<Declarar />} />
        <Route path="/declarar/*" element={<Declarar />} />
      </Routes>
    );
  }

  if (sessao === undefined) return <Carregando texto="Verificando acesso…" />;
  if (!sessao) return <Login />;
  if (!acesso) return <Carregando texto="Conferindo permissões…" />;

  if (!acesso.autorizado) {
    return (
      <div style={{ maxWidth: 460, margin: '84px auto', padding: 20, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 10 }}>Acesso não liberado</h1>
        <p style={{ color: 'var(--tinta-media)' }}>
          A conta <strong>{sessao.user.email}</strong> ainda não está autorizada neste sistema.
          Peça ao setor Financeiro para incluir seu e-mail.
        </p>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => sb.auth.signOut()}>
          Entrar com outra conta
        </button>
      </div>
    );
  }

  return <Casca acesso={acesso} />;
}

function Casca({ acesso }) {
  const [pendencias, setPendencias] = useState(0);
  const podeEditar = acesso.papel === 'admin' || acesso.papel === 'gestor';

  useEffect(() => {
    listarPendencias().then(({ data }) => setPendencias(data?.length || 0));
  }, []);

  return (
    <div className="casca">
      <nav className="lateral">
        <div className="marca">
          <img src={logoBranca} alt="Acontece Imobiliária — Financeiro" className="marca-logo" />
          <strong>Controle de Ativos</strong>
        </div>

        <div className="menu">
          <div className="menu-grupo">Visão geral</div>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'ativo' : '')}>
            Painel
            {pendencias > 0 && <span className="selo">{pendencias}</span>}
          </NavLink>

          <div className="menu-grupo">Patrimônio</div>
          <NavLink to="/mobiliario" className={({ isActive }) => (isActive ? 'ativo' : '')}>Mobiliário</NavLink>
          <NavLink to="/imobilizado" className={({ isActive }) => (isActive ? 'ativo' : '')}>Imobilizado</NavLink>
          <NavLink to="/estoque" className={({ isActive }) => (isActive ? 'ativo' : '')}>Limpeza e utensílios</NavLink>

          <div className="menu-grupo">Pessoas</div>
          <NavLink to="/colaboradores" className={({ isActive }) => (isActive ? 'ativo' : '')}>Colaboradores</NavLink>

          <div className="menu-grupo">Documentos</div>
          <NavLink to="/termos" className={({ isActive }) => (isActive ? 'ativo' : '')}>Termos</NavLink>
          <NavLink to="/triagem" className={({ isActive }) => (isActive ? 'ativo' : '')}>Autodeclarações</NavLink>
          {podeEditar && (
            <NavLink to="/convites" className={({ isActive }) => (isActive ? 'ativo' : '')}>Links de coleta</NavLink>
          )}
        </div>

        <div className="rodape-lateral">
          {acesso.nome}
          <div style={{ textTransform: 'capitalize', fontSize: 11 }}>{acesso.papel}</div>
          <button onClick={() => sb.auth.signOut()}>Sair</button>
        </div>
      </nav>

      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/mobiliario" element={<Bens grupo="mobiliario" podeEditar={podeEditar} />} />
          <Route path="/imobilizado" element={<Bens grupo="imobilizado" podeEditar={podeEditar} />} />
          <Route path="/estoque" element={<Estoque podeEditar={podeEditar} />} />
          <Route path="/colaboradores" element={<Colaboradores podeEditar={podeEditar} />} />
          <Route path="/termos" element={<Termos podeEditar={podeEditar} />} />
          <Route path="/triagem" element={<Triagem podeEditar={podeEditar} />} />
          <Route path="/convites" element={<Convites />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
