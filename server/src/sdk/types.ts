// Agent SDK类型定义
export interface SDKMessage {
  type: 'stream_event' | 'assistant' | 'result' | 'system' | 'tool_progress';
  [key: string]: unknown;
}

export interface SDKSessionInfo {
  sessionId: string;
  summary: string;
  lastModified: Date;
  cwd: string;
  gitBranch?: string;
}

export interface QueryOptions {
  sessionId?: string;
  continue?: boolean;
  cwd?: string;
  includePartialMessages?: boolean;
  allowedTools?: string[];
  abortSignal?: AbortSignal;
}

export interface QueryResult {
  prompt: string;
  options: QueryOptions;
}
