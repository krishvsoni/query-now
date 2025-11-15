'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, FileText, Lightbulb, Cog, Eye, CheckCircle, User, Zap, Search, Globe, Link, BarChart3, Sparkles, CheckCheck, Target, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ResponseGraph from './ResponseGraph';
import ProfileDropdown from './ProfileDropdown';

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
  const [progressLogs, setProgressLogs] = useState<Array<{ type: string; message: string }>>([]);
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
  }, [messages, streamingMessage, progressLogs, thinkingStatus]);

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
    setThinkingStatus('');
    setProgressLogs([]);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      console.log('Sending query:', userMessage.content);
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

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      console.log('Starting to read stream...');
      
      let assistantMessage = '';
      let sources: Source[] = [];
      const reasoningSteps: ReasoningStep[] = [];
      let knowledgeGraph: any = null;
      let partialData = '';
      let partialGraphData = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Stream reading complete');
            break;
          }

          const chunk = new TextDecoder().decode(value);
          console.log('Received raw chunk:', chunk);
          partialData += chunk;
          const lines = partialData.split('\n');
          partialData = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              let data = line.slice(6).trim();
              if (data === '[DONE]') {
                break;
              }
              if (!data) continue;
              if (data.includes('"type":"knowledge_graph"') || data.includes('"type": "knowledge_graph"')) {
                partialGraphData += data;
                try {
                  const parsed = JSON.parse(partialGraphData);
                  if (parsed.type === 'knowledge_graph' && parsed.graph) {
                    knowledgeGraph = parsed.graph;
                    setCurrentKnowledgeGraph(knowledgeGraph);
                    partialGraphData = '';
                  }
                } catch (e) {
                }
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                console.log('Parsed chunk:', parsed.type, parsed);
                
                if (parsed.type === 'thinking') {
                  const msg = parsed.message || 'Thinking...';
                  setThinkingStatus(msg);
                  // Replace last progress log if it's also a thinking type, otherwise add new
                  setProgressLogs(prev => {
                    const lastLog = prev[prev.length - 1];
                    if (lastLog && lastLog.type === 'brain') {
                      return [...prev.slice(0, -1), { type: 'brain', message: msg.replace(/🔍\s*/, '') }];
                    }
                    return [...prev, { type: 'brain', message: msg.replace(/🔍\s*/, '') }];
                  });
                } else if (parsed.type === 'chunk' && parsed.content) {
                  assistantMessage += parsed.content;
                  setStreamingMessage(assistantMessage);
                  if (thinkingStatus) {
                    setProgressLogs(prev => [...prev, { type: 'checkcheck', message: 'Starting to generate response' }]);
                    setThinkingStatus('');
                  }
                } else if (parsed.type === 'sources') {
                  sources = parsed.sources || [];
                  setProgressLogs(prev => [...prev, { type: 'check', message: `Found ${sources.length} relevant sources` }]);
                } else if (parsed.type === 'reasoning') {
                  reasoningSteps.push(parsed.step);
                  setCurrentReasoningSteps([...reasoningSteps]);
                  const stepType = parsed.step.type;
                  const friendlyMessage = stepType === 'thought' ? 'Analyzing context' :
                                         stepType === 'action' ? 'Executing search' :
                                         stepType === 'observation' ? 'Reviewing results' :
                                         stepType === 'conclusion' ? 'Drawing conclusions' : 'Processing';
                  setProgressLogs(prev => [...prev, { type: stepType, message: friendlyMessage }]);
                } else if (parsed.type === 'tool') {
                  const toolName = parsed.tool.tool;
                  const friendlyTool = toolName === 'vector_search' ? { type: 'search', message: 'Searching documents' } :
                                      toolName === 'entity_search' ? { type: 'globe', message: 'Finding related concepts' } :
                                      toolName === 'relationship_path' ? { type: 'link', message: 'Mapping connections' } :
                                      toolName === 'graph_traversal' ? { type: 'chart', message: 'Exploring knowledge graph' } : { type: 'cog', message: `Running ${toolName}` };
                  setProgressLogs(prev => [...prev, friendlyTool]);
                } else if (parsed.type === 'refinement') {
                  setProgressLogs(prev => [...prev, { type: 'sparkles', message: 'Refining response' }]);
                }
              } catch (parseError) {
              }
            }
          }
        }
        if (partialGraphData) {
          try {
            const parsed = JSON.parse(partialGraphData);
            if (parsed.type === 'knowledge_graph' && parsed.graph) {
              knowledgeGraph = parsed.graph;
              setCurrentKnowledgeGraph(knowledgeGraph);
            }
          } catch (e) {
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

      setMessages(prev => [...prev, finalMessage]);
      setStreamingMessage('');
      setCurrentReasoningSteps([]);
      setThinkingStatus('');
      setProgressLogs([]);

    } catch (error) {
      console.error('Chat error:', error);
      if ((error as Error).name !== 'AbortError') {
        const errorDetails = error instanceof Error ? error.message : 'Unknown error';
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Sorry, I encountered an error while processing your request: ${errorDetails}\n\nPlease make sure you have uploaded documents and try again.`,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsLoading(false);
      setStreamingMessage('');
      setThinkingStatus('');
      setProgressLogs([]);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStreamingMessage('');
      setThinkingStatus('');
      setProgressLogs([]);
    }
  };

  const renderReasoningChain = (steps: ReasoningStep[]) => {
    if (!steps || steps.length === 0) return null;

    const getStepIcon = (type: string) => {
      switch (type) {
        case 'thought':
          return <Lightbulb className="w-4 h-4 text-primary" />;
        case 'action':
          return <Cog className="w-4 h-4 text-accent" />;
        case 'observation':
          return <Eye className="w-4 h-4 text-primary" />;
        case 'conclusion':
          return <CheckCircle className="w-4 h-4 text-primary" />;
        default:
          return null;
      }
    };

    return (
      <div className="mt-3 p-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground">Reasoning Chain</h4>
          <span className="text-xs text-muted-foreground">{steps.length} steps</span>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start space-x-2 text-xs">
              <div className="flex-shrink-0 mt-0.5">
                {getStepIcon(step.type)}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-foreground capitalize">{step.type}</span>
                  {step.confidence && (
                    <span className="text-xs text-muted-foreground">
                      ({Math.round(step.confidence * 100)}%)
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5">{step.content}</p>
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
      <div className="mt-3 p-3 rounded-xl border border-primary/20 bg-card/50 backdrop-blur-sm">
        <h4 className="text-sm font-semibold text-foreground mb-2">Sources:</h4>
        <div className="space-y-2">
          {sources.map((source, index) => (
            <div key={index} className="flex items-start space-x-2 text-xs">
              <FileText className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground">{source.fileName}</span>
                {source.type === 'vector' && source.score && (
                  <span className="ml-2 text-muted-foreground">
                    (Relevance: {Math.round(source.score * 100)}%)
                  </span>
                )}
                {source.type === 'graph' && source.entity && (
                  <span className="ml-2 text-primary">
                    Entity: {source.entity} ({source.entityType})
                  </span>
                )}
                {source.content && (
                  <p className="text-muted-foreground mt-1">{source.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-background to-card/20">
      <div className="flex-shrink-0 px-6 py-4 border-b border-primary/20 backdrop-blur-sm bg-card/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Query Documents
            </h1>
            <p className="text-sm text-muted-foreground">
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
                className="rounded border-primary/40 text-primary focus:ring-primary"
              />
              <span className="text-foreground font-medium">Advanced Reasoning</span>
            </label>
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={showReasoning}
                onChange={(e) => setShowReasoning(e.target.checked)}
                className="rounded border-primary/40 text-primary focus:ring-primary"
              />
              <span className="text-foreground font-medium">Show Reasoning</span>
            </label>
            <ProfileDropdown />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <p className="text-foreground font-semibold text-lg mb-2">
              Upload some documents and start asking questions!
            </p>
            <p className="text-muted-foreground text-sm">
              Select documents from the sidebar or upload new ones to begin
            </p>
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
              className={`max-w-2xl px-4 py-3 rounded-xl ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/20'
                  : 'border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md text-foreground'
              }`}
            >
              {message.role === 'assistant' && 
               message.knowledgeGraph && 
               message.knowledgeGraph.nodes && 
               message.knowledgeGraph.nodes.length > 0 && (
                <div className="mb-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/20 text-primary font-semibold">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Graph Available
                </div>
              )}
              {message.role === 'assistant' ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: ({node, inline, className, children, ...props}: any) => {
                        return inline ? (
                          <code className="bg-muted text-foreground px-1 py-0.5 rounded text-sm" {...props}>
                            {children}
                          </code>
                        ) : (
                          <code className="block bg-muted text-foreground p-3 rounded-lg overflow-x-auto text-sm" {...props}>
                            {children}
                          </code>
                        );
                      },
                      pre: ({children}: any) => <div className="my-2">{children}</div>,
                      p: ({children}: any) => <p className="mb-2 last:mb-0 text-foreground">{children}</p>,
                      ul: ({children}: any) => <ul className="list-disc list-inside mb-2 text-foreground">{children}</ul>,
                      ol: ({children}: any) => <ol className="list-decimal list-inside mb-2 text-foreground">{children}</ol>,
                      li: ({children}: any) => <li className="mb-1 text-foreground">{children}</li>,
                      h1: ({children}: any) => <h1 className="text-xl font-bold mb-2 text-foreground">{children}</h1>,
                      h2: ({children}: any) => <h2 className="text-lg font-bold mb-2 text-foreground">{children}</h2>,
                      h3: ({children}: any) => <h3 className="text-base font-bold mb-2 text-foreground">{children}</h3>,
                      blockquote: ({children}: any) => (
                        <blockquote className="border-l-4 border-primary pl-3 italic text-muted-foreground my-2">
                          {children}
                        </blockquote>
                      ),
                      a: ({children, href}: any) => (
                        <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                      table: ({children}: any) => (
                        <div className="overflow-x-auto my-2">
                          <table className="min-w-full border-collapse border border-primary/30">
                            {children}
                          </table>
                        </div>
                      ),
                      th: ({children}: any) => (
                        <th className="border border-primary/30 px-3 py-2 bg-primary/10 font-semibold text-left text-foreground">
                          {children}
                        </th>
                      ),
                      td: ({children}: any) => (
                        <td className="border border-primary/30 px-3 py-2 text-foreground">
                          {children}
                        </td>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap font-medium">{message.content}</div>
              )}
              {message.role === 'assistant' && showReasoning && message.reasoningChain && 
                renderReasoningChain(message.reasoningChain)}
              {message.role === 'assistant' && !showReasoning && renderSources(message.sources || [])}
              {message.role === 'assistant' && (
                <div className="mt-3 flex flex-wrap gap-2">
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
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gradient-to-r from-primary to-accent text-primary-foreground hover:shadow-lg hover:shadow-primary/40 rounded-lg font-semibold transition-all border border-primary/50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      View Knowledge Graph ({message.knowledgeGraph.nodes.length} nodes)
                    </button>
                  )}
                  {showReasoning && message.sources && message.sources.length > 0 && (
                    <button
                      onClick={() => setShowReasoning(false)}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-primary/30 bg-card/50 text-foreground hover:bg-card/80 rounded-lg font-semibold transition-all"
                    >
                      <FileText className="w-4 h-4" />
                      Show Sources ({message.sources.length})
                    </button>
                  )}
                  {!message.knowledgeGraph && message.sources && message.sources.length > 0 && (
                    <button
                      onClick={() => onShowGraph?.('', 'central')}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg font-semibold transition-all"
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

        {(isLoading && !messages.find(m => m.role === 'assistant' && messages.indexOf(m) === messages.length - 1)) && (
          <div className="flex justify-start">
            <div className="max-w-2xl px-4 py-3 rounded-xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md text-foreground">
              
              {/* Show progress logs if any */}
              {progressLogs.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {progressLogs.map((log, idx) => {
                    const IconComponent = 
                      log.type === 'thought' ? Brain :
                      log.type === 'action' ? Cog :
                      log.type === 'observation' ? Eye :
                      log.type === 'conclusion' ? CheckCircle :
                      log.type === 'search' ? Search :
                      log.type === 'globe' ? Globe :
                      log.type === 'link' ? Link :
                      log.type === 'chart' ? BarChart3 :
                      log.type === 'sparkles' ? Sparkles :
                      log.type === 'check' ? CheckCircle :
                      log.type === 'checkcheck' ? CheckCheck :
                      log.type === 'target' ? Target :
                      log.type === 'brain' ? Brain : Lightbulb;
                    
                    return (
                      <div 
                        key={idx} 
                        className="flex items-center space-x-2 text-xs animate-fade-in"
                        style={{ 
                          animation: `fadeIn 0.3s ease-in`,
                          animationDelay: `${idx * 0.05}s`,
                          opacity: idx === progressLogs.length - 1 ? 1 : 0.6
                        }}
                      >
                        <IconComponent className={`w-3.5 h-3.5 flex-shrink-0 ${
                          idx === progressLogs.length - 1 ? 'text-primary' : 'text-muted-foreground/60'
                        }`} />
                        <span className={idx === progressLogs.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground/70'}>
                          {log.message}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center space-x-3 p-3">
                  <div className="relative">
                    <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
                    <div className="absolute inset-0 animate-ping h-5 w-5 border-2 border-primary/30 rounded-full"></div>
                  </div>
                  <span className="text-sm text-primary font-medium">Processing your query...</span>
                </div>
              )}
              
              {/* Show thinking status if present */}
              {thinkingStatus && (
                <div className="mt-3 flex items-center space-x-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="relative">
                    <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
                    <div className="absolute inset-0 animate-ping h-5 w-5 border-2 border-primary/30 rounded-full"></div>
                  </div>
                  <span className="text-sm text-primary font-medium">{thinkingStatus}</span>
                </div>
              )}
              
              {/* Show streaming message if present */}
              {streamingMessage && (
                <div className="prose prose-sm max-w-none mt-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingMessage}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 px-6 py-4 border-t border-primary/20 backdrop-blur-sm bg-card/30">
        <form onSubmit={handleSubmit} className="flex space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your documents..."
            className="flex-1 px-4 py-3 border border-primary/30 rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-all"
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={handleStop}
              className="px-6 py-3 bg-destructive text-destructive-foreground rounded-xl hover:bg-destructive/90 font-semibold transition-all shadow-lg hover:shadow-xl"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-6 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl hover:shadow-lg hover:shadow-primary/40 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all border border-primary/50"
            >
              <Send className="w-5 h-5" />
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
