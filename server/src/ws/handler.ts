// WebSocket消息路由处理器
import { WebSocket } from 'ws';
import { runAgent, listSessions, getSessionMessages, deleteSession } from '../sdk/agent.js';
import { recognizeSpeech } from '../voice/asr.js';
import { synthesizeSpeech, splitIntoChunks, cleanTextForTTS, SILENCE_GAP_MS } from '../voice/tts.js';

// 消息类型定义
interface WSMessage {
  type: string;
  [key: string]: unknown;
}

// 连接状态
interface ConnectionState {
  abortController: AbortController | null;
  currentSessionId: string | null;
  isQuerying: boolean;
}

// 处理Agent SDK查询
async function handleQuery(
  ws: WebSocket,
  state: ConnectionState,
  payload: { prompt: string; sessionId?: string }
): Promise<void> {
  if (state.isQuerying) {
    ws.send(JSON.stringify({
      type: 'error',
      message: '查询正在进行中',
      code: 'QUERY_IN_PROGRESS'
    }));
    return;
  }

  const abortController = new AbortController();
  state.abortController = abortController;
  state.isQuerying = true;

  try {
    console.log('[Agent] 开始查询:', { prompt: payload.prompt.substring(0, 50), sessionId: payload.sessionId });

    const generator = runAgent(payload.prompt, {
      sessionId: payload.sessionId,
      abortSignal: abortController.signal,
    });

    for await (const message of generator) {
      if (ws.readyState !== WebSocket.OPEN) break;
      ws.send(JSON.stringify({ type: 'agent:message', message }));
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error('[Agent] 查询失败:', error);
      ws.send(JSON.stringify({
        type: 'agent:error',
        message: error.message,
        code: 'AGENT_ERROR'
      }));
    }
  } finally {
    state.isQuerying = false;
    state.abortController = null;
  }
}

// 处理查询中断
function handleInterrupt(state: ConnectionState): void {
  if (state.abortController) {
    state.abortController.abort();
  }
}

// 处理会话列表
async function handleSessionList(ws: WebSocket): Promise<void> {
  try {
    const sessions = await listSessions();
    ws.send(JSON.stringify({ type: 'session:list:result', sessions }));
  } catch (error: any) {
    console.error('[Session] 获取会话列表失败:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
      code: 'SESSION_LIST_ERROR'
    }));
  }
}

// 处理会话消息
async function handleSessionMessages(ws: WebSocket, sessionId: string): Promise<void> {
  try {
    const messages = await getSessionMessages(sessionId);
    ws.send(JSON.stringify({ type: 'session:messages:result', messages }));
  } catch (error: any) {
    console.error('[Session] 获取会话消息失败:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
      code: 'SESSION_MESSAGES_ERROR'
    }));
  }
}

// 处理会话删除
async function handleSessionDelete(ws: WebSocket, sessionId: string): Promise<void> {
  try {
    await deleteSession(sessionId);
    ws.send(JSON.stringify({ type: 'session:delete:result', success: true }));
  } catch (error: any) {
    console.error('[Session] 删除会话失败:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
      code: 'SESSION_DELETE_ERROR'
    }));
  }
}

// 处理语音输入（ASR）
async function handleVoiceAudio(ws: WebSocket, payload: { data: string; mimeType?: string }): Promise<void> {
  try {
    console.log('[Voice] 收到语音数据，格式:', payload.mimeType || 'audio/webm');
    console.log('[Voice] 收到数据长度:', payload.data?.length);
    console.log('[Voice] 数据预览:', payload.data?.substring(0, 50));
    // 将base64转换为data URL，使用前端发送的mimeType
    const mimeType = payload.mimeType || 'audio/webm';
    const dataUrl = `data:${mimeType};base64,${payload.data}`;
    console.log('[Voice] 构建的data URL预览:', dataUrl.substring(0, 100));
    const text = await recognizeSpeech(dataUrl);
    console.log('[Voice] ASR识别结果:', text);
    ws.send(JSON.stringify({ type: 'asr:result', text, is_final: true }));
  } catch (error: any) {
    console.error('[Voice] ASR识别失败:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
      code: 'ASR_ERROR'
    }));
  }
}

// 处理TTS播放
async function handleTTSPlay(ws: WebSocket, text: string): Promise<void> {
  try {
    console.log('[Voice] 收到TTS文本:', text.substring(0, 50));
    // 清洗文本：去除Markdown格式和特殊字符
    const cleanedText = cleanTextForTTS(text);
    if (!cleanedText) {
      console.log('[Voice] 清洗后文本为空，跳过TTS');
      ws.send(JSON.stringify({ type: 'tts:done' }));
      return;
    }
    console.log('[Voice] 清洗后文本:', cleanedText.substring(0, 50));

    // 固定长度分块（80-120字）
    const chunks = splitIntoChunks(cleanedText);
    console.log('[Voice] 分块数量:', chunks.length);

    // 逐块合成
    for (let i = 0; i < chunks.length; i++) {
      const audio = await synthesizeSpeech(chunks[i]);
      console.log('[Voice] TTS合成完成:', chunks[i].substring(0, 20));

      // 发送音频元数据（附带静默间隙时长）
      ws.send(JSON.stringify({
        type: 'tts:audio',
        sentence: chunks[i],
        size: audio.length,
        silenceGapMs: i < chunks.length - 1 ? SILENCE_GAP_MS : 0
      }));

      // 发送二进制音频数据
      ws.send(audio);
    }

    ws.send(JSON.stringify({ type: 'tts:done' }));
  } catch (error: any) {
    console.error('[Voice] TTS合成失败:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message,
      code: 'TTS_ERROR'
    }));
  }
}

// 处理WebSocket连接
export function handleWebSocket(ws: WebSocket): void {
  const state: ConnectionState = {
    abortController: null,
    currentSessionId: null,
    isQuerying: false,
  };

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket连接成功',
    timestamp: Date.now()
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;
      console.log('[WebSocket] 收到消息:', message.type);

      // 根据消息类型分发处理
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'query':
          handleQuery(ws, state, message as unknown as { prompt: string; sessionId?: string });
          break;

        case 'query:interrupt':
          handleInterrupt(state);
          break;

        case 'session:list':
          handleSessionList(ws);
          break;

        case 'session:messages':
          handleSessionMessages(ws, message.sessionId as string);
          break;

        case 'session:delete':
          handleSessionDelete(ws, message.sessionId as string);
          break;

        case 'voice:audio':
          handleVoiceAudio(ws, message as unknown as { data: string; mimeType?: string });
          break;

        case 'tts:play':
          handleTTSPlay(ws, message.text as string);
          break;

        default:
          console.log('[WebSocket] 未知消息类型:', message.type);
          ws.send(JSON.stringify({
            type: 'error',
            message: `未知消息类型: ${message.type}`,
            code: 'UNKNOWN_TYPE'
          }));
      }
    } catch (error) {
      console.error('[WebSocket] 消息解析失败:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: '消息格式错误',
        code: 'PARSE_ERROR'
      }));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[WebSocket] 连接关闭: ${code} ${reason}`);
    // 中断正在进行的查询
    if (state.abortController) {
      state.abortController.abort();
    }
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] 连接错误:', error);
  });
}
