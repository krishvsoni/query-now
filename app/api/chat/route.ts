import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { pipeline } from '@/lib/redis';
import { generateEmbedding, generateStreamingResponse } from '@/lib/openai';
import { searchSimilar } from '@/lib/pinecone';
import { searchEntities, getEntityRelationships, getUserDocuments } from '@/lib/neo4j';
import { reasoningEngine } from '@/lib/reasoning-engine';
import { graphProcessor } from '@/lib/graph-processor';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(true);
    const { query, documentIds, conversationHistory = [], useAdvancedReasoning = true } = await request.json();

    // Track query usage
    const queryCount = await pipeline.trackUserQuery(user.id);
    console.log(`[Chat API] Query count for user ${user.id}: ${queryCount}/100`);
    if (queryCount > 100) {
      return NextResponse.json({ error: 'Daily query limit exceeded' }, { status: 429 });
    }

    // Get accessible documents
    const userDocs = await getUserDocuments(user.id);
    const availableDocIds = userDocs.map((doc: any) => doc.id);

    const filteredDocIds = documentIds 
      ? documentIds.filter((id: string) => availableDocIds.includes(id))
      : availableDocIds;

    if (filteredDocIds.length === 0) {
      return NextResponse.json({ error: 'No accessible documents found' }, { status: 404 });
    }

    const sessionId = `${user.id}_${Date.now()}`;
    
    // Use advanced reasoning engine if enabled
    if (useAdvancedReasoning) {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Emit thinking status at the start
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
              type: 'thinking',
              message: 'Analyzing your query...'
            })}\n\n`));
            
            const relevantEntityIds: string[] = [];
            let finalAnswer = '';
            let sources: any[] = [];
            
            // Stream reasoning process
            for await (const chunk of reasoningEngine.streamReasoning({
              userId: user.id,
              query,
              documentIds: filteredDocIds,
              conversationHistory
            })) {
              
              // Emit reasoning steps to client
              if (chunk.type === 'reasoning_step') {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'reasoning',
                  step: chunk.data
                })}\n\n`));
              }
              
              // Emit tool execution updates
              if (chunk.type === 'tool_execution') {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'tool',
                  tool: chunk.data
                })}\n\n`));
              }
              
              // Emit refinement progress
              if (chunk.type === 'refinement') {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'refinement',
                  data: chunk.data
                })}\n\n`));
              }
              
              // Final answer - stream it word by word
              if (chunk.type === 'final_answer') {
                finalAnswer = chunk.data.answer;
                const words = finalAnswer.split(' ');
                
                for (const word of words) {
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                    type: 'chunk',
                    content: word + ' '
                  })}\n\n`));
                  await new Promise(resolve => setTimeout(resolve, 30));
                }
                
                // Extract entity IDs from reasoning chain
                const reasoning = chunk.data.reasoning;
                reasoning.steps.forEach((step: any) => {
                  if (step.metadata?.entities) {
                    relevantEntityIds.push(...step.metadata.entities.map((e: any) => e.id));
                  }
                });
                
                // Extract sources from tool results
                const toolResults = chunk.data.toolResults || [];
                toolResults.forEach((result: any) => {
                  if (result.tool === 'vector_search' && Array.isArray(result.data)) {
                    result.data.slice(0, 5).forEach((item: any) => {
                      if (item.metadata?.content) {
                        sources.push({
                          type: 'vector',
                          fileName: item.metadata.fileName || 'Unknown',
                          content: item.metadata.content.slice(0, 200) + '...',
                          score: item.score
                        });
                      }
                    });
                  } else if (result.tool === 'entity_search' && Array.isArray(result.data)) {
                    result.data.slice(0, 5).forEach((item: any) => {
                      if (item.entity) {
                        sources.push({
                          type: 'graph',
                          fileName: item.fileName || 'Knowledge Graph',
                          entity: item.entity.name,
                          entityType: item.entity.type
                        });
                      }
                    });
                  }
                });
                
                // Emit sources
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'sources',
                  sources
                })}\n\n`));
              }
            }
            
            // Generate query-specific knowledge graph
            if (relevantEntityIds.length > 0) {
              try {
                const queryKnowledgeGraph = await graphProcessor.buildQueryKnowledgeGraph(
                  user.id,
                  query,
                  relevantEntityIds.slice(0, 10)
                );
                
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'knowledge_graph',
                  graph: queryKnowledgeGraph
                })}\n\n`));
                
                await pipeline.bufferStreamMessage(sessionId, {
                  type: 'knowledge_graph',
                  graph: queryKnowledgeGraph,
                  timestamp: Date.now()
                });
              } catch (error) {
                console.error('Error generating knowledge graph:', error);
              }
            }
            
            // Send metadata
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
              type: 'metadata',
              sessionId,
              timestamp: Date.now()
            })}\n\n`));
            
            controller.close();
          } catch (error) {
            console.error('Streaming error:', error);
            controller.error(error);
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    // Fallback to simple mode (legacy)
    console.log('[Chat API] Using simple mode (legacy)');
    const queryEmbedding = await generateEmbedding(query);

    const cacheKey = `query:${user.id}:${Buffer.from(query).toString('base64').slice(0, 50)}`;
    const cachedEmbedding = await pipeline.getCachedEmbedding(cacheKey);
    const embedding = cachedEmbedding || queryEmbedding;

    if (!cachedEmbedding) {
      console.log('[Chat API] Embedding not cached, storing in Redis...');
      await pipeline.cacheEmbedding(cacheKey, queryEmbedding, 3600);
    } else {
      console.log('[Chat API] Using cached embedding from Redis');
    }

    const [vectorResults, graphResults] = await Promise.all([
      searchSimilar(embedding, user.id, 5, filteredDocIds),
      searchEntities(user.id, query, filteredDocIds)
    ]);

    const context: string[] = [];
    const relevantEntityIds: string[] = [];

    vectorResults.forEach((result) => {
      if (result.score && result.score > 0.15) {
        context.push(`[${result.metadata?.fileName}]: ${result.metadata?.content}`);
      }
    });

    graphResults.forEach(result => {
      context.push(`[${result.fileName}] Entity: ${result.entity.name} (${result.entity.type}): ${result.entity.description}`);
      relevantEntityIds.push(result.entity.id);
    });

    if (relevantEntityIds.length > 0) {
      for (const entityId of relevantEntityIds.slice(0, 3)) {
        try {
          const relationships = await getEntityRelationships(entityId, 1);
          relationships.forEach(rel => {
            context.push(`Relationship: ${rel.source.name} → ${rel.relationships[0]?.type} → ${rel.target.name}`);
          });
        } catch (error) {
        }
      }
    }

    if (context.length === 0) {
      return NextResponse.json({
        response: "I couldn't find relevant information in your documents to answer this question.",
        sources: []
      });
    }

    const responseStream = await generateStreamingResponse(query, context, conversationHistory);
    let responseText = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              responseText += content;
              await pipeline.bufferStreamMessage(sessionId, {
                type: 'chunk',
                content,
                timestamp: Date.now()
              });
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                type: 'chunk',
                content
              })}\n\n`));
            }
          }

          const sources = [
            ...vectorResults.map(r => ({
              type: 'vector',
              fileName: r.metadata?.fileName,
              content: typeof r.metadata?.content === 'string' ? r.metadata.content.slice(0, 200) + '...' : '',
              score: r.score
            })),
            ...graphResults.map(r => ({
              type: 'graph',
              fileName: r.fileName,
              entity: r.entity.name,
              entityType: r.entity.type
            }))
          ];

          await pipeline.bufferStreamMessage(sessionId, {
            type: 'sources',
            sources,
            timestamp: Date.now()
          });

          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
            type: 'sources',
            sources
          })}\n\n`));

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to process query' }, { status: 500 });
  }
}
