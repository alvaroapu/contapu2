import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export interface Book {
  id: string;
  isbn: string | null;
  ean: string | null;
  title: string;
  author: string;
  pvp: number;
  publication_date: string | null;
  status: string;
  maidhisa_ref: string | null;
  author_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookFilters {
  search: string;
  status: string;
  author: string;
  missingIsbn?: boolean;
  missingEmail?: boolean;
  page: number;
  pageSize: number;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
}

const PAGE_SIZE = 20;

export function useBooks(filters: BookFilters) {
  return useQuery({
    queryKey: ['books', filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_books_page', {
        p_search: filters.search || '',
        p_status: filters.status || '',
        p_author: filters.author || '',
        p_missing_isbn: filters.missingIsbn ?? false,
        p_missing_email: filters.missingEmail ?? false,
        p_sort_column: filters.sortColumn || 'title',
        p_sort_direction: filters.sortDirection || 'asc',
        p_offset: filters.page * filters.pageSize,
        p_limit: filters.pageSize,
      });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const count = rows.length > 0 ? Number(rows[0].total_count) : 0;
      const books: Book[] = rows.map(r => ({
        id: r.id,
        isbn: r.isbn,
        ean: r.ean,
        title: r.title,
        author: r.author,
        pvp: Number(r.pvp),
        publication_date: r.publication_date,
        status: r.status,
        maidhisa_ref: r.maidhisa_ref,
        author_email: r.author_email,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      return { data: books, count };
    },
  });
}

export function useAuthors() {
  return useQuery({
    queryKey: ['authors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('author')
        .order('author');
      if (error) throw error;
      const unique = [...new Set(
        (data ?? [])
          .map((d: { author: string | null }) => d.author?.trim())
          .filter((author): author is string => Boolean(author))
      )];
      return unique;
    },
  });
}

export function useSaveBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (book: Partial<Book> & { id?: string }) => {
      if (book.id) {
        const { error } = await supabase
          .from('books')
          .update({ ...book, updated_at: new Date().toISOString() })
          .eq('id', book.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('books').insert(book as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['authors'] });
      toast.success('Libro guardado');
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Error al guardar');
    },
  });
}

export function useBulkInsertBooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (books: Partial<Book>[]): Promise<string[]> => {
      // Deduplicate by ISBN – keep last occurrence
      const seen = new Map<string, Partial<Book>>();
      const noIsbn: Partial<Book>[] = [];
      for (const b of books) {
        if (b.isbn) {
          seen.set(b.isbn, b);
        } else {
          noIsbn.push(b);
        }
      }
      const unique = [...seen.values(), ...noIsbn];
      const { data, error } = await supabase.from('books').upsert(unique as any, {
        onConflict: 'isbn',
        ignoreDuplicates: false,
      }).select('id');
      if (error) throw error;
      return (data ?? []).map((r: { id: string }) => r.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['authors'] });
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookId: string) => {
      const { error } = await supabase.from('books').delete().eq('id', bookId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['authors'] });
      toast.success('Libro eliminado');
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Error al eliminar. Puede que tenga ventas asociadas.');
    },
  });
}

export function useDeleteBooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookIds: string[]) => {
      const { error } = await supabase.from('books').delete().in('id', bookIds);
      if (error) throw error;
    },
    onSuccess: (_data, bookIds) => {
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['authors'] });
      toast.success(`${bookIds.length} libro(s) eliminado(s)`);
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Error al eliminar. Algunos libros pueden tener ventas asociadas.');
    },
  });
}

export function useDeleteAllBooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Delete dependent records first
      const { error: e1 } = await supabase.from('sales_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('liquidation_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('import_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e3) throw e3;
      const { error } = await supabase.from('books').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['authors'] });
      toast.success('Catálogo eliminado');
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Error al eliminar. Puede que haya libros con ventas asociadas.');
    },
  });
}

export function useExportCatalog() {
  return useMutation({
    mutationFn: async () => {
      const allBooks: Book[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('books')
          .select('*')
          .order('title')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allBooks.push(...(data as Book[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      const rows = allBooks.map(b => ({
        Título: b.title,
        Autor: b.author,
        ISBN: b.isbn ?? '',
        EAN: b.ean ?? '',
        PVP: b.pvp,
        'Fecha publicación': b.publication_date ?? '',
        Estado: b.status,
        'Ref. Maidhisa': b.maidhisa_ref ?? '',
        'Email autor': b.author_email ?? '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 40 }, { wch: 25 }, { wch: 16 }, { wch: 16 },
        { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Catálogo');
      XLSX.writeFile(wb, 'Catalogo_Libros.xlsx');
    },
    onSuccess: () => toast.success('Excel exportado'),
    onError: (err: any) => toast.error(err.message ?? 'Error al exportar'),
  });
}

export function useExportAuthorsWithoutEmail() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        query_text: `
          SELECT b.author,
                 string_agg(DISTINCT b.title, ' | ' ORDER BY b.title) as libros,
                 count(DISTINCT b.id) as num_libros,
                 ROUND(SUM(COALESCE(li.total_amount,0)),2) as total_liquidacion
          FROM books b
          JOIN liquidation_items li ON li.book_id = b.id
          WHERE (b.author_email IS NULL OR b.author_email = '')
            AND b.status = 'active'
            AND COALESCE(li.total_amount, 0) > 0
          GROUP BY b.author
          ORDER BY b.author
        `,
      });
      if (error) throw error;
      const rows = (data as any[]).map((r: any) => ({
        Autor: r.author,
        Libros: r.libros,
        'Nº Libros': Number(r.num_libros),
        'Total liquidación (€)': Number(r.total_liquidacion),
      }));
      if (rows.length === 0) throw new Error('No hay autores sin email con liquidación positiva');

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 12 }, { wch: 22 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Autores sin email');
      XLSX.writeFile(wb, 'Autores_sin_email_con_liquidacion.xlsx');
    },
    onSuccess: () => toast.success('Excel exportado'),
    onError: (err: any) => toast.error(err.message ?? 'Error al exportar'),
  });
}
