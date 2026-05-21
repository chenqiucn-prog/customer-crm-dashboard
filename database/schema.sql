-- 客户项目管理暨总经理驾驶舱：账号权限多人协作版
-- Supabase SQL Editor 执行本文件全部内容
-- 角色：
-- sales：销售，只能查看、编辑、删除自己名下项目
-- general_manager：总经理，可查看和管理全部项目
-- admin：管理员，可查看和管理全部项目、维护基础配置

create extension if not exists pgcrypto;

-- 1. 用户档案表：与 auth.users 一一对应
create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'sales' check (role in ('sales','general_manager','admin')),
  enabled boolean not null default true,
  team_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 系统配置：区域、产品线、阶段、团队等
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- 3. 销售项目主表
create table if not exists public.sales_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id),
  created_by_user_id uuid references public.app_users(id),
  region text,
  category text,
  company text not null,
  department text,
  contact text,
  title text,
  customer_level text,
  product_line text,
  product_name text,
  budget numeric not null default 0,
  amount numeric not null default 0,
  win numeric not null default 0,
  stage text,
  owner_name text,
  team_name text,
  priority text,
  is_key_project boolean not null default false,
  risk_level text,
  need_boss boolean not null default false,
  research text,
  next_action text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_users_role on public.app_users(role);
create index if not exists idx_sales_projects_owner_user_id on public.sales_projects(owner_user_id);
create index if not exists idx_sales_projects_region on public.sales_projects(region);
create index if not exists idx_sales_projects_stage on public.sales_projects(stage);
create index if not exists idx_sales_projects_product_line on public.sales_projects(product_line);
create index if not exists idx_sales_projects_risk on public.sales_projects(risk_level);
create index if not exists idx_sales_projects_updated_at on public.sales_projects(updated_at desc);

-- 4. updated_at 自动刷新
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_config_updated_at on public.app_config;
create trigger trg_app_config_updated_at
before update on public.app_config
for each row execute function public.set_updated_at();

drop trigger if exists trg_sales_projects_updated_at on public.sales_projects;
create trigger trg_sales_projects_updated_at
before update on public.sales_projects
for each row execute function public.set_updated_at();

-- 5. 权限辅助函数
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.app_users
  where id = auth.uid()
    and enabled = true
  limit 1
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('general_manager','admin'), false)
$$;

-- 6. 开启 RLS
alter table public.app_users enable row level security;
alter table public.app_config enable row level security;
alter table public.sales_projects enable row level security;

-- 7. 删除旧策略，便于重复执行
drop policy if exists "app_users_select_policy" on public.app_users;
drop policy if exists "app_users_update_self_policy" on public.app_users;
drop policy if exists "app_config_select_authenticated" on public.app_config;
drop policy if exists "app_config_write_admin_manager" on public.app_config;
drop policy if exists "sales_projects_select_own_or_all" on public.sales_projects;
drop policy if exists "sales_projects_insert_own_or_all" on public.sales_projects;
drop policy if exists "sales_projects_update_own_or_all" on public.sales_projects;
drop policy if exists "sales_projects_delete_own_or_all" on public.sales_projects;

-- 8. RLS 策略
create policy "app_users_select_policy"
on public.app_users
for select
to authenticated
using (
  id = auth.uid()
  or public.is_manager_or_admin()
);

create policy "app_users_update_self_policy"
on public.app_users
for update
to authenticated
using (
  id = auth.uid()
  or public.current_app_role() = 'admin'
)
with check (
  id = auth.uid()
  or public.current_app_role() = 'admin'
);

create policy "app_config_select_authenticated"
on public.app_config
for select
to authenticated
using (true);

create policy "app_config_write_admin_manager"
on public.app_config
for all
to authenticated
using (public.is_manager_or_admin())
with check (public.is_manager_or_admin());

create policy "sales_projects_select_own_or_all"
on public.sales_projects
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_manager_or_admin()
);

create policy "sales_projects_insert_own_or_all"
on public.sales_projects
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  or public.is_manager_or_admin()
);

create policy "sales_projects_update_own_or_all"
on public.sales_projects
for update
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_manager_or_admin()
)
with check (
  owner_user_id = auth.uid()
  or public.is_manager_or_admin()
);

create policy "sales_projects_delete_own_or_all"
on public.sales_projects
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_manager_or_admin()
);

-- 9. 初始化系统配置
insert into public.app_config (key, value)
values (
  'main',
  '{
    "regions":["北京","天津","山东","东北","华东","华南","西北"],
    "categories":["高校","医院","研究院","企业","产业园区","政府/平台"],
    "levels":["S","A","B","C"],
    "priorities":["S","A","B","C"],
    "stages":[
      {"name":"线索发现","win":0.10,"tip":"确认客户基本需求、应用方向与预算窗口。"},
      {"name":"初步接触","win":0.20,"tip":"完成首访，识别关键联系人与潜在采购场景。"},
      {"name":"需求确认","win":0.35,"tip":"确认应用场景、预算来源、决策链和技术痛点。"},
      {"name":"方案交流","win":0.50,"tip":"组织产品/应用方案交流，形成配置清单。"},
      {"name":"报价/预算论证","win":0.65,"tip":"提交报价、配置和论证材料，推动预算立项。"},
      {"name":"采购/招标流程","win":0.80,"tip":"跟进采购路径、参数、评分、专家论证与流程节点。"},
      {"name":"合同/成交","win":0.95,"tip":"完成合同、发货、验收和回款计划。"},
      {"name":"暂缓/丢单","win":0.00,"tip":"沉淀暂缓/丢单原因，评估后续复活机会。"}
    ],
    "owners":[],
    "teams":["华北销售组","华东销售组","华南销售组","行业大客户组"],
    "risks":["低","中","高"],
    "yesNo":["是","否"],
    "productLines":{
      "科研仪器解决方案":["FlowRACS 高通量流式拉曼分选仪","FlowRACS 单细胞拉曼分选系统","3Brain 高密度微电极阵列 MEA 系统","RapidXAFS 实验室级 XAFS 系统"],
      "医疗科研解决方案":["3Brain 高密度微电极阵列 MEA 系统","自动化样本库系统","单细胞可视化筛选系统"],
      "生命科学仪器方案":["共聚焦扫描成像显微镜 CSIM131","智能化3D细胞打印平台","激光捕获显微切割系统 LCM-FL1A"],
      "智慧运维平台":["智维云高校科研仪器智慧运维平台","大型仪器维保服务平台","实验室设备全生命周期管理平台"]
    }
  }'::jsonb
)
on conflict (key) do nothing;

-- 10. 创建用户后的角色配置示例
-- 注意：必须先在 Supabase Authentication → Users 中创建用户，再把对应 email 填入下面语句。
-- 将 chenqiucn@gmail.com 设置为总经理示例：
--
-- insert into public.app_users (id, email, name, role, enabled)
-- select id, email, '陈秋', 'general_manager', true
-- from auth.users
-- where email = 'chenqiucn@gmail.com'
-- on conflict (id) do update
-- set name = excluded.name,
--     role = excluded.role,
--     enabled = excluded.enabled,
--     email = excluded.email;
--
-- 将某销售设置为 sales 示例：
--
-- insert into public.app_users (id, email, name, role, enabled, team_name)
-- select id, email, '销售A', 'sales', true, '华北销售组'
-- from auth.users
-- where email = 'sales-a@example.com'
-- on conflict (id) do update
-- set name = excluded.name,
--     role = excluded.role,
--     enabled = excluded.enabled,
--     team_name = excluded.team_name,
--     email = excluded.email;


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
