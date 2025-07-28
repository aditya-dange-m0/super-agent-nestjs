export default () => ({
  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT!, 10) || 6379,
  CACHE_TTL: parseInt(process.env.CACHE_TTL!, 10) || 3000,

  // AI Models Configuration
  CHAT_MODEL: process.env.CHAT_MODEL || 'gpt-4o-mini',
  ANALYSIS_MODEL: process.env.ANALYSIS_MODEL || 'gpt-4o-mini',
  
  // Agent Configuration
  MAX_AGENT_STEPS: parseInt(process.env.MAX_AGENT_STEPS!, 10) || 8,
  MAX_CONVERSATION_HISTORY: parseInt(process.env.MAX_CONVERSATION_HISTORY!, 10) || 10,

});
