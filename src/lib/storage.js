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
 * Pede a URL assinada à Edge Function e devolve a causa real quando falha.
 *
 * O supabase-js embrulha respostas de erro num objeto genérico; a mensagem
 * que a função escreveu fica em `error.context`. Sem abrir esse corpo, todo
 * problema — falta de permissão, segredo do R2 ausente, escopo inválido —
 * virava o mesmo "não foi possível", sem como diagnosticar.
 */
async function pedirUrlAssinada(corpo) {
  const { data, error } = await sb.functions.invoke('r2-url-assinada', { body: corpo });

  if (error) {
    let detalhe = error.message || '';
    try {
      const corpoErro = await error.context?.json?.();
      if (corpoErro?.error) detalhe = corpoErro.error;
    } catch {
      try { detalhe = (await error.context?.text?.()) || detalhe; } catch { /* mantém */ }
    }
    throw new Error(`O servidor de arquivos recusou o envio: ${detalhe}`);
  }

  if (!data?.url) {
    throw new Error(
      'O servidor de arquivos não devolveu a URL de envio. Confira se os segredos ' +
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET estão ' +
      'cadastrados em Edge Functions › Secrets.'
    );
  }
  return data.url;
}

/** Sobe os bytes para o R2 e explica o motivo em caso de recusa. */
async function subirParaR2(url, blob, contentType) {
  let resp;
  try {
    resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob
    });
  } catch (e) {
    // fetch só estoura assim quando o navegador bloqueia antes de enviar
    throw new Error(
      'O navegador bloqueou o envio ao R2. Isso costuma ser a política de CORS ' +
      'do bucket: em Cloudflare › R2 › acontece-ativos › Configurações › CORS, ' +
      'o método PUT e a origem deste site precisam estar liberados.'
    );
  }

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error(`O R2 recusou o arquivo (HTTP ${resp.status}). ${detalhe.slice(0, 200)}`);
  }
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

  const url = await pedirUrlAssinada({ key, contentType: 'image/webp', escopo: 'bem' });
  await subirParaR2(url, blob, 'image/webp');

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

  const url = await pedirUrlAssinada({ key, contentType: 'image/webp', escopo: 'coleta', token });
  await subirParaR2(url, blob, 'image/webp');

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

  const url = await pedirUrlAssinada({ key, contentType, escopo: 'termo' });
  await subirParaR2(url, blob, contentType);

  return key;
}
