import { QueryPlanner, QueryContext, ToolResult } from './query-planner';
import { pipeline } from './redis';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

export interface ReasoningStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'conclusion';
  content: string;
  timestamp: number;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface ReasoningChain {
  query: string;
  steps: ReasoningStep[];
  finalAnswer: string;
  confidence: number;
  metadata: {
    totalSteps: number;
    executionTime: number;
    toolsUsed: string[];
    iterationCount: number;
  };
}

export interface StreamChunk {
  type: 'reasoning_step' | 'tool_execution' | 'refinement' | 'final_answer';
  data: any;
  timestamp: number;
}

export class ReasoningEngine {
  private queryPlanner: QueryPlanner;
  private maxIterations = 3;
  
  constructor() {
    this.queryPlanner = new QueryPlanner();
  }
  
  async *streamReasoning(
    context: QueryContext,
    onProgress?: (chunk: StreamChunk) => void
  ): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    const steps: ReasoningStep[] = [];
    let iterationCount = 0;
    const toolsUsed = new Set<string>();
    
    yield* this.emitReasoningStep({
      id: `step-${steps.length + 1}`,
      type: 'thought',
      content: `Analyzing your question and identifying key concepts...`,
      timestamp: Date.now()
    }, steps, onProgress);
    
    const plan = await this.queryPlanner.planQuery(context);
    
    yield* this.emitReasoningStep({
      id: `step-${steps.length + 1}`,
      type: 'thought',
      content: `Created ${plan.steps.length}-step search strategy for optimal results`,
      timestamp: Date.now(),
      metadata: { plan }
    }, steps, onProgress);
    
    yield* this.emitReasoningStep({
      id: `step-${steps.length + 1}`,
      type: 'action',
      content: `Executing multi-source search across your documents...`,
      timestamp: Date.now()
    }, steps, onProgress);
    
    const toolResults = await this.queryPlanner.executePlan(plan, context);
    
    for (const result of toolResults) {
      toolsUsed.add(result.tool);
      
      yield {
        type: 'tool_execution',
        data: {
          tool: result.tool,
          confidence: result.confidence,
          executionTime: result.executionTime,
          resultCount: Array.isArray(result.data) ? result.data.length : 1
        },
        timestamp: Date.now()
      };
      
      yield* this.emitReasoningStep({
        id: `step-${steps.length + 1}`,
        type: 'observation',
        content: `Retrieved ${Array.isArray(result.data) ? result.data.length : 1} ${Array.isArray(result.data) && result.data.length === 1 ? 'result' : 'results'} with ${Math.round(result.confidence * 100)}% confidence`,
        timestamp: Date.now(),
        confidence: result.confidence
      }, steps, onProgress);
    }
    
    yield* this.emitReasoningStep({
      id: `step-${steps.length + 1}`,
      type: 'thought',
      content: `Synthesizing information from ${toolResults.length} sources to create comprehensive answer...`,
      timestamp: Date.now()
    }, steps, onProgress);
    
    let currentAnswer = await this.synthesizeAnswer(context.query, toolResults, context);
    let currentConfidence = this.calculateOverallConfidence(toolResults);
    
    while (iterationCount < this.maxIterations && currentConfidence < 0.85) {
      iterationCount++;
      
      yield* this.emitReasoningStep({
        id: `step-${steps.length + 1}`,
        type: 'thought',
        content: `Quality check: ${Math.round(currentConfidence * 100)}% confidence - enhancing answer depth...`,
        timestamp: Date.now(),
        confidence: currentConfidence
      }, steps, onProgress);
      
      const refinementNeeded = await this.identifyRefinementNeeds(
        context.query,
        currentAnswer,
        toolResults
      );
      
      if (refinementNeeded.needsRefinement) {
        yield* this.emitReasoningStep({
          id: `step-${steps.length + 1}`,
          type: 'thought',
          content: `Exploring additional context...`,
          timestamp: Date.now()
        }, steps, onProgress);
        
        if (refinementNeeded.additionalQuery) {
          yield* this.emitReasoningStep({
            id: `step-${steps.length + 1}`,
            type: 'action',
            content: `Deep diving for more details...`,
            timestamp: Date.now()
          }, steps, onProgress);
          
          const refinedContext = {
            ...context,
            query: refinementNeeded.additionalQuery
          };
          
          const refinedPlan = await this.queryPlanner.planQuery(refinedContext);
          const refinedResults = await this.queryPlanner.executePlan(refinedPlan, refinedContext);
          
          toolResults.push(...refinedResults);
          
          yield {
            type: 'refinement',
            data: {
              iteration: iterationCount,
              additionalResults: refinedResults.length
            },
            timestamp: Date.now()
          };
        }
        
        currentAnswer = await this.synthesizeAnswer(context.query, toolResults, context);
        currentConfidence = this.calculateOverallConfidence(toolResults);
      } else {
        break;
      }
    }
    
