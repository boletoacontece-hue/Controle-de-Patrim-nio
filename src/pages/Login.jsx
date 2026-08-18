import { useState } from 'react';
import { sb } from '../lib/supabase';
import { Aviso } from '../components/Comuns';
import logo from '../lib/logo-acontece-cor.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro(error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : 'Não foi possível entrar. Tente novamente em instantes.');
      setEnviando(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 372 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <img src={logo} alt="Acontece Imobiliária — Financeiro"
               style={{ width: 150, height: 'auto', margin: '0 auto 18px', display: 'block' }} />
          <h1>Controle de Ativos</h1>
          <p style={{ color: 'var(--tinta-media)', margin: '4px 0 0', fontSize: 13.5 }}>
            Acontece Assessoria e Planejamento Imobiliário
          </p>
        </div>

        <div className="cartao">
          <form className="cartao-corpo" onSubmit={entrar}>
            <Aviso tipo="erro" aoFechar={() => setErro('')}>{erro}</Aviso>

            <div className="campo">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" value={email} required autoComplete="username"
                     onChange={(e) => setEmail(e.target.value)} placeholder="nome@acontece.com" />
            </div>

            <div className="campo">
              <label htmlFor="senha">Senha</label>
              <input id="senha" type="password" value={senha} required autoComplete="current-password"
                     onChange={(e) => setSenha(e.target.value)} />
            </div>

            <button className="btn btn-principal" style={{ width: '100%', justifyContent: 'center' }}
                    disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--tinta-fraca)', fontSize: 12, marginTop: 14 }}>
          O acesso é liberado pelo setor Financeiro.
        </p>
      </div>
    </div>
  );
}
