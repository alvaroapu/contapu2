
-- Delete duplicate sales_movements from batch 648e94b7, keeping the earliest created record per group
DELETE FROM sales_movements
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY book_id, month, type, quantity
             ORDER BY created_at ASC
           ) as rn
    FROM sales_movements
    WHERE import_batch_id = '648e94b7-1adf-49ff-a196-558841cc2c7d'
  ) ranked
  WHERE rn > 1
);
