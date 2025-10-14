'use client';

import React, { useState } from 'react';
import Tabs from './components/Tabs';
import ChatInterface from './components/ChatInterface';
import DocumentUpload from './components/DocumentUpload';
import DocumentList from './components/DocumentList';
import GraphVisualization from './components/GraphVisualization';
import ChatHistory from './components/ChatHistory';
import { 
  ChatBubbleLeftRightIcon, 
  DocumentTextIcon, 
  CloudArrowUpIcon,
  ShareIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

export default function ChatPage() {
  const [refreshDocuments, setRefreshDocuments] = useState(0);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [showGraph, setShowGraph] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [graphQuery, setGraphQuery] = useState<string>('');
  const [graphMode, setGraphMode] = useState<'central' | 'document' | 'query'>('query');
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] } | undefined>(undefined);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; fullName: string } | null>(null);

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
    setGraphData(undefined); // Clear preloaded data for central graph
    setShowGraph(true);
  };
  
  const handleLoadSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    // Trigger chat interface to load this session
  };

  const tabs = [
    {
      id: 'chat',
      label: 'Chat',
      icon: ChatBubbleLeftRightIcon,
      component: (
        <div className="flex h-full">
          {/* Main Chat Area */}
          <div className="flex-1">
            <ChatInterface 
              onShowGraph={handleShowGraph} 
              selectedDocuments={selectedDocuments}
            />
          </div>
          
          {/* Sidebar */}
          <div className="w-80 border-l border-gray-200 bg-gray-50 p-4 overflow-y-auto">
            <div className="space-y-6">
              {/* Document Upload */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Upload Document</h3>
                <DocumentUpload 
                  onUploadComplete={handleUploadComplete}
                  onUploadStart={() => {}}
                />
              </div>

              {/* Document List */}
              <DocumentList 
                onDocumentSelect={handleDocumentSelect}
                selectedDocuments={selectedDocuments}
                refreshTrigger={refreshDocuments}
              />

              {/* Quick Actions */}
              <div className="bg-white rounded-lg p-4 border">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => handleShowGraph('')}
                    className="w-full flex items-center space-x-2 text-left p-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
                  >
                    <ShareIcon className="h-4 w-4" />
                    <span>View Knowledge Graph</span>
                  </button>
                  
                  <button
                    onClick={() => setSelectedDocuments([])}
                    className="w-full flex items-center space-x-2 text-left p-2 text-sm text-gray-700 hover:bg-gray-50 rounded"
                  >
                    <DocumentTextIcon className="h-4 w-4" />
                    <span>Clear Selection ({selectedDocuments.length})</span>
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="bg-white rounded-lg p-4 border">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Session Stats</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Selected Documents:</span>
                    <span>{selectedDocuments.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Graph Opened:</span>
                    <span>{showGraph ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: DocumentTextIcon,
      component: (
        <div className="p-6 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Upload New Document</h2>
              <DocumentUpload 
                onUploadComplete={handleUploadComplete}
                onUploadStart={() => {}}
              />
              
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Supported Formats</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• PDF documents (.pdf)</li>
                  <li>• Word documents (.docx)</li>
                  <li>• Plain text files (.txt)</li>
                </ul>
                <p className="text-xs text-blue-700 mt-2">
                  Maximum file size: 10MB
                </p>
              </div>
            </div>

            {/* Document List */}
            <DocumentList 
              onDocumentSelect={handleDocumentSelect}
              selectedDocuments={selectedDocuments}
              refreshTrigger={refreshDocuments}
            />
          </div>

          {/* Processing Information */}
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">How Document Processing Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <CloudArrowUpIcon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-medium text-gray-900 mb-2">1. Upload & Parse</h3>
                <p className="text-sm text-gray-600">
                  Your document is securely uploaded and text is extracted from PDF, DOCX, or TXT files.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <ShareIcon className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-medium text-gray-900 mb-2">2. Create Knowledge Graph</h3>
                <p className="text-sm text-gray-600">
                  AI identifies entities and relationships to build an interactive knowledge graph.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <ChatBubbleLeftRightIcon className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-medium text-gray-900 mb-2">3. Query & Chat</h3>
                <p className="text-sm text-gray-600">
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
      icon: CloudArrowUpIcon,
      component: (
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md w-full">
            <div className="text-center mb-6">
              <CloudArrowUpIcon className="h-16 w-16 text-blue-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload Documents</h1>
              <p className="text-gray-600">
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
    <div className="h-screen bg-gray-100 relative">
      <Tabs tabs={tabs} defaultTab="chat" />
      
      {/* Floating Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col space-y-3 z-40">
        {/* History Button */}
        <button
          onClick={() => setShowHistory(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110 group"
          title="View Chat History"
        >
          <ClockIcon className="h-6 w-6" />
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-sm px-3 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Chat History
          </span>
        </button>
        
        {/* Central Graph Button */}
        <button
          onClick={handleShowCentralGraph}
          className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110 group"
          title="View Central Knowledge Graph"
        >
          <ShareIcon className="h-6 w-6" />
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-sm px-3 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
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