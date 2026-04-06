
CREATE OR REPLACE FUNCTION public.get_sales_page(p_year integer, p_month integer DEFAULT NULL::integer, p_search text DEFAULT ''::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(book_id uuid, book_title text, distributor_id uuid, distributor_name text, distributor_code text, envios bigint, ventas bigint, devoluciones bigint, inventario bigint, total_books bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH book_list AS (
    SELECT DISTINCT sm.book_id AS bid
    FROM sales_movements sm
    WHERE sm.year = p_year
  ),
  filtered AS (
    SELECT bl.bid, b.title AS btitle
    FROM book_list bl
    JOIN books b ON b.id = bl.bid
    WHERE p_search = '' OR normalize_text(b.title) ILIKE '%' || normalize_text(p_search) || '%'
    ORDER BY b.title
  ),
  paged AS (
    SELECT f.bid, f.btitle, count(*) OVER() AS cnt
    FROM filtered f
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    p.bid AS book_id,
    p.btitle AS book_title,
    d.id AS distributor_id,
    d.name AS distributor_name,
    d.code AS distributor_code,
    coalesce(sum(CASE WHEN sm.type = 'envio' THEN sm.quantity ELSE 0 END), 0)::bigint AS envios,
    coalesce(sum(CASE WHEN sm.type = 'venta' THEN sm.quantity ELSE 0 END), 0)::bigint AS ventas,
    coalesce(sum(CASE WHEN sm.type = 'devolucion' THEN sm.quantity ELSE 0 END), 0)::bigint AS devoluciones,
    (coalesce(sum(CASE WHEN sm.type = 'envio' THEN sm.quantity ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN sm.type = 'venta' THEN sm.quantity ELSE 0 END), 0)
     + coalesce(sum(CASE WHEN sm.type = 'devolucion' THEN sm.quantity ELSE 0 END), 0))::bigint AS inventario,
    p.cnt AS total_books
  FROM paged p
  CROSS JOIN distributors d
  LEFT JOIN sales_movements sm
    ON sm.book_id = p.bid
    AND sm.distributor_id = d.id
    AND sm.year = p_year
    AND (p_month IS NULL OR sm.month = p_month)
  WHERE d.is_active = true
  GROUP BY p.bid, p.btitle, d.id, d.name, d.code, p.cnt
  ORDER BY p.btitle, d.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_liquidation_items_page(p_liquidation_id uuid, p_search text DEFAULT ''::text, p_author_filter text DEFAULT ''::text, p_only_with_sales boolean DEFAULT true, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(item_id uuid, book_id uuid, book_title text, author text, publication_date date, pvp numeric, distributor_units integer, online_units integer, school_units integer, distributor_amount numeric, online_amount numeric, school_amount numeric, total_amount numeric, total_authors bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH author_list AS (
    SELECT DISTINCT b.author AS a
    FROM liquidation_items li
    JOIN books b ON b.id = li.book_id
    WHERE li.liquidation_id = p_liquidation_id
      AND (NOT p_only_with_sales OR (COALESCE(li.distributor_units,0)+COALESCE(li.online_units,0)+COALESCE(li.school_units,0)) <> 0)
      AND (p_search = '' OR normalize_text(b.title) ILIKE '%'||normalize_text(p_search)||'%' OR normalize_text(b.author) ILIKE '%'||normalize_text(p_search)||'%')
      AND (p_author_filter = '' OR b.author = p_author_filter)
    ORDER BY a
  ),
  paged_authors AS (
    SELECT al.a, count(*) OVER() AS cnt FROM author_list al
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    li.id, b.id, b.title, b.author, b.publication_date, b.pvp,
    COALESCE(li.distributor_units,0), COALESCE(li.online_units,0), COALESCE(li.school_units,0),
    COALESCE(li.distributor_amount,0), COALESCE(li.online_amount,0), COALESCE(li.school_amount,0),
    COALESCE(li.total_amount,0),
    pa.cnt
  FROM paged_authors pa
  JOIN liquidation_items li ON li.liquidation_id = p_liquidation_id
  JOIN books b ON b.id = li.book_id AND b.author = pa.a
  WHERE (NOT p_only_with_sales OR (COALESCE(li.distributor_units,0)+COALESCE(li.online_units,0)+COALESCE(li.school_units,0)) <> 0)
    AND (p_search = '' OR normalize_text(b.title) ILIKE '%'||normalize_text(p_search)||'%' OR normalize_text(b.author) ILIKE '%'||normalize_text(p_search)||'%')
  ORDER BY b.author, b.title;
END;
$function$;
