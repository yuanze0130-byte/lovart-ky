# Doodleverse New API 部署交接文档

更新时间：2026-08-19
项目域名：`doodleverse.fun`

## 1. 项目概况

本项目是在雨云服务器上部署的 New API 聚合网关，当前接入 Comfly 作为上游服务商。

- 前台地址：<https://doodleverse.fun>
- 模型广场：<https://doodleverse.fun/pricing>
- New API 版本：`v1.0.0-rc.24`
- 部署方式：Docker Compose
- 数据库：PostgreSQL 15
- 缓存：Redis 7 Alpine
- 反向代理：宝塔 Nginx
- HTTPS：Let's Encrypt

## 2. 服务器信息

| 项目 | 信息 |
|---|---|
| 服务器 IP | `38.244.14.231` |
| SSH 用户 | `deploy` |
| SSH 认证 | 密钥认证，私钥由管理员单独保管 |
| New API 目录 | `/opt/new-api` |
| New API 容器 | `new-api` |
| PostgreSQL 容器 | `new-api-postgres` |
| Redis 容器 | `new-api-redis` |
| 主机监听端口 | `6868` |
| 容器应用端口 | `3000` |

SSH 示例：

```bash
ssh -i <私钥文件> deploy@38.244.14.231
```

私钥、服务器密码和 API Key 不得写入本文件或提交到代码仓库。

## 3. 域名与 HTTPS

### 3.1 DNS

`doodleverse.fun` 和 `www.doodleverse.fun` 应解析到：

```text
38.244.14.231
```

### 3.2 Nginx 配置

HTTP 配置：

```text
/www/server/panel/vhost/nginx/doodleverse.fun.conf
```

HTTPS 配置：

```text
/www/server/panel/vhost/nginx/doodleverse.fun.ssl.conf
```

反向代理目标：

```text
http://127.0.0.1:6868
```

### 3.3 SSL 证书

证书目录：

```text
/etc/letsencrypt/live/doodleverse.fun
```

证书覆盖：

- `doodleverse.fun`
- `www.doodleverse.fun`

当前证书到期时间：2026-11-15。Let's Encrypt 自动续期测试已经通过。

续期检查：

```bash
sudo certbot renew --dry-run
```

Nginx 配置检查及重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3.4 品牌静态资源

网站 Logo 等公开品牌资源使用独立静态目录：

```text
/www/wwwroot/doodleverse.fun-assets
```

Nginx 通过 `/brand-assets/` 路径提供 HTTPS 访问。当前 Logo：

```text
https://doodleverse.fun/brand-assets/doodleverse-logo.png
```

该 URL 已验证返回 `200` 和 `Content-Type: image/png`。替换同名文件后浏览器最多可能缓存 1 小时，可使用强制刷新检查更新。

### 3.5 Doodleverse 文档站

文档页面使用 Doodleverse 自有内容，页面结构参考常见的 VuePress 文档站，包含左侧分类目录、正文、右侧目录和深色/浅色主题切换。

生产文件目录：

```text
/www/wwwroot/doodleverse-docs/index.html
```

公开地址：

```text
https://doodleverse.fun/docs/
```

Nginx HTTPS 配置中的路径映射：

```nginx
location ^~ /docs/ {
    alias /www/wwwroot/doodleverse-docs/;
    index index.html;
    try_files $uri $uri/ /docs/index.html;
}
```

本地源文件为 `docs-site/index.html`。更新流程：先备份生产文件，再上传新文件，执行 `nginx -t`，通过后 `sudo systemctl reload nginx`，最后检查 `/docs/`、Logo 和锚点链接。

本次上线前的配置备份：

```text
/www/server/panel/vhost/nginx/doodleverse.fun.ssl.conf.pre-docs-20260819
/www/wwwroot/doodleverse-docs-backups/index.html.pre-mobile-fix-20260819
```

## 4. Docker 服务

进入项目目录：

```bash
cd /opt/new-api
```

由于该目录需要管理员权限，`deploy` 用户操作时通常需要使用 `sudo`。

查看服务状态：

```bash
sudo docker compose ps
```

查看 New API 日志：

```bash
sudo docker logs --tail 200 new-api
```

重启服务：

```bash
sudo docker compose restart
```

升级前必须先备份数据库，并检查新版 New API 的数据库迁移及兼容性说明。

## 5. 宝塔面板说明

宝塔面板的网站列表可能显示为空，但服务器上已存在并生效的手工 Nginx 虚拟主机配置。

不要为了让网站出现在宝塔列表中，直接修改宝塔 SQLite 数据库或重新创建同名网站，否则可能覆盖现有生产配置。

