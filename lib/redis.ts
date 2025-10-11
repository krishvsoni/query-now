import { createClient } from 'redis';

const client = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

client.on('error', (err) => console.error('Redis Client Error', err));

let isConnected = false;

export async function getRedisClient() {
  if (!isConnected) {
    await client.connect();
    isConnected = true;
  }
  return client;
}

export class DocumentPipeline {
  private redis;

  constructor() {
    this.redis = null;
  }

  async init() {
    this.redis = await getRedisClient();
  }

  async queueDocumentIngestion(docId: string, userId: string, fileName: string, filePath: string) {
    if (!this.redis) await this.init();
    
    const job = {
      docId,
      userId,
      fileName,
      filePath,
      stage: 'parsing',
      timestamp: Date.now()
    };

    await this.redis.xAdd('doc:ingestion', '*', job);
    return docId;
  }

  async moveToNextStage(docId: string, currentStage: string, data: any) {
    if (!this.redis) await this.init();
    
    const stages = ['parsing', 'ontology', 'embedding', 'graph', 'completed'];
    const currentIndex = stages.indexOf(currentStage);
    const nextStage = stages[currentIndex + 1];

    if (nextStage) {
      const job = {
        docId,
        stage: nextStage,
        data: JSON.stringify(data),
        timestamp: Date.now()
      };

      await this.redis.xAdd(`doc:${nextStage}`, '*', job);
    }
  }

  async cacheEmbedding(key: string, embedding: number[], ttl: number = 3600) {
    if (!this.redis) await this.init();
    await this.redis.setEx(key, ttl, JSON.stringify(embedding));
  }

  async getCachedEmbedding(key: string): Promise<number[] | null> {
    if (!this.redis) await this.init();
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async trackUserQuery(userId: string) {
    if (!this.redis) await this.init();
    const key = `user:${userId}:queries_today`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 86400); // 24 hours
    }
    return count;
  }

  async getUserQueryCount(userId: string): Promise<number> {
    if (!this.redis) await this.init();
    const count = await this.redis.get(`user:${userId}:queries_today`);
    return count ? parseInt(count) : 0;
  }

  async bufferStreamMessage(sessionId: string, message: any) {
    if (!this.redis) await this.init();
    await this.redis.lPush(`stream:${sessionId}`, JSON.stringify(message));
    await this.redis.expire(`stream:${sessionId}`, 300); // 5 minutes
  }

  async getStreamMessages(sessionId: string): Promise<any[]> {
    if (!this.redis) await this.init();
    const messages = await this.redis.lRange(`stream:${sessionId}`, 0, -1);
    return messages.map(msg => JSON.parse(msg)).reverse();
  }
}

export const pipeline = new DocumentPipeline();