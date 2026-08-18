/**
 * Emite URL pré-assinada para upload no Cloudflare R2.
 *
 * Existe por um motivo de segurança: a chave secreta do R2 não pode ficar
 * no navegador. O front pede a assinatura aqui, e esta função decide se
 * assina — validando quem está pedindo e onde pode gravar.
 *
 * Escopos:
 *   bem, termo  → exigem sessão autenticada no Supabase
 *   coleta      → aceita anônimo, mas SÓ com token de convite válido
 *
 * Variáveis (Supabase → Edge Functions → Secrets):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const TIPOS_ACEITOS = ['image/webp', 'image/jpeg', 'image/png', 'application/pdf'];

// Cada escopo só pode gravar dentro do seu prefixo.
const PREFIXOS: Record<string, string> = {
  bem: 'bens/',
  coleta: 'coleta/',
  termo: 'termos/'
};

const recusar = (mensagem: string, status = 400) =>
  new Response(JSON.stringify({ error: mensagem }), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return recusar('Método não permitido.', 405);

  let corpo: { key?: string; contentType?: string; escopo?: string; token?: string };
  try {
    corpo = await req.json();
  } catch {
    return recusar('Requisição inválida.');
  }

  const { key, contentType, escopo, token } = corpo;

  if (!key || !contentType || !escopo) return recusar('Dados incompletos.');
  if (!TIPOS_ACEITOS.includes(contentType)) return recusar('Tipo de arquivo não aceito.');

  const prefixo = PREFIXOS[escopo];
  if (!prefixo) return recusar('Escopo inválido.');

  // Impede subir de diretório e gravar fora do prefixo do escopo.
  if (!key.startsWith(prefixo) || key.includes('..') || key.includes('//')) {
    return recusar('Caminho de arquivo inválido.');
  }
  if (key.length > 400) return recusar('Nome de arquivo muito longo.');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (escopo === 'coleta') {
    // Anônimo, porém só com convite válido: sem isso, qualquer um encheria o bucket.
    if (!token) return recusar('Link de coleta ausente.', 401);

    const { data, error } = await supabase.rpc('abrir_convite', { p_token: token });
    if (error || !data?.valido) return recusar('Link de coleta inválido ou expirado.', 401);
  } else {
    // Demais escopos exigem sessão válida do sistema.
    const auth = req.headers.get('Authorization');
    if (!auth) return recusar('Sessão não informada.', 401);

    const { data: { user }, error } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
    if (error || !user) return recusar('Sessão inválida.', 401);

    const { data: permitido } = await supabase
      .schema('ativos')
      .from('usuarios_autorizados')
      .select('id')
      .ilike('email', user.email!)
      .eq('ativo', true)
      .maybeSingle();

    if (!permitido) return recusar('Usuário não autorizado.', 403);
  }

  const conta = Deno.env.get('R2_ACCOUNT_ID')!;
  const bucket = Deno.env.get('R2_BUCKET')!;

  const r2 = new AwsClient({
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    service: 's3',
    region: 'auto'
  });

  const destino = new URL(`https://${conta}.r2.cloudflarestorage.com/${bucket}/${key}`);
  destino.searchParams.set('X-Amz-Expires', '600'); // 10 minutos

  const assinada = await r2.sign(
    new Request(destino, { method: 'PUT', headers: { 'Content-Type': contentType } }),
    { aws: { signQuery: true } }
  );

  return new Response(JSON.stringify({ url: assinada.url, key }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
});
