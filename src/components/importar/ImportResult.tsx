import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MatchedEntry, UnmatchedEntry } from '@/lib/importProcessors';
import { toast } from 'sonner';
import { ChevronDown, Search, ArrowLeft } from 'lucide-react';

export interface ImportResultData {
  batch: any;
  matched: MatchedEntry[];
  unmatched: UnmatchedEntry[];
  distributorCode: string;
}

interface Props {
  data: ImportResultData;
  onBack: () => void;
}

export function ImportResultView({ data, onBack }: Props) {
  const [unmatchedEntries, setUnmatchedEntries] = useState<UnmatchedEntry[]>(data.unmatched);
  const [assigningIdx, setAssigningIdx] = useState<number | null>(null);
  const [bookSearch, setBookSearch] = useState('');
  const [matchedOpen, setMatchedOpen] = useState(false);
  const qc = useQueryClient();

  const debouncedSearch = useDebounce(bookSearch, 300);
  const { data: searchResults = [] } = useQuery({
    queryKey: ['assignBookSearch', debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.length < 2) return [];
      const { data } = await supabase.from('books').select('id, title, isbn').or(`title.ilike.%${debouncedSearch}%,isbn.ilike.%${debouncedSearch}%`).limit(8) as any;
      return data ?? [];
    },
    enabled: debouncedSearch.length >= 2,
  });

  const assignedCount = unmatchedEntries.filter(e => e.status === 'assigned').length;
  const pendingCount = unmatchedEntries.filter(e => e.status === 'pending').length;
  const totalMovements = data.matched.reduce((s, m) => s + m.movements.length, 0);

  async function assignBook(idx: number, bookId: string, bookTitle: string) {
    const entry = unmatchedEntries[idx];
    const distId = data.batch.distributor_id;
    const movements: any[] = [];
    if (entry.entradas > 0) movements.push({ book_id: bookId, distributor_id: distId, year: data.batch.year, month: data.batch.month, type: 'envio', quantity: entry.entradas, import_batch_id: data.batch.id });
    if (entry.ventas > 0) movements.push({ book_id: bookId, distributor_id: distId, year: data.batch.year, month: data.batch.month, type: 'venta', quantity: entry.ventas, import_batch_id: data.batch.id });
    if (entry.devoluciones > 0) movements.push({ book_id: bookId, distributor_id: distId, year: data.batch.year, month: data.batch.month, type: 'devolucion', quantity: entry.devoluciones, import_batch_id: data.batch.id });

    if (movements.length > 0) {
      const { error } = await supabase.from('sales_movements').insert(movements) as any;
      if (error) { toast.error(error.message); return; }
    }

    if (data.distributorCode === 'azeta') {
      const upd: any = {};
      if (entry.isbn) upd.isbn = entry.isbn;
      if (entry.ean) upd.ean = entry.ean;
      if (Object.keys(upd).length > 0) await supabase.from('books').update(upd).eq('id', bookId);
    } else if (data.distributorCode === 'maidhisa' && entry.reference) {
      await supabase.from('books').update({ maidhisa_ref: entry.reference } as any).eq('id', bookId);
    }

    const updated = [...unmatchedEntries];
    updated[idx] = { ...updated[idx], status: 'assigned', assignedBookId: bookId };
    setUnmatchedEntries(updated);

    await supabase.from('import_batches').update({
      records_imported: data.matched.length + updated.filter(e => e.status === 'assigned').length,
      records_skipped: updated.filter(e => e.status === 'pending').length,
      error_log: { unmatched: updated },
    } as any).eq('id', data.batch.id);

    toast.success(`Asignado a "${bookTitle}"`);
    setAssigningIdx(null);
    setBookSearch('');
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['importBatches'] });
  }

  function normalizeTitle(raw: string): string {
    if (!raw) return raw;
    // If entirely uppercase, convert to sentence case
    if (raw === raw.toUpperCase()) {
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
    return raw;
  }

  async function createAndAssign(idx: number) {
    const entry = unmatchedEntries[idx];
    const title = normalizeTitle(entry.title);
    const bookData: any = { title, author: 'Sin especificar', pvp: 0, status: 'active' };
    if (entry.isbn) bookData.isbn = entry.isbn;
    if (entry.ean) bookData.ean = entry.ean;
    if (entry.reference) bookData.maidhisa_ref = entry.reference;

    const { data: newBook, error } = await supabase.from('books').insert(bookData).select('id').single() as any;
    if (error) { toast.error('Error al crear: ' + error.message); return; }
    await assignBook(idx, newBook.id, title);
    toast.success('Libro creado y asignado');
  }

  function ignoreEntry(idx: number) {
    const updated = [...unmatchedEntries];
    updated[idx] = { ...updated[idx], status: 'ignored' };
    setUnmatchedEntries(updated);
    supabase.from('import_batches').update({
      records_skipped: updated.filter(e => e.status !== 'assigned').length,
      error_log: { unmatched: updated },
    } as any).eq('id', data.batch.id);
  }

  const [bulkProcessing, setBulkProcessing] = useState(false);

  async function createAllPending() {
    setBulkProcessing(true);
    let created = 0;
    try {
      for (let idx = 0; idx < unmatchedEntries.length; idx++) {
        if (unmatchedEntries[idx].status !== 'pending') continue;
        await createAndAssign(idx);
        created++;
      }
      toast.success(`${created} libros creados y asignados`);
    } catch (err: any) {
      toast.error(err.message ?? 'Error en creación masiva');
    } finally {
      setBulkProcessing(false);
    }
  }

  function ignoreAllPending() {
    const updated = unmatchedEntries.map(e => e.status === 'pending' ? { ...e, status: 'ignored' as const } : e);
    setUnmatchedEntries(updated);
    supabase.from('import_batches').update({
      records_skipped: updated.filter(e => e.status !== 'assigned').length,
      error_log: { unmatched: updated },
    } as any).eq('id', data.batch.id);
    toast.success('Todos los pendientes ignorados');
  }
  async function revertBatch() {
    await supabase.from('sales_movements').delete().eq('import_batch_id', data.batch.id);
    await supabase.from('import_batches').update({ status: 'reverted' } as any).eq('id', data.batch.id);
    toast.success('Importación revertida');
    qc.invalidateQueries({ queryKey: ['importBatches'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    onBack();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold">Resultado de importación</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Procesados', value: data.matched.length + unmatchedEntries.length },
          { label: 'Importados', value: data.matched.length + assignedCount },
          { label: 'No encontrados', value: pendingCount },
          { label: 'Movimientos creados', value: totalMovements },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-sm text-muted-foreground">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Matched (collapsible) */}
      {data.matched.length > 0 && (
        <Collapsible open={matchedOpen} onOpenChange={setMatchedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              Libros importados ({data.matched.length})
              <ChevronDown className={`h-4 w-4 transition-transform ${matchedOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-h-60 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>ISBN/Ref</TableHead>
                    <TableHead>Movimientos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.matched.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{m.bookTitle}</TableCell>
                      <TableCell className="text-xs">{m.isbn ?? m.reference ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {m.movements.map(mv => `${mv.type}: ${mv.quantity}`).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Unmatched */}
      {unmatchedEntries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Libros no encontrados ({pendingCount} pendientes)</h2>
            {pendingCount > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={createAllPending} disabled={bulkProcessing}>
                  {bulkProcessing ? 'Creando…' : `Crear todos (${pendingCount})`}
                </Button>
                <Button size="sm" variant="ghost" onClick={ignoreAllPending} disabled={bulkProcessing}>
                  Ignorar todos
                </Button>
              </div>
            )}
          </div>
          <div className="rounded border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ISBN/Ref</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="text-center">Ventas</TableHead>
                  <TableHead className="text-center">Dev.</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedEntries.map((entry, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs">{entry.isbn ?? entry.reference ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{entry.title}</TableCell>
                    <TableCell className="text-center">{entry.ventas}</TableCell>
                    <TableCell className="text-center">{entry.devoluciones}</TableCell>
                    <TableCell>
                      <Badge variant={entry.status === 'assigned' ? 'default' : entry.status === 'ignored' ? 'secondary' : 'outline'}>
                        {entry.status === 'assigned' ? 'Asignado' : entry.status === 'ignored' ? 'Ignorado' : 'Pendiente'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {entry.status === 'pending' && (
                        <div className="space-y-1">
                          {assigningIdx === idx ? (
                            <div className="space-y-1">
                              <div className="relative">
                                <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                                <Input
                                  className="h-7 pl-7 text-xs"
                                  placeholder="Buscar libro…"
                                  value={bookSearch}
                                  onChange={e => setBookSearch(e.target.value)}
                                  autoFocus
                                />
                              </div>
                              {searchResults.length > 0 && (
                                <ul className="max-h-32 overflow-auto rounded border bg-popover p-1">
                                  {searchResults.map((b: any) => (
                                    <li key={b.id} className="cursor-pointer rounded px-2 py-1 text-xs hover:bg-muted"
                                      onClick={() => assignBook(idx, b.id, b.title)}>
                                      {b.title}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => createAndAssign(idx)}>
                                  Crear nuevo
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setAssigningIdx(null); setBookSearch(''); }}>
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAssigningIdx(idx); setBookSearch(''); }}>
                                Asignar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => createAndAssign(idx)}>
                                Crear
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => ignoreEntry(idx)}>
                                Ignorar
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Revertir importación</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Revertir importación?</AlertDialogTitle>
              <AlertDialogDescription>Se eliminarán todos los movimientos creados por esta importación. Esta acción no se puede deshacer.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={revertBatch}>Revertir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="outline" onClick={onBack}>Volver al historial</Button>
      </div>
    </div>
  );
}
