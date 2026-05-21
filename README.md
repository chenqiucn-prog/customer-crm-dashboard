# 客户项目管理暨总经理驾驶舱 - 账号权限多人协作版

## 1. 核心权限

本版本已实现：

| 角色 | 权限 |
|---|---|
| sales | 销售账号，只能查看、编辑、删除自己名下项目 |
| general_manager | 总经理账号，可以查看和管理全部项目 |
| admin | 管理员账号，可以查看和管理全部项目，并维护基础配置 |

## 2. 技术架构

```txt
Netlify 静态前端
  ↓ Supabase Auth 邮箱密码登录
Netlify Functions
  ↓ 校验 access token + app_users 角色
Supabase PostgreSQL
  ↓ RLS 行级权限策略
sales_projects.owner_user_id 控制项目可见范围
```

## 3. 部署步骤

### 第一步：创建 Supabase 项目

1. 登录 Supabase；
2. 创建 Project；
3. 进入 SQL Editor；
4. 执行 `database/schema.sql`。

### 第二步：创建登录账号

进入：

```txt
Supabase → Authentication → Users → Add user
```

创建：

- 总经理邮箱账号；
- 每个销售邮箱账号；
- 管理员邮箱账号。

建议关闭公开注册，只由后台创建内部账号。

### 第三步：配置 app_users 角色

创建 Auth 用户后，在 Supabase SQL Editor 执行类似语句。

#### 总经理账号

```sql
insert into public.app_users (id, email, name, role, enabled)
select id, email, '总经理', 'general_manager', true
from auth.users
where email = 'boss@example.com'
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    enabled = excluded.enabled,
    email = excluded.email;
```

#### 销售账号

```sql
insert into public.app_users (id, email, name, role, enabled, team_name)
select id, email, '销售A', 'sales', true, '华北销售组'
from auth.users
where email = 'sales-a@example.com'
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    enabled = excluded.enabled,
    team_name = excluded.team_name,
    email = excluded.email;
```

#### 管理员账号

```sql
insert into public.app_users (id, email, name, role, enabled)
select id, email, '系统管理员', 'admin', true
from auth.users
where email = 'admin@example.com'
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    enabled = excluded.enabled,
    email = excluded.email;
```

### 第四步：配置 Netlify 环境变量

Netlify 后台：

```txt
Site configuration → Environment variables
```

添加：

```txt
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_ANON_KEY=你的 Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service_role key
```

注意：

- `SUPABASE_ANON_KEY` 会给前端登录使用；
- `SUPABASE_SERVICE_ROLE_KEY` 只在 Netlify Functions 服务端使用，不能写入前端代码。

### 第五步：部署到 Netlify

GitHub 部署：

1. 上传本项目到 GitHub；
2. Netlify → Add new site → Import an existing project；
3. Build command：

```bash
npm run build
```

4. Publish directory：

```bash
.
```

5. Deploy。

## 4. 使用方法

### 销售

1. 用销售邮箱和密码登录；
2. 只能看到自己名下项目；
3. 新增项目自动归属自己；
4. 不能把项目转给其他销售。

### 总经理

1. 用总经理邮箱登录；
2. 查看全量项目；
3. 按负责人、区域、产品线、销售阶段筛选；
4. 新增项目时可以指定项目归属销售；
5. 可以修改基础配置。

### 管理员

拥有总经理权限，并用于系统维护。

## 5. 安全设计

本版本不是单纯前端隐藏数据，而是三层限制：

1. 前端根据角色隐藏/禁用部分选项；
2. Netlify Functions 校验 Supabase access token 和 app_users 角色；
3. Supabase PostgreSQL 开启 RLS，通过 `owner_user_id = auth.uid()` 限制销售只能访问自己项目。

## 6. 常见问题

### 登录成功后提示“账号尚未配置角色”

说明 Supabase Auth 用户已经创建，但 `public.app_users` 表里没有该用户的角色记录。

解决方法：执行 README 第三步的 SQL。

### 销售看不到项目

检查项目的 `owner_user_id` 是否等于该销售在 `app_users` 中的 id。

### 总经理看不到全量

检查 `app_users.role` 是否为：

```txt
general_manager
```

或：

```txt
admin
```
