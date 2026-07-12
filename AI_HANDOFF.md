# Lovart-KY AI 开发交接手册

最后更新：2026-07-12

当前基线提交：`f6c6009 feat: expand canvas workflows and restore agent panel`

当前分支：`main`，该基线已推送至 `origin/main`

基线之后的当前工作树已经完成 NodeDefinition 第二阶段迁移；若该改动尚未提交，必须保留并继续验证，不要重新实现。

## 0. 当前断点恢复区（最先阅读）

当前工作区不是干净基线，存在两组尚未提交的连续改动：

### A. NodeDefinition 第二阶段：已完成并验证

相关文件：

- `src/lib/node-definitions.ts`
- `src/lib/qdmy-project.ts`
- `src/hooks/useCanvasElements.ts`
- `scripts/test-canvas-connections.mjs`
- `scripts/test-qdmy-project.mjs`

完成状态：QDMY 映射、默认状态工厂、`creatable` / `runnable` 元数据和旧降级行为测试已经完成。不要重新写一套注册表。

### B. GenerationJob：已完成并验证

已经落盘：

- 新增 `src/lib/generation-jobs.ts`
- 视频启动 API 增加规范化 `jobStatus`
- 视频状态 API 增加 `jobStatus`、`failureKind` 和统一进度
- `VideoGeneratorPanel.tsx` 已改用统一任务状态判断
- `npm.cmd run lint` 可执行，但当前有 1 个 Hook 依赖警告
- `npx.cmd tsc --noEmit` 已通过

完成内容：

1. `VideoGeneratorPanel.tsx` 轮询 effect 已补齐 `elementId` 依赖，lint 警告已清零。
2. 已新增 `scripts/test-generation-jobs.mjs` 和 `test:generation-jobs` 命令。
3. 已覆盖成功、失败、取消、超时、过期、百分比字符串、越界进度、无输出 URL 和 100% 且有 URL 等测试。
4. 视频启动和状态 API 保留原始 `status` 兼容字段，并增加统一的 `jobStatus`、`failureKind` 和进度。
5. lint、TypeScript、全部专项测试、production build 与 `git diff --check` 已通过。
6. `AI_HANDOFF.md` 与 `MAYI_COMPLETION_ROADMAP.md` 仍在工作区中，必须保留。

下一位模型不要回滚上述文件，也不要重复实现 GenerationJob；后续媒体任务应复用 `src/lib/generation-jobs.ts`。

## 1. 给下一位模型的开场指令

你正在接手 `F:\Codex\lovart-ky`。不要从零重建，不要覆盖或回滚现有功能。开始工作前必须依次完成：

1. 阅读本文件。
2. 阅读 `MAYI_COMPLETION_ROADMAP.md`。
3. 执行 `git status --short --branch`，确认并保护用户已有改动。
4. 阅读与当前任务直接相关的源文件，不要只依据旧报告判断功能状态。
5. 完成修改后运行本文件第 9 节的验证命令。

恢复版功能参考位于：

```text
F:\Codex\recovered\桥豆麻衣酱_V3.4.4
```

恢复包只是行为参考，不是可直接复制的源代码。在线项目不得照搬 Tauri 文件系统、Rust 本地代理、客户端长期密钥或任意本地命令执行。

## 2. 文档可信度顺序

遇到文档冲突时按以下顺序判断：

1. 当前源码和测试
2. 本交接手册
3. `MAYI_COMPLETION_ROADMAP.md`
4. `MAYI_PARITY_PLAN.md`
5. `README.md`、历史恢复报告和旧接入文档

旧文档可能仍把已完成能力写成缺失，例如图片对比、局部重绘和 Agent 面板。必须先搜索当前源码再下结论。

## 3. 当前产品状态

### 可以正常使用和继续开发

- Next.js 16、React 19、TypeScript、Tailwind CSS 4
- Supabase Auth、项目保存、积分和兑换码
- 无限画布、平移缩放、小地图和大画布视口裁剪
- 图片、视频、文字、形状、路径及生成器节点
- 多选、分组、复制粘贴、删除、撤销和重做
- 节点端口、连线、多参考图、首尾帧和结果端口
- 图片多模型、批量数量、并行/顺序执行和模型偏好
- 视频生成、任务轮询和分镜视频流程
- 分镜、制作板、批量出图、批量视频和画幅适配
- 图片裁切、去背景、超分、重打光和多角度生成
- 图片对比、A/B 交换、滑杆持久化和快照导出
- 局部重绘、蒙版保存、画笔、擦除、羽化和结果节点
- 生成历史、搜索、图片/视频筛选、收藏、删除和放回画布
- QDMY 导入、导出、合并、未知字段保留和状态往返
- 未登录 IndexedDB 保存与登录项目持久化
- Agent 面板、四种模式、快捷任务、取消、防重复提交和错误展示
- 节点注册表第一版和 Feature Flag

### 已实现但尚未完成真实外部验收

- Agent UI 已完成浏览器冒烟测试，但没有使用真实测试账号调用外部模型。
- 必须在有效 Supabase 用户、Agent 模型凭据和可控额度下验收：
  - 创建分镜
  - 批量生成图片或角色三视图
  - 编辑选中图片或启动视频任务
- 局部重绘当前通过“原图 + mask 参考图”调用生成模型，不等同于原生 mask inpainting API。
- 图片对比导出远程图片时依赖图片源允许 CORS；Data URL 不受此限制。

### 完全或基本缺失

- 音乐生成和语音生成原生节点
- 通用音频画布元素和音频素材
- ComfyUI / RunningHub 工作流节点
- 视频抽帧、视频分析和动作迁移节点
- 多视频模型能力注册和用户偏好
- 全局素材库、角色库、姿势参考和跨项目复用
- 正式对象存储资产层及 Data URL 迁移
- 原生 mask inpainting、裁剪重绘和无缝拼回
- 分类项目容器、大项目分块导入和导入取消
- 项目/历史云备份
- 节点栏用户定制
- 3D 导演台、LUT 和独立剧本创作工作台

## 4. 最近一个阶段完成了什么

提交 `f6c6009` 包含：

- 图片对比节点
- 局部重绘节点和 API
- 生成历史和收藏
- 图片模型偏好管理
- QDMY 对比/重绘状态往返
- `NodeDefinition` 注册表第一版
- 注册表驱动的端口和创建菜单
- Agent 面板和 Agent 提交控制器
- Agent 请求取消和防重复提交
- Feature Flag
- 完整长期路线图

这个提交已经通过：

- ESLint
- TypeScript
- 画布连线/节点注册测试
- QDMY 往返测试
- 图片模型测试
- Next.js production build
- 本地浏览器 Agent 面板冒烟测试

## 5. 下一步应从哪里开始

### 已完成：NodeDefinition 第二阶段迁移

节点注册表现已接管端口、创建菜单、默认状态和 QDMY 双向类型映射，并保留旧降级行为。已完成：

1. `NodeDefinition` QDMY 导入/导出映射。
2. `qdmy-project.ts` 注册表查询及未知类型兜底。
3. 节点默认状态工厂。
4. `creatable` / `runnable` 元数据。
5. 注册表完整性及旧降级行为测试。

继续保持纯元数据注册表，不要把 React 组件直接塞进 `src/lib/node-definitions.ts`，以免制造循环依赖。

### 已完成：GenerationJob 收尾与验证

统一任务模型的专项测试和视频适配已经收尾：

```ts
type GenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

type GenerationJob = {
  id: string;
  nodeId: string;
  projectId?: string;
  kind: 'image' | 'video' | 'audio' | 'workflow' | 'analysis';
  status: GenerationJobStatus;
  progress: number;
  provider: string;
  model: string;
  inputAssetIds: string[];
  outputAssetIds: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};
```

当前类型和视频轮询适配已经落盘。下一步只修 lint 警告、增加纯函数测试、运行完整验证；不要在本轮加入数据库迁移。

### 第二优先：Agent 真实动作验收

如果环境具备有效测试账号和凭据，完成三类真实动作验收。未经用户确认，不要使用可能产生明显费用的账号或批量任务。

验收失败时先判断：

- Supabase 是否登录
- `XAI_API_KEY` / Agent provider 是否配置
- API 是否返回认证、配额、模型或解析错误
- 动作执行器是否重复扣费或重复插入节点
- 客户端取消是否只是停止等待，而服务端任务仍在继续

### 第三优先：音乐和语音节点

只有节点注册和任务模型稳定后再进入：

- `audio` CanvasElementType
- 音频播放器节点
- `music-generator` 和 `speech-generator`
- 服务端 provider 适配器
- 音频结果端口、历史、资产和下载
- 积分、失败退款和使用限额
- QDMY `gen-music` / `gen-speech` 原生往返

## 6. 长期修复目录

### L0：稳定性和技术债

