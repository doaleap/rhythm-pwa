# 部署 Rhythm Mood PWA（供 iPhone「添加到主屏幕」）

## 为什么必须是 HTTPS

渐进式 Web 应用（PWA）与 Service Worker **仅在安全上下文**（`https://` 或 `http://localhost`）可用。  
部署到公网后，请使用 **HTTPS**，否则 iPhone Safari 无法正常缓存与安装。

## 推荐流程（任选其一）

### 1. Vercel（简单）

1. 将本项目推到 GitHub / GitLab。
2. 打开 [vercel.com](https://vercel.com)，导入仓库。
3. Framework Preset 选 **Vite**，Build Command：`npm run build`，Output Directory：`dist`。
4. 在 Vercel 项目 → **Environment Variables** 添加：
   - `VITE_SPOTIFY_CLIENT_ID` = 你的 Spotify Client ID（若使用真实 BPM）。
5. 部署完成后得到域名，例如 `https://rhythm-app.vercel.app`。

**Spotify 控制台**：在应用的 Redirect URIs 中加入：

`https://你的域名/`

（注意末尾斜杠需与本应用 `redirect_uri` 一致。）

### 2. Netlify

1. 新建站点并连接 Git，或使用 Netlify CLI 上传 `dist`。
2. Build：`npm run build`，Publish directory：`dist`。
3. 在同一位置配置环境变量 `VITE_SPOTIFY_CLIENT_ID`。

### 3. Cloudflare Pages

1. 连接仓库，构建命令 `npm run build`，输出目录 `dist`。
2. **Environment variables（Production）** 中添加 `VITE_SPOTIFY_CLIENT_ID`。

### 4. 自有服务器 / NAS

1. 在本机执行 `npm ci && npm run build`，得到 `dist` 目录。
2. 用 Nginx、Caddy 等指向 `dist`，并启用 HTTPS（Let's Encrypt）。
3. 确保 SPA 回退：所有路径返回 `index.html`（本应用路由为根路径，一般只需 `try_files $uri /index.html`）。

## iPhone 用户如何添加主屏幕

1. 用 **Safari** 打开你的 HTTPS 地址（不要用第三方浏览器嵌套 WebView，以免限制能力）。
2. 点击底栏 **分享** → **添加到主屏幕**。
3. 从主屏幕图标打开后，会以 **独立窗口（standalone）** 运行，更接近 App。

若未出现「添加到主屏幕」，请确认：站点为 HTTPS、未处于无痕限制、且 manifest / Service Worker 加载成功（可在 Safari 开发菜单或桌面 Chrome → Application 面板检查）。

## 本地开发

```bash
npm install
cp .env.example .env
# 编辑 .env 填入 VITE_SPOTIFY_CLIENT_ID（可选）
npm run dev
```

浏览器访问 `http://localhost:5173/`。  
Spotify Redirect URI 需包含 `http://localhost:5173/`。

## 未配置 Spotify 时

不配置 Client ID 仍可完整体验：**演示模式**会根据输入字符串生成稳定的 BPM 与能量；连接 Spotify 后可搜索并选用真实 **tempo / energy**。
