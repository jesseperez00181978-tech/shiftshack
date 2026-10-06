-- ShiftStack Work marketplace backend
-- Safe to run on a fresh Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'worker' check (role in ('worker','business','homeowner','property_manager')),
  base_location text,
  travel_radius_miles integer not null default 25 check (travel_radius_miles between 1 and 250),
  availability text,
  work_types text[] not null default '{}',
  categories text[] not null default '{}',
  skills text[] not null default '{}',
  bio text,
  rating numeric(3,2) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  poster_type text not null check (poster_type in ('Homeowner','Business','Contractor','Property manager')),
  work_type text not null check (work_type in ('One-time job','Day work','Contract','Part-time','Full-time')),
  title text not null check (char_length(title) between 2 and 140),
  category text not null,
  location text not null,
  budget numeric(12,2) not null default 0 check (budget >= 0),
  pay_type text not null check (pay_type in ('hour','job','day','open')),
  work_date date,
  tools text,
  materials text,
  description text not null check (char_length(description) between 3 and 4000),
  status text not null default 'open' check (status in ('open','assigned','in_progress','completed','cancelled')),
  assigned_worker_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_applications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.work_posts(id) on delete cascade,
  worker_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'application' check (kind in ('application','estimate')),
  message text not null check (char_length(message) between 1 and 2000),
  estimate_amount numeric(12,2) check (estimate_amount is null or estimate_amount >= 0),
  status text not null default 'sent' check (status in ('sent','shortlisted','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id, worker_id)
);

create table if not exists public.work_conversations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.work_posts(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, customer_id, worker_id)
);

create table if not exists public.work_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.work_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists work_posts_status_category_created_idx
  on public.work_posts(status, category, created_at desc);
create index if not exists work_posts_owner_idx on public.work_posts(owner_id);
create index if not exists work_applications_post_idx on public.work_applications(post_id);
create index if not exists work_applications_worker_idx on public.work_applications(worker_id);
create index if not exists work_messages_conversation_created_idx
  on public.work_messages(conversation_id, created_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists work_posts_touch_updated_at on public.work_posts;
create trigger work_posts_touch_updated_at
before update on public.work_posts
for each row execute function public.touch_updated_at();

drop trigger if exists work_applications_touch_updated_at on public.work_applications;
create trigger work_applications_touch_updated_at
before update on public.work_applications
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email,''), '@', 1)),
    case
      when new.raw_user_meta_data ->> 'role' in ('worker','business','homeowner','property_manager')
        then new.raw_user_meta_data ->> 'role'
      else 'worker'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.work_posts enable row level security;
alter table public.work_applications enable row level security;
alter table public.work_conversations enable row level security;
alter table public.work_messages enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users manage own profile" on public.profiles;
create policy "users manage own profile"
on public.profiles for all
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "signed-in users read open work" on public.work_posts;
create policy "signed-in users read open work"
on public.work_posts for select
to authenticated
using (status <> 'cancelled' or owner_id = auth.uid());

drop policy if exists "owners create work" on public.work_posts;
create policy "owners create work"
on public.work_posts for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "owners update work" on public.work_posts;
create policy "owners update work"
on public.work_posts for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owners delete work" on public.work_posts;
create policy "owners delete work"
on public.work_posts for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "workers and owners read applications" on public.work_applications;
create policy "workers and owners read applications"
on public.work_applications for select
to authenticated
using (
  worker_id = auth.uid()
  or exists (
    select 1 from public.work_posts p
    where p.id = work_applications.post_id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "workers create applications" on public.work_applications;
create policy "workers create applications"
on public.work_applications for insert
to authenticated
with check (
  worker_id = auth.uid()
  and exists (
    select 1 from public.work_posts p
    where p.id = work_applications.post_id
      and p.owner_id <> auth.uid()
      and p.status = 'open'
  )
);

drop policy if exists "workers and owners update applications" on public.work_applications;
create policy "workers and owners update applications"
on public.work_applications for update
to authenticated
using (
  worker_id = auth.uid()
  or exists (
    select 1 from public.work_posts p
    where p.id = work_applications.post_id
      and p.owner_id = auth.uid()
  )
)
with check (
  worker_id = auth.uid()
  or exists (
    select 1 from public.work_posts p
    where p.id = work_applications.post_id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "participants read conversations" on public.work_conversations;
create policy "participants read conversations"
on public.work_conversations for select
to authenticated
using (customer_id = auth.uid() or worker_id = auth.uid());

drop policy if exists "participants create conversations" on public.work_conversations;
create policy "participants create conversations"
on public.work_conversations for insert
to authenticated
with check (
  (customer_id = auth.uid() or worker_id = auth.uid())
  and exists (
    select 1 from public.work_posts p
    where p.id = work_conversations.post_id
      and (p.owner_id = customer_id or p.owner_id = worker_id)
  )
);

drop policy if exists "participants read messages" on public.work_messages;
create policy "participants read messages"
on public.work_messages for select
to authenticated
using (
  exists (
    select 1 from public.work_conversations c
    where c.id = work_messages.conversation_id
      and (c.customer_id = auth.uid() or c.worker_id = auth.uid())
  )
);

drop policy if exists "participants send messages" on public.work_messages;
create policy "participants send messages"
on public.work_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.work_conversations c
    where c.id = work_messages.conversation_id
      and (c.customer_id = auth.uid() or c.worker_id = auth.uid())
  )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.work_posts to authenticated;
grant select, insert, update on public.work_applications to authenticated;
grant select, insert on public.work_conversations to authenticated;
grant select, insert on public.work_messages to authenticated;
