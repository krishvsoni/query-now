import { NextRequest, NextResponse } from 'next/server';
import { getUserDetails } from '@/lib/auth';
import { listStorageFiles, uploadDocument, getUserDocuments, saveDocumentMetadata } from '@/lib/appwrite';
import { documentProcessor } from '@/lib/document-processor';
import { DocumentPipeline } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const userDetails = await getUserDetails();
    
    // Get user documents from database
    let documents = [];
    try {
      documents = await getUserDocuments(userDetails.id);
    } catch (error) {
      console.warn('Could not fetch user documents:', error);
      // Return empty array instead of error if database setup is incomplete
    }
    
    return NextResponse.json({
      success: true,
      user: {
        id: userDetails.id,
        email: userDetails.email,
        fullName: userDetails.fullName
      },
      documents: documents.map(doc => ({
        id: doc.$id,
        fileName: doc.fileName,
        status: doc.status,
        processingStage: doc.processingStage,
        uploadedAt: doc.uploadedAt,
        fileId: doc.fileId
      })),
      setupRequired: documents.length === 0 ? true : false
    });
  } catch (error) {
    console.error('Error in documents GET route:', error);
    
    // If it's an auth error, return 401
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to fetch documents. Please ensure Appwrite is properly configured.',
      setupRequired: true 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userDetails = await getUserDetails();
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    const allowedExtensions = ['pdf', 'docx', 'txt'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension || '')) {
      return NextResponse.json({ 
        error: 'Unsupported file type. Please upload PDF, DOCX, or TXT files.' 
      }, { status: 400 });
    }

    // File size validation removed - no limit
    console.log(`Processing upload for user: ${userDetails.fullName} (${userDetails.email})`);
    console.log(`File: ${file.name}, Size: ${file.size} bytes, Type: ${file.type}`);

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Appwrite with user details and proper MIME type
    const uploadResult = await uploadDocument(buffer, file.name, userDetails.id, file.type);
    console.log(`File uploaded to Appwrite: ${uploadResult.fileId}`);
    
    // Save document metadata to database
    const documentMetadata = await saveDocumentMetadata({
      fileId: uploadResult.fileId,
      fileName: file.name,
      userId: userDetails.id,
      status: 'uploaded',
      processingStage: 'pending'
    });
    
    // Initialize pipeline and queue document for processing
    const pipeline = new DocumentPipeline();
    await pipeline.init();
    
    await pipeline.queueDocumentIngestion(
      documentMetadata.$id,
      userDetails.id,
      file.name,
      uploadResult.filePath
    );

    console.log(`Document queued for processing: ${documentMetadata.$id}`);

    // Start comprehensive processing pipeline in background
    // This includes: parsing → embeddings → Pinecone → Neo4j → Redis caching
    setTimeout(async () => {
      try {
        console.log(`Starting background pipeline for document: ${documentMetadata.$id}`);
        
        await documentProcessor.processDocument(
          documentMetadata.$id,
          userDetails.id,
          file.name,
          buffer,
          file.type
        );
        
        console.log(`Pipeline completed for document: ${documentMetadata.$id}`);
      } catch (error) {
        console.error('Background processing pipeline error:', error);
      }
    }, 100); // Small delay to ensure response is sent first

    return NextResponse.json({
      success: true,
      user: {
        id: userDetails.id,
        email: userDetails.email,
        fullName: userDetails.fullName
      },
      document: {
        id: documentMetadata.$id,
        fileName: file.name,
        status: 'uploaded',
        processingStage: 'queued',
        fileId: uploadResult.fileId,
        uploadedAt: new Date().toISOString()
      },
      message: `Successfully uploaded "${file.name}". Processing pipeline started.`
    });

  } catch (error) {
    console.error('Error uploading document:', error);
    
    // Return more detailed error information
    let errorMessage = 'Failed to upload document';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('Unauthorized') || error.message.includes('authentication')) {
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
    
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.stack : String(error) : undefined
    }, { status: statusCode });
  }
}