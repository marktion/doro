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
  console.log('[ASR] 开始识别，音频数据长度:', audioDataUrl.length);
  console.log('[ASR] 数据格式预览:', audioDataUrl.substring(0, 100) + '...');

  // 添加超时控制
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时

  try {
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
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ASR API调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;
    console.log('[ASR] 识别完成:', data.choices?.[0]?.message?.content);
    return data.choices[0].message.content;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('ASR识别超时（30秒）');
    }
    throw error;
  }
}

// 转换音频Buffer为Data URL
export function bufferToDataUrl(buffer: Buffer, mimeType: string = 'audio/webm'): string {
  const base64Audio = buffer.toString('base64');
  return `data:${mimeType};base64,${base64Audio}`;
}
