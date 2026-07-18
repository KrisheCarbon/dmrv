-- Climapreneur bank accounts: one bank profile per climapreneur user.
-- Run in Supabase SQL editor (Dashboard → SQL → New query).

create table if not exists climapreneur_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users (id) on delete cascade,
  account_holder_name text not null,
  account_number text not null,
  ifsc_code text not null,
  bank_name text not null,
  branch text not null,
  bank_address text not null,
  upi_id text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists climapreneur_bank_accounts_user_idx
  on climapreneur_bank_accounts (user_id);

create or replace function climapreneur_bank_accounts_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists climapreneur_bank_accounts_updated_at on climapreneur_bank_accounts;
create trigger climapreneur_bank_accounts_updated_at
  before update on climapreneur_bank_accounts
  for each row execute function climapreneur_bank_accounts_set_updated_at();

alter table climapreneur_bank_accounts enable row level security;

create policy "Authenticated users can read climapreneur bank accounts"
  on climapreneur_bank_accounts
  for select
  to authenticated
  using (true);

create policy "Authenticated users can insert climapreneur bank accounts"
  on climapreneur_bank_accounts
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update climapreneur bank accounts"
  on climapreneur_bank_accounts
  for update
  to authenticated
  using (true);
