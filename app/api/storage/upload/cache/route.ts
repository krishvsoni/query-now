import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const redis = await getRedisClient();
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    
    if (!key) {
      return NextResponse.json({ error: 'Key parameter is required' }, { status: 400 });
    }
    
    const value = await redis.get(key);
    return NextResponse.json({ key, value });
  } catch (error) {
    console.error('Redis GET error:', error);
    return NextResponse.json({ error: 'Failed to get value' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const redis = await getRedisClient();
    const { key, value, ttl } = await request.json();
    
    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Key and value are required' }, { status: 400 });
    }
    
    if (ttl) {
      await redis.setEx(key, ttl, JSON.stringify(value));
    } else {
      await redis.set(key, JSON.stringify(value));
    }
    
    return NextResponse.json({ success: true, key });
  } catch (error) {
    console.error('Redis SET error:', error);
    return NextResponse.json({ error: 'Failed to set value' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const redis = await getRedisClient();
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    
    if (!key) {
      return NextResponse.json({ error: 'Key parameter is required' }, { status: 400 });
    }
    
    await redis.del(key);
    return NextResponse.json({ success: true, key });
  } catch (error) {
    console.error('Redis DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete value' }, { status: 500 });
  }
}
