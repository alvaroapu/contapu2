import jsPDF from 'jspdf';
import type { Liquidation, LiquidationItem } from '@/hooks/useLiquidations';

function formatEur(val: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
}

const PAGE_W = 210;
const MARGIN_L = 20;
const MARGIN_R = 20;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxW: number, lineH: number, opts?: { bold?: boolean; italic?: boolean; underline?: boolean; fontSize?: number }): number {
  const prevSize = doc.getFontSize();
  if (opts?.fontSize) doc.setFontSize(opts.fontSize);
  
  let style = 'normal';
  if (opts?.bold && opts?.italic) style = 'bolditalic';
  else if (opts?.bold) style = 'bold';
  else if (opts?.italic) style = 'italic';
  doc.setFont('helvetica', style);

  const lines = doc.splitTextToSize(text, maxW);
  for (const line of lines) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    if (opts?.underline) {
      const tw = doc.getTextWidth(line);
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(x, y + 0.5, x + tw, y + 0.5);
    }
    y += lineH;
  }
  
  doc.setFont('helvetica', 'normal');
  if (opts?.fontSize) doc.setFontSize(prevSize);
  return y;
}

function buildAuthorPDF(author: string, authorItems: LiquidationItem[], liq: Liquidation): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  
  let y = 25;
  const lineH = 5.5;

  // "Dirigido a [author]."
  y = addWrappedText(doc, `Dirigido a ${author}.`, MARGIN_L, y, CONTENT_W, lineH);
  y += 3;

  // "Buenas tardes:"
  y = addWrappedText(doc, 'Buenas tardes:', MARGIN_L, y, CONTENT_W, lineH);
  y += 2;

  // Intro paragraph
  const intro = `En relación al informe de ventas del año ${liq.year}, indicar que ya lo tenemos preparado y se lo enviaremos a continuación. Es importante tener en cuenta la operativa de ventas en librerías a través de distribuidoras, por lo que pasamos a detallarla:`;
  y = addWrappedText(doc, intro, MARGIN_L, y, CONTENT_W, lineH);
  y += 2;

  // Numbered points
  y = addWrappedText(doc, '1. Las distribuidoras cuentan con un depósito de ejemplares que desde la editorial les hacemos llegar.', MARGIN_L, y, CONTENT_W, lineH);
  y += 1;
  y = addWrappedText(doc, '2. Las distribuidoras mandan ejemplares en depósito a librerías y a grandes superficies; el depósito dura de 3 a 6 meses, por lo que hasta transcurridos estos plazos, las distribuidoras desconocen las ventas de los libros.', MARGIN_L, y, CONTENT_W, lineH);
  y += 3;

  // Examples
  y = addWrappedText(doc, 'Ejemplos:', MARGIN_L, y, CONTENT_W, lineH, { bold: true });
  y += 1;
  y = addWrappedText(doc, '1. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósitos con fecha posterior al 30 de septiembre (en el caso de haberlos dejado en depósito durante 3 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 9 meses del año.', MARGIN_L, y, CONTENT_W, lineH);
  y += 1;
  y = addWrappedText(doc, '2. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósito con fecha posterior al 30 de junio (en el caso de haberlos dejado en depósito durante 6 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 6 meses del año.', MARGIN_L, y, CONTENT_W, lineH);
  y += 5;

  // --- Sales info box ---
  const boxX = MARGIN_L;
  const boxW = CONTENT_W;
  const boxStartY = y;
  const boxPadding = 4;
  let boxY = y + boxPadding;

  // We'll render content first to measure, then draw the box
  // Save state, render to measure
  const contentStartY = boxY;

  // "Informe de ventas YEAR:"
  boxY = addWrappedText(doc, `Informe de ventas ${liq.year}:`, boxX + boxPadding, boxY, boxW - boxPadding * 2, lineH, { bold: true, underline: true });
  boxY += 2;

  // Author name
  boxY = addWrappedText(doc, `- Nombre autor/a: ${author}`, boxX + boxPadding, boxY, boxW - boxPadding * 2, lineH);
  boxY += 3;

  // Each book
  for (const item of authorItems) {
    // Title
    boxY = addWrappedText(doc, `- Título: ${item.book_title}`, boxX + boxPadding, boxY, boxW - boxPadding * 2, lineH);
    boxY += 2;

    // Distributor sales
    const indentX = boxX + boxPadding + 8;
    const indentW = boxW - boxPadding * 2 - 8;
    boxY = addWrappedText(doc, `- Venta en librerías (beneficio del ${liq.distributor_royalty_pct}% por ejemplar):  ${item.distributor_units} ejemplares: ${formatEur(item.distributor_amount)}`, indentX, boxY, indentW, lineH);

    // Online sales
    boxY = addWrappedText(doc, `- Venta web (beneficio del ${liq.online_royalty_pct}% por ejemplar):  ${item.online_units} ejemplares: ${formatEur(item.online_amount)}`, indentX, boxY, indentW, lineH);

    // School sales
    boxY = addWrappedText(doc, `- Venta en instituciones (beneficio del ${liq.school_royalty_pct}% por ejemplar): ${item.school_units} ejemplares: ${formatEur(item.school_amount)}`, indentX, boxY, indentW, lineH);
    boxY += 3;
  }

  // Total
  const total = authorItems.reduce((s, i) => s + i.total_amount, 0);
  boxY = addWrappedText(doc, `TOTAL: `, boxX + boxPadding, boxY, boxW - boxPadding * 2, lineH, { bold: true });
  // Go back up to add the amount in italic next to TOTAL
  const totalLabelW = doc.getTextWidth('TOTAL: ');
  doc.setFont('helvetica', 'italic');
  doc.text(formatEur(total), boxX + boxPadding + totalLabelW, boxY - lineH);
  doc.setFont('helvetica', 'normal');
  boxY += 2;

  // Draw the box background and border
  const boxH = boxY - boxStartY;
  // Light blue background
  doc.setFillColor(198, 217, 241); // #C6D9F1
  doc.setDrawColor(150, 180, 220);
  doc.setLineWidth(0.5);
  // Draw behind text - we need to redraw. Instead, let's use a different approach.
  // jsPDF draws in order, so we need to draw the rect first. 
  // We'll rebuild with a two-pass approach.

  // Actually, let's just rebuild. The simplest approach: calculate height first, draw box, then text.
  // Since we already rendered the text on the pages, let's just overlay the rectangle behind.
  // Unfortunately jsPDF doesn't support z-ordering. Let's rebuild properly.

  return rebuildWithBox(author, authorItems, liq);
}

