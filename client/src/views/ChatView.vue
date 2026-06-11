<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '../stores/chat'
import { useSessionStore } from '../stores/session'
import { useAgentSDK } from '../composables/useAgentSDK'
import { useVoicePlayer } from '../composables/useVoicePlayer'
import VoiceButton from '../components/VoiceButton.vue'
import type { SessionInfo } from '../types/agent'

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const { sendQuery, interruptQuery, requestSessions, requestSessionMessages, requestTTS, onTTSAudio, onTTSDone, onSessionList, onSessionMessages } = useAgentSDK()
const voicePlayer = useVoicePlayer()

const inputText = ref('')
const chatContainer = ref<HTMLElement | null>(null)

// 注册会话列表回调
onSessionList((sessions: SessionInfo[]) => {
  console.log('[Session] 收到会话列表:', sessions.length)
  sessionStore.setSessions(sessions)

  // 如果之前有选中的会话，从新列表中匹配并更新
  if (sessionStore.selectedSession) {
    const matched = sessions.find(s => s.sessionId === sessionStore.selectedSession!.sessionId)
    if (matched) {
      sessionStore.selectSession(matched)
    }
  }
})

// 注册会话消息回调
onSessionMessages((messages: unknown[]) => {
  console.log('[Session] 收到会话消息，数量:', messages.length)
  console.log('[Session] 原始消息:', JSON.stringify(messages, null, 2))
  // 清空当前消息
  chatStore.clearMessages()
  // 加载历史消息（标记为已请求TTS，避免播放历史）
  for (const msg of messages) {
    const sdkMsg = msg as any
    console.log('[Session] 消息类型:', sdkMsg.type, '内容:', JSON.stringify(sdkMsg.message?.content?.substring?.(0, 50) || sdkMsg.message?.content))

    // 处理助手消息
    if (sdkMsg.type === 'assistant' && sdkMsg.message?.content) {
      for (const block of sdkMsg.message.content) {
        if (block.type === 'text' && block.text) {
          chatStore.addMessage({
            id: sdkMsg.uuid || `msg-${Date.now()}`,
            type: 'assistant',
            content: block.text,
            timestamp: new Date(),
            ttsRequested: true
          })
        }
      }
    }

    // 处理用户消息（human 或 user 类型）
    if ((sdkMsg.type === 'human' || sdkMsg.type === 'user') && sdkMsg.message?.content) {
      const content = typeof sdkMsg.message.content === 'string'
        ? sdkMsg.message.content
        : sdkMsg.message.content.map((b: any) => b.text || '').join('')
      if (content) {
        chatStore.addMessage({
          id: sdkMsg.uuid || `msg-${Date.now()}`,
          type: 'user',
          content,
          timestamp: new Date(),
          ttsRequested: true
        })
      }
    }
  }

  // 合并缓存的用户消息（如果SDK没有返回某些用户消息）
  if (chatStore.currentSessionId) {
    const cachedMessages = chatStore.getCachedUserMessages(chatStore.currentSessionId)
    for (const cachedMsg of cachedMessages) {
      // 检查是否已存在（避免重复）
      const exists = chatStore.messages.some(m =>
        m.type === 'user' && m.content === cachedMsg.content
      )
      if (!exists) {
        chatStore.addMessage(cachedMsg)
      }
    }
  }
})

// 注册TTS音频回调 - 逐段添加到播放队列（带静默间隙）
onTTSAudio((sentence, audioData, silenceGapMs) => {
  console.log('[TTS] 收到音频:', sentence, '大小:', audioData.byteLength, '静默间隙:', silenceGapMs, 'ms')
  voicePlayer.addToQueue(audioData, silenceGapMs)
})

// TTS完成回调 - 队列会自动播放
onTTSDone(() => {
  console.log('[TTS] 音频接收完成，队列自动播放中')
})

// 监听助手消息，自动请求TTS
watch(
  () => chatStore.messages,
  () => {
    // 找到最后一个未请求TTS的助手消息
    const messages = chatStore.messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === 'assistant' && !msg.isPartial && !msg.ttsRequested) {
        msg.ttsRequested = true
        console.log('[TTS] 请求语音合成:', msg.content)
        requestTTS(msg.content)
        break
      }
    }
  },
  { deep: true }
)

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

// 页面加载时获取会话列表，并恢复之前的选中会话
onMounted(() => {
  requestSessions()

  // 如果有之前选中的会话，自动加载其消息
  if (sessionStore.selectedSession) {
    chatStore.currentSessionId = sessionStore.selectedSession.sessionId
    requestSessionMessages(sessionStore.selectedSession.sessionId)
  }
})

// 选择会话
function handleSelectSession(session: SessionInfo) {
  sessionStore.selectSession(session)
  chatStore.currentSessionId = session.sessionId
  chatStore.clearMessages()
  requestSessionMessages(session.sessionId)
}

// 新建会话
function handleNewSession() {
  sessionStore.clearSelection()
  chatStore.currentSessionId = null
  chatStore.clearMessages()
}

// 发送消息
function handleSend() {
  const text = inputText.value.trim()
  if (!text) return

  // 添加用户消息
  chatStore.addMessage({
    id: `user-${Date.now()}`,
    type: 'user',
    content: text,
    timestamp: new Date(),
    ttsRequested: true
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

// 处理ASR识别结果
function handleASRResult(text: string) {
  inputText.value = text
  // 自动发送识别结果
  if (text.trim()) {
    nextTick(() => handleSend())
  }
}
</script>

<template>
  <div class="flex h-screen">
    <!-- 侧边栏 -->
    <aside class="w-64 bg-gray-800 text-white p-4">
      <h2 class="text-lg font-bold mb-4">会话列表</h2>
      <div class="flex gap-2 mb-4">
        <button
          @click="handleNewSession"
          class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm"
        >
          新建
        </button>
        <button
          @click="loadSessions"
          class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm"
        >
          刷新
        </button>
      </div>
      <div class="space-y-2">
        <div
          v-for="session in sessionStore.sessions"
          :key="session.sessionId"
          @click="handleSelectSession(session)"
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
          <VoiceButton @asr-result="handleASRResult" />
          <input
            v-model="inputText"
            @keyup.enter="handleSend"
            type="text"
            placeholder="输入消息..."
            autocomplete="off"
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
