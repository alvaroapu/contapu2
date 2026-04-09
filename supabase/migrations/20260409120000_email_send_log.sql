create table if not exists email_send_log (
  id uuid primary key default gen_random_uuid(),
  liquidation_id uuid not null references liquidations(id) on delete cascade,
  year integer not null,
  author text not null,
  email text,
  status text not null check (status in ('sent', 'error', 'skipped')),
  error_message text,
  sent_at timestamptz not null default now(),
  constraint email_send_log_liquidation_author_unique unique (liquidation_id, author)
);

alter table email_send_log enable row level security;

create policy "authenticated can manage email_send_log"
  on email_send_log for all to authenticated
  using (true) with check (true);

create index email_send_log_liquidation_idx on email_send_log (liquidation_id, author);
