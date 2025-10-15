# Agentic Graph RAG System - Core Architecture

## The Three Intelligence Layers

### 1️⃣ Intelligent Retrieval (`intelligent-retrieval.ts`)
**Job**: Smart multi-source information fetching

```
Query → Auto-detect Strategy → Execute Search → Deduplicate → Results
```

**Three Search Modes**:

**Semantic Search** (Vector-based)
- Converts query to 3072D vector (OpenAI `text-embedding-3-large`)
- Searches Pinecone for similar document chunks
- Fast: Pre-computed embeddings at upload time

**Graph Search** (Knowledge-based)
- Searches Neo4j for matching entities
- Traverses 2-hop relationships
- Returns structured knowledge graph data

**Hybrid Search** (Best of both)
- Runs both searches in parallel
- Weighted fusion (50/50 by default)
- Auto-selected based on query keywords

**Query Analysis Examples**:
- `"What is AI?"` → Semantic (keywords: "what is", "explain")
- `"How is AI related to ML?"` → Graph (keywords: "related to", "connected")
- `"Explain deep learning applications"` → Hybrid (both patterns)

---

### 2️⃣ Query Planner (`query-planner.ts`)
**Job**: Autonomous agent deciding WHAT tools to use

```
Query → GPT-4 Intent Analysis → Select Tools → Build Plan → Execute Parallel
```

**7 Specialized Tools**:
- `vector_search` - Semantic similarity in Pinecone
- `entity_search` - Find graph nodes in Neo4j
- `graph_traversal` - Multi-hop relationship exploration
- `relationship_path` - Shortest path between entities
- `cypher_query` - Custom Neo4j queries
- `semantic_similarity` - Compare concept embeddings
- `hybrid_search` - Combined vector + graph

**Smart Execution**:
- Parallel execution where possible
- Sequential for dependencies (e.g., entity_search → graph_traversal)
- Priority-based ordering

---

### 3️⃣ Reasoning Engine (`reasoning-engine.ts`)
**Job**: Multi-step reasoning with self-refinement

```
Query → Plan → Execute → Synthesize → Check Confidence → Refine → Answer
```

**Streaming Reasoning Steps**:
1. **Thought**: "Analyzing query..."
2. **Action**: "Created 3-step plan (complexity: moderate)"
3. **Tool Execution**: "vector_search found 5 chunks, entity_search found 2 entities"
4. **Observation**: "Found relationship: ML -[INCLUDES]-> Deep Learning"
5. **Synthesis**: GPT-4 combines all results into coherent answer
6. **Refinement**: If confidence < 85%, ask follow-up queries (max 3 iterations)
7. **Final Answer**: Markdown-formatted response with citations

**Self-Improvement Loop**:
```typescript
while (confidence < 0.85 && iterations < 3) {
  critique = "Answer lacks specific examples"
  additionalQuery = "Find AI healthcare case studies"
  newResults = await queryMore()
  answer = await resynthesize()
}
```

---

## Why So Fast?

**Redis Caching (3 places)**:
1. Query results: `search:${userId}:${query}` (30 min TTL)
2. Intent analysis: `query-intent:${query}` (1 hour)
3. Reasoning chains: `reasoning:${userId}:${query}` (1 hour)

**Parallel Processing**: Vector + Graph searches run simultaneously

**Pre-computed Embeddings**: All documents embedded at upload, not query time

**Indexed Databases**: Pinecone (vector index) + Neo4j (graph index)

---

## Why 3072 Dimensions?

**Model**: OpenAI `text-embedding-3-large`

**Benefits**:
- Higher semantic precision (captures nuances)
- Better similarity matching (accurate relevance scores)
- Richer context representation
- State-of-the-art performance

**Trade-off**: More storage, slightly slower search (worth it for accuracy)

---

## Complete Query Flow Example

```
User: "How does machine learning relate to deep learning?"

LAYER 1 - Intelligent Retrieval:
├─ Detects: "hybrid" strategy (semantic + relational keywords)
├─ Semantic: Pinecone returns 5 relevant chunks
└─ Graph: Neo4j finds ML/DL entities + [INCLUDES] relationship

LAYER 2 - Query Planner:
├─ GPT-4 analyzes intent: "relational query"
├─ Selects tools: [vector_search, entity_search, graph_traversal]
└─ Executes in parallel → 3 tool results

LAYER 3 - Reasoning Engine:
├─ Synthesizes: "Deep learning is a subset of ML that uses neural networks..."
├─ Confidence: 92%
└─ Streams answer with reasoning chain visible to user
```
