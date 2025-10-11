import { NextRequest, NextResponse } from 'next/server';
import { initializeAppwrite } from '@/lib/init-appwrite';

export async function POST(request: NextRequest) {
  try {
    console.log('Starting Appwrite initialization...');
    const success = await initializeAppwrite();
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Appwrite initialized successfully!'
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Appwrite initialization failed'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Initialization error:', error);
    return NextResponse.json({
      success: false,
      message: 'Appwrite initialization failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Use POST to initialize Appwrite database and storage'
  });
}