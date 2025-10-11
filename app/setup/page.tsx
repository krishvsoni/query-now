'use client';

import React from 'react';
import { 
  ServerIcon, 
  DatabaseIcon, 
  CloudIcon, 
  KeyIcon,
  CheckCircleIcon 
} from '@heroicons/react/24/outline';

export default function SetupGuide() {
  const setupSteps = [
    {
      title: "Environment Variables",
      icon: KeyIcon,
      description: "Copy .env.example to .env.local and fill in your credentials",
      requirements: [
        "KINDE_CLIENT_ID, KINDE_CLIENT_SECRET, KINDE_ISSUER_URL",
        "APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY", 
        "OPENAI_API_KEY",
        "PINECONE_API_KEY, PINECONE_INDEX_NAME",
        "NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD",
        "REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD"
      ]
    },
    {
      title: "Appwrite Setup", 
      icon: CloudIcon,
      description: "Create database and storage in Appwrite console",
      requirements: [
        "Create database with ID: 'main'",
        "Create collection 'user_documents' with attributes:",
        "  - fileId (string, required)",
        "  - fileName (string, required)", 
        "  - userId (string, required)",
        "  - uploadedAt (string, required)",
        "  - status (string, required)",
        "  - processingStage (string, required)",
        "Create storage bucket with ID: 'documents'"
      ]
    },
    {
      title: "Pinecone Setup",
      icon: DatabaseIcon,
      description: "Create vector database index",
      requirements: [
        "Create index with 1536 dimensions (OpenAI embeddings)",
        "Use cosine similarity metric",
        "Note your index name for environment variables"
      ]
    },
    {
      title: "Neo4j Setup",
      icon: ServerIcon,
      description: "Set up graph database",
      requirements: [
        "Create Neo4j Aura instance or local installation",
        "Note connection URI and credentials",
        "Database will be automatically populated"
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Setup Guide</h1>
        <p className="text-gray-600">
          Complete these steps to enable the full AI document processing pipeline
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {setupSteps.map((step, index) => {
          const IconComponent = step.icon;
          return (
            <div key={index} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <IconComponent className="h-8 w-8 text-blue-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">{step.title}</h3>
                  <p className="text-sm text-gray-600">{step.description}</p>
                </div>
              </div>
              
              <ul className="space-y-2">
                {step.requirements.map((req, reqIndex) => (
                  <li key={reqIndex} className="flex items-start">
                    <CheckCircleIcon className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-2">Pipeline Overview</h3>
        <p className="text-blue-700 mb-4">
          Once set up, your documents will flow through this AI processing pipeline:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <div className="bg-white border border-blue-300 rounded px-3 py-2 text-center">
            <div className="font-medium text-blue-900">Upload</div>
            <div className="text-blue-600">Appwrite</div>
          </div>
          <div className="bg-white border border-blue-300 rounded px-3 py-2 text-center">
            <div className="font-medium text-blue-900">Parse</div>
            <div className="text-blue-600">Extract Text</div>
          </div>
          <div className="bg-white border border-blue-300 rounded px-3 py-2 text-center">
            <div className="font-medium text-blue-900">Embed</div>
            <div className="text-blue-600">OpenAI + Pinecone</div>
          </div>
          <div className="bg-white border border-blue-300 rounded px-3 py-2 text-center">
            <div className="font-medium text-blue-900">Graph</div>
            <div className="text-blue-600">Neo4j</div>
          </div>
          <div className="bg-white border border-blue-300 rounded px-3 py-2 text-center">
            <div className="font-medium text-blue-900">Cache</div>
            <div className="text-blue-600">Redis</div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <a 
          href="/chat" 
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Continue to Chat Interface
        </a>
      </div>
    </div>
  );
}