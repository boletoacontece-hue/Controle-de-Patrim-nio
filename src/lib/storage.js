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

  const { data, error } = await sb.functions.invoke('r2-url-assinada', {
    body: { key, contentType: 'image/webp', escopo: 'bem' }
  });
  if (error) throw new Error('Não foi possível preparar o envio da foto.');

  const resp = await fetch(data.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/webp' },
    body: blob
  });
  if (!resp.ok) throw new Error('O envio da foto falhou. Tente novamente.');

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

  const { data, error } = await sb.functions.invoke('r2-url-assinada', {
    body: { key, contentType: 'image/webp', escopo: 'coleta', token }
  });
  if (error) throw new Error('Não foi possível preparar o envio da foto.');

  const resp = await fetch(data.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/webp' },
    body: blob
  });
  if (!resp.ok) throw new Error('O envio da foto falhou. Tente novamente.');

  return { key };
}

/** Envia o PDF do termo (emitido ou digitalização assinada). */
export async function enviarPdfDeTermo(blob, numero, tipo = 'emitido') {
  const ano = new Date().getFullYear();
  const key = `termos/${ano}/${numero}${tipo === 'assinado' ? '-assinado' : ''}.pdf`;

  const { data, error } = await sb.functions.invoke('r2-url-assinada', {
    body: { key, contentType: 'application/pdf', escopo: 'termo' }
  });
  if (error) throw new Error('Não foi possível preparar o envio do arquivo.');

  const resp = await fetch(data.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: blob
  });
  if (!resp.ok) throw new Error('O envio do arquivo falhou. Tente novamente.');

  return key;
}
