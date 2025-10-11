'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { CloudArrowUpIcon, DocumentIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface Document {
  id: string;
  fileName: string;
  status: string;
  processingStage: string;
  uploadedAt: string;
  fileId?: string;
}

interface UserInfo {
  id: string;
  email: string;
  fullName: string;
}

interface DocumentUploadProps {
  onUploadComplete?: (document: Document, user: UserInfo) => void;
  onUploadStart?: () => void;
}

export default function DocumentUpload({ onUploadComplete, onUploadStart }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    setError(null);
    setSuccess(null);
    onUploadStart?.();

    try {
      console.log('Starting upload for file:', file.name);
      
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      if (result.success) {
        console.log('Upload successful:', result);
        setSuccess(result.message || `Successfully uploaded "${file.name}". Processing pipeline started.`);
        onUploadComplete?.(result.document, result.user);
      } else {
        throw new Error(result.error || 'Upload completed but response was invalid');
      }

    } catch (error) {
      console.error('Upload error:', error);
      
      let errorMessage = 'Upload failed';
      if (error instanceof Error) {
        if (error.message.includes('Authentication required')) {
          errorMessage = 'Please log in to upload documents';
        } else if (error.message.includes('Storage service error')) {
          errorMessage = 'Storage service unavailable. Please try again later.';
        } else if (error.message.includes('Queue service error')) {
          errorMessage = 'Processing queue unavailable. Please try again later.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete, onUploadStart]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    disabled: uploading
  });

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
          ${isDragActive 
            ? 'border-blue-500 bg-blue-50' 
            : uploading 
              ? 'border-gray-300 bg-gray-50 cursor-not-allowed' 
              : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
          }
        `}
      >
        <input {...getInputProps()} />
        
        {uploading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-sm text-gray-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <CloudArrowUpIcon className="h-12 w-12 text-gray-400 mb-2" />
            {isDragActive ? (
              <p className="text-sm text-blue-600">Drop your document here...</p>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  Drag & drop a document, or <span className="text-blue-600 font-medium">browse</span>
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  PDF, DOCX, TXT files up to 10MB
                </p>
                <p className="text-xs text-gray-400">
                  Will be processed through: Appwrite → Embeddings → Pinecone → Neo4j → Redis
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md flex items-start">
          <XMarkIcon className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md flex items-start">
          <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-700">
            <p>{success}</p>
            <p className="text-xs text-green-600 mt-1">
              Document is being processed through the AI pipeline: parsing → embeddings → knowledge graph
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
