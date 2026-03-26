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
import { formatCurrency, formatDate, STATUS_LABELS } from '@/lib/format';
import { Plus, Upload, ArrowUpDown, Download, Trash2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useDeleteAllBooks, useExportCatalog } from '@/hooks/useBooks';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PAGE_SIZE = 20;

export default function Catalogo() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [missingIsbn, setMissingIsbn] = useState(false);
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState('title');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);

  const deleteAll = useDeleteAllBooks();
  const exportCatalog = useExportCatalog();

  const { data: authors = [] } = useAuthors();

  const filters: BookFilters = useMemo(() => ({
    search: debouncedSearch,
    status: statusFilter,
    author: authorFilter,
    missingIsbn,
    page,
    pageSize: PAGE_SIZE,
    sortColumn,
    sortDirection,
  }), [debouncedSearch, statusFilter, authorFilter, missingIsbn, page, sortColumn, sortDirection]);

  const { data, isLoading } = useBooks(filters);
  const books = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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
          <Button variant="outline" size="sm" onClick={() => exportCatalog.mutate()} disabled={exportCatalog.isPending}>
            <Download className="mr-2 h-4 w-4" /> {exportCatalog.isPending ? 'Exportando…' : 'Exportar'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar
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
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader col="title" label="Título" />
              <SortHeader col="author" label="Autor" />
              <TableHead>ISBN</TableHead>
              <SortHeader col="pvp" label="PVP" />
              <SortHeader col="publication_date" label="Fecha pub." />
              <TableHead>Estado</TableHead>
              <TableHead>Ref. Maidhisa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : books.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No se encontraron libros
                    </TableCell>
                  </TableRow>
                )
              : books.map((book) => (
                  <TableRow
                    key={book.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(book)}
                  >
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
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {totalCount} libros · Página {page + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <BookFormDialog open={formOpen} onOpenChange={setFormOpen} book={editingBook} />
      <ImportBooksDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
