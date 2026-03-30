
CREATE OR REPLACE FUNCTION public.get_monthly_sales_summary(p_year integer)
 RETURNS TABLE(month integer, distributor_sales bigint, online_sales bigint, school_sales bigint, distributor_returns bigint, online_returns bigint, school_returns bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    sm.month,
    COALESCE(SUM(CASE WHEN sm.type='venta' AND d.code IN ('maidhisa','azeta') THEN sm.quantity ELSE 0 END),0)::bigint,
    COALESCE(SUM(CASE WHEN sm.type='venta' AND d.code IN ('almacen','online') THEN sm.quantity ELSE 0 END),0)::bigint,
    COALESCE(SUM(CASE WHEN sm.type='venta' AND d.code='colegios' THEN sm.quantity ELSE 0 END),0)::bigint,
    COALESCE(SUM(CASE WHEN sm.type='devolucion' AND d.code IN ('maidhisa','azeta') THEN sm.quantity ELSE 0 END),0)::bigint,
    COALESCE(SUM(CASE WHEN sm.type='devolucion' AND d.code IN ('almacen','online') THEN sm.quantity ELSE 0 END),0)::bigint,
    COALESCE(SUM(CASE WHEN sm.type='devolucion' AND d.code='colegios' THEN sm.quantity ELSE 0 END),0)::bigint
  FROM sales_movements sm
  JOIN distributors d ON d.id = sm.distributor_id
  WHERE sm.year = p_year
  GROUP BY sm.month
  ORDER BY sm.month;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_top_books(p_year integer, p_limit integer DEFAULT 10)
 RETURNS TABLE(book_id uuid, title text, author text, total_sales bigint, total_returns bigint, net_sales bigint, main_channel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH book_stats AS (
    SELECT
      b.id, b.title, b.author,
      COALESCE(SUM(CASE WHEN sm.type='venta' THEN sm.quantity ELSE 0 END),0)::bigint AS ts,
      COALESCE(SUM(CASE WHEN sm.type='devolucion' THEN sm.quantity ELSE 0 END),0)::bigint AS tr,
      COALESCE(SUM(CASE WHEN sm.type='venta' AND d.code IN ('maidhisa','azeta') THEN sm.quantity ELSE 0 END),0)::bigint AS dist_s,
      COALESCE(SUM(CASE WHEN sm.type='venta' AND d.code IN ('almacen','online') THEN sm.quantity ELSE 0 END),0)::bigint AS online_s,
      COALESCE(SUM(CASE WHEN sm.type='venta' AND d.code='colegios' THEN sm.quantity ELSE 0 END),0)::bigint AS school_s
    FROM sales_movements sm
    JOIN books b ON b.id = sm.book_id
    JOIN distributors d ON d.id = sm.distributor_id
    WHERE sm.year = p_year
    GROUP BY b.id, b.title, b.author
    HAVING COALESCE(SUM(CASE WHEN sm.type='venta' THEN sm.quantity ELSE 0 END),0)
         - COALESCE(SUM(CASE WHEN sm.type='devolucion' THEN sm.quantity ELSE 0 END),0) > 0
  )
  SELECT bs.id, bs.title, bs.author, bs.ts, bs.tr, (bs.ts - bs.tr)::bigint,
    CASE GREATEST(bs.dist_s, bs.online_s, bs.school_s)
      WHEN bs.dist_s THEN 'Distribuidoras'
      WHEN bs.online_s THEN 'Online'
      ELSE 'Colegios'
    END
  FROM book_stats bs
  ORDER BY (bs.ts - bs.tr) DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_top_authors(p_year integer, p_limit integer DEFAULT 5)
 RETURNS TABLE(author text, num_books bigint, total_units bigint, estimated_royalties numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    b.author,
    COUNT(DISTINCT b.id)::bigint,
    COALESCE(SUM(CASE WHEN sm.type='venta' THEN sm.quantity ELSE 0 END)
           - SUM(CASE WHEN sm.type='devolucion' THEN sm.quantity ELSE 0 END),0)::bigint,
    COALESCE(SUM(
      CASE WHEN sm.type='venta' THEN sm.quantity
           WHEN sm.type='devolucion' THEN -sm.quantity ELSE 0 END
      * b.pvp *
      CASE WHEN d.code IN ('maidhisa','azeta') THEN 0.10
           WHEN d.code IN ('almacen','online') THEN 0.25
           WHEN d.code='colegios' THEN 0.30 ELSE 0.10 END
    ),0)::numeric
  FROM sales_movements sm
  JOIN books b ON b.id = sm.book_id
  JOIN distributors d ON d.id = sm.distributor_id
  WHERE sm.year = p_year
  GROUP BY b.author
  HAVING COALESCE(SUM(CASE WHEN sm.type='venta' THEN sm.quantity ELSE 0 END)
               - SUM(CASE WHEN sm.type='devolucion' THEN sm.quantity ELSE 0 END),0) > 0
  ORDER BY total_units DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_year integer)
 RETURNS TABLE(active_books bigint, books_with_sales bigint, total_units_sold bigint, estimated_royalties numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT count(*) FROM books WHERE status='active')::bigint,
    (SELECT count(DISTINCT sm2.book_id) FROM sales_movements sm2 WHERE sm2.type='venta' AND sm2.year=p_year)::bigint,
    COALESCE((SELECT SUM(sm3.quantity) FROM sales_movements sm3 WHERE sm3.type='venta' AND sm3.year=p_year),0)::bigint,
    COALESCE((
      SELECT SUM(
        CASE WHEN sm4.type='venta' THEN sm4.quantity
             WHEN sm4.type='devolucion' THEN -sm4.quantity ELSE 0 END
        * b.pvp *
        CASE WHEN d.code IN ('maidhisa','azeta') THEN 0.10
             WHEN d.code IN ('almacen','online') THEN 0.25
             WHEN d.code='colegios' THEN 0.30 ELSE 0.10 END
      )
      FROM sales_movements sm4
      JOIN books b ON b.id = sm4.book_id
      JOIN distributors d ON d.id = sm4.distributor_id
      WHERE sm4.year = p_year
    ),0)::numeric;
END;
$function$;
