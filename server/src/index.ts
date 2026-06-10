// Express + WebSocket服务器入口
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SERVER_PORT, NODE_ENV } from './config.js';
import { handleWebSocket } from './ws/handler.js';

const app = express();
const server = createServer(app);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// WebSocket服务器
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('[WebSocket] 新连接:', req.socket.remoteAddress);
  handleWebSocket(ws);
});

wss.on('error', (error) => {
  console.error('[WebSocket] 错误:', error);
});

// 启动服务器
server.listen(SERVER_PORT, () => {
  console.log(`[Server] 服务器启动成功`);
  console.log(`[Server] HTTP: http://localhost:${SERVER_PORT}`);
  console.log(`[Server] WebSocket: ws://localhost:${SERVER_PORT}`);
  console.log(`[Server] 环境: ${NODE_ENV}`);
});
