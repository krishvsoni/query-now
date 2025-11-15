'use client';

import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  MessageSquare,
  X,
  Trash2
} from 'lucide-react';

interface ChatMessage {
  id: string;
  userId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: any;
  timestamp: string;
  createdAt: string;
}

interface ChatSession {
  sessionId: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  messages?: ChatMessage[];
}

interface ChatHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSession: (sessionId: string, messages: ChatMessage[]) => void;
}

export default function ChatHistory({ isOpen, onClose, onLoadSession }: ChatHistoryProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/chat/history?mode=sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/history?sessionId=${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session messages');
      
      const data = await response.json();
      return data.messages || [];
    } catch (err) {
      console.error('Error fetching session messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
      return [];
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-gradient-to-br from-card/95 to-card/90 backdrop-blur-xl shadow-2xl border-l border-primary/20 z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-primary/20">
        <div className="flex items-center space-x-2">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Chat History</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-primary/10 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-destructive mb-2 font-semibold">{error}</p>
            <button
              onClick={fetchSessions}
              className="text-primary hover:text-accent text-sm font-semibold transition-colors"
            >
              Try again
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <p className="font-semibold text-foreground">No chat history yet</p>
            <p className="text-sm mt-1">Start a conversation to see it here</p>
          </div>
        ) : (
          <div className="divide-y divide-primary/10">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={async () => {
                  const messages = await loadSessionMessages(session.sessionId);
                  if (messages.length > 0) {
                    onLoadSession(session.sessionId, messages);
                    onClose();
                  }
                }}
                className="w-full p-4 text-left hover:bg-primary/5 transition-all rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {session.lastMessage}
                    </p>
                    <div className="flex items-center mt-1 text-xs text-muted-foreground space-x-2">
                      <span>{formatDate(session.timestamp)}</span>
                      <span>•</span>
                      <span className="font-semibold">{session.messageCount} messages</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          
        )}
      </div>
      <div className="p-4 border-t border-primary/20 bg-card/50">
        <button
          onClick={fetchSessions}
          className="w-full px-4 py-2 text-sm text-foreground hover:text-primary font-semibold rounded-lg hover:bg-primary/10 transition-all"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
