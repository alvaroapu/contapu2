import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  created_at: string;
  updated_at: string;
}

export interface BookFilters {
  search: string;
  status: string;
  author: string;
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
      let query = supabase.from('books').select('*', { count: 'exact' });

      if (filters.search) {
        const s = `%${filters.search}%`;
        query = query.or(`title.ilike.${s},author.ilike.${s},isbn.ilike.${s}`);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.author) {
        query = query.eq('author', filters.author);
      }

      const from = filters.page * filters.pageSize;
      const to = from + filters.pageSize - 1;

      query = query
        .order(filters.sortColumn, { ascending: filters.sortDirection === 'asc' })
        .range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as Book[], count: count ?? 0 };
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
      const unique = [...new Set((data ?? []).map((d: { author: string }) => d.author))];
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
    mutationFn: async (books: Partial<Book>[]) => {
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
      const { error } = await supabase.from('books').upsert(unique as any, {
        onConflict: 'isbn',
        ignoreDuplicates: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['authors'] });
    },
  });
}
