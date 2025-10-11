'use client';

import React, { useState, useEffect } from 'react';
import { 
  DocumentTextIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  ExclamationCircleIcon,
  ArrowPathIcon,
  TrashIcon,
  UserIcon
} from '@heroicons/react/24/outline';

interface Document {
  id: string;
  fileName: string;
  status: string;
  processingStage: string;
  uploadedAt: string;
  fileId?: string;
  fileSize?: number;
  wordCount?: number;
}

interface UserInfo {
  id: string;
  email: string;
  fullName: string;
}

interface DocumentListProps {
  onDocumentSelect?: (documentId: string) => void;
  selectedDocuments?: string[];
  refreshTrigger?: number;
}

export default function DocumentList({ 
  onDocumentSelect, 
  selectedDocuments = [], 
  refreshTrigger 
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/documents');
      
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setDocuments(data.documents || []);
        setUser(data.user || null);
        setSetupRequired(data.setupRequired || false);
        setError(null);
      } else {
        setSetupRequired(data.setupRequired || false);
        if (data.setupRequired) {
          setError('Database setup required');
        } else {
          throw new Error('Invalid response format');
        }
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load documents';
      setError(errorMessage);
      
      // Check if this is a setup issue
      if (errorMessage.includes('Database') || errorMessage.includes('setup')) {
        setSetupRequired(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [refreshTrigger]);

  const getStatusIcon = (status: string, stage: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <ArrowPathIcon className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'error':
        return <ExclamationCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusText = (status: string, stage: string) => {
    if (status === 'completed') return 'Ready for queries';
    if (status === 'error') return 'Processing failed';
    if (status === 'processing') {
      switch (stage) {
        case 'parsing': return 'Extracting text...';
        case 'embedding': return 'Creating embeddings...';
        case 'ontology': return 'Building knowledge graph...';
        case 'graph': return 'Storing in Neo4j...';
        default: return 'Processing...';
      }
    }
    return 'Queued for processing';
  };

  const getProcessingProgress = (status: string, stage: string) => {
    if (status === 'completed') return 100;
    if (status === 'error') return 0;
    if (status === 'processing') {
      switch (stage) {
        case 'parsing': return 25;
        case 'embedding': return 50;
        case 'ontology': return 75;
        case 'graph': return 90;
        default: return 10;
      }
    }
    return 5;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDocumentClick = (documentId: string) => {
    onDocumentSelect?.(documentId);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Your Documents</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-gray-200 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4 mt-1"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && setupRequired) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Your Documents</h2>
        <div className="text-center py-6">
          <ExclamationCircleIcon className="h-12 w-12 text-yellow-400 mx-auto mb-2" />
          <p className="text-gray-900 font-medium mb-2">Database Setup Required</p>
          <p className="text-gray-600 mb-4">
            To use document upload, you need to set up Appwrite database and collections.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left">
            <h3 className="font-medium text-yellow-800 mb-2">Setup Instructions:</h3>
            <ol className="text-sm text-yellow-700 space-y-1">
              <li>1. Create database with ID: <code className="bg-yellow-100 px-1 rounded">main</code></li>
              <li>2. Create collection with ID: <code className="bg-yellow-100 px-1 rounded">user_documents</code></li>
              <li>3. Create storage bucket with ID: <code className="bg-yellow-100 px-1 rounded">documents</code></li>
              <li>4. Configure your environment variables in <code className="bg-yellow-100 px-1 rounded">.env.local</code></li>
            </ol>
          </div>
          <button
            onClick={fetchDocuments}
            className="mt-4 text-blue-600 hover:text-blue-800 text-sm"
          >
            Try again after setup
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Your Documents</h2>
        <div className="text-center py-6">
          <ExclamationCircleIcon className="h-12 w-12 text-red-400 mx-auto mb-2" />
          <p className="text-gray-600">{error}</p>
          <button
            onClick={fetchDocuments}
            className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Your Documents</h2>
          <button
            onClick={fetchDocuments}
            className="p-1 text-gray-500 hover:text-gray-700"
            title="Refresh documents"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
        </div>
        
        {/* User info display */}
        {user && (
          <div className="flex items-center space-x-2 mt-2">
            <UserIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">{user.fullName || user.email}</span>
          </div>
        )}
        
        <p className="text-sm text-gray-600 mt-1">
          {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
        </p>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {documents.length === 0 ? (
          <div className="p-6 text-center">
            <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">No documents uploaded yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Upload your first document to start building your knowledge base
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedDocuments.includes(doc.id) ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
                onClick={() => handleDocumentClick(doc.id)}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    {getStatusIcon(doc.status, doc.processingStage)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {doc.fileName}
                      </p>
                      {doc.fileSize && (
                        <span className="text-xs text-gray-500 ml-2">
                          {formatFileSize(doc.fileSize)}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-600">
                        {getStatusText(doc.status, doc.processingStage)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDate(doc.uploadedAt)}
                      </span>
                    </div>

                    {doc.wordCount && (
                      <p className="text-xs text-gray-500 mt-1">
                        ~{doc.wordCount.toLocaleString()} words processed
                      </p>
                    )}

                    {/* Enhanced processing progress bar */}
                    {(doc.status === 'processing' || doc.status === 'uploaded') && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              doc.status === 'processing' ? 'bg-blue-500' : 'bg-yellow-500'
                            }`}
                            style={{
                              width: `${getProcessingProgress(doc.status, doc.processingStage)}%`
                            }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>Pipeline: {doc.processingStage}</span>
                          <span>{getProcessingProgress(doc.status, doc.processingStage)}%</span>
                        </div>
                      </div>
                    )}

                    {/* Success indicator for completed documents */}
                    {doc.status === 'completed' && (
                      <div className="mt-2 flex items-center space-x-1">
                        <CheckCircleIcon className="h-3 w-3 text-green-500" />
                        <span className="text-xs text-green-600">
                          Ready for queries • Embeddings stored • Knowledge graph built
                        </span>
                      </div>
                    )}

                    {/* Error state */}
                    {doc.status === 'error' && (
                      <div className="mt-2 flex items-center space-x-1">
                        <ExclamationCircleIcon className="h-3 w-3 text-red-500" />
                        <span className="text-xs text-red-600">
                          Processing failed • Click to retry
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
