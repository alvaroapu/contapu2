import * as XLSX from 'xlsx';
import type { Liquidation, LiquidationItem } from '@/hooks/useLiquidations';

export function exportLiquidationExcel(items: LiquidationItem[], liquidation: Liquidation) {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [
    [`Liquidación de Derechos de Autor — Año ${liquidation.year}`],
    [`Fecha: ${new Date().toLocaleDateString('es-ES')}`, '', `Dist: ${liquidation.distributor_royalty_pct}%`, `Online: ${liquidation.online_royalty_pct}%`, `Colegios: ${liquidation.school_royalty_pct}%`],
    [],
    ['Autor', 'Título', 'Fecha pub.', 'V. Dist. Uds', 'V. Dist. €', 'V. Online Uds', 'V. Online €', 'V. Colegios Uds', 'V. Colegios €', 'Total €'],
  ];

  // Group by author
  const byAuthor = new Map<string, LiquidationItem[]>();
  for (const item of items) {
    const list = byAuthor.get(item.author) ?? [];
    list.push(item);
    byAuthor.set(item.author, list);
  }

  let grandTotal = { dU: 0, dA: 0, oU: 0, oA: 0, sU: 0, sA: 0, t: 0 };

  for (const [author, authorItems] of [...byAuthor.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const i of authorItems) {
      rows.push([
        author, i.book_title, i.publication_date ?? '',
        i.distributor_units, i.distributor_amount,
        i.online_units, i.online_amount,
        i.school_units, i.school_amount,
        i.total_amount,
      ]);
      grandTotal.dU += i.distributor_units; grandTotal.dA += i.distributor_amount;
      grandTotal.oU += i.online_units; grandTotal.oA += i.online_amount;
      grandTotal.sU += i.school_units; grandTotal.sA += i.school_amount;
      grandTotal.t += i.total_amount;
    }
  }

  rows.push(['TOTAL GENERAL', '', '', grandTotal.dU, grandTotal.dA, grandTotal.oU, grandTotal.oA, grandTotal.sU, grandTotal.sA, grandTotal.t]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Liquidación');
  XLSX.writeFile(wb, `Liquidacion_${liquidation.year}.xlsx`);
}
