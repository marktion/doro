// 前端WebSocket连接 + 消息处理
import { ref, onMounted, onUnmounted } from 'vue';
import type { SDKMessage, SessionInfo } from '../types/agent';

// WebSocket连接地址，开发环境连接后端3000端口
const WS_URL = `ws://${window.location.hostname}:3000`;

// ArrayBuffer转base64辅助函数
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 连接状态
const isConnected = ref(false);
const reconnectAttempts = ref(0);
const maxReconnectAttempts = 10;
const baseDelay = 1000;

// 消息回调
type MessageHandler = (message: SDKMessage) => void;
const messageHandlers: MessageHandler[] = [];

// 会话回调
type SessionListHandler = (sessions: SessionInfo[]) => void;
type SessionMessagesHandler = (messages: unknown[]) => void;
const sessionListHandlers: SessionListHandler[] = [];
const sessionMessagesHandlers: SessionMessagesHandler[] = [];

// 语音消息回调
type ASRHandler = (text: string) => void;
type TTSHandler = (sentence: string, audioData: ArrayBuffer, silenceGapMs: number) => void;
type TTSDoneHandler = () => void;
const asrHandlers: ASRHandler[] = [];
const ttsHandlers: TTSHandler[] = [];
const ttsDoneHandlers: TTSDoneHandler[] = [];

// TTS音频处理状态
let currentTTSSentence: string | null = null;
let currentSilenceGapMs = 300;

// WebSocket实例
let ws: WebSocket | null = null;
let pingInterval: number | null = null;

// 发送消息队列
const messageQueue: string[] = [];

