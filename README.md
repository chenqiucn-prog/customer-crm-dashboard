# 客户项目管理暨总经理驾驶舱 - RLS权限版（无需 Service Role Key）

## 1. 版本说明

这一版取消了 `SUPABASE_SERVICE_ROLE_KEY` 依赖，用 **Supabase Auth + PostgreSQL RLS** 完成权限控制。

适合解决以下问题：

```txt
/api/me 403
该账号尚未在 app_users 表中配置角色，或已被停用
```

如果你的 `app_users` 表中已经有用户角色，但网页仍然 403，通常是 service role key 配置错误导致。本版不再需要该变量。

## 2. 权限仍然保持

| 角色 | 权限 |
|---|---|
| sales | 只能查看、编辑、删除自己名下项目 |
| general_manager | 总经理，可以查看和管理全部项目 |
| admin | 管理员，可以查看全量项目，并维护基础配置 |

## 3. Netlify 只需要 2 个环境变量

```txt
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_ANON_KEY=你的 Supabase anon / publishable key
```

不再需要：

```txt
SUPABASE_SERVICE_ROLE_KEY
```

旧变量可以删除，也可以保留；这一版代码不会读取它。

## 4. 部署方法

1. 解压本 ZIP；
2. 用本 ZIP 的全部内容覆盖 GitHub 仓库旧代码；
3. 提交 GitHub；
4. Netlify 重新部署：

```txt
Deploys → Trigger deploy → Deploy project without cache
```

5. 用无痕窗口打开：

```txt
https://zwaycrm.netlify.app
```

6. 用 `chenqiu@qq.com` 登录。

## 5. Supabase 检查

确认你已执行过 `database/schema.sql`。

确认总经理账号：

```sql
select id, email, name, role, enabled
from public.app_users
where lower(email) = lower('chenqiu@qq.com');
```

应显示：

```txt
role = general_manager
enabled = true
```

## 6. 如果仍然 403

重点检查：

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
```

这两个必须来自同一个 Supabase 项目。


## 7. v2.2 表单优化说明

本版本在 RLS 权限版基础上，优化了“新增销售项目”弹窗：

- 按业务流程分为五组：项目归属、客户信息、产品与金额、项目推进状态、应用场景与下一步动作；
- 每个字段增加中文标签和填写说明；
- 明确了“项目负责人 / 归属销售”“项目预算”“预计成交金额”“商机赢率”等字段含义；
- 销售阶段变更时自动带出建议赢率；
- 新增前端校验：客户单位名称、产品线、具体产品名为关键字段。


## 8. v2.3 销售统计增强说明

本版本新增“销售统计”页面，统计口径如下：

- 今年已成交金额：销售阶段为“合同/成交”，且项目创建时间或更新时间在当前自然年；
- 已成交项目数：同上；
- 预计成交金额：当前账号可见项目的预计成交金额合计；
- 加权预测金额：预计成交金额 × 商机赢率；
- 客户总数：按客户单位名称去重；
- 今年新增客户：当前自然年创建/更新项目涉及的客户单位去重；
- 按销售负责人统计：项目数、客户数、预计成交金额、已成交金额、加权预测；
- 按产品线统计：项目数、预计成交金额、已成交金额、加权预测；
- 今年成交TOP客户：按已成交金额排序。

说明：当前版本未新增数据库字段，成交日期暂按项目创建/更新时间判断。后续如果要更严谨，可增加“成交日期 / 合同日期 / 回款日期”字段。


## 9. v2.4 个人资料与密码修改说明

本版本新增“个人资料”菜单：

### 个人资料字段

- 登录邮箱：来自 Supabase Auth，不建议普通用户自行修改；
- 姓名 / 显示名称：用于项目负责人、销售统计和左侧账号信息显示；
- 角色：sales / general_manager / admin，只读；
- 团队：只读，建议由管理员维护；
- 手机号；
- 职务；
- 部门；
- 个人备注。

### 修改密码

用户登录后可在“个人资料”页面修改自己的登录密码。密码修改调用 Supabase Auth 的 `updateUser({ password })`。

### 数据库迁移

如数据库已部署过旧版，需要在 Supabase SQL Editor 执行：

```txt
database/migration_profile_v2_4.sql
```

或者重新执行完整的：

```txt
database/schema.sql
```

建议只执行迁移文件，避免影响已有数据。
