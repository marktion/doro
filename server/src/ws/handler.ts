// WebSocket消息路由处理器
import { WebSocket } from 'ws';

// 消息类型定义
interface WSMessage {
  type: string;
  [key: string]: unknown;
}

// 处理WebSocket连接
export function handleWebSocket(ws: WebSocket): void {
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
          // 心跳响应
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
          break;

        case 'query':
          // Agent SDK查询（TODO: 集成Agent SDK）
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Agent SDK尚未集成',
            code: 'NOT_IMPLEMENTED'
          }));
          break;

        case 'session:list':
          // 会话列表（TODO: 集成Agent SDK）
          ws.send(JSON.stringify({
            type: 'session:list:result',
            sessions: []
          }));
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

  ws.on('error', (error) => {
    console.error('[WebSocket] 连接错误:', error);
  });

  ws.on('close', (code, reason) => {
    console.log(`[WebSocket] 连接关闭: ${code} ${reason}`);
  });
}
