import { useEffect } from 'react';

/** Etiqueta patrimonial — sempre em monoespaçada, como na plaqueta física. */
export function Etiqueta({ codigo }) {
  if (!codigo) return <span style={{ color: 'var(--tinta-fraca)' }}>—</span>;
  // Códigos AD- nasceram de autodeclaração sem etiqueta: ainda faltam plaquetar.
  const provisoria = codigo.startsWith('AD-');
  return (
    <span className={`etiqueta${provisoria ? ' provisoria' : ''}`}
          title={provisoria ? 'Código provisório — este bem ainda precisa ser etiquetado' : undefined}>
      {codigo}
    </span>
  );
}

const NOMES = {
  em_uso: 'Em uso', disponivel: 'Disponível', manutencao: 'Manutenção',
  emprestado: 'Emprestado', baixado: 'Baixado',
  pendente: 'Pendente', em_analise: 'Em análise', aprovada: 'Aprovada', rejeitada: 'Rejeitada',
  rascunho: 'Rascunho', emitido: 'Emitido', assinado: 'Assinado',
  devolvido: 'Devolvido', cancelado: 'Cancelado',
  novo: 'Novo', otimo: 'Ótimo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim', inservivel: 'Inservível'
};

export function Estado({ valor }) {
  if (!valor) return null;
  return <span className={`marca-estado e-${valor}`}>{NOMES[valor] || valor}</span>;
}

export function Carregando({ texto = 'Carregando…' }) {
  return <div className="carregando">{texto}</div>;
}

export function Vazio({ titulo, descricao, acao }) {
  return (
    <div className="vazio">
      <strong>{titulo}</strong>
      <p style={{ margin: '0 0 14px' }}>{descricao}</p>
      {acao}
    </div>
  );
}

export function Aviso({ tipo = 'erro', children, aoFechar }) {
  if (!children) return null;
  return (
    <div className={`aviso aviso-${tipo}`}
         style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>{children}</span>
      {aoFechar && <button className="fechar" onClick={aoFechar} aria-label="Fechar">×</button>}
    </div>
  );
}

export function Modal({ titulo, largo, aoFechar, children, rodape }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aoFechar]);

  return (
    <div className="fundo-modal" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className={`modal${largo ? ' largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cabeca">
          <h2>{titulo}</h2>
          <button className="fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-pe">{rodape}</div>}
      </div>
    </div>
  );
}

export const moeda = (v) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const data = (d) => (d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—');

export const numero = (v, casas = 0) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 3 });
