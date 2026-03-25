import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { fetchAllSalesForYear } from '@/hooks/useSalesData';
import { MONTHS, DISTRIBUTOR_ORDER, DIST_NAMES } from '@/lib/constants';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
}

export function ExportDialog({ open, onOpenChange, year }: Props) {
  const [includeIdlibros, setIncludeIdlibros] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleExport() {
    setExporting(true);
    setProgress(10);
    try {
      const allData = await fetchAllSalesForYear(year);
      setProgress(40);

      type CellData = { e: number; v: number; d: number };
      const books = new Map<string, { title: string; dists: Map<string, Map<number, CellData>> }>();

      for (const row of allData) {
        const bookId = row.book_id;
        const distCode = row.distributors?.code ?? '';
        const bookTitle = row.books?.title ?? '';
        if (!books.has(bookId)) books.set(bookId, { title: bookTitle, dists: new Map() });
        const book = books.get(bookId)!;
        if (!book.dists.has(distCode)) book.dists.set(distCode, new Map());
        const dm = book.dists.get(distCode)!;
        if (!dm.has(row.month)) dm.set(row.month, { e: 0, v: 0, d: 0 });
        const cell = dm.get(row.month)!;
        if (row.type === 'envio') cell.e += row.quantity;
        else if (row.type === 'venta') cell.v += row.quantity;
        else if (row.type === 'devolucion') cell.d += row.quantity;
      }

      setProgress(60);

      const headers1 = ['Título', 'Distribuidora'];
      const headers2 = ['', ''];
      const sections = ['Anual', ...MONTHS];
      for (const s of sections) {
        headers1.push(s, '', '', '');
        headers2.push('Envíos', 'Ventas', 'Dev.', 'Inventario');
      }

      const aoa: any[][] = [headers1, headers2];
      const distOrder = [...DISTRIBUTOR_ORDER];
      if (includeIdlibros) distOrder.splice(1, 0, 'idlibros');

      const sortedBooks = Array.from(books.entries()).sort((a, b) => a[1].title.localeCompare(b[1].title));

      for (const [, book] of sortedBooks) {
        for (let di = 0; di < distOrder.length; di++) {
          const dc = distOrder[di];
          const row: any[] = [di === 0 ? book.title : '', DIST_NAMES[dc] ?? dc];

          let annE = 0, annV = 0, annD = 0;
          for (let m = 1; m <= 12; m++) {
            const c = book.dists.get(dc)?.get(m) ?? { e: 0, v: 0, d: 0 };
            annE += c.e; annV += c.v; annD += c.d;
          }
          row.push(annE, annV, annD, annE - annV + annD);

          for (let m = 1; m <= 12; m++) {
            const c = book.dists.get(dc)?.get(m) ?? { e: 0, v: 0, d: 0 };
            row.push(c.e, c.v, c.d, c.e - c.v + c.d);
          }
          aoa.push(row);
        }
      }

      setProgress(80);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = [];
      let col = 2;
      for (let s = 0; s < 13; s++) {
        ws['!merges']!.push({ s: { r: 0, c: col }, e: { r: 0, c: col + 3 } });
        col += 4;
      }
      ws['!cols'] = [{ wch: 40 }, { wch: 18 }, ...Array(52).fill({ wch: 10 })];

      XLSX.utils.book_append_sheet(wb, ws, `Ventas ${year}`);
      XLSX.writeFile(wb, `Ventas_Apuleyo_${year}.xlsx`);
      toast.success('Excel exportado correctamente');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al exportar');
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Exportar a Excel</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Se exportarán todos los datos de ventas del año {year} con desglose mensual.</p>
          <div className="flex items-center gap-2">
            <Checkbox id="idlibros" checked={includeIdlibros} onCheckedChange={v => setIncludeIdlibros(!!v)} />
            <Label htmlFor="idlibros" className="text-sm">Incluir IDlibros (inactiva)</Label>
          </div>
          {exporting && <Progress value={progress} className="h-2" />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>Cancelar</Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exportando…' : 'Exportar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
