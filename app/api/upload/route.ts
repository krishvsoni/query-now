import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { uploadDocument, saveDocumentMetadata } from '@/lib/appwrite';
import { pipeline } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadResult = await uploadDocument(buffer, file.name, user.id);
    
    // Save document metadata to database
    const documentMetadata = await saveDocumentMetadata({
      fileId: uploadResult.fileId,
      fileName: file.name,
      userId: user.id,
      status: 'uploaded',
      processingStage: 'pending'
    });
    
    await pipeline.queueDocumentIngestion(
      documentMetadata.$id,
      user.id,
      uploadResult.fileName,
      uploadResult.filePath
    );

    return NextResponse.json({
      success: true,
      document: {
        id: documentMetadata.$id,
        fileName: uploadResult.fileName,
        fileId: uploadResult.fileId,
        status: 'uploaded',
        processingStage: 'pending',
        uploadedAt: uploadResult.uploadedAt
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
