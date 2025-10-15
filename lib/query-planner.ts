import { generateEmbedding } from './openai';
import { searchSimilar } from './pinecone';
import { searchEntities, getEntityRelationships, executeCypherQuery, findPathBetweenEntities } from './neo4j';
import { pipeline } from './redis';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

export type ToolType = 
  | 'vector_search' 
  | 'graph_traversal' 
  | 'cypher_query'
  | 'entity_search'
  | 'relationship_path'
  | 'semantic_similarity'
  | 'hybrid_search';

export interface QueryPlan {
  steps: QueryStep[];
  reasoning: string;
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedTime: number;
}

export interface QueryStep {
  id: string;
  tool: ToolType;
  description: string;
  parameters: Record<string, any>;
  dependencies?: string[];
  priority: number;
}

export interface ToolResult {
  stepId: string;
  tool: ToolType;
  data: any;
  confidence: number;
  executionTime: number;
}

export interface QueryContext {
  userId: string;
  query: string;
  documentIds?: string[];
  conversationHistory?: any[];
  constraints?: {
    maxResults?: number;
    timeout?: number;
    requiresGraph?: boolean;
    requiresVector?: boolean;
  };
}

export class QueryPlanner {
  async planQuery(context: QueryContext): Promise<QueryPlan> {
    const { query, userId } = context;
    const analysis = await this.analyzeQueryIntent(query, context);
    const steps = await this.selectTools(analysis, context);
    const plan: QueryPlan = {
      steps,
      reasoning: analysis.reasoning,
      complexity: this.determineComplexity(steps),
      estimatedTime: this.estimateExecutionTime(steps)
    };
    return plan;
  }
  private async analyzeQueryIntent(query: string, context: QueryContext): Promise<any> {
    const cacheKey = `query-intent:${Buffer.from(query).toString('base64').slice(0, 50)}`;
    const cached = await pipeline.getCachedSearchResults(cacheKey);
    if (cached) {
      return cached;
    }
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a query analysis expert. Analyze the user's query and determine:
          1. Query type: factual, relational, exploratory, analytical, comparative
          2. Required capabilities: semantic search, graph traversal, entity lookup, relationship finding
          3. Complexity level: simple, moderate, complex
          4. Key entities or concepts to search for
          5. Whether it needs multi-hop reasoning
          
          Return JSON with this structure:
          {
            "queryType": "factual|relational|exploratory|analytical|comparative",
            "capabilities": ["semantic_search", "graph_traversal", "entity_lookup", "relationship_finding"],
            "complexity": "simple|moderate|complex",
            "keyEntities": ["entity1", "entity2"],
            "needsMultiHop": true|false,
            "reasoning": "explanation of the analysis",
            "suggestedApproach": "description of best approach"
          }`
        },
        {
          role: 'user',
          content: query
        }
      ],
      response_format: { type: 'json_object' }
    });
    const analysis = JSON.parse(response.choices[0].message.content || '{}');
    await pipeline.cacheSearchResults(cacheKey, analysis, 3600);
    return analysis;
  }
  private async selectTools(analysis: any, context: QueryContext): Promise<QueryStep[]> {
    const steps: QueryStep[] = [];
    const capabilities = analysis.capabilities || [];
    let stepId = 0;
    if (capabilities.includes('semantic_search') || analysis.queryType === 'factual') {
      steps.push({
        id: `step-${++stepId}`,
        tool: 'vector_search',
        description: 'Perform semantic vector search for relevant content',
        parameters: {
          query: context.query,
          topK: 10,
          userId: context.userId,
          documentIds: context.documentIds
        },
        priority: 1
      });
    }
    if (capabilities.includes('entity_lookup') || analysis.keyEntities?.length > 0) {
      steps.push({
        id: `step-${++stepId}`,
        tool: 'entity_search',
        description: 'Search for relevant entities in knowledge graph',
        parameters: {
          query: context.query,
          entities: analysis.keyEntities || [],
          userId: context.userId,
          documentIds: context.documentIds
        },
        priority: 2
      });
    }
    if (capabilities.includes('graph_traversal') || analysis.queryType === 'relational') {
      steps.push({
        id: `step-${++stepId}`,
        tool: 'graph_traversal',
        description: 'Traverse knowledge graph to find relationships',
        parameters: {
          startEntities: analysis.keyEntities || [],
          depth: analysis.needsMultiHop ? 3 : 2,
          userId: context.userId
        },
        dependencies: [`step-${stepId - 1}`],
        priority: 3
      });
    }
    if (capabilities.includes('relationship_finding') && analysis.keyEntities?.length >= 2) {
      steps.push({
        id: `step-${++stepId}`,
        tool: 'relationship_path',
        description: 'Find paths between entities',
        parameters: {
          entity1: analysis.keyEntities[0],
          entity2: analysis.keyEntities[1],
          maxDepth: 4,
          userId: context.userId
        },
        priority: 2
      });
    }
    if (analysis.complexity === 'complex' || analysis.queryType === 'analytical') {
      steps.push({
        id: `step-${++stepId}`,
        tool: 'cypher_query',
        description: 'Generate and execute custom Cypher query',
        parameters: {
          query: context.query,
          intent: analysis.reasoning,
          userId: context.userId
        },
        dependencies: steps.map(s => s.id),
        priority: 4
      });
    }
    return steps.sort((a, b) => a.priority - b.priority);
  }
  async executePlan(plan: QueryPlan, context: QueryContext): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    const completedSteps = new Map<string, ToolResult>();
    for (const step of plan.steps) {
      if (step.dependencies) {
        const allDepsCompleted = step.dependencies.every(dep => completedSteps.has(dep));
        if (!allDepsCompleted) {
          continue;
        }
      }
      const startTime = Date.now();
      try {
        const result = await this.executeTool(step, context, completedSteps);
        const executionTime = Date.now() - startTime;
        const toolResult: ToolResult = {
          stepId: step.id,
          tool: step.tool,
          data: result,
          confidence: this.calculateConfidence(result, step.tool),
          executionTime
        };
        results.push(toolResult);
        completedSteps.set(step.id, toolResult);
        await pipeline.recordLatency(step.tool, executionTime);
      } catch (error) {
      }
    }
    return results;
  }
  private async executeTool(
    step: QueryStep,
    context: QueryContext,
    previousResults: Map<string, ToolResult>
  ): Promise<any> {
    const { tool, parameters } = step;
    switch (tool) {
      case 'vector_search':
        return await this.executeVectorSearch(parameters);
      case 'entity_search':
        return await this.executeEntitySearch(parameters);
      case 'graph_traversal':
        return await this.executeGraphTraversal(parameters, previousResults);
      case 'relationship_path':
        return await this.executeRelationshipPath(parameters);
      case 'cypher_query':
        return await this.executeCypherQuery(parameters, context);
      case 'semantic_similarity':
        return await this.executeSemanticSimilarity(parameters);
      case 'hybrid_search':
        return await this.executeHybridSearch(parameters);
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }
  private async executeVectorSearch(params: any): Promise<any> {
    const embedding = await generateEmbedding(params.query);
    return await searchSimilar(
      embedding,
      params.userId,
      params.topK || 10,
      params.documentIds
    );
  }
  private async executeEntitySearch(params: any): Promise<any> {
    return await searchEntities(
      params.userId,
      params.query,
      params.documentIds
    );
  }
  private async executeGraphTraversal(params: any, previousResults: Map<string, ToolResult>): Promise<any> {
    let entityIds = params.startEntities || [];
    if (entityIds.length === 0) {
      for (const result of previousResults.values()) {
        if (result.tool === 'entity_search' && result.data) {
          entityIds = result.data.slice(0, 5).map((e: any) => e.entity.id);
          break;
        }
      }
    }
    if (entityIds.length === 0) {
      return [];
    }
    const allRelationships = [];
    for (const entityId of entityIds) {
      const relationships = await getEntityRelationships(entityId, params.depth || 2);
      allRelationships.push(...relationships);
    }
    return allRelationships;
  }
  private async executeRelationshipPath(params: any): Promise<any> {
    return await findPathBetweenEntities(
      params.userId,
      params.entity1,
      params.entity2,
      params.maxDepth || 4
    );
  }
  private async executeCypherQuery(params: any, context: QueryContext): Promise<any> {
    const cypherQuery = await this.generateCypherQuery(params.query, params.intent);
    return await executeCypherQuery(cypherQuery, { userId: context.userId });
  }
  private async executeSemanticSimilarity(params: any): Promise<any> {
    const embedding1 = await generateEmbedding(params.text1);
    const embedding2 = await generateEmbedding(params.text2);
    return {
      similarity: this.cosineSimilarity(embedding1, embedding2)
    };
  }
  private async executeHybridSearch(params: any): Promise<any> {
    const [vectorResults, graphResults] = await Promise.all([
      this.executeVectorSearch(params),
      this.executeEntitySearch(params)
    ]);
    return {
      vector: vectorResults,
      graph: graphResults
    };
  }
  private async generateCypherQuery(naturalLanguageQuery: string, intent: string): Promise<string> {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Cypher query expert. Convert natural language queries to Cypher.
          
          Schema:
          - Nodes: User, Document, Entity
          - Relationships: OWNS (User->Document), CONTAINS (Document->Entity), various entity relationships
          
          Entity properties: id, name, type, description, properties
          Document properties: id, fileName, status, createdAt
          
          Return only the Cypher query, no explanation.`
        },
        {
          role: 'user',
          content: `Query: ${naturalLanguageQuery}\nIntent: ${intent}\n\nGenerate Cypher query:`
        }
      ]
    });
    return response.choices[0].message.content?.trim() || '';
  }
  private calculateConfidence(result: any, tool: ToolType): number {
    if (!result) return 0;
    switch (tool) {
      case 'vector_search':
        if (Array.isArray(result) && result.length > 0) {
          const avgScore = result.reduce((sum, r) => sum + (r.score || 0), 0) / result.length;
          return avgScore;
        }
        return 0;
      case 'entity_search':
        if (Array.isArray(result) && result.length > 0) {
          const baseConfidence = 0.7;
          const bonusConfidence = Math.min(result.length / 10, 0.2);
          return baseConfidence + bonusConfidence;
        }
        return 0;
      case 'graph_traversal':
      case 'relationship_path':
        if (Array.isArray(result) && result.length > 0) {
          return 0.8;
        }
        return 0;
      default:
        return 0.5;
    }
  }
  private determineComplexity(steps: QueryStep[]): 'simple' | 'moderate' | 'complex' {
    if (steps.length <= 2) return 'simple';
    if (steps.length <= 4) return 'moderate';
    return 'complex';
  }
  private estimateExecutionTime(steps: QueryStep[]): number {
    const timeEstimates: Record<ToolType, number> = {
      vector_search: 500,
      entity_search: 300,
      graph_traversal: 800,
      relationship_path: 1000,
      cypher_query: 1200,
      semantic_similarity: 400,
      hybrid_search: 1000
    };
    return steps.reduce((total, step) => {
      return total + (timeEstimates[step.tool] || 500);
    }, 0);
  }
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const queryPlanner = new QueryPlanner();
