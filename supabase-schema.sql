-- Supabase SQL Editor'da sırayla çalıştırın (https://supabase.com/dashboard → SQL)

-- 1) Menü verisi (tek satır, id = 1)
create table if not exists public.menu_data (
  id integer primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into public.menu_data (id, payload)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.menu_data enable row level security;

-- Herkes menüyü okuyabilir (anonim ana sayfa)
drop policy if exists "menu_select_public" on public.menu_data;
create policy "menu_select_public"
  on public.menu_data for select
  using (true);

-- Yalnızca giriş yapmış yönetici yazabilir
drop policy if exists "menu_insert_auth" on public.menu_data;
create policy "menu_insert_auth"
  on public.menu_data for insert
  to authenticated
  with check (id = 1);

drop policy if exists "menu_update_auth" on public.menu_data;
create policy "menu_update_auth"
  on public.menu_data for update
  to authenticated
  using (id = 1)
  with check (id = 1);

-- 2) Görseller (Storage → menü yönetiminden de oluşturulabilir)
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

drop policy if exists "menu_images_read" on storage.objects;
create policy "menu_images_read"
  on storage.objects for select
  using (bucket_id = 'menu-images');

drop policy if exists "menu_images_insert" on storage.objects;
create policy "menu_images_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-images');

drop policy if exists "menu_images_update" on storage.objects;
create policy "menu_images_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'menu-images')
  with check (bucket_id = 'menu-images');

drop policy if exists "menu_images_delete" on storage.objects;
create policy "menu_images_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu-images');
