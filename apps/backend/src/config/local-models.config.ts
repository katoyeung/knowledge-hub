import { registerAs } from '@nestjs/config';

export default registerAs('localModels', () => ({
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    apiKey: process.env.OLLAMA_API_KEY || '', // Optional for Ollama
    cacheTTL: parseInt(process.env.OLLAMA_CACHE_TTL || '0', 10), // in seconds
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || '120000', 10), // in milliseconds - increased to 2 minutes for larger models
    // Model-specific timeouts based on parameter size
    modelTimeouts: {
      '0.6b': parseInt(process.env.OLLAMA_TIMEOUT_0_6B || '30000', 10), // 30 seconds for small models
      '1b': parseInt(process.env.OLLAMA_TIMEOUT_1B || '60000', 10), // 1 minute for 1B models
      '3b': parseInt(process.env.OLLAMA_TIMEOUT_3B || '90000', 10), // 1.5 minutes for 3B models
      '4b': parseInt(process.env.OLLAMA_TIMEOUT_4B || '120000', 10), // 2 minutes for 4B models
      '7b': parseInt(process.env.OLLAMA_TIMEOUT_7B || '180000', 10), // 3 minutes for 7B models
      '13b': parseInt(process.env.OLLAMA_TIMEOUT_13B || '300000', 10), // 5 minutes for 13B models
    },
  },
  localModel: {
    baseUrl: process.env.LOCAL_MODEL_BASE_URL || 'http://localhost:8000',
    apiKey: process.env.LOCAL_MODEL_API_KEY || '', // Optional for local models
    cacheTTL: parseInt(process.env.LOCAL_MODEL_CACHE_TTL || '0', 10), // in seconds
    timeout: parseInt(process.env.LOCAL_MODEL_TIMEOUT || '30000', 10), // in milliseconds
  },
}));
