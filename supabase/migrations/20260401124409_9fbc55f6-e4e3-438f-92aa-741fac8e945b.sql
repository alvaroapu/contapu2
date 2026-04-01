
-- Table to track book import sessions from DOCX files
CREATE TABLE public.book_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  books_created integer NOT NULL DEFAULT 0,
  imported_at timestamp with time zone NOT NULL DEFAULT now(),
  imported_by uuid,
  reverted boolean NOT NULL DEFAULT false,
  reverted_at timestamp with time zone
);

ALTER TABLE public.book_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.book_import_batches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add import batch reference to books
ALTER TABLE public.books ADD COLUMN book_import_batch_id uuid REFERENCES public.book_import_batches(id) ON DELETE SET NULL;
