'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, DocumentTextIcon, BeakerIcon, UserIcon } from '@heroicons/react/24/outline';
import { LightBulbIcon, CogIcon, EyeIcon, CheckCircleIcon } from '@heroicons/react/24/solid';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  timestamp: number;
  reasoningChain?: ReasoningStep[];
  knowledgeGraph?: any;
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

interface ReasoningStep {
  id: string;
  type: 'thought' | 'action' | 'observation' | 'conclusion';
  content: string;
  timestamp: number;
  confidence?: number;
}

interface ChatInterfaceProps {
  onShowGraph?: (query: string) => void;
  selectedDocuments?: string[];
}

export default function ChatInterface({ onShowGraph, selectedDocuments = [] }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [currentReasoningSteps, setCurrentReasoningSteps] = useState<ReasoningStep[]>([]);
  const [currentKnowledgeGraph, setCurrentKnowledgeGraph] = useState<any>(null);
  const [showReasoning, setShowReasoning] = useState(true);
  const [useAdvancedReasoning, setUseAdvancedReasoning] = useState(true);
  const [thinkingStatus, setThinkingStatus] = useState('');
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
    setCurrentReasoningSteps([]);
    setCurrentKnowledgeGraph(null);
    setThinkingStatus('Initializing...');

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
          documentIds: selectedDocuments.length > 0 ? selectedDocuments : undefined,
          conversationHistory: messages.slice(-10), // Keep last 10 messages for context
          useAdvancedReasoning
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
      const reasoningSteps: ReasoningStep[] = [];
      let knowledgeGraph: any = null;

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
                
                if (parsed.type === 'thinking') {
                  // Update thinking status
                  setThinkingStatus(parsed.message || 'Thinking...');
                } else if (parsed.type === 'chunk' && parsed.content) {
                  assistantMessage += parsed.content;
                  setStreamingMessage(assistantMessage);
                  setThinkingStatus(''); // Clear thinking status when content starts
                } else if (parsed.type === 'sources') {
                  sources = parsed.sources || [];
                  console.log('[Cache Info] Received sources:', sources.length);
                } else if (parsed.type === 'reasoning') {
                  // Reasoning step
                  reasoningSteps.push(parsed.step);
                  setCurrentReasoningSteps([...reasoningSteps]);
                  setThinkingStatus(`Processing step ${reasoningSteps.length}...`);
                } else if (parsed.type === 'tool') {
                  // Tool execution update
                  console.log('[Tool Execution]:', parsed.tool);
                  setThinkingStatus(`Executing ${parsed.tool.tool}...`);
                } else if (parsed.type === 'refinement') {
                  // Refinement iteration
                  console.log('[Refinement]:', parsed.data);
                  setThinkingStatus('Refining answer...');
                } else if (parsed.type === 'knowledge_graph') {
                  // Knowledge graph for this response
                  knowledgeGraph = parsed.graph;
                  setCurrentKnowledgeGraph(knowledgeGraph);
                  console.log('[Knowledge Graph] Received graph with', parsed.graph?.nodes?.length || 0, 'nodes');
                } else if (parsed.type === 'metadata') {
                  // Metadata
                  console.log('[Session Metadata]:', parsed);
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
        reasoningChain: reasoningSteps,
        knowledgeGraph,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, finalMessage]);
      setStreamingMessage('');
      setCurrentReasoningSteps([]);
      setThinkingStatus('');

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
      setThinkingStatus('');
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStreamingMessage('');
      setThinkingStatus('');
    }
  };

  const renderReasoningChain = (steps: ReasoningStep[]) => {
    if (!steps || steps.length === 0) return null;

    const getStepIcon = (type: string) => {
      switch (type) {
        case 'thought':
          return <LightBulbIcon className="h-4 w-4 text-yellow-500" />;
        case 'action':
          return <CogIcon className="h-4 w-4 text-blue-500" />;
        case 'observation':
          return <EyeIcon className="h-4 w-4 text-purple-500" />;
        case 'conclusion':
          return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
        default:
          return null;
      }
    };

    return (
      <div className="mt-3 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Reasoning Chain</h4>
          <span className="text-xs text-gray-500">{steps.length} steps</span>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start space-x-2 text-xs">
              <div className="flex-shrink-0 mt-0.5">
                {getStepIcon(step.type)}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-700 capitalize">{step.type}</span>
                  {step.confidence && (
                    <span className="text-xs text-gray-500">
                      ({Math.round(step.confidence * 100)}%)
                    </span>
                  )}
                </div>
                <p className="text-gray-600 mt-0.5">{step.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Query Documents</h1>
            <p className="text-sm text-gray-600">
              {selectedDocuments.length > 0 
                ? `Searching ${selectedDocuments.length} selected document${selectedDocuments.length > 1 ? 's' : ''}`
                : 'Select documents from the sidebar to search or search all documents'}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={useAdvancedReasoning}
                onChange={(e) => setUseAdvancedReasoning(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">Advanced Reasoning</span>
            </label>
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={showReasoning}
                onChange={(e) => setShowReasoning(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">Show Reasoning</span>
            </label>
          </div>
        </div>
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
              
              {message.role === 'assistant' && showReasoning && message.reasoningChain && 
                renderReasoningChain(message.reasoningChain)}
              
              {message.role === 'assistant' && !showReasoning && renderSources(message.sources || [])}
              
              {message.role === 'assistant' && (message.sources && message.sources.length > 0 || message.knowledgeGraph) && (
                <div className="mt-2 flex space-x-2">
                  {message.sources && message.sources.length > 0 && (
                    <button
                      onClick={() => onShowGraph?.(message.content)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      View Central Knowledge Graph
                    </button>
                  )}
                  {message.knowledgeGraph && (
                    <button
                      onClick={() => {
                        // Could open a modal or expand inline
                        console.log('Query-specific knowledge graph:', message.knowledgeGraph);
                      }}
                      className="text-xs text-purple-600 hover:text-purple-800 underline"
                    >
                      View Query Graph ({message.knowledgeGraph.nodes?.length || 0} nodes)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {(streamingMessage || thinkingStatus) && (
          <div className="flex justify-start">
            <div className="max-w-2xl px-4 py-2 rounded-lg bg-gray-100 text-gray-900">
              {streamingMessage && (
                <div className="whitespace-pre-wrap">{streamingMessage}</div>
              )}
              
              {/* Show reasoning in real-time */}
              {showReasoning && currentReasoningSteps.length > 0 && renderReasoningChain(currentReasoningSteps)}
              
              <div className="mt-2 flex items-center space-x-2">
                {thinkingStatus && (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    <span className="animate-pulse text-xs text-blue-600 font-medium">{thinkingStatus}</span>
                  </div>
                )}
                {!thinkingStatus && streamingMessage && (
                  <div className="animate-pulse text-xs text-gray-500">Generating response...</div>
                )}
                {showReasoning && currentReasoningSteps.length > 0 && (
                  <span className="text-xs text-blue-600">
                    ({currentReasoningSteps.length} steps)
                  </span>
                )}
              </div>
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