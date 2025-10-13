import { generateEmbedding } from './openai';
import { searchSimilar } from './pinecone';
import { searchEntities, getEntityRelationships } from './neo4j';
import { pipeline } from './redis';

export interface RetrievalResult {
  content: string;
  source: {
    type: 'vector' | 'graph' | 'hybrid';
    documentId: string;
    fileName: string;
    chunkIndex?: number;
    entities?: any[];
    relationships?: any[];
  };
  relevanceScore: number;
  metadata?: any;
}

export interface RetrievalOptions {
  userId: string;
  topK?: number;
  documentIds?: string[];
  includeEntities?: boolean;
  includeRelationships?: boolean;
  hybridWeight?: number;
}

export class IntelligentRetrieval {
  async search(query: string, options: RetrievalOptions): Promise<RetrievalResult[]> {
    const { userId, topK = 5, documentIds, includeEntities = true, includeRelationships = true } = options;
    try {
      const cacheKey = `search:${userId}:${Buffer.from(query).toString('base64')}`;
      const cached = await pipeline.getCachedSearchResults(cacheKey);
      if (cached) {
        console.log('Returning cached search results');
        return cached as RetrievalResult[];
      }
      const searchStrategy = this.analyzeQuery(query);
      console.log(`Using search strategy: ${searchStrategy}`);
      let results: RetrievalResult[] = [];
      switch (searchStrategy) {
        case 'semantic':
          results = await this.semanticSearch(query, options);
          break;
        case 'graph':
          results = await this.graphSearch(query, options);
          break;
        case 'hybrid':
          results = await this.hybridSearch(query, options);
          break;
        default:
          results = await this.hybridSearch(query, options);
      }
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      const topResults = results.slice(0, topK);
      await pipeline.cacheSearchResults(cacheKey, topResults, 1800);
      return topResults;
    } catch (error) {
      console.error('Error in intelligent retrieval:', error);
      throw error;
    }
  }

  private analyzeQuery(query: string): 'semantic' | 'graph' | 'hybrid' {
    const lowerQuery = query.toLowerCase();
    const graphKeywords = [
      'related to',
      'connected to',
      'relationship',
      'link',
      'associated with',
      'how is',
      'connected',
      'network',
      'relationship between',
      'relates to'
    ];
    const semanticKeywords = [
      'similar to',
      'like',
      'about',
      'describe',
      'explain',
      'what is',
      'definition',
      'meaning',
      'summary',
      'overview'
    ];
    const hasGraphKeywords = graphKeywords.some(keyword => lowerQuery.includes(keyword));
    const hasSemanticKeywords = semanticKeywords.some(keyword => lowerQuery.includes(keyword));
    if (hasGraphKeywords && !hasSemanticKeywords) {
      return 'graph';
    } else if (hasSemanticKeywords && !hasGraphKeywords) {
      return 'semantic';
    } else {
      return 'hybrid';
    }
  }

  private async semanticSearch(query: string, options: RetrievalOptions): Promise<RetrievalResult[]> {
    const { userId, topK = 5, documentIds } = options;
    const queryEmbedding = await generateEmbedding(query);
    const vectorResults = await searchSimilar(queryEmbedding, userId, topK * 2, documentIds);
    return vectorResults.map(result => ({
      content: String(result.metadata?.content || ''),
      source: {
        type: 'vector' as const,
        documentId: String(result.metadata?.documentId || ''),
        fileName: String(result.metadata?.fileName || ''),
        chunkIndex:
          typeof result.metadata?.chunkIndex === 'number'
            ? result.metadata.chunkIndex
            : typeof result.metadata?.chunkIndex === 'string'
            ? parseInt(result.metadata.chunkIndex)
            : undefined
      },
      relevanceScore: result.score || 0,
      metadata: result.metadata
    }));
  }

  private async graphSearch(query: string, options: RetrievalOptions): Promise<RetrievalResult[]> {
    const { userId, topK = 5, documentIds } = options;
    const entityResults = await searchEntities(userId, query, documentIds);
    const results: RetrievalResult[] = [];
    for (const entityResult of entityResults.slice(0, topK)) {
      const relationships = await getEntityRelationships(entityResult.entity.id, 2);
      const content = this.formatEntityContent(entityResult.entity, relationships);
      results.push({
        content,
        source: {
          type: 'graph' as const,
          documentId: entityResult.documentId,
          fileName: entityResult.fileName,
          entities: [entityResult.entity],
          relationships: relationships
        },
        relevanceScore: this.calculateGraphRelevance(query, entityResult.entity),
        metadata: {
          entityType: entityResult.entity.type,
          entityName: entityResult.entity.name
        }
      });
    }
    return results;
  }

  private async hybridSearch(query: string, options: RetrievalOptions): Promise<RetrievalResult[]> {
    const { hybridWeight = 0.5 } = options;
    const [semanticResults, graphResults] = await Promise.all([
      this.semanticSearch(query, { ...options, topK: options.topK || 5 }),
      this.graphSearch(query, { ...options, topK: options.topK || 5 })
    ]);
    const combinedResults: RetrievalResult[] = [
      ...semanticResults.map(r => ({
        ...r,
        relevanceScore: r.relevanceScore * hybridWeight
      })),
      ...graphResults.map(r => ({
        ...r,
        relevanceScore: r.relevanceScore * (1 - hybridWeight)
      }))
    ];
    return this.deduplicateResults(combinedResults);
  }

  private formatEntityContent(entity: any, relationships: any[]): string {
    let content = `Entity: ${entity.name} (${entity.type})\n`;
    if (entity.description) {
      content += `Description: ${entity.description}\n`;
    }
    if (relationships.length > 0) {
      content += '\nRelationships:\n';
      relationships.forEach(rel => {
        content += `- ${rel.source.name} → ${rel.target.name} (${rel.relationships[0]?.type || 'RELATED'})\n`;
      });
    }
    return content;
  }

  private calculateGraphRelevance(query: string, entity: any): number {
    const queryLower = query.toLowerCase();
    const entityName = entity.name.toLowerCase();
    const entityDesc = (entity.description || '').toLowerCase();
    let score = 0;
    if (entityName.includes(queryLower)) {
      score += 0.8;
    }
    if (entityDesc.includes(queryLower)) {
      score += 0.6;
    }
    const queryWords = queryLower.split(' ');
    const nameWords = entityName.split(' ');
    const descWords = entityDesc.split(' ');
    queryWords.forEach(qWord => {
      if (nameWords.includes(qWord)) score += 0.2;
      if (descWords.includes(qWord)) score += 0.1;
    });
    return Math.min(score, 1.0);
  }

  private deduplicateResults(results: RetrievalResult[]): RetrievalResult[] {
    const seen = new Set<string>();
    const deduplicated: RetrievalResult[] = [];
    for (const result of results) {
      const contentHash = this.simpleHash(result.content.substring(0, 100));
      if (!seen.has(contentHash)) {
        seen.add(contentHash);
        deduplicated.push(result);
      }
    }
    return deduplicated;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  async getDocumentContext(documentId: string, userId: string): Promise<{
    metadata: any;
    entities: any[];
    chunkCount: number;
  }> {
    try {
      return {
        metadata: {},
        entities: [],
        chunkCount: 0
      };
    } catch (error) {
      console.error('Error getting document context:', error);
      throw error;
    }
  }
}

export const intelligentRetrieval = new IntelligentRetrieval();
