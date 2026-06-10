<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { useSessionStore } from '../stores/session'
import { useAgentSDK } from '../composables/useAgentSDK'

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const { sendQuery, interruptQuery, requestSessions } = useAgentSDK()

const inputText = ref('')
const chatContainer = ref<HTMLElement | null>(null)

// 自动滚动到底部
watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  }
)

// 发送消息
function handleSend() {
  const text = inputText.value.trim()
  if (!text) return

  // 添加用户消息
  chatStore.addMessage({
    id: `user-${Date.now()}`,
    type: 'user',
    content: text,
    timestamp: new Date()
  })

  // 发送到后端
  sendQuery(text, chatStore.currentSessionId || undefined)

  // 清空输入
  inputText.value = ''
}

// 中断
function handleInterrupt() {
  interruptQuery()
}

// 加载会话
function loadSessions() {
  requestSessions()
}
</script>

<template>
  <div class="flex h-screen">
    <!-- 侧边栏 -->
    <aside class="w-64 bg-gray-800 text-white p-4">
      <h2 class="text-lg font-bold mb-4">会话列表</h2>
      <button
        @click="loadSessions"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded mb-4"
      >
        刷新会话
      </button>
      <div class="space-y-2">
        <div
          v-for="session in sessionStore.sessions"
          :key="session.sessionId"
          @click="sessionStore.selectSession(session)"
          class="p-2 rounded cursor-pointer hover:bg-gray-700"
          :class="{ 'bg-gray-700': sessionStore.selectedSession?.sessionId === session.sessionId }"
        >
          <div class="text-sm font-medium">{{ session.summary || '新会话' }}</div>
          <div class="text-xs text-gray-400">{{ session.cwd }}</div>
        </div>
      </div>
    </aside>

    <!-- 主区域 -->
    <main class="flex-1 flex flex-col">
      <!-- 消息区域 -->
      <div
        ref="chatContainer"
        class="flex-1 overflow-y-auto p-4 space-y-4"
      >
        <div
          v-for="message in chatStore.messages"
          :key="message.id"
          class="max-w-3xl mx-auto"
        >
          <!-- 用户消息 -->
          <div
            v-if="message.type === 'user'"
            class="flex justify-end"
          >
            <div class="bg-blue-600 text-white rounded-lg px-4 py-2 max-w-lg">
              {{ message.content }}
            </div>
          </div>

          <!-- 助手消息 -->
          <div
            v-else-if="message.type === 'assistant'"
            class="flex justify-start"
          >
            <div
              class="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 max-w-lg shadow"
              :class="{ 'animate-pulse': message.isPartial }"
            >
              {{ message.content }}
            </div>
          </div>

          <!-- 工具调用 -->
          <div
            v-else-if="message.type === 'tool_use'"
            class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3"
          >
            <div class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              工具调用: {{ message.toolName }}
            </div>
            <pre class="mt-2 text-xs overflow-x-auto">{{ message.content }}</pre>
          </div>

          <!-- 系统消息 -->
          <div
            v-else
            class="text-center text-gray-500 text-sm"
          >
            {{ message.content }}
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="border-t p-4">
        <div class="max-w-3xl mx-auto flex gap-2">
          <input
            v-model="inputText"
            @keyup.enter="handleSend"
            type="text"
            placeholder="输入消息..."
            class="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            @click="handleSend"
            class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            发送
          </button>
          <button
            @click="handleInterrupt"
            class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
          >
            中断
          </button>
        </div>
      </div>
    </main>
  </div>
</template>
