/**
 * Gerador do Termo de Responsabilidade — Acontece Imobiliária
 *
 * Fiel ao modelo Modelo_TERMO_DE_USO.docx: as cláusulas 1 a 4 estão
 * reproduzidas palavra por palavra. Foram acrescentados apenas os
 * elementos ausentes no modelo original:
 *   - número do termo e data de emissão
 *   - identificação do bem por patrimônio e número de série
 *   - estado de conservação na entrega
 *   - linha de assinatura do COLABORADOR (faltava no modelo)
 *   - hash de validação
 *
 * Uso no front (Vite/React): importar gerarTermo e chamar com os dados
 * vindos do Supabase. Aqui roda em Node para conferência visual.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

// Logo institucional embutida: o PDF é gerado no navegador, sem rede.
export const LOGO_ACONTECE = 'data:image/jpeg;base64,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';

// Identidade Acontece
const VERDE = [45, 90, 45];
const CINZA = [110, 110, 110];
const PRETO = [30, 30, 30];

const MARGEM = 18;
const LARGURA = 210;
const UTIL = LARGURA - MARGEM * 2;

const fmtCPF = (v) => (v || '—');
const fmtData = (d) => {
  const dt = d instanceof Date ? d : new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('pt-BR');
};
const porExtenso = (n) => {
  const nomes = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez',
                 'onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove','vinte'];
  return nomes[n] || String(n);
};
// Um item "roda software" se for de informática/eletrônico. A cláusula sobre
// instalação de aplicativos não faz sentido em cadeira ou mesa.
const PALAVRAS_ELETRONICO = /notebook|laptop|computador|desktop|tablet|celular|smartphone|impressora|servidor|roteador|nobreak|tv |televis|projetor|painel de led|scanner|leitor/i;
const ehEletronico = (i) =>
  i.eletronico === true ||
  i.categoria_codigo === 'MOB-005' ||
  PALAVRAS_ELETRONICO.test(i.descricao || '');

const ehVeiculo = (i) => i.grupo === 'imobilizado' || i.categoria_codigo === 'IMO-001';

const ESTADOS = {
  novo: 'Novo', otimo: 'Ótimo', bom: 'Bom',
  regular: 'Regular', ruim: 'Ruim', inservivel: 'Inservível'
};

/**
 * @param {object} dados
 * @param {string} dados.numero            TR-2026-0001
 * @param {string} dados.dataEmissao       ISO
 * @param {string} dados.localEmissao
 * @param {object} dados.colaborador       {nome, cpf, cargo, setor}
 * @param {Array}  dados.itens             [{codigo_patrimonio, descricao, marca, modelo, numero_serie, estado_conservacao, observacao}]
 * @param {string} dados.hash              SHA-256 do conteúdo
 * @param {string} dados.logoBase64        data:image/jpeg;base64,...
 * @param {string} dados.qrBase64          data:image/png;base64,... (opcional)
 */
