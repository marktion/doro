// Pinia Store - 聊天消息
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { SDKMessage, AssistantMessage, StreamEvent, ResultMessage } from '../types/agent';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool_use';
  content: string;
  timestamp: Date;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isPartial?: boolean;
  ttsRequested?: boolean;
}

export const useChatStore = defineStore('chat', () => {
  // 消息列表
  const messages = ref<ChatMessage[]>([]);

  // 当前会话ID
  const _currentSessionId = ref<string | null>(() => {
    return localStorage.getItem('doro_current_session_id');
  });

  // 使用computed来同步localStorage
  const currentSessionId = computed({
    get: () => _currentSessionId.value,
    set: (value) => {
      _currentSessionId.value = value;
      if (value) {
        localStorage.setItem('doro_current_session_id', value);
      } else {
        localStorage.removeItem('doro_current_session_id');
      }
    }
  });

  // 用户消息缓存（按会话ID存储，使用普通对象而非Map）
  const userMessagesCache = ref<Record<string, ChatMessage[]>>(() => {
    const saved = localStorage.getItem('doro_user_messages_cache');
    return saved ? JSON.parse(saved) : {};
  });

  // 流式文本缓冲
  const streamBuffer = ref('');

  // 保存用户消息缓存到localStorage
  function saveUserMessagesCache() {
    localStorage.setItem('doro_user_messages_cache', JSON.stringify(userMessagesCache.value));
  }

  // 添加消息
  function addMessage(message: ChatMessage) {
    messages.value.push(message);

    // 如果是用户消息，保存到缓存
    if (message.type === 'user' && currentSessionId.value) {
      if (!userMessagesCache.value[currentSessionId.value]) {
        userMessagesCache.value[currentSessionId.value] = [];
      }
      userMessagesCache.value[currentSessionId.value].push(message);
      saveUserMessagesCache();
    }
  }

  // 处理Agent SDK消息
  function handleAgentMessage(sdkMessage: SDKMessage) {
    switch (sdkMessage.type) {
      case 'stream_event':
        handleStreamEvent(sdkMessage as StreamEvent);
        break;
      case 'assistant':
        handleAssistantMessage(sdkMessage as AssistantMessage);
        break;
      case 'result':
        handleResultMessage(sdkMessage as ResultMessage);
        break;
      case 'system':
        handleSystemMessage(sdkMessage);
        break;
    }
  }

  // 处理流式事件
  function handleStreamEvent(event: StreamEvent) {
    if (event.event.type === 'content_block_delta' && event.event.delta) {
      streamBuffer.value += event.event.delta;

      // 更新或添加部分消息
      const lastMessage = messages.value[messages.value.length - 1];
      if (lastMessage && lastMessage.isPartial) {
        lastMessage.content = streamBuffer.value;
      } else {
        addMessage({
          id: event.uuid,
          type: 'assistant',
          content: streamBuffer.value,
          timestamp: new Date(),
          isPartial: true
        });
      }
    }
  }

  // 处理完整助手消息
  function handleAssistantMessage(message: AssistantMessage) {
    // 清空流式缓冲
    streamBuffer.value = '';

    // 移除部分消息
    const partialIndex = messages.value.findIndex(m => m.isPartial);
    if (partialIndex > -1) {
      messages.value.splice(partialIndex, 1);
    }

    // 添加完整消息
    if (message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text) {
          addMessage({
            id: message.uuid,
            type: 'assistant',
            content: block.text,
            timestamp: new Date()
          });
        } else if (block.type === 'tool_use') {
          addMessage({
            id: block.id || message.uuid,
            type: 'tool_use',
            content: JSON.stringify(block.input, null, 2),
            timestamp: new Date(),
            toolName: block.name,
            toolInput: block.input
          });
        }
      }
    }
  }

  // 处理结果消息
  function handleResultMessage(message: ResultMessage) {
    addMessage({
      id: `result-${Date.now()}`,
      type: 'system',
      content: `完成 - 耗时: ${(message.duration_ms / 1000).toFixed(1)}s, 费用: $${message.total_cost_usd.toFixed(4)}`,
      timestamp: new Date()
    });

    // 更新会话ID
    if (message.session_id) {
      currentSessionId.value = message.session_id;
    }
  }

  // 处理系统消息
  function handleSystemMessage(message: SDKMessage) {
    if (message.subtype === 'init' && message.session_id) {
      currentSessionId.value = message.session_id;
    }
  }

  // 清空消息
  function clearMessages() {
    messages.value = [];
    streamBuffer.value = '';
  }

  // 获取缓存的用户消息
  function getCachedUserMessages(sessionId: string): ChatMessage[] {
    return userMessagesCache.value[sessionId] || [];
  }

  return {
    messages,
    currentSessionId,
    streamBuffer,
    addMessage,
    handleAgentMessage,
    clearMessages,
    getCachedUserMessages
  };
});