服务器上另有 `doodleverse.cn` 站点。修改 `doodleverse.fun` 时不得覆盖或删除 `doodleverse.cn` 的 Nginx 配置。

## 6. Comfly 上游配置

### 6.1 New API 渠道

| 项目 | 当前值 |
|---|---|
| 基础渠道 | `Comfly-Default` |
| 路由渠道前缀 | `Comfly-Route-` |
| 渠道类型 | OpenAI |
| Base URL | `https://ai.comfly.org` |
| 上游分组配置 | 24 个 |
| 当前有独占模型的路由渠道 | 10 个 |
| 已配置模型 | 1001 个，跨渠道不重复 |
| 渠道状态 | 已启用 |

Base URL 不得填写成 `/v1/chat/completions`，New API 会自动追加接口路径。

New API `v1.0.0-rc.24` 的单个渠道分组字段只有 64 个字符，并且服务重启时会按“渠道分组 × 渠道模型”自动重建能力索引。因此不能把 24 个分组塞进一个渠道，也不能手工维持单渠道的唯一路由能力索引。

当前采用多渠道路由：`Comfly-Default` 只保存 `default` 模型，其余有独占模型的分组分别使用一个 `Comfly-Route-*` 渠道。每个模型只归入按 Comfly 令牌优先级首次命中的分组，所有渠道仍复用同一套 Comfly 上游配置。

### 6.2 Comfly 令牌

Comfly 后台存在名为 `Doodleverse.fun` 的令牌：

- 令牌渠道分组：`default +23`，即账户后台当前可选的全部 24 个分组
- 已关闭 Comfly 跨分组自动选择
- 分组优先级严格按后台截图的 Priority1 至 Priority24

关闭 Comfly 跨分组自动路由后，请求只会在令牌明确选中的 24 个分组中按优先级匹配。New API 令牌使用 `auto` 分组，并按相同顺序选择本地路由渠道。

New API 的 `ModelRatio` 和 `ModelPrice` 保存 Comfly 基础价格，不预乘分组倍率；实际首次命中的 Comfly 分组倍率保存在 New API `GroupRatio` 中。不得同时预乘模型价格和配置分组倍率，否则会重复计费。

Comfly 公开价格接口还可能返回令牌后台不可选的内部或未开放分组。目前 `claude逆`、`sd-ip` 不在此账户的令牌选择列表中，不得将其作为可调用线路单独计价。

API Key 由管理员在 Comfly 和 New API 后台维护，本文件不记录密钥内容。

## 7. 模型与定价

### 7.1 数据来源

Comfly 公开定价接口：

```text
https://ai.comfly.org/api/pricing
```

辅助倍率接口：

```text
https://ai.comfly.org/api/ratio_config
```

应优先使用 `/api/pricing`。`/api/ratio_config` 对部分新模型可能缺少输出倍率或更新不及时，不得未经核对直接整表覆盖。

### 7.2 当前配置

- 前台启用模型：1001 个
- 按 Token 计费模型：684 个
- 按次计费模型：317 个
- New API 分组倍率：与 Comfly 的 24 个令牌分组逐项一致
- 当前令牌分组：`auto`
- 当前对用户展示和计费的是首次命中线路的 Comfly 基础价格 × 对应分组倍率
- 同步时采用合并方式，保留 New API 原有的非 Comfly 定价

当前 1001 个模型实际分布在 10 个非空路由分组：`default` 818、`claude官` 9、`ssvip` 50、`openai官-优质` 41、`origin` 45、`vip` 1、`vvip` 4、`gemini优质` 14、`veo&grok-备用1` 12、`fal.ai-all` 7。

其余 14 个分组仍保留在 `GroupRatio`、`UserUsableGroups` 和 `AutoGroups` 中，但当前没有独占模型，因为其支持的模型均已被更高优先级分组先命中。这不是漏同步。

已同步的计费字段包括：模型倍率、补全倍率、缓存倍率、创建缓存倍率、音频倍率、音频输出倍率、图像倍率和固定价格。

Comfly 当前另有 46 个包含分辨率、时长、输入数量或其他参数矩阵的按次模型。New API `v1.0.0-rc.24` 无法通用导入这些任意参数阶梯，只能保存单一固定价格。为避免前台展示价和实际扣费不一致，这 46 个模型已从渠道模型列表和 `abilities` 可用性索引中排除，待实现对应参数计费适配后再开放。

前台已按照模型名称识别供应商，包括：

- OpenAI
- Anthropic
- Google
- DeepSeek
- 阿里巴巴
- 字节跳动
- Moonshot
- MiniMax
- 智谱
- xAI
- 快手
- Vidu
- Meta 等

