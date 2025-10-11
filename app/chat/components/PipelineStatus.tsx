'use client';

import React, { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  CloudArrowUpIcon, 
  CpuChipIcon, 
  CircleStackIcon,
  ShareIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface PipelineStatusProps {
  documentId?: string;
  status: string;
  stage: string;
}

export default function PipelineStatus({ documentId, status, stage }: PipelineStatusProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const pipelineSteps = [
    {
      id: 'upload',
      name: 'Upload to Appwrite',
      icon: CloudArrowUpIcon,
      description: 'Document stored in Appwrite storage',
      completed: ['processing', 'completed'].includes(status)
    },
    {
      id: 'parsing',
      name: 'Text Extraction',
      icon: CpuChipIcon,
      description: 'Extracting text content from document',
      completed: stage !== 'parsing' && ['processing', 'completed'].includes(status),
      active: stage === 'parsing'
    },
    {
      id: 'embedding',
      name: 'Generate Embeddings',
      icon: CpuChipIcon,
      description: 'Creating AI embeddings for semantic search',
      completed: !['parsing', 'embedding'].includes(stage) && ['processing', 'completed'].includes(status),
      active: stage === 'embedding'
    },
    {
      id: 'pinecone',
      name: 'Store in Pinecone',
      icon: CircleStackIcon,
      description: 'Indexing embeddings in vector database',
      completed: !['parsing', 'embedding', 'ontology'].includes(stage) && ['processing', 'completed'].includes(status),
      active: stage === 'embedding' // Happens with embedding stage
    },
    {
      id: 'ontology',
      name: 'Extract Entities',
      icon: ShareIcon,
      description: 'Building knowledge graph entities and relationships',
      completed: stage === 'completed' || (!['parsing', 'embedding', 'ontology'].includes(stage) && status === 'completed'),
      active: stage === 'ontology'
    },
    {
      id: 'neo4j',
      name: 'Store in Neo4j',
      icon: ShareIcon,
      description: 'Saving knowledge graph to Neo4j database',
      completed: stage === 'completed' || status === 'completed',
      active: stage === 'graph'
    },
    {
      id: 'redis',
      name: 'Cache in Redis',
      icon: CircleStackIcon,
      description: 'Caching processed data for fast retrieval',
      completed: status === 'completed',
      active: stage === 'graph'
    }
  ];

  const getStepIcon = (step: any) => {
    const IconComponent = step.icon;
    
    if (step.completed) {
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    } else if (step.active) {
      return <IconComponent className="h-5 w-5 text-blue-500 animate-pulse" />;
    } else {
      return <IconComponent className="h-5 w-5 text-gray-400" />;
    }
  };

  const getOverallProgress = () => {
    const completedSteps = pipelineSteps.filter(step => step.completed).length;
    return Math.round((completedSteps / pipelineSteps.length) * 100);
  };

  if (status === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
          <span className="text-sm font-medium text-red-800">Processing Failed</span>
        </div>
        <p className="text-xs text-red-600 mt-1">
          The document processing pipeline encountered an error
        </p>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-800">Processing Complete</span>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-green-600 hover:text-green-800"
          >
            {isExpanded ? 'Hide' : 'Show'} Pipeline
          </button>
        </div>
        <p className="text-xs text-green-600 mt-1">
          Document ready for AI-powered queries and knowledge graph exploration
        </p>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <CpuChipIcon className="h-5 w-5 text-blue-500 animate-pulse" />
          <span className="text-sm font-medium text-blue-800">Processing Pipeline</span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {isExpanded ? 'Hide' : 'Show'} Details
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-blue-600 mb-1">
          <span>Progress</span>
          <span>{getOverallProgress()}%</span>
        </div>
        <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${getOverallProgress()}%` }}
          ></div>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-2">
          {pipelineSteps.map((step) => (
            <div key={step.id} className="flex items-center space-x-3">
              {getStepIcon(step)}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${
                    step.completed ? 'text-green-700' : 
                    step.active ? 'text-blue-700' : 'text-gray-500'
                  }`}>
                    {step.name}
                  </span>
                </div>
                <p className={`text-xs ${
                  step.completed ? 'text-green-600' : 
                  step.active ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <p className="text-xs text-blue-600 mt-2">
        Current stage: {stage === 'parsing' ? 'Extracting text' : 
                        stage === 'embedding' ? 'Creating embeddings & storing in Pinecone' :
                        stage === 'ontology' ? 'Building knowledge graph' :
                        stage === 'graph' ? 'Storing in Neo4j & caching' : 'Processing...'}
      </p>
    </div>
  );
}