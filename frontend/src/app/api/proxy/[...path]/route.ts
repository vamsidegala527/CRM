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
  const hopByHopHeaders = ['host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding'];
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!hopByHopHeaders.includes(k)) {
      headers.set(key, value);
    }
  });

  // Ensure origin is explicitly provided so backend generates accurate email links
  if (!headers.get('origin')) {
    headers.set('origin', url.origin);
  }

  // Ensure real client IP is forwarded so backend rate limiter identifies the real user
  const clientIp = request.headers.get('x-real-ip') ||
                   (request.headers.get('x-forwarded-for') ? request.headers.get('x-forwarded-for')!.split(',')[0].trim() : '') ||
                   request.headers.get('cf-connecting-ip') ||
                   (request as any).ip;
  if (clientIp) {
    headers.set('x-real-ip', clientIp);
    if (!headers.get('x-forwarded-for')) {
      headers.set('x-forwarded-for', clientIp);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const options: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    signal: controller.signal,
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
    clearTimeout(timeoutId);

    const resHeaders = new Headers();
    const strippedResponseHeaders = ['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding'];
    backendRes.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (!strippedResponseHeaders.includes(k)) {
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
    clearTimeout(timeoutId);
    console.error(`[PROXY ERROR] Unable to reach backend at ${targetUrl}:`, err);
    return NextResponse.json(
      { detail: 'Server is waking up. Please try again in a few moments.' },
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
