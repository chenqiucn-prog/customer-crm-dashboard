-- 11. 个人资料字段与受控更新函数
-- 可重复执行；用于 v2.4 个人资料菜单
alter table public.app_users
  add column if not exists phone text,
  add column if not exists title text,
  add column if not exists department text,
  add column if not exists note text;

-- 为避免普通用户直接通过前端 key 修改自己的 role/enabled，移除宽泛的自更新策略
drop policy if exists "app_users_update_self_policy" on public.app_users;

-- 受控个人资料更新函数：只允许用户更新自己的非敏感字段
create or replace function public.update_my_profile(
  p_name text,
  p_phone text,
  p_title text,
  p_department text,
  p_note text
)
returns public.app_users
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_user public.app_users;
begin
  update public.app_users
  set
    name = nullif(trim(p_name), ''),
    phone = nullif(trim(p_phone), ''),
    title = nullif(trim(p_title), ''),
    department = nullif(trim(p_department), ''),
    note = nullif(trim(p_note), '')
  where id = auth.uid()
    and enabled = true
  returning * into updated_user;

  if updated_user.id is null then
    raise exception '当前账号不存在或已停用';
  end if;

  return updated_user;
end;
$$;

grant execute on function public.update_my_profile(text, text, text, text, text) to authenticated;
