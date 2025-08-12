import redis from './redis';

async function testRedis() {
  try {
    await redis.set('test-key', 'hello-redis');
    const value = await redis.get('test-key');
    console.log('Redis test value:', value); // Should print 'hello-redis'
    process.exit(0);
  } catch (err) {
    console.error('Redis connection error:', err);
    process.exit(1);
  }
}

testRedis(); 