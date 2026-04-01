import { useState } from 'react';
import * as mammoth from 'mammoth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, BookPlus, Search, CheckCircle2, XCircle, Edit2, Undo2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ParsedBook {
  author: string;
  title: string;
  selected: boolean;
  status: 'pending' | 'exists' | 'created' | 'error';
  existingId?: string;
  createdId?: string;
  error?: string;
}

/**
 * Clean author name:
 * - Remove leading numbers
 * - Remove content in parentheses (nicknames)
 * - Fix spacing
 */
function cleanAuthor(raw: string): string {
  let s = raw.trim();
  // Remove leading digits
  s = s.replace(/^\d+\s*/, '');
  // Remove parenthetical nicknames
  s = s.replace(/\([^)]*\)/g, '');
  // Normalize whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Clean book title:
 * - Remove surrounding quotes
 * - Fix spacing
 * - Convert ALL CAPS to Sentence case
 */
function cleanTitle(raw: string): string {
  let s = raw.trim();
  // Remove surrounding quotes (both "curly" and "straight")
  s = s.replace(/^[""\u201C\u201D]+|[""\u201C\u201D]+$/g, '');
  // Normalize whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // If entirely uppercase, convert to sentence case
  if (s === s.toUpperCase() && s.length > 1) {
    s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return s;
}

/**
 * Parse a DOCX file and extract author-title pairs from tables.
 */
async function parseDocxBooks(file: File): Promise<ParsedBook[]> {
  const arrayBuffer = await file.arrayBuffer();

  // Use mammoth to extract raw HTML, then parse tables
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  // Parse HTML to extract table rows
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('tr');

  const books: ParsedBook[] = [];
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2) {
      const rawAuthor = cells[0].textContent ?? '';
      const rawTitle = cells[1].textContent ?? '';

      if (!rawAuthor.trim() && !rawTitle.trim()) return;

      const author = cleanAuthor(rawAuthor);
      const title = cleanTitle(rawTitle);

      if (author && title) {
        books.push({ author, title, selected: true, status: 'pending' });
      }
    }
  });

  return books;
}