function rebuildWithBox(author: string, authorItems: LiquidationItem[], liq: Liquidation): jsPDF {
  // First pass: measure the box content height
  const measureDoc = new jsPDF({ unit: 'mm', format: 'a4' });
  measureDoc.setFont('helvetica', 'normal');
  measureDoc.setFontSize(11);
  
  const lineH = 5.5;
  const boxPadding = 4;
  const boxInnerW = CONTENT_W - boxPadding * 2;
  let h = boxPadding;

  // Measure all box content
  function measureText(text: string, maxW: number, opts?: { bold?: boolean }): number {
    if (opts?.bold) measureDoc.setFont('helvetica', 'bold');
    else measureDoc.setFont('helvetica', 'normal');
    const lines = measureDoc.splitTextToSize(text, maxW);
    measureDoc.setFont('helvetica', 'normal');
    return lines.length * lineH;
  }

  h += measureText(`Informe de ventas ${liq.year}:`, boxInnerW, { bold: true }) + 2;
  h += measureText(`- Nombre autor/a: ${author}`, boxInnerW) + 3;

  for (const item of authorItems) {
    h += measureText(`- Título: ${item.book_title}`, boxInnerW) + 2;
    const indentW = boxInnerW - 8;
    h += measureText(`- Venta en librerías (beneficio del ${liq.distributor_royalty_pct}% por ejemplar):  ${item.distributor_units} ejemplares: ${formatEur(item.distributor_amount)}`, indentW);
    h += measureText(`- Venta web (beneficio del ${liq.online_royalty_pct}% por ejemplar):  ${item.online_units} ejemplares: ${formatEur(item.online_amount)}`, indentW);
    h += measureText(`- Venta en instituciones (beneficio del ${liq.school_royalty_pct}% por ejemplar): ${item.school_units} ejemplares: ${formatEur(item.school_amount)}`, indentW);
    h += 3;
  }

  h += measureText('TOTAL: ' + formatEur(authorItems.reduce((s, i) => s + i.total_amount, 0)), boxInnerW, { bold: true }) + 2;
  h += boxPadding;

  // Second pass: actual render
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  
  let y = 25;

  // Intro text
  y = addWrappedText(doc, `Dirigido a ${author}.`, MARGIN_L, y, CONTENT_W, lineH);
  y += 3;
  y = addWrappedText(doc, 'Buenas tardes:', MARGIN_L, y, CONTENT_W, lineH);
  y += 2;
  y = addWrappedText(doc, `En relación al informe de ventas del año ${liq.year}, indicar que ya lo tenemos preparado y se lo enviaremos a continuación. Es importante tener en cuenta la operativa de ventas en librerías a través de distribuidoras, por lo que pasamos a detallarla:`, MARGIN_L, y, CONTENT_W, lineH);
  y += 2;
  y = addWrappedText(doc, '1. Las distribuidoras cuentan con un depósito de ejemplares que desde la editorial les hacemos llegar.', MARGIN_L, y, CONTENT_W, lineH);
  y += 1;
  y = addWrappedText(doc, '2. Las distribuidoras mandan ejemplares en depósito a librerías y a grandes superficies; el depósito dura de 3 a 6 meses, por lo que hasta transcurridos estos plazos, las distribuidoras desconocen las ventas de los libros.', MARGIN_L, y, CONTENT_W, lineH);
  y += 3;
  y = addWrappedText(doc, 'Ejemplos:', MARGIN_L, y, CONTENT_W, lineH, { bold: true });
  y += 1;
  y = addWrappedText(doc, '1. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósitos con fecha posterior al 30 de septiembre (en el caso de haberlos dejado en depósito durante 3 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 9 meses del año.', MARGIN_L, y, CONTENT_W, lineH);
  y += 1;
  y = addWrappedText(doc, '2. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósito con fecha posterior al 30 de junio (en el caso de haberlos dejado en depósito durante 6 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 6 meses del año.', MARGIN_L, y, CONTENT_W, lineH);
  y += 5;

  // Check if box fits on current page, if not, new page
  if (y + h > 280) {
    doc.addPage();
    y = 20;
  }

  // Draw box background
  const boxStartY = y;
  doc.setFillColor(198, 217, 241);
  doc.setDrawColor(150, 180, 220);
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN_L, boxStartY, CONTENT_W, h, 1, 1, 'FD');

  // Box content
  let bY = boxStartY + boxPadding;
  bY = addWrappedText(doc, `Informe de ventas ${liq.year}:`, MARGIN_L + boxPadding, bY, boxInnerW, lineH, { bold: true, underline: true });
  bY += 2;
  bY = addWrappedText(doc, `- Nombre autor/a: ${author}`, MARGIN_L + boxPadding, bY, boxInnerW, lineH);
  bY += 3;

  for (const item of authorItems) {
    bY = addWrappedText(doc, `- Título: ${item.book_title}`, MARGIN_L + boxPadding, bY, boxInnerW, lineH);
    bY += 2;
    const indentX = MARGIN_L + boxPadding + 8;
    const indentW = boxInnerW - 8;
    bY = addWrappedText(doc, `- Venta en librerías (beneficio del ${liq.distributor_royalty_pct}% por ejemplar):  ${item.distributor_units} ejemplares: ${formatEur(item.distributor_amount)}`, indentX, bY, indentW, lineH);
    bY = addWrappedText(doc, `- Venta web (beneficio del ${liq.online_royalty_pct}% por ejemplar):  ${item.online_units} ejemplares: ${formatEur(item.online_amount)}`, indentX, bY, indentW, lineH);
    bY = addWrappedText(doc, `- Venta en instituciones (beneficio del ${liq.school_royalty_pct}% por ejemplar): ${item.school_units} ejemplares: ${formatEur(item.school_amount)}`, indentX, bY, indentW, lineH);
    bY += 3;
  }

  // Total line
  const total = authorItems.reduce((s, i) => s + i.total_amount, 0);
  doc.setFont('helvetica', 'bold');
  const totalLabel = 'TOTAL: ';
  doc.text(totalLabel, MARGIN_L + boxPadding, bY);
  const tw = doc.getTextWidth(totalLabel);
  doc.setFont('helvetica', 'italic');
  doc.text(formatEur(total), MARGIN_L + boxPadding + tw, bY);
  doc.setFont('helvetica', 'normal');
  bY += lineH + 2;

  y = boxStartY + h + 5;

  // Footer
  y = addWrappedText(doc, 'Para que la editorial pueda realizar el pago, lo más conveniente, para agilizar el proceso de cobro, es que como autor/a realice una factura por PayPal a icidre@apuleyoediciones.com IMPORTANTE QUE SEA FACTURA Y NO UNA PETICIÓN DE PAGO.', MARGIN_L, y, CONTENT_W, lineH);
  y += 2;
  y = addWrappedText(doc, 'Recomendamos la primera opción, para evitar trámites.', MARGIN_L, y, CONTENT_W, lineH);
  y += 2;
  y = addWrappedText(doc, 'Os facilitamos un vídeo para usarlo como guía en caso de tener ciertas dificultades con la factura:', MARGIN_L, y, CONTENT_W, lineH);
  y = addWrappedText(doc, 'https://youtu.be/eVC-zxlDuLE?si=Hx10Vj7v34z1160r', MARGIN_L, y, CONTENT_W, lineH);
  y += 5;
  y = addWrappedText(doc, 'Sellado:', MARGIN_L, y, CONTENT_W, lineH);

  return doc;
}

const boxInnerW = CONTENT_W - 8; // boxPadding * 2

export function generateAuthorPDF(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation,
): Blob {
  const authorItems = items.filter(i => i.author === author);
  const doc = rebuildWithBox(author, authorItems, liquidation);
  return doc.output('blob');
}

export function downloadAuthorPDF(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation,
) {
  const blob = generateAuthorPDF(author, items, liquidation);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Liquidacion_${liquidation.year}_${author.replace(/\s+/g, '_')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
