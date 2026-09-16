import { NextRequest, NextResponse } from 'next/server';

async function handler(request: NextRequest, { params }: { params: { path: string[] } }) {
  const backendBase = (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8000'
  ).replace(/\/+$/, '');

  const pathStr = params.path ? params.path.join('/') : '';
  const url = new URL(request.url);
  const targetUrl = `${backendBase}/${pathStr}${url.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k !== 'host' && k !== 'connection' && k !== 'content-length') {
      headers.set(key, value);
    }
  });

  const options: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    try {
      const buffer = await request.arrayBuffer();
      if (buffer.byteLength > 0) {
        options.body = buffer;
      }
    } catch {
      // Body empty or consumed
    }
  }

  try {
    const backendRes = await fetch(targetUrl, options);
    const resHeaders = new Headers();
    backendRes.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k !== 'set-cookie') {
        resHeaders.set(key, value);
      }
    });

    // Reliably forward all Set-Cookie headers
    if (typeof (backendRes.headers as any).getSetCookie === 'function') {
      const cookies = (backendRes.headers as any).getSetCookie();
      for (const cookieStr of cookies) {
        resHeaders.append('Set-Cookie', cookieStr);
      }
    } else {
      const singleSetCookie = backendRes.headers.get('set-cookie');
      if (singleSetCookie) {
        resHeaders.set('Set-Cookie', singleSetCookie);
      }
    }

    const body = await backendRes.arrayBuffer();
    return new NextResponse(body, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: resHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: `Proxy unable to reach backend service at ${backendBase}: ${err.message}` },
      { status: 502 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const HEAD = handler;
export const OPTIONS = handler;
