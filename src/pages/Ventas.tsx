import { useState, useMemo, Fragment } from 'react';
import { useSalesPage, useSaveMovement, SalesRow } from '@/hooks/useSalesData';
import { useDebounce } from '@/hooks/useDebounce';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EditableCell } from '@/components/ventas/EditableCell';
import { MovementFormDialog } from '@/components/ventas/MovementFormDialog';
import { ExportDialog } from '@/components/ventas/ExportDialog';
import { ManualMovementsDialog } from '@/components/ventas/ManualMovementsDialog';
import { MONTHS, getYears } from '@/lib/constants';
import { Plus, Download, List } from 'lucide-react';

const PAGE_SIZE = 25;

interface BookGroup {
  bookId: string;
  title: string;
  rows: SalesRow[];
  totals: { envios: number; ventas: number; devoluciones: number; inventario: number };
}

export default function Ventas() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(0);
  const [showMovForm, setShowMovForm] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const { data, isLoading } = useSalesPage(year, month, debouncedSearch, page);
  const saveMovement = useSaveMovement();

  const grouped: BookGroup[] = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = new Map<string, SalesRow[]>();
    for (const r of data) {
      if (!map.has(r.book_id)) map.set(r.book_id, []);
      map.get(r.book_id)!.push(r);
    }
    return Array.from(map.entries()).map(([bookId, rows]) => ({
      bookId,
      title: rows[0].book_title,
      rows,
      totals: {
        envios: rows.reduce((s, r) => s + Number(r.envios), 0),
        ventas: rows.reduce((s, r) => s + Number(r.ventas), 0),
        devoluciones: rows.reduce((s, r) => s + Number(r.devoluciones), 0),
        inventario: rows.reduce((s, r) => s + Number(r.inventario), 0),
      },
    }));
  }, [data]);

  const totalBooks = data && data.length > 0 ? Number(data[0].total_books) : 0;
  const totalPages = Math.ceil(totalBooks / PAGE_SIZE);
  const canEdit = month !== null;

  const handleCellSave = (bookId: string, distributorId: string, type: 'envio' | 'venta' | 'devolucion', newTotal: number) => {
    if (month === null) return;
    saveMovement.mutate({ bookId, distributorId, year, month, type, newTotal });
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Contabilidad de Ventas</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowExport(true)}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
          <Button onClick={() => setShowMovForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Registrar movimiento
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Select value={String(year)} onValueChange={v => { setYear(Number(v)); setPage(0); }}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getYears().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={month === null ? 'anual' : String(month)} onValueChange={v => { setMonth(v === 'anual' ? null : Number(v)); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="anual">Anual</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por título…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="sm:max-w-xs"
        />
      </div>

      {!canEdit && (
        <p className="mb-2 text-xs text-muted-foreground">Selecciona un mes específico para editar celdas.</p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Título</TableHead>
              <TableHead className="w-[140px]">Distribuidora</TableHead>
              <TableHead className="text-center">Envíos</TableHead>
              <TableHead className="text-center">Ventas</TableHead>
              <TableHead className="text-center">Devoluciones</TableHead>
              <TableHead className="text-center">Inventario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : grouped.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  No hay movimientos para este período
                </TableCell>
              </TableRow>
            ) : (
              grouped.map(group => (
                <Fragment key={group.bookId}>
                  {group.rows.map((row, i) => (
                    <TableRow key={row.distributor_id} className="hover:bg-muted/30">
                      <TableCell className={i === 0 ? 'font-medium max-w-[250px] truncate' : 'text-transparent select-none'}>
                        {i === 0 ? group.title : '.'}
                      </TableCell>
                      <TableCell className="text-sm">{row.distributor_name}</TableCell>
                      <TableCell className="text-center">
                        <EditableCell value={Number(row.envios)} editable={canEdit}
                          onSave={v => handleCellSave(row.book_id, row.distributor_id, 'envio', v)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <EditableCell value={Number(row.ventas)} editable={canEdit}
                          onSave={v => handleCellSave(row.book_id, row.distributor_id, 'venta', v)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <EditableCell value={Number(row.devoluciones)} editable={canEdit}
                          onSave={v => handleCellSave(row.book_id, row.distributor_id, 'devolucion', v)} />
                      </TableCell>
                      <TableCell className={`text-center font-medium ${Number(row.inventario) < 0 ? 'text-destructive' : ''}`}>
                        {Number(row.inventario)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 border-b-2">
                    <TableCell></TableCell>
                    <TableCell className="text-sm font-bold">TOTAL</TableCell>
                    <TableCell className="text-center font-bold">{group.totals.envios}</TableCell>
                    <TableCell className="text-center font-bold">{group.totals.ventas}</TableCell>
                    <TableCell className="text-center font-bold">{group.totals.devoluciones}</TableCell>
                    <TableCell className={`text-center font-bold ${group.totals.inventario < 0 ? 'text-destructive' : ''}`}>
                      {group.totals.inventario}
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{totalBooks} libros · Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}

      <MovementFormDialog open={showMovForm} onOpenChange={setShowMovForm} year={year} />
      <ExportDialog open={showExport} onOpenChange={setShowExport} year={year} />
    </div>
  );
}
