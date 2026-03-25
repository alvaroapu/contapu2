
-- Distributors table
CREATE TABLE distributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  is_active boolean DEFAULT true
);

ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON distributors FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO distributors (name, code, is_active) VALUES
  ('Maidhisa', 'maidhisa', true),
  ('Azeta', 'azeta', true),
  ('Almacén', 'almacen', true),
  ('Colegios y Aytos.', 'colegios', true);

-- Books table
CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn text UNIQUE,
  ean text,
  title text NOT NULL,
  author text NOT NULL,
  pvp numeric(10,2) NOT NULL,
  publication_date date,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'out_of_print')),
  maidhisa_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_books_isbn ON books(isbn);
CREATE INDEX idx_books_title ON books USING gin(to_tsvector('spanish', title));
CREATE INDEX idx_books_author ON books(author);
CREATE INDEX idx_books_maidhisa_ref ON books(maidhisa_ref);

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON books FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Import batches table
CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id uuid REFERENCES distributors(id) NOT NULL,
  file_name text NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'error', 'reverted')),
  records_imported integer DEFAULT 0,
  records_skipped integer DEFAULT 0,
  error_log jsonb,
  imported_at timestamptz DEFAULT now(),
  imported_by uuid REFERENCES auth.users(id)
);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON import_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sales movements table
CREATE TABLE sales_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES books(id) NOT NULL,
  distributor_id uuid REFERENCES distributors(id) NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  type text NOT NULL CHECK (type IN ('envio', 'venta', 'devolucion')),
  quantity integer NOT NULL CHECK (quantity > 0),
  notes text,
  import_batch_id uuid REFERENCES import_batches(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sales_movements_book ON sales_movements(book_id);
CREATE INDEX idx_sales_movements_period ON sales_movements(year, month);
CREATE INDEX idx_sales_movements_batch ON sales_movements(import_batch_id);

ALTER TABLE sales_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON sales_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Liquidations table
CREATE TABLE liquidations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  distributor_royalty_pct numeric(5,2) DEFAULT 10.00,
  online_royalty_pct numeric(5,2) DEFAULT 25.00,
  school_royalty_pct numeric(5,2) DEFAULT 30.00,
  created_at timestamptz DEFAULT now(),
  finalized_at timestamptz
);

ALTER TABLE liquidations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON liquidations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Liquidation items table
CREATE TABLE liquidation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidation_id uuid REFERENCES liquidations(id) NOT NULL,
  book_id uuid REFERENCES books(id) NOT NULL,
  distributor_units integer DEFAULT 0,
  online_units integer DEFAULT 0,
  school_units integer DEFAULT 0,
  distributor_amount numeric(10,2) DEFAULT 0,
  online_amount numeric(10,2) DEFAULT 0,
  school_amount numeric(10,2) DEFAULT 0,
  total_amount numeric(10,2) DEFAULT 0,
  UNIQUE(liquidation_id, book_id)
);

ALTER TABLE liquidation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON liquidation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Views
CREATE OR REPLACE VIEW book_inventory_summary AS
SELECT
  sm.book_id,
  sm.distributor_id,
  sm.year,
  sm.month,
  COALESCE(SUM(CASE WHEN sm.type = 'envio' THEN sm.quantity ELSE 0 END), 0) AS envios,
  COALESCE(SUM(CASE WHEN sm.type = 'venta' THEN sm.quantity ELSE 0 END), 0) AS ventas,
  COALESCE(SUM(CASE WHEN sm.type = 'devolucion' THEN sm.quantity ELSE 0 END), 0) AS devoluciones,
  COALESCE(SUM(CASE WHEN sm.type = 'envio' THEN sm.quantity ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN sm.type = 'venta' THEN sm.quantity ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN sm.type = 'devolucion' THEN sm.quantity ELSE 0 END), 0) AS inventario
FROM sales_movements sm
GROUP BY sm.book_id, sm.distributor_id, sm.year, sm.month;

CREATE OR REPLACE VIEW book_inventory_annual AS
SELECT
  sm.book_id,
  sm.distributor_id,
  sm.year,
  COALESCE(SUM(CASE WHEN sm.type = 'envio' THEN sm.quantity ELSE 0 END), 0) AS envios,
  COALESCE(SUM(CASE WHEN sm.type = 'venta' THEN sm.quantity ELSE 0 END), 0) AS ventas,
  COALESCE(SUM(CASE WHEN sm.type = 'devolucion' THEN sm.quantity ELSE 0 END), 0) AS devoluciones,
  COALESCE(SUM(CASE WHEN sm.type = 'envio' THEN sm.quantity ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN sm.type = 'venta' THEN sm.quantity ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN sm.type = 'devolucion' THEN sm.quantity ELSE 0 END), 0) AS inventario
FROM sales_movements sm
GROUP BY sm.book_id, sm.distributor_id, sm.year;

-- Normalize text function
CREATE OR REPLACE FUNCTION normalize_text(input text)
RETURNS text AS $$
BEGIN
  RETURN lower(
    translate(
      trim(input),
      'ÁÉÍÓÚáéíóúÀÈÌÒÙàèìòùÂÊÎÔÛâêîôûÄËÏÖÜäëïöüÑñÇç¿¡',
      'AEIOUaeiouAEIOUaeiouAEIOUaeiouAEIOUaeiouNnCc'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
