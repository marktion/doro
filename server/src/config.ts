// 环境变量配置
import { config } from 'dotenv';
import { resolve } from 'path';

// 加载.env文件
config({ path: resolve(import.meta.dirname, '../.env') });

// 服务器配置
export const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3000', 10);
export const WS_PORT = parseInt(process.env.WS_PORT || '3000', 10);

// MiMo API配置
export const MIMO_API_KEY = process.env.MIMO_API_KEY || '';
export const MIMO_ASR_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions';
export const MIMO_TTS_ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions';

// Agent SDK配置
export const AGENT_CWD = process.env.AGENT_CWD || process.cwd();

// 开发模式
export const NODE_ENV = process.env.NODE_ENV || 'development';
