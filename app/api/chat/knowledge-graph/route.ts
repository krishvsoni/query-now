import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getChatMessage } from '@/lib/appwrite';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(true);
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');

    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const message = await getChatMessage(messageId, user.id);
    
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const metadata = typeof message.metadata === 'string' 
      ? JSON.parse(message.metadata) 
      : message.metadata;

    const knowledgeGraph = metadata?.knowledgeGraph;

    if (!knowledgeGraph || !knowledgeGraph.nodes || knowledgeGraph.nodes.length === 0) {
      return NextResponse.json({ error: 'No knowledge graph available for this message' }, { status: 404 });
    }

    return NextResponse.json({
      knowledgeGraph,
      query: message.content,
      timestamp: message.timestamp
    });

  } catch (error) {
    console.error('[Knowledge Graph API Error]:', error);
    return NextResponse.json({ error: 'Failed to retrieve knowledge graph' }, { status: 500 });
  }
}
