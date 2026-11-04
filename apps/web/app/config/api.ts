/**
 * Shared API Client & Authentication Helper for RaktaSetu
 * Guarantees reliable session token propagation across all portals and operational actions.
 */

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('raktasetu_token');
}

export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

export function resolveApiUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') || 'http://localhost:4000';
  if (url.startsWith('/api')) {
    return `${apiBase}${url}`;
  }
  return url;
}

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const primaryUrl = resolveApiUrl(url);

  try {
    const res = await fetch(primaryUrl, {
      ...options,
      headers,
    });
    return res;
  } catch (err: any) {
    // If direct fetch fails and primaryUrl was absolute, attempt relative proxy fallback
    if (primaryUrl !== url) {
      try {
        const fallbackRes = await fetch(url, {
          ...options,
          headers,
        });
        return fallbackRes;
      } catch (fallbackErr: any) {
        // Return a controlled structured response rather than an unhandled client error
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              message: 'The RaktaSetu API service is currently unavailable. Please verify that the API server is running on port 4000.',
              code: 'SERVICE_UNAVAILABLE',
            },
          }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          message: 'Network connection failed. Please check your connectivity.',
          code: 'NETWORK_ERROR',
        },
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Safely parses response JSON. If server returns HTML or plain text error,
 * prevents Unexpected token '<' syntax errors and extracts clean error message.
 */
export async function safeJsonParse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return {
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: `Server returned invalid JSON format (HTTP ${res.status}).`,
        },
      };
    }
  }

  // Non-JSON response (e.g. HTML 404/500 page or plain text)
  try {
    const rawText = await res.text();
    const cleanSnippet = rawText
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150);
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_RESPONSE_TYPE',
        message: res.ok
          ? `Unexpected server response: ${cleanSnippet || 'Empty payload'}`
          : `Server returned HTTP ${res.status}: ${cleanSnippet || res.statusText || 'Request failed'}`,
      },
    };
  } catch {
    return {
      success: false,
      error: {
        code: 'RESPONSE_READ_FAILED',
        message: `HTTP ${res.status} ${res.statusText}`,
      },
    };
  }
}
