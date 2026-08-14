# TE 相册 v1

Tristen 与 AI 的私人共同相册。第一版实现：Supabase Auth 单 owner 登录、private Storage、客户端 WebP 压缩、SHA-256 去重、时间线、照片详情与评论。

## 本地运行

1. 在 Supabase 执行 `supabase/schema.sql`。
2. 创建 private bucket `album-private`（schema 会尝试创建）。
3. 配置 `public/config.js` 中的 Supabase URL 和 anon key。
4. 用任意静态服务器打开目录，例如 `npx serve public`。
5. 在 Supabase Auth 创建 owner 用户，并把它写入 actors。

`service_role` 只能放在 MCP/VPS 环境变量，不能进入网页或 MCP 参数。

## 手机访问部署

网页是静态文件，可放在 VPS 的 `/var/www/album`，由 `album.tehouse.net` 提供 HTTPS。`public/config.js` 中的 Project URL 与 publishable key 可以公开；RLS 负责限制照片与数据库访问。

## 当前边界

网页端已覆盖一张图闭环的前半段：选择图片 → 客户端读取元数据/哈希 → WebP 压缩 → 直接上传 private Storage → 写入 photos → 浏览/评论/软删除。
