# 账号角色设置说明

## 角色值

- sales
- general_manager
- admin

## 权限判断

- sales：API 自动加 owner_user_id = 当前用户 id
- general_manager/admin：API 不加 owner_user_id 限制，可访问全量

## 推荐操作流程

1. Supabase Authentication 创建账号；
2. 执行 SQL 写入 app_users；
3. 登录系统测试；
4. 用销售账号新增项目；
5. 用总经理账号验证全量可见。