- [x] 完成节点注册表端口、菜单、默认状态和 QDMY 映射迁移
- [x] 完成 GenerationJob 类型、视频适配和状态归一化
- [ ] 继续拆分 `CanvasPageClient.tsx`
- [ ] 建立 API 错误统一格式
- [ ] 建立关键浏览器端工作流测试
- [ ] 统一中文、英文和历史品牌文案

### L1：Agent 生产化

- [ ] 三类真实动作验收
- [ ] 服务端取消或任务状态恢复
- [ ] 对话会话持久化
- [ ] Agent 操作审计日志
- [ ] 请求限速和高成本动作确认
- [ ] 研究模式联网搜索的安全实现

### L2：音频能力

- [ ] 通用 audio 元素
- [ ] 音乐生成节点
- [ ] 语音生成节点
- [ ] 音频历史和素材库
- [ ] QDMY 音频节点往返
- [ ] 音频积分和退款

### L3：工作流能力

- [ ] Workflow Definition Schema
- [ ] ComfyUI 服务端注册表
- [ ] RunningHub App / ComfyUI 适配器
- [ ] 参数 Schema 表单
- [ ] 多输出和任务重试
- [ ] 禁止任意客户端工作流地址

### L4：视频能力

- [ ] 视频模型注册表
- [ ] Seedance、Sora、Veo、Kling、Wan、Grok、Hailuo 能力描述
- [ ] 视频模型隐藏、排序、最近使用和默认值
- [ ] 视频抽帧
- [ ] 视频分析/拆解
- [ ] 动作迁移
- [ ] 视频队列和并发限制

### L5：媒体资产与对象存储

- [ ] `media_assets` 数据模型
- [ ] 对象存储服务端适配器
- [ ] 缩略图、哈希去重和删除同步
- [ ] Data URL 联网迁移
- [ ] 全局图片/视频/音频素材库
- [ ] 搜索、标签、收藏和跨项目插入
- [ ] 角色库和姿势参考

### L6：高级图像工作流

- [ ] 原生 mask inpainting provider
- [ ] 裁剪局部重绘节点
- [ ] 无缝拼回节点
- [ ] 独立智能超清节点
- [ ] 全局视角节点
- [ ] 独立涂鸦节点
- [ ] 表格编辑节点

### L7：项目可移植性和性能

- [ ] 分类项目容器
- [ ] 导入/导出进度和取消
- [ ] 1000 节点项目分批解析
- [ ] 资源懒加载和图片 Worker
- [ ] 节点增量保存
- [ ] 项目和生成历史云备份
- [ ] 备份去重、删除同步和恢复重试

### L8：高级制作工具

- [ ] 3D 导演台
- [ ] LUT 预览和应用
- [ ] 剧本创作工作台
- [ ] 剧本到分镜转换
- [ ] 管理员 Provider 配置和健康检查
- [ ] 浏览器授权目录或安全下载任务

## 7. 关键文件地图

### 画布核心

- `src/app/lovart/canvas/CanvasPageClient.tsx`：页面总协调器，仍然过大
- `src/components/lovart/CanvasArea.tsx`：画布交互和节点渲染
- `src/hooks/useCanvasElements.ts`：节点创建和基础修改
- `src/hooks/useCanvasHistory.ts`：撤销重做
- `src/hooks/useCanvasViewport.ts`：平移缩放
- `src/lib/canvas-connections.ts`：端口、连线、循环检测和输入解析
- `src/lib/node-definitions.ts`：节点注册表第一版

### 项目和兼容

- `src/hooks/useProjectPersistence.ts`：云端/离线项目保存
- `src/lib/local-canvas-store.ts`：IndexedDB 离线项目
- `src/lib/qdmy-project.ts`：桥豆麻衣酱项目导入导出
- `scripts/test-qdmy-project.mjs`：QDMY 往返测试
- `scripts/test-canvas-connections.mjs`：端口和注册表测试

### 图片和视频生成

- `src/hooks/useCanvasGeneration.ts`：图片、视频结果落盘和历史写入
- `src/components/lovart/ImageGeneratorPanel.tsx`
- `src/components/lovart/VideoGeneratorPanel.tsx`
- `src/app/api/generate-image/route.ts`
- `src/app/api/generate-video/route.ts`
- `src/app/api/video-status/route.ts`
- `src/lib/image-models.ts`
- `src/lib/image-model-preferences.ts`

### 对比、重绘和图片工具

- `src/components/lovart/ImageCompareNode.tsx`
- `src/components/lovart/InpaintNode.tsx`
- `src/app/api/inpaint-image/route.ts`
- `src/hooks/useCanvasImageActions.ts`
- `src/lib/remove-background.ts`
- `src/lib/upscale.ts`

