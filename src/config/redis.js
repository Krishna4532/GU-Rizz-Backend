const Redis = require('ioredis');

let redisClient = null;

const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('connect', () => console.log('✅ Redis connected'));
    redisClient.on('error', (err) => console.warn('⚠️  Redis error (non-fatal):', err.message));
  }
  return redisClient;
};

// Safe get — returns null if Redis is unavailable
const safeGet = async (key) => {
  try {
    return await getRedisClient().get(key);
  } catch {
    return null;
  }
};

// Safe set — silently fails if Redis is unavailable
const safeSet = async (key, value, ttlSeconds = 300) => {
  try {
    await getRedisClient().set(key, value, 'EX', ttlSeconds);
  } catch {
    // non-fatal
  }
};

const safeDel = async (key) => {
  try {
    await getRedisClient().del(key);
  } catch {
    // non-fatal
  }
};

module.exports = { getRedisClient, safeGet, safeSet, safeDel };
