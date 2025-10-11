const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import { generateEmbedding, extractEntitiesAndRelationships, chunkText } from './openai';
import { storeEmbedding } from './pinecone';
import { createEntity, createRelationship, createUserDocumentNode } from './neo4j';
import { pipeline, updateDocumentStatus } from './redis';

export interface ProcessedChunk {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    chunkIndex: number;
    startChar: number;
    endChar: number;
  };
}

export interface ExtractedText {
  content: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    fileSize: number;
    extractedAt: string;
  };
}

export class DocumentProcessor {
  
  async parseDocument(buffer: Buffer, fileName: string, mimeType: string): Promise<ExtractedText> {
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    
    try {
      let content = '';
      let metadata: any = {
        fileSize: buffer.length,
        extractedAt: new Date().toISOString(),
        wordCount: 0
      };

      switch (fileExtension) {
        case 'pdf':
          const pdfData = await pdfParse(buffer);
          content = pdfData.text;
          metadata.pageCount = pdfData.numpages;
          break;
          
        case 'docx':
          const docxResult = await mammoth.extractRawText({ buffer });
          content = docxResult.value;
          break;
          
        case 'txt':
          content = buffer.toString('utf-8');
          break;
          
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      // Clean and normalize text
      content = this.cleanText(content);
      metadata.wordCount = content.split(/\s+/).length;

      return { content, metadata };
    } catch (error) {
      console.error('Error parsing document:', error);
      throw new Error(`Failed to parse ${fileExtension} file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private cleanText(text: string): string {
    // Remove excessive whitespace and normalize line breaks
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  async processDocument(
    documentId: string,
    userId: string,
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<void> {
    try {
      console.log(`Starting processing for document: ${documentId}`);
      
      // Update status to parsing
      await updateDocumentStatus(documentId, 'processing', 'parsing');

      // 1. Extract text from document
      const extracted = await this.parseDocument(fileBuffer, fileName, mimeType);
      console.log(`Extracted ${extracted.metadata.wordCount} words from ${fileName}`);

      // 2. Create document node in Neo4j
      await createUserDocumentNode(userId, documentId, fileName, extracted.metadata);
      
      // 3. Chunk the text for embeddings
      const chunks = chunkText(extracted.content, 1000, 200);
      console.log(`Created ${chunks.length} chunks for processing`);

      // Update status to embedding generation
      await updateDocumentStatus(documentId, 'processing', 'embedding');

      // 4. Process chunks in parallel (but limited batch size)
      const batchSize = 5;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchPromises = batch.map((chunk, index) => 
          this.processChunk(chunk, i + index, documentId, userId, fileName)
        );
        
        await Promise.all(batchPromises);
        console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
      }

      // Update status to ontology extraction
      await updateDocumentStatus(documentId, 'processing', 'ontology');

      // 5. Extract entities and relationships from full text
      await this.extractOntology(extracted.content, documentId, userId);

      // 6. Complete processing
      await updateDocumentStatus(documentId, 'completed', 'completed');
      console.log(`Document processing completed for: ${documentId}`);

    } catch (error) {
      console.error(`Error processing document ${documentId}:`, error);
      await updateDocumentStatus(documentId, 'error', 'failed');
      throw error;
    }
  }

  private async processChunk(
    chunk: string,
    chunkIndex: number,
    documentId: string,
    userId: string,
    fileName: string
  ): Promise<void> {
    try {
      // Generate embedding for chunk
      const embedding = await generateEmbedding(chunk);
      
      // Create unique ID for this chunk
      const chunkId = `${documentId}_chunk_${chunkIndex}`;
      
      // Store in Pinecone
      await storeEmbedding(chunkId, embedding, {
        userId,
        documentId,
        fileName,
        content: chunk,
        chunk: chunkIndex
      });

      // Cache embedding in Redis for potential reuse
      await pipeline.cacheEmbedding(`embedding:${chunkId}`, embedding, 3600);
      
    } catch (error) {
      console.error(`Error processing chunk ${chunkIndex}:`, error);
      throw error;
    }
  }

  private async extractOntology(content: string, documentId: string, userId: string): Promise<void> {
    try {
      // Split content if it's too long for the LLM
      const maxLength = 15000; // Safe limit for GPT-4
      const sections = content.length > maxLength 
        ? this.splitIntoSections(content, maxLength)
        : [content];

      const allEntities: any[] = [];
      const allRelationships: any[] = [];

      // Process each section
      for (const [index, section] of sections.entries()) {
        console.log(`Extracting ontology from section ${index + 1}/${sections.length}`);
        
        const result = await extractEntitiesAndRelationships(section);
        
        if (result.entities) {
          allEntities.push(...result.entities);
        }
        
        if (result.relationships) {
          allRelationships.push(...result.relationships);
        }
      }

      // Deduplicate entities based on name similarity
      const deduplicatedEntities = this.deduplicateEntities(allEntities);
      
      // Store entities in Neo4j
      for (const entity of deduplicatedEntities) {
        await createEntity(
          documentId,
          entity.id,
          entity.type,
          {
            name: entity.name,
            description: entity.description,
            ...entity.properties
          }
        );
      }

      // Store relationships in Neo4j
      for (const relationship of allRelationships) {
        // Only create relationship if both entities exist
        const sourceExists = deduplicatedEntities.find(e => e.id === relationship.source);
        const targetExists = deduplicatedEntities.find(e => e.id === relationship.target);
        
        if (sourceExists && targetExists) {
          await createRelationship(
            relationship.source,
            relationship.target,
            relationship.type,
            relationship.properties || {}
          );
        }
      }

      console.log(`Stored ${deduplicatedEntities.length} entities and ${allRelationships.length} relationships`);
      
    } catch (error) {
      console.error('Error extracting ontology:', error);
      throw error;
    }
  }

  private splitIntoSections(content: string, maxLength: number): string[] {
    const sections: string[] = [];
    const paragraphs = content.split('\n\n');
    let currentSection = '';

    for (const paragraph of paragraphs) {
      if (currentSection.length + paragraph.length > maxLength) {
        if (currentSection) {
          sections.push(currentSection.trim());
          currentSection = paragraph;
        } else {
          // Paragraph itself is too long, split it
          sections.push(paragraph.substring(0, maxLength));
        }
      } else {
        currentSection += (currentSection ? '\n\n' : '') + paragraph;
      }
    }

    if (currentSection) {
      sections.push(currentSection.trim());
    }

    return sections;
  }

  private deduplicateEntities(entities: any[]): any[] {
    const deduplicated: any[] = [];
    const nameMap = new Map<string, any>();

    for (const entity of entities) {
      const normalizedName = entity.name.toLowerCase().trim();
      
      if (nameMap.has(normalizedName)) {
        // Merge properties from duplicate entity
        const existing = nameMap.get(normalizedName);
        existing.properties = { ...existing.properties, ...entity.properties };
        
        if (!existing.description && entity.description) {
          existing.description = entity.description;
        }
      } else {
        nameMap.set(normalizedName, { ...entity });
        deduplicated.push(entity);
      }
    }

    return deduplicated;
  }

  async getDocumentProcessingStatus(documentId: string): Promise<{
    status: string;
    stage: string;
    progress?: number;
  }> {
    try {
      // This would typically query the database for current status
      // For now, we'll implement a basic version
      return {
        status: 'completed',
        stage: 'completed',
        progress: 100
      };
    } catch (error) {
      console.error('Error getting processing status:', error);
      return {
        status: 'error',
        stage: 'failed'
      };
    }
  }
}

export const documentProcessor = new DocumentProcessor();