function gerarTermo(dados) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const itens = dados.itens || [];
  const umItem = itens.length === 1;
  let y = 0;

  // ------------------------------------------------------------------
  // CABEÇALHO
  // ------------------------------------------------------------------
  if (dados.logoBase64) {
    doc.addImage(dados.logoBase64, 'JPEG', MARGEM, 12, 24, 21);
  }

  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...PRETO);
  doc.text('TERMO DE RESPONSABILIDADE', LARGURA / 2 + 8, 20, { align: 'center' });

  doc.setFontSize(11).setTextColor(...VERDE);
  const subtitulo = umItem
    ? `DE USO DE ${(itens[0].tipo_titulo || itens[0].descricao || 'BEM').toUpperCase()}`
    : 'DE USO DE BENS PATRIMONIAIS';
  doc.text(subtitulo.length > 60 ? 'DE USO DE BENS PATRIMONIAIS' : subtitulo,
           LARGURA / 2 + 8, 26, { align: 'center' });

  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...PRETO);
  doc.text('Acontece Imobiliária', LARGURA / 2 + 8, 32, { align: 'center' });

  // faixa de identificação do documento
  doc.setDrawColor(...VERDE).setLineWidth(0.6);
  doc.line(MARGEM, 38, LARGURA - MARGEM, 38);

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...CINZA);
  doc.text(`Termo nº ${dados.numero}`, MARGEM, 43);
  doc.text(`Emitido em ${fmtData(dados.dataEmissao)}`, LARGURA - MARGEM, 43, { align: 'right' });

  y = 52;

  // ------------------------------------------------------------------
  // PREÂMBULO — texto do modelo original
  // ------------------------------------------------------------------
  doc.setFontSize(10).setTextColor(...PRETO);

  const c = dados.colaborador;
  const qtd = itens.length;
  const preambulo = umItem
    ? `Eu, ${c.nome}, colaborador(a) da Acontece Imobiliária, inscrito(a) no CPF nº ${fmtCPF(c.cpf)}, declaro, para os devidos fins, que recebo neste ato, 01 (um) equipamento ${itens[0].descricao}${itens[0].marca ? ' da marca ' + itens[0].marca : ''} de propriedade da empresa.`
    : `Eu, ${c.nome}, colaborador(a) da Acontece Imobiliária, inscrito(a) no CPF nº ${fmtCPF(c.cpf)}, declaro, para os devidos fins, que recebo neste ato ${String(qtd).padStart(2, '0')} (${porExtenso(qtd)}) bens de propriedade da empresa, relacionados no quadro abaixo.`;

  const linhas = doc.splitTextToSize(preambulo, UTIL);
  doc.text(linhas, MARGEM, y, { align: 'justify', maxWidth: UTIL });
  y += linhas.length * 4.6 + 3;

  // ------------------------------------------------------------------
  // QUADRO DE BENS — o modelo não identificava o bem por patrimônio
  // ------------------------------------------------------------------
  autoTable(doc, {
    startY: y,
    head: [['Patrimônio', 'Descrição', 'Marca / Modelo', 'Nº de série', 'Estado']],
    body: itens.map((i) => [
      i.codigo_patrimonio || '—',
      i.descricao || '—',
      [i.marca, i.modelo].filter(Boolean).join(' / ') || '—',
      i.numero_serie || '—',
      ESTADOS[i.estado_conservacao] || 'Bom'
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: PRETO, lineColor: [200, 200, 200] },
    headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 248, 246] },
    columnStyles: {
      0: { cellWidth: 26 }, 1: { cellWidth: 60 }, 2: { cellWidth: 38 },
      3: { cellWidth: 30 }, 4: { cellWidth: 20, halign: 'center' }
    },
    margin: { left: MARGEM, right: MARGEM }
  });

  y = doc.lastAutoTable.finalY + 2.5;

  const obs = itens.filter((i) => i.observacao);
  if (obs.length) {
    doc.setFontSize(7.5).setTextColor(...CINZA);
    obs.forEach((i) => {
      const t = doc.splitTextToSize(`Obs. ${i.codigo_patrimonio}: ${i.observacao}`, UTIL);
      doc.text(t, MARGEM, y);
      y += t.length * 3.4;
    });
    y += 1.5;
  }
  y += 2;

  // ------------------------------------------------------------------
  // CLÁUSULAS — reproduzidas literalmente do modelo
  // ------------------------------------------------------------------
  const secao = (titulo, blocos) => {
    if (y > 240) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...PRETO);
    doc.text(titulo, MARGEM, y);
    y += 5;
    doc.setFont('helvetica', 'normal').setFontSize(9.5);
    blocos.forEach((b) => {
      const bullet = b.startsWith('•');
      const texto = bullet ? b.slice(1).trim() : b;
      const largura = bullet ? UTIL - 5 : UTIL;
      const t = doc.splitTextToSize(texto, largura);
      if (y + t.length * 4.4 > 275) { doc.addPage(); y = 25; }
      if (bullet) {
        doc.text('•', MARGEM + 1, y);
        doc.text(t, MARGEM + 5, y, { align: 'justify', maxWidth: largura });
      } else {
        doc.text(t, MARGEM, y, { align: 'justify', maxWidth: largura });
      }
      y += t.length * 4.4 + 1.2;
    });
    y += 2;
  };

  const bem = umItem ? 'O equipamento' : 'Os bens relacionados';
  const bemArt = umItem ? 'o equipamento' : 'os bens';

  secao('1. Finalidade de Uso', [
    `${bem} ${umItem ? 'é de uso exclusivo' : 'são de uso exclusivo'} para a execução das atividades profissionais vinculadas à Acontece Imobiliária, sendo expressamente vedado o uso para fins particulares, ilegais ou que prejudiquem a imagem e/ou o patrimônio da empresa.`
  ]);

  const temEletronico = itens.some(ehEletronico);
  const setorAviso = temEletronico ? 'RH/TI' : 'RH';

  const deveresColaborador = [
    'O colaborador compromete-se a:',
    `• Zelar pelo bom uso, conservação e segurança d${umItem ? 'o equipamento' : 'os bens'};`
  ];
  // Só entra quando há bem que efetivamente executa software.
  if (temEletronico) {
    deveresColaborador.push('• Não instalar softwares ou aplicativos não autorizados pela empresa;');
    deveresColaborador.push('• Não compartilhar senhas de acesso ou informações sigilosas;');
  }
  deveresColaborador.push(
    `• Comunicar imediatamente ao setor de ${setorAviso} qualquer defeito, dano, perda, roubo ou furto d${umItem ? 'o equipamento' : 'os bens'};`,
    `• Devolver ${bemArt} em perfeito estado de funcionamento quando solicitado pela empresa ou no desligamento do colaborador.`
  );

  secao('2. Responsabilidades do Colaborador', deveresColaborador);

  secao('3. Penalidades', [
    `• Em caso de mau uso, negligência, perda, roubo ou danos ocasionados por culpa ou dolo do colaborador, este se responsabiliza integralmente pelo reparo, substituição ou indenização d${umItem ? 'o equipamento' : 'os bens'}, conforme avaliação da empresa.`,
    '• O não cumprimento das regras estabelecidas poderá acarretar medidas disciplinares cabíveis.'
  ]);

  secao('4. Vigência', [
    `Este termo tem validade enquanto ${umItem ? 'o equipamento permanecer' : 'os bens permanecerem'} sob posse do colaborador.`
  ]);

  // ------------------------------------------------------------------
  // VEÍCULO — identificação técnica e cláusulas próprias.
  // Um termo de veículo envolve multa, sinistro e responsabilidade civil
  // perante terceiros; a redação genérica não cobre isso.
  // ------------------------------------------------------------------
  const veiculos = itens.filter(ehVeiculo);
  if (veiculos.length) {
    veiculos.forEach((v) => {
      const a = v.atributos || {};
      const campos = [
        ['Placa', a.placa], ['Chassi', a.chassi], ['RENAVAM', a.renavam],
        ['Ano fab./mod.', [a.ano_fabricacao, a.ano_modelo].filter(Boolean).join('/')],
        ['Cor', a.cor], ['Combustível', a.combustivel],
        ['Hodômetro na entrega', a.km_atual != null ? `${Number(a.km_atual).toLocaleString('pt-BR')} km` : null],
        ['Licenciamento até', a.vencimento_licenciamento ? fmtData(a.vencimento_licenciamento) : null],
        ['Seguradora', a.seguradora], ['Apólice', a.apolice],
        ['Seguro até', a.vencimento_seguro ? fmtData(a.vencimento_seguro) : null]
      ].filter(([, val]) => val);

      if (!campos.length) return;
      if (y + 12 + Math.ceil(campos.length / 3) * 5 > 265) { doc.addPage(); y = 25; }

      doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...PRETO);
      doc.text(`Identificação do veículo — ${v.codigo_patrimonio}`, MARGEM, y);
      y += 5;

      autoTable(doc, {
        startY: y,
        body: campos.map(([k, val]) => [k, String(val)]),
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.2, textColor: PRETO },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { cellWidth: 'auto' } },
        margin: { left: MARGEM + 2, right: MARGEM }
      });
      y = doc.lastAutoTable.finalY + 4;
    });

    secao('5. Disposições Específicas do Veículo', [
      '• O veículo destina-se exclusivamente ao serviço da empresa, sendo vedada a cessão de direção a terceiros não autorizados, inclusive familiares;',
      '• O colaborador declara possuir Carteira Nacional de Habilitação válida e compatível com a categoria do veículo, comprometendo-se a informar imediatamente qualquer suspensão ou cassação;',
      '• As infrações de trânsito cometidas no período de posse são de responsabilidade do colaborador, que autoriza a indicação de seu nome como condutor junto ao órgão de trânsito e o desconto dos valores correspondentes, na forma da legislação vigente;',
      '• Em caso de sinistro, o colaborador deve comunicar a empresa imediatamente e registrar boletim de ocorrência, respondendo pela franquia quando caracterizada culpa ou dolo;',
      '• O colaborador compromete-se a observar os prazos de manutenção preventiva, licenciamento e seguro, comunicando ao setor responsável a proximidade de cada vencimento.'
    ]);
  }

  // altura real do bloco de encerramento + assinaturas, para evitar
  // que as assinaturas fiquem órfãs em página separada
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  const fechoTeste = doc.splitTextToSize(
    'Por ser verdade, firmo o presente Termo de Responsabilidade em duas vias de igual teor e forma, ciente de todas as condições aqui descritas.',
    UTIL
  );
  const alturaFecho = fechoTeste.length * 4.4 + 5 + 9 + 9 + 22;
  if (y + alturaFecho > 278) { doc.addPage(); y = 25; }

  doc.setTextColor(...PRETO);
  const fecho = doc.splitTextToSize(
    'Por ser verdade, firmo o presente Termo de Responsabilidade em duas vias de igual teor e forma, ciente de todas as condições aqui descritas.',
    UTIL
  );
  doc.text(fecho, MARGEM, y, { align: 'justify', maxWidth: UTIL });
  y += fecho.length * 4.4 + 5;

  doc.text(`${dados.localEmissao || 'Brasília-DF'}, ${fmtData(dados.dataEmissao)}.`, MARGEM, y);
  y += 9;

  // ------------------------------------------------------------------
  // ASSINATURAS — o modelo não previa assinatura do colaborador
  // ------------------------------------------------------------------
  doc.setFont('helvetica', 'bold').setFontSize(10);
  doc.text('Assinaturas:', MARGEM, y);
  y += 9;

  const colLargura = (UTIL - 12) / 2;
  const xEsq = MARGEM;
  const xDir = MARGEM + colLargura + 12;

  doc.setDrawColor(80, 80, 80).setLineWidth(0.3);
  doc.line(xEsq, y, xEsq + colLargura, y);
  doc.line(xDir, y, xDir + colLargura, y);
  y += 4.5;

  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...PRETO);
  doc.text('Colaborador(a)', xEsq, y);
  doc.text('Ciência do Gestor', xDir, y);
  y += 4.2;

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...CINZA);
  doc.text(`Nome: ${c.nome}`, xEsq, y);
  doc.text('Nome: ______________________________', xDir, y);
  y += 4;
  doc.text(`CPF: ${fmtCPF(c.cpf)}`, xEsq, y);
  doc.text('Data: ____/____/______', xDir, y);
  y += 4;
  if (c.cargo || c.setor) {
    doc.text([c.cargo, c.setor].filter(Boolean).join(' — '), xEsq, y);
  }
  y += 4;
  doc.text('Data: ____/____/______', xEsq, y);

  // ------------------------------------------------------------------
  // RODAPÉ EM TODAS AS PÁGINAS
  // ------------------------------------------------------------------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(215, 215, 215).setLineWidth(0.3);
    doc.line(MARGEM, 283, LARGURA - MARGEM, 283);
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...CINZA);
    doc.text(`${dados.numero} · Acontece Assessoria e Planejamento Imobiliário · CRECI 4996-DF`, MARGEM, 287);
    doc.text(`Página ${p} de ${total}`, LARGURA - MARGEM, 287, { align: 'right' });
    if (dados.hash) {
      doc.text(`Validação: ${dados.hash.slice(0, 32)}`, MARGEM, 290.5);
    }
    if (dados.qrBase64 && p === total) {
      doc.addImage(dados.qrBase64, 'PNG', LARGURA - MARGEM - 14, 268, 14, 14);
    }
    // Termo com mais de uma página exige rubrica em cada folha: impede
    // que uma página seja substituída depois de assinada.
    if (total > 1 && p < total) {
      doc.setFontSize(7).setTextColor(...CINZA);
      doc.text('Rubrica do colaborador: ____________________', MARGEM, 279);
    }
  }

  return doc;
}


