import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Distributor {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export function useDistributors() {
  return useQuery({
    queryKey: ['distributors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('distributors').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as unknown as Distributor[];
    },
  });
}
