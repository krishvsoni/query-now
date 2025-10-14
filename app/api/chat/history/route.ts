import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getChatHistory, getChatSessions } from '@/lib/appwrite';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(true);
    const { searchParams } = new URL(request.url);
    
    const sessionId = searchParams.get('sessionId');
    const mode = searchParams.get('mode') || 'history';
    const limit = parseInt(searchParams.get('limit') || '50');

    if (mode === 'sessions') {
      // Get list of chat sessions
      const sessions = await getChatSessions(user.id);
      return NextResponse.json({ sessions });
    }

    // Get chat history
    const messages = await getChatHistory(user.id, sessionId || undefined, limit);
    
    return NextResponse.json({
      messages,
      sessionId: sessionId || 'all',
      count: messages.length
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}
