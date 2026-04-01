import { useState, useEffect } from 'react';
import * as mammoth from 'mammoth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Upload, BookPlus, Search, CheckCircle2, XCircle, Edit2, Undo2, Loader2, Link2, AlertTriangle, History } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { formatDate } from '@/lib/format';

interface ImportBatch {
  id: string;
  file_name: string;
  books_created: number;
  imported_at: string;
  reverted: boolean;
  reverted_at: string | null;
}

interface FuzzyMatch {
  book_id: string;
  book_title: string;
  book_author: string;
  book_isbn: string | null;
  book_pvp: number;
  title_similarity: number;
  author_similarity: number;
  combined_score: number;
}

interface ParsedBook {
  author: string;
  title: string;
  selected: boolean;
  status: 'pending' | 'match_found' | 'exists' | 'created' | 'error';
  createdId?: string;
  existingId?: string;
  matches?: FuzzyMatch[];
  chosenAction?: 'create' | 'link';
  error?: string;
}

function cleanAuthor(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^\d+\s*/, '');
  s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function cleanTitle(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^[""\u201C\u201D]+|[""\u201C\u201D]+$/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s === s.toUpperCase() && s.length > 1) {
    s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return s;
}

async function parseDocxBooks(file: File): Promise<ParsedBook[]> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('tr');

  const books: ParsedBook[] = [];
  const seen = new Set<string>();
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2) {
      const rawAuthor = cells[0].textContent ?? '';
      const rawTitle = cells[1].textContent ?? '';
      if (!rawAuthor.trim() && !rawTitle.trim()) return;
      const author = cleanAuthor(rawAuthor);
      const title = cleanTitle(rawTitle);
      if (author && title) {
        const key = `${author.toLowerCase()}::${title.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          books.push({ author, title, selected: true, status: 'pending' });
        }
      }
    }
  });
  return books;
}

export default function ImportarLibros() {
  const [file, setFile] = useState<File | null>(null);
  const [books, setBooks] = useState<ParsedBook[]>([]);
  const [parsing, setParsing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editAuthor, setEditAuthor] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [reverting, setReverting] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportBatch[]>([]);
  const [revertingBatchId, setRevertingBatchId] = useState<string | null>(null);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    const { data } = await supabase.from('book_import_batches')
      .select('*')
      .order('imported_at', { ascending: false })
      .limit(50) as { data: ImportBatch[] | null };
    setImportHistory(data ?? []);
  }

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
      toast.success(`${parsed.length} libros encontrados. Comprobando duplicados…`);
      // Automatically check for fuzzy matches
      await checkFuzzyMatches(parsed);
    } catch (err: any) {
      toast.error('Error al leer el archivo: ' + err.message);
    } finally {
      setParsing(false);
    }
  }

  async function checkFuzzyMatches(bookList: ParsedBook[]) {
    setChecking(true);
    const updated = [...bookList];

    for (let i = 0; i < updated.length; i++) {
      try {
        const { data } = await (supabase as any).rpc('fuzzy_match_books', {
          p_author: updated[i].author,
          p_title: updated[i].title,
          p_threshold: 0.35,
        });

        if (data && data.length > 0) {
          // Check if there's an exact or very high match
          const bestMatch = data[0] as FuzzyMatch;
          if (bestMatch.combined_score > 0.85) {
            // Very high match — mark as existing
            updated[i] = {
              ...updated[i],
              status: 'exists',
              existingId: bestMatch.book_id,
              matches: data as FuzzyMatch[],
              selected: false,
            };
          } else {
            // Partial match — needs user decision
            updated[i] = {
              ...updated[i],
              status: 'match_found',
              matches: data as FuzzyMatch[],
              selected: false,
            };
          }
        }
      } catch {
        // Ignore errors, leave as pending
      }

      // Update progress visually every 5 items
      if (i % 5 === 0) {
        setBooks([...updated]);
      }
    }

    setBooks(updated);
    setChecking(false);

    const exactCount = updated.filter(b => b.status === 'exists').length;
    const fuzzyCount = updated.filter(b => b.status === 'match_found').length;
    const newCount = updated.filter(b => b.status === 'pending').length;

    toast.info(
      `${exactCount} ya existen, ${fuzzyCount} posibles coincidencias, ${newCount} nuevos`
    );
  }

  function chooseCreate(idx: number) {
    setBooks(prev => prev.map((b, i) =>
      i === idx ? { ...b, status: 'pending', selected: true, chosenAction: 'create', matches: undefined } : b
    ));
  }

  function chooseLink(idx: number, matchId: string) {
    setBooks(prev => prev.map((b, i) =>
      i === idx ? { ...b, status: 'exists', existingId: matchId, selected: false, chosenAction: 'link' } : b
    ));
  }

  async function handleImport() {
    const toImport = books.filter(b => b.selected && b.status === 'pending');
    if (toImport.length === 0) {
      toast.error('No hay libros seleccionados para importar');
      return;
    }

    setImporting(true);
    setProgress(0);

    // Create import batch record
    const { data: batchData } = await supabase.from('book_import_batches').insert({
      file_name: file?.name ?? 'Sin nombre',
      books_created: 0,
    } as any).select('id').single();
    const batchId = batchData?.id;

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
        book_import_batch_id: batchId,
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

    // Update batch with final count
    if (batchId && created > 0) {
      await supabase.from('book_import_batches').update({ books_created: created } as any).eq('id', batchId);
    }

    setBooks(updated);
    setImporting(false);
    toast.success(`${created} libros creados${errors > 0 ? `, ${errors} errores` : ''}`);
    loadHistory();
  }

  async function handleRevert() {
    const createdIds = books.filter(b => b.status === 'created' && b.createdId).map(b => b.createdId!);
    if (createdIds.length === 0) return;
    setReverting(true);
    try {
      for (let i = 0; i < createdIds.length; i += 50) {
        const batch = createdIds.slice(i, i + 50);
        const { error } = await supabase.from('books').delete().in('id', batch);
        if (error) throw error;
      }
      setBooks(prev => prev.map(b => b.status === 'created' ? { ...b, status: 'pending', selected: true, createdId: undefined } : b));
      toast.success(`${createdIds.length} libros eliminados`);
      loadHistory();
    } catch (err: any) {
      toast.error('Error al revertir: ' + err.message);
    } finally {
      setReverting(false);
    }
  }

  async function handleRevertBatch(batchId: string) {
    setRevertingBatchId(batchId);
    try {
      // Find all books in this batch
      let allIds: string[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from('books')
          .select('id')
          .eq('book_import_batch_id', batchId)
          .range(from, from + 499);
        if (!data || data.length === 0) break;
        allIds.push(...data.map(b => b.id));
        if (data.length < 500) break;
        from += 500;
      }

      if (allIds.length === 0) {
        toast.error('No se encontraron libros de este lote');
        return;
      }

      // Delete books in batches
      for (let i = 0; i < allIds.length; i += 50) {
        const chunk = allIds.slice(i, i + 50);
        const { error } = await supabase.from('books').delete().in('id', chunk);
        if (error) throw error;
      }

      // Mark batch as reverted
      await supabase.from('book_import_batches').update({
        reverted: true,
        reverted_at: new Date().toISOString(),
      } as any).eq('id', batchId);

      toast.success(`${allIds.length} libros eliminados`);
      loadHistory();
    } catch (err: any) {
      toast.error('Error al revertir: ' + err.message);
    } finally {
      setRevertingBatchId(null);
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

  function createAllPending() {
    // Mark all match_found as "create new"
    setBooks(prev => prev.map(b =>
      b.status === 'match_found' ? { ...b, status: 'pending', selected: true, chosenAction: 'create', matches: undefined } : b
    ));
  }

  const pendingCount = books.filter(b => b.status === 'pending').length;
  const selectedCount = books.filter(b => b.selected && b.status === 'pending').length;
  const existsCount = books.filter(b => b.status === 'exists').length;
  const matchCount = books.filter(b => b.status === 'match_found').length;
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
              onChange={e => { setFile(e.target.files?.[0] ?? null); setBooks([]); }}
              className="text-sm"
            />
            <Button onClick={handleParse} disabled={!file || parsing || checking}>
              <Upload className="mr-2 h-4 w-4" />
              {parsing ? 'Leyendo…' : checking ? 'Comprobando…' : 'Leer archivo'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Sube un archivo DOCX con una tabla de dos columnas: Autor y Título.
            Se limpiará automáticamente y se buscará si ya existen libros similares.
          </p>
        </CardContent>
      </Card>

      {(checking) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Comprobando coincidencias en el catálogo…
        </div>
      )}

      {books.length > 0 && !checking && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total', value: books.length },
              { label: 'Nuevos', value: pendingCount },
              { label: 'Coincidencias', value: matchCount, color: 'text-amber-600' },
              { label: 'Ya existen', value: existsCount },
              { label: 'Creados', value: createdCount },
            ].map(c => (
              <Card key={c.label}>
                <CardContent className="pt-4 pb-3 text-center">
                  <div className={`text-2xl font-bold ${c.color ?? ''}`}>{c.value}</div>
                  <div className="text-sm text-muted-foreground">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleImport} disabled={importing || selectedCount === 0}>
              <BookPlus className="mr-2 h-4 w-4" />
              {importing ? `Importando… ${progress}%` : `Importar seleccionados (${selectedCount})`}
            </Button>
            {matchCount > 0 && (
              <Button variant="outline" size="sm" onClick={createAllPending}>
                Crear todos los dudosos ({matchCount})
              </Button>
            )}
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
                      Se eliminarán {createdCount} libros creados en esta importación.
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
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBooks.map((book, idx) => {
                  const realIdx = search ? books.indexOf(book) : idx;
                  return (
                    <>
                      <TableRow key={`row-${realIdx}`} className={
                        book.status === 'exists' ? 'opacity-50' :
                        book.status === 'match_found' ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                      }>
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
                          {book.status === 'pending' && (
                            <Badge variant="outline">Nuevo</Badge>
                          )}
                          {book.status === 'match_found' && (
                            <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Posible duplicado
                            </Badge>
                          )}
                          {book.status === 'exists' && (
                            <Badge variant="secondary">Ya existe</Badge>
                          )}
                          {book.status === 'created' && (
                            <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Creado</Badge>
                          )}
                          {book.status === 'error' && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Error</Badge>
                              </TooltipTrigger>
                              <TooltipContent>{book.error}</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          {book.status === 'pending' && editingIdx !== realIdx && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(realIdx)}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                          {book.status === 'match_found' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => chooseCreate(realIdx)}>
                              <BookPlus className="h-3 w-3 mr-1" /> Crear nuevo
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Show matches inline */}
                      {book.status === 'match_found' && book.matches && (
                        <TableRow key={`matches-${realIdx}`} className="bg-amber-50/50 dark:bg-amber-950/10">
                          <TableCell colSpan={2}></TableCell>
                          <TableCell colSpan={4}>
                            <div className="py-1 space-y-1">
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                                Coincidencias encontradas:
                              </p>
                              {book.matches.map((m, mi) => (
                                <div key={mi} className="flex items-center gap-2 text-xs bg-background rounded px-2 py-1.5 border">
                                  <div className="flex-1">
                                    <span className="font-medium">{m.book_author}</span>
                                    <span className="text-muted-foreground"> — </span>
                                    <span>{m.book_title}</span>
                                    {m.book_isbn && <span className="text-muted-foreground ml-2">({m.book_isbn})</span>}
                                  </div>
                                  <Badge variant="outline" className="text-[10px] shrink-0">
                                    {Math.round(m.combined_score * 100)}% similar
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 text-xs shrink-0"
                                    onClick={() => chooseLink(realIdx, m.book_id)}
                                  >
                                    <Link2 className="h-3 w-3 mr-1" /> Es este
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Historial de importaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {importHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No hay importaciones registradas</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Libros creados</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importHistory.map(batch => (
                    <TableRow key={batch.id} className={batch.reverted ? 'opacity-50' : ''}>
                      <TableCell className="text-sm font-medium">{batch.file_name}</TableCell>
                      <TableCell className="text-sm">{formatDate(batch.imported_at)}</TableCell>
                      <TableCell className="text-sm">{batch.books_created}</TableCell>
                      <TableCell>
                        {batch.reverted ? (
                          <Badge variant="secondary">Revertida</Badge>
                        ) : (
                          <Badge variant="default">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Importada
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!batch.reverted && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={revertingBatchId === batch.id}
                              >
                                <Undo2 className="mr-1 h-3 w-3" />
                                {revertingBatchId === batch.id ? 'Revirtiendo…' : 'Revertir'}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Revertir esta importación?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Se eliminarán los {batch.books_created} libros creados en la importación de "{batch.file_name}".
                                  Los libros que tengan ventas asociadas no podrán eliminarse.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRevertBatch(batch.id)}>
                                  Revertir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
