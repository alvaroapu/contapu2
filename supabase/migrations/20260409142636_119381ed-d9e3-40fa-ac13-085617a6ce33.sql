
CREATE TABLE public.liquidation_author_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidation_id uuid NOT NULL REFERENCES public.liquidations(id) ON DELETE CASCADE,
  author text NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamp with time zone,
  UNIQUE (liquidation_id, author)
);

ALTER TABLE public.liquidation_author_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access"
ON public.liquidation_author_payments
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
