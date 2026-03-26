import jsPDF from 'jspdf';
import type { Liquidation, LiquidationItem } from '@/hooks/useLiquidations';

function formatEur(val: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 25;
const MARGIN_R = 25;
const MARGIN_T = 20;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

// Cache for loaded images
let headerLogoData: string | null = null;
let stampLogoData: string | null = null;

async function loadImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

async function ensureLogosLoaded(): Promise<void> {
  if (!headerLogoData) {
    headerLogoData = await loadImageAsDataUrl('/img/logo_header.png');
  }
  if (!stampLogoData) {
    stampLogoData = await loadImageAsDataUrl('/img/logo_stamp.png');
  }
}

/**
 * Add text with word wrapping and optional justify alignment.
 * Returns the Y position after the text.
 */
function addText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  opts?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;
    align?: 'left' | 'justify';
  }
): number {
  const prevSize = doc.getFontSize();
  if (opts?.fontSize) doc.setFontSize(opts.fontSize);

  let style = 'normal';
  if (opts?.bold && opts?.italic) style = 'bolditalic';
  else if (opts?.bold) style = 'bold';
  else if (opts?.italic) style = 'italic';
  doc.setFont('helvetica', style);

  const lines: string[] = doc.splitTextToSize(text, maxW);
  const align = opts?.align ?? 'left';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (y > PAGE_H - 25) {
      doc.addPage();
      y = MARGIN_T;
    }

    if (align === 'justify' && i < lines.length - 1 && line.trim().length > 0) {
      // Justify: distribute extra space between words
      const words = line.split(/\s+/);
      if (words.length > 1) {
        const totalTextWidth = words.reduce((sum, w) => sum + doc.getTextWidth(w), 0);
        const extraSpace = (maxW - totalTextWidth) / (words.length - 1);
        let cx = x;
        for (const word of words) {
          doc.text(word, cx, y);
          cx += doc.getTextWidth(word) + extraSpace;
        }
      } else {
        doc.text(line, x, y);
      }
    } else {
      doc.text(line, x, y);
    }

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

/**
 * Measure text height without rendering
 */
function measureTextHeight(
  doc: jsPDF,
  text: string,
  maxW: number,
  lineH: number,
  opts?: { bold?: boolean; fontSize?: number }
): number {
  const prevSize = doc.getFontSize();
  if (opts?.fontSize) doc.setFontSize(opts.fontSize);
  if (opts?.bold) doc.setFont('helvetica', 'bold');
  else doc.setFont('helvetica', 'normal');

  const lines = doc.splitTextToSize(text, maxW);
  doc.setFont('helvetica', 'normal');
  if (opts?.fontSize) doc.setFontSize(prevSize);
  return lines.length * lineH;
}

function buildAuthorPDF(
  author: string,
  authorItems: LiquidationItem[],
  liq: Liquidation
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  const lineH = 5.5;
  const boxPadding = 5;
  const boxInnerW = CONTENT_W - boxPadding * 2;

  // ========== PAGE 1 ==========

  // Header logo (top right)
  if (headerLogoData) {
    // Original: 299x212px, display ~30x21mm top right
    const logoW = 30;
    const logoH = 21;
    doc.addImage(headerLogoData, 'PNG', PAGE_W - MARGIN_R - logoW, MARGIN_T - 5, logoW, logoH);
  }

  let y = MARGIN_T + 20;

  // "Dirigido a [author]."
  y = addText(doc, `Dirigido a ${author}.`, MARGIN_L, y, CONTENT_W, lineH);
  y += 4;

  // "Buenas tardes:"
  y = addText(doc, 'Buenas tardes:', MARGIN_L, y, CONTENT_W, lineH);
  y += 4;

  // Intro paragraph (justified like the DOCX)
  const intro = `En relación al informe de ventas del año ${liq.year}, indicar que ya lo tenemos preparado y se lo enviaremos a continuación. Es importante tener en cuenta la operativa de ventas en librerías a través de distribuidoras, por lo que pasamos a detallarla:`;
  y = addText(doc, intro, MARGIN_L, y, CONTENT_W, lineH, { align: 'justify' });
  y += 4;

  // Numbered points with indent (justified)
  const indent = 12;
  y = addText(doc, '1. Las distribuidoras cuentan con un depósito de ejemplares que desde la editorial les hacemos llegar.', MARGIN_L + indent, y, CONTENT_W - indent, lineH, { align: 'justify' });
  y += 3;
  y = addText(doc, '2. Las distribuidoras mandan ejemplares en depósito a librerías y a grandes superficies; el depósito dura de 3 a 6 meses, por lo que hasta transcurridos estos plazos, las distribuidoras desconocen las ventas de los libros.', MARGIN_L + indent, y, CONTENT_W - indent, lineH, { align: 'justify' });
  y += 8;

  // "Ejemplos:" bold
  y = addText(doc, 'Ejemplos:', MARGIN_L, y, CONTENT_W, lineH, { bold: true });
  y += 4;

  y = addText(doc, '1. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósitos con fecha posterior al 30 de septiembre (en el caso de haberlos dejado en depósito durante 3 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 9 meses del año.', MARGIN_L + indent, y, CONTENT_W - indent, lineH, { align: 'justify' });
  y += 3;
  y = addText(doc, '2. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósito con fecha posterior al 30 de junio (en el caso de haberlos dejado en depósito durante 6 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 6 meses del año.', MARGIN_L + indent, y, CONTENT_W - indent, lineH, { align: 'justify' });
  y += 8;

  // ========== BLUE BOX ==========
  // Measure box content height first
  let boxH = boxPadding;

  boxH += measureTextHeight(doc, `Informe de ventas ${liq.year}:`, boxInnerW, lineH, { bold: true }) + 4;
  boxH += measureTextHeight(doc, `- Nombre autor/a: ${author}`, boxInnerW, lineH) + 5;

  const salesIndent = 8;
  const salesW = boxInnerW - salesIndent;

  for (const item of authorItems) {
    boxH += measureTextHeight(doc, `- Título: ${item.book_title}`, boxInnerW, lineH) + 4;
    boxH += measureTextHeight(doc, `- Venta en librerías (beneficio del ${liq.distributor_royalty_pct}% por ejemplar):  ${item.distributor_units} ejemplares: ${formatEur(item.distributor_amount)}`, salesW, lineH);
    boxH += 2;
    boxH += measureTextHeight(doc, `- Venta en nuestra web (beneficio del ${liq.online_royalty_pct}% por ejemplar):  ${item.online_units} ejemplares: ${formatEur(item.online_amount)}`, salesW, lineH);
    boxH += 2;
    boxH += measureTextHeight(doc, `- Venta en instituciones (beneficio del ${liq.school_royalty_pct}% por ejemplar): ${item.school_units} ejemplares: ${formatEur(item.school_amount)}`, salesW, lineH);
    boxH += 5;
  }

  const total = authorItems.reduce((s, i) => s + i.total_amount, 0);
  boxH += lineH + 2; // TOTAL line
  boxH += boxPadding;

  // Check if box fits, otherwise new page
  if (y + boxH > PAGE_H - 25) {
    doc.addPage();
    y = MARGIN_T;
  }

  // Draw blue box background
  const boxStartY = y;
  doc.setFillColor(198, 217, 241); // #C6D9F1 like the DOCX
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN_L, boxStartY, CONTENT_W, boxH, 'FD');

  // Render box content
  let bY = boxStartY + boxPadding;

  bY = addText(doc, `Informe de ventas ${liq.year}:`, MARGIN_L + boxPadding, bY, boxInnerW, lineH, { bold: true, underline: true });
  bY += 4;

  bY = addText(doc, `- Nombre autor/a: ${author}`, MARGIN_L + boxPadding, bY, boxInnerW, lineH);
  bY += 5;

  for (const item of authorItems) {
    bY = addText(doc, `- Título: ${item.book_title}`, MARGIN_L + boxPadding, bY, boxInnerW, lineH);
    bY += 4;

    const indentX = MARGIN_L + boxPadding + salesIndent;

    bY = addText(doc, `- Venta en librerías (beneficio del ${liq.distributor_royalty_pct}% por ejemplar):  ${item.distributor_units} ejemplares: ${formatEur(item.distributor_amount)}`, indentX, bY, salesW, lineH);
    bY += 2;
    bY = addText(doc, `- Venta en nuestra web (beneficio del ${liq.online_royalty_pct}% por ejemplar):  ${item.online_units} ejemplares: ${formatEur(item.online_amount)}`, indentX, bY, salesW, lineH);
    bY += 2;
    bY = addText(doc, `- Venta en instituciones (beneficio del ${liq.school_royalty_pct}% por ejemplar): ${item.school_units} ejemplares: ${formatEur(item.school_amount)}`, indentX, bY, salesW, lineH);
    bY += 5;
  }

  // TOTAL line: "TOTAL:" bold + amount italic
  doc.setFont('helvetica', 'bold');
  const totalLabel = 'TOTAL: ';
  doc.text(totalLabel, MARGIN_L + boxPadding, bY);
  const tw = doc.getTextWidth(totalLabel);
  doc.setFont('helvetica', 'italic');
  doc.text(formatEur(total), MARGIN_L + boxPadding + tw, bY);
  doc.setFont('helvetica', 'normal');

  // ========== PAGE 2 ==========
  doc.addPage();
  y = MARGIN_T;

  // Footer text (justified)
  y = addText(
    doc,
    'Para que la editorial pueda realizar el pago, lo más conveniente, para agilizar el proceso de cobro, es que como autor/a realice una factura por PayPal a icidre@apuleyoediciones.com.',
    MARGIN_L, y, CONTENT_W, lineH, { align: 'justify' }
  );
  y += 2;

  // "IMPORTANTE..." bold
  y = addText(
    doc,
    'IMPORTANTE QUE SEA FACTURA Y NO UNA PETICIÓN DE PAGO.',
    MARGIN_L, y, CONTENT_W, lineH, { bold: true }
  );
  y += 4;

  y = addText(doc, 'Recomendamos la primera opción, para evitar trámites.', MARGIN_L, y, CONTENT_W, lineH, { align: 'justify' });
  y += 8;

  y = addText(doc, 'Os facilitamos un vídeo para usarlo como guía en caso de tener ciertas dificultades con la factura:', MARGIN_L, y, CONTENT_W, lineH, { align: 'justify' });
  y += 2;

  // Link (blue, underlined)
  doc.setTextColor(0, 0, 255);
  y = addText(doc, 'https://youtu.be/eVC-zxlDuLE?si=Hx10Vj7v34z1160r', MARGIN_L, y, CONTENT_W, lineH, { underline: true });
  doc.setTextColor(0, 0, 0);
  y += 10;

  // "Sellado:"
  y = addText(doc, 'Sellado:', MARGIN_L, y, CONTENT_W, lineH);
  y += 4;

  // Stamp logo
  if (stampLogoData) {
    const stampW = 40;
    const stampH = 22;
    doc.addImage(stampLogoData, 'PNG', MARGIN_L, y, stampW, stampH);
    y += stampH + 2;
  }

  // CIF text
  doc.setFontSize(8);
  y = addText(doc, 'CIF: B44667327', MARGIN_L, y, CONTENT_W, 4);
  doc.setFontSize(11);

  return doc;
}

export async function generateAuthorPDF(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation,
): Promise<Blob> {
  await ensureLogosLoaded();
  const authorItems = items.filter(i => i.author === author);
  const doc = buildAuthorPDF(author, authorItems, liquidation);
  return doc.output('blob');
}

export async function downloadAuthorPDF(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation,
) {
  const blob = await generateAuthorPDF(author, items, liquidation);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Liquidacion_${liquidation.year}_${author.replace(/\s+/g, '_')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
