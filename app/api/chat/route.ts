import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { pipeline } from '@/lib/redis';
import { generateEmbedding, generateStreamingResponse } from '@/lib/openai';
import { searchSimilar } from '@/lib/pinecone';
import { searchEntities, getEntityRelationships, getUserDocuments } from '@/lib/neo4j';
import { reasoningEngine } from '@/lib/reasoning-engine';
import { graphProcessor } from '@/lib/graph-processor';
import { saveChatMessage } from '@/lib/appwrite';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(true);
    const { query, documentIds, conversationHistory = [], useAdvancedReasoning = true } = await request.json();

    const queryCount = await pipeline.trackUserQuery(user.id);
    if (queryCount > 100) {
      return NextResponse.json({ error: 'Daily query limit exceeded' }, { status: 429 });
    }

    const userDocs = await getUserDocuments(user.id);
    const availableDocIds = userDocs.map((doc: any) => doc.id);

    const filteredDocIds = documentIds 
      ? documentIds.filter((id: string) => availableDocIds.includes(id))
      : availableDocIds;

    if (filteredDocIds.length === 0) {
      return NextResponse.json({ error: 'No accessible documents found' }, { status: 404 });
    }

    const sessionId = `${user.id}_${Date.now()}`;
    
    if (useAdvancedReasoning) {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
              type: 'thinking',
              message: 'Analyzing your query...'
            })}\n\n`));
            
            const relevantEntityIds: string[] = [];
            let finalAnswer = '';
            let sources: any[] = [];
            let queryKnowledgeGraph: any = null;
            
            for await (const chunk of reasoningEngine.streamReasoning({
              userId: user.id,
              query,
              documentIds: filteredDocIds,
              conversationHistory
            })) {
              
              if (chunk.type === 'reasoning_step') {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'reasoning',
                  step: chunk.data
                })}\n\n`));
              }
              
              if (chunk.type === 'tool_execution') {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'tool',
                  tool: chunk.data
                })}\n\n`));
              }
              
              if (chunk.type === 'refinement') {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'refinement',
                  data: chunk.data
                })}\n\n`));
              }
              
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
                
                const reasoning = chunk.data.reasoning;
                reasoning.steps.forEach((step: any) => {
                  if (step.metadata?.entities) {
                    relevantEntityIds.push(...step.metadata.entities.map((e: any) => e.id));
                  }
                });
                
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
                        if (item.entity.id) {
                          relevantEntityIds.push(item.entity.id);
                        }
                      }
                    });
                  } else if (result.tool === 'relationship_path' && Array.isArray(result.data)) {
                    result.data.forEach((path: any) => {
                      if (path.nodes) {
                        path.nodes.forEach((node: any) => {
                          if (node.id && !relevantEntityIds.includes(node.id)) {
                            relevantEntityIds.push(node.id);
                          }
                        });
                      }
                    });
                  } else if (result.tool === 'graph_traversal' && result.data) {
                    if (result.data.entities) {
                      result.data.entities.forEach((entity: any) => {
                        if (entity.id && !relevantEntityIds.includes(entity.id)) {
                          relevantEntityIds.push(entity.id);
                        }
                      });
                    }
                  }
                });
                
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                  type: 'sources',
                  sources
                })}\n\n`));
              }
            }
            
            if (assistantMessage.length > 100 || relevantEntityIds.length > 0) {
              try {
                let graphToSend = null;
                
                if (assistantMessage.length > 100) {
                  const extractedGraph = await engine.extractGraphFromResponse(
                    query,
                    assistantMessage,
                    toolResults
                  );
                  
                  if (extractedGraph && extractedGraph.nodes && extractedGraph.nodes.length > 0) {
                    graphToSend = {
                      nodes: extractedGraph.nodes,
                      edges: extractedGraph.edges || [],
                      metadata: {
                        entityCount: extractedGraph.nodes.length,
                        relationshipCount: extractedGraph.edges?.length || 0,
                        createdAt: new Date().toISOString(),
                        scope: 'query',
                        source: 'llm_extraction'
                      }
                    };
                    queryKnowledgeGraph = graphToSend;
                  }
                }
                
                if (!graphToSend && relevantEntityIds.length > 0) {
                  let entityIdsForGraph = relevantEntityIds.slice(0, 10);
                  
                  queryKnowledgeGraph = await graphProcessor.buildQueryKnowledgeGraph(
                    user.id,
                    query,
                    entityIdsForGraph
                  );
                  
                  if (queryKnowledgeGraph && queryKnowledgeGraph.nodes && queryKnowledgeGraph.nodes.length >= 3) {
                    graphToSend = queryKnowledgeGraph;
                  }
                }
                
                if (graphToSend && graphToSend.nodes && graphToSend.nodes.length > 0) {
                  const sanitizedGraph = {
                    nodes: graphToSend.nodes.map((node: any) => ({
                      id: String(node.id || ''),
                      label: String(node.label || node.name || ''),
                      type: String(node.type || 'CONCEPT'),
                      properties: node.properties || {}
                    })),
                    edges: (graphToSend.edges || []).map((edge: any) => ({
                      id: String(edge.id || `${edge.source}-${edge.target}`),
                      source: String(edge.source || ''),
                      target: String(edge.target || ''),
                      label: String(edge.type || edge.label || 'RELATED'),
                      type: String(edge.type || 'RELATED'),
                      properties: edge.properties || {}
                    })),
                    metadata: graphToSend.metadata || {}
                  };
                  
                  try {
                    const graphMessage = JSON.stringify({
                      type: 'knowledge_graph',
                      graph: sanitizedGraph
                    });
                    
                    controller.enqueue(new TextEncoder().encode(`data: ${graphMessage}\n\n`));
                    
                    await pipeline.bufferStreamMessage(sessionId, {
                      type: 'knowledge_graph',
                      graph: sanitizedGraph,
                      timestamp: Date.now()
                    });
                  } catch (jsonError) {
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                      type: 'knowledge_graph',
                      graph: {
                        nodes: sanitizedGraph.nodes.slice(0, 20),
                        edges: sanitizedGraph.edges.slice(0, 30),
                        metadata: { limited: true, originalNodeCount: sanitizedGraph.nodes.length }
                      }
                    })}\n\n`));
                  }
                }
              } catch (error) {
              }
            }
            
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
              type: 'metadata',
              sessionId,
              timestamp: Date.now()
            })}\n\n`));
            
            saveChatMessage(user.id, sessionId, 'user', query, {
              documentIds: filteredDocIds
            }).catch(err => {});
            
            const knowledgeGraphToSave = relevantEntityIds.length > 0 ? queryKnowledgeGraph : undefined;
            
            saveChatMessage(user.id, sessionId, 'assistant', finalAnswer, {
              sources,
              knowledgeGraph: knowledgeGraphToSave,
              documentIds: filteredDocIds
            }).then(savedMsg => {
            }).catch(err => {});
            
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
    }
    
    const queryEmbedding = await generateEmbedding(query);

    const cacheKey = `query:${user.id}:${Buffer.from(query).toString('base64').slice(0, 50)}`;
    const cachedEmbedding = await pipeline.getCachedEmbedding(cacheKey);
    const embedding = cachedEmbedding || queryEmbedding;

    if (!cachedEmbedding) {
      await pipeline.cacheEmbedding(cacheKey, queryEmbedding, 3600);
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
    return NextResponse.json({ error: 'Failed to process query' }, { status: 500 });
  }
}
