
INSERT INTO storage.buckets (id, name, public)
VALUES ('liquidation-docs', 'liquidation-docs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload liquidation docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'liquidation-docs');

CREATE POLICY "Public can read liquidation docs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'liquidation-docs');

CREATE POLICY "Authenticated users can delete liquidation docs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'liquidation-docs');
