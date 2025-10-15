'use client';

import React, { useState, useEffect } from 'react';
import { 
  ClockIcon, 
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

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
    <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <ClockIcon className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Chat History</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-red-600 mb-2">{error}</p>
            <button
              onClick={fetchSessions}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Try again
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No chat history yet</p>
            <p className="text-sm mt-1">Start a conversation to see it here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
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
                className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {session.lastMessage}
                    </p>
                    <div className="flex items-center mt-1 text-xs text-gray-500 space-x-2">
                      <span>{formatDate(session.timestamp)}</span>
                      <span>•</span>
                      <span>{session.messageCount} messages</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          
        )}
      </div>
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <button
          onClick={fetchSessions}
          className="w-full px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