### 7.3 计费公式

New API 配额单位：

```text
500,000 配额 = 1 美元
```

按 Token 模型：

```text
费用 =（输入 Token + 输出 Token × 补全倍率）× 模型倍率 × 分组倍率 ÷ 500,000
```

按次模型：

```text
费用 = 模型固定价格 × 分组倍率
```

### 7.4 已验证价格

| 模型 | 当前前台价格 |
|---|---|
| `gpt-5.6-luna` | 输入 `$1/1M`，输出 `$6/1M` |
| `claude-sonnet-4-6` | 输入 `$3/1M`，输出 `$15/1M` |
| `gpt-image-2-all` | `$0.04/请求` |
| `gpt-image-2-4k` | `$0.04/请求` |
| `grok-video-3` | `$0.15/请求` |

部分带日期的模型别名可能明显更贵。例如 `gpt-5.6-luna-2026-07-09` 在 Comfly 数据中本身就是高倍率模型，不应擅自复制无日期版本的低价。

### 7.5 商业定价建议

当前 24 个 `GroupRatio` 是 Comfly 上游线路倍率，不是商业利润倍率。现有配置基本按上游实际成本收费，没有统一预留利润和手续费。

正式商业运营前建议综合考虑：

- 充值和支付手续费
- 汇率波动
- 请求失败及重试成本
- 服务器费用
- 售后与风控成本

如需统一加价 15% 或 20%，不得只修改 `default`，也不得直接覆盖 24 个上游倍率。应另行使用用户分组附加倍率或等价的统一商业加价层，并验证它会对所有实际路由分组一致生效。修改后必须抽查前台价格并进行小额真实请求验证。

## 8. 已完成验证

### 8.1 网站

- `https://doodleverse.fun`：正常
- `https://www.doodleverse.fun`：正常
- `https://doodleverse.fun/docs/`：正常，返回 `200`，页面标题为 `Doodleverse.fun 使用文档`
- New API 公开状态中的 `docs_link`：`https://doodleverse.fun/docs/`
- HTTPS 证书：正常
- Nginx 反向代理：正常

### 8.2 上游渠道

| 测试模型 | 实际补充线路 | 结果 | 响应时间 |
|---|---|---|---:|
| `claude-3-5-sonnet-20241022` | `default` | 成功 | 1.83 秒 |
| `gpt-5.6-luna` | `default` | 成功 | 2.66 秒 |
| `grok-4-1-fast-non-reasoning` | `openai官-优质` | 成功 | 2.11 秒 |
| `claude-3-5-haiku-latest` | `claude官` | 成功 | 1.27 秒 |
| `gemini-2.5-flash-lite` | `origin` | 成功 | 1.55 秒 |

不要直接执行“测试全部模型”，这会产生大量请求、费用和无意义的特殊端点失败。应按供应商和模型类型进行抽样测试。

### 8.3 多分组同步

- 完整事务验证成功并确认以 `ROLLBACK` 结束。
- 正式同步事务成功提交。
- New API 重启后状态为 `running healthy`。
- 重启前后 `pricing_drift_total`、`option_drift_total` 和 `channel_drift_total` 均为 `0`。
- 重启前后 `abilities` 总数和去重模型数均为 1001，缺失、异常和重复均为 `0`。
- 当前令牌分组为 `auto`。
- 首页和模型广场 HTTPS 状态均为 `200`。
- 模型广场可见全部 24 个分组及正确倍率；`claude官 x5` 可筛出 9 个对应模型。

## 9. 数据库备份与恢复

本次配置前的完整 PostgreSQL 备份：

```text
/opt/new-api/backups/pre-comfly-pricing-20260817.sql
/opt/new-api/backups/pre-all-groups-sync-20260817-1215.sql
/opt/new-api/backups/pre-comfly-price-resync-20260817-131929.sql
/opt/new-api/backups/pre-comfly-24groups-sync-20260818.sql
/opt/new-api/backups/pre-docs-link-20260819.sql
```

本次 24 分组同步前备份约 293 KB。备份均归属 `root`，权限为 `600`。

恢复数据库属于高风险操作。恢复前应：

1. 再创建一份当前数据库备份。
2. 确认目标备份文件和数据库名称。
3. 安排维护窗口。
4. 停止写入流量。
5. 恢复后检查用户、渠道、令牌、倍率和日志。

未经确认不得直接覆盖生产数据库。

## 10. 日常巡检

建议每周检查：

