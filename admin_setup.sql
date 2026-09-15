-- 水晶庭・店長後台一次性設定
-- 先前 public.orders 已有「anon 只能 INSERT」政策；以下只開放已登入帳號管理訂單。

alter table public.orders
  add column if not exists status text not null default 'new',
  add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_status_check
      check (status in ('new','confirmed','completed','cancelled'));
  end if;
end $$;

-- 重新建立後台政策，重跑此 SQL 也不會因同名 policy 出錯。
drop policy if exists "Authenticated can read orders" on public.orders;
drop policy if exists "Authenticated can update orders" on public.orders;
drop policy if exists "Authenticated can delete orders" on public.orders;

create policy "Authenticated can read orders"
on public.orders
for select
to authenticated
using (true);

create policy "Authenticated can update orders"
on public.orders
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated can delete orders"
on public.orders
for delete
to authenticated
using (true);
