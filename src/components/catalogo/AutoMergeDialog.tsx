import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeIsbn } from '@/lib/isbnUtils';
import { toast } from 'sonner';
import { Merge, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'isbn' | 'title';
}

interface DuplicateGroup {
  key: string;
  books: { id: string; title: string; isbn: string | null; author: string; ean: string | null; maidhisa_ref: string | null }[];
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o').replace(/[úùûü]/g, 'u')
    .replace(/ñ/g, 'n').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, '').trim();
}

export function AutoMergeDialog({ open, onOpenChange, defaultTab = 'isbn' }: Props) {
  const [tab, setTab] = useState<'isbn' | 'title'>(defaultTab);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanned, setScanned] = useState(false);
  const qc = useQueryClient();

  function handleOpenChange(v: boolean) {
    if (v) {
      setDuplicates([]);
      setScanned(false);
      setProgress(0);
      setTab(defaultTab);
    }
    onOpenChange(v);
  }

  function handleTabChange(t: string) {
    setTab(t as 'isbn' | 'title');
    setDuplicates([]);
    setScanned(false);
    setProgress(0);
  }

  async function fetchAllBooks(filterIsbn: boolean) {
    let all: any[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from('books').select('id, title, isbn, author, ean, maidhisa_ref');
      if (filterIsbn) query = query.not('isbn', 'is', null);
      const { data } = await query.range(from, from + 999);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    return all;
  }

  async function scanByIsbn() {
    setScanning(true);
    try {
      const all = await fetchAllBooks(true);
      const groups = new Map<string, any[]>();
      for (const book of all) {
        if (!book.isbn) continue;
        const norm = normalizeIsbn(book.isbn);
        if (!norm || norm.length < 10) continue;
        if (!groups.has(norm)) groups.set(norm, []);
        groups.get(norm)!.push(book);
      }
      const dupes: DuplicateGroup[] = [];
      for (const [key, books] of groups) {
        if (books.length > 1) dupes.push({ key, books });
      }
      setDuplicates(dupes);
      setScanned(true);
      if (dupes.length === 0) toast.info('No se encontraron duplicados por ISBN');
    } catch (err: any) {
      toast.error('Error al escanear: ' + err.message);
    } finally {
      setScanning(false);
    }
  }

  async function scanByTitle() {
    setScanning(true);
    try {
      const all = await fetchAllBooks(false);
      const groups = new Map<string, any[]>();
      for (const book of all) {
        const norm = normalizeTitle(book.title);
        if (!norm) continue;
        if (!groups.has(norm)) groups.set(norm, []);
        groups.get(norm)!.push(book);
      }
      const dupes: DuplicateGroup[] = [];
      for (const [key, books] of groups) {
        if (books.length > 1) dupes.push({ key, books });
      }
      setDuplicates(dupes);
      setScanned(true);
      if (dupes.length === 0) toast.info('No se encontraron duplicados por título');
    } catch (err: any) {
      toast.error('Error al escanear: ' + err.message);
    } finally {
      setScanning(false);
    }
  }

  async function mergeGroup(group: DuplicateGroup) {
    const target = group.books[0];
    const sources = group.books.slice(1);

    for (const source of sources) {
      await supabase.from('sales_movements')
        .update({ book_id: target.id } as any)
        .eq('book_id', source.id);

      await supabase.from('liquidation_items')
        .update({ book_id: target.id } as any)
        .eq('book_id', source.id);

      const updates: any = {};
      if (!target.isbn && source.isbn) { updates.isbn = source.isbn; target.isbn = source.isbn; }
      if (!target.ean && source.ean) { updates.ean = source.ean; target.ean = source.ean; }
      if (!target.maidhisa_ref && source.maidhisa_ref) { updates.maidhisa_ref = source.maidhisa_ref; target.maidhisa_ref = source.maidhisa_ref; }
      if (Object.keys(updates).length > 0) {
        await supabase.from('books').update(updates).eq('id', target.id);
      }

      await supabase.from('books').delete().eq('id', source.id);
    }
  }

  async function mergeAll() {
    setMerging(true);
    setProgress(0);
    let merged = 0;
    try {
      for (let i = 0; i < duplicates.length; i++) {
        await mergeGroup(duplicates[i]);
        merged++;
        setProgress(Math.round(((i + 1) / duplicates.length) * 100));
      }
      toast.success(`${merged} grupo(s) fusionados correctamente`);
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      handleOpenChange(false);
    } catch (err: any) {
      toast.error('Error al fusionar: ' + err.message);
    } finally {
      setMerging(false);
    }
  }

  const totalDuplicateBooks = duplicates.reduce((s, g) => s + g.books.length - 1, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" /> Fusión automática de duplicados
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="isbn">Por ISBN</TabsTrigger>
            <TabsTrigger value="title">Por Título</TabsTrigger>
          </TabsList>

          <TabsContent value="isbn" className="flex-1 overflow-auto space-y-4">
            {!scanned ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Busca libros con el mismo ISBN (ignorando guiones) y fusiónalos automáticamente.
                </p>
                <Button onClick={scanByIsbn} disabled={scanning}>
                  <Search className="mr-2 h-4 w-4" />
                  {scanning ? 'Escaneando…' : 'Buscar duplicados por ISBN'}
                </Button>
              </div>
            ) : (
              <DuplicateResults
                duplicates={duplicates}
                totalDuplicateBooks={totalDuplicateBooks}
                merging={merging}
                progress={progress}
                labelKey="ISBN"
              />
            )}
          </TabsContent>

          <TabsContent value="title" className="flex-1 overflow-auto space-y-4">
            {!scanned ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Busca libros con el mismo título exacto (ignorando mayúsculas y acentos) y fusiónalos automáticamente.
                </p>
                <Button onClick={scanByTitle} disabled={scanning}>
                  <Search className="mr-2 h-4 w-4" />
                  {scanning ? 'Escaneando…' : 'Buscar duplicados por título'}
                </Button>
              </div>
            ) : (
              <DuplicateResults
                duplicates={duplicates}
                totalDuplicateBooks={totalDuplicateBooks}
                merging={merging}
                progress={progress}
                labelKey="Título"
              />
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cerrar</Button>
          {duplicates.length > 0 && (
            <Button variant="destructive" onClick={mergeAll} disabled={merging}>
              {merging ? `Fusionando… ${progress}%` : `Fusionar todos (${duplicates.length})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateResults({ duplicates, totalDuplicateBooks, merging, progress, labelKey }: {
  duplicates: DuplicateGroup[];
  totalDuplicateBooks: number;
  merging: boolean;
  progress: number;
  labelKey: string;
}) {
  if (duplicates.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No hay duplicados.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {duplicates.length} grupo(s) con {labelKey.toLowerCase()} duplicado · {totalDuplicateBooks} libro(s) se eliminarán
        </p>
        <Badge variant="outline">{totalDuplicateBooks} duplicados</Badge>
      </div>

      {merging && <Progress value={progress} className="h-2" />}

      <div className="rounded border overflow-auto max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labelKey}</TableHead>
              <TableHead>Se conserva</TableHead>
              <TableHead>Se eliminan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {duplicates.map((group, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs font-mono max-w-[150px] truncate">
                  {labelKey === 'ISBN' ? group.books[0].isbn : group.books[0].title}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{group.books[0].title}</div>
                  <div className="text-xs text-muted-foreground">{group.books[0].author}</div>
                </TableCell>
                <TableCell>
                  {group.books.slice(1).map((b, j) => (
                    <div key={j} className="text-xs text-muted-foreground">
                      {b.title} ({b.author}) <span className="text-destructive">→ eliminar</span>
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}