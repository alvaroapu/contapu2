
CREATE OR REPLACE FUNCTION public.execute_readonly_query(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  trimmed text;
BEGIN
  trimmed := upper(trim(query_text));
  
  -- Only allow SELECT statements
  IF NOT (trimmed LIKE 'SELECT%' OR trimmed LIKE 'WITH%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Block dangerous keywords
  IF trimmed ~ '(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE)' THEN
    RAISE EXCEPTION 'Modification queries are not allowed';
  END IF;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query_text || ') t' INTO result;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
