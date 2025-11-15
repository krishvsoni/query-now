'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  RefreshCw,
  Trash2,
  User
} from 'lucide-react';

interface Document {
  id: string;
  fileName: string;
  status: string;
  processingStage: string;
  uploadedAt: string;
  fileId?: string;
  fileSize?: number;
  wordCount?: number;
  progress?: number;
  message?: string;
  processedChunks?: number;
  totalChunks?: number;
  entitiesCreated?: number;
  relationshipsCreated?: number;
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
  const [cleaningUp, setCleaningUp] = useState(false);

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
      if (errorMessage.includes('Database') || errorMessage.includes('setup')) {
        setSetupRequired(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const cleanupStalledDocuments = async () => {
    try {
      setCleaningUp(true);
      const response = await fetch('/api/documents?cleanup=true');
      
      if (!response.ok) {
        throw new Error('Failed to cleanup documents');
      }
      
      const data = await response.json();
      
      if (data.cleaned > 0) {
        // Show success and refresh
        await fetchDocuments();
      }
    } catch (err) {
      console.error('Error cleaning up documents:', err);
    } finally {
      setCleaningUp(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [refreshTrigger]);

  // Auto-refresh only when documents are actively processing
  useEffect(() => {
    const hasProcessingDocs = documents.some(
      doc => doc.status === 'processing' || doc.status === 'uploaded'
    );
    
    if (hasProcessingDocs) {
      const interval = setInterval(() => {
        fetch('/api/documents')
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setDocuments(data.documents || []);
            }
          })
          .catch(err => console.error('Auto-refresh error:', err));
      }, 3000); // Check every 3 seconds
      
      return () => clearInterval(interval);
    }
  }, [documents.some(d => d.status === 'processing' || d.status === 'uploaded')]);

  const getStatusIcon = (status: string, stage: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-primary" />;
      case 'processing':
        return <RefreshCw className="w-5 h-5 text-accent animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Clock className="w-5 h-5 text-primary/60" />;
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
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md p-6">
        <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Your Documents
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-primary/10 rounded-xl"></div>
                <div className="flex-1">
                  <div className="h-4 bg-primary/10 rounded w-1/2"></div>
                  <div className="h-3 bg-primary/10 rounded w-1/4 mt-1"></div>
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
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md p-6">
        <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Your Documents
        </h2>
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-primary" />
          </div>
          <p className="text-foreground font-semibold mb-2">Database Setup Required</p>
          <p className="text-muted-foreground mb-4">
            To use document upload, you need to set up Appwrite database and collections.
          </p>
          <div className="rounded-xl border border-primary/20 bg-primary/10 backdrop-blur-sm p-4 text-left">
            <h3 className="font-semibold text-foreground mb-2">Setup Instructions:</h3>
            <ol className="text-sm text-muted-foreground space-y-1">
              <li>1. Create database with ID: <code className="bg-primary/20 px-2 py-0.5 rounded text-foreground">main</code></li>
              <li>2. Create collection with ID: <code className="bg-primary/20 px-2 py-0.5 rounded text-foreground">user_documents</code></li>
              <li>3. Create storage bucket with ID: <code className="bg-primary/20 px-2 py-0.5 rounded text-foreground">documents</code></li>
              <li>4. Configure your environment variables in <code className="bg-primary/20 px-2 py-0.5 rounded text-foreground">.env.local</code></li>
            </ol>
          </div>
          <button
            onClick={fetchDocuments}
            className="mt-4 text-primary hover:text-accent text-sm font-semibold transition-colors"
          >
            Try again after setup
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md p-6">
        <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Your Documents
        </h2>
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-destructive/40 to-destructive/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={fetchDocuments}
            className="mt-2 text-primary hover:text-accent text-sm font-semibold transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card/60 to-card/20 backdrop-blur-md overflow-hidden">
      <div className="px-6 py-4 border-b border-primary/20">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Your Documents
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={cleanupStalledDocuments}
              disabled={cleaningUp}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              title="Clean up stalled documents"
            >
              {cleaningUp ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={fetchDocuments}
              className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors"
              title="Refresh documents"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        {user && (
          <div className="flex items-center space-x-2 mt-2">
            <User className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground font-medium">{user.fullName || user.email}</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
        </p>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {documents.length === 0 ? (
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <p className="text-foreground font-semibold">No documents uploaded yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your first document to start building your knowledge base
            </p>
          </div>
        ) : (
          <div className="divide-y divide-primary/10">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`p-4 hover:bg-primary/5 cursor-pointer transition-all ${
                  selectedDocuments.includes(doc.id) ? 'bg-primary/10 border-l-4 border-l-primary shadow-inner' : ''
                }`}
                onClick={() => handleDocumentClick(doc.id)}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    {getStatusIcon(doc.status, doc.processingStage)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {doc.fileName}
                      </p>
                      {doc.fileSize && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatFileSize(doc.fileSize)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        {getStatusText(doc.status, doc.processingStage)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(doc.uploadedAt)}
                      </span>
                    </div>
                    {doc.wordCount && (
                      <p className="text-xs text-muted-foreground mt-1">
                         {doc.wordCount.toLocaleString()} words processed
                      </p>
                    )}
                    {(doc.status === 'processing' || doc.status === 'uploaded') && (
                      <div className="mt-2 space-y-2">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              doc.status === 'processing' ? 'bg-gradient-to-r from-primary to-accent animate-pulse' : 'bg-primary/60'
                            }`}
                            style={{
                              width: `${doc.progress ?? getProcessingProgress(doc.status, doc.processingStage)}%`
                            }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span className="font-medium">{doc.message || `Pipeline: ${doc.processingStage}`}</span>
                          <span className="font-semibold text-primary">{doc.progress ?? getProcessingProgress(doc.status, doc.processingStage)}%</span>
                        </div>
                        
                        {/* Detailed progress information */}
                        {(doc.processedChunks !== undefined || doc.entitiesCreated !== undefined || doc.relationshipsCreated !== undefined) && (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            {doc.processedChunks !== undefined && doc.totalChunks !== undefined && (
                              <div className="rounded-lg bg-primary/10 px-2 py-1">
                                <div className="text-[10px] text-muted-foreground font-medium">Chunks</div>
                                <div className="text-xs text-foreground font-bold">{doc.processedChunks}/{doc.totalChunks}</div>
                              </div>
                            )}
                            {doc.entitiesCreated !== undefined && (
                              <div className="rounded-lg bg-accent/10 px-2 py-1">
                                <div className="text-[10px] text-muted-foreground font-medium">Entities</div>
                                <div className="text-xs text-foreground font-bold">{doc.entitiesCreated}</div>
                              </div>
                            )}
                            {doc.relationshipsCreated !== undefined && (
                              <div className="rounded-lg bg-primary/10 px-2 py-1">
                                <div className="text-[10px] text-muted-foreground font-medium">Relations</div>
                                <div className="text-xs text-foreground font-bold">{doc.relationshipsCreated}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {doc.status === 'completed' && (
                      <div className="mt-2 flex items-center space-x-1">
                        <CheckCircle className="w-3 h-3 text-primary" />
                        <span className="text-xs text-primary font-semibold">
                          Ready for queries 
                        </span>
                      </div>
                    )}
                    {doc.status === 'error' && (
                      <div className="mt-2 flex items-center space-x-1">
                        <AlertCircle className="w-3 h-3 text-destructive" />
                        <span className="text-xs text-destructive font-semibold">
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
