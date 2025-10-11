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
   Create `.env.local` file with the following variables:
   ```bash
   # Appwrite Configuration
   APPWRITE_PROJECT_ID=your_project_id
   APPWRITE_ENDPOINT=https://your-region.cloud.appwrite.io/v1
   APPWRITE_API_KEY=your_api_key
   APPWRITE_BUCKET_ID=documents-storage
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   
   # Pinecone
   PINECONE_API_KEY=your_pinecone_api_key
   
   # Neo4j
   NEO4J_URI=your_neo4j_uri
   NEO4J_USERNAME=your_username
   NEO4J_PASSWORD=your_password
   NEO4J_DATABASE=neo4j
   
   # Redis
   REDIS_HOST=your_redis_host
   REDIS_PORT=your_redis_port
   REDIS_USERNAME=your_redis_username
   REDIS_PASSWORD=your_redis_password
   
   # Kinde Authentication
   KINDE_CLIENT_ID=your_client_id
   KINDE_CLIENT_SECRET=your_client_secret
   KINDE_ISSUER_URL=your_issuer_url
   KINDE_SITE_URL=http://localhost:3000
   KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
   KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000/chat
   ```

3. **Initialize Appwrite Database & Storage**
   ```bash
   # This will automatically create the database, collection, and storage bucket
   curl -X POST http://localhost:3000/api/setup
   ```
   
   **Or manually in Appwrite Console:**
   - Create database with your project ID + '-db'
   - Create collection `user-documents` with fields:
     - fileId (string), fileName (string), userId (string)
     - uploadedAt (datetime), status (string), processingStage (string)
   - Create storage bucket `documents-storage`
   
   **Redis**: Set up Redis instance

4. **Run Development Server**
   ```bash
   pnpm run dev
   ```
   
   Access the application at `http://localhost:3000`

## What's Been Fixed

✅ **Appwrite Configuration**:
- Removed redundant `appwrite-storage.ts` file
- Consolidated all Appwrite functionality into single `appwrite.ts` file
- Added proper bucket ID management with environment variable
- Created programmatic bucket creation with proper permissions

✅ **Database Structure**:
- Fixed bucket ID to use dedicated `APPWRITE_BUCKET_ID` instead of project ID
- Added database operations for user document metadata
- Implemented proper document-to-storage mapping

✅ **API Routes**:
- Updated upload and document routes to use new database structure
- Fixed document ID references throughout the application
- Added proper error handling and metadata management

✅ **Environment Variables**:
- Added `APPWRITE_BUCKET_ID=documents-storage` to environment
- Simplified configuration using only necessary variables

✅ **Initialization**:
- Created `/api/setup` endpoint for easy database initialization
- Automated bucket and collection creation with proper permissions
- Added comprehensive error handling and logging

## Usage

1. **Upload Documents**: Go to `/chat` and upload PDF, DOCX, or TXT files
2. **Processing Pipeline**: Documents are automatically processed through:
   - Text extraction
   - Embedding generation (OpenAI)
   - Vector storage (Pinecone)
   - Entity extraction (Neo4j)
   - Caching (Redis)
3. **Chat Interface**: Ask questions about your uploaded documents
4. **Semantic Search**: Get contextually relevant answers from your knowledge base

## Architecture

```
User Upload → Appwrite Storage → Processing Pipeline → AI Services
                     ↓                    ↓
              Document Metadata → Embeddings → Pinecone Vector DB
                                     ↓
                              Knowledge Graph → Neo4j
                                     ↓
                               Query Cache → Redis
```
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
