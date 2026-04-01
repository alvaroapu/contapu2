
CREATE OR REPLACE FUNCTION public.search_books_page(
  p_search text default '',
  p_status text default '',
  p_author text default '',
  p_missing_isbn boolean default false,
  p_missing_email boolean default false,
  p_sort_column text default 'title',
  p_sort_direction text default 'asc',
  p_offset int default 0,
  p_limit int default 20
)
RETURNS TABLE(
  id uuid,
  isbn text,
  ean text,
  title text,
  author text,
  pvp numeric,
  publication_date text,
  status text,
  maidhisa_ref text,
  author_email text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_norm text;
  v_stripped text;
BEGIN
  v_norm := normalize_text(p_search);
  -- Strip hyphens/spaces for ISBN matching
  v_stripped := regexp_replace(p_search, '[-\s]', '', 'g');

  RETURN QUERY
  SELECT
    b.id, b.isbn, b.ean, b.title, b.author, b.pvp,
    b.publication_date, b.status, b.maidhisa_ref, b.author_email,
    b.created_at, b.updated_at,
    count(*) OVER() AS total_count
  FROM books b
  WHERE
    (p_search = '' OR
      normalize_text(b.title) ILIKE '%' || v_norm || '%' OR
      normalize_text(b.author) ILIKE '%' || v_norm || '%' OR
      replace(replace(coalesce(b.isbn,''), '-', ''), ' ', '') ILIKE '%' || v_stripped || '%'
    )
    AND (p_status = '' OR b.status = p_status)
    AND (p_author = '' OR b.author = p_author)
    AND (NOT p_missing_isbn OR b.isbn IS NULL)
    AND (NOT p_missing_email OR b.author_email IS NULL OR b.author_email = '')
  ORDER BY
    CASE WHEN p_sort_direction = 'asc' THEN
      CASE p_sort_column
        WHEN 'title' THEN b.title
        WHEN 'author' THEN b.author
        WHEN 'isbn' THEN b.isbn
        WHEN 'status' THEN b.status
        ELSE b.title
      END
    END ASC,
    CASE WHEN p_sort_direction = 'desc' THEN
      CASE p_sort_column
        WHEN 'title' THEN b.title
        WHEN 'author' THEN b.author
        WHEN 'isbn' THEN b.isbn
        WHEN 'status' THEN b.status
        ELSE b.title
      END
    END DESC,
    CASE WHEN p_sort_direction = 'asc' AND p_sort_column = 'pvp' THEN b.pvp END ASC,
    CASE WHEN p_sort_direction = 'desc' AND p_sort_column = 'pvp' THEN b.pvp END DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;