1. Docker 容器是否健康。
2. Nginx 是否存在错误日志。
3. HTTPS 证书剩余有效期。
4. Comfly 账户余额。
5. New API 渠道最近测试状态。
6. 使用日志中的失败率和异常高消费。
7. Comfly `/api/pricing` 是否新增模型或变更价格。
8. 前台是否存在未定价模型。

常用检查：

```bash
sudo docker compose -f /opt/new-api/compose.yaml ps
sudo docker logs --tail 200 new-api
sudo nginx -t
curl -I https://doodleverse.fun
```

## 11. 定价更新流程

Comfly 价格发生变化时，建议按以下流程处理：

服务器已安装同步工具：

```text
/opt/new-api/scripts/sync-new-api-comfly-groups.py
```

同步流程：

1. 确认脚本中的 `GROUP_PRIORITY` 与 Comfly `Doodleverse.fun` 令牌分组顺序完全一致。
2. 创建 PostgreSQL 完整备份，并将权限设为 `600`。
3. 运行预检：`sudo python3 /opt/new-api/scripts/sync-new-api-comfly-groups.py`。
4. 检查模型新增/删除数量、计费类型、分组倍率、路由渠道和 `pricing_drift_total`。
5. 运行完整回滚式事务验证：`sudo python3 /opt/new-api/scripts/sync-new-api-comfly-groups.py --validate-transaction`。
6. 确认事务输出以 `ROLLBACK` 结束且没有 SQL 错误。
7. 执行同步：`sudo python3 /opt/new-api/scripts/sync-new-api-comfly-groups.py --apply`。
8. 再次运行预检，必须确认价格、选项、渠道、能力索引和令牌偏差均为 `0`。
9. 重启 New API：`sudo docker compose -f /opt/new-api/compose.yaml restart new-api`。
10. 重启后再次运行预检，所有偏差仍必须为 `0`。
11. 检查模型广场总数、按量/按次数量、排除的参数模型数量及关键模型价格。
12. 抽样测试 `default`、OpenAI、Claude、Gemini 和固定价格模型。
13. 观察使用日志、上游实际扣费和异常失败率。

同步工具会在同一事务中更新价格配置、分组倍率、路由渠道、渠道模型列表、`abilities` 模型可用性索引和当前令牌分组，并保留非 Comfly 的已有定价。

## 12. 已知注意事项

1. Comfly 模型网页、令牌分组列表、`/v1/models` 和 `/api/pricing` 的模型及分组数量可能短时间不一致，应以令牌后台实际可选分组、当前 API 返回和调用测试共同判断。
2. 绘图、视频和音乐模型可能采用按次、按秒、分辨率或阶梯价格；参数型价格需要重点核对，不能只看模型名称。
3. 当前同步工具会自动排除 Comfly `other_info.ratios` 中存在参数矩阵的固定价格模型；不得为了追求模型数量直接删除这项保护。
4. New API 的模型元信息表目前没有完整导入 Comfly 的所有描述和标签，但前台已能按名称识别主要供应商，并显示计费类型。
5. 当前 New API 路由分组名称有意与 Comfly 上游分组保持一致；用户账户本身仍可保留 `default`，API 令牌使用 `auto`。
6. 若重新开启 Comfly 跨分组自动选择，必须同时重新核算本地模型价格。
7. 不要把 API Key、数据库密码或 SSH 私钥发到聊天、工单或公开仓库。
8. 此前曾在聊天中暴露过 SSH 私钥，相关密钥应视为已泄露并完成撤销或轮换。

## 13. 交接验收清单

- [ ] 可以使用 `deploy` 用户通过 SSH 登录
- [ ] 三个 Docker 容器均为健康状态
- [ ] `doodleverse.fun` 和 `www.doodleverse.fun` 可访问
- [ ] HTTPS 证书有效
- [ ] New API 管理后台可登录
- [ ] `Comfly-Default` 渠道已启用
- [ ] Comfly 令牌显示 `default +23`，共 24 个可选分组
- [ ] 模型广场显示 1001 个模型
- [ ] 按量模型显示 684 个，按次模型显示 317 个
- [ ] 参数阶梯模型排除数量为 46 个
- [ ] 同步工具预检的 `pricing_drift_total` 为 `0`
- [ ] `option_drift_total` 和 `channel_drift_total` 均为 `0`
- [ ] `abilities` 总数和去重模型数均为 1001
- [ ] 当前 API 令牌分组为 `auto`
- [ ] GPT 和 Claude 抽样测试通过
- [ ] 固定价格模型展示正常
- [ ] 已确认当前分组倍率及商业加价策略
- [ ] 已确认数据库备份文件存在
- [ ] 密钥、密码和私钥已单独安全交接
