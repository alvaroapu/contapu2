import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useBulkInsertBooks } from '@/hooks/useBooks';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Undo2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface ParsedBook {
  isbn: string | null;
  title: string;
  author: string;
  pvp: number;
  publication_date: string | null;
  maidhisa_ref: string | null;
  ean: string | null;
}

type MatchStatus = 'new' | 'isbn_match' | 'title_match';

interface ImportRow {
  book: ParsedBook;
  status: MatchStatus;
  matchTitle?: string;
  similarity?: number;
  selected: boolean;
}

const HEADER_MAP: Record<string, string> = {
  isbn: 'isbn',
  ean: 'ean',
  titulo: 'title', title: 'title',
  autor: 'author', author: 'author',
  pvp: 'pvp', precio: 'pvp', price: 'pvp',
  fecha_publicacion: 'publication_date', fecha: 'publication_date', publication_date: 'publication_date',
  maidhisa_ref: 'maidhisa_ref', ref_maidhisa: 'maidhisa_ref', referencia: 'maidhisa_ref',
};

function normalizeHeader(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .trim();
}

/** Normalize for fuzzy title comparison: lowercase, strip accents, articles, extra spaces */
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(el|la|los|las|un|una|unos|unas|de|del|al|y|e|o|en|con|por|para|a)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bigram similarity (Dice coefficient) — returns 0..1 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      set.set(bg, (set.get(bg) ?? 0) + 1);
    }
    return set;
  };
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  let intersection = 0;
  for (const [bg, countA] of bgA) {
    intersection += Math.min(countA, bgB.get(bg) ?? 0);
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function mapHeaders(raw: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  raw.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (HEADER_MAP[key]) map[i] = HEADER_MAP[key];
  });
  return map;
}

function parseSpreadsheetDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const esMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (esMatch) {
    const [, day, month, year] = esMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const SIMILARITY_THRESHOLD = 0.75;

export function ImportBooksDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const bulkInsert = useBulkInsertBooks();

  const stats = {
    new: rows.filter(r => r.status === 'new').length,
    isbnMatch: rows.filter(r => r.status === 'isbn_match').length,
    titleMatch: rows.filter(r => r.status === 'title_match').length,
    selected: rows.filter(r => r.selected).length,
  };

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rawRows.length < 2) {
        toast.error('El archivo está vacío o no tiene datos');
        return;
      }

      const headerMap = mapHeaders(rawRows[0].map(String));
      if (Object.keys(headerMap).length === 0) {
        toast.error('No se reconocieron las columnas. Usa cabeceras como: título, autor, isbn, pvp');
        return;
      }

      const hasTitle = Object.values(headerMap).includes('title');
      if (!hasTitle) {
        toast.error('Falta la columna obligatoria: Título');
        return;
      }

      const books: ParsedBook[] = [];
      for (let i = 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) continue;
        const record: any = {};
        Object.entries(headerMap).forEach(([colIdx, field]) => {
          record[field] = row[Number(colIdx)] ?? null;
        });
        if (!record.title) continue;
        books.push({
          isbn: record.isbn ? String(record.isbn).trim() : null,
          title: String(record.title ?? '').trim(),
          author: record.author ? String(record.author).trim() : '',
          pvp: parseFloat(record.pvp) || 0,
          publication_date: parseSpreadsheetDate(record.publication_date),
          maidhisa_ref: record.maidhisa_ref ? String(record.maidhisa_ref).trim() : null,
          ean: record.ean ? String(record.ean).trim() : null,
        });
      }

      if (books.length === 0) {
        toast.error('No se encontraron libros válidos en el archivo');
        return;
      }

      // Fetch all existing books for matching
      const { data: existingBooks } = await supabase
        .from('books')
        .select('isbn, title');
      const existing = existingBooks ?? [];
      const existingIsbns = new Set(existing.map(b => b.isbn).filter(Boolean));
      const existingTitlesNorm = existing.map(b => ({
        original: b.title,
        norm: normalizeTitle(b.title),
      }));

      // Classify each book
      const importRows: ImportRow[] = books.map(book => {
        // 1. ISBN exact match
        if (book.isbn && existingIsbns.has(book.isbn)) {
          return { book, status: 'isbn_match' as const, selected: false };
        }

        // 2. Fuzzy title match
        const normTitle = normalizeTitle(book.title);
        let bestSim = 0;
        let bestMatch = '';
        for (const et of existingTitlesNorm) {
          const sim = similarity(normTitle, et.norm);
          if (sim > bestSim) {
            bestSim = sim;
            bestMatch = et.original;
          }
        }

        if (bestSim >= SIMILARITY_THRESHOLD) {
          return {
            book,
            status: 'title_match' as const,
            matchTitle: bestMatch,
            similarity: Math.round(bestSim * 100),
            selected: false,
          };
        }

        return { book, status: 'new' as const, selected: true };
      });

      setRows(importRows);
      toast.success(`${books.length} libros leídos del archivo`);
    } catch (err: any) {
      console.error('Error parsing file:', err);
      toast.error(`Error al leer el archivo: ${err.message ?? 'formato no válido'}`);
    }
  }, []);

  const toggleRow = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const selectAll = (selected: boolean) => {
    setRows(prev => prev.map(r => ({ ...r, selected })));
  };

  const handleImport = async () => {
    const toImport = rows.filter(r => r.selected).map(r => r.book);
    if (toImport.length === 0) {
      toast.error('No hay libros seleccionados para importar');
      return;
    }

    setImporting(true);
    setProgress(0);

    const CHUNK = 50;
    const withIsbn = toImport.filter(b => b.isbn);
    const withoutIsbn = toImport.filter(b => !b.isbn);
    const total = Math.ceil(withIsbn.length / CHUNK) + Math.ceil(withoutIsbn.length / CHUNK) || 1;
    let done = 0;

    try {
      for (let i = 0; i < withIsbn.length; i += CHUNK) {
        await bulkInsert.mutateAsync(withIsbn.slice(i, i + CHUNK));
        done++;
        setProgress(Math.round((done / total) * 100));
      }
      for (let i = 0; i < withoutIsbn.length; i += CHUNK) {
        const chunk = withoutIsbn.slice(i, i + CHUNK);
        const { error } = await supabase.from('books').insert(chunk as any);
        if (error) throw error;
        done++;
        setProgress(Math.round((done / total) * 100));
      }

      toast.success(`Importación completada: ${toImport.length} libros procesados`);
      onOpenChange(false);
      setRows([]);
    } catch (err: any) {
      toast.error(err.message ?? 'Error en la importación');
    } finally {
      setImporting(false);
    }
  };

  const statusBadge = (row: ImportRow) => {
    if (row.status === 'isbn_match') return <Badge variant="secondary">ISBN duplicado</Badge>;
    if (row.status === 'title_match')
      return (
        <Badge variant="outline" className="text-orange-600 border-orange-300">
          ~{row.similarity}% «{row.matchTitle}»
        </Badge>
      );
    return <Badge className="bg-green-600">Nuevo</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { onOpenChange(v); setRows([]); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar catálogo</DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Sube un archivo CSV o XLSX con al menos una columna «Título»
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFile}
              className="text-sm"
            />
          </div>
        ) : (
          <div className="space-y-3 flex-1 min-h-0 flex flex-col">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded bg-green-100 text-green-800 px-2 py-1">{stats.new} nuevos</span>
              <span className="rounded bg-muted px-2 py-1">{stats.isbnMatch} duplicados (ISBN)</span>
              <span className="rounded bg-orange-100 text-orange-800 px-2 py-1">{stats.titleMatch} posibles duplicados (título)</span>
              <span className="ml-auto font-medium">{stats.selected} seleccionados para importar</span>
            </div>

            <div className="flex gap-2 text-xs">
              <Button variant="ghost" size="sm" onClick={() => selectAll(true)}>Seleccionar todos</Button>
              <Button variant="ghost" size="sm" onClick={() => selectAll(false)}>Deseleccionar todos</Button>
              <Button variant="ghost" size="sm" onClick={() => setRows(prev => prev.map(r => ({ ...r, selected: r.status === 'new' })))}>
                Solo nuevos
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>ISBN</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i} className={row.selected ? '' : 'opacity-50'}>
                      <TableCell>
                        <Checkbox
                          checked={row.selected}
                          onCheckedChange={() => toggleRow(i)}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[300px] truncate">{row.book.title}</TableCell>
                      <TableCell className="text-xs">{row.book.isbn ?? '—'}</TableCell>
                      <TableCell>{statusBadge(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {importing && <Progress value={progress} className="h-2" />}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRows([])} disabled={importing}>
                Cancelar
              </Button>
              <Button onClick={handleImport} disabled={importing || stats.selected === 0}>
                {importing ? `Importando… ${progress}%` : `Importar ${stats.selected} libros`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
