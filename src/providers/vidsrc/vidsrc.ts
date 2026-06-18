import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source,
    Subtitle
} from '@omss/framework';

export class HanerixProvider extends BaseProvider {
    readonly id = 'hanerix';
    readonly name = 'Hanerix (KlikXXI)';
    readonly enabled = true;
    
    // Domain utama peladen video
    readonly BASE_URL = 'https://hanerix.com/';
    
    // Tiket sesi Yandex Metrika hasil tangkapan Inspect Element
    private readonly SESSION_COOKIES = '_ym_uid=1781814223377007935; _ym_d=1781814223; _ym_isad=2; _ym_visorc=b';

    // Header untuk koneksi dasar
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://hanerix.com/e/9xb50ftb077c',
        'Origin': 'https://hanerix.com',
        'Cookie': this.SESSION_COOKIES,
        'Sec-Ch-Ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
    };

    // Header mutlak yang akan dibungkus oleh proksi internal OMSS
    readonly PROXY_STREAM_HEADERS = {
        ...this.HEADERS,
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-site'
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    private async getSources(
        media: ProviderMediaObject
    ): Promise<ProviderResult> {
        try {
            // 1. Dapatkan halaman/API yang memuat URL video
            const pageUrl = await this.buildUrl(media);
            const data = await this.fetchPage(pageUrl);

            if (!data) {
                return this.emptyResult('Failed to fetch page or API');
            }

            const sources: Source[] = [];
            const resp = data as any; 

            // PENTING: Iterasi ini harus disesuaikan dengan struktur JSON/Response KlikXXI.
            for (const [_, stream] of Object.entries(resp)) {
                if (!(stream as any)?.url) continue;

                // Mengambil URL murni tanpa dibungkus proksi eksternal
                const rawUrl: string = (stream as any).url;

                // Menyelundupkan Header (Cookie & Referer) ke dalam Proksi Internal OMSS
                const proxiedUrl = this.createProxyUrl(rawUrl, {
                    ...this.PROXY_STREAM_HEADERS
                });

                sources.push({
                    url: proxiedUrl, // Menggunakan URL aman hasil proksi internal
                    type: rawUrl.includes('.mp4') ? 'mp4' : 'hls',
                    quality: (stream as any).resolution ? (stream as any).resolution + 'p' : '1080p',
                    audioTracks: [
                        {
                            language: 'unknown',
                            label: 'Unknown'
                        }
                    ],
                    provider: { id: this.id, name: this.name }
                    // Properti 'headers' ditiadakan agar lolos pengecekan TypeScript Vercel
                });
            }

            const subtitles = await this.fetchSubtitles(media);

            return {
                sources,
                subtitles,
                diagnostics: []
            };
        } catch (error) {
            return this.emptyResult(
                error instanceof Error
                    ? error.message
                    : 'Unknown provider error'
            );
        }
    }

    private async fetchSubtitles(
        media: ProviderMediaObject
    ): Promise<Subtitle[]> {
        // Implementasi logika penarikan subtitel KlikXXI di sini jika ada
        return [];
    }

    private async buildUrl(media: ProviderMediaObject): Promise<string> {
        // PENTING: Ganti logika ini dengan format endpoint API KlikXXI yang sebenarnya
        let itemId: string;
        if (media.type === 'tv') {
            itemId = `${media.tmdbId}_${media.s}_${media.e}`;
        } else {
            itemId = `${media.tmdbId}`;
        }

        // URL sementara, wajib diganti dengan URL pemanggil asli dari KlikXXI
        return `${this.BASE_URL}api/get_video/${itemId}`; 
    }

    private async fetchPage(url: string): Promise<any | null> {
        try {
            const response = await fetch(url, {
                headers: this.HEADERS
            });

            if (response.status !== 200) return null;

            const contentType = response.headers.get('content-type') ?? '';

            if (contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch {
            return null;
        }
    }

    private emptyResult(message: string): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [
                {
                    code: 'PROVIDER_ERROR',
                    message: `${this.name}: ${message}`,
                    field: '',
                    severity: 'error'
                }
            ]
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(this.BASE_URL, {
                method: 'HEAD',
                headers: this.HEADERS
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
