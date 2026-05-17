import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId') || 'default_admin';
  
  try {
    const doc = await db.collection('calendar_configs').doc(agentId).get();
    
    if (doc.exists && doc.data()?.tokens?.refresh_token) {
      return NextResponse.json({ 
        connected: true, 
        email: doc.data()?.email 
      });
    }

    return NextResponse.json({ connected: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
