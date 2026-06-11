// 音频播放功能
import { ref } from 'vue';

// 全局AudioContext实例（页面生命周期内复用）
let globalAudioContext: AudioContext | null = null;
let isUnlocked = false;

// 解锁AudioContext（需要在用户交互时调用）
export function unlockAudioContext() {
  if (isUnlocked) return;

  if (!globalAudioContext) {
    globalAudioContext = new AudioContext();
  }

  if (globalAudioContext.state === 'suspended') {
    globalAudioContext.resume().then(() => {
      isUnlocked = true;
      console.log('[Audio] AudioContext 已解锁');
    });
  } else {
    isUnlocked = true;
  }
}

// 获取已解锁的AudioContext
function getUnlockedAudioContext(): AudioContext {
  if (!globalAudioContext) {
    globalAudioContext = new AudioContext();
  }

  // 如果已解锁，确保处于运行状态
  if (isUnlocked && globalAudioContext.state === 'suspended') {
    globalAudioContext.resume();
  }

  return globalAudioContext;
}

export function useVoicePlayer() {
  const isPlaying = ref(false);
  const currentSentence = ref('');

  // 音频播放队列（支持静默间隙）
  interface QueueItem {
    data: ArrayBuffer;
    gapMs: number;
  }
  const audioQueue: QueueItem[] = [];
  let isProcessingQueue = false;

  // 播放单个音频（带淡入淡出）
  async function playSingleAudio(data: ArrayBuffer): Promise<void> {
    const ctx = getUnlockedAudioContext();

    // 确保AudioContext处于运行状态
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      const audioBuffer = await ctx.decodeAudioData(data);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // 创建增益节点用于淡入淡出
      const gainNode = ctx.createGain();
      const duration = audioBuffer.duration;
      const fadeTime = Math.min(0.02, duration / 4); // 淡入淡出 20ms 或音频时长的 1/4

      // 设置淡入
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeTime);

      // 设置淡出
      gainNode.gain.setValueAtTime(1, ctx.currentTime + duration - fadeTime);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      return new Promise<void>((resolve, reject) => {
        source.onended = () => {
          console.log('[Audio] 单段音频播放完成');
          resolve();
        };
        source.onerror = (e) => {
          console.error('[Audio] 单段音频播放错误:', e);
          reject(e);
        };
        source.start();
      });
    } catch (error) {
      console.error('[Audio] 音频解码失败:', error);
      // 解码失败时跳过这段音频，不阻塞队列
      return Promise.resolve();
    }
  }

  // 逐段播放队列（带静默间隙）
  async function playQueue() {
    if (isProcessingQueue || audioQueue.length === 0) return;

    isProcessingQueue = true;
    isPlaying.value = true;

    console.log('[Audio] 开始播放队列，长度:', audioQueue.length);

    while (audioQueue.length > 0) {
      const item = audioQueue.shift()!;
      await playSingleAudio(item.data);

      // 播放后插入固定静默间隙
      if (item.gapMs > 0) {
        await new Promise(resolve => setTimeout(resolve, item.gapMs));
      }
    }

    console.log('[Audio] 队列播放完成');
    isPlaying.value = false;
    isProcessingQueue = false;
  }

  // 添加到播放队列（支持静默间隙）
  function addToQueue(data: ArrayBuffer, gapMs?: number) {
    audioQueue.push({ data, gapMs: gapMs ?? 300 });
    console.log('[Audio] 添加到队列，当前长度:', audioQueue.length);
    // 尝试开始播放
    playQueue();
  }

  function stop() {
    if (globalAudioContext) {
      globalAudioContext.close();
      globalAudioContext = null;
    }
    isUnlocked = false;
    isPlaying.value = false;
    currentSentence.value = '';
    audioQueue.length = 0;
    isProcessingQueue = false;
  }

  return { isPlaying, currentSentence, addToQueue, playSingleAudio, stop, unlockAudioContext };
}
