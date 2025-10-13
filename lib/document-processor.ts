import pdf from 'pdf-parse-fixed';
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
  private async extractTextFromPDF(buffer: Buffer): Promise<{ content: string; pageCount: number }> {
    try {
      const data = await pdf(buffer);
      const content = data.text.trim();
      const pageCount = data.numpages || 0;
      return { content, pageCount };
    } catch (error) {
      throw new Error(
        `Failed to extract text from PDF: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async parseDocument(buffer: Buffer, fileName: string, mimeType: string): Promise<ExtractedText> {
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    try {
      let content = '';
      let metadata: any = {
        fileSize: buffer.length,
        extractedAt: new Date().toISOString(),
        wordCount: 0,
      };

      const codeExtensions = [
        'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'hpp',
        'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'r',
        'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'html', 'css',
        'scss', 'sass', 'less', 'xml', 'json', 'yaml', 'yml', 'toml',
        'ini', 'conf', 'config', 'md', 'markdown', 'rst', 'tex'
      ];

      const textExtensions = [
        'txt', 'log', 'csv', 'tsv', 'rtf', ...codeExtensions
      ];

      if (fileExtension === 'pdf') {
        try {
          const result = await this.extractTextFromPDF(buffer);
          content = result.content;
          metadata.pageCount = result.pageCount;
          if (!content || content.trim().length === 0) {
            throw new Error('PDF appears to be empty or contains no extractable text');
          }
        } catch (pdfError) {
          throw new Error(
            `Failed to extract text from PDF: ${
              pdfError instanceof Error ? pdfError.message : 'Unknown error'
            }`
          );
        }
      } else if (fileExtension === 'docx') {
        try {
          const docxResult = await mammoth.extractRawText({ buffer });
          content = docxResult.value;
          metadata.messages = docxResult.messages;
          if (!content || content.trim().length === 0) {
            throw new Error('DOCX appears to be empty or could not be parsed');
          }
        } catch (docxError) {
          throw new Error(
            `Failed to parse DOCX: ${
              docxError instanceof Error ? docxError.message : 'Unknown error'
            }`
          );
        }
      } else if (textExtensions.includes(fileExtension || '')) {
        try {
          content = buffer.toString('utf-8');
          if (content.includes('\ufffd')) {
            try {
              content = buffer.toString('latin1');
            } catch {
              content = buffer.toString('ascii');
            }
          }
          metadata.fileType = codeExtensions.includes(fileExtension || '') ? 'code' : 'text';
          metadata.language = fileExtension;
        } catch (textError) {
          throw new Error(
            `Failed to parse text file: ${
              textError instanceof Error ? textError.message : 'Unknown error'
            }`
          );
        }
      } else {
        try {
          content = buffer.toString('utf-8');
          metadata.fileType = 'unknown';
          metadata.language = fileExtension;
        } catch {
          throw new Error(
            `Unsupported file type: ${fileExtension}. Supported types: PDF, DOCX, TXT, and code files (JS, TS, PY, etc.)`
          );
        }
      }

      if (!content || content.trim().length === 0) {
        throw new Error('No text content could be extracted from the file');
      }

      content = this.cleanText(content);
      metadata.wordCount = content.split(/\s+/).length;

      return { content, metadata };
    } catch (error) {
      throw new Error(
        `Failed to parse ${fileExtension} file: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private cleanText(text: string): string {
    // Remove emojis and most pictographic symbols
    const withoutEmojis = text.replace(
      /[\u{1F300}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{1FB00}-\u{1FBFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      ''
    );
    return withoutEmojis
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
      await updateDocumentStatus(documentId, 'processing', 'parsing');

      const extracted = await this.parseDocument(fileBuffer, fileName, mimeType);
      await createUserDocumentNode(userId, documentId, fileName, extracted.metadata);

      console.log(`Extracted ${extracted.metadata.wordCount.toLocaleString()} words, ${extracted.metadata.pageCount || 0} pages from ${fileName}`);
      console.log(`File size: ${(extracted.metadata.fileSize / 1024 / 1024).toFixed(2)} MB`);
      
      const chunks = chunkText(extracted.content, 1000, 200);
      console.log(`Split into ${chunks.length.toLocaleString()} chunks for processing`);

      await updateDocumentStatus(documentId, 'processing', 'embedding', {
        wordCount: extracted.metadata.wordCount,
        pageCount: extracted.metadata.pageCount || 0
      });

      const batchSize = chunks.length > 5000 ? 3 : chunks.length > 1000 ? 5 : 10;
      const delayBetweenBatches = chunks.length > 1000 ? 100 : 0;
      
      console.log(`Processing with batch size: ${batchSize}${delayBetweenBatches > 0 ? ` (${delayBetweenBatches}ms delay)` : ''}`);
      
      const startTime = Date.now();
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchPromises = batch.map((chunk, index) =>
          this.processChunk(chunk, i + index, documentId, userId, fileName)
        );
        await Promise.all(batchPromises);
        
        const progress = ((i + batch.length) / chunks.length * 100).toFixed(1);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Progress: ${i + batch.length}/${chunks.length} chunks (${progress}%) | Elapsed: ${elapsed}s`);
        
        if (delayBetweenBatches > 0 && i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Embedding complete: ${chunks.length} chunks in ${totalTime}s (${(chunks.length / parseFloat(totalTime)).toFixed(1)} chunks/s)`);

      await updateDocumentStatus(documentId, 'processing', 'ontology', {
        wordCount: extracted.metadata.wordCount,
        pageCount: extracted.metadata.pageCount || 0
      });
      
      await this.extractOntology(extracted.content, documentId, userId);

      await updateDocumentStatus(documentId, 'completed', 'completed', {
        wordCount: extracted.metadata.wordCount,
        pageCount: extracted.metadata.pageCount || 0
      });
      
      console.log(`Document ${documentId} processing completed successfully.`);
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
      const embedding = await generateEmbedding(chunk);
      const chunkId = `${documentId}_chunk_${chunkIndex}`;
      await storeEmbedding(chunkId, embedding, {
        userId,
        documentId,
        fileName,
        content: chunk,
        chunkIndex,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      throw error;
    }
  }

  private async extractOntology(
    content: string,
    documentId: string,
    userId: string
  ): Promise<void> {
    try {
      const maxContentLength = 50000;
      let contentSample = content;
      
      if (content.length > maxContentLength) {
        const sampleSize = Math.floor(maxContentLength / 3);
        const beginning = content.slice(0, sampleSize);
        const middle = content.slice(Math.floor(content.length / 2) - Math.floor(sampleSize / 2), Math.floor(content.length / 2) + Math.floor(sampleSize / 2));
        const end = content.slice(-sampleSize);
        contentSample = beginning + '\n...\n' + middle + '\n...\n' + end;
        console.log(`Ontology extraction: Sampled ${contentSample.length.toLocaleString()} chars from ${content.length.toLocaleString()} chars`);
      }

      const ontology = await extractEntitiesAndRelationships(contentSample);

      for (const entity of ontology.entities) {
        try {
          const embedding = await generateEmbedding(JSON.stringify(entity));
          await createEntity(
            documentId,
            `${documentId}_entity_${entity.name.replace(/\s+/g, '_')}`,
            entity.type,
            entity.properties || {},
            embedding
          );
        } catch (entityError) {
        }
      }

      for (const relationship of ontology.relationships) {
        try {
          await createRelationship(
            documentId,
            `${documentId}_entity_${relationship.from.replace(/\s+/g, '_')}`,
            `${documentId}_entity_${relationship.to.replace(/\s+/g, '_')}`,
            relationship.type,
            relationship.properties || {}
          );
        } catch (relError) {
        }
      }
    } catch (error) {
      throw error;
    }
  }
}

export const documentProcessor = new DocumentProcessor();
