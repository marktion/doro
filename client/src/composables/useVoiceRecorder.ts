// 录音功能
import { ref } from 'vue';

export function useVoiceRecorder() {
  const isRecording = ref(false);
  let audioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  let scriptProcessor: ScriptProcessorNode | null = null;
  let recordedChunks: Float32Array[] = [];

  // 录音参数
  const SAMPLE_RATE = 16000; // ASR推荐采样率
  const CHANNELS = 1; // 单声道

  async function startRecording() {
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: CHANNELS,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // 创建AudioContext进行格式转换
      audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      mediaStreamSource = audioContext.createMediaStreamSource(audioStream);

      // 使用ScriptProcessorNode捕获音频数据
      const bufferSize = 4096;
      scriptProcessor = audioContext.createScriptProcessor(bufferSize, CHANNELS, CHANNELS);

      scriptProcessor.onaudioprocess = (event) => {
        if (!isRecording.value) return;
        // 获取单声道音频数据
        const inputData = event.inputBuffer.getChannelData(0);
        // 复制数据（因为event会被回收）
        const data = new Float32Array(inputData.length);
        data.set(inputData);
        recordedChunks.push(data);
      };

      mediaStreamSource.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      recordedChunks = [];
      isRecording.value = true;
      console.log('[Recorder] 开始录音，采样率:', SAMPLE_RATE, '声道:', CHANNELS);
    } catch (error) {
      console.error('录音启动失败:', error);
      throw error;
    }
  }

  function stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!isRecording.value) {
        reject(new Error('未在录音'));
        return;
      }

      isRecording.value = false;

      // 断开音频节点
      if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
      }
      if (mediaStreamSource) {
        mediaStreamSource.disconnect();
        mediaStreamSource = null;
      }

      // 停止所有音轨
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }

      // 合并所有录音片段
      const totalLength = recordedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const mergedData = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of recordedChunks) {
        mergedData.set(chunk, offset);
        offset += chunk.length;
      }
      recordedChunks = [];

      // 转换为WAV格式
      const wavBlob = encodeWav(mergedData, SAMPLE_RATE, CHANNELS);
      console.log('[Recorder] 录音完成，WAV大小:', wavBlob.size, '字节');

      // 关闭AudioContext
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }

      resolve(wavBlob);
    });
  }

  function cancelRecording() {
    if (isRecording.value) {
      isRecording.value = false;
      recordedChunks = [];

      if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
      }
      if (mediaStreamSource) {
        mediaStreamSource.disconnect();
        mediaStreamSource = null;
      }
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }
    }
  }

  return { isRecording, startRecording, stopRecording, cancelRecording };
}

// 编码Float32Array为WAV格式的Blob
function encodeWav(samples: Float32Array, sampleRate: number, numChannels: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // WAV文件头
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // 写入采样数据
  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
