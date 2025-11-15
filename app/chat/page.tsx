'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Tabs from './components/Tabs';
import ChatInterface from './components/ChatInterface';
import DocumentUpload from './components/DocumentUpload';
import DocumentList from './components/DocumentList';
import GraphVisualization from './components/GraphVisualization';
import ChatHistory from './components/ChatHistory';
import { 
  MessageSquare, 
  FileText, 
  Upload,
  Share2,
  Clock,
  Menu,
  X
} from 'lucide-react';

export default function ChatPage() {
  const router = useRouter();
  const [refreshDocuments, setRefreshDocuments] = useState(0);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [showGraph, setShowGraph] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [graphQuery, setGraphQuery] = useState<string>('');
  const [graphMode, setGraphMode] = useState<'central' | 'document' | 'query'>('query');
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] } | undefined>(undefined);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; fullName: string } | null>(null);
  const [loadedMessages, setLoadedMessages] = useState<any[] | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleUploadComplete = (document: any, user: any) => {
    setCurrentUser(user);
    setRefreshDocuments(prev => prev + 1);
  };

  const handleDocumentSelect = (documentId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(documentId) 
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const handleShowGraph = (query: string, mode: 'central' | 'document' | 'query' = 'query', preloadedData?: { nodes: any[]; edges: any[] }) => {
    setGraphQuery(query);
    setGraphMode(mode);
    setGraphData(preloadedData);
    setShowGraph(true);
  };
  
  const handleShowCentralGraph = () => {
    setGraphQuery('');
    setGraphMode('central');
    setGraphData(undefined); 
    setShowGraph(true);
  };
  
  const handleLoadSession = (sessionId: string, messages: any[]) => {
    setCurrentSessionId(sessionId);
    setLoadedMessages(messages);
  };

  const tabs = [
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      component: (
        <div className="flex h-full relative">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden fixed top-20 right-4 z-40 p-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex-1 w-full lg:w-auto">
            <ChatInterface 
              onShowGraph={handleShowGraph} 
              selectedDocuments={selectedDocuments}
              loadedMessages={loadedMessages}
              onMessagesLoaded={() => setLoadedMessages(null)}
            />
          </div>
          
          {/* Sidebar - Responsive */}
          <div className={`
            fixed lg:relative
            top-0 right-0
            h-full lg:h-auto
            w-80 lg:w-80
            transform transition-transform duration-300 ease-in-out
            ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
            z-30 lg:z-auto
            border-l border-primary/20 bg-gradient-to-br from-card/50 to-card/20 backdrop-blur-sm p-4 overflow-y-auto
            shadow-2xl lg:shadow-none
          `}>
            {/* Mobile Close Button Inside Sidebar */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden absolute top-4 right-4 p-2 hover:bg-muted rounded-lg transition-colors"
            >
            </button>

            <div className="space-y-6 mt-12 lg:mt-0">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Upload Document
                </h3>
                <DocumentUpload 
                  onUploadComplete={handleUploadComplete}
                  onUploadStart={() => {}}
                />
              </div>
              <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Session Stats</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Selected Documents:</span>
                    <span className="font-bold text-primary">{selectedDocuments.length}</span>
                  </div>
                </div>
              </div>
              <DocumentList 
                onDocumentSelect={handleDocumentSelect}
                selectedDocuments={selectedDocuments}
                refreshTrigger={refreshDocuments}
              />
            </div>
          </div>

          {/* Mobile Overlay */}
          {isSidebarOpen && (
            <div
              className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-20"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
        </div>
      )
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: FileText,
      component: (
        <div className="p-6 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md p-6 hover:border-primary/60 transition-all duration-300">
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Upload New Document
              </h2>
              <DocumentUpload 
                onUploadComplete={handleUploadComplete}
                onUploadStart={() => {}}
              />
              
              <div className="mt-6 p-4 rounded-xl border border-primary/20 bg-primary/10 backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Supported Formats
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    PDF documents (.pdf)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    Word documents (.docx)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    Plain text files (.txt)
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Maximum file size: 10MB
                </p>
              </div>
            </div>

            <DocumentList 
              onDocumentSelect={handleDocumentSelect}
              selectedDocuments={selectedDocuments}
              refreshTrigger={refreshDocuments}
            />
          </div>

          <div className="mt-8 rounded-2xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md p-6">
            <h2 className="text-lg font-bold text-foreground mb-4">How Document Processing Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-xl border border-primary/20 bg-gradient-to-br from-card/40 to-card/10 hover:border-primary/50 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">1. Upload & Parse</h3>
                <p className="text-sm text-muted-foreground">
                  Your document is securely uploaded and text is extracted from PDF, DOCX, or TXT files.
                </p>
              </div>
              
              <div className="text-center p-4 rounded-xl border border-primary/20 bg-gradient-to-br from-card/40 to-card/10 hover:border-primary/50 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mx-auto mb-3">
                  <Share2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">2. Create Knowledge Graph</h3>
                <p className="text-sm text-muted-foreground">
                  AI identifies entities and relationships to build an interactive knowledge graph.
                </p>
              </div>
              
              <div className="text-center p-4 rounded-xl border border-primary/20 bg-gradient-to-br from-card/40 to-card/10 hover:border-primary/50 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">3. Query & Chat</h3>
                <p className="text-sm text-muted-foreground">
                  Ask questions and get intelligent answers powered by semantic search and graph reasoning.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'upload',
      label: 'Upload',
      icon: Upload,
      component: (
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md w-full">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-black text-foreground mb-2">Upload Documents</h1>
              <p className="text-muted-foreground">
                Add your documents to start building your knowledge base
              </p>
            </div>
            
            <DocumentUpload 
              onUploadComplete={handleUploadComplete}
              onUploadStart={() => {}}
            />
            
            <div className="mt-8">
              <DocumentList 
                onDocumentSelect={handleDocumentSelect}
                selectedDocuments={selectedDocuments}
                refreshTrigger={refreshDocuments}
              />
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="h-screen bg-background relative overflow-hidden">
      <div className="pointer-events-none fixed w-96 h-96 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 blur-3xl top-20 right-10 animate-float" />
      <div className="pointer-events-none fixed w-80 h-80 rounded-full bg-gradient-to-br from-accent/15 to-primary/5 blur-3xl bottom-20 left-10 animate-float" style={{ animationDelay: '1s' }} />
      
      <Tabs tabs={tabs} defaultTab="chat" />
      
      <div className="fixed bottom-20 right-6 flex flex-col space-y-3 z-40">
        <button
          onClick={() => setShowHistory(true)}
          className="group relative bg-gradient-to-r from-primary to-accent text-primary-foreground p-4 rounded-xl shadow-lg hover:shadow-2xl hover:shadow-primary/40 transition-all duration-300 hover:scale-110 border border-primary/50"
          title="View Chat History"
        >
          <Clock className="w-6 h-6" />
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-card border border-primary/30 text-foreground text-sm px-3 py-2 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none backdrop-blur-sm">
            Chat History
          </span>
        </button>
        
        <button
          onClick={handleShowCentralGraph}
          className="group relative bg-gradient-to-r from-primary to-accent text-primary-foreground p-4 rounded-xl shadow-lg hover:shadow-2xl hover:shadow-primary/40 transition-all duration-300 hover:scale-110 border border-primary/50"
          title="View Central Knowledge Graph"
        >
          <Share2 className="w-6 h-6" />
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-card border border-primary/30 text-foreground text-sm px-3 py-2 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none backdrop-blur-sm">
            Central Knowledge Graph
          </span>
        </button>
      </div>
      
      <GraphVisualization
        isOpen={showGraph}
        onClose={() => setShowGraph(false)}
        query={graphQuery}
        documentIds={selectedDocuments}
        mode={graphMode}
        preloadedGraphData={graphData}
      />
      
      <ChatHistory
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onLoadSession={handleLoadSession}
      />
    </div>
  );
}