import { NextRequest, NextResponse } from 'next/server';
import { getUserDetails } from '@/lib/auth';
import { uploadDocument, getUserDocuments, saveDocumentMetadata } from '@/lib/appwrite';
import { documentProcessor } from '@/lib/document-processor';
import { DocumentPipeline } from '@/lib/redis';

export const runtime = 'nodejs'; 

/**
 * GET – Fetch user documents
 */
export async function GET(request: NextRequest) {
  try {
    const userDetails = await getUserDetails();

    let documents = [];
    try {
      documents = await getUserDocuments(userDetails.id);
    } catch (error) {
      console.warn('Could not fetch user documents:', error);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userDetails.id,
        email: userDetails.email,
        fullName: userDetails.fullName,
      },
      documents: documents.map((doc) => ({
        id: doc.$id,
        fileName: doc.fileName,
        status: doc.status,
        processingStage: doc.processingStage,
        uploadedAt: doc.uploadedAt,
        fileId: doc.fileId,
      })),
      setupRequired: documents.length === 0,
    });
  } catch (error) {
    console.error('Error in documents GET route:', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          'Failed to fetch documents. Please ensure Appwrite is properly configured.',
        setupRequired: true,
      },
      { status: 500 }
    );
  }
}

/**
 * POST – Upload a document, store in Appwrite, and queue for processing
 */
export async function POST(request: NextRequest) {
  try {
    const userDetails = await getUserDetails();
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

    // Upload to Appwrite
    const uploadResult = await uploadDocument(
      buffer,
      file.name,
      userDetails.id,
      file.type
    );
    console.log(`File uploaded to Appwrite: ${uploadResult.fileId}`);

    // Save metadata to DB
    const documentMetadata = await saveDocumentMetadata({
      fileId: uploadResult.fileId,
      fileName: file.name,
      userId: userDetails.id,
      status: 'uploaded',
      processingStage: 'pending',
    });

    // Queue in Redis pipeline
    const pipeline = new DocumentPipeline();
    await pipeline.init();
    await pipeline.queueDocumentIngestion(
      documentMetadata.$id,
      userDetails.id,
      file.name,
      uploadResult.filePath
    );

    console.log(`Document queued for processing: ${documentMetadata.$id}`);

    // 🔥 Process document asynchronously (background)
    setTimeout(async () => {
      try {
        console.log(
          `Starting background pipeline for document: ${documentMetadata.$id}`
        );

        await documentProcessor.processDocument(
          documentMetadata.$id,
          userDetails.id,
          file.name,
          buffer,
          file.type
        );

        console.log(
          `✅ Pipeline completed successfully for document: ${documentMetadata.$id}`
        );
      } catch (err) {
        console.error(
          `❌ Background processing failed for document: ${documentMetadata.$id}`,
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
        id: documentMetadata.$id,
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
