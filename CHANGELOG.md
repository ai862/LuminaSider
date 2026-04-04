# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-04-04

### Fixed
- **Firefox 存储问题修复**：修复了 Firefox 浏览器侧边栏中数据无法持久化保存的问题
  - 问题原因：Firefox MV2 sidebar 上下文中 `chrome.storage.local` 无法正常工作
  - 解决方案：通过 background script 代理所有存储操作，确保数据正确持久化
- **安全存储持久化**：修复了设置主密码后，重新打开侧边栏密码丢失的问题
- **消息传递机制**：优化了 Firefox 中的消息传递，使用 Promise-based API 替代回调

### Added
- **Firefox 完整支持**：现在支持同时构建 Chrome 和 Firefox 两个浏览器版本
- **Firefox 构建脚本**：`npm run build:firefox` 构建 Firefox 版本
- **Firefox 打包脚本**：`npm run pack:firefox` 打包 Firefox xpi 文件
- **统一构建命令**：`npm run build:all` 同时构建 Chrome 和 Firefox 版本

### Changed
- 后台存储引擎现在支持 Firefox sidebar 环境检测和代理
- 优化了代码高亮样式

### Known Issues
- Firefox 版本需要使用 Firefox Developer Edition 或 Nightly 版本加载

## [1.1.0] - 2026-03-28

### Added
- **Secure Storage System**: AES-256 encrypted API key storage with master password protection
- **AI Agent System**: Customizable AI agents with 4 built-in presets (General, Code Expert, Creative Writer, Data Analyst)
- **Unlock Modal**: Session-based security with master password requirement
- **Agent Management**: Add, edit, and delete custom agents with personalized system prompts

### Security
- API keys are now encrypted at rest using AES-256-GCM encryption
- Master password required to unlock storage each session
- Secure key derivation using PBKDF2 with 100,000 iterations

### Changed
- Updated store to support agent selection and management
- Enhanced settings component with agent configuration UI
- Improved API key handling with encryption/decryption flow

## [1.0.1] - 2025-03-25

### Initial Release
- Basic sidebar integration for browser
- Google Gemini API integration
- Chat functionality with AI
- Markdown rendering support
- Code syntax highlighting
- Dark/Light theme support
