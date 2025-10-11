'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, DocumentTextIcon, BeakerIcon, UserIcon } from '@heroicons/react/24/outline';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  timestamp: number;
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface Source {
  type: 'vector' | 'graph';
  fileName: string;
  content?: string;
  score?: number;
  entity?: string;
  entityType?: string;
}

interface ChatInterfaceProps {
  onShowGraph?: (query: string) => void;
}

export default function ChatInterface({ onShowGraph }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingMessage('');

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage.content,
          conversationHistory: messages.slice(-10) // Keep last 10 messages for context
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let assistantMessage = '';
      let sources: Source[] = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                // Stream finished
                break;
              }

              try {
                const parsed = JSON.parse(data);
                
                if (parsed.type === 'chunk' && parsed.content) {
                  assistantMessage += parsed.content;
                  setStreamingMessage(assistantMessage);
                } else if (parsed.type === 'sources') {
                  sources = parsed.sources || [];
                }
              } catch (parseError) {
                console.error('Error parsing stream data:', parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Add final message to chat
      const finalMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantMessage,
        sources,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, finalMessage]);
      setStreamingMessage('');

    } catch (error) {
      console.error('Chat error:', error);
      if ((error as Error).name !== 'AbortError') {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error while processing your request. Please try again.',
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsLoading(false);
      setStreamingMessage('');
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStreamingMessage('');
    }
  };

  const renderSources = (sources: Source[]) => {
    if (!sources || sources.length === 0) return null;

    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg border">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Sources:</h4>
        <div className="space-y-2">
          {sources.map((source, index) => (
            <div key={index} className="flex items-start space-x-2 text-xs">
              <DocumentTextIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-gray-600">{source.fileName}</span>
                {source.type === 'vector' && source.score && (
                  <span className="ml-2 text-gray-500">
                    (Relevance: {Math.round(source.score * 100)}%)
                  </span>
                )}
                {source.type === 'graph' && source.entity && (
                  <span className="ml-2 text-blue-600">
                    Entity: {source.entity} ({source.entityType})
                  </span>
                )}
                {source.content && (
                  <p className="text-gray-500 mt-1">{source.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Query Documents</h1>
        <p className="text-sm text-gray-600">Ask questions about your uploaded documents</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <BeakerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              Upload some documents and start asking questions!
            </p>
            <div className="mt-4 text-sm text-gray-500">
              <p>Try asking things like:</p>
              <ul className="mt-2 space-y-1">
                <li>"• What are the main topics in my documents?"</li>
                <li>"• How is X related to Y?"</li>
                <li>"• Summarize the key points about..."</li>
              </ul>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-2xl px-4 py-2 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.role === 'assistant' && renderSources(message.sources || [])}
              
              {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                <button
                  onClick={() => onShowGraph?.(message.content)}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  View Knowledge Graph
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streamingMessage && (
          <div className="flex justify-start">
            <div className="max-w-2xl px-4 py-2 rounded-lg bg-gray-100 text-gray-900">
              <div className="whitespace-pre-wrap">{streamingMessage}</div>
              <div className="mt-2 text-xs text-gray-500">Typing...</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your documents..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
          />
          
          {isLoading ? (
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}