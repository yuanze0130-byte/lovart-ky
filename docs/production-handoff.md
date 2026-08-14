# Doodleverse 生产环境交接文档

> 最后更新：2026-08-14  
> 当前生产版本：`a3e93d7`  
> 适用环境：Ubuntu Server 24.04 LTS / 2 核 4 GB / 自托管 Next.js

## 1. 项目概况

Doodleverse 是一套基于无限画布的 AI 图片、视频与创作工具平台，主要包含：

- 图片生成、图片编辑、超分、去背景和局部重绘
- 视频生成、动作迁移、视频抽帧和视频拆解
- 节点连线、参考图传递、分镜、导演台、全局视角和 RHAI 应用库
- Supabase 邮箱验证码登录、画布持久化、积分、卡密和生成任务账本
- 雨云服务器本地素材存储，素材不使用 Supabase Storage

当前生产链路：

```text
浏览器
  -> Nginx / HTTPS
  -> Next.js 16 / PM2 / 127.0.0.1:3000
  -> Supabase Auth + PostgreSQL
  -> Comfly AI 中转站

画布图片和视频
  -> /api/canvas-assets
  -> /www/storage/doodleverse/canvas
  -> Nginx /media/canvas（签名访问）
```

## 2. 生产环境信息

| 项目 | 当前值 |
| --- | --- |
| 主域名 | `https://doodleverse.cn` |
| 服务器 IP | `38.244.14.231` |
| 系统 | Ubuntu Server 24.04 LTS |
| 应用目录 | `/www/wwwroot/lovart-ky` |
| 素材目录 | `/www/storage/doodleverse/canvas` |
| 备份目录 | `/www/backup/doodleverse` |
| Nginx 配置 | `/www/server/panel/vhost/nginx/lovart-ky.conf` |
| PM2 进程 | `lovart-ky` |
| Git 分支 | `main` |
| Git 仓库 | `https://github.com/yuanze0130-byte/lovart-ky.git` |
| Supabase 项目 ID | `dlmrurongzvjwycpzogm` |
| AI 中转地址 | `https://ai.comfly.org` |
| 积分购买页 | `https://pay.ldxp.cn/item/v0rkqv` |

## 3. 访问与权限

### 3.1 SSH

- SSH 用户：`deploy`
- 本机部署私钥：`C:\Users\ASUS\.ssh\doodleverse_deploy_20260814`
- root SSH 登录：已关闭
- SSH 密码登录：已关闭
- `deploy` 用户具有免密码 sudo 权限，用于部署和运维

私钥不能提交到 Git、发送到聊天群或放入服务器 Web 目录。应另存一份加密备份。

历史 root 公钥仍保留在服务器，但因为 `PermitRootLogin no`，目前无法用于登录。不要在没有确认新密钥可用前调整 SSH 配置。

连接示例：

```powershell
ssh -i C:\Users\ASUS\.ssh\doodleverse_deploy_20260814 deploy@38.244.14.231
```

### 3.2 宝塔面板

宝塔面板端口为 `28784`，目前仍允许公网访问。这是公测前尚未完全收口的入口。

后续应选择一种方式处理：

1. 有固定管理 IP：防火墙只允许该 IP 访问 `28784`。
2. 没有固定 IP：使用 Tailscale/WireGuard 后关闭公网面板端口。

当前 UFW 对公网开放：

- `80/tcp`
- `443/tcp`
- `28784/tcp`
- `22/tcp`，使用 UFW LIMIT

## 4. 部署流程

### 4.1 部署前检查

在本地执行：

