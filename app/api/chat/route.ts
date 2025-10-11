import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { pipeline } from '@/lib/redis';
import { generateEmbedding, generateStreamingResponse } from '@/lib/openai';
import { searchSimilar } from '@/lib/pinecone';
import { searchEntities, getEntityRelationships } from '@/lib/neo4j';
import { getUserDocuments } from '@/lib/appwrite';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const { query, documentIds, conversationHistory = [] } = await request.json();

    const queryCount = await pipeline.trackUserQuery(user.id);
    if (queryCount > 100) {
      return NextResponse.json({ error: 'Daily query limit exceeded' }, { status: 429 });
    }

    const userDocs = await getUserDocuments(user.id);
    const availableDocIds = userDocs.map(doc => doc.$id);
    
    const filteredDocIds = documentIds 
      ? documentIds.filter((id: string) => availableDocIds.includes(id))
      : availableDocIds;

    if (filteredDocIds.length === 0) {
      return NextResponse.json({ error: 'No accessible documents found' }, { status: 404 });
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

    vectorResults.forEach(result => {
      if (result.score && result.score > 0.7) {
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
          console.error('Error fetching relationships:', error);
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
    
    const sessionId = `${user.id}_${Date.now()}`;
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

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to process query' }, { status: 500 });
  }
}
