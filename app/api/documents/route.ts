import { NextRequest, NextResponse } from 'next/server';
import { getUserDetails } from '@/lib/auth';
import { uploadDocument } from '@/lib/appwrite';
import { getUserDocuments, createUserDocumentNode } from '@/lib/neo4j';
import { documentProcessor } from '@/lib/document-processor';
import { DocumentPipeline, getDocumentStatus, cleanupStalledDocuments } from '@/lib/redis';
import { ID } from 'node-appwrite';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const userDetails = await getUserDetails(true);
    
    // Check for cleanup query parameter
    const { searchParams } = new URL(request.url);
    if (searchParams.get('cleanup') === 'true') {
      const stalledDocs = await cleanupStalledDocuments();
      return NextResponse.json({
        success: true,
        message: `Cleaned up ${stalledDocs.length} stalled documents`,
        stalledDocuments: stalledDocs
      });
    }

    let documents = [];
    try {
      const neo4jDocs = await getUserDocuments(userDetails.id);
      documents = neo4jDocs;
      console.log(`Retrieved ${documents.length} documents from Neo4j for user ${userDetails.id}`);
    } catch (error) {
      console.warn('Could not fetch user documents from Neo4j:', error);
      documents = [];
    }
    
    // Fetch detailed status from Redis for each document
    const documentsWithStatus = await Promise.all(
      documents.map(async (doc: any) => {
        const redisStatus = await getDocumentStatus(doc.id);
        return {
          id: doc.id,
          fileName: doc.fileName,
          status: redisStatus?.status || doc.status || 'unknown',
          processingStage: redisStatus?.stage || doc.processingStage || 'unknown',
          uploadedAt: doc.uploadedAt || doc.createdAt,
          fileId: doc.fileId,
          fileSize: doc.fileSize,
          wordCount: doc.wordCount,
          pageCount: doc.pageCount,
          // Add detailed progress information from Redis
          progress: redisStatus?.progress ? parseInt(redisStatus.progress) : undefined,
          message: redisStatus?.message,
          processedChunks: redisStatus?.processedChunks ? parseInt(redisStatus.processedChunks) : undefined,
          totalChunks: redisStatus?.totalChunks ? parseInt(redisStatus.totalChunks) : undefined,
          entitiesCreated: redisStatus?.entitiesCreated ? parseInt(redisStatus.entitiesCreated) : undefined,
          relationshipsCreated: redisStatus?.relationshipsCreated ? parseInt(redisStatus.relationshipsCreated) : undefined,
        };
      })
    );

    return NextResponse.json({
      success: true,
      user: {
        id: userDetails.id,
        email: userDetails.email,
        fullName: userDetails.fullName,
      },
      documents: documentsWithStatus,
      setupRequired: documents.length === 0,
    });
  } catch (error) {
    console.error('Error in documents GET route:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch documents. Please check your database configuration.',
        setupRequired: true,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userDetails = await getUserDetails(true);
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const allowedExtensions = [
      'pdf', 'docx', 'txt', 'md', 'markdown', 'rtf', 'csv', 'log',
      'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'svg',
      'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'java', 'kt',
      'scala', 'groovy', 'clj', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp',
      'hxx', 'cs', 'vb', 'fs', 'go', 'rs', 'rb', 'php', 'swift', 'r',
      'm', 'mm', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
      'sql', 'psql', 'mysql', 'json', 'yaml', 'yml', 'toml', 'ini',
      'conf', 'config', 'env', 'rst', 'tex', 'adoc', 'org',
    ];

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(fileExtension || '')) {
      return NextResponse.json(
        {
          error: `Unsupported file type. Supported extensions include: ${allowedExtensions
            .slice(0, 20)
            .join(', ')}, and more.`,
        },
        { status: 400 }
      );
    }

    console.log(
      `Processing upload for user: ${userDetails.fullName} (${userDetails.email})`
    );
    console.log(
      `File: ${file.name}, Size: ${file.size} bytes, Type: ${file.type}`
    );

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadResult = await uploadDocument(
      buffer,
      file.name,
      userDetails.id,
      file.type
    );
    console.log(`File uploaded to Appwrite: ${uploadResult.fileId}`);

    const documentId = ID.unique();

    await createUserDocumentNode(
      userDetails.id,
      documentId,
      file.name,
      {
        fileId: uploadResult.fileId,
        fileSize: file.size,
        status: 'uploaded',
        processingStage: 'pending',
        uploadedAt: new Date().toISOString()
      }
    );

    const pipeline = new DocumentPipeline();
    await pipeline.init();
    await pipeline.queueDocumentIngestion(
      documentId,
      userDetails.id,
      file.name,
      uploadResult.filePath
    );

    console.log(`Document queued for processing: ${documentId}`);

    setTimeout(async () => {
      try {
        console.log(
          `Starting background pipeline for document: ${documentId}`
        );

        await documentProcessor.processDocument(
          documentId,
          userDetails.id,
          file.name,
          buffer,
          file.type
        );

        console.log(
          `Pipeline completed successfully for document: ${documentId}`
        );
      } catch (err) {
        console.error(
          `Background processing failed for document: ${documentId}`,
          err
        );
      }
    }, 100);

    return NextResponse.json({
      success: true,
      user: {
        id: userDetails.id,
        email: userDetails.email,
        fullName: userDetails.fullName,
      },
      document: {
        id: documentId,
        fileName: file.name,
        status: 'uploaded',
        processingStage: 'queued',
        fileId: uploadResult.fileId,
        uploadedAt: new Date().toISOString(),
      },
      message: `Successfully uploaded "${file.name}". Processing pipeline started.`,
    });
  } catch (error) {
    console.error('Error uploading document:', error);

    let errorMessage = 'Failed to upload document';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes('Unauthorized')) {
        errorMessage = 'Authentication required. Please log in.';
        statusCode = 401;
      } else if (error.message.includes('Appwrite')) {
        errorMessage = 'Storage service error. Please check Appwrite configuration.';
      } else if (error.message.includes('Redis')) {
        errorMessage = 'Queue service error. Please check Redis configuration.';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details:
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.stack
              : String(error)
            : undefined,
      },
      { status: statusCode }
    );
  }
}
