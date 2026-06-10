// MiMo ASR语音识别客户端
import { MIMO_API_KEY, MIMO_ASR_ENDPOINT } from '../config.js';

export interface ASROptions {
  language?: 'zh' | 'en';
}

export interface ASRResult {
  text: string;
  isFinal: boolean;
}

// 调用MiMo ASR API进行语音识别
export async function recognizeSpeech(
  audioDataUrl: string,
  options: ASROptions = {}
): Promise<string> {
  const response = await fetch(MIMO_ASR_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': MIMO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'mimo-v2.5-asr',
      messages: [{
        role: 'user',
        content: [{
          type: 'input_audio',
          input_audio: {
            data: audioDataUrl
          }
        }]
      }],
      asr_options: {
        language: options.language || 'zh'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ASR API调用失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 转换音频Buffer为Data URL
export function bufferToDataUrl(buffer: Buffer, mimeType: string = 'audio/webm'): string {
  const base64Audio = buffer.toString('base64');
  return `data:${mimeType};base64,${base64Audio}`;
}
