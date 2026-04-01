
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

CREATE OR REPLACE FUNCTION public.fuzzy_match_books(
  p_author text,
  p_title text,
  p_threshold real DEFAULT 0.4
)
RETURNS TABLE(
  book_id uuid,
  book_title text,
  book_author text,
  book_isbn text,
  book_pvp numeric,
  title_similarity real,
  author_similarity real,
  combined_score real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.title,
    b.author,
    b.isbn,
    b.pvp,
    similarity(normalize_text(b.title), normalize_text(p_title)) AS t_sim,
    similarity(normalize_text(b.author), normalize_text(p_author)) AS a_sim,
    (similarity(normalize_text(b.title), normalize_text(p_title)) * 0.5 +
     similarity(normalize_text(b.author), normalize_text(p_author)) * 0.5) AS c_score
  FROM books b
  WHERE b.status = 'active'
    AND similarity(normalize_text(b.title), normalize_text(p_title)) > p_threshold
    AND similarity(normalize_text(b.author), normalize_text(p_author)) > p_threshold
  ORDER BY c_score DESC
  LIMIT 5;
END;
$$;
