# 智能体（Agent）功能设计文档

## Context
LuminaSider 的系统提示词当前是硬编码的（"你是一个网页阅读助手..."）。用户希望添加智能体功能，支持预设智能体和自定义智能体，让用户可以快速切换不同的 AI 角色/行为模式。

## 数据模型
- `Agent`: id, name, icon, systemPrompt, isBuiltIn
- Session 新增 `agentId?: string` 字段

## 内置智能体
1. 网页阅读助手（默认）
2. 翻译专家
3. 代码助手

## 涉及文件
- `src/store/index.ts` — 状态管理
- `src/components/Header.tsx` — 智能体选择按钮
- `src/components/AgentDrawer.tsx` — 新建，下拉选择面板
- `src/components/AgentManager.tsx` — 新建，智能体管理
- `src/components/InputArea.tsx` — 替换硬编码提示词
- `src/components/ChatArea.tsx` — 替换硬编码提示词
- `src/App.tsx` — 引入新组件

## 行为
- 切换智能体时自动创建新会话
- 系统提示词从 store 取，与 pageContext 拼接
