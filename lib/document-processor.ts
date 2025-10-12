import mammoth from 'mammoth';
import { generateEmbedding, extractEntitiesAndRelationships, chunkText } from './openai';
import { storeEmbedding } from './pinecone';
import { createEntity, createRelationship, createUserDocumentNode } from './neo4j';
import { pipeline, updateDocumentStatus } from './redis';
import Tesseract from 'tesseract.js';
import { PDFDocument } from 'pdf-lib';

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
  private async extractTextFromPDFWithOCR(buffer: Buffer): Promise<{ content: string; pageCount: number }> {
    try {
      console.log('Starting PDF OCR extraction with Tesseract...');
      
      // Load PDF with pdf-lib to get page count
      const pdfDoc = await PDFDocument.load(buffer);
      const pageCount = pdfDoc.getPageCount();
      console.log(`PDF has ${pageCount} pages`);
      
      let allText = '';
      const maxPages = Math.min(pageCount, 100); // Limit to 100 pages to avoid timeout
      
      // Process each page with OCR
      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        try {
          console.log(`Processing page ${pageNum + 1}/${maxPages} with OCR...`);
          
          // Extract single page as new PDF
          const singlePagePdf = await PDFDocument.create();
          const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [pageNum]);
          singlePagePdf.addPage(copiedPage);
          
          // Save to buffer
          const pdfBytes = await singlePagePdf.save();
          
          // Perform OCR on the PDF page
          const { data: { text } } = await Tesseract.recognize(
            Buffer.from(pdfBytes),
            'eng',
            {
              logger: (m) => {
                if (m.status === 'recognizing text') {
                  const progress = Math.round(m.progress * 100);
                  if (progress % 50 === 0 && progress > 0) {
                    console.log(`  Page ${pageNum + 1} OCR progress: ${progress}%`);
                  }
                }
              }
            }
          );
          
          allText += text + '\n\n';
          
        } catch (pageError) {
          console.warn(`Error processing page ${pageNum + 1}:`, pageError);
          // Continue with next page
        }
      }
      
      if (allText.trim().length === 0) {
        throw new Error('No text could be extracted from PDF using OCR');
      }
      
      console.log(`Successfully extracted ${allText.length} characters from ${maxPages} pages using OCR`);
      
      return {
        content: allText.trim(),
        pageCount: maxPages
      };
    } catch (error) {
      console.error('PDF OCR extraction error:', error);
      throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async parseDocument(buffer: Buffer, fileName: string, mimeType: string): Promise<ExtractedText> {
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    try {
      let content = '';
      let metadata: any = {
        fileSize: buffer.length,
        extractedAt: new Date().toISOString(),
        wordCount: 0
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
          console.log('Starting PDF text extraction with OCR...');
          const result = await this.extractTextFromPDFWithOCR(buffer);
          content = result.content;
          metadata.pageCount = result.pageCount;
          console.log(`Extracted ${content.length} characters from ${result.pageCount} pages`);
          
          if (!content || content.trim().length === 0) {
            throw new Error('PDF appears to be empty or contains no extractable text');
          }
        } catch (pdfError) {
          console.error('PDF extraction error:', pdfError);
          throw new Error(`Failed to extract text from PDF: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`);
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
          console.error('DOCX parsing error:', docxError);
          throw new Error(`Failed to parse DOCX: ${docxError instanceof Error ? docxError.message : 'Unknown error'}`);
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
          console.error('Text parsing error:', textError);
          throw new Error(`Failed to parse text file: ${textError instanceof Error ? textError.message : 'Unknown error'}`);
        }
      } else {
        try {
          content = buffer.toString('utf-8');
          metadata.fileType = 'unknown';
          metadata.language = fileExtension;
          console.warn(`Unknown file type .${fileExtension}, attempting to parse as text`);
        } catch {
          throw new Error(`Unsupported file type: ${fileExtension}. Supported types: PDF, DOCX, TXT, and code files (JS, TS, PY, etc.)`);
        }
      }
      if (!content || content.trim().length === 0) {
        throw new Error('No text content could be extracted from the file');
      }
      content = this.cleanText(content);
      metadata.wordCount = content.split(/\s+/).length;
      return { content, metadata };
    } catch (error) {
      console.error('Error parsing document:', error);
      throw new Error(`Failed to parse ${fileExtension} file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private cleanText(text: string): string {
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
      await updateDocumentStatus(documentId, 'processing', 'parsing');
      const extracted = await this.parseDocument(fileBuffer, fileName, mimeType);
      console.log(`Extracted ${extracted.metadata.wordCount} words from ${fileName}`);
      await createUserDocumentNode(userId, documentId, fileName, extracted.metadata);
      const chunks = chunkText(extracted.content, 1000, 200);
      console.log(`Created ${chunks.length} chunks for processing`);
      await updateDocumentStatus(documentId, 'processing', 'embedding');
      const batchSize = 5;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchPromises = batch.map((chunk, index) => 
          this.processChunk(chunk, i + index, documentId, userId, fileName)
        );
        await Promise.all(batchPromises);
        console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
      }
      await updateDocumentStatus(documentId, 'processing', 'ontology');
      await this.extractOntology(extracted.content, documentId, userId);
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
      const embedding = await generateEmbedding(chunk);
      const chunkId = `${documentId}_chunk_${chunkIndex}`;
      await storeEmbedding(chunkId, embedding, {
        userId,
        documentId,
        fileName,
        content: chunk,
        chunkIndex,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Error processing chunk ${chunkIndex}:`, error);
      throw error;
    }
  }

  private async extractOntology(content: string, documentId: string, userId: string): Promise<void> {
    try {
      console.log('Extracting entities and relationships...');
      const maxContentLength = 10000;
      const contentSample = content.length > maxContentLength 
        ? content.substring(0, maxContentLength) 
        : content;
      const ontology = await extractEntitiesAndRelationships(contentSample);
      console.log(`Extracted ${ontology.entities.length} entities and ${ontology.relationships.length} relationships`);
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
          console.error(`Error creating entity ${entity.name}:`, entityError);
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
          console.error(`Error creating relationship ${relationship.from} -> ${relationship.to}:`, relError);
        }
      }
    } catch (error) {
      console.error('Error extracting ontology:', error);
      throw error;
    }
  }
}

export const documentProcessor = new DocumentProcessor();
