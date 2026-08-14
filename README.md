# TE Album

人类与 AI 共有相册：一个 Supabase 驱动的照片前端，以及供 Claude 等 AI 客户端使用的 MCP 服务。

## 目录

- `te-album/`：人类使用的 Web 相册、Supabase SQL 和部署配置。
- `te-album-mcp/`：MCP 服务、OAuth 保护和 AI 图片分析能力。

## 本地配置

隐私信息不提交到 GitHub：

- 浏览器端配置使用 `te-album/public/config.example.js` 复制为本地的 `te-album/public/config.js`。
- MCP 服务使用 `te-album-mcp/.env.example` 复制为本地的 `te-album-mcp/.env`。
- `config.js`、`.env`、服务密钥、MCP token 和 AI API key 均已被 Git 忽略。

MCP 的 Gemini 配置可使用 `GEMINI_API_KEY`；视觉模型和 embedding 模型可分别通过 `GEMINI_VISION_MODEL`、`GEMINI_EMBEDDING_MODEL` 调整。

## 数据库初始化

按顺序在 Supabase SQL Editor 执行：

1. `te-album/supabase/schema.sql`
2. `te-album/supabase/phase2-ai-resident.sql`
3. `te-album/supabase/phase3-vision-search.sql`
4. `te-album/supabase/phase4-human-frontend.sql`

## 运行

```powershell
cd te-album-mcp
npm ci
node server.js
```

Web 前端可直接由 Nginx 或其他静态文件服务器托管 `te-album/public/`。

## 自动部署

推送到 `main` 后，GitHub Actions 会自动同步：

- `te-album-mcp/` 到服务器 `/srv/te/album-mcp/`
- `te-album/public/` 到服务器 `/var/www/album/`

部署会保留服务器本地的 `te-album-mcp/.env` 和 `te-album/public/config.js`，不会覆盖密钥配置。

GitHub Secrets 需要包含：

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_MCP_PATH`
- `DEPLOY_WEB_PATH`

## 安全提醒

`SUPABASE_SERVICE_ROLE_KEY`、`ALBUM_MCP_TOKEN`、OAuth 密码和 AI API key 只能放在服务端本地环境变量中，不能复制进浏览器配置或提交到仓库。
