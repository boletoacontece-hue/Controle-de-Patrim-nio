/**
 * Emite URL pré-assinada para upload no Cloudflare R2.
 *
 * A chave secreta do R2 não pode ficar no navegador nem no aplicativo. O
 * cliente pede a assinatura aqui, esta função decide se assina — validando
 * quem está pedindo e onde pode gravar.
 *
 * Escopos:
 *   bem, termo  → exigem sessão autenticada e e-mail na allowlist
 *   coleta      → aceita anônimo, mas só com token de convite válido
 *
 * Segredos (Supabase → Edge Functions → Secrets):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-arquivo-chave, x-arquivo-tipo, x-arquivo-escopo, x-convite-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const TIPOS_ACEITOS = ['image/webp', 'image/jpeg', 'image/png', 'application/pdf'];

const PREFIXOS: Record<string, string> = {
  bem: 'bens/',
  coleta: 'coleta/',
  termo: 'termos/'
};

const recusar = (mensagem: string, status = 400) => {
  console.error(`[r2-url-assinada] recusado (${status}): ${mensagem}`);
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return recusar('Método não permitido.', 405);

  // ------------------------------------------------------------------
  // Segredos: conferidos primeiro, com nome explícito no erro.
  // Faltando um deles, a função quebrava lá na frente com uma mensagem
  // que não ajudava em nada.
  // ------------------------------------------------------------------
  const faltando = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
    .filter((nome) => !Deno.env.get(nome));

  if (faltando.length) {
    return recusar(
      `Configuração ausente no servidor: ${faltando.join(', ')}. ` +
      'Cadastre em Edge Functions › Secrets.',
      500
    );
  }

  // Dois modos de uso:
  //
  //  1. JSON    -> devolve URL assinada; o cliente envia ao R2 por conta própria
  //  2. BINÁRIO -> o arquivo vem no corpo e ESTA função o envia ao R2
  //
  // O modo (b) existe porque o endpoint S3 do R2 não aplica a política de
  // CORS do bucket: o navegador bloqueia o PUT antes mesmo de tentar. Como
  // esta função responde com CORS liberado, o arquivo passa por aqui e o
  // envio ao R2 acontece do lado do servidor, onde CORS não existe.
  const enviarDireto = !!req.headers.get('x-arquivo-chave');

  let key: string | undefined;
  let contentType: string | undefined;
  let escopo: string | undefined;
  let token: string | undefined;
  let bytes: ArrayBuffer | undefined;

  if (enviarDireto) {
    key         = req.headers.get('x-arquivo-chave')  ?? undefined;
    contentType = req.headers.get('x-arquivo-tipo')   ?? undefined;
    escopo      = req.headers.get('x-arquivo-escopo') ?? undefined;
    token       = req.headers.get('x-convite-token')  ?? undefined;

    bytes = await req.arrayBuffer();
    if (!bytes || bytes.byteLength === 0) return recusar('Arquivo vazio.');
    if (bytes.byteLength > 20 * 1024 * 1024) {
      return recusar('Arquivo maior que 20 MB. Reduza a resolução da digitalização.');
    }
  } else {
    try {
      const corpo = await req.json();
      key = corpo.key; contentType = corpo.contentType;
      escopo = corpo.escopo; token = corpo.token;
    } catch {
      return recusar('Requisição inválida.');
    }
  }

  if (!key || !contentType || !escopo) return recusar('Dados incompletos.');
  if (!TIPOS_ACEITOS.includes(contentType)) {
    return recusar(
      `Tipo de arquivo não aceito: ${contentType}. ` +
      'Envie PDF, JPG, PNG ou WebP.'
    );
  }

  const prefixo = PREFIXOS[escopo];
  if (!prefixo) return recusar(`Escopo inválido: ${escopo}.`);

  if (!key.startsWith(prefixo) || key.includes('..') || key.includes('//')) {
    return recusar('Caminho de arquivo inválido.');
  }
  if (key.length > 400) return recusar('Nome de arquivo muito longo.');

  const urlSupabase = Deno.env.get('SUPABASE_URL')!;
  const chaveAnon = Deno.env.get('SUPABASE_ANON_KEY')!;

  if (escopo === 'coleta') {
    // Anônimo, porém só com convite válido: sem isso, qualquer um encheria
    // o bucket. A validação usa a chave de serviço porque não há sessão.
    if (!token) return recusar('Link de coleta ausente.', 401);

    const servico = createClient(urlSupabase, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await servico.rpc('abrir_convite', { p_token: token });

    if (error) {
      return recusar(`Não foi possível validar o link de coleta: ${error.message}`, 500);
    }
    if (!data?.valido) {
      return recusar(data?.motivo ?? 'Link de coleta inválido ou expirado.', 401);
    }

  } else {
    // ----------------------------------------------------------------
    // Escopos internos: valida a sessão e a allowlist.
    //
    // A checagem usa `public.usuario_autorizado()` chamada COM O TOKEN DO
    // USUÁRIO. A versão anterior lia a tabela `ativos.usuarios_autorizados`
    // com a chave de serviço e descartava o erro da consulta — qualquer
    // falha de leitura virava "usuário não autorizado", escondendo a causa
    // real e acusando gente que estava devidamente cadastrada.
    // ----------------------------------------------------------------
    const auth = req.headers.get('Authorization');
    if (!auth) return recusar('Sessão não informada.', 401);

    const comUsuario = createClient(urlSupabase, chaveAnon, {
      global: { headers: { Authorization: auth } }
    });

    const { data: { user }, error: erroUsuario } = await comUsuario.auth.getUser();
    if (erroUsuario || !user) {
      return recusar('Sessão inválida ou expirada. Saia e entre novamente.', 401);
    }

    const { data: autorizado, error: erroAutorizacao } =
      await comUsuario.rpc('usuario_autorizado');

    if (erroAutorizacao) {
      // Erro de consulta é problema de servidor, não falta de permissão.
      return recusar(
        `Falha ao verificar a autorização: ${erroAutorizacao.message}. ` +
        'Confira se a migration 0006 foi aplicada.',
        500
      );
    }

    if (autorizado !== true) {
      return recusar(
        `A conta ${user.email} não está autorizada. ` +
        'Peça ao setor Financeiro para incluir o e-mail.',
        403
      );
    }
  }

  // ------------------------------------------------------------------
  // Assinatura
  // ------------------------------------------------------------------
  const conta = Deno.env.get('R2_ACCOUNT_ID')!;
  const bucket = Deno.env.get('R2_BUCKET')!;

  const r2 = new AwsClient({
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    service: 's3',
    region: 'auto'
  });

  const destino = new URL(`https://${conta}.r2.cloudflarestorage.com/${bucket}/${key}`);
  if (!enviarDireto) destino.searchParams.set('X-Amz-Expires', '600'); // 10 minutos

  try {
    if (enviarDireto) {
      // Envio pelo servidor: aqui não há navegador, logo não há CORS.
      const envio = await r2.fetch(destino.toString(), {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: bytes
      });

      if (!envio.ok) {
        const detalhe = await envio.text().catch(() => '');
        return recusar(
          `O R2 recusou o arquivo (HTTP ${envio.status}). ${detalhe.slice(0, 200)}`,
          502
        );
      }

      return new Response(JSON.stringify({ key, enviado: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const assinada = await r2.sign(
      new Request(destino, { method: 'PUT', headers: { 'Content-Type': contentType } }),
      { aws: { signQuery: true } }
    );

    return new Response(JSON.stringify({ url: assinada.url, key }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return recusar(
      `Falha ao falar com o R2: ${e instanceof Error ? e.message : String(e)}`,
      500
    );
  }
});