export default function ImportarLibros() {
  const [file, setFile] = useState<File | null>(null);
  const [books, setBooks] = useState<ParsedBook[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [checked, setChecked] = useState(false);
  const [search, setSearch] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editAuthor, setEditAuthor] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [reverting, setReverting] = useState(false);

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseDocxBooks(file);
      if (parsed.length === 0) {
        toast.error('No se encontraron libros en el archivo');
        setParsing(false);
        return;
      }
      setBooks(parsed);
      setChecked(false);
      toast.success(`${parsed.length} libros encontrados`);
    } catch (err: any) {
      toast.error('Error al leer el archivo: ' + err.message);
    } finally {
      setParsing(false);
    }
  }

  async function checkExisting() {
    setChecked(true);
    const updated = [...books];

    // Check in batches of 20
    for (let i = 0; i < updated.length; i += 20) {
      const batch = updated.slice(i, i + 20);
      const titles = batch.map(b => b.title);

      for (let j = 0; j < titles.length; j++) {
        const { data } = await (supabase as any).rpc('match_book_by_normalized_title', {
          p_title: titles[j],
        });
        if (data && data.length > 0) {
          updated[i + j] = { ...updated[i + j], status: 'exists', existingId: data[0].id, selected: false };
        }
      }
    }

    setBooks(updated);
    const existCount = updated.filter(b => b.status === 'exists').length;
    toast.info(`${existCount} libros ya existen en el catálogo, ${updated.length - existCount} nuevos`);
  }

  async function handleImport() {
    const toImport = books.filter(b => b.selected && b.status === 'pending');
    if (toImport.length === 0) {
      toast.error('No hay libros seleccionados para importar');
      return;
    }

    setImporting(true);
    setProgress(0);
    const updated = [...books];
    let created = 0;
    let errors = 0;

    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].selected || updated[i].status !== 'pending') continue;

      const { data: newBook, error } = await supabase.from('books').insert({
        title: updated[i].title,
        author: updated[i].author,
        pvp: 15,
        status: 'active',
      }).select('id').single();

      if (error) {
        updated[i] = { ...updated[i], status: 'error', error: error.message };
        errors++;
      } else {
        updated[i] = { ...updated[i], status: 'created', createdId: newBook?.id };
        created++;
      }

      setProgress(Math.round(((created + errors) / toImport.length) * 100));
    }

    setBooks(updated);
    setImporting(false);
    toast.success(`${created} libros creados${errors > 0 ? `, ${errors} errores` : ''}`);
  }

  async function handleRevert() {
    const createdIds = books.filter(b => b.status === 'created' && b.createdId).map(b => b.createdId!);
    if (createdIds.length === 0) return;
    setReverting(true);
    try {
      // Delete in batches
      for (let i = 0; i < createdIds.length; i += 50) {
        const batch = createdIds.slice(i, i + 50);
        const { error } = await supabase.from('books').delete().in('id', batch);
        if (error) throw error;
      }
      setBooks(prev => prev.map(b => b.status === 'created' ? { ...b, status: 'pending', selected: true, createdId: undefined } : b));
      toast.success(`${createdIds.length} libros eliminados`);
    } catch (err: any) {
      toast.error('Error al revertir: ' + err.message);
    } finally {
      setReverting(false);
    }
  }
  function toggleAll(checked: boolean) {
    setBooks(prev => prev.map(b => b.status === 'pending' ? { ...b, selected: checked } : b));
  }

  function toggleBook(idx: number) {
    setBooks(prev => prev.map((b, i) => i === idx && b.status === 'pending' ? { ...b, selected: !b.selected } : b));
  }

  function startEdit(idx: number) {
    setEditingIdx(idx);
    setEditAuthor(books[idx].author);
    setEditTitle(books[idx].title);
  }

  function saveEdit(idx: number) {
    setBooks(prev => prev.map((b, i) => i === idx ? { ...b, author: editAuthor.trim(), title: editTitle.trim() } : b));
    setEditingIdx(null);
  }

  const pendingCount = books.filter(b => b.status === 'pending').length;
  const selectedCount = books.filter(b => b.selected && b.status === 'pending').length;
  const existsCount = books.filter(b => b.status === 'exists').length;
  const createdCount = books.filter(b => b.status === 'created').length;

  const filteredBooks = search
    ? books.filter(b => b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase()))
    : books;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Importar Libros</h1>

      <Card>
        <CardHeader><CardTitle>Cargar archivo DOCX</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".docx"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setBooks([]); setChecked(false); }}
              className="text-sm"
            />
            <Button onClick={handleParse} disabled={!file || parsing}>
              <Upload className="mr-2 h-4 w-4" />
              {parsing ? 'Leyendo…' : 'Leer archivo'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Sube un archivo DOCX con una tabla de dos columnas: Autor y Título.
            Los números delante de los autores, los apodos entre paréntesis y las comillas en los títulos se limpiarán automáticamente.
          </p>
        </CardContent>
      </Card>

      {books.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{books.length}</div>
                <div className="text-sm text-muted-foreground">Total leídos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{pendingCount}</div>
                <div className="text-sm text-muted-foreground">Nuevos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{existsCount}</div>
                <div className="text-sm text-muted-foreground">Ya existen</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold">{createdCount}</div>
                <div className="text-sm text-muted-foreground">Creados</div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {!checked && (
              <Button variant="outline" onClick={checkExisting}>
                <Search className="mr-2 h-4 w-4" />
                Comprobar existentes
              </Button>
            )}
            <Button onClick={handleImport} disabled={importing || selectedCount === 0}>
              <BookPlus className="mr-2 h-4 w-4" />
              {importing ? `Importando… ${progress}%` : `Importar seleccionados (${selectedCount})`}
            </Button>
            {createdCount > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={reverting}>
                    <Undo2 className="mr-2 h-4 w-4" />
                    {reverting ? 'Revirtiendo…' : `Revertir (${createdCount})`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Revertir importación?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se eliminarán {createdCount} libros creados en esta importación. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevert}>Revertir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 w-60"
              />
            </div>
          </div>

          {importing && <Progress value={progress} className="h-2" />}

          {/* Table */}
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedCount === pendingCount && pendingCount > 0}
                      onCheckedChange={(v) => toggleAll(!!v)}
                    />
                  </TableHead>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBooks.map((book, idx) => {
                  const realIdx = search ? books.indexOf(book) : idx;
                  return (
                    <TableRow key={realIdx} className={book.status === 'exists' ? 'opacity-50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={book.selected}
                          disabled={book.status !== 'pending'}
                          onCheckedChange={() => toggleBook(realIdx)}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{realIdx + 1}</TableCell>
                      <TableCell>
                        {editingIdx === realIdx ? (
                          <Input value={editAuthor} onChange={e => setEditAuthor(e.target.value)} className="h-7 text-sm" />
                        ) : (
                          <span className="text-sm">{book.author}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingIdx === realIdx ? (
                          <div className="flex gap-1 items-center">
                            <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="h-7 text-sm" />
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => saveEdit(realIdx)}>✓</Button>
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingIdx(null)}>✗</Button>
                          </div>
                        ) : (
                          <span className="text-sm">{book.title}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          book.status === 'created' ? 'default' :
                          book.status === 'exists' ? 'secondary' :
                          book.status === 'error' ? 'destructive' : 'outline'
                        }>
                          {book.status === 'pending' && 'Nuevo'}
                          {book.status === 'exists' && 'Ya existe'}
                          {book.status === 'created' && <><CheckCircle2 className="h-3 w-3 mr-1" />Creado</>}
                          {book.status === 'error' && <><XCircle className="h-3 w-3 mr-1" />Error</>}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {book.status === 'pending' && editingIdx !== realIdx && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(realIdx)}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