    yield* this.emitReasoningStep({
      id: `step-${steps.length + 1}`,
      type: 'conclusion',
      content: `Finalizing comprehensive response with ${Math.round(currentConfidence * 100)}% confidence...`,
      timestamp: Date.now(),
      confidence: currentConfidence
    }, steps, onProgress);
    
    const reasoningChain: ReasoningChain = {
      query: context.query,
      steps,
      finalAnswer: currentAnswer,
      confidence: currentConfidence,
      metadata: {
        totalSteps: steps.length,
        executionTime: Date.now() - startTime,
        toolsUsed: Array.from(toolsUsed),
        iterationCount
      }
    };
    
    await this.cacheReasoningChain(context.userId, context.query, reasoningChain);
    
    yield {
      type: 'final_answer',
      data: {
        answer: currentAnswer,
        confidence: currentConfidence,
        reasoning: reasoningChain,
        toolResults
      },
      timestamp: Date.now()
    };
  }
  
  private async *emitReasoningStep(
    step: ReasoningStep,
    steps: ReasoningStep[],
    onProgress?: (chunk: StreamChunk) => void
  ): AsyncGenerator<StreamChunk> {
    steps.push(step);
    
    const chunk: StreamChunk = {
      type: 'reasoning_step',
      data: step,
      timestamp: Date.now()
    };
    
    if (onProgress) {
      onProgress(chunk);
    }
    
    yield chunk;
  }
  
  private async synthesizeAnswer(
    query: string,
    toolResults: ToolResult[],
    context: QueryContext
  ): Promise<string> {
    const contextParts: string[] = [];
    
    for (const result of toolResults) {
      if (result.tool === 'vector_search' && Array.isArray(result.data)) {
        result.data.slice(0, 5).forEach((item: any) => {
          if (item.metadata?.content) {
            contextParts.push(`[Vector Search] ${item.metadata.content}`);
          }
        });
      } else if (result.tool === 'entity_search' && Array.isArray(result.data)) {
        result.data.slice(0, 5).forEach((item: any) => {
          if (item.entity) {
            contextParts.push(
              `[Entity] ${item.entity.name} (${item.entity.type}): ${item.entity.description || 'No description'}`
            );
          }
        });
      } else if (result.tool === 'graph_traversal' && Array.isArray(result.data)) {
        result.data.slice(0, 5).forEach((item: any) => {
          if (item.source && item.target) {
            contextParts.push(
              `[Relationship] ${item.source.name} → ${item.relationships[0]?.type || 'RELATED_TO'} → ${item.target.name}`
            );
          }
        });
      } else if (result.tool === 'relationship_path' && Array.isArray(result.data)) {
        result.data.slice(0, 3).forEach((path: any) => {
          contextParts.push(
            `[Path] ${path.nodes.map((n: any) => n.name || n.id).join(' → ')} (${path.length} hops)`
          );
        });
      }
    }
    
    if (contextParts.length === 0) {
      return "I couldn't find relevant information to answer your question based on your documents.";
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a highly knowledgeable AI assistant with expertise in comprehensive analysis and explanation.
          
          CRITICAL INSTRUCTIONS:
          1. Provide DETAILED, COMPREHENSIVE answers that thoroughly explore the topic
          2. Include specific examples, evidence, and data from the provided context
          3. Structure your response with clear sections using headings
          4. Explain concepts in depth, don't just list facts
          5. Make connections between different pieces of information
          6. Provide context, implications, and insights
          7. Aim for responses that are 300-600 words minimum for complex queries
          8. Use professional, clear language while being thorough
          
          FORMATTING GUIDELINES:
          - Use **bold** for key terms and important concepts
          - Use *italics* for subtle emphasis
          - Use \`code\` for technical terms, file names, or code snippets
          - Use code blocks with \`\`\` for multi-line code
          - Use ## for main section headings
          - Use ### for subsection headings
          - Use bullet points (-) or numbered lists (1.) for clarity
          - Use > for important quotes or highlighted notes
          - Use tables for comparing data or showing structured information
          - Use [links](url) when referencing sources
          
          STRUCTURE YOUR RESPONSE:
          1. **Overview**: Start with a clear summary
          2. **Detailed Analysis**: Provide in-depth information organized by subtopics
          3. **Key Insights**: Highlight important takeaways
          4. **Context & Connections**: Show relationships between concepts
          5. **Practical Implications**: Explain why this matters
          6. **Conclusion**: Synthesize the information
          
          If the context doesn't contain enough information, acknowledge this clearly but still provide 
          what information you can, along with what's missing.`
        },
        {
          role: 'user',
          content: `Context:
${contextParts.join('\n\n')}

Question: ${query}

Provide a comprehensive, detailed answer with proper formatting:`
        }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });
    
    return response.choices[0].message.content || 'Unable to generate answer.';
  }
  
  private async identifyRefinementNeeds(
    query: string,
    currentAnswer: string,
    toolResults: ToolResult[]
  ): Promise<{
    needsRefinement: boolean;
    reason?: string;
    additionalQuery?: string;
  }> {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a critical evaluator. Determine if the current answer needs refinement.
          
          Return JSON:
          {
            "needsRefinement": true|false,
            "reason": "explanation if refinement needed",
            "additionalQuery": "specific follow-up query to gather missing information"
          }`
        },
        {
          role: 'user',
          content: `Original Query: ${query}\n\nCurrent Answer: ${currentAnswer}\n\nTool Results: ${toolResults.length} results with average confidence ${(this.calculateOverallConfidence(toolResults) * 100).toFixed(0)}%\n\nEvaluate:`
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300
    });
    
    const evaluation = JSON.parse(response.choices[0].message.content || '{"needsRefinement":false}');
    return evaluation;
  }
  
  private calculateOverallConfidence(toolResults: ToolResult[]): number {
    if (toolResults.length === 0) return 0;
    
    const totalConfidence = toolResults.reduce((sum, result) => sum + result.confidence, 0);
    return totalConfidence / toolResults.length;
  }
  
  private async cacheReasoningChain(
    userId: string,
    query: string,
    chain: ReasoningChain
  ): Promise<void> {
    const cacheKey = `reasoning:${userId}:${Buffer.from(query).toString('base64').slice(0, 50)}`;
    console.log(`[Reasoning Engine] Caching reasoning chain for query: "${query.substring(0, 50)}..."`);
    await pipeline.cacheGraphData(userId, cacheKey, chain, 3600);
  }
  
  async getCachedReasoning(userId: string, query: string): Promise<ReasoningChain | null> {
    const cacheKey = `reasoning:${userId}:${Buffer.from(query).toString('base64').slice(0, 50)}`;
    console.log(`[Reasoning Engine] Checking cache for query: "${query.substring(0, 50)}..."`);
    const cached = await pipeline.getCachedGraphData(userId, cacheKey);
    if (cached) {
      console.log(`[Reasoning Engine] Cache hit: Using cached reasoning chain (${cached.metadata?.totalSteps} steps)`);
    } else {
      console.log(`[Reasoning Engine] Cache miss: Computing new reasoning chain`);
    }
    return cached;
  }
  
  async reason(context: QueryContext): Promise<ReasoningChain> {
    const chunks: StreamChunk[] = [];
    
    for await (const chunk of this.streamReasoning(context)) {
      chunks.push(chunk);
    }
    
    const finalChunk = chunks.find(c => c.type === 'final_answer');
    if (finalChunk && finalChunk.data.reasoning) {
      return finalChunk.data.reasoning;
    }
    
    throw new Error('Reasoning failed to produce a final answer');
  }

  async extractGraphFromResponse(
    query: string,
    response: string,
    toolResults: ToolResult[]
  ): Promise<{ nodes: any[]; edges: any[] } | null> {
    try {
      console.log('[Response Graph Extractor] Analyzing response for graph data...');
      
      const graphPrompt = `Analyze this query and response to extract a knowledge graph.

Query: ${query}

Response: ${response}

Extract entities (nodes) and relationships (edges) from the response.
Focus on:
- Concrete entities mentioned (systems, models, metrics, chunk sizes, scores)
- Numerical values and their associations
- Comparison relationships
- Performance metrics

Return a JSON object with this structure:
{
  "nodes": [
    {
      "id": "unique_id",
      "label": "Display Name",
      "type": "CONCEPT|METRIC|VALUE|SYSTEM",
      "properties": { "key": "value" }
    }
  ],
  "edges": [
    {
      "source": "node_id",
      "target": "node_id", 
      "label": "HAS_SCORE|COMPARES_TO|HAS_METRIC|PERFORMS_AT",
      "properties": { "value": "optional" }
    }
  ]
}

IMPORTANT:
- Create nodes for each distinct concept, metric, or value mentioned
- Create edges showing relationships and comparisons
- Include numerical values as properties
- Use clear, descriptive labels
- If no clear graph structure exists, return {"nodes": [], "edges": []}`;

      const result = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: graphPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const graphData = JSON.parse(result.choices[0].message.content || '{"nodes":[],"edges":[]}');
      
      if (graphData.nodes && graphData.nodes.length > 0) {
        console.log(`[Response Graph Extractor] Success: Extracted ${graphData.nodes.length} nodes, ${graphData.edges?.length || 0} edges`);
        return graphData;
      }
      
      console.log('[Response Graph Extractor] No graph structure found in response');
      return null;
      
    } catch (error) {
      console.error('[Response Graph Extractor] Error:', error);
      return null;
    }
  }
}

export const reasoningEngine = new ReasoningEngine();
