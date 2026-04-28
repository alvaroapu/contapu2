create table if not exists payment_confirmation_email_log (
  id uuid primary key default gen_random_uuid(),
  liquidation_id uuid not null references liquidations(id) on delete cascade,
  year integer not null,
  author text not null,
  email text,
  status text not null check (status in ('sent', 'error', 'skipped')),
  error_message text,
  sent_at timestamptz not null default now(),
  constraint payment_confirmation_email_log_liquidation_author unique (liquidation_id, author)
);

alter table payment_confirmation_email_log enable row level security;

create policy "Allow all for authenticated users"
  on payment_confirmation_email_log
  for all
  to authenticated
  using (true)
  with check (true);
