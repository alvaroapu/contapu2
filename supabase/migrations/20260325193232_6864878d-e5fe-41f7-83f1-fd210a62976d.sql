
CREATE OR REPLACE FUNCTION get_sales_page(
  p_year int,
  p_month int DEFAULT NULL,
  p_search text DEFAULT '',
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  book_id uuid,
  book_title text,
  distributor_id uuid,
  distributor_name text,
  distributor_code text,
  envios bigint,
  ventas bigint,
  devoluciones bigint,
  inventario bigint,
  total_books bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    WHERE p_search = '' OR b.title ILIKE '%' || p_search || '%'
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
$$;

CREATE OR REPLACE FUNCTION match_book_by_normalized_title(p_title text)
RETURNS TABLE(id uuid, title text, maidhisa_ref text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  norm text;
  found_count int;
BEGIN
  norm := normalize_text(p_title);
  RETURN QUERY
  SELECT b.id, b.title, b.maidhisa_ref
  FROM books b
  WHERE normalize_text(b.title) = norm;
  GET DIAGNOSTICS found_count = ROW_COUNT;
  IF found_count > 0 THEN RETURN; END IF;
  RETURN QUERY
  SELECT b.id, b.title, b.maidhisa_ref
  FROM books b
  WHERE normalize_text(b.title) ILIKE '%' || norm || '%'
     OR norm ILIKE '%' || normalize_text(b.title) || '%'
  LIMIT 5;
END;
$$;
