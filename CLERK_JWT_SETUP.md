# Clerk JWT 模板配置 - 必须完成！

## 🚨 错误原因

错误代码 `42501`: `new row violates row-level security policy for table "projects"`

这意味着 Supabase 无法验证你的 Clerk JWT 令牌。**必须在 Clerk 中配置 JWT 模板！**

## ✅ 解决步骤（5分钟）

### 步骤 1: 访问 Clerk Dashboard

1. 打开 https://dashboard.clerk.com/
2. 选择你的应用（`improved-corgi-43`）
3. 在左侧菜单找到 **JWT Templates**

### 步骤 2: 创建 Supabase JWT 模板

1. 点击 **+ New template** 按钮
2. 在模板列表中选择 **Supabase**
3. 模板名称**必须**是: `supabase`（小写，不要改！）
4. 点击 **Apply Changes** 或 **Save**

**重要**: 模板名称必须完全匹配 `supabase`，因为代码中使用：
```typescript
await session.getToken({ template: 'supabase' })
```

### 步骤 3: 配置 Supabase（如果还没做）

1. 访问 https://supabase.com/dashboard
2. 选择你的项目
3. 进入 **Authentication** → **Providers**
4. 找到 **Clerk** 部分并启用
5. 在 Clerk Dashboard 的 **API Keys** 页面复制 **JWKS URL**
   - 格式类似: `https://improved-corgi-43.clerk.accounts.dev/.well-known/jwks.json`
6. 粘贴到 Supabase 的 Clerk 配置中
7. 保存

### 步骤 4: 测试配置

1. 访问: `http://localhost:3000/debug-auth`
2. 检查以下项目：

**应该看到**:
```
✅ Clerk 用户信息 - 已登录
✅ JWT Token - 已获取
✅ Token 中包含 sub 字段
✅ Supabase 连接测试 - 成功
```

**如果看到**:
```
❌ JWT Token - 未获取
或
❌ Token 中缺少 sub 字段
```
说明 JWT 模板配置有问题。

### 步骤 5: 刷新页面并测试

1. 配置完成后，**刷新浏览器**（Ctrl+Shift+R）
2. 访问 `/lovart/canvas`
3. 添加元素
4. 等待 2 秒
5. ✅ 应该显示 "✅ 已保存"

## 🔍 验证 JWT 模板

### 在 Clerk Dashboard 检查

JWT 模板应该包含以下声明：

```json
{
  "aud": "authenticated",
  "exp": {{session.expire_at}},
  "iat": {{session.created_at}},
  "iss": "{{env.CLERK_ISSUER}}",
  "sub": "{{user.id}}"
}
```

**最重要的是 `sub` 字段**，它包含用户 ID。

### 测试 API 调用

在浏览器控制台运行：

```javascript
// 测试获取令牌
fetch('/api/test-auth')
  .then(r => r.json())
  .then(data => {
    console.log('认证测试:', data);
    if (data.decodedToken && data.decodedToken.sub) {
      console.log('✅ JWT 配置正确，sub =', data.decodedToken.sub);
    } else {
      console.log('❌ JWT 配置错误，缺少 sub 字段');
    }
  });
```

## 🐛 常见问题

### 问题 1: 找不到 JWT Templates

**位置**: Clerk Dashboard → 左侧菜单 → **JWT Templates**

如果找不到，可能在：
- **Configure** 部分
- **Developers** 部分
- 或直接访问: `https://dashboard.clerk.com/apps/YOUR_APP_ID/jwt-templates`

### 问题 2: 模板名称错误

**错误**: 使用了 `Supabase`（大写）或其他名称
**正确**: 必须是 `supabase`（全小写）

### 问题 3: 配置后仍然失败

1. **清除浏览器缓存**
2. **退出并重新登录**
3. **重启开发服务器**
4. **检查 Supabase JWKS URL 是否正确**

### 问题 4: Supabase 中找不到 Clerk 选项

确保你的 Supabase 项目版本支持第三方认证。如果没有 Clerk 选项：

1. 进入 **Authentication** → **Providers**
2. 查找 **Third-party Auth** 或 **External Providers**
3. 或者手动配置 JWT Secret

## 📊 完整配置检查清单

- [ ] Clerk Dashboard 中创建了 JWT 模板
- [ ] 模板名称是 `supabase`（小写）
- [ ] 模板包含 `sub` 声明
- [ ] Supabase 中启用了 Clerk 认证
- [ ] Supabase 中配置了正确的 JWKS URL
- [ ] 数据库中运行了 RLS 策略（`supabase-schema.sql`）
- [ ] 环境变量配置正确
- [ ] 已重启开发服务器
- [ ] 已刷新浏览器
- [ ] `/debug-auth` 显示所有 ✅

## 🎯 快速测试命令

```bash
# 1. 重启服务器
npm run dev

# 2. 在浏览器中访问
http://localhost:3000/debug-auth

# 3. 检查控制台输出
# 应该看到 "✅ JWT 配置正确"
```

## 📝 如果问题仍然存在

提供以下信息：

1. `/debug-auth` 页面的截图
2. Clerk Dashboard JWT Templates 的截图
3. 浏览器控制台的完整错误
4. Supabase Dashboard Clerk 配置的截图

## ⚡ 最快的解决方案

如果你不想配置 Clerk + Supabase 集成，可以：

1. **临时禁用自动保存**
2. **使用本地存储**（localStorage）
3. **或者不登录，只在本地使用**

但长期来说，配置 JWT 模板是最好的解决方案！

---

**记住**: JWT 模板名称必须是 `supabase`（小写）！这是最常见的错误。
