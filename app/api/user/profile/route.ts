import { NextRequest, NextResponse } from 'next/server';
import { getUserDetails, checkAuthentication } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const isAuth = await checkAuthentication();
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get detailed user information
    const userDetails = await getUserDetails();
    
    return NextResponse.json({
      success: true,
      user: userDetails
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch user profile' 
    }, { status: 500 });
  }
}