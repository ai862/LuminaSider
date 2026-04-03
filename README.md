# LuminaSider 🌟

LuminaSider 是一款支持 **Chrome** 和 **Firefox** 浏览器的侧边栏 AI 助手。它打破了传统 AI 助手需要频繁切换标签页的体验，在用户当前浏览的网页旁注入一个侧边栏，提供”伴随式浏览”与”基于当前网页上下文的精准问答”能力。

> **Chrome** 使用 Manifest V3，**Firefox** 使用 Manifest V2，同一套源码构建两个版本。

<div align="center">
  <img src="https://raw.githubusercontent.com/vancur2021/LuminaSider/main/images/%E6%95%88%E6%9E%9C1.png" alt="LuminaSider 效果图 1" width="800">
  <br><br>
  <img src="https://raw.githubusercontent.com/vancur2021/LuminaSider/main/images/%E6%95%88%E6%9E%9C2.png" alt="LuminaSider 效果图 2" width="350">
</div>

## ✨ 核心特性 (Features)

*   **📖 网页上下文感知**：自动提取当前网页的纯净正文（基于 Mozilla Readability），AI 能够“看到”你正在阅读的内容，从而提供精准的总结、翻译和解释。
*   **🤖 双引擎驱动**：
    *   **Google Gemini**：深度适配 Gemini 3.1 Flash/Pro，支持超长上下文窗口。
    *   **OpenAI 兼容接口**：支持无缝接入 OpenAI、DeepSeek、Claude 等任何兼容 OpenAI 格式的第三方中转 API。
*   **⚡ 极致流畅体验**：
    *   支持 Server-Sent Events (SSE) 流式输出，打字机效果，拒绝等待焦虑。
    *   支持多模态交互，可直接粘贴或上传图片给 AI 进行视觉分析。
*   **🎨 Notion 级极简美学**：基于 Tailwind CSS 打造的极简 UI，支持 Markdown 完美渲染、代码高亮及一键复制。
*   **🔒 隐私与性能优先**：
    *   API Key 仅保存在浏览器本地。
    *   采用轻重数据解耦架构：配置项存入 `chrome.storage`，庞大的网页快照和图片附件存入本地 `IndexedDB`，彻底告别主线程阻塞与卡顿。

## 🚀 安装指南 (Installation)

### Chrome 浏览器

#### 方式一：直接安装（普通用户）
1. 在 GitHub Releases 页面下载最新的 `luminasider-extension.zip` 压缩包并解压。
2. 打开 Chrome 浏览器，在地址栏输入 `chrome://extensions/` 并回车。
3. 在右上角开启 **”开发者模式” (Developer mode)**。
4. 点击左上角的 **”加载已解压的扩展程序” (Load unpacked)**。
5. 选择解压后的文件夹即可。
6. 建议将插件固定 (Pin) 在浏览器右上角，方便随时唤出。

### Firefox 浏览器

> ⚠️ **注意**：由于 Firefox 扩展未上架 Mozilla Add-ons (AMO)，普通版 Firefox 无法直接安装未签名扩展。请使用以下方式：

#### 方式一：使用 Firefox Developer Edition（推荐）
1. 下载并安装 [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/)
2. 打开浏览器，地址栏输入 `about:config`，确认风险提示
3. 搜索 `xpinstall.signatures.required`，双击设置为 `false`
4. 下载 `luminasider-firefox.xpi`，直接拖拽到浏览器安装

#### 方式二：临时加载（所有 Firefox 版本）
> 注意：临时加载的扩展在浏览器重启后会失效，需要重新加载
1. 在 GitHub Releases 页面下载 `luminasider-firefox.xpi` 并解压
2. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`
3. 点击 **”临时载入附加组件”**
4. 选择解压目录中的 `manifest.json` 文件
5. 点击浏览器工具栏的 LuminaSider 图标打开侧边栏

### 本地开发构建（开发者）
确保你的电脑已安装 Node.js (推荐 v18+)。

```bash
# 1. 克隆仓库
git clone https://github.com/yourusername/LuminaSider.git
cd LuminaSider

# 2. 安装依赖
npm install

# 3. 启动开发服务器 (支持热更新 HMR) - Chrome
npm run dev

# 4. 构建生产版本
npm run build          # Chrome 版本 → dist/
npm run build:firefox  # Firefox 版本 → dist-firefox/

# 5. 打包为发布文件
npm run pack           # Chrome → luminasider-extension.zip
npm run pack:firefox   # Firefox → luminasider-firefox.xpi
```
*开发时，将 `dist` (Chrome) 或 `dist-firefox` (Firefox) 目录作为”已解压的扩展程序”加载到浏览器中即可。*

## ⚙️ 配置与使用 (Usage)

1. **配置 API**：首次打开侧边栏，点击右上角的 ⚙️ (设置) 图标。
2. **选择提供商**：选择 `Google Gemini` 或 `OpenAI 兼容接口`。
3. **填写密钥**：填入你的 API Key。如果你使用代理或第三方中转，请修改 `自定义接口地址 (Base URL)`。
4. **选择模型**：点击“获取模型”并选择你想要使用的模型（如 `gemini-1.5-flash` 或 `gpt-4o-mini`）。
5. **开始对话**：
   * 开启输入框上方的 **“附带当前网页”** 开关，AI 即可读取当前网页内容。
   * 点击欢迎页的快捷指令（总结、翻译、解释），快速处理长文本。

## 🛠️ 技术栈 (Tech Stack)

*   **框架**: React 18 + TypeScript
*   **构建工具**: Vite + `@crxjs/vite-plugin`
*   **样式**: Tailwind CSS + `lucide-react` (Icons)
*   **状态管理**: Zustand
*   **本地存储**: `idb-keyval` (IndexedDB) + `chrome.storage.local`
*   **内容提取**: `@mozilla/readability`
*   **Markdown 渲染**: `react-markdown` + `highlight.js`

## 🤝 参与贡献 (Contributing)

欢迎提交 Issue 和 Pull Request！
1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

## 📄 许可证 (License)

本项目基于 [MIT License](LICENSE) 开源。
