// MiMo TTS语音合成客户端
import { MIMO_API_KEY, MIMO_TTS_ENDPOINT } from '../config.js';

// --- 分块参数 ---
const MIN_CHUNK_CHARS = 80;   // 最小块长度
const MAX_CHUNK_CHARS = 120;  // 最大块长度
export const SILENCE_GAP_MS = 500;   // 段间静默间隙（毫秒）

// --- 固定 TTS 风格指令 ---
const TTS_STYLE = '自然、友好的中文语音，语速适中，清晰易懂。';

export interface TTSOptions {
  voice?: string;
  format?: 'mp3' | 'wav';
}

// 清洗文本，去除Markdown格式和特殊字符，生成适合语音合成的纯文本
export function cleanTextForTTS(text: string): string {
  let cleaned = text;

  // 1. 移除代码块（```language ... ```）
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ' ');

  // 2. 移除行内代码（`code`）
  cleaned = cleaned.replace(/`([^`]*)`/g, '$1');

  // 3. 移除图片（![alt](url)），保留 alt 文本
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // 4. 提取链接文本（[text](url) -> text）
  cleaned = cleaned.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // 5. 移除标题标记（# ## ### 等）
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // 6. 移除粗体标记（**text** 或 __text__）
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');

  // 7. 移除斜体标记（*text* 或 _text_）
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');

  // 8. 移除删除线（~~text~~）
  cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');

  // 9. 移除引用标记（> text）
  cleaned = cleaned.replace(/^>\s+/gm, '');

  // 10. 移除列表标记（- item, * item, 1. item, • item）
  cleaned = cleaned.replace(/^[\s]*[-*+•]\s+/gm, '');
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '');

  // 11. 移除水平分隔线（---, ***, ___）
  cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, ' ');

  // 12. 移除HTML标签
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 13. 移除URL（http://... 或 https://...）
  cleaned = cleaned.replace(/https?:\/\/[^\s)>\]]+/g, ' ');

  // 14. 移除文件路径（Unix和Windows风格）
  cleaned = cleaned.replace(/(?:\/[\w.\-]+)+/g, ' ');
  cleaned = cleaned.replace(/(?:[A-Z]:\\[\w.\-\\]+)+/g, ' ');

  // 15. 移除转义字符
  cleaned = cleaned.replace(/\\[nrtbfv\\]/g, ' ');

  // 16. 移除特殊Unicode符号（表情、装饰符号等）
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ' ');

  // 17. 合并多个连续空格为单个空格
  cleaned = cleaned.replace(/ {2,}/g, ' ');

  // 18. 合并多个换行为单个换行
  cleaned = cleaned.replace(/\n{2,}/g, '\n');

  // 19. 去除首尾空白
  cleaned = cleaned.trim();

  return cleaned;
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
      model: 'mimo-v2.5-tts',
      messages: [
        { role: 'user', content: TTS_STYLE },
        { role: 'assistant', content: text }
      ],
      audio: {
        format: 'wav',
        voice: options.voice || 'Chloe'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS API调用失败: ${response.status} ${errorText}`);
  }

  // 解析响应，提取base64编码的音频数据
  const data = await response.json() as any;
  const audioData = data.choices?.[0]?.message?.audio?.data;

  if (!audioData) {
    throw new Error('TTS API响应中未找到音频数据');
  }

  // 解码base64音频数据
  const audioBuffer = Buffer.from(audioData, 'base64');
  return audioBuffer;
}

// 固定长度分块函数（80-120字，优先标点切分，兜底硬切）
export function splitIntoChunks(text: string): string[] {
  // 按标点拆分为片段，保留分隔符
  const parts = text.split(/([。！？.!?；;，,、])/);
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    const testLen = current.length + part.length;

    // 句子级分隔符：累积 >= MIN 时切分
    if (/[。！?!]/.test(part) && testLen >= MIN_CHUNK_CHARS) {
      chunks.push(current + part);
      current = '';
      continue;
    }

    // 任意标点：累积 >= MAX 时切分
    if (/[，,、；;]/.test(part) && testLen >= MAX_CHUNK_CHARS) {
      chunks.push(current + part);
      current = '';
      continue;
    }

    current += part;

    // 硬切：超过 MAX 且无标点
    if (current.length > MAX_CHUNK_CHARS) {
      chunks.push(current.substring(0, MAX_CHUNK_CHARS));
      current = current.substring(MAX_CHUNK_CHARS);
    }
  }

  if (current.trim()) chunks.push(current);
  return chunks.filter(c => c.replace(/[\s\p{P}]/gu, '').length > 0);
}
