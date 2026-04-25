# Lovart-KY 🎨

一个基于 `Next.js 16 + Supabase + AI API` 的设计画布项目，支持 AI 设计建议、图片生成、视频生成、项目持久化和积分系统。

## 功能特性
- AI 设计建议生成
- 画布编辑与元素管理
- 图片生成（Gemini 兼容接口 / 官方接口）
- 视频生成（外部视频 API）
- Supabase OTP 登录
- Supabase 项目、素材与积分存储

## 技术栈
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- OpenAI SDK（用于兼容 Gemini / XAI 网关）

## 当前状态
- 已具备可演示的产品骨架
- 认证方案已切换为 `Supabase Auth`
- 文档中旧的 `Clerk` 说明已不再适用

## 本地启动

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制环境模板：
```bash
cp .env.example .env.local
```

然后填写 `.env.local`。

最少需要：
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

如果要完整启用 AI 能力，再补充：
```env
GEMINI_API_KEY=...
GEMINI_BASE_URL=https://ai.t8star.cn/v1

XAI_API_KEY=...
XAI_BASE_URL=https://ai.t8star.cn/v1
XAI_MODEL=gpt-4o

VIDEO_API_KEY=...
VIDEO_API_BASE_URL=https://ai.t8star.cn
```

### 3. 准备数据库
请先在 Supabase 中执行项目附带的 SQL：
- `supabase-schema.sql`
- `add-user-credits.sql`

如果使用视频参考图上传，还需要创建对应 Storage Bucket：
- 默认 bucket：`video-references`

### 4. 启动开发环境
```bash
npm run dev
```

常用命令：
```bash
npm run lint
npm run build
npm run start
```

## 主要环境变量
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`
- `NEXT_PUBLIC_ADMIN_EMAILS`
- `GEMINI_PROVIDER`
- `GEMINI_API_KEY`
- `GEMINI_BASE_URL`
- `GOOGLE_GEMINI_API_KEY`
- `XAI_API_KEY`
- `XAI_BASE_URL`
- `XAI_MODEL`
- `VIDEO_API_KEY`
- `VIDEO_API_BASE_URL`

完整列表见 `.env.example`。

## 项目结构
- `src/app`：页面与 API 路由
- `src/components/lovart`：画布与工作台组件
- `src/hooks`：项目保存、画布操作、生成逻辑
- `src/lib`：Supabase、积分、图像处理等基础能力
- `sql` / `*.sql`：数据库脚本

## 标记编辑（第一版）
- 已支持图片元素的 `标记编辑` 入口
- 支持点击对象 → 后端识别 → 返回 bbox / polygon / maskUrl 协议
- 当前支持三种检测 provider：
  - `vision`
  - `stub`
  - `sam`
- `sam` 模式下，若配置 `OBJECT_SEGMENTATION_ENDPOINT`，会调用外部分割服务
- 相关文档：
  - `docs/object-segmentation-api.md`
  - `docs/object-segmentation-mock-example.md`

## 已知问题
- 部分页面仍存在历史中文乱码与品牌命名不统一的问题
- 标记编辑当前仍以 bbox + prompt 局部编辑为主，尚未接入真实 mask inpainting
- 某些旧文档仍保留历史接入方案说明，需继续清理

## License
MIT
