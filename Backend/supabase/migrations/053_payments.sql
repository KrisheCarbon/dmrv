-- Field payments: rate cards (by site, village, and date) and the money actually paid out.
-- Owed amounts are calculated from these cards against farmers, farms, soil samples,
-- pyrolysis batches, mixing batches, biomass collections, and applications.
-- A card is not a payout. A payout is a payment_disbursements row plus a proof file.

create table if not exists payment_rate_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null check (scope in ('all_producers', 'producers', 'villages')),
  effective_from date not null,
  effective_to date,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_rate_cards_dates check (
    effective_to is null or effective_to >= effective_from
  )
);

create index if not exists payment_rate_cards_status_idx
  on payment_rate_cards (status, effective_from desc);

create table if not exists payment_rate_card_producers (
  rate_card_id uuid not null references payment_rate_cards (id) on delete cascade,
  producer_id uuid not null references biochar_producers (id) on delete cascade,
  primary key (rate_card_id, producer_id)
);

create table if not exists payment_rate_card_villages (
  rate_card_id uuid not null references payment_rate_cards (id) on delete cascade,
  cluster_village_id uuid not null references cluster_villages (id) on delete cascade,
  primary key (rate_card_id, cluster_village_id)
);

create table if not exists payment_rates (
  id uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references payment_rate_cards (id) on delete cascade,
  activity text not null check (activity in (
    'farmer_registration',
    'farm_registration',
    'soil_sample',
    'pyrolysis_batch',
    'mixing_batch',
    'biomass_collection',
    'application'
  )),
  amount_inr numeric(12, 2) not null check (amount_inr > 0),
  farm_basis text,
  unique (rate_card_id, activity),
  constraint payment_rates_farm_basis check (
    (
      activity = 'farm_registration'
      and farm_basis in ('any_farm', 'per_farm', 'full_area')
    )
    or (
      activity <> 'farm_registration'
      and farm_basis is null
    )
  )
);

create table if not exists payment_disbursements (
  id uuid primary key default gen_random_uuid(),
  payee_id uuid not null references users (id),
  amount_inr numeric(12, 2) not null check (amount_inr > 0),
  paid_on date not null default current_date,
  note text,
  proof_bucket text,
  proof_path text not null,
  proof_name text,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);

create index if not exists payment_disbursements_payee_idx
  on payment_disbursements (payee_id, paid_on desc);

create or replace function payment_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists payment_rate_cards_updated_at on payment_rate_cards;
create trigger payment_rate_cards_updated_at
  before update on payment_rate_cards
  for each row execute function payment_set_updated_at();

alter table payment_rate_cards enable row level security;
alter table payment_rate_card_producers enable row level security;
alter table payment_rate_card_villages enable row level security;
alter table payment_rates enable row level security;
alter table payment_disbursements enable row level security;

drop policy if exists payment_rate_cards_select on payment_rate_cards;
create policy payment_rate_cards_select on payment_rate_cards
  for select to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'manager')
    )
  );

drop policy if exists payment_rate_card_producers_select on payment_rate_card_producers;
create policy payment_rate_card_producers_select on payment_rate_card_producers
  for select to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'manager')
    )
  );

drop policy if exists payment_rate_card_villages_select on payment_rate_card_villages;
create policy payment_rate_card_villages_select on payment_rate_card_villages
  for select to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'manager')
    )
  );

drop policy if exists payment_rates_select on payment_rates;
create policy payment_rates_select on payment_rates
  for select to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'manager')
    )
  );

drop policy if exists payment_disbursements_select on payment_disbursements;
create policy payment_disbursements_select on payment_disbursements
  for select to authenticated
  using (
    payee_id = auth.uid()
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin', 'manager')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment_proofs_select" on storage.objects;
drop policy if exists "payment_proofs_insert" on storage.objects;

create policy "payment_proofs_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'manager')
    )
  )
);

create policy "payment_proofs_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-proofs'
  and exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin', 'manager')
  )
);
