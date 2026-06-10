// Agent SDK封装
import { AGENT_CWD } from '../config.js';
import type { QueryOptions } from './types.js';

// 动态导入Agent SDK（ESM模块）
let sdkModule: any = null;

async function loadSDK() {
  if (!sdkModule) {
    sdkModule = await import('@anthropic-ai/claude-agent-sdk');
  }
  return sdkModule;
}

// 执行Agent SDK查询
export async function* runAgent(
  prompt: string,
  options: QueryOptions = {}
): AsyncGenerator<any, void, unknown> {
  const sdk = await loadSDK();

  const cwd = options.cwd || AGENT_CWD;
  const queryOptions: Record<string, unknown> = {
    cwd,
    includePartialMessages: options.includePartialMessages ?? true,
    allowedTools: options.allowedTools ?? ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  };

  if (options.sessionId) {
    queryOptions.resume = options.sessionId;
  } else if (options.continue) {
    queryOptions.continue = true;
  }

  if (options.abortSignal) {
    queryOptions.abortSignal = options.abortSignal;
  }

  console.log('[Agent] 执行查询:', { prompt: prompt.substring(0, 50), cwd, sessionId: options.sessionId });

  const result = sdk.query({
    prompt,
    options: queryOptions
  });

  for await (const message of result) {
    yield message;
  }
}

// 列出会话
export async function listSessions(dir?: string): Promise<any[]> {
  const sdk = await loadSDK();
  const sessions = await sdk.listSessions({ dir: dir || AGENT_CWD });
  return sessions;
}

// 获取会话消息
export async function getSessionMessages(sessionId: string): Promise<any[]> {
  const sdk = await loadSDK();
  const messages = await sdk.getSessionMessages(sessionId);
  return messages;
}

// 删除会话
export async function deleteSession(sessionId: string, dir?: string): Promise<void> {
  const sdk = await loadSDK();
  try {
    await sdk.deleteSession(sessionId, { dir: dir || AGENT_CWD });
    console.log('[Agent] 会话删除成功:', sessionId);
  } catch (error) {
    console.error('[Agent] 会话删除失败:', error);
    throw error;
  }
}
