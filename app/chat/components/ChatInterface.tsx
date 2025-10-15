'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, DocumentTextIcon, BeakerIcon, UserIcon } from '@heroicons/react/24/outline';
import { LightBulbIcon, CogIcon, EyeIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import ResponseGraph from './ResponseGraph';

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
  onShowGraph?: (query: string, mode?: 'central' | 'document' | 'query', graphData?: { nodes: any[]; edges: any[] }) => void;
  selectedDocuments?: string[];
  loadedMessages?: any[] | null;
  onMessagesLoaded?: () => void;
}

export default function ChatInterface({ onShowGraph, selectedDocuments = [], loadedMessages, onMessagesLoaded }: ChatInterfaceProps) {
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

  const [showResponseGraph, setShowResponseGraph] = useState(false);
  const [responseGraphData, setResponseGraphData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [responseGraphQuery, setResponseGraphQuery] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  useEffect(() => {
    if (loadedMessages && loadedMessages.length > 0) {
      const convertedMessages: Message[] = loadedMessages.map((msg: any) => {
        const knowledgeGraph = msg.metadata?.knowledgeGraph || null;
        return {
          id: msg.id || msg.$id || Date.now().toString(),
          role: msg.role,
          content: msg.content,
          sources: msg.metadata?.sources || [],
          timestamp: new Date(msg.timestamp || msg.createdAt).getTime(),
          reasoningChain: msg.metadata?.reasoningChain || [],
          knowledgeGraph: knowledgeGraph,
          user: msg.user
        };
      });
      setMessages(convertedMessages);
      if (onMessagesLoaded) {
        onMessagesLoaded();
      }
    }
  }, [loadedMessages, onMessagesLoaded]);

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
          conversationHistory: messages.slice(-10),
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
      let partialData = '';
      let partialGraphData = ''; // Buffer for large graph data

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          partialData += chunk; // Accumulate data
          const lines = partialData.split('\n');
          
          // Keep the last incomplete line in the buffer
          partialData = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              let data = line.slice(6).trim();
              if (data === '[DONE]') {
                break;
              }
              if (!data) continue;
              
              // Handle knowledge_graph specially as it might be large
              if (data.includes('"type":"knowledge_graph"') || data.includes('"type": "knowledge_graph"')) {
                partialGraphData += data;
                
                // Try to parse when we have complete JSON
                try {
                  const parsed = JSON.parse(partialGraphData);
                  if (parsed.type === 'knowledge_graph' && parsed.graph) {
                    console.log('[ChatInterface] ✓ Successfully parsed knowledge graph');
                    console.log('[ChatInterface] Node count:', parsed.graph?.nodes?.length);
                    console.log('[ChatInterface] Edge count:', parsed.graph?.edges?.length);
                    knowledgeGraph = parsed.graph;
                    setCurrentKnowledgeGraph(knowledgeGraph);
                    partialGraphData = ''; // Clear buffer
                  }
                } catch (e) {
                  // Still accumulating, continue
                  console.log('[ChatInterface] Accumulating graph data... (size:', partialGraphData.length, 'bytes)');
                }
                continue;
              }
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'thinking') {
                  setThinkingStatus(parsed.message || 'Thinking...');
                } else if (parsed.type === 'chunk' && parsed.content) {
                  assistantMessage += parsed.content;
                  setStreamingMessage(assistantMessage);
                  setThinkingStatus('');
                } else if (parsed.type === 'sources') {
                  sources = parsed.sources || [];
                } else if (parsed.type === 'reasoning') {
                  reasoningSteps.push(parsed.step);
                  setCurrentReasoningSteps([...reasoningSteps]);
                  setThinkingStatus(`Processing step ${reasoningSteps.length}...`);
                } else if (parsed.type === 'tool') {
                  setThinkingStatus(`Executing ${parsed.tool.tool}...`);
                } else if (parsed.type === 'refinement') {
                  setThinkingStatus('Refining answer...');
                }
              } catch (parseError) {
                // Silently handle partial JSON
                console.log('[ChatInterface] Parse error (partial data):', parseError);
              }
            }
          }
        }
        
        // Try final parse of any remaining graph data
        if (partialGraphData) {
          try {
            const parsed = JSON.parse(partialGraphData);
            if (parsed.type === 'knowledge_graph' && parsed.graph) {
              console.log('[ChatInterface] ✓ Final parse of knowledge graph successful');
              knowledgeGraph = parsed.graph;
              setCurrentKnowledgeGraph(knowledgeGraph);
            }
          } catch (e) {
            console.error('[ChatInterface] Failed to parse final graph data:', e);
          }
        }
      } finally {
        reader.releaseLock();
      }

      const finalMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantMessage,
        sources,
        reasoningChain: reasoningSteps,
        knowledgeGraph,
        timestamp: Date.now()
      };

      console.log('[ChatInterface] Final message knowledge graph:', {
        hasGraph: !!knowledgeGraph,
        nodeCount: knowledgeGraph?.nodes?.length || 0,
        edgeCount: knowledgeGraph?.edges?.length || 0
      });

      setMessages(prev => [...prev, finalMessage]);
      setStreamingMessage('');
      setCurrentReasoningSteps([]);
      setThinkingStatus('');

    } catch (error) {
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
              {/* Knowledge Graph Indicator Badge */}
              {message.role === 'assistant' && 
               message.knowledgeGraph && 
               message.knowledgeGraph.nodes && 
               message.knowledgeGraph.nodes.length > 0 && (
                <div className="mb-2 inline-flex items-center gap-1 text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-medium">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Graph Available
                </div>
              )}
              
              <div className="whitespace-pre-wrap">{message.content}</div>
              
              {message.role === 'assistant' && showReasoning && message.reasoningChain && 
                renderReasoningChain(message.reasoningChain)}
              
              {message.role === 'assistant' && !showReasoning && renderSources(message.sources || [])}
              
              {message.role === 'assistant' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* Knowledge Graph Button - Shows when graph is available */}
                  {message.knowledgeGraph && 
                   message.knowledgeGraph.nodes && 
                   Array.isArray(message.knowledgeGraph.nodes) && 
                   message.knowledgeGraph.nodes.length > 0 && (
                    <button
                      onClick={() => {
                        const userMessageIndex = messages.findIndex(m => m.id === message.id) - 1;
                        const userQuery = userMessageIndex >= 0 ? messages[userMessageIndex]?.content : '';
                        setResponseGraphData(message.knowledgeGraph);
                        setResponseGraphQuery(userQuery || 'Query Response');
                        setShowResponseGraph(true);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600 rounded-lg font-medium transition-all shadow-sm hover:shadow-md"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      View Knowledge Graph ({message.knowledgeGraph.nodes.length} nodes)
                    </button>
                  )}
                  
                  {/* Show sources button when reasoning is hidden */}
                  {showReasoning && message.sources && message.sources.length > 0 && (
                    <button
                      onClick={() => setShowReasoning(false)}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                    >
                      <DocumentTextIcon className="w-4 h-4" />
                      Show Sources ({message.sources.length})
                    </button>
                  )}
                  
                  {/* Central Knowledge Graph fallback */}
                  {!message.knowledgeGraph && message.sources && message.sources.length > 0 && (
                    <button
                      onClick={() => onShowGraph?.('', 'central')}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      Central Knowledge Graph
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {(streamingMessage || thinkingStatus) && (
          <div className="flex justify-start">
            <div className="max-w-2xl px-4 py-2 rounded-lg bg-gray-100 text-gray-900">
              {streamingMessage && (
                <div className="whitespace-pre-wrap">{streamingMessage}</div>
              )}
              
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

      {showResponseGraph && responseGraphData && (
        <ResponseGraph
          isOpen={showResponseGraph}
          onClose={() => setShowResponseGraph(false)}
          graphData={responseGraphData}
          query={responseGraphQuery}
        />
      )}
    </div>
  );
}
