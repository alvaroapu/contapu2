import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SalesRow {
  book_id: string;
  book_title: string;
  distributor_id: string;
  distributor_name: string;
  distributor_code: string;
  envios: number;
  ventas: number;
  devoluciones: number;
  inventario: number;
  total_books: number;
}

export function useSalesPage(year: number, month: number | null, search: string, page: number) {
  return useQuery({
    queryKey: ['sales', year, month, search, page],
    queryFn: async () => {
      const params: any = { p_year: year, p_search: search, p_limit: 25, p_offset: page * 25 };
      if (month !== null) params.p_month = month;
      const { data, error } = await (supabase as any).rpc('get_sales_page', params);
      if (error) throw error;
      return (data ?? []) as SalesRow[];
    },
  });
}

export function useSaveMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      bookId: string; distributorId: string;
      year: number; month: number;
      type: 'envio' | 'venta' | 'devolucion';
      newTotal: number;
    }) => {
      const { data: imported } = await supabase
        .from('sales_movements')
        .select('quantity')
        .eq('book_id', p.bookId)
        .eq('distributor_id', p.distributorId)
        .eq('year', p.year)
        .eq('month', p.month)
        .eq('type', p.type)
        .not('import_batch_id', 'is', null) as any;

      const importedSum = (imported ?? []).reduce((s: number, r: any) => s + r.quantity, 0);
      const manualNeeded = p.newTotal - importedSum;

      const { data: existing } = await supabase
        .from('sales_movements')
        .select('id')
        .eq('book_id', p.bookId)
        .eq('distributor_id', p.distributorId)
        .eq('year', p.year)
        .eq('month', p.month)
        .eq('type', p.type)
        .is('import_batch_id', null)
        .maybeSingle() as any;

      if (manualNeeded <= 0) {
        if (existing) {
          await supabase.from('sales_movements').delete().eq('id', existing.id);
        }
        if (p.newTotal < importedSum) {
          throw new Error('No se puede reducir por debajo de los datos importados');
        }
      } else if (existing) {
        await supabase.from('sales_movements').update({ quantity: manualNeeded } as any).eq('id', existing.id);
      } else {
        await supabase.from('sales_movements').insert({
          book_id: p.bookId, distributor_id: p.distributorId,
          year: p.year, month: p.month, type: p.type, quantity: manualNeeded,
        } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Movimiento guardado');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al guardar'),
  });
}

export function useAllMovements(year: number) {
  return useQuery({
    queryKey: ['all-movements', year],
    queryFn: async () => {
      let all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('sales_movements')
          .select('id, book_id, distributor_id, month, type, quantity, notes, import_batch_id, created_at, books!inner(title), distributors!inner(name)')
          .eq('year', year)
          .order('created_at', { ascending: false })
          .range(from, from + 999) as any;
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      return all;
    },
  });
}

export function useUpdateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; quantity: number; notes?: string | null }) => {
      const { error } = await supabase
        .from('sales_movements')
        .update({ quantity: p.quantity, notes: p.notes ?? null } as any)
        .eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['all-movements'] });
      toast.success('Movimiento actualizado');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al actualizar'),
  });
}

export function useDeleteMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sales_movements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['manual-movements'] });
      toast.success('Movimiento eliminado');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al eliminar'),
  });
}

export async function fetchAllSalesForYear(year: number) {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sales_movements')
      .select('book_id, distributor_id, month, type, quantity, books!inner(title), distributors!inner(name, code)')
      .eq('year', year)
      .range(from, from + 999) as any;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}
