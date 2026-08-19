import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Sem as variáveis, createClient lança exceção e derruba o app inteiro antes
// de renderizar — tela branca, sem explicação. Detectamos aqui e deixamos a
// interface exibir um aviso legível.
export const faltaConfiguracao = !URL || !KEY;

if (faltaConfiguracao) {
  console.error(
    'Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. ' +
    'Local: arquivo .env. Publicado: secrets do GitHub Actions.'
  );
}

// Todo o sistema vive no schema `ativos`, exposto na Data API.
export const sb = createClient(URL || 'https://configuracao-ausente.invalid', KEY || 'sem-chave', {
  db: { schema: 'ativos' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ---------------------------------------------------------------------
// Sessão e papel
// ---------------------------------------------------------------------

export async function papelDoUsuario(email) {
  if (!email) return null;
  const { data, error } = await sb
    .from('usuarios_autorizados')
    .select('papel, nome')
    .ilike('email', email)
    .eq('ativo', true)
    .maybeSingle();
  // Um `consulta` não enxerga a allowlist (política de RLS restringe ao admin).
  // Nesse caso inferimos o acesso pela leitura das demais tabelas.
  if (error || !data) return null;
  return data;
}

export async function temAcesso() {
  const { error } = await sb.from('categorias').select('id').limit(1);
  return !error;
}

export async function podeEditar() {
  // Testa a permissão de escrita sem gravar nada: uma atualização
  // impossível retorna erro de RLS se o papel for apenas consulta.
  const { error } = await sb
    .from('categorias')
    .update({ ativo: true })
    .eq('id', '00000000-0000-0000-0000-000000000000');
  return !error;
}

// ---------------------------------------------------------------------
// Bens
// ---------------------------------------------------------------------

export const listarBens = (grupo, filtros = {}) => {
  let q = sb.from('vw_bens_completo').select('*').eq('grupo', grupo);
  if (filtros.situacao) q = q.eq('situacao', filtros.situacao);
  if (filtros.busca) {
    const b = `%${filtros.busca}%`;
    q = q.or(`descricao.ilike.${b},codigo_patrimonio.ilike.${b},marca.ilike.${b},numero_serie.ilike.${b}`);
  }
  return q.order('codigo_patrimonio');
};

export const salvarBem = (bem) =>
  bem.id
    ? sb.from('bens').update(bem).eq('id', bem.id).select().single()
    : sb.from('bens').insert(bem).select().single();

export const fotosDoBem = (bemId) =>
  sb.from('bem_fotos').select('*').eq('bem_id', bemId).order('ordem');

export const movimentacoesDoBem = (bemId) =>
  sb.from('movimentacoes').select('*').eq('bem_id', bemId).order('data_movimento', { ascending: false });

export const registrarMovimentacao = (mov) =>
  sb.from('movimentacoes').insert(mov).select().single();

// ---------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------

export const listarEstoque = () =>
  sb.from('vw_estoque_saldo').select('*').eq('ativo', true).order('descricao');

export const movimentarEstoque = (mov) =>
  sb.from('estoque_movimentos').insert(mov).select().single();

export const extratoEstoque = (itemId) =>
  sb.from('estoque_movimentos').select('*').eq('item_id', itemId)
    .order('data_movimento', { ascending: false }).limit(100);

// ---------------------------------------------------------------------
// Colaboradores, locais, categorias
// ---------------------------------------------------------------------

export const listarColaboradores = () =>
  sb.from('colaboradores').select('*').eq('ativo', true).order('nome');

/** Inclui desligados — usado na tela de gestão de colaboradores. */
export const listarTodosColaboradores = (busca) => {
  let q = sb.from('colaboradores').select('*');
  if (busca) {
    const b = `%${busca}%`;
    q = q.or(`nome.ilike.${b},cpf.ilike.${b},matricula.ilike.${b},setor.ilike.${b},cargo.ilike.${b}`);
  }
  return q.order('ativo', { ascending: false }).order('nome');
};

export const salvarColaborador = (c) =>
  c.id
    ? sb.from('colaboradores').update(c).eq('id', c.id).select().single()
    : sb.from('colaboradores').insert(c).select().single();

/** Bens sob responsabilidade de uma pessoa — o que trava um desligamento. */
export const bensDoColaborador = (colaboradorId) =>
  sb.from('vw_bens_completo').select('*')
    .eq('responsavel_id', colaboradorId).eq('situacao', 'em_uso')
    .order('codigo_patrimonio');

export const listarLocalizacoes = () =>
  sb.from('localizacoes').select('*').eq('ativo', true).order('nome');

export const listarCategorias = (grupo) => {
  let q = sb.from('categorias').select('*').eq('ativo', true);
  if (grupo) q = q.eq('grupo', grupo);
  return q.order('nome');
};

// ---------------------------------------------------------------------
// Termos
// ---------------------------------------------------------------------

export const listarTermos = () =>
  sb.from('termos').select('*, colaboradores(nome, cpf, cargo, setor)')
    .order('data_emissao', { ascending: false });

export async function criarTermo(colaboradorId, bemIds, observacoes) {
  const { data: numero, error: e1 } = await sb.rpc('proximo_numero_termo');
  if (e1) throw e1;

  const { data: termo, error: e2 } = await sb.from('termos')
    .insert({ numero, colaborador_id: colaboradorId, status: 'rascunho', observacoes })
    .select().single();
  if (e2) throw e2;

  const itens = bemIds.map((bem_id, i) => ({ termo_id: termo.id, bem_id, ordem: i }));
  const { error: e3 } = await sb.from('termo_itens').insert(itens);
  if (e3) throw e3;

  return termo;
}

export const itensDoTermo = (termoId) =>
  sb.from('termo_itens').select('*, bens(*)').eq('termo_id', termoId).order('ordem');

// ---------------------------------------------------------------------
// Coleta pública (autodeclaração)
// ---------------------------------------------------------------------

export const listarSubmissoes = (status) => {
  let q = sb.from('vw_submissoes').select('*');
  if (status) q = q.eq('status', status);
  return q.order('enviado_em', { ascending: false });
};

export const itensDaSubmissao = (submissaoId) =>
  sb.from('submissao_itens').select('*, submissao_fotos(*)')
    .eq('submissao_id', submissaoId).order('ordem');

export const vincularColaborador = (submissaoId, colaboradorId) =>
  sb.from('submissoes').update({ colaborador_id: colaboradorId }).eq('id', submissaoId);

export const aprovarSubmissao = (submissaoId, gerarTermo = true) =>
  sb.rpc('aprovar_submissao', { p_submissao_id: submissaoId, p_gerar_termo: gerarTermo });

export const rejeitarSubmissao = (submissaoId, motivo) =>
  sb.from('submissoes').update({
    status: 'rejeitada', motivo_rejeicao: motivo, analisado_em: new Date().toISOString()
  }).eq('id', submissaoId);

export const criarConvite = (colaborador) =>
  sb.from('convites').insert({
    colaborador_id: colaborador.id,
    nome_destinatario: colaborador.nome,
    setor: colaborador.setor,
    email: colaborador.email
  }).select().single();

export const listarConvites = () =>
  sb.from('convites').select('*, colaboradores(nome)').order('criado_em', { ascending: false });

export const revogarConvite = (id) =>
  sb.from('convites').update({ revogado: true }).eq('id', id);

// ---------------------------------------------------------------------
// Painel de pendências
// ---------------------------------------------------------------------

export const listarPendencias = () => sb.from('vw_pendencias').select('*');
