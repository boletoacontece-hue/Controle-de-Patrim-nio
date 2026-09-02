/**
 * Camada de storage — Cloudflare R2.
 *
 * Todo acesso ao provedor está isolado aqui. Trocar de R2 para B2 ou
 * servidor próprio significa reescrever este arquivo, e nada mais.
 *
 * A chave secreta do R2 NUNCA chega ao navegador: o upload usa URL
 * pré-assinada emitida por uma Edge Function do Supabase.
 */

import { sb } from './supabase';

const BASE_PUBLICA = import.meta.env.VITE_R2_PUBLIC_URL;


/**
 * Envia o arquivo ao R2 através da Edge Function.
 *
 * O caminho direto do navegador para o R2 não funciona: o endpoint S3 do R2
 * não aplica a política de CORS do bucket, então o navegador bloqueia o PUT
 * antes mesmo de tentar. Aqui o arquivo vai para a Edge Function, que
 * responde com CORS liberado e faz o envio ao R2 pelo servidor, onde CORS
 * não existe.
 *
 * Custo: os bytes trafegam duas vezes. Como as fotos são comprimidas para
 * ~250 KB antes de sair do navegador, isso não pesa.
 */
async function enviarPelaFuncao(blob, key, contentType, escopo, token) {
  const { data: sessao } = await sb.auth.getSession();

  const cabecalhos = {
    'Content-Type': 'application/octet-stream',
    'x-arquivo-chave': key,
    'x-arquivo-tipo': contentType,
    'x-arquivo-escopo': escopo,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
  };

  // A página pública de autodeclaração não tem sessão: identifica-se pelo
  // token do convite.
  if (token) cabecalhos['x-convite-token'] = token;
  if (sessao?.session?.access_token) {
    cabecalhos.Authorization = `Bearer ${sessao.session.access_token}`;
  }

  const endereco =
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-url-assinada`;

  let resp;
  try {
    resp = await fetch(endereco, { method: 'POST', headers: cabecalhos, body: blob });
  } catch {
    throw new Error('Não foi possível falar com o servidor de arquivos. Verifique a internet.');
  }

  let corpo = null;
  try { corpo = await resp.json(); } catch { /* resposta sem JSON */ }

  if (!resp.ok) {
    throw new Error(corpo?.error || `O envio falhou (HTTP ${resp.status}).`);
  }
  return corpo?.key || key;
}

/** Monta a URL de exibição a partir da chave guardada no banco. */
export const urlDaFoto = (storageKey) =>
  storageKey ? `${BASE_PUBLICA}/${storageKey}` : null;

/**
 * Comprime no navegador antes de enviar.
 * Foto de celular (~4 MB) vira ~250 KB em WebP a 1600px — o que multiplica
 * por cerca de 15 a capacidade do plano gratuito do R2.
 */
export async function comprimirImagem(file, { maxLado = 1600, qualidade = 0.82 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('O arquivo precisa ser uma imagem.');

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (Math.max(width, height) > maxLado) {
    const escala = maxLado / Math.max(width, height);
    width = Math.round(width * escala);
    height = Math.round(height * escala);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', qualidade));
  if (!blob) throw new Error('Não foi possível processar a imagem.');

  return { blob, width, height, tamanho: blob.size };
}

/** Nome de arquivo previsível e sem colisão. */
function montarChave(prefixo, nomeOriginal) {
  const ano = new Date().getFullYear();
  const aleatorio = Math.random().toString(36).slice(2, 8);
  const limpo = (nomeOriginal || 'foto')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .slice(0, 40)
    .toLowerCase();
  return `${prefixo}/${ano}/${limpo}-${aleatorio}.webp`;
}

/**
 * Envia uma foto de bem (área autenticada).
 * @returns {Promise<{key:string,width:number,height:number,tamanho:number}>}
 */
export async function enviarFotoDeBem(file, codigoPatrimonio) {
  const { blob, width, height, tamanho } = await comprimirImagem(file);
  const key = montarChave(`bens/${codigoPatrimonio || 'sem-codigo'}`, file.name);

  await enviarPelaFuncao(blob, key, 'image/webp', 'bem');

  return { key, width, height, tamanho };
}

/**
 * Envia foto na página pública de autodeclaração.
 * A Edge Function valida o token do convite ANTES de assinar a URL e
 * restringe o prefixo a `coleta/`, então um token inválido não consegue
 * gravar nada no bucket.
 */
export async function enviarFotoDeColeta(file, token) {
  const { blob } = await comprimirImagem(file, { maxLado: 1400, qualidade: 0.78 });
  const key = montarChave('coleta', file.name);

  await enviarPelaFuncao(blob, key, 'image/webp', 'coleta', token);

  return { key };
}

/**
 * Envia o termo: o PDF gerado pelo sistema ou a digitalização assinada.
 *
 * O tipo vem do próprio arquivo. Antes era sempre `application/pdf`, então
 * uma digitalização em JPG era gravada como PDF e não abria no navegador.
 */
export async function enviarPdfDeTermo(blob, numero, tipo = 'emitido') {
  const ano = new Date().getFullYear();
  const contentType = blob.type || 'application/pdf';

  const extensao =
    contentType === 'application/pdf' ? 'pdf' :
    contentType === 'image/png' ? 'png' :
    contentType.startsWith('image/') ? 'jpg' : 'pdf';

  const key = `termos/${ano}/${numero}${tipo === 'assinado' ? '-assinado' : ''}.${extensao}`;

  await enviarPelaFuncao(blob, key, contentType, 'termo');

  return key;
}
