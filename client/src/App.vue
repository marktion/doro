<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAgentSDK } from './composables/useAgentSDK'
import { useChatStore } from './stores/chat'

// 初始化WebSocket连接
const { isConnected, onMessage } = useAgentSDK()
const chatStore = useChatStore()

// 监听Agent消息
onMessage((message) => {
  chatStore.handleAgentMessage(message)
})
</script>

<template>
  <div class="min-h-screen bg-gray-100 dark:bg-gray-900">
    <RouterView />
  </div>
</template>
