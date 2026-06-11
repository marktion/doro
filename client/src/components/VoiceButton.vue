<template>
  <button
    @mousedown.prevent="handleStartRecording"
    @mouseup.prevent="stopAndSend"
    @mouseleave="handleCancelRecording"
    @touchstart.prevent="handleStartRecording"
    @touchend.prevent="stopAndSend"
    @touchcancel="handleCancelRecording"
    :class="[
      'relative px-4 py-2 rounded-lg transition-all duration-200',
      recorder.isRecording.value
        ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
    ]"
    :disabled="isProcessing"
  >
    <span v-if="isProcessing" class="flex items-center gap-2">
      <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
      识别中...
    </span>
    <span v-else-if="recorder.isRecording.value">松开发送</span>
    <span v-else>按住说话</span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useVoiceRecorder } from '../composables/useVoiceRecorder';
import { useAgentSDK } from '../composables/useAgentSDK';
import { unlockAudioContext } from '../composables/useVoicePlayer';

const emit = defineEmits<{
  (e: 'audio-sent'): void;
  (e: 'asr-result', text: string): void;
}>();

const recorder = useVoiceRecorder();
const { sendVoiceAudio, onASRResult, isConnected } = useAgentSDK();
const isProcessing = ref(false);

// 注册ASR结果回调
onASRResult((text) => {
  isProcessing.value = false;
  emit('asr-result', text);
});

async function handleStartRecording() {
  if (!isConnected.value) {
    alert('WebSocket未连接，请稍后再试');
    return;
  }
  // 解锁AudioContext（利用用户交互解锁音频播放权限）
  unlockAudioContext();
  try {
    await recorder.startRecording();
  } catch (error) {
    console.error('录音失败:', error);
    alert('无法访问麦克风，请检查浏览器权限设置');
  }
}

async function stopAndSend() {
  if (!recorder.isRecording.value) return;
  try {
    const blob = await recorder.stopRecording();
    if (blob.size > 0) {
      if (!isConnected.value) {
        alert('WebSocket未连接，无法发送语音');
        return;
      }
      isProcessing.value = true;
      sendVoiceAudio(blob);
      emit('audio-sent');
    }
  } catch (error) {
    console.error('发送语音失败:', error);
    isProcessing.value = false;
  }
}

function handleCancelRecording() {
  if (recorder.isRecording.value) {
    recorder.cancelRecording();
  }
}
</script>