```powershell
git status --short
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

根据修改范围补跑专项测试，至少建议：

```powershell
npm.cmd run test:public-beta
npm.cmd run test:canvas-asset-import
npm.cmd run test:canvas-media
npm.cmd run test:canvas-render
npm.cmd run test:image-pricing
npm.cmd run test:video-pricing
npm.cmd run test:async-generation-security
```

### 4.2 提交与推送

```powershell
git add <本次修改文件>
git commit -m "说明本次变更"
git -c http.version=HTTP/1.1 push origin main
```

不要使用 `git reset --hard` 或直接覆盖生产工作区。

### 4.3 服务器部署

```bash
cd /www/wwwroot/lovart-ky
git pull --ff-only origin main
npm ci
npm run build
pm2 restart lovart-ky --update-env
pm2 save
```

### 4.4 部署后验证

```bash
git rev-parse --short HEAD
pm2 status lovart-ky
curl -L -sS -o /dev/null -w '%{http_code}\n' https://doodleverse.cn/lovart
pm2 logs lovart-ky --lines 50 --nostream
```

正常结果：页面最终返回 `200`，PM2 状态为 `online`。

生产工作区当前存在两个预期状态：

- `deploy/backup-doodleverse.sh` 只有可执行权限变化，没有内容差异。
- `.local-data/` 是历史素材目录，暂时不要删除。

## 5. 环境变量

生产环境文件：

```text
/www/wwwroot/lovart-ky/.env.production
```

权限必须保持为 `600`。文档只记录变量名，不记录密钥值。

### 5.1 基础与认证

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `NEXT_PUBLIC_AUTH_EMAIL_MODE=otp`
- `SIGNUP_BONUS_HMAC_SECRET`
- `SIGNUP_BONUS_IP_DAILY_LIMIT=3`

Supabase Auth 使用 6 位邮箱验证码。Turnstile 已接入登录界面。

### 5.2 AI 成本保险丝

当前建议值：

```text
AI_DAILY_COST_LIMIT_UNITS=50
AI_MAX_CONCURRENT_TASKS=4
AI_MAX_CONCURRENT_TASKS_PER_USER=1
AI_KILL_SWITCH=false
```

发现刷量、计价错误或上游价格异常时，立即设置：

```text
AI_KILL_SWITCH=true
```

然后重启 `lovart-ky`。排查完毕后再恢复为 `false`。

### 5.3 素材存储

生产环境必须包含：

```text
CANVAS_ASSET_DIR=/www/storage/doodleverse/canvas
CANVAS_ASSET_MAX_BYTES=20971520
CANVAS_VIDEO_ASSET_MAX_BYTES=67108864
CANVAS_USER_STORAGE_MAX_BYTES=2147483648
CANVAS_ASSET_MAX_CONCURRENT_WRITES=2
CANVAS_ASSET_MAX_CONCURRENT_WRITES_PER_USER=1
CANVAS_ASSET_MAX_QUEUED_WRITES=20
CANVAS_ASSET_MIN_FREE_BYTES=5368709120
CANVAS_ASSET_URL_SECRET=<独立强随机密钥>
CANVAS_ASSET_ALLOW_MULTIPART=false
CANVAS_REMOTE_ASSET_TIMEOUT_MS=45000
```

代码已加入保护：生产环境缺少 `CANVAS_ASSET_DIR` 时会拒绝写入，不再回退到项目目录。

### 5.4 AI 渠道

所有 AI 渠道目前统一走 Comfly 中转。相关变量包括：

- `GEMINI_API_KEY` / `GEMINI_BASE_URL`
- `GEMINI_PROXY_*`
- `VIDEO_API_KEY` / `VIDEO_API_BASE_URL`
- `VIDEO_MODEL_*`
- `XAI_API_KEY` / `XAI_BASE_URL`
- `OBJECT_DETECTION_*`
- `RUNNINGHUB_*`

除非明确启用官方渠道，否则不要在前端暴露任何上游密钥。

## 6. 素材存储与签名访问

### 6.1 正式目录

所有画布图片、缩略图、视频和视频封面必须写入：

```text
/www/storage/doodleverse/canvas/<user-id>/<sha256>.<ext>
```

Nginx 的 `/media/canvas/` 读取这个目录，并通过 `/api/canvas-assets/authorize` 验证短期签名。未签名地址应返回 `403`。

### 6.2 2026-08-14 黑图事故

现象：生成结果先显示黑块，随后显示“图片加载失败，请重新打开画布重试”。

根因：`.env.production` 缺少 `CANVAS_ASSET_DIR`，Next.js 将原图写入：

```text
/www/wwwroot/lovart-ky/.local-data/canvas-assets
```

Nginx 却从正式目录读取，导致已签名图片返回 `404`。

已完成：

- 历史素材复制回正式目录，未覆盖同名文件。
- 生产环境固定 `CANVAS_ASSET_DIR=/www/storage/doodleverse/canvas`。
- 图片组件增加预览图、原图、缩略图自动回退。
- 生产环境缺少素材目录变量时直接拒绝写入。

历史目录暂时保留：

```text
/www/wwwroot/lovart-ky/.local-data/canvas-assets
```

确认至少完成一次新的数据库和素材备份，并核对所有引用后，才可以安排清理。

### 6.3 黑图排查方法

1. 浏览器检查图片 `naturalWidth` 是否为 `0`。
2. 检查图片 URL 返回码：`403` 表示签名问题，`404` 表示文件路径或文件缺失。
3. 按哈希搜索两个素材目录。
4. 检查 `.env.production` 中的 `CANVAS_ASSET_DIR`。
5. 检查 Nginx `/media/canvas/` 的 alias 是否指向正式目录。

不要通过关闭签名校验来修复图片问题。

## 7. Supabase

### 7.1 使用范围

Supabase 负责：

- 邮箱 OTP 登录
- 用户、项目与画布节点
- 积分余额与流水
- 卡密与兑换记录
- AI 成本预留和异步任务账本

图片和视频二进制文件不存入 Supabase Database 或 Supabase Storage。

### 7.2 安全边界

下列表只允许 `service_role` 访问，浏览器角色没有权限：

- `ai_cost_reservations`
- `async_generation_jobs`
- `credit_orders`
- `credit_packages`
- `payment_events`
- `redeem_code_batches`
- `redeem_codes`
- `signup_bonus_claims`
- `video_generation_jobs`

RLS 无策略的 INFO 对这些服务端专用表是预期状态。

### 7.3 数据库维护记录

`canvas_elements` 曾因历史 base64 大字段更新产生约 123 MB TOAST 膨胀。2026-08-14 已执行表重写和分析，表体积降至约 240 KB。

以后禁止把 `data:` 或 `blob:` URL 持久化到数据库；必须先上传到雨云素材目录，再保存文件 URL。

### 7.4 SQL 迁移

重要迁移位于 `sql/`：

- `credit_transactions.sql`
- `video-credit-ledger.sql`
- `async-generation-jobs.sql`
- `public-beta-ai-budget.sql`
- `public-beta-canvas-quotas.sql`
- `public-beta-database-hardening.sql`
- `public-beta-server-table-grants.sql`
- `public-beta-signup-protection.sql`

执行迁移前先备份。数据库迁移应向前修复，不要随意回滚或删除生产表。

## 8. 积分与计费

当前规则：

- 新用户赠送：15 积分
- 图片：1 个 Comfly 成本单位按 15 积分换算
- 视频：1 个 Comfly 成本单位按 15 积分换算
- 图片和视频默认加价率：5%
- 价格向上取整，服务端报价和实际扣费共用同一配置
- 明确失败任务自动幂等退款
- 结果未知、提交已被上游接受但本地中断时，不应立即退款，应进入对账状态

定价代码：

- `src/lib/image-pricing.ts`
- `src/lib/video-pricing.ts`
- `src/lib/model-pricing-catalog.ts`

用户价格页：

```text
/help
```

充值方案目前为：

- 50 元购买 500 积分
- 支付站发放卡密
- 用户回到 `/user#recharge` 兑换
- 不接入支付宝直连接口

