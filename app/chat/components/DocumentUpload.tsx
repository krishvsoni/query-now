'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, CheckCircle } from 'lucide-react';

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

      if (result.success && result.document) {
        setSuccess(result.message || `Successfully uploaded "${file.name}". Processing pipeline started.`);
        onUploadComplete?.(result.document, result.user);
      } else {
        throw new Error(result.error || 'Upload completed but response was invalid');
      }

    } catch (error) {
      let errorMessage = 'Upload failed';
      if (error instanceof Error) {
        if (error.message.includes('Authentication required') || error.message.includes('Unauthorized')) {
          errorMessage = 'Please log in to upload documents';
        } else if (error.message.includes('Storage service error') || error.message.includes('Appwrite')) {
          errorMessage = 'Storage service unavailable. Please try again later.';
        } else if (error.message.includes('Queue service error') || error.message.includes('Redis')) {
          errorMessage = 'Processing queue unavailable. Please try again later.';
        } else if (error.message.includes('Unsupported file type')) {
          errorMessage = 'Unsupported file type. Please upload PDF, DOCX, or TXT files.';
        } else if (error.message.includes('File type not supported') || error.message.includes('storage_file_type_unsupported')) {
          errorMessage = 'File extension not allowed by storage service. Please try renaming the file or contact administrator.';
        } else {
          errorMessage = error.message;
        }
      }

      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete, onUploadStart]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    onDragEnter: () => {
      setError(null);
      setSuccess(null);
    },
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    disabled: uploading,
    onDropRejected: (rejectedFiles) => {
      const rejection = rejectedFiles[0];
      if (rejection?.errors[0]?.code === 'file-invalid-type') {
        setError('Unsupported file type. Please upload PDF, DOCX, or TXT files.');
      } else {
        setError('File rejected. Please check file type.');
      }
    }
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${
            isDragActive 
            ? 'border-primary bg-primary/10 backdrop-blur-sm' 
            : uploading 
              ? 'border-primary/30 bg-card/50 cursor-not-allowed' 
              : 'border-primary/30 hover:border-primary bg-gradient-to-br from-card/40 to-card/20 hover:from-card/60 hover:to-card/40 backdrop-blur-sm'
          }
        `}
      >
        <input {...getInputProps()} />
        
        {uploading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-primary border-t-transparent mb-3"></div>
            <p className="text-sm text-foreground font-semibold">Uploading...</p>
            <p className="text-xs text-muted-foreground mt-1">This may take a few moments</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center mb-3">
              <Upload className="w-7 h-7 text-primary" />
            </div>
            {isDragActive ? (
              <p className="text-sm text-primary font-semibold">Drop your document here...</p>
            ) : (
              <div>
                <p className="text-sm text-foreground mb-1">
                  Drag & drop a document, or <span className="text-primary font-semibold">browse</span>
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  PDF, DOCX, TXT (no size limit)
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-xl border border-destructive/30 bg-destructive/10 backdrop-blur-sm flex items-start">
          <X className="w-5 h-5 text-destructive mr-2 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-3 p-3 rounded-xl border border-primary/30 bg-primary/10 backdrop-blur-sm flex items-start">
          <CheckCircle className="w-5 h-5 text-primary mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <p className="font-semibold">{success}</p>
            <p className="text-xs text-muted-foreground mt-1">
              You can now ask questions about this document in the chat!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
