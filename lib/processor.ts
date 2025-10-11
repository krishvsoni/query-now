import { pipeline, getRedisClient, updateDocumentStatus } from '@/lib/redis';
import { getDocumentContent } from '@/lib/appwrite';
import { generateEmbedding, extractEntitiesAndRelationships, chunkText, summarizeDocument } from '@/lib/openai';
import { storeEmbedding } from '@/lib/pinecone';
import { createUserDocumentNode, createEntity, createRelationship } from '@/lib/neo4j';

export class DocumentProcessor {
  private isProcessing = false;

  async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    console.log('Starting document processing pipeline...');
    
    // Start processing different stages concurrently
    Promise.all([
      this.processIngestionQueue(),
      this.processParsingQueue(),
      this.processOntologyQueue(),
      this.processEmbeddingQueue(),
      this.processGraphQueue()
    ]).catch(console.error);
  }

  async processIngestionQueue() {
    await pipeline.init();
    const redis = await getRedisClient();
    
    while (this.isProcessing) {
      try {
        const messages = await redis.xRead([{ key: 'doc:ingestion', id: '$' }], { BLOCK: 1000 });
        
        if (messages && Array.isArray(messages)) {
          for (const message of messages as any[]) {
            if (message.messages && Array.isArray(message.messages)) {
              for (const entry of message.messages as any[]) {
                await this.handleIngestion(entry.message);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing ingestion queue:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async handleIngestion(job: any) {
    try {
      const { docId, userId, fileName, filePath } = job;
      
      // Download and parse document
      const fileId = filePath.split('/')[1];
      const content = await getDocumentContent(fileId);
      const text = content.toString('utf-8'); // Simple text extraction
      
      // Update status
      await updateDocumentStatus(docId, 'processing', 'parsing');
      
      // Move to parsing stage
      await pipeline.moveToNextStage(docId, 'parsing', {
        userId,
        fileName,
        text,
        summary: await summarizeDocument(text.slice(0, 3000)) // Summarize first part
      });
      
    } catch (error) {
      console.error('Error handling ingestion:', error);
    }
  }

  async processParsingQueue() {
    await pipeline.init();
    const redis = await getRedisClient();
    
    while (this.isProcessing) {
      try {
        const messages = await redis.xRead([{ key: 'doc:parsing', id: '$' }], { BLOCK: 1000 });
        
        if (messages && Array.isArray(messages)) {
          for (const message of messages as any[]) {
            if (message.messages && Array.isArray(message.messages)) {
              for (const entry of message.messages as any[]) {
                await this.handleParsing(entry.message);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing parsing queue:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async handleParsing(job: any) {
    try {
      const { docId, data } = job;
      const parsedData = JSON.parse(data);
      const { text, userId, fileName, summary } = parsedData;
      
      // Chunk the document
      const chunks = chunkText(text);
      
      // Update status
      await updateDocumentStatus(docId, 'processing', 'ontology');
      
      // Move to ontology generation
      await pipeline.moveToNextStage(docId, 'ontology', {
        userId,
        fileName,
        chunks,
        summary,
        fullText: text
      });
      
    } catch (error) {
      console.error('Error handling parsing:', error);
    }
  }

  async processOntologyQueue() {
    await pipeline.init();
    const redis = await getRedisClient();
    
    while (this.isProcessing) {
      try {
        const messages = await redis.xRead([{ key: 'doc:ontology', id: '$' }], { BLOCK: 1000 });
        
        if (messages && Array.isArray(messages)) {
          for (const message of messages as any[]) {
            if (message.messages && Array.isArray(message.messages)) {
              for (const entry of message.messages as any[]) {
                await this.handleOntology(entry.message);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing ontology queue:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async handleOntology(job: any) {
    try {
      const { docId, data } = job;
      const parsedData = JSON.parse(data);
      const { chunks, userId, fileName, summary, fullText } = parsedData;
      
      // Extract entities and relationships from each chunk
      const ontologyData = [];
      
      for (let i = 0; i < Math.min(chunks.length, 5); i++) { // Process first 5 chunks
        const chunk = chunks[i];
        if (chunk.length > 100) { // Only process meaningful chunks
          const extracted = await extractEntitiesAndRelationships(chunk);
          ontologyData.push({
            chunkIndex: i,
            ...extracted
          });
        }
      }
      
      // Update status
      await updateDocumentStatus(docId, 'processing', 'embedding');
      
      // Move to embedding generation
      await pipeline.moveToNextStage(docId, 'embedding', {
        userId,
        fileName,
        chunks,
        summary,
        ontologyData,
        fullText
      });
      
    } catch (error) {
      console.error('Error handling ontology:', error);
    }
  }

  async processEmbeddingQueue() {
    await pipeline.init();
    const redis = await getRedisClient();
    
    while (this.isProcessing) {
      try {
        const messages = await redis.xRead([{ key: 'doc:embedding', id: '$' }], { BLOCK: 1000 });
        
        if (messages && Array.isArray(messages)) {
          for (const message of messages as any[]) {
            if (message.messages && Array.isArray(message.messages)) {
              for (const entry of message.messages as any[]) {
                await this.handleEmbedding(entry.message);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing embedding queue:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async handleEmbedding(job: any) {
    try {
      const { docId, data } = job;
      const parsedData = JSON.parse(data);
      const { chunks, userId, fileName, summary, ontologyData } = parsedData;
      
      // Generate embeddings for chunks
      const embeddedChunks = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await generateEmbedding(chunk);
        
        // Store in Pinecone
        await storeEmbedding(
          `${docId}_chunk_${i}`,
          embedding,
          {
            userId,
            documentId: docId,
            fileName,
            content: chunk,
            chunk: i
          }
        );
        
        embeddedChunks.push({
          chunkIndex: i,
          content: chunk,
          embedding
        });
      }
      
      // Generate embedding for summary
      const summaryEmbedding = await generateEmbedding(summary);
      await storeEmbedding(
        `${docId}_summary`,
        summaryEmbedding,
        {
          userId,
          documentId: docId,
          fileName,
          content: summary,
          chunk: -1 // Summary marker
        }
      );
      
      // Update status
      await updateDocumentStatus(docId, 'processing', 'graph');
      
      // Move to graph storage
      await pipeline.moveToNextStage(docId, 'graph', {
        userId,
        fileName,
        summary,
        ontologyData,
        embeddedChunks,
        summaryEmbedding
      });
      
    } catch (error) {
      console.error('Error handling embedding:', error);
    }
  }

  async processGraphQueue() {
    await pipeline.init();
    const redis = await getRedisClient();
    
    while (this.isProcessing) {
      try {
        const messages = await redis.xRead([{ key: 'doc:graph', id: '$' }], { BLOCK: 1000 });
        
        if (messages && Array.isArray(messages)) {
          for (const message of messages as any[]) {
            if (message.messages && Array.isArray(message.messages)) {
              for (const entry of message.messages as any[]) {
                await this.handleGraph(entry.message);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing graph queue:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async handleGraph(job: any) {
    try {
      const { docId, data } = job;
      const parsedData = JSON.parse(data);
      const { userId, fileName, summary, ontologyData } = parsedData;
      
      // Create document node in Neo4j
      await createUserDocumentNode(userId, docId, fileName, { summary });
      
      // Process ontology data
      for (const chunk of ontologyData) {
        // Create entities
        for (const entity of chunk.entities || []) {
          await createEntity(
            docId,
            entity.id,
            entity.type,
            {
              name: entity.name,
              description: entity.description,
              ...entity.properties
            }
          );
        }
        
        // Create relationships
        for (const rel of chunk.relationships || []) {
          await createRelationship(
            rel.source,
            rel.target,
            rel.type,
            rel.properties
          );
        }
      }
      
      // Update final status
      await updateDocumentStatus(docId, 'completed', 'completed');
      
      console.log(`Document ${docId} processing completed`);
      
    } catch (error) {
      console.error('Error handling graph:', error);
    }
  }

  stop() {
    this.isProcessing = false;
  }
}

export const processor = new DocumentProcessor();