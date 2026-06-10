// Agent SDK钩子定义

// PreToolUse钩子 - 工具执行前捕获
export const preToolUseHook = async (
  input: { tool_name: string; tool_input: Record<string, unknown> },
  toolUseID: string,
  context: { signal: AbortSignal }
) => {
  console.log('[Hook] PreToolUse:', input.tool_name, input.tool_input);
  return { continue: true };
};

// PostToolUse钩子 - 工具执行后捕获
export const postToolUseHook = async (
  input: { tool_name: string; tool_response: unknown }
) => {
  console.log('[Hook] PostToolUse:', input.tool_name);
  return {};
};

// MessageDisplay钩子 - 文本增强
export const messageDisplayHook = async (
  input: { message: string }
) => {
  return { message: input.message };
};

// 钩子配置
export const hooksConfig = {
  PreToolUse: [{ hooks: [preToolUseHook] }],
  PostToolUse: [{ hooks: [postToolUseHook] }],
  MessageDisplay: [{ hooks: [messageDisplayHook] }]
};