/**
 * Monta o termo a partir dos registros do Supabase e devolve o Blob do PDF.
 * O hash cobre número, colaborador e itens — é o que o QR do rodapé valida.
 */
export async function gerarTermoDeRegistros(termo, colaborador, itens) {
  const base = {
    numero: termo.numero,
    dataEmissao: termo.data_emissao,
    localEmissao: termo.local_emissao || 'Brasília-DF',
    colaborador: {
      nome: colaborador.nome, cpf: colaborador.cpf,
      cargo: colaborador.cargo, setor: colaborador.setor
    },
    itens: itens.map((ti) => ({
      codigo_patrimonio: ti.bens?.codigo_patrimonio || ti.codigo_patrimonio,
      descricao: ti.bens?.descricao || ti.descricao,
      marca: ti.bens?.marca, modelo: ti.bens?.modelo,
      numero_serie: ti.bens?.numero_serie,
      grupo: ti.bens?.grupo,
      atributos: ti.bens?.atributos || {},
      estado_conservacao: ti.estado_conservacao,
      observacao: ti.observacao,
      tipo_titulo: ti.bens?.grupo === 'imobilizado' ? 'Veículo' : null
    }))
  };

  const bytes = new TextEncoder().encode(JSON.stringify({
    numero: base.numero, cpf: base.colaborador.cpf,
    itens: base.itens.map((i) => i.codigo_patrimonio)
  }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  base.hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

  base.logoBase64 = LOGO_ACONTECE;
  try {
    base.qrBase64 = await QRCode.toDataURL(
      `${window.location.origin}${window.location.pathname}#/validar/${base.numero}/${base.hash.slice(0, 16)}`,
      { margin: 0, width: 220 }
    );
  } catch { /* QR é opcional; sem ele o termo continua válido pelo hash impresso */ }

  const doc = gerarTermo(base);
  return { blob: doc.output('blob'), hash: base.hash };
}

export { gerarTermo };
