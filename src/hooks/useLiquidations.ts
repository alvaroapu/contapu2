import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Liquidation {
  id: string;
  year: number;
  status: string;
  distributor_royalty_pct: number;
  online_royalty_pct: number;
  school_royalty_pct: number;
  created_at: string;
  finalized_at: string | null;
}

export interface LiquidationItem {
  item_id: string;
  book_id: string;
  book_title: string;
  author: string;
  publication_date: string | null;
  pvp: number;
  distributor_units: number;
  online_units: number;
  school_units: number;
  distributor_amount: number;
  online_amount: number;
  school_amount: number;
  total_amount: number;
  total_authors: number;
}

export function useLiquidationsList() {
  return useQuery({
    queryKey: ['liquidations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('liquidations')
        .select('*')
        .order('year', { ascending: false });
      if (error) throw error;
      return data as Liquidation[];
    },
  });
}

export function useLiquidation(id: string) {
  return useQuery({
    queryKey: ['liquidation', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('liquidations')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Liquidation;
    },
    enabled: !!id,
  });
}

export function useLiquidationItems(
  liquidationId: string,
  search: string,
  authorFilter: string,
  onlyWithSales: boolean,
  page: number
) {
  return useQuery({
    queryKey: ['liquidation-items', liquidationId, search, authorFilter, onlyWithSales, page],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_liquidation_items_page', {
        p_liquidation_id: liquidationId,
        p_search: search,
        p_author_filter: authorFilter,
        p_only_with_sales: onlyWithSales,
        p_limit: 20,
        p_offset: page * 20,
      });
      if (error) throw error;
      return (data ?? []) as LiquidationItem[];
    },
    enabled: !!liquidationId,
  });
}

export function useLiquidationTotals(liquidationId: string) {
  return useQuery({
    queryKey: ['liquidation-totals', liquidationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_liquidation_totals', {
        p_liquidation_id: liquidationId,
      });
      if (error) throw error;
      const row = data?.[0];
      return {
        authors: Number(row?.total_authors ?? 0),
        books: Number(row?.total_books ?? 0),
        units: Number(row?.total_units ?? 0),
        totalPositive: Number(row?.total_positive_amount ?? 0),
        totalAll: Number(row?.total_all_amount ?? 0),
      };
    },
    enabled: !!liquidationId,
  });
}

export function useLiquidationAuthors(liquidationId: string) {
  return useQuery({
    queryKey: ['liquidation-authors', liquidationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('liquidation_items')
        .select('book_id, books!inner(author)')
        .eq('liquidation_id', liquidationId) as any;
      if (error) throw error;
      const authors = [...new Set((data ?? []).map((d: any) => d.books.author as string))].sort();
      return authors;
    },
    enabled: !!liquidationId,
  });
}

export function useCreateLiquidation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      year: number;
      distributor_royalty_pct: number;
      online_royalty_pct: number;
      school_royalty_pct: number;
    }) => {
      // Create liquidation record
      const { data: liq, error: liqErr } = await supabase
        .from('liquidations')
        .insert({
          year: params.year,
          distributor_royalty_pct: params.distributor_royalty_pct,
          online_royalty_pct: params.online_royalty_pct,
          school_royalty_pct: params.school_royalty_pct,
        })
        .select()
        .single();
      if (liqErr) throw liqErr;

      await calculateLiquidationItems(liq.id, params);
      return liq;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liquidations'] });
      toast.success('Liquidación creada correctamente');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al crear liquidación'),
  });
}

export async function calculateLiquidationItems(
  liquidationId: string,
  params: { year: number; distributor_royalty_pct: number; online_royalty_pct: number; school_royalty_pct: number }
) {
  // Delete existing items
  await supabase.from('liquidation_items').delete().eq('liquidation_id', liquidationId);

  // Fetch all sales/returns for the year
  let allMovements: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('sales_movements')
      .select('book_id, distributor_id, type, quantity, distributors!inner(code)')
      .eq('year', params.year)
      .in('type', ['venta', 'devolucion'])
      .range(from, from + 999) as any;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allMovements.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // Group by book
  const bookMap = new Map<string, { dist: number; online: number; school: number }>();
  for (const m of allMovements) {
    const code = m.distributors.code;
    const qty = m.type === 'venta' ? m.quantity : -m.quantity;
    const entry = bookMap.get(m.book_id) ?? { dist: 0, online: 0, school: 0 };
    if (code === 'maidhisa' || code === 'azeta') entry.dist += qty;
    else if (code === 'almacen' || code === 'online') entry.online += qty;
    else if (code === 'colegios') entry.school += qty;
    bookMap.set(m.book_id, entry);
  }

  // Fetch ALL active books to include those with 0 sales
  const pvpMap = new Map<string, number>();
  let allBooksFrom = 0;
  while (true) {
    const { data, error } = await supabase
      .from('books')
      .select('id, pvp')
      .eq('status', 'active')
      .range(allBooksFrom, allBooksFrom + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const b of data) {
      pvpMap.set(b.id, Number(b.pvp));
      if (!bookMap.has(b.id)) {
        bookMap.set(b.id, { dist: 0, online: 0, school: 0 });
      }
    }
    if (data.length < 1000) break;
    allBooksFrom += 1000;
  }

  if (bookMap.size === 0) return;

  // Build items
  const items: any[] = [];
  for (const [bookId, units] of bookMap) {
    // Include all books, even with 0 sales
    const pvp = pvpMap.get(bookId) ?? 0;
    const dAmt = units.dist * pvp * (params.distributor_royalty_pct / 100);
    const oAmt = units.online * pvp * (params.online_royalty_pct / 100);
    const sAmt = units.school * pvp * (params.school_royalty_pct / 100);
    items.push({
      liquidation_id: liquidationId,
      book_id: bookId,
      distributor_units: units.dist,
      online_units: units.online,
      school_units: units.school,
      distributor_amount: Math.round(dAmt * 100) / 100,
      online_amount: Math.round(oAmt * 100) / 100,
      school_amount: Math.round(sAmt * 100) / 100,
      total_amount: Math.round((dAmt + oAmt + sAmt) * 100) / 100,
    });
  }

  // Insert in batches
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50);
    const { error } = await supabase.from('liquidation_items').insert(batch);
    if (error) throw error;
  }
}

export function useFinalizeLiquidation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('liquidations')
        .update({ status: 'finalized', finalized_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liquidations'] });
      qc.invalidateQueries({ queryKey: ['liquidation'] });
      toast.success('Liquidación finalizada');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteLiquidation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('liquidation_items').delete().eq('liquidation_id', id);
      const { error } = await supabase.from('liquidations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liquidations'] });
      toast.success('Liquidación eliminada');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateLiquidationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      itemId: string;
      field: 'distributor_units' | 'online_units' | 'school_units';
      value: number;
      pvp: number;
      currentItem: LiquidationItem;
      liquidation: Liquidation;
    }) => {
      const units = {
        distributor_units: p.field === 'distributor_units' ? p.value : p.currentItem.distributor_units,
        online_units: p.field === 'online_units' ? p.value : p.currentItem.online_units,
        school_units: p.field === 'school_units' ? p.value : p.currentItem.school_units,
      };
      const dAmt = units.distributor_units * p.pvp * (p.liquidation.distributor_royalty_pct / 100);
      const oAmt = units.online_units * p.pvp * (p.liquidation.online_royalty_pct / 100);
      const sAmt = units.school_units * p.pvp * (p.liquidation.school_royalty_pct / 100);
      const { error } = await supabase
        .from('liquidation_items')
        .update({
          [p.field]: p.value,
          distributor_amount: Math.round(dAmt * 100) / 100,
          online_amount: Math.round(oAmt * 100) / 100,
          school_amount: Math.round(sAmt * 100) / 100,
          total_amount: Math.round((dAmt + oAmt + sAmt) * 100) / 100,
        } as any)
        .eq('id', p.itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liquidation-items'] });
      toast.success('Actualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
