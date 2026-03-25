import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDashboardSummary(year: number) {
  return useQuery({
    queryKey: ['dashboard-summary', year],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_dashboard_summary', { p_year: year });
      if (error) throw error;
      return (data?.[0] ?? { active_books: 0, books_with_sales: 0, total_units_sold: 0, estimated_royalties: 0 }) as {
        active_books: number; books_with_sales: number; total_units_sold: number; estimated_royalties: number;
      };
    },
  });
}

export function useMonthlySales(year: number) {
  return useQuery({
    queryKey: ['monthly-sales', year],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_monthly_sales_summary', { p_year: year });
      if (error) throw error;
      return (data ?? []) as {
        month: number; distributor_sales: number; online_sales: number; school_sales: number;
        distributor_returns: number; online_returns: number; school_returns: number;
      }[];
    },
  });
}

export function useTopBooks(year: number) {
  return useQuery({
    queryKey: ['top-books', year],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_top_books', { p_year: year, p_limit: 10 });
      if (error) throw error;
      return (data ?? []) as {
        book_id: string; title: string; author: string;
        total_sales: number; total_returns: number; net_sales: number; main_channel: string;
      }[];
    },
  });
}

export function useTopAuthors(year: number) {
  return useQuery({
    queryKey: ['top-authors', year],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_top_authors', { p_year: year, p_limit: 5 });
      if (error) throw error;
      return (data ?? []) as {
        author: string; num_books: number; total_units: number; estimated_royalties: number;
      }[];
    },
  });
}
