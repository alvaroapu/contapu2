import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { normalizeText } from '@/lib/isbnUtils';
import * as XLSX from 'xlsx';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface EmailRow {
  title: string;
  author: string;
  email: string;
  matched: boolean;
  bookId?: string;
  currentTitle?: string;
}

export function ImportEmailsDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (raw.length < 2) {
        toast.error('El archivo no tiene datos');
        setLoading(false);
        return;
      }

      const headers = raw[0].map((h: any) => normalizeText(String(h ?? '')));
      const cTitle = headers.findIndex(h => h.includes('titulo') || h.includes('title') || h.includes('obra'));
      const cAuthor = headers.findIndex(h => h.includes('autor') || h.includes('author'));
      const cEmail = headers.findIndex(h => h.includes('email') || h.includes('correo') || h.includes('mail'));

      if (cTitle < 0 || cEmail < 0) {
        toast.error('No se encontraron columnas de título y email');
        setLoading(false);
        return;
      }

      // Fetch all books
      let allBooks: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from('books').select('id, title, author').range(from, from + 999);
        if (!data || data.length === 0) break;
        allBooks.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }

      const parsed: EmailRow[] = [];
      for (let i = 1; i < raw.length; i++) {
        const r = raw[i];
        if (!r) continue;
        const title = r[cTitle] ? String(r[cTitle]).trim() : '';
        const author = cAuthor >= 0 && r[cAuthor] ? String(r[cAuthor]).trim() : '';
        const email = r[cEmail] ? String(r[cEmail]).trim() : '';
        if (!title || !email) continue;

        const normTitle = normalizeText(title);
        const normAuthor = author ? normalizeText(author) : '';
        const match = allBooks.find(b => normalizeText(b.title) === normTitle);

        if (match) {
          parsed.push({ title, author, email, matched: true, bookId: match.id, currentTitle: match.title });
        } else {
          // Try partial title match
          let candidates = allBooks.filter(b => {
            const nb = normalizeText(b.title);
            return nb.includes(normTitle) || normTitle.includes(nb);
          });
          // If author provided, filter by author to narrow down
          if (normAuthor && candidates.length !== 1) {
            const byAuthor = candidates.filter(b => normalizeText(b.author) === normAuthor);
            if (byAuthor.length > 0) candidates = byAuthor;
          }
          // If still no match by title, try matching by author alone when there's only one book by that author
          if (candidates.length === 0 && normAuthor) {
            const authorBooks = allBooks.filter(b => normalizeText(b.author) === normAuthor);
            // Try partial title within author's books
            const partial = authorBooks.filter(b => {
              const nb = normalizeText(b.title);
              return nb.includes(normTitle) || normTitle.includes(nb);
            });
            if (partial.length === 1) candidates = partial;
          }
          if (candidates.length === 1) {
            parsed.push({ title, author, email, matched: true, bookId: candidates[0].id, currentTitle: candidates[0].title });
          } else {
            parsed.push({ title, author, email, matched: false });
          }
        }
      }

      setRows(parsed);
    } catch (err) {
      toast.error('Error al leer el archivo');
    }
    setLoading(false);
    e.target.value = '';
  };

  const matchedRows = rows.filter(r => r.matched);
  const unmatchedRows = rows.filter(r => !r.matched);

  const handleSave = async () => {
    setSaving(true);
    try {
      let updated = 0;
      for (const row of matchedRows) {
        const { error } = await supabase
          .from('books')
          .update({ author_email: row.email } as any)
          .eq('id', row.bookId!);
        if (!error) updated++;
      }
      toast.success(`${updated} email(s) actualizados`);
      qc.invalidateQueries({ queryKey: ['books'] });
      onOpenChange(false);
      setRows([]);
    } catch {
      toast.error('Error al guardar');
    }
    setSaving(false);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Título', 'Autor', 'Email']]);
    ws['!cols'] = [{ wch: 40 }, { wch: 25 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Emails');
    XLSX.writeFile(wb, 'Plantilla_Emails.xlsx');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setRows([]); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar emails de autores</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Sube un Excel con columnas <strong>Título</strong> y <strong>Email</strong>. Solo se actualizará el email de los libros que coincidan por título.
        </p>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" /> Descargar plantilla
          </Button>
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" /> Seleccionar archivo
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            </label>
          </Button>
        </div>

        {loading && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Procesando…</div>}

        {rows.length > 0 && (
          <>
            <div className="flex gap-3 text-sm">
              <Badge variant="default">{matchedRows.length} encontrados</Badge>
              {unmatchedRows.length > 0 && <Badge variant="destructive">{unmatchedRows.length} sin coincidencia</Badge>}
            </div>

            <div className="rounded-md border max-h-[40vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título (archivo)</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i} className={!row.matched ? 'bg-red-50' : ''}>
                      <TableCell className="text-sm max-w-[250px] truncate" title={row.matched ? `→ ${row.currentTitle}` : undefined}>
                        {row.title}
                      </TableCell>
                      <TableCell className="text-sm">{row.email}</TableCell>
                      <TableCell>
                        <Badge variant={row.matched ? 'default' : 'destructive'}>
                          {row.matched ? 'OK' : 'No encontrado'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setRows([]); }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || matchedRows.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Actualizar {matchedRows.length} email(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
