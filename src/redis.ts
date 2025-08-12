import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redisUrl = process.env.REDIS_URL;
console.log(redisUrl)
if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not set');
}
const redis = new Redis(redisUrl);

export default redis; 