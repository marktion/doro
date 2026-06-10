// 前端Agent消息类型定义
export interface SDKMessage {
  type: 'stream_event' | 'assistant' | 'result' | 'system' | 'tool_progress';
  [key: string]: unknown;
}

export interface StreamEvent {
  type: 'stream_event';
  event: {
    type: string;
    delta?: string;
    [key: string]: unknown;
  };
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

export interface AssistantMessage {
  type: 'assistant';
  message: {
    content: Array<{
      type: 'text' | 'tool_use';
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  session_id: string;
  uuid: string;
}

export interface ResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  result: string;
  total_cost_usd: number;
  session_id: string;
  duration_ms: number;
}

// 会话信息
export interface SessionInfo {
  sessionId: string;
  summary: string;
  lastModified: Date;
  cwd: string;
  gitBranch?: string;
}

// WebSocket消息类型
export interface WSMessageType {
  // 客户端 -> 服务器
  query: { prompt: string; sessionId?: string; continue?: boolean };
  'query:interrupt': Record<string, never>;
  'session:list': Record<string, never>;
  'session:messages': { sessionId: string };
  'session:rename': { sessionId: string; title: string };
  'session:delete': { sessionId: string };
  'voice:audio': ArrayBuffer;
  'tts:play': { text: string };
  ping: { timestamp: number };

  // 服务器 -> 客户端
  connected: { message: string; timestamp: number };
  'agent:message': { message: SDKMessage };
  'session:list:result': { sessions: SessionInfo[] };
  'session:messages:result': { messages: unknown[] };
  'asr:result': { text: string; is_final: boolean };
  'tts:audio': ArrayBuffer;
  error: { message: string; code: string };
  pong: { timestamp: number };
}
