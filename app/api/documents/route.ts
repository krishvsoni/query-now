import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getUserDocuments } from '@/lib/appwrite';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const documents = await getUserDocuments(user.id);
    
    return NextResponse.json({
      documents: documents.map(doc => ({
        id: doc.$id,
        fileName: doc.fileName,
        status: doc.status,
        processingStage: doc.processingStage,
        uploadedAt: doc.uploadedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}