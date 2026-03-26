import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBulkInsertBooks } from '@/hooks/useBooks';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';

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

const HEADER_MAP: Record<string, string> = {
  isbn: 'isbn',
  ean: 'ean',
  titulo: 'title', title: 'title',
  autor: 'author', author: 'author',
  pvp: 'pvp', precio: 'pvp', price: 'pvp',
  fecha_publicacion: 'publication_date', fecha: 'publication_date', publication_date: 'publication_date',
  maidhisa_ref: 'maidhisa_ref', ref_maidhisa: 'maidhisa_ref', referencia: 'maidhisa_ref',
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .trim();
}

function mapHeaders(raw: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  raw.forEach((h, i) => {
    const key = normalize(h);
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

export function ImportBooksDialog({ open, onOpenChange }: Props) {
  const [parsed, setParsed] = useState<ParsedBook[]>([]);
  const [stats, setStats] = useState({ newCount: 0, existingCount: 0, noIsbn: 0 });
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const bulkInsert = useBulkInsertBooks();

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) {
        toast.error('El archivo está vacío o no tiene datos');
        return;
      }

      const headerMap = mapHeaders(rows[0].map(String));

      if (Object.keys(headerMap).length === 0) {
        toast.error(
          'No se reconocieron las columnas. Asegúrate de que el archivo tiene cabeceras como: título, autor, isbn, pvp, fecha, referencia'
        );
        return;
      }

      const hasTitle = Object.values(headerMap).includes('title');
      if (!hasTitle) {
        toast.error('Falta la columna obligatoria: Título');
        return;
      }

      const books: ParsedBook[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
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

      // Check existing ISBNs
      const isbns = books.filter(b => b.isbn).map(b => b.isbn!);
      let existingIsbns = new Set<string>();
      if (isbns.length > 0) {
        const { data: existing } = await supabase.from('books').select('isbn').in('isbn', isbns);
        existingIsbns = new Set((existing ?? []).map((d: { isbn: string }) => d.isbn));
      }

      setParsed(books);
      setStats({
        newCount: books.filter(b => b.isbn && !existingIsbns.has(b.isbn)).length,
        existingCount: books.filter(b => b.isbn && existingIsbns.has(b.isbn)).length,
        noIsbn: books.filter(b => !b.isbn).length,
      });

      toast.success(`${books.length} libros leídos del archivo`);
    } catch (err: any) {
      console.error('Error parsing file:', err);
      toast.error(`Error al leer el archivo: ${err.message ?? 'formato no válido'}`);
    }
  }, []);

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);

    // Split into chunks of 50
    const CHUNK = 50;
    const booksWithIsbn = parsed.filter(b => b.isbn);
    const booksWithoutIsbn = parsed.filter(b => !b.isbn);
    const total = Math.ceil(booksWithIsbn.length / CHUNK) + Math.ceil(booksWithoutIsbn.length / CHUNK);
    let done = 0;

    try {
      // Upsert books with ISBN
      for (let i = 0; i < booksWithIsbn.length; i += CHUNK) {
        await bulkInsert.mutateAsync(booksWithIsbn.slice(i, i + CHUNK));
        done++;
        setProgress(Math.round((done / total) * 100));
      }

      // Insert books without ISBN (always new)
      for (let i = 0; i < booksWithoutIsbn.length; i += CHUNK) {
        const chunk = booksWithoutIsbn.slice(i, i + CHUNK);
        const { error } = await supabase.from('books').insert(chunk as any);
        if (error) throw error;
        done++;
        setProgress(Math.round((done / total) * 100));
      }

      toast.success(`Importación completada: ${parsed.length} libros procesados`);
      onOpenChange(false);
      setParsed([]);
    } catch (err: any) {
      toast.error(err.message ?? 'Error en la importación');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { onOpenChange(v); setParsed([]); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar catálogo</DialogTitle>
        </DialogHeader>

        {parsed.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sube un archivo CSV o XLSX</p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFile}
              className="text-sm"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="rounded bg-muted px-2 py-1">{stats.newCount} nuevos</span>
              <span className="rounded bg-muted px-2 py-1">{stats.existingCount} ya existen</span>
              <span className="rounded bg-muted px-2 py-1">{stats.noIsbn} sin ISBN</span>
            </div>

            <div className="max-h-60 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead>ISBN</TableHead>
                    <TableHead>PVP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 10).map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{b.title}</TableCell>
                      <TableCell>{b.author}</TableCell>
                      <TableCell>{b.isbn ?? '—'}</TableCell>
                      <TableCell>{b.pvp}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsed.length > 10 && (
                <p className="p-2 text-center text-xs text-muted-foreground">
                  …y {parsed.length - 10} más
                </p>
              )}
            </div>

            {importing && <Progress value={progress} className="h-2" />}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setParsed([]); }} disabled={importing}>
                Cancelar
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? `Importando… ${progress}%` : 'Confirmar importación'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
