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
  /**
   * Extract text directly from PDF using pdf-parse-fixed
   */
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

  /**
   * Parse and extract text based on file type
   */
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

  /**
   * Clean up extracted text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  /**
   * Main document processing pipeline
   */
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

      const chunks = chunkText(extracted.content, 1000, 200);

      await updateDocumentStatus(documentId, 'processing', 'embedding');

      const batchSize = 5;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchPromises = batch.map((chunk, index) =>
          this.processChunk(chunk, i + index, documentId, userId, fileName)
        );
        await Promise.all(batchPromises);
      }

      await updateDocumentStatus(documentId, 'processing', 'ontology');
      await this.extractOntology(extracted.content, documentId, userId);

      await updateDocumentStatus(documentId, 'completed', 'completed');
    } catch (error) {
      await updateDocumentStatus(documentId, 'error', 'failed');
      throw error;
    }
  }

  /**
   * Process individual text chunks (generate + store embeddings)
   */
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

  /**
   * Extract entities and relationships from the text
   */
  private async extractOntology(
    content: string,
    documentId: string,
    userId: string
  ): Promise<void> {
    try {
      const maxContentLength = 10000;
      const contentSample =
        content.length > maxContentLength
          ? content.substring(0, maxContentLength)
          : content;

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
          // Skip failed entity creation
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
          // Skip failed relationship creation
        }
      }
    } catch (error) {
      throw error;
    }
  }
}

export const documentProcessor = new DocumentProcessor();