### Agent

- `src/components/lovart/AgentPanel.tsx`
- `src/hooks/useAgentPanelController.ts`
- `src/hooks/useAgentRunner.ts`
- `src/hooks/useAgentContext.ts`
- `src/app/api/agent/run/route.ts`
- `src/lib/agent/actions.ts`
- `src/lib/agent/executeAgentAction.ts`
- `src/lib/agent/executors/`

### 历史和素材

- `src/lib/generation-history.ts`
- `src/components/lovart/GenerationHistoryPanel.tsx`
- `src/hooks/useProjectAssets.ts`
- `src/components/lovart/AssetsPanel.tsx`

### 配置和安全

- `.env.example`
- `src/lib/feature-flags.ts`
- `src/lib/require-user.ts`
- `src/lib/authed-fetch.ts`
- `src/lib/credits.ts`
- `src/lib/usage-limits.ts`

## 8. 必须保持的工程约束

### 状态与兼容

- 新节点状态必须进入项目保存、离线保存、撤销重做和 QDMY 往返。
- `CanvasElement` 新字段保持可选，旧项目必须继续导入。
- 未识别的 QDMY 字段继续保留在 `recoveredDesktop`。
- 不要为了新节点破坏旧 connector 的端口推断。

### 安全

- Secret 只存在服务端环境或服务端加密存储。
- 不在客户端项目、localStorage、IndexedDB、日志或导出文件保存完整 Key。
- 不接受任意远程 ComfyUI 地址、任意文件路径或任意命令。
- 所有付费生成 API 必须认证、扣费、失败退款并受限额控制。
- 外部 URL 必须限制协议、超时、响应大小和允许域名。

### 媒体

- 新能力优先保存 assetId 和稳定 URL。
- 不继续扩大大型 Data URL 在项目 JSON 中的使用。
- 删除媒体前检查项目引用。
- 任务结果必须有明确 provider、model、prompt 和 taskId 元数据。

### Git

- 工作区可能包含用户未提交改动，禁止 `git reset --hard` 和无授权回滚。
- 每阶段保持可独立提交。
- 推送前运行完整验证并检查敏感信息。
- 不使用 force push。

## 9. 验证命令

Windows PowerShell 的脚本策略可能阻止 `npm.ps1`，使用 `.cmd`：

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test:connections
npm.cmd run test:qdmy
npm.cmd run test:image-models
npm.cmd run build
git diff --check
```

已知无害提示：

- `baseline-browser-mapping` 数据过期提示不影响构建。
- Git 可能提示 LF 将转换为 CRLF；只要 `git diff --check` 通过，不要为了消除提示批量改写全仓行尾。

涉及可见 UI 时还要进行浏览器冒烟测试：

- 页面可正常进入 `/canvas`
- 新入口唯一且可点击
- 面板打开、关闭和响应式布局正常
- 表单可输入且忙碌状态正确
- 浏览器控制台没有新增错误

## 10. 每项工作的完成定义

一个功能只有同时满足以下条件才算完成：

- 用户入口存在且真实可操作
- 失败、空状态、加载、取消和重试路径明确
- 刷新和重新打开项目后状态可恢复
- 离线保存没有被破坏
- QDMY 导入导出有明确策略
- 认证、积分、退款和限额符合现有规则
- 新逻辑有专项测试或合理的浏览器工作流验证
- lint、类型检查、全部专项测试和 production build 通过
- 文档更新，不留下“代码已写但入口关闭”的假完成状态

## 11. 下一位模型的首个建议任务

GenerationJob 适配已经完成，勿重复实现。下一项建议任务是继续拆分 `CanvasPageClient.tsx`，优先选择一个边界清晰、可独立测试的面板控制器或工作流状态模块，并保持现有画布行为不变。

开始下一项前：

1. 保留 `src/lib/generation-jobs.ts`、`scripts/test-generation-jobs.mjs` 及现有 NodeDefinition 改动。
2. 先检查 `CanvasPageClient.tsx` 当前职责和已有 hooks，避免重复抽取 Agent、历史或模型设置状态。
3. 每次只拆一个职责边界，保持 props 和持久化语义兼容。
4. 运行第 9 节全部验证命令，并补充与新抽取模块对应的专项测试。
5. 没有有效测试账号和凭据时，不要擅自触发可能产生费用的 Agent 外部动作。

音乐、语音和 ComfyUI 后续应共用同一 GenerationJob 模型，避免每种媒体重复实现状态机。
