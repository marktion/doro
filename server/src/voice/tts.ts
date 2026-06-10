// MiMo TTS语音合成客户端
import { MIMO_API_KEY, MIMO_TTS_ENDPOINT } from '../config.js';

export interface TTSOptions {
  voice?: string;
  responseFormat?: 'mp3' | 'wav';
  speed?: number;
}

// 调用MiMo TTS API进行语音合成
export async function synthesizeSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const response = await fetch(MIMO_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': MIMO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mimo-tts',
      input: text,
      voice: options.voice || 'default',
      response_format: options.responseFormat || 'mp3'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS API调用失败: ${response.status} ${errorText}`);
  }

  // 返回音频流
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// 分句函数
export function splitIntoSentences(text: string): string[] {
  const sentenceDelimiters = /[。！？.!?]+/;
  const sentences: string[] = [];
  let current = '';

  for (const char of text) {
    current += char;
    if (sentenceDelimiters.test(char)) {
      sentences.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences;
}

// 长文本截断阈值
const MAX_SENTENCE_LENGTH = 500;

// 拆分长句子
export function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_SENTENCE_LENGTH) {
    return [sentence];
  }

  const subDelimiters = /[，、；,;]+/;
  const parts: string[] = [];
  let current = '';

  for (const char of sentence) {
    current += char;
    if (subDelimiters.test(char) && current.length > 100) {
      parts.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}
