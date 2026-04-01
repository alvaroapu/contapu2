import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import type { Liquidation, LiquidationItem } from '@/hooks/useLiquidations';

function formatEur(val: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build the XML for the sales box content (inside the table cell).
 * One block per book, all within a single author report.
 */
function buildBoxContent(
  author: string,
  authorItems: LiquidationItem[],
  liq: Liquidation,
): string {
  const year = liq.year;
  let xml = '';

  // "Informe de ventas YEAR:" bold + underline
  xml += `<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:b/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:u w:val="single"/></w:rPr><w:t>Informe de ventas ${year}:</w:t></w:r></w:p>`;

  // "- Nombre autor/a: [author]"
  xml += `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">- Nombre autor/a: ${escapeXml(author)}</w:t></w:r></w:p>`;

  // Empty line
  xml += `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr></w:p>`;

  for (const item of authorItems) {
    // "- Título: [title]"
    xml += `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">- Título: ${escapeXml(item.book_title)}</w:t></w:r></w:p>`;

    // Empty line
    xml += `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr></w:p>`;

    // Distributor sales
    xml += `<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108" w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">- Venta en librerías (beneficio del ${liq.distributor_royalty_pct}% por ejemplar):  ${item.distributor_units} ejemplares: ${formatEur(item.distributor_amount)}</w:t></w:r></w:p>`;

    // Online sales
    xml += `<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108" w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">- Venta en nuestra web (beneficio del ${liq.online_royalty_pct}% por ejemplar):  ${item.online_units} ejemplares: ${formatEur(item.online_amount)}</w:t></w:r></w:p>`;

    // School/institution sales
    xml += `<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108" w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">- Venta en instituciones (beneficio del ${liq.school_royalty_pct}% por ejemplar): ${item.school_units} ejemplares: ${formatEur(item.school_amount)}</w:t></w:r></w:p>`;
  }

  // TOTAL line
  const total = authorItems.reduce((s, i) => s + i.total_amount, 0);
  xml += `<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108"/><w:jc w:val="both"/><w:rPr><w:b/><w:u w:val="single"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">TOTAL: </w:t></w:r>` +
    `<w:r><w:rPr><w:i/></w:rPr><w:t>${formatEur(total)}</w:t></w:r></w:p>`;

  return xml;
}

/**
 * Build the full document.xml body content with author-specific data.
 */
function buildDocumentBody(
  author: string,
  authorItems: LiquidationItem[],
  liq: Liquidation,
): string {
  const year = liq.year;
  const escapedAuthor = escapeXml(author);

  // Table cell with blue background containing the sales box
  const tableCell = `<w:tc>` +
    `<w:tcPr>` +
    `<w:tcW w:w="8738" w:type="dxa"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="C6D9F0" w:themeFill="text2" w:themeFillTint="33"/>` +
    `</w:tcPr>` +
    buildBoxContent(author, authorItems, liq) +
    `</w:tc>`;

  const tableRow = `<w:tr>` +
    `<w:trPr><w:trHeight w:val="3305" w:hRule="atLeast"/></w:trPr>` +
    tableCell +
    `</w:tr>`;

  const tableBorders = `<w:tblBorders>` +
    `<w:top w:val="single" w:color="7BA0CD" w:themeColor="accent1" w:themeTint="BF" w:sz="8" w:space="0"/>` +
    `<w:left w:val="single" w:color="7BA0CD" w:themeColor="accent1" w:themeTint="BF" w:sz="8" w:space="0"/>` +
    `<w:bottom w:val="single" w:color="7BA0CD" w:themeColor="accent1" w:themeTint="BF" w:sz="8" w:space="0"/>` +
    `<w:right w:val="single" w:color="7BA0CD" w:themeColor="accent1" w:themeTint="BF" w:sz="8" w:space="0"/>` +
    `<w:insideH w:val="single" w:color="7BA0CD" w:themeColor="accent1" w:themeTint="BF" w:sz="8" w:space="0"/>` +
    `<w:insideV w:val="single" w:color="7BA0CD" w:themeColor="accent1" w:themeTint="BF" w:sz="8" w:space="0"/>` +
    `</w:tblBorders>`;

  const table = `<w:tbl>` +
    `<w:tblPr><w:tblStyle w:val="10"/><w:tblW w:w="8738" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/>${tableBorders}<w:tblLayout w:type="autofit"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="8738"/></w:tblGrid>` +
    tableRow +
    `</w:tbl>`;

  // Build the full body
  let body = '';

  // Empty paragraph (spacing)
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="005358C2"/>`;

  // "Dirigido a [author]." with header logo
  // "Dirigido a [author]."
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>Dirigido a ${escapedAuthor}.</w:t></w:r></w:p>`;

  // "Buenas tardes:" with the header logo as anchor drawing
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:rPr><w:lang w:eastAsia="es-ES"/></w:rPr>` +
    `<w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="margin"><wp:posOffset>4627245</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="margin"><wp:posOffset>-561975</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="1243965" cy="879475"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:wrapSquare wrapText="bothSides"/>` +
    `<wp:docPr id="1" name="0 Imagen"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="1" name="0 Imagen"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId6" cstate="print"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1243965" cy="879475"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>` +
    `<w:r><w:t>Buenas tardes:</w:t></w:r></w:p>`;

  // Intro paragraph
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">En relación al informe de ventas del año ${year}, indicarle que ya lo tenemos preparado y se lo enviaremos a continuación. Es importante tener en cuenta la operativa de ventas en librerías a través de </w:t></w:r>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t>distribuidoras</w:t></w:r>` +
    `<w:r><w:t>, por lo que pasamos a detallarla:</w:t></w:r></w:p>`;

  // Empty paragraph
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr></w:p>`;

  // Point 1
  body += `<w:p><w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>1. Las distribuidoras cuentan con un depósito de ejemplares que desde la editorial les hacemos llegar.</w:t></w:r></w:p>`;

  // Point 2
  body += `<w:p><w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>2. Las distribuidoras mandan ejemplares en depósito a librerías y a grandes superficies; el depósito dura de 3 a 6 meses, por lo que hasta transcurridos estos plazos, las distribuidoras desconocen las ventas de los libros.</w:t></w:r></w:p>`;

  // Empty paragraph
  body += `<w:p><w:pPr><w:jc w:val="both"/><w:rPr><w:b/></w:rPr></w:pPr></w:p>`;

  // "Ejemplos:"
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t>Ejemplos</w:t></w:r>` +
    `<w:r><w:t xml:space="preserve">: </w:t></w:r></w:p>`;

  // Example 1
  body += `<w:p><w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>1. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósitos con fecha posterior al 30 de septiembre (en el caso de haberlos dejado en depósito durante 3 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 9 meses del año.</w:t></w:r></w:p>`;

  // Example 2
  body += `<w:p><w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>2. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósito con fecha posterior al 30 de junio (en el caso de haberlos dejado en depósito durante 6 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 6 meses del año.</w:t></w:r></w:p>`;

  // Empty paragraph before table
  body += `<w:p><w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr></w:p>`;

  // Blue table/box
  body += table;

  // Empty paragraph after table
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr></w:p>`;

  // Bank account request
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">Para que la editorial pueda realizar el pago, lo más conveniente, para agilizar el proceso de cobro, es que como autor/a nos conteste a este correo indicando su número de cuenta.</w:t></w:r></w:p>`;

  // Autofactura info
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>La editorial le realizará una autofactura, como rendimientos del trabajo, para que usted, como autor/a, NO tenga que darse de alta como autónomo/a.</w:t></w:r></w:p>`;

  // "Sellado:"
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>Sellado:</w:t></w:r></w:p>`;

  // Stamp image (inline)
  body += `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:rPr><w:lang w:eastAsia="es-ES"/></w:rPr>` +
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="1618615" cy="879475"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="2" name="0 Imagen"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="2" name="0 Imagen"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId7" cstate="print"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1617706" cy="879238"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

  // Empty paragraph
  body += `<w:p/>`;

  // Section properties
  body += `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708" w:num="1"/><w:docGrid w:linePitch="360" w:charSpace="0"/></w:sectPr>`;

  return body;
}

/**
 * Build the full document.xml wrapping the body content with all namespaces.
 */
function buildDocumentXml(
  author: string,
  authorItems: LiquidationItem[],
  liq: Liquidation,
): string {
  const body = buildDocumentBody(author, authorItems, liq);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ` +
    `xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ` +
    `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
    `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ` +
    `xmlns:v="urn:schemas-microsoft-com:vml" ` +
    `xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    `xmlns:w10="urn:schemas-microsoft-com:office:word" ` +
    `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ` +
    `xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ` +
    `xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ` +
    `xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ` +
    `xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ` +
    `mc:Ignorable="w14 wp14">` +
    `<w:body>` + body + `</w:body></w:document>`;
}

// Cache for the template zip
let templateZipCache: JSZip | null = null;

async function loadTemplate(): Promise<JSZip> {
  if (templateZipCache) return templateZipCache;
  const res = await fetch('/templates/liquidacion_template.docx');
  const buf = await res.arrayBuffer();
  templateZipCache = await JSZip.loadAsync(buf);
  return templateZipCache;
}

export async function generateAuthorDOCX(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation,
): Promise<Blob> {
  const template = await loadTemplate();

  // Clone the template zip
  const newZip = new JSZip();
  for (const [path, file] of Object.entries(template.files)) {
    if (file.dir) {
      newZip.folder(path);
    } else if (path === 'word/document.xml') {
      // Replace with our generated content
      const authorItems = items.filter(i => i.author === author);
      const docXml = buildDocumentXml(author, authorItems, liquidation);
      newZip.file(path, docXml);
    } else {
      // Copy as-is (preserves images, styles, rels, etc.)
      const content = await file.async('arraybuffer');
      newZip.file(path, content);
    }
  }

  return newZip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export async function downloadAuthorDOCX(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation,
) {
  const blob = await generateAuthorDOCX(author, items, liquidation);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Liquidacion_${liquidation.year}_${author.replace(/\s+/g, '_')}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeAuthorName(author: string): string {
  return author
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_');
}

/**
 * Convert a DOCX blob to PDF via the Gotenberg edge function.
 * Uploads the DOCX to storage, calls the edge function with testOnly=true,
 * and returns the PDF as a Blob.
 */
export async function convertDocxToPdf(
  docxBlob: Blob,
  author: string,
  liquidationYear: number,
): Promise<{ pdfBlob: Blob; pdfFileName: string }> {
  const sanitizedName = sanitizeAuthorName(author);
  const fileName = `${liquidationYear}/${sanitizedName}.docx`;

  const { error: uploadError } = await supabase.storage
    .from('liquidation-docs')
    .upload(fileName, docxBlob, { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

  if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from('liquidation-docs').getPublicUrl(fileName);

  const { data, error } = await supabase.functions.invoke('send-liquidation-email', {
    body: {
      author,
      liquidationYear,
      docxUrl: urlData.publicUrl,
      testOnly: true,
    },
  });

  if (error) throw error;

  const pdfBytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0));
  return {
    pdfBlob: new Blob([pdfBytes], { type: 'application/pdf' }),
    pdfFileName: data.pdfFileName,
  };
}

/**
 * Generate and download a single author's report as PDF.
 */
export async function downloadAuthorPDF(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation,
) {
  const docxBlob = await generateAuthorDOCX(author, items, liquidation);
  const { pdfBlob, pdfFileName } = await convertDocxToPdf(docxBlob, author, liquidation.year);
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfFileName;
  a.click();
  URL.revokeObjectURL(url);
}