修改模型积分时必须同时更新定价测试，并核对帮助页展示。

## 9. 异步任务与退款

视频、超分和动作迁移使用任务账本校验任务归属，状态接口不能只根据 `taskId` 返回结果。

必须保持以下原则：

- 提交前预留或扣除积分。
- 本地任务记录包含 `user_id`、`request_id`、`task_id` 和任务类型。
- 状态查询必须按用户和任务类型 fail-closed。
- 成功、失败、取消和退款必须幂等。
- 上游已接受但本地结果不确定时标记 `outcome_unknown`，不要直接退款。
- 客户端取消信号应尽量传递到服务端和上游请求。

相关文件：

- `src/lib/ai-safety.ts`
- `src/lib/async-generation-jobs.ts`
- `src/lib/generation-jobs.ts`
- `src/app/api/generate-video/route.ts`
- `src/app/api/video-status/route.ts`
- `src/app/api/upscale-status/route.ts`
- `src/app/api/motion-transfer/status/route.ts`

## 10. 备份与恢复

### 10.1 当前自动备份

备份脚本：

```text
/www/wwwroot/lovart-ky/deploy/backup-doodleverse.sh
```

Cron：

```text
17 18 * * * root /www/wwwroot/lovart-ky/deploy/backup-doodleverse.sh >> /www/wwwlogs/doodleverse-backup.log 2>&1
```

备份内容：

- Supabase 业务表和 Auth 用户导出为 gzip JSON
- `/www/storage/doodleverse/canvas` 素材压缩包
- 默认保留 7 天

### 10.2 当前限制

备份仍在同一台服务器。磁盘损坏、误删整机或云厂商故障时，同机备份也会丢失。

公测后应尽快增加异地备份，目标可以是：

- 对象存储
- 另一台服务器
- 管理员本地加密磁盘

异地备份应至少每日同步一次，并每月做一次恢复演练。

## 11. 日常监控

每天检查：

