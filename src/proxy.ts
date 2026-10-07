import { NextResponse, type NextRequest } from 'next/server';

const OPERATOR_USERNAME = 'shanu7';
const OPERATOR_PASSWORD = '99948387342';

function hasValidBasicAuth(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Basic ')) return false;

  try {
    const encoded = authorization.slice('Basic '.length);
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return username === OPERATOR_USERNAME && password === OPERATOR_PASSWORD;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (hasValidBasicAuth(request)) {
    return NextResponse.next();
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Maharaja Project"',
    },
  });
}

export const config = {
  matcher: ['/create/:path*', '/tv/:path*'],
};
