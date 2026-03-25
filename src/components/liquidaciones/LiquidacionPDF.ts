import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Liquidation, LiquidationItem } from '@/hooks/useLiquidations';

export function generateAuthorPDF(
  author: string,
  items: LiquidationItem[],
  liquidation: Liquidation
) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('APULEYO EDICIONES S.L.', w / 2, 20, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Av. Villablanca 1, 21450 Cartaya, Huelva', w / 2, 26, { align: 'center' });
  doc.text('Tel: +34 959 39 17 00 — info@apuleyodisenos.com', w / 2, 31, { align: 'center' });

  doc.setDrawColor(200);
  doc.line(14, 35, w - 14, 35);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`LIQUIDACIÓN DE DERECHOS DE AUTOR — Año ${liquidation.year}`, 14, 44);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Autor: ${author}`, 14, 51);
  doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-ES')}`, 14, 57);

  const authorItems = items.filter(i => i.author === author);
  const tableData = authorItems.map(i => [
    i.book_title,
    formatDate(i.publication_date),
    i.distributor_units.toString(),
    formatCurrency(i.distributor_amount),
    i.online_units.toString(),
    formatCurrency(i.online_amount),
    i.school_units.toString(),
    formatCurrency(i.school_amount),
    formatCurrency(i.total_amount),
  ]);

  const totals = authorItems.reduce(
    (acc, i) => ({
      dU: acc.dU + i.distributor_units,
      dA: acc.dA + i.distributor_amount,
      oU: acc.oU + i.online_units,
      oA: acc.oA + i.online_amount,
      sU: acc.sU + i.school_units,
      sA: acc.sA + i.school_amount,
      t: acc.t + i.total_amount,
    }),
    { dU: 0, dA: 0, oU: 0, oA: 0, sU: 0, sA: 0, t: 0 }
  );

  tableData.push([
    'TOTAL', '',
    totals.dU.toString(), formatCurrency(totals.dA),
    totals.oU.toString(), formatCurrency(totals.oA),
    totals.sU.toString(), formatCurrency(totals.sA),
    formatCurrency(totals.t),
  ]);

  autoTable(doc, {
    startY: 63,
    head: [['Título', 'Fecha pub.', 'Dist. Uds', 'Dist. €', 'Online Uds', 'Online €', 'Col. Uds', 'Col. €', 'Total €']],
    body: tableData,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [27, 35, 48], textColor: 255 },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Porcentajes aplicados:`, 14, finalY);
  doc.text(`- Ventas distribuidoras: ${liquidation.distributor_royalty_pct}% sobre PVP`, 14, finalY + 5);
  doc.text(`- Ventas online: ${liquidation.online_royalty_pct}% sobre PVP`, 14, finalY + 10);
  doc.text(`- Ventas colegios y ayuntamientos: ${liquidation.school_royalty_pct}% sobre PVP`, 14, finalY + 15);
  doc.text('Este documento ha sido generado automáticamente por el sistema de gestión de Apuleyo Ediciones.', 14, finalY + 25);

  return doc;
}

export function downloadAuthorPDF(author: string, items: LiquidationItem[], liquidation: Liquidation) {
  const doc = generateAuthorPDF(author, items, liquidation);
  doc.save(`Liquidacion_${liquidation.year}_${author.replace(/\s+/g, '_')}.pdf`);
}
