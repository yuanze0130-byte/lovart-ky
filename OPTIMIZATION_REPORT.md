# Lovart-KY 优化报告

## 我已经完成的基础优化

### 1. Supabase 类型系统补强
- 为 `src/lib/supabase.ts` 增加了 `Json` 类型，替换掉 `any`
- 保留 `Database` 类型声明，便于后续页面和 API 正确推导

### 2. `useSupabase` 重构
- 重写了 `src/hooks/useSupabase.ts`
- 修复 effect 中同步 setState 触发的 lint 问题
- 使用取消标记避免异步竞态
- 仅在 token 就绪后创建 client

### 3. API 路由健壮性提升
已处理：
- `src/app/api/generate-design/route.ts`
- `src/app/api/generate-image/route.ts`
- `src/app/api/generate-video/route.ts`
- `src/app/api/video-status/route.ts`

优化内容：
- 删除 `any`
- 使用更明确的 response 类型
- 统一 `unknown -> Error` 错误收口
- 减少因为上游接口返回结构变化导致的脆弱性

### 4. 页面层一部分类型问题修复
已处理：
- `src/app/lovart/projects/page.tsx`
- `src/app/lovart/user/page.tsx`
- `src/app/lovart/page.tsx`
- `src/app/lovart/canvas/page.tsx`（部分）

优化内容：
- 去掉若干 `supabase as any`
- 去掉部分 `@ts-ignore`
- 修复文案中的 React unescaped entities 问题

---

## 当前项目最值得优先优化的点

### P0：画布页状态管理过重
文件：`src/app/lovart/canvas/page.tsx`

问题：
- 页面承担了太多职责：保存、加载、生成、选择、拖拽、面板显示、URL 状态
- `elements` 任何变化都会触发整页级联更新
- `saveProject` / `loadProject` / 自动保存逻辑耦合较深

建议：
1. 拆成 `useCanvasState`
2. 拆成 `useProjectPersistence`
3. 拆成 `useGenerationActions`
4. 把 `elements` 改成 reducer 或 Zustand store

预期收益：
- 画布拖拽和编辑更顺
- 自动保存逻辑更稳定
- 更容易做撤销/重做、协作、历史版本

### P1：CanvasArea 渲染性能还有明显空间
文件：`src/components/lovart/CanvasArea.tsx`

问题：
- 当前仍然以内联 map 渲染全部元素
- 鼠标移动期间会频繁触发所有元素重渲染
- 大量局部 handler 在组件内创建

建议：
1. 真正接入 `CanvasElementComponent` 做元素级 memo
2. 对拖拽/缩放/框选使用 `requestAnimationFrame`
3. 大画布元素超过阈值后做视口裁剪（virtualization）
4. 把 connector 层和 element 层进一步拆开 memo

### P1：图片组件还没做 Next.js 优化
问题：
- 多处继续使用 `<img>`
- 项目卡片、预览图、画布缩略内容会影响性能和 LCP

建议：
- 列表页与项目封面改 `next/image`
- 画布内部的自由变换图片可保留 `<img>`，但应加 lazy 和尺寸约束

### P1：AI 交互层重复逻辑较多
文件：
- `DesignChat.tsx`
- `AiDesignerPanel.tsx`
- 画布页内 `handleAiChat`

问题：
- 请求逻辑重复
- 自动发送 initial prompt 的逻辑分散
- 聊天消息状态模型不统一

建议：
- 抽一个 `useDesignChat` hook
- 抽一个统一 `aiClient.ts`
- 把 prompt、loading、error、message append 逻辑集中

### P2：保存策略比较粗暴
问题：
- 保存时直接删掉全部 `canvas_elements` 再重插
- 这会导致：
  - 数据库写入量大
  - 网络慢时体验差
  - 后续做协作/历史版本困难

建议：
- 改为 diff-based upsert：
  - 新增：insert
  - 修改：update/upsert
  - 删除：delete ids
- 如果短期不做 diff，也至少批量 upsert 而不是全删全插

### P2：类型与 schema 仍然没有彻底对齐
问题：
- `element_data` 目前只是 Json
- 但业务真实模型其实是 `CanvasElement`

建议：
- 建立 `canvas.ts` 统一类型源
- API / UI / DB 映射分层：
  - `CanvasElement`
  - `PersistedCanvasElement`
  - `GeneratedAsset`

---

## 我对这个项目的整体判断

这是一个方向不错、交互雏形已经有了的 AI 设计画布项目，问题不在“能不能跑”，而在：

1. **状态管理还处于原型阶段**
2. **类型系统比较松，后期维护成本会越来越高**
3. **性能优化还没有开始系统做**
4. **AI 能力已经接进来了，但抽象层还不统一**

也就是说，这个项目现在最适合做的是：

- **先把工程骨架收紧**
- **再做性能优化**
- **最后再继续堆功能**

否则功能越多，后面越难改。

---

## 建议的下一步执行顺序

### 方案 A：先做“工程稳固版”
适合你想把项目长期开源维护。

1. 清掉剩余 lint/type error
2. 重构 `canvas/page.tsx`
3. 抽离 AI 请求层
4. 改造持久化保存策略
5. 补基础 README / env / architecture 文档

### 方案 B：先做“体验提升版”
适合你想先把 demo 做得更好看、更顺。

1. 优化画布拖拽和缩放性能
2. 优化图片/视频预览加载
3. 改善空状态、错误态、生成中态
4. 调整项目列表与用户页观感

### 方案 C：我直接继续代你改
我建议优先改这 3 个：

1. **重构 `src/app/lovart/canvas/page.tsx`**
2. **把保存逻辑改成更合理的 persistence 层**
3. **把 AI 设计聊天和生成逻辑统一抽成 hook/service**

这三个改完，这个项目的可维护性会明显上一个台阶。
