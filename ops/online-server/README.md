# 线上部署目录

这是一套给现有服务器挂二级域名时使用的独立部署文件。

默认约定：

- Web 监听 `127.0.0.1:19080`
- AI 监听 `127.0.0.1:19081`
- Server 监听 `127.0.0.1:19082`
- RustFS API 监听 `127.0.0.1:19090`
- RustFS Console 监听 `127.0.0.1:19091`

上线步骤：

1. 复制 `.env.example` 为 `.env`
2. 修改 `.env` 中密码、域名和可选的 AI / Relay 配置
3. 执行 `docker compose up -d`
4. 在宿主机 Nginx 挂 `APP_DOMAIN` 和 `S3_DOMAIN`

注意：

- `ENABLE_AUTO_LOGIN=true` 适合演示和流程测试，公网正式开放前建议改成 `false`
- 没有 `RELAY_API_KEY` 时，第三方平台 OAuth 不会真正跑通
- 没有可用 AI Key 时，AI 相关功能会报错，但站点可以启动