export function useAgentSDK() {
  // 连接WebSocket
  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      return;
    }

    ws = new WebSocket(WS_URL);
    // 设置二进制类型为ArrayBuffer，用于处理TTS音频数据
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[WebSocket] 连接成功');
      isConnected.value = true;
      reconnectAttempts.value = 0;

      // 启动心跳
      pingInterval = window.setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, 30000);

      // 发送队列中的消息
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(msg!);
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        // 处理二进制数据（TTS音频）- 收到后立即播放
        if (event.data instanceof ArrayBuffer) {
          console.log('[WebSocket] 收到二进制音频数据:', event.data.byteLength);
          if (currentTTSSentence) {
            // 立即触发回调播放，传递静默间隙
            ttsHandlers.forEach(handler => handler(currentTTSSentence!, event.data, currentSilenceGapMs));
          }
          return;
        }

        // 处理Blob类型（备用）
        if (event.data instanceof Blob) {
          console.log('[WebSocket] 收到Blob数据:', event.data.size);
          event.data.arrayBuffer().then(buffer => {
            if (currentTTSSentence) {
              // 立即触发回调播放
              ttsHandlers.forEach(handler => handler(currentTTSSentence!, buffer, currentSilenceGapMs));
            }
          });
          return;
        }

        const data = JSON.parse(event.data);
        console.log('[WebSocket] 收到消息:', data.type);

        // 处理不同类型的消息
        switch (data.type) {
          case 'agent:message':
            messageHandlers.forEach(handler => handler(data.message));
            break;
          case 'session:list:result':
            sessionListHandlers.forEach(handler => handler(data.sessions));
            break;
          case 'session:messages:result':
            sessionMessagesHandlers.forEach(handler => handler(data.messages));
            break;
          case 'pong':
            // 心跳响应，忽略
            break;
          case 'asr:result':
            // ASR识别结果
            asrHandlers.forEach(handler => handler(data.text));
            break;
          case 'tts:audio':
            // TTS音频元数据，保存当前句子和静默间隙
            currentTTSSentence = data.sentence;
            currentSilenceGapMs = data.silenceGapMs ?? 300;
            console.log('[WebSocket] TTS音频:', data.sentence, '静默间隙:', currentSilenceGapMs, 'ms');
            break;
          case 'tts:done':
            // TTS完成
            currentTTSSentence = null;
            console.log('[WebSocket] TTS完成');
            ttsDoneHandlers.forEach(handler => handler());
            break;
          default:
            console.log('[WebSocket] 其他消息:', data);
        }
      } catch (error) {
        console.error('[WebSocket] 消息解析失败:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('[WebSocket] 连接关闭:', event.code, event.reason);
      isConnected.value = false;

      // 清除心跳
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }

      // 自动重连（指数退避）
      if (reconnectAttempts.value < maxReconnectAttempts) {
        const delay = baseDelay * Math.pow(2, reconnectAttempts.value);
        console.log(`[WebSocket] ${delay}ms后重连...`);
        setTimeout(() => {
          reconnectAttempts.value++;
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] 错误:', error);
    };
  }

  // 断开连接
  function disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  // 发送消息
  function send(data: Record<string, unknown>) {
    const message = JSON.stringify(data);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    } else {
      messageQueue.push(message);
    }
  }

  // 发送查询
  function sendQuery(prompt: string, sessionId?: string) {
    send({
      type: 'query',
      prompt,
      sessionId
    });
  }

  // 中断查询
  function interruptQuery() {
    send({ type: 'query:interrupt' });
  }

  // 请求会话列表
  function requestSessions() {
    send({ type: 'session:list' });
  }

  // 获取会话消息
  function requestSessionMessages(sessionId: string) {
    send({ type: 'session:messages', sessionId });
  }

  // 注册消息处理器
  function onMessage(handler: MessageHandler) {
    messageHandlers.push(handler);
    return () => {
      const index = messageHandlers.indexOf(handler);
      if (index > -1) {
        messageHandlers.splice(index, 1);
      }
    };
  }

  // 发送语音数据（base64编码）
  function sendVoiceAudio(audioBlob: Blob) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]; // 移除data:audio/...;base64,前缀
      if (ws && ws.readyState === WebSocket.OPEN) {
        // 发送base64数据和mimeType
        ws.send(JSON.stringify({
          type: 'voice:audio',
          data: base64,
          mimeType: audioBlob.type
        }));
      } else {
        console.error('[WebSocket] 未连接，无法发送语音');
      }
    };
    reader.readAsDataURL(audioBlob);
  }

  // 请求TTS合成
  function requestTTS(text: string) {
    send({ type: 'tts:play', text });
  }

  // 注册ASR结果回调
  function onASRResult(handler: ASRHandler) {
    asrHandlers.push(handler);
    return () => {
      const index = asrHandlers.indexOf(handler);
      if (index > -1) asrHandlers.splice(index, 1);
    };
  }

  // 注册TTS音频回调
  function onTTSAudio(handler: TTSHandler) {
    ttsHandlers.push(handler);
    return () => {
      const index = ttsHandlers.indexOf(handler);
      if (index > -1) ttsHandlers.splice(index, 1);
    };
  }

  // 注册TTS完成回调
  function onTTSDone(handler: TTSDoneHandler) {
    ttsDoneHandlers.push(handler);
    return () => {
      const index = ttsDoneHandlers.indexOf(handler);
      if (index > -1) ttsDoneHandlers.splice(index, 1);
    };
  }

  // 注册会话列表回调
  function onSessionList(handler: SessionListHandler) {
    sessionListHandlers.push(handler);
    return () => {
      const index = sessionListHandlers.indexOf(handler);
      if (index > -1) sessionListHandlers.splice(index, 1);
    };
  }

  // 注册会话消息回调
  function onSessionMessages(handler: SessionMessagesHandler) {
    sessionMessagesHandlers.push(handler);
    return () => {
      const index = sessionMessagesHandlers.indexOf(handler);
      if (index > -1) sessionMessagesHandlers.splice(index, 1);
    };
  }

  // 生命周期
  onMounted(() => {
    connect();
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected,
    reconnectAttempts,
    connect,
    disconnect,
    send,
    sendQuery,
    interruptQuery,
    requestSessions,
    requestSessionMessages,
    sendVoiceAudio,
    requestTTS,
    onMessage,
    onASRResult,
    onTTSAudio,
    onTTSDone,
    onSessionList,
    onSessionMessages
  };
}
