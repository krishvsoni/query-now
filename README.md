# Query Now - Agentic Graph RAG as a Service

An extensible, production-grade platform that unifies knowledge from multiple sources into an intelligent retrieval system. Transform unstructured documents into queryable knowledge graphs with autonomous AI agents that dynamically orchestrate vector search, graph traversal, and logical filtering for optimal information retrieval.

---

**Continuous Monitoring For Safe Commits**: This project is monitored and tested by [Oggy](https://github.com/krishvsoni/oggy) for code quality and safe commits built by me.

---

## Architecture

### 1. **Document-to-Graph Pipeline**
```
Document Upload (PDF/DOCX/TXT)
    ↓
Text Extraction & Chunking
    ↓
LLM-Powered Ontology Generation
    ↓
OpenAI Embeddings
    ↓
Parallel Processing:
    ├─→ Pinecone Vector Store (semantic search)
    ├─→ Neo4j Knowledge Graph (entity relationships)
    └─→ Redis Cache (query optimization)
```

### 2. **Agentic Retrieval System**
```
Natural Language Query
    ↓
Query Analysis Agent
    ↓
Dynamic Strategy Selection:
    ├─→ Vector Similarity Search (OpenAI embeddings)
    ├─→ Graph Traversal (Neo4j Cypher)
    └─→ Logical Filtering (metadata/attributes)
    ↓
Multi-Step Reasoning & Iterative Refinement
    ↓
Response Graph Generation
    ↓
Streaming Response with Reasoning Chain
```

### 3. **Core Components**

**Embedding Layer**
- **Model**: OpenAI `text-embedding-3-small`
- **Dimensions**: 3072
- **Usage**: Documents, entities, relationships, queries

**Vector Store** (Pinecone)
- Semantic similarity search
- Hybrid search capabilities
- Metadata filtering

**Graph Database** (Neo4j)
- Entity resolution & deduplication
- Relationship extraction
- Ontology management
- Cypher query generation

**Cache Layer** (Redis)
- Query result caching
- Session management
- Performance optimization

**AI Orchestration**
- GPT-4 for ontology generation
- GPT-4 for entity extraction
- Autonomous agent routing
- Multi-tool reasoning

### 4. **Key Features**

 **Automatic Ontology Generation** - LLM extracts entities, relationships, hierarchies  
 **Entity Resolution & Deduplication** - Intelligent merging of similar entities  
 **OpenAI Embeddings** - 1536-dimensional vectors for all graph elements  
 **Agentic Retrieval** - Dynamic tool selection across vector/graph/filter methods  
 **Visual Knowledge Graphs** - Interactive graph visualization  
 **Streaming Responses** - Real-time reasoning chains  
 **Multi-Step Reasoning** - Iterative query refinement  

---

## Tech Stack

**Frontend**: Next.js 15, TypeScript, Tailwind CSS  
**Auth**: Kinde  
**Storage**: Appwrite  
**AI**: OpenAI GPT-4 (embeddings + generation)  
**Vector DB**: Pinecone  
**Graph DB**: Neo4j  
**Cache**: Redis  

---

## Quick Start

```bash
git clone <repo-url>
cd query-now
pnpm install
pnpm run dev
```

Configure `.env.local` with API keys for OpenAI, Pinecone, Neo4j, Redis, Appwrite, and Kinde.
