import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDistributors } from '@/hooks/useDistributors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ImportResultView, ImportResultData } from '@/components/importar/ImportResult';
import { parseAzetaFile, parseMaidhisaFile, matchAzeta, matchMaidhisa } from '@/lib/importProcessors';
import { MONTHS, getYears } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';
import { Upload, Eye, Undo2 } from 'lucide-react';

export default function Importar() {
  const [view, setView] = useState<'main' | 'result'>('main');
  const [result, setResult] = useState<ImportResultData | null>(null);

  const { data: distributors = [] } = useDistributors();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();

  // Form state
  const [distCode, setDistCode] = useState('azeta');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Overwrite dialog
  const [existingBatch, setExistingBatch] = useState<any>(null);
  const [showOverwrite, setShowOverwrite] = useState(false);

  // History
  const { data: batches = [] } = useQuery({
    queryKey: ['importBatches'],
    queryFn: async () => {
      const { data, error } = await supabase.from('import_batches')
        .select('*, distributors(name, code)')
        .order('imported_at', { ascending: false })
        .limit(50) as any;
      if (error) throw error;
      return data ?? [];
    },
  });

  const importableDists = distributors.filter(d => d.code === 'azeta' || d.code === 'maidhisa');

  async function handleProcess() {
    if (!file) { toast.error('Selecciona un archivo'); return; }
    const dist = distributors.find(d => d.code === distCode);
    if (!dist) return;

    // Check existing
    const { data: existing } = await supabase.from('import_batches')
      .select('id, records_imported')
      .eq('distributor_id', dist.id)
      .eq('year', year).eq('month', month)
      .eq('status', 'processed')
      .maybeSingle() as any;

    if (existing) {
      setExistingBatch(existing);
      setShowOverwrite(true);
      return;
    }
    processFile();
  }

  async function processFile(revertId?: string) {
    setProcessing(true);
    setProgress(5);
    try {
      const dist = distributors.find(d => d.code === distCode)!;

      if (revertId) {
        await supabase.from('sales_movements').delete().eq('import_batch_id', revertId);
        await supabase.from('import_batches').update({ status: 'reverted' } as any).eq('id', revertId);
        setProgress(15);
      }

      const buf = await file!.arrayBuffer();
      const wb = XLSX.read(buf);
      setProgress(20);

      const rows = distCode === 'azeta' ? parseAzetaFile(wb) : parseMaidhisaFile(wb);
      if (rows.length === 0) { toast.error('No se encontraron registros válidos'); setProcessing(false); return; }
      setProgress(30);

      const matchResult = distCode === 'azeta' ? await matchAzeta(rows) : await matchMaidhisa(rows);
      setProgress(50);

      const { data: user } = await supabase.auth.getUser();
      const { data: batch, error: batchErr } = await supabase.from('import_batches').insert({
        distributor_id: dist.id,
        file_name: file!.name,
        year, month,
        status: 'processed',
        records_imported: matchResult.matched.length,
        records_skipped: matchResult.unmatched.length,
        error_log: { unmatched: matchResult.unmatched },
        imported_by: user?.user?.id,
      } as any).select().single() as any;
      if (batchErr) throw batchErr;
      setProgress(60);

      // Insert movements in chunks
      const movements: any[] = [];
      for (const entry of matchResult.matched) {
        for (const mv of entry.movements) {
          movements.push({
            book_id: entry.bookId, distributor_id: dist.id,
            year, month, type: mv.type, quantity: mv.quantity,
            import_batch_id: batch.id,
          });
        }
      }
      for (let i = 0; i < movements.length; i += 50) {
        const { error } = await supabase.from('sales_movements').insert(movements.slice(i, i + 50)) as any;
        if (error) throw error;
        setProgress(60 + Math.round(((i + 50) / movements.length) * 35));
      }

      setProgress(100);
      setResult({ batch, matched: matchResult.matched, unmatched: matchResult.unmatched, distributorCode: distCode });
      setView('result');
      qc.invalidateQueries({ queryKey: ['importBatches'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      toast.success(`Importación completada: ${matchResult.matched.length} libros, ${matchResult.unmatched.length} no encontrados`);
    } catch (err: any) {
      toast.error(err.message ?? 'Error en la importación');
    } finally {
      setProcessing(false);
      setProgress(0);
      setFile(null);
    }
  }

  async function viewDetail(batchId: string) {
    const { data: batch } = await supabase.from('import_batches').select('*, distributors(name, code)').eq('id', batchId).single() as any;
    if (!batch) return;
    const { data: movements } = await supabase.from('sales_movements')
      .select('*, books(title)').eq('import_batch_id', batchId) as any;

    const matchedMap = new Map<string, any>();
    for (const mv of (movements ?? [])) {
      if (!matchedMap.has(mv.book_id)) matchedMap.set(mv.book_id, { bookId: mv.book_id, bookTitle: mv.books?.title ?? '', movements: [] });
      matchedMap.get(mv.book_id)!.movements.push({ type: mv.type, quantity: mv.quantity });
    }

    setResult({
      batch,
      matched: Array.from(matchedMap.values()),
      unmatched: (batch.error_log as any)?.unmatched ?? [],
      distributorCode: batch.distributors?.code ?? '',
    });
    setView('result');
  }

  async function revertFromHistory(batchId: string) {
    await supabase.from('sales_movements').delete().eq('import_batch_id', batchId);
    await supabase.from('import_batches').update({ status: 'reverted' } as any).eq('id', batchId);
    qc.invalidateQueries({ queryKey: ['importBatches'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    toast.success('Importación revertida');
  }

  if (view === 'result' && result) {
    return <ImportResultView data={result} onBack={() => { setView('main'); setResult(null); }} />;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Importar Reportes</h1>

      <Card>
        <CardHeader><CardTitle>Nueva importación</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Distribuidora</Label>
              <Select value={distCode} onValueChange={setDistCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {importableDists.map(d => <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Año</Label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getYears().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mes</Label>
              <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Archivo (.xlsx, .xls)</Label>
            <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </div>
          {processing && <Progress value={progress} className="h-2" />}
          <Button onClick={handleProcess} disabled={!file || processing}>
            <Upload className="mr-2 h-4 w-4" />
            {processing ? `Procesando… ${progress}%` : 'Procesar'}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Historial de importaciones</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Distribuidora</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-center">Importados</TableHead>
                <TableHead className="text-center">No encontrados</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin importaciones</TableCell>
                </TableRow>
              ) : batches.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="text-sm">{formatDate(b.imported_at)}</TableCell>
                  <TableCell>{b.distributors?.name ?? '—'}</TableCell>
                  <TableCell>{MONTHS[b.month - 1]} {b.year}</TableCell>
                  <TableCell className="text-center">{b.records_imported}</TableCell>
                  <TableCell className="text-center">{b.records_skipped}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === 'processed' ? 'default' : b.status === 'reverted' ? 'secondary' : 'outline'}>
                      {b.status === 'processed' ? 'Procesado' : b.status === 'reverted' ? 'Revertido' : b.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => viewDetail(b.id)}>
                        <Eye className="h-3 w-3 mr-1" /> Ver
                      </Button>
                      {b.status === 'processed' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 text-destructive">
                              <Undo2 className="h-3 w-3 mr-1" /> Revertir
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Revertir importación?</AlertDialogTitle>
                              <AlertDialogDescription>Se eliminarán {b.records_imported} movimientos.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => revertFromHistory(b.id)}>Revertir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Overwrite dialog */}
      <AlertDialog open={showOverwrite} onOpenChange={setShowOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importación existente</AlertDialogTitle>
            <AlertDialogDescription>
              Ya existe una importación procesada para {distCode === 'azeta' ? 'Azeta' : 'Maidhisa'} — {MONTHS[month - 1]} {year} con {existingBatch?.records_imported} registros.
              ¿Desea revertirla e importar de nuevo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowOverwrite(false); processFile(existingBatch?.id); }}>
              Revertir y reimportar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
