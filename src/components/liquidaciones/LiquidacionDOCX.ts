import JSZip from 'jszip';
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
  xml += `<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">- Nombre autor/a: </w:t></w:r>` +
    `<w:r><w:t>${escapeXml(author)}</w:t></w:r></w:p>`;

  // Empty line
  xml += `<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr></w:p>`;

  for (const item of authorItems) {
    // "- Título: [title]"
    xml += `<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr>` +
      `<w:r><w:t xml:space="preserve">- Título: ${escapeXml(item.book_title)}</w:t></w:r></w:p>`;

    // Empty line
    xml += `<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr></w:p>`;

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
  xml += `<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr>` +
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
    `<w:cnfStyle w:val="000010000000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:oddVBand="1" w:evenVBand="0" w:oddHBand="0" w:evenHBand="0" w:firstRowFirstColumn="0" w:firstRowLastColumn="0" w:lastRowFirstColumn="0" w:lastRowLastColumn="0"/>` +
    `<w:tcW w:w="8738" w:type="dxa"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="C6D9F1" w:themeFill="text2" w:themeFillTint="33"/>` +
    `</w:tcPr>` +
    buildBoxContent(author, authorItems, liq) +
    `</w:tc>`;

  const tableRow = `<w:tr>` +
    `<w:trPr><w:cnfStyle w:val="000000100000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:oddVBand="0" w:evenVBand="0" w:oddHBand="1" w:evenHBand="0" w:firstRowFirstColumn="0" w:firstRowLastColumn="0" w:lastRowFirstColumn="0" w:lastRowLastColumn="0"/></w:trPr>` +
    tableCell +
    `</w:tr>`;

  const table = `<w:tbl>` +
    `<w:tblPr><w:tblStyle w:val="Cuadrculamedia1-nfasis1"/><w:tblW w:w="8738" w:type="dxa"/><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="8738"/></w:tblGrid>` +
    tableRow +
    `</w:tbl>`;

  // Build the full body
  let body = '';

  // Empty paragraph (spacing)
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="005358C2"/>`;

  // "Dirigido a [author]." with header logo
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00D41657" w:rsidP="00444165">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">Dirigido a ${escapedAuthor}.</w:t></w:r></w:p>`;

  // "Buenas tardes:" with the header logo as anchor drawing
  body += `<w:p w:rsidR="005358C2" w:rsidRDefault="00BE7066" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:rPr><w:noProof/><w:lang w:eastAsia="es-ES"/></w:rPr>` +
    `<w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">` +
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
    `<pic:nvPicPr><pic:cNvPr id="0" name="logo_apuleyo_negro_RGB.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId7" cstate="print"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1243965" cy="879475"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>` +
    `<w:r><w:t>Buenas tardes:</w:t></w:r></w:p>`;

  // Intro paragraph
  body += `<w:p w:rsidR="005358C2" w:rsidRDefault="005358C2" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">En relación al informe de ventas del año ${year}, indicar que ya lo tenemos preparado y se lo enviaremos a continuación. Es importante tener en cuenta la operativa de ventas en librerías a través de </w:t></w:r>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t>distribuidoras</w:t></w:r>` +
    `<w:r><w:t>, por lo que pasamos a detallarla:</w:t></w:r></w:p>`;

  // Point 1
  body += `<w:p w:rsidR="005358C2" w:rsidRDefault="005358C2" w:rsidP="00D41657">` +
    `<w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>1. Las distribuidoras cuentan con un depósito de ejemplares que desde la editorial les hacemos llegar.</w:t></w:r></w:p>`;

  // Point 2
  body += `<w:p w:rsidR="005358C2" w:rsidRDefault="005358C2" w:rsidP="00D41657">` +
    `<w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>2. Las distribuidoras mandan ejemplares en depósito a librerías y a grandes superficies; el depósito dura de 3 a 6 meses, por lo que hasta transcurridos estos plazos, las distribuidoras desconocen las ventas de los libros.</w:t></w:r></w:p>`;

  // Empty paragraph
  body += `<w:p w:rsidR="005358C2" w:rsidRDefault="005358C2" w:rsidP="00D41657"><w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr></w:p>`;

  // "Ejemplos:"
  body += `<w:p w:rsidR="005358C2" w:rsidRDefault="00BE7066" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t>Ejemplos</w:t></w:r>` +
    `<w:r><w:t>:</w:t></w:r></w:p>`;

  // Example 1
  body += `<w:p w:rsidR="005358C2" w:rsidRDefault="005358C2" w:rsidP="00D41657">` +
    `<w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>1. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósitos con fecha posterior al 30 de septiembre (en el caso de haberlos dejado en depósito durante 3 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 9 meses del año.</w:t></w:r></w:p>`;

  // Example 2
  body += `<w:p w:rsidR="005358C2" w:rsidRDefault="005358C2" w:rsidP="00D41657">` +
    `<w:pPr><w:ind w:firstLine="708"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>2. Las distribuidoras no tienen datos de las ventas de todos los libros dejados en depósito con fecha posterior al 30 de junio (en el caso de haberlos dejado en depósito durante 6 meses). En este caso, la editorial solo tiene datos de facturación de los primeros 6 meses del año.</w:t></w:r></w:p>`;

  // Empty paragraph before table
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="00D41657"><w:pPr><w:jc w:val="both"/></w:pPr></w:p>`;

  // Blue table/box
  body += table;

  // Empty paragraph after table
  body += `<w:p w:rsidR="006A0EC7" w:rsidRDefault="006A0EC7" w:rsidP="00D41657"><w:pPr><w:jc w:val="both"/></w:pPr></w:p>`;

  // Page 2: PayPal info with "IMPORTANTE" bold inline
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:lastRenderedPageBreak/><w:t xml:space="preserve">Para que la editorial pueda realizar el pago, lo más conveniente, para agilizar el proceso de cobro, es que como autor/a realice una factura por PayPal a icidre@apuleyoediciones.com </w:t></w:r>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t>IMPORTANTE QUE SEA FACTURA Y NO UNA PETICIÓN DE PAGO</w:t></w:r>` +
    `<w:r><w:t>.</w:t></w:r></w:p>`;

  // "Recomendamos..."
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>Recomendamos la primera opción, para evitar trámites.</w:t></w:r></w:p>`;

  // Empty paragraph
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="00D41657"><w:pPr><w:jc w:val="both"/></w:pPr></w:p>`;

  // Video link intro
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>Os facilitamos un vídeo para usarlo como guía en caso de tener ciertas dificultades con la factura:</w:t></w:r></w:p>`;

  // Hyperlink
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00195664" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:hyperlink r:id="rId8" w:history="1">` +
    `<w:r><w:rPr><w:rStyle w:val="Hipervnculo"/></w:rPr><w:t>https://youtu.be/eVC-zxlDuLE?si=Hx10Vj7v34z1160r</w:t></w:r>` +
    `</w:hyperlink></w:p>`;

  // Empty paragraph
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="00D41657"><w:pPr><w:jc w:val="both"/></w:pPr></w:p>`;

  // "Sellado:"
  body += `<w:p w:rsidR="00D41657" w:rsidRDefault="00D41657" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t>Sellado:</w:t></w:r></w:p>`;

  // Stamp image (inline)
  body += `<w:p w:rsidR="00BE7066" w:rsidRDefault="00BE7066" w:rsidP="00D41657">` +
    `<w:pPr><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:rPr><w:noProof/><w:lang w:eastAsia="es-ES"/></w:rPr>` +
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="1618674" cy="879764"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="2" name="0 Imagen"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="Apuleyo CIF.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId9" cstate="print"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1617706" cy="879238"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

  // Empty paragraph
  body += `<w:p w:rsidR="00457048" w:rsidRDefault="00457048" w:rsidP="00BE7066"/>`;

  // Section properties
  body += `<w:sectPr w:rsidR="00457048"><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

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
