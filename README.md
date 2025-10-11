# Query Now - AI-Powered Document Intelligence

Upload documents and chat with your knowledge base using advanced AI processing pipeline.

## Features

- **Smart Document Upload**: PDF, DOCX, TXT file support
- **AI Processing Pipeline**: Automatic text extraction, embedding generation, and knowledge graph creation  
- **Semantic Search**: Powered by OpenAI embeddings and Pinecone vector database
- **Knowledge Graphs**: Entity and relationship extraction stored in Neo4j
- **Intelligent Caching**: Redis for fast query responses
- **Secure Authentication**: Kinde authentication

## Technology Stack

- **Frontend**: Next.js 15 with TypeScript, Tailwind CSS
- **Authentication**: Kinde
- **Storage**: Appwrite (files + metadata)
- **AI**: OpenAI GPT-4 for embeddings and entity extraction
- **Vector DB**: Pinecone for semantic search
- **Graph DB**: Neo4j for knowledge graphs
- **Cache**: Redis for performance optimization

## Quick Setup

1. **Clone and Install**
   ```bash
   git clone <your-repo>
   cd query-now
   pnpm install
   ```

2. **Environment Variables**
   ```bash
   cp env.example .env.local
   # Fill in your API keys and credentials
   ```

3. **Service Setup**
   
   **Appwrite**: 
   - Create database `main`
   - Create collection `user_documents` with fields:
     - fileId (string), fileName (string), userId (string)
     - uploadedAt (string), status (string), processingStage (string)
   - Create storage bucket `documents`
   
   **Pinecone**: Create index with 1536 dimensions, cosine similarity
   
   **Neo4j**: Create database instance (local or Aura)
   
   **Redis**: Set up Redis instance

4. **Run Development Server**
   ```bash
   pnpm run dev
   ```

## Usage

1. Sign in with Kinde authentication
2. Upload documents (PDF, DOCX, TXT)
3. Watch the AI processing pipeline:
   - Text extraction
   - Embedding generation → Pinecone
   - Entity extraction → Neo4j
   - Caching → Redis
4. Chat with your documents using intelligent search

## API Endpoints

- `GET /api/user/profile` - User details from Kinde
- `GET /api/documents` - User's uploaded documents
- `POST /api/documents` - Upload new document
- `POST /api/chat` - Chat with document knowledge base

## Troubleshooting

**Database not found error**: Visit `/setup` for detailed setup instructions.

**Processing failures**: Check your OpenAI, Pinecone, Neo4j, and Redis configurations.

## Development

Built with modern web technologies and AI services for scalable document intelligence.
