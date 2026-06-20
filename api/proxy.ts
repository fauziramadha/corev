// api/proxy.ts
export const config = {
    runtime: 'edge',     // ← KUNCI: pakai Edge, bukan Serverless
};

export default async function handler(req: Request) {
    const url = new URL(req.url);
    const target = url.searchParams.get('url');

    if (!target) {
        return new Response('Missing url parameter', { status: 400 });
    }

    // Ambil headers custom dari query param (base64 encoded)
    const headersEncoded = url.searchParams.get('h') ?? '';

    const proxyHeaders: Record<string, string> = {
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        Accept: '*/*',
        Referer: 'https://vidrock.ru/',
        Origin: 'https://vidrock.ru',
    };

    // Decode headers tambahan kalau ada
    if (headersEncoded) {
        try {
            const extra = JSON.parse(
                Buffer.from(headersEncoded, 'base64').toString()
            );
            Object.assign(proxyHeaders, extra);
        } catch { /* ignore */ }
    }

    try {
        const response = await fetch(target, {
            headers: proxyHeaders,
        });

        // Stream response langsung ke client (tanpa buffer)
        return new Response(response.body, {
            status: response.status,
            headers: {
                'Content-Type':
                    response.headers.get('Content-Type') ?? 'application/octet-stream',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': '*',
            },
        });
    } catch (error) {
        return new Response(
            `Proxy error: ${error instanceof Error ? error.message : 'Unknown'}`,
            { status: 502 }
        );
    }
}

// Handle CORS preflight
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
        },
    });
}
