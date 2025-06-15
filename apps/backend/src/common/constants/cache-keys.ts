export const CACHE_KEYS = {
  INDICATOR: {
    EARNINGS: 'indicator:earnings',
    QUALITY: 'indicator:quality',
    VALUE: 'indicator:value',
    GROWTH: 'indicator:growth',
    MOVING_AVERAGE: 'indicator:moving_average',
    NEWS_ANALYSIS: 'indicator:news_analysis',
    RESULT: 'indicator:result',
  },
  INDUSTRY: {
    COMPARISON: 'industry:comparison',
  },
  FUNDAMENTAL: {
    DATA: 'fundamental:data',
  },
  API: {
    RESPONSE: 'api:response',
  },
  MARKET: {
    REALTIME: 'market:realtime',
    HISTORICAL: 'market:historical',
  },
  SCREENER: {
    RESULTS: 'screener:results',
  },
  USER: {
    PROFILE: 'user:profile',
  },
  LLM: {
    RESPONSE: 'llm:response',
  },
} as const;
