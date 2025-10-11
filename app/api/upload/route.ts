import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { uploadDocument } from '@/lib/appwrite';
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
    
    await pipeline.queueDocumentIngestion(
      uploadResult.documentId,
      user.id,
      uploadResult.fileName,
      uploadResult.filePath
    );

    return NextResponse.json({
      success: true,
      document: uploadResult
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
