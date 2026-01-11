# burn-after-reading（阅后即焚）

一个“阅后即焚”的图片分享 Web 应用：

- 上传图片（<= 5MB）后得到链接：`/id#key`
- **第一次**访问可查看图片
- **第二次**访问：HTTP 404，并显示“有内鬼，中止交易！”（glitch 风格）
- 图片未访问则最多保留 24 小时
- 端到端加密：服务端只存密文，看不到原图

## 技术选型（Cloudflare 免费方案优先）

- **Cloudflare Pages**：托管静态页面 + Pages Functions（边缘运行时）
- **Cloudflare D1**：存元数据（key_hash、状态、过期时间等），用于“一次性访问”的原子状态翻转
- **Cloudflare R2**：存加密后的图片密文（对象生命周期 1 天自动删除）

> 注：即使 D1 记录残留，R2 Lifecycle 也会在 24h 左右自动删除密文；访问时仍会做 expires 判断，过期即 404。

## 本地/目录结构

- `public/`：静态前端
- `functions/`：Cloudflare Pages Functions（API 和动态路由）
- `migrations/`：D1 建表 SQL

## Cloudflare 部署步骤（建议按这个顺序）

1. **把域名 daylog.top 接入 Cloudflare DNS**（如已接入可跳过）。
2. 创建 **R2 Bucket**（例如：`burn-images`）
   - 配置 Lifecycle：`1 day` 后删除对象（必做，用于 24 小时过期清理）
3. 创建 **D1 Database**（例如：`burn_db`），执行 `migrations/001_init.sql`
4. 创建 **Pages 项目**，连接本 GitHub 仓库
5. 在 Pages 项目 Settings 里绑定：
   - D1 binding：`DB`
   - R2 binding：`BUCKET`
6. 设置自定义域名：`burn.daylog.top`
7. 部署

## API 概览

- `POST /api/upload`
  - 请求体：密文二进制（application/octet-stream）
  - Headers:
    - `x-key-hash`：hex(sha256(key))
    - `x-mime`：原始 mime（image/png/jpeg/webp/gif）
  - 返回：`{ id, url }`

- `GET /api/get/:id`
  - Headers:
    - `x-key-hash`：hex(sha256(key))
  - 成功：返回密文二进制，并通过 headers 返回 `x-mime`、`x-iv`
  - 失败：404

- `GET /:id`
  - 未读：返回用于解密展示的 HTML
  - 已读/过期：HTTP 404（glitch 页面）

## 安全说明（现实限制）

- 会尽可能禁用右键、拖拽、长按保存等，但无法阻止截图/屏摄。
- key 永不上传，仅上传 sha256(key) 用于校验，服务端无法解密。
