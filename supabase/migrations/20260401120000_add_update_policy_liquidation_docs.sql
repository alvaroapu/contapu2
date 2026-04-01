CREATE POLICY "Authenticated users can update liquidation docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'liquidation-docs')
WITH CHECK (bucket_id = 'liquidation-docs');
