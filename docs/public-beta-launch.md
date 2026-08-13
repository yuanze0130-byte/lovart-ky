# Doodleverse 公测启用清单

## 上线前必须完成

1. 在 Cloudflare Turnstile 创建 `doodleverse.cn` 和 `www.doodleverse.cn` 的站点，取得 Site Key 和 Secret Key。
2. 在 Supabase 控制台的 Auth > Bot and Abuse Protection 中启用 Cloudflare Turnstile，并填写 Secret Key。
3. 在服务器 `.env.production` 填写 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`。
4. 将 Supabase 登录邮件模板正文改为包含 `{{ .Token }}` 的 6 位验证码模板。
5. 确认 QQ、163、Gmail 三类邮箱都能收到验证码后，将 `NEXT_PUBLIC_AUTH_EMAIL_MODE=otp`。
6. 设置独立的 `SIGNUP_BONUS_HMAC_SECRET`，不要复用任何前端可见密钥。
7. 复核成本保险丝：
   - `AI_DAILY_COST_LIMIT_UNITS=50`
   - `AI_MAX_CONCURRENT_TASKS=4`
   - `AI_MAX_CONCURRENT_TASKS_PER_USER=1`
   - `AI_KILL_SWITCH=false`

## 紧急止损

遇到上游价格异常、恶意刷量或积分核算异常时，将服务器环境变量 `AI_KILL_SWITCH=true` 并重启应用。排查完成后再恢复为 `false`。

## 小规模验收

- 先邀请 20～50 人，连续观察 3～7 天。
- 每天检查 AI 成本预留、积分扣除、失败退款三者是否一致。
- 监控服务器磁盘、内存、5xx、邮件退信和登录 429。
- 验证同一邮箱不能重复领取新用户积分，同一 IP 24 小时最多领取 3 次。
- 验证个人画布素材超过 2GB 后会停止继续上传。
