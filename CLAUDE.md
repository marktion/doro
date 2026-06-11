# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言偏好

- 永远使用中文回复用户
- 代码注释也使用中文

## 项目概述

Doro 是 Claude Code 的语音交互前端。流程：用户说话 → MiMo ASR转文字 → Agent SDK → Claude Code输出 → MiMo TTS转语音 → 用户听到回复。

## 常用命令

### 后端 (server/)
```bash
cd server
npm run dev          # 启动开发服务器（tsx watch，端口3000）
npm run build        # TypeScript编译到dist/
npm start            # 运行生产版本
```

### 前端 (client/)
```bash
cd client
npm run dev          # Vite开发服务器（端口5173）
npm run build        # 类型检查 + Vite构建
npm run test:unit    # Vitest单元测试
npm run lint         # oxlint + eslint
```

## 架构

### 服务端 (server/)

**入口**: `server/src/index.ts` — Express + WebSocketServer 同端口(3000)

**WebSocket消息路由** (`server/src/ws/handler.ts`):
- `ping` → 返回pong（心跳）
- `query` → Agent SDK查询（支持中断）
- `query:interrupt` → 中断当前查询
- `session:list` → 会话列表
- `session:messages` → 获取会话消息
- `session:delete` → 删除会话
- `voice:audio` → ASR语音识别（接收base64音频，转为Data URL）
- `tts:play` → TTS语音合成（句子级分块，文本信令 + 二进制音频）

**Agent SDK封装** (`server/src/sdk/agent.ts`):
- `runAgent(prompt, options)` — 异步生成器，yield SDKMessage
- `listSessions(dir)` — 列出会话
- `getSessionMessages(sessionId)` — 获取会话消息
- `deleteSession(sessionId)` — 删除会话
- 使用动态import加载 `@anthropic-ai/claude-agent-sdk`（ESM模块）

**语音服务** (`server/src/voice/`):
- `asr.ts` — MiMo ASR客户端，接收Data URL格式音频（`data:audio/wav;base64,...`）
- `tts.ts` — MiMo TTS客户端
  - 文本清洗：去除Markdown格式、代码块、HTML标签等
  - 固定长度分块：80-120字，优先标点切分，兜底硬切
  - 固定风格指令：确保语速稳定
  - 返回WAV格式音频数据

### 客户端 (client/)

**WebSocket客户端** (`client/src/composables/useAgentSDK.ts`):
- 自动连接、心跳(30s)、指数退避重连(最多10次)
- 消息队列：断网时缓存，恢复后发送
- 设置 `ws.binaryType = 'arraybuffer'` 用于接收TTS音频
- `onmessage` 区分文本(JSON)和二进制(ArrayBuffer/Blob)数据
- 暴露: `sendQuery()`, `interruptQuery()`, `sendVoiceAudio()`, `requestTTS()`
- 回调注册: `onMessage()`, `onASRResult()`, `onTTSAudio()`, `onTTSDone()`, `onSessionList()`, `onSessionMessages()`

**语音组件**:
- `useVoiceRecorder.ts` — AudioContext + ScriptProcessorNode录音，输出WAV格式（16kHz，单声道，16bit PCM）
- `useVoicePlayer.ts` — Web Audio API播放
  - 全局AudioContext实例，支持浏览器自动播放策略解锁
  - 播放队列：支持段间静默间隙（通过 `silenceGapMs` 参数）
  - 淡入淡出：20ms fade消除爆破音
- `VoiceButton.vue` — 按住说话按钮，松开自动发送
  - 首次交互时调用 `unlockAudioContext()` 解锁音频播放

**状态管理** (Pinia):
- `stores/chat.ts` — 消息列表，处理stream_event、assistant、result
  - 用户消息缓存：按会话ID存储到localStorage，刷新页面不丢失
  - `currentSessionId` 持久化到localStorage
- `stores/session.ts` — 会话列表、选中状态、按项目分组
  - `selectedSession` 持久化到localStorage，刷新页面恢复选中状态

**UI**: `views/ChatView.vue` — 侧边栏(会话列表) + 消息区域 + 输入框 + 语音按钮

## 关键设计决策

1. **Agent SDK而非PTY**: 结构化消息、完整会话管理、生成式UI支持、Windows兼容
2. **单端口**: Express和WebSocket共享同一端口(3000)
3. **动态目录**: 使用`process.cwd()`获取工作目录，传递给SDK的dir参数
4. **WAV录音格式**: 使用AudioContext录制16kHz单声道WAV，MiMo ASR API仅支持WAV/MP3
5. **混合传输模式**: WebSocket文本(JSON)传信令，二进制(ArrayBuffer)传音频，避免Base64膨胀33%
6. **浏览器自动播放策略**: 利用用户首次交互(按住说话)解锁AudioContext，之后可自动播放TTS
7. **TTS分块与播放**: 80-120字固定长度分块，段间500ms静默，20ms淡入淡出，确保语速稳定、播放流畅
8. **会话状态持久化**: 用户消息、当前会话ID、选中会话保存到localStorage，刷新页面不丢失历史

## 环境变量

`server/.env`（不提交到git）:
```
SERVER_PORT=3000
MIMO_API_KEY=your_key_here
AGENT_CWD=E:/AI/ClaudeC/work/doro
```

## 已知问题

### ASR: Bare base64 is not supported
MiMo ASR API要求Data URL格式，不支持纯Base64。解决：构建完整 `data:audio/wav;base64,...`

### TTS: DOMException: Suspended value failed
浏览器禁止无用户交互时播放音频。解决：首次交互时调用 `unlockAudioContext()` 解锁

### WebSocket二进制数据解析失败
设置 `ws.binaryType = 'arraybuffer'`，onmessage 中先判断数据类型再处理

### 历史消息格式
Agent SDK返回的用户消息 `content` 是数组格式（`[{type: "text", text: "..."}]`），需要提取文本

## 待完成事项

- 生成式UI组件（ToolCallCard, FileEditDiff, BashCommand等）
- 语音打断功能（播放中可打断）
- 错误处理和用户提示优化
- 主题切换（深色/浅色模式）

## Windows 开发注意事项

### GitHub 访问
Windows 的 schannel 在检查 SSL 证书吊销状态时会失败（CRYPT_E_NO_REVOCATION_CHECK）。使用 curl 访问 GitHub API 时需要添加 `--ssl-no-revoke` 参数：
```bash
curl --ssl-no-revoke -sL "https://api.github.com/..."
```

### Git 推送
已配置 SSH key 推送到 `git@github.com:marktion/doro.git`，使用 SSH 方式无需额外认证。
