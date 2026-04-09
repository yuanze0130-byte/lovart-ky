# Lovart-KY 🎨

一个基于 Next.js + Clerk + Supabase 的 AI 设计画布项目，支持 AI 对话、图片生成、视频生成与项目持久化。

## 功能特性

- AI 设计建议生成
- 画布编辑与元素管理
- 图片生成（Gemini）
- 视频生成（外部视频 API）
- Clerk 用户登录
- Supabase 项目与积分存储

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Clerk
- Supabase
- OpenAI SDK（兼容 Gemini / XAI 网关）

## 本地启动

### 1. 克隆仓库

```bash
git clone https://github.com/yuanze0130-byte/lovart-ky.git
cd lovart-ky
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制环境模板：

```bash
cp .env.example .env.local
```

然后填写 `.env.local`。

最少需要：

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

如果要完整使用 AI 能力，再补：

```env
GEMINI_API_KEY=...
GEMINI_BASE_URL=https://ai.t8star.cn/v1

XAI_API_KEY=...
XAI_BASE_URL=https://ai.t8star.cn/v1
XAI_MODEL=gpt-4o

VIDEO_API_KEY=...
VIDEO_API_BASE_URL=https://www.clockapi.fun/v1
```

## 开发命令

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## 部署到 Vercel

在 Vercel 中配置与 `.env.local` 相同的环境变量即可。

当前项目依赖以下变量：

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `GEMINI_BASE_URL`
- `XAI_API_KEY`
- `XAI_BASE_URL`
- `XAI_MODEL`
- `VIDEO_API_KEY`
- `VIDEO_API_BASE_URL`

## 当前已完成的工程优化

- 清理并修复了一批 TypeScript / ESLint 问题
- 重构了 `useSupabase` 初始化逻辑
- 补齐了 Supabase `Database` 类型定义
- 修复了多个页面的查询结果类型收口问题
- 加强了图片 / 视频 / 设计生成 API 的错误处理
- 将 Next 16 的 `middleware` 迁移为 `proxy`
- 补充 `.env.example`

## 当前仍需注意

如果本地 `npm run build` 报错缺少 Clerk key，通常不是代码问题，而是本地没有提供 `.env.local`。

## License

MIT
