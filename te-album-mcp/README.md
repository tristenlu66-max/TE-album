# TE 相册 MCP

最小 AI 住户接口：`list_photos`、`get_photo`、`add_comment`。

环境变量：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`ALBUM_MCP_TOKEN`、`AI_ACTOR_KEY`（默认 `evan`）。service role 只放服务端。

Supabase 中需要先建立 AI actor，例如：

```sql
insert into actors (actor_type, display_name, external_key)
values ('ai', 'Evan', 'evan');
```

服务只返回 5 分钟 signed URL，不把图片保存到 VPS。当前 `get_photo` 已给 direct-image 所需 URL；MCP host 若不把 URL注入视觉上下文，下一步接 `inspect_photo` Vision fallback。

Claude 使用 OAuth：授权密码默认复用 `ALBUM_MCP_TOKEN`，也可以单独设置 `ALBUM_OAUTH_PASSWORD`。授权密码只在 Claude 弹出的授权页面中输入，不发送给 Claude。

## VPS 部署文件

`deploy/te-album-mcp.service` 是 systemd 服务，`deploy/nginx.album-mcp.conf` 是反向代理配置。生产环境 `.env` 只放在 `/srv/te/album-mcp/.env`，不要提交 Git。
