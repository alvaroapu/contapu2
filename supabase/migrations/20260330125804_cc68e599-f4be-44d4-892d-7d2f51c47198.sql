
CREATE OR REPLACE FUNCTION public.get_liquidation_totals(p_liquidation_id uuid)
RETURNS TABLE(total_authors bigint, total_books bigint, total_units bigint, total_positive_amount numeric, total_all_amount numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT b.author)::bigint,
    COUNT(DISTINCT li.book_id)::bigint,
    COALESCE(SUM(COALESCE(li.distributor_units,0) + COALESCE(li.online_units,0) + COALESCE(li.school_units,0)), 0)::bigint,
    COALESCE(SUM(CASE WHEN COALESCE(li.total_amount,0) > 0 THEN li.total_amount ELSE 0 END), 0)::numeric,
    COALESCE(SUM(COALESCE(li.total_amount,0)), 0)::numeric
  FROM liquidation_items li
  JOIN books b ON b.id = li.book_id
  WHERE li.liquidation_id = p_liquidation_id;
END;
$$;
