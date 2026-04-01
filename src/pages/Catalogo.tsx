import { useState, useMemo, useCallback } from 'react';
import { useBooks, Book, BookFilters, useAuthors } from '@/hooks/useBooks';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { BookFormDialog } from '@/components/catalogo/BookFormDialog';
import { ImportBooksDialog } from '@/components/catalogo/ImportBooksDialog';
import { MergeBookDialog } from '@/components/catalogo/MergeBookDialog';
import { AutoMergeDialog } from '@/components/catalogo/AutoMergeDialog';
import { ImportEmailsDialog } from '@/components/catalogo/ImportEmailsDialog';
import { formatCurrency, formatDate, STATUS_LABELS } from '@/lib/format';
import { Plus, Upload, ArrowUpDown, Download, Trash2, Merge, Mail } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useDeleteAllBooks, useDeleteBook, useDeleteBooks, useExportCatalog } from '@/hooks/useBooks';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

export default function Catalogo() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [missingIsbn, setMissingIsbn] = useState(false);
  const [missingEmail, setMissingEmail] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortColumn, setSortColumn] = useState('title');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteBookId, setDeleteBookId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteBulkOpen, setDeleteBulkOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [autoMergeOpen, setAutoMergeOpen] = useState(false);
  const [autoMergeTab, setAutoMergeTab] = useState<'isbn' | 'title'>('isbn');
  const [importEmailsOpen, setImportEmailsOpen] = useState(false);

  const deleteAll = useDeleteAllBooks();
  const deleteBook = useDeleteBook();
  const deleteBooks = useDeleteBooks();
  const exportCatalog = useExportCatalog();

  const { data: authors = [] } = useAuthors();

  const filters: BookFilters = useMemo(() => ({
    search: debouncedSearch,
    status: statusFilter,
    author: authorFilter,
    missingIsbn,
    missingEmail,
    page,
    pageSize,
    sortColumn,
    sortDirection,
  }), [debouncedSearch, statusFilter, authorFilter, missingIsbn, missingEmail, page, pageSize, sortColumn, sortDirection]);

  const { data, isLoading } = useBooks(filters);
  const books = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleSort = useCallback((col: string) => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
    setPage(0);
  }, [sortColumn]);

  const openEdit = (book: Book) => {
    setEditingBook(book);
    setFormOpen(true);
  };

  const openNew = () => {
    setEditingBook(null);
    setFormOpen(true);
  };

  const statusBadgeVariant = (status: string) => {
    if (status === 'active') return 'default' as const;
    if (status === 'inactive') return 'secondary' as const;
    return 'outline' as const;
  };

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => handleSort(col)}>
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </span>
    </TableHead>
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Catálogo de Libros</h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button variant="destructive" size="sm" onClick={() => setDeleteBulkOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar ({selectedIds.size})
              </Button>
              {selectedIds.size === 2 && (
                <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
                  <Merge className="mr-2 h-4 w-4" /> Fusionar
                </Button>
              )}
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => exportCatalog.mutate()} disabled={exportCatalog.isPending}>
            <Download className="mr-2 h-4 w-4" /> {exportCatalog.isPending ? 'Exportando…' : 'Exportar'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
            <Merge className="mr-2 h-4 w-4" /> Fusionar
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setAutoMergeTab('isbn'); setAutoMergeOpen(true); }}>
            <Merge className="mr-2 h-4 w-4" /> Auto-fusionar ISBN
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setAutoMergeTab('title'); setAutoMergeOpen(true); }}>
            <Merge className="mr-2 h-4 w-4" /> Buscar duplicados título
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportEmailsOpen(true)}>
            <Mail className="mr-2 h-4 w-4" /> Importar emails
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteAllOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Eliminar todo
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo libro
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Buscar por título, autor o ISBN…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(0); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
            <SelectItem value="out_of_print">Fuera de impresión</SelectItem>
          </SelectContent>
        </Select>
        <Select value={authorFilter} onValueChange={(v) => { setAuthorFilter(v === 'all' ? '' : v); setPage(0); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Autor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {authors.filter(Boolean).map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={missingIsbn ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setMissingIsbn(v => !v); setPage(0); }}
          className="whitespace-nowrap"
        >
          Sin ISBN
        </Button>
        <Button
          variant={missingEmail ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setMissingEmail(v => !v); setPage(0); }}
          className="whitespace-nowrap"
        >
          Sin email
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={books.length > 0 && books.every(b => selectedIds.has(b.id))}
                  onCheckedChange={(checked) => {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      books.forEach(b => checked ? next.add(b.id) : next.delete(b.id));
                      return next;
                    });
                  }}
                />
              </TableHead>
              <SortHeader col="title" label="Título" />
              <SortHeader col="author" label="Autor" />
              <TableHead>ISBN</TableHead>
              <SortHeader col="pvp" label="PVP" />
              <SortHeader col="publication_date" label="Fecha pub." />
              <TableHead>Estado</TableHead>
              <TableHead>Ref. Maidhisa</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : books.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No se encontraron libros
                    </TableCell>
                  </TableRow>
                )
              : books.map((book) => (
                  <TableRow
                    key={book.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(book)}
                    data-state={selectedIds.has(book.id) ? 'selected' : undefined}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(book.id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            checked ? next.add(book.id) : next.delete(book.id);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium max-w-[250px] truncate">{book.title}</TableCell>
                    <TableCell>{book.author}</TableCell>
                    <TableCell className="text-xs">{book.isbn ?? '—'}</TableCell>
                    <TableCell>{formatCurrency(book.pvp)}</TableCell>
                    <TableCell>{formatDate(book.publication_date)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(book.status)}>
                        {STATUS_LABELS[book.status] ?? book.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{book.maidhisa_ref ?? '—'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteBookId(book.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {totalCount} libros · Página {page + 1} de {Math.max(totalPages, 1)}
          </span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="w-[130px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(n => (
                <SelectItem key={n} value={String(n)}>{n} por página</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {totalPages > 1 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Siguiente
            </Button>
          </div>
        )}
      </div>

      <BookFormDialog open={formOpen} onOpenChange={setFormOpen} book={editingBook} />
      <ImportBooksDialog open={importOpen} onOpenChange={setImportOpen} />
      <MergeBookDialog open={mergeOpen} onOpenChange={(v) => { setMergeOpen(v); if (!v) setSelectedIds(new Set()); }} preselectedIds={[...selectedIds]} />
      <AutoMergeDialog open={autoMergeOpen} onOpenChange={setAutoMergeOpen} />
      <ImportEmailsDialog open={importEmailsOpen} onOpenChange={setImportEmailsOpen} />

      <AlertDialog open={!!deleteBookId} onOpenChange={(v) => { if (!v) setDeleteBookId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este libro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el libro del catálogo. Si tiene ventas asociadas, no podrá eliminarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteBookId) deleteBook.mutate(deleteBookId); setDeleteBookId(null); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todo el catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará todos los libros del catálogo. Los libros con movimientos de ventas asociados no podrán ser eliminados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAll.mutate()}
              disabled={deleteAll.isPending}
            >
              {deleteAll.isPending ? 'Eliminando…' : 'Eliminar todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteBulkOpen} onOpenChange={setDeleteBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} libro(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán los libros seleccionados. Los que tengan ventas asociadas no podrán eliminarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteBooks.mutate([...selectedIds], { onSuccess: () => setSelectedIds(new Set()) });
                setDeleteBulkOpen(false);
              }}
              disabled={deleteBooks.isPending}
            >
              {deleteBooks.isPending ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
