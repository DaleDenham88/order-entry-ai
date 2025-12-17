// app/api/proxy-soap/route.ts
// Vercel-compatible SOAP proxy (replaces Netlify function)

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30; // Allow up to 30 seconds for slow SOAP endpoints

export async function POST(request: NextRequest) {
  try {
    const { endpoint, soapAction, xmlBody } = await request.json();

    if (!endpoint || !soapAction || !xmlBody) {
      return NextResponse.json(
        { error: 'Missing required fields: endpoint, soapAction, xmlBody' },
        { status: 400 }
      );
    }

    console.log('SOAP Proxy Request:', {
      endpoint,
      soapAction,
      bodyPreview: xmlBody.substring(0, 200),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': `"${soapAction}"`,
        },
        body: xmlBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseText = await response.text();

      console.log('SOAP Response:', {
        status: response.status,
        preview: responseText.substring(0, 300),
      });

      return NextResponse.json({
        status: response.status,
        responseText,
        error: null,
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json({
          status: 408,
          responseText: '',
          error: 'Request timed out',
          isTimeout: true,
        });
      }

      return NextResponse.json({
        status: 500,
        responseText: '',
        error: fetchError instanceof Error ? fetchError.message : 'Fetch failed',
      });
    }

  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Invalid request',
        status: 400,
        responseText: '',
      },
      { status: 400 }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