- PM2 进程是否 online
- 首页和画布是否返回 200
- 生成接口 4xx/5xx 和超时数量
- AI 成本预留、实际扣分、失败退款是否一致
- `outcome_unknown` 是否长期未对账
- 磁盘剩余空间和素材增长速度
- Supabase 数据库容量
- 邮箱验证码发送失败率和登录 429
- 备份日志和最新备份时间

常用命令：

```bash
pm2 status lovart-ky
pm2 logs lovart-ky --lines 100 --nostream
df -h /www
du -sh /www/storage/doodleverse/canvas
sudo tail -n 100 /www/wwwlogs/doodleverse-backup.log
sudo ufw status numbered
```

## 12. 常见故障

### 图片返回 403

- 检查 `CANVAS_ASSET_URL_SECRET` 是否变化。
- 检查签名刷新接口是否成功。
- 检查 Nginx `auth_request` 配置。

### 图片返回 404

- 检查 `CANVAS_ASSET_DIR`。
- 检查正式目录是否存在对应哈希文件。
- 搜索历史 `.local-data/canvas-assets` 目录。

### 图片生成成功但没有进入画布

- 检查 `/api/generate-image` 返回结构是否被候选提取器识别。
- 检查浏览器控制台和 PM2 中的 `generate-image` 日志。
- 检查生成节点是否在结果写回前被删除。
- 不要仅凭上游显示成功就手工退款，先确认任务账本状态。

### 画布显示离线或无法保存

- 检查 Supabase Auth 会话。
- 检查 `projects` 和 `canvas_elements` 请求。
- 检查浏览器是否仍保存 `data:`/`blob:` 素材。
- 检查用户项目、节点和个人素材配额。

### 素材上传返回 507

- 检查个人 2 GB 配额。
- 检查服务器是否低于 5 GB 安全剩余空间。
- 不要直接关闭空间保护，应先清理无引用素材或扩容。

### 登录邮件失败

- 检查 Supabase SMTP 配置和发送日志。
- 检查邮件模板是否使用 `{{ .Token }}`。
- 检查 Turnstile 域名和 Secret Key。
- 不要连续点击，登录接口存在频率限制。

## 13. 安全状态与遗留事项

已完成：

- 邮箱 6 位 OTP 登录
- Cloudflare Turnstile
- root 和 SSH 密码登录关闭
- UFW 最小化开放端口
- 画布素材签名访问
- AI 请求体、图片大小、并发和频率限制
- 异步任务所有权检查
- 服务端专用表权限收紧
- 依赖审计 0 个已知漏洞
- 数据库和素材每日备份

仍需处理，按优先级排序：

1. 限制宝塔端口 `28784` 只允许可信 IP 或 VPN。
2. 建立异地备份，避免整机故障导致备份同时丢失。
3. 安排 Ubuntu 系统升级维护窗口；升级前备份，升级后验证并按需重启。
4. 增加无引用素材垃圾回收，当前只有磁盘水位保护。
5. Supabase 泄露密码保护仍为 WARN；当前 OTP-only 不阻塞公测，如以后启用密码登录必须开启。
6. 验证历史 `.local-data` 素材全部迁移并完成新备份后，再决定是否清理。

## 14. 安全回滚

代码出现问题时优先使用 Git revert，保留完整审计记录：

```bash
git revert <problem-commit>
git push origin main
```

然后按正常部署流程重新构建和重启。

只回滚应用代码不会自动回滚数据库。涉及 SQL 迁移时，应先判断旧代码是否兼容新结构；不确定时先开启 `AI_KILL_SWITCH`，暂停付费生成，再制定前向修复方案。

严禁：

- `git reset --hard`
- 直接删除生产素材目录
- 直接删除 Supabase 生产表
- 把 `.env.production` 或私钥提交到 Git
- 为解决 403 临时关闭素材签名校验

## 15. 交接验收清单

- [ ] 能使用 `deploy` 密钥登录服务器
- [ ] 能进入宝塔并识别 Nginx、PM2 和防火墙配置
- [ ] 能完成一次测试环境或生产小版本部署
- [ ] 能打开画布并生成一张图片、一段视频
- [ ] 能确认积分扣除和失败退款流水
- [ ] 能手动执行备份并找到备份文件
- [ ] 能使用 `AI_KILL_SWITCH` 紧急停止生成
- [ ] 知道正式素材目录与历史目录的区别
- [ ] 知道 Supabase 服务端表不能开放给浏览器角色
- [ ] 已将所有密钥保存到受控的密码管理器或加密介质
