import { createClient } from 'redis';

const client = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '16675')
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
  private redis: any;

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
      timestamp: Date.now().toString()
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
        timestamp: Date.now().toString()
      };
      await this.redis.xAdd(`doc:${nextStage}`, '*', job);
    }
  }

  async cacheEmbedding(key: string, embedding: number[], ttl: number = 3600) {
    if (!this.redis) await this.init();
    console.log(`[Redis Cache] Storing embedding with key: ${key.substring(0, 50)}... (TTL: ${ttl}s)`);
    await this.redis.setEx(key, ttl, JSON.stringify(embedding));
  }

  async getCachedEmbedding(key: string): Promise<number[] | null> {
    if (!this.redis) await this.init();
    const cached = await this.redis.get(key);
    if (cached) {
      console.log(`[Redis Cache] ✓ Cache HIT for embedding: ${key.substring(0, 50)}...`);
    } else {
      console.log(`[Redis Cache] ✗ Cache MISS for embedding: ${key.substring(0, 50)}...`);
    }
    return cached ? JSON.parse(cached) : null;
  }

  async trackUserQuery(userId: string) {
    if (!this.redis) await this.init();
    const key = `user:${userId}:queries_today`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 86400);
    }
    console.log(`[Redis Usage] User ${userId} query count: ${count}/100`);
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
    await this.redis.expire(`stream:${sessionId}`, 300);
  }

  async getStreamMessages(sessionId: string): Promise<any[]> {
    if (!this.redis) await this.init();
    const messages = await this.redis.lRange(`stream:${sessionId}`, 0, -1);
    return messages.map((msg: string) => JSON.parse(msg)).reverse();
  }

  async cacheSearchResults(key: string, results: any[], ttl: number = 1800) {
    if (!this.redis) await this.init();
    console.log(`[Redis Cache] Storing search results: ${key.substring(0, 50)}... (${results.length} results, TTL: ${ttl}s)`);
    await this.redis.setEx(`search:${key}`, ttl, JSON.stringify(results));
  }

  async getCachedSearchResults(key: string): Promise<any[] | null> {
    if (!this.redis) await this.init();
    const cached = await this.redis.get(`search:${key}`);
    if (cached) {
      const results = JSON.parse(cached);
      console.log(`[Redis Cache] ✓ Cache HIT for search: ${key.substring(0, 50)}... (${results.length} results)`);
      return results;
    } else {
      console.log(`[Redis Cache] ✗ Cache MISS for search: ${key.substring(0, 50)}...`);
      return null;
    }
  }

  async cacheGraphData(userId: string, query: string, data: any, ttl: number = 3600) {
    if (!this.redis) await this.init();
    const key = `graph:${userId}:${Buffer.from(query).toString('base64')}`;
    console.log(`[Redis Cache] Storing graph data for user ${userId}: "${query.substring(0, 40)}..." (TTL: ${ttl}s)`);
    await this.redis.setEx(key, ttl, JSON.stringify(data));
  }

  async getCachedGraphData(userId: string, query: string): Promise<any | null> {
    if (!this.redis) await this.init();
    const key = `graph:${userId}:${Buffer.from(query).toString('base64')}`;
    const cached = await this.redis.get(key);
    if (cached) {
      console.log(`[Redis Cache] ✓ Cache HIT for graph data: "${query.substring(0, 40)}..."`);
    } else {
      console.log(`[Redis Cache] ✗ Cache MISS for graph data: "${query.substring(0, 40)}..."`);
    }
    return cached ? JSON.parse(cached) : null;
  }

  async createChatSession(userId: string, sessionData: any): Promise<string> {
    if (!this.redis) await this.init();
    const sessionId = `session:${userId}:${Date.now()}`;
    await this.redis.setEx(sessionId, 3600, JSON.stringify({
      ...sessionData,
      createdAt: Date.now(),
      lastActivity: Date.now()
    }));
    return sessionId;
  }

  async updateSessionActivity(sessionId: string) {
    if (!this.redis) await this.init();
    const session = await this.redis.get(sessionId);
    if (session) {
      const sessionData = JSON.parse(session);
      sessionData.lastActivity = Date.now();
      await this.redis.setEx(sessionId, 3600, JSON.stringify(sessionData));
    }
  }

  async getActiveUserSessions(userId: string): Promise<string[]> {
    if (!this.redis) await this.init();
    const pattern = `session:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    const activeSessions: string[] = [];
    for (const key of keys) {
      const session = await this.redis.get(key);
      if (session) {
        const sessionData = JSON.parse(session);
        if (Date.now() - sessionData.lastActivity < 3600000) {
          activeSessions.push(key);
        }
      }
    }
    return activeSessions;
  }

  async publishAgentMessage(channel: string, message: any) {
    if (!this.redis) await this.init();
    await this.redis.publish(channel, JSON.stringify(message));
  }

  async subscribeToAgentChannel(channel: string, callback: (message: any) => void) {
    if (!this.redis) await this.init();
    const subscriber = client.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message);
        callback(parsed);
      } catch (error) {
        console.error('Error parsing agent message:', error);
      }
    });
    return subscriber;
  }

  async addToTaskQueue(queueName: string, task: any, priority: number = 0) {
    if (!this.redis) await this.init();
    await this.redis.zAdd(`queue:${queueName}`, {
      score: priority,
      value: JSON.stringify(task)
    });
  }

  async getNextTask(queueName: string): Promise<any | null> {
    if (!this.redis) await this.init();
    const tasks = await this.redis.zPopMin(`queue:${queueName}`, 1);
    return tasks.length > 0 ? JSON.parse(tasks[0].value) : null;
  }

  async getQueueLength(queueName: string): Promise<number> {
    if (!this.redis) await this.init();
    return await this.redis.zCard(`queue:${queueName}`);
  }

  async incrementCounter(key: string, ttl?: number) {
    if (!this.redis) await this.init();
    const count = await this.redis.incr(key);
    if (ttl && count === 1) {
      await this.redis.expire(key, ttl);
    }
    return count;
  }

  async getCounter(key: string): Promise<number> {
    if (!this.redis) await this.init();
    const count = await this.redis.get(key);
    return count ? parseInt(count) : 0;
  }

  async recordLatency(operation: string, latency: number) {
    if (!this.redis) await this.init();
    const key = `latency:${operation}`;
    await this.redis.lPush(key, latency.toString());
    await this.redis.lTrim(key, 0, 99);
    await this.redis.expire(key, 3600);
  }

  async getAverageLatency(operation: string): Promise<number> {
    if (!this.redis) await this.init();
    const key = `latency:${operation}`;
    const latencies = await this.redis.lRange(key, 0, -1);
    if (latencies.length === 0) return 0;
    const sum = latencies.reduce((acc: number, val: string) => acc + parseFloat(val), 0);
    return sum / latencies.length;
  }
}

export async function updateDocumentStatus(documentId: string, status: string, stage?: string) {
  try {
    const redis = await getRedisClient();
    const statusData = {
      status,
      stage: stage || 'unknown',
      updatedAt: new Date().toISOString()
    };
    await redis.hSet(`document:${documentId}:status`, statusData);
    try {
      const { updateDocumentStatus: updateNeo4jStatus } = await import('./neo4j');
      await updateNeo4jStatus(documentId, status, stage || 'unknown');
    } catch (neo4jError) {
      console.warn('Could not update Neo4j document status:', neo4jError);
    }
  } catch (error) {
    console.error('Error updating document status in Redis:', error);
  }
}

export async function getDocumentStatus(documentId: string) {
  try {
    const redis = await getRedisClient();
    const statusData = await redis.hGetAll(`document:${documentId}:status`);
    return statusData;
  } catch (error) {
    console.error('Error getting document status from Redis:', error);
    return null;
  }
}

export async function deleteDocumentStatus(documentId: string) {
  try {
    const redis = await getRedisClient();
    await redis.del(`document:${documentId}:status`);
  } catch (error) {
    console.error('Error deleting document status from Redis:', error);
  }
}

export const pipeline = new DocumentPipeline();
