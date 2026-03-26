import JSZip from 'jszip';
import { formatCurrency } from '@/lib/format';
import type { Liquidation, LiquidationItem } from '@/hooks/useLiquidations';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatEur(val: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' €';
}

function buildBookBlock(item: LiquidationItem, liq: Liquidation): string {
  const lines: string[] = [];

  // Title
  lines.push(`<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">- Título: ${escapeXml(item.book_title)}</w:t></w:r></w:p>`);

  // Empty line
  lines.push(`<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr></w:p>`);

  // Distributor sales
  lines.push(`<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108" w:firstLine="708"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:cstheme="minorHAnsi"/></w:rPr><w:t xml:space="preserve">- Venta en librerías (beneficio del ${liq.distributor_royalty_pct}% por ejemplar):  ${item.distributor_units} ejemplares: ${escapeXml(formatEur(item.distributor_amount))}</w:t></w:r></w:p>`);

  // Online sales
  lines.push(`<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108" w:firstLine="708"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:cstheme="minorHAnsi"/></w:rPr><w:t xml:space="preserve">- Venta web (beneficio del ${liq.online_royalty_pct}% por ejemplar):  ${item.online_units} ejemplares: ${escapeXml(formatEur(item.online_amount))}</w:t></w:r></w:p>`);

  // School sales
  lines.push(`<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108" w:firstLine="708"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:cstheme="minorHAnsi"/></w:rPr><w:t xml:space="preserve">- Venta en instituciones (beneficio del ${liq.school_royalty_pct}% por ejemplar): ${item.school_units} ejemplares: ${escapeXml(formatEur(item.school_amount))}</w:t></w:r></w:p>`);

  return lines.join('');
}

function buildTableCellContent(author: string, authorItems: LiquidationItem[], liq: Liquidation): string {
  const parts: string[] = [];

  // Header: "Informe de ventas YEAR:"
  parts.push(`<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:u w:val="single"/></w:rPr><w:t>Informe de ventas ${liq.year}:</w:t></w:r></w:p>`);

  // Author name
  parts.push(`<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">- Nombre autor/a: ${escapeXml(author)}</w:t></w:r></w:p>`);

  // Empty line
  parts.push(`<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr></w:p>`);

  // Each book block
  for (const item of authorItems) {
    parts.push(buildBookBlock(item, liq));
    // Separator between books
    parts.push(`<w:p><w:pPr><w:ind w:left="108"/><w:jc w:val="both"/></w:pPr></w:p>`);
  }

  // Total
  const total = authorItems.reduce((s, i) => s + i.total_amount, 0);
  parts.push(`<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:ind w:left="108"/><w:jc w:val="both"/><w:rPr><w:b/><w:u w:val="single"/></w:rPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">TOTAL: </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>${escapeXml(formatEur(total))}</w:t></w:r></w:p>`);

  return parts.join('');
}

export async function generateAuthorDOCX(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation,
): Promise<Blob> {
  const resp = await fetch('/templates/liquidacion_template.docx');
  const templateBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(templateBuffer);

  let xml = await zip.file('word/document.xml')!.async('string');

  // 1. Replace "Dirigido a [original author name]" paragraph
  xml = xml.replace(
    /(<w:t xml:space="preserve">Dirigido a <\/w:t>)(.*?)(<w:r w:rsidR="00A72A19"><w:t>\.<\/w:t><\/w:r>)/s,
    `<w:t xml:space="preserve">Dirigido a ${escapeXml(author)}.</w:t></w:r>`
  );
  
  // 2. Replace year references in body text
  xml = xml.replace(/informe de ventas del año 2024/g, `informe de ventas del año ${liquidation.year}`);

  // 3. Replace the entire table cell content
  const authorItems = items.filter(i => i.author === author);
  const newCellContent = buildTableCellContent(author, authorItems, liquidation);

  const tcPrEnd = '</w:tcPr>';
  const tcEnd = '</w:tc>';
  const tcPrEndIdx = xml.indexOf(tcPrEnd);
  const tcEndIdx = xml.indexOf(tcEnd);
  
  if (tcPrEndIdx !== -1 && tcEndIdx !== -1) {
    const afterTcPr = tcPrEndIdx + tcPrEnd.length;
    xml = xml.substring(0, afterTcPr) + newCellContent + xml.substring(tcEndIdx);
  }

  zip.file('word/document.xml', xml);
  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
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
