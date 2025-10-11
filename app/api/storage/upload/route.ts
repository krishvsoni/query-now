import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    
    // This endpoint can be used for direct storage uploads if needed
    // For now, we'll redirect to the main documents upload
    return NextResponse.json({ 
      message: 'Use /api/documents for file uploads' 
    }, { status: 200 });
    
  } catch (error) {
    console.error('Storage upload error:', error);
    return NextResponse.json({ 
      error: 'Upload failed' 
    }, { status: 500 });
  }
}
