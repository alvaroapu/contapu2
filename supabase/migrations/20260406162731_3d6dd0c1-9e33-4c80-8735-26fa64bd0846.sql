
CREATE OR REPLACE FUNCTION public.get_liquidation_items_page(p_liquidation_id uuid, p_search text DEFAULT ''::text, p_author_filter text DEFAULT ''::text, p_only_with_sales boolean DEFAULT true, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort text DEFAULT 'author_asc'::text)
 RETURNS TABLE(item_id uuid, book_id uuid, book_title text, author text, publication_date date, pvp numeric, distributor_units integer, online_units integer, school_units integer, distributor_amount numeric, online_amount numeric, school_amount numeric, total_amount numeric, total_authors bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_items AS (
    SELECT li.id AS li_id, li.book_id AS li_book_id, b.title AS btitle, b.author AS bauthor,
           b.publication_date AS bpub, b.pvp AS bpvp,
           COALESCE(li.distributor_units,0) AS du, COALESCE(li.online_units,0) AS ou, COALESCE(li.school_units,0) AS su,
           COALESCE(li.distributor_amount,0) AS da, COALESCE(li.online_amount,0) AS oa, COALESCE(li.school_amount,0) AS sa,
           COALESCE(li.total_amount,0) AS ta
    FROM liquidation_items li
    JOIN books b ON b.id = li.book_id
    WHERE li.liquidation_id = p_liquidation_id
      AND (NOT p_only_with_sales OR (COALESCE(li.distributor_units,0)+COALESCE(li.online_units,0)+COALESCE(li.school_units,0)) <> 0)
      AND (p_search = '' OR normalize_text(b.title) ILIKE '%'||normalize_text(p_search)||'%' OR normalize_text(b.author) ILIKE '%'||normalize_text(p_search)||'%')
      AND (p_author_filter = '' OR b.author = p_author_filter)
  ),
  author_totals AS (
    SELECT fi.bauthor AS a, SUM(fi.ta) AS author_total
    FROM filtered_items fi
    GROUP BY fi.bauthor
  ),
  sorted_authors AS (
    SELECT at2.a, at2.author_total,
           count(*) OVER() AS cnt
    FROM author_totals at2
    ORDER BY
      CASE WHEN p_sort = 'amount_desc' THEN at2.author_total END DESC NULLS LAST,
      CASE WHEN p_sort = 'amount_asc' THEN at2.author_total END ASC NULLS LAST,
      CASE WHEN p_sort NOT IN ('amount_desc','amount_asc') THEN at2.a END ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    fi.li_id, fi.li_book_id, fi.btitle, fi.bauthor, fi.bpub, fi.bpvp,
    fi.du, fi.ou, fi.su, fi.da, fi.oa, fi.sa, fi.ta,
    sa2.cnt
  FROM sorted_authors sa2
  JOIN filtered_items fi ON fi.bauthor = sa2.a
  ORDER BY
    CASE WHEN p_sort = 'amount_desc' THEN sa2.author_total END DESC NULLS LAST,
    CASE WHEN p_sort = 'amount_asc' THEN sa2.author_total END ASC NULLS LAST,
    CASE WHEN p_sort NOT IN ('amount_desc','amount_asc') THEN sa2.a END ASC,
    fi.btitle;
END;
$function$;
