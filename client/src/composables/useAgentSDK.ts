// 前端WebSocket连接 + 消息处理
import { ref, onMounted, onUnmounted } from 'vue';
import type { SDKMessage, SessionInfo } from '../types/agent';

const WS_URL = `ws://${window.location.hostname}:${window.location.port || '3000'}`;

// 连接状态
const isConnected = ref(false);
const reconnectAttempts = ref(0);
const maxReconnectAttempts = 10;
const baseDelay = 1000;

// 消息回调
type MessageHandler = (message: SDKMessage) => void;
const messageHandlers: MessageHandler[] = [];

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
        const data = JSON.parse(event.data);
        console.log('[WebSocket] 收到消息:', data.type);

        // 处理不同类型的消息
        switch (data.type) {
          case 'agent:message':
            // 通知所有监听器
            messageHandlers.forEach(handler => handler(data.message));
            break;
          case 'pong':
            // 心跳响应，忽略
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
    onMessage
  };
}
