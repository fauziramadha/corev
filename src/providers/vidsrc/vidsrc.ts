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
    
    // Domain yang terlibat
    readonly KLIKXXI_URL = 'https://klikxxi.me/';
    readonly BASE_URL = 'https://hanerix.com/';
    
    // Tiket sesi Yandex Metrika hasil tangkapan Inspect Element
    private readonly SESSION_COOKIES = '_ym_uid=1781814223377007935; _ym_d=1781814223; _ym_isad=2; _ym_visorc=b';

    // Header untuk koneksi dasar
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cookie': this.SESSION_COOKIES,
        'Sec-Ch-Ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"'
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
            // 1. Merakit Slug URL KlikXXI (Contoh: backrooms-2026)
            const cleanTitle = media.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const year = media.year ? `-${media.year}` : '';
            const slug = `${cleanTitle}${year}`.replace(/-+$/, '');
            const pageUrl = `${this.KLIKXXI_URL}${slug}/`;

            // 2. Mengunjungi halaman utama KlikXXI untuk mencari iframe
            const pageHtml = await this.fetchHtml(pageUrl, {
                ...this.HEADERS,
                'Referer': 'https://google.com/'
            });

            if (!pageHtml) {
                return this.emptyResult('Gagal memuat halaman utama KlikXXI');
            }

            // 3. Menarik tautan iframe Hanerix dari dalam HTML
            const iframeMatch = pageHtml.match(/<iframe[^>]+src=["'](https:\/\/hanerix\.com\/e\/[^"']+)["']/i);
            
            if (!iframeMatch || !iframeMatch[1]) {
                return this.emptyResult('Tidak menemukan iframe Hanerix di halaman tersebut');
            }

            const iframeUrl = iframeMatch[1];

            // 4. Mengunjungi halaman iframe untuk mencari master.m3u8
            const iframeHtml = await this.fetchHtml(iframeUrl, {
                ...this.HEADERS,
                'Referer': pageUrl
            });

            if (!iframeHtml) {
                return this.emptyResult('Gagal memuat iframe Hanerix');
            }

            // 5. Menarik tautan .m3u8 murni dari skrip
            const m3u8Match = iframeHtml.match(/(https:\/\/hanerix\.com\/stream\/[^"']+\.m3u8)/i);

            if (!m3u8Match || !m3u8Match[1]) {
                return this.emptyResult('Tautan master.m3u8 tidak ditemukan di dalam iframe');
            }

            const rawUrl = m3u8Match[1];

            // 6. Membungkus URL dengan proksi internal OMSS beserta tiket Yandex
            const proxiedUrl = this.createProxyUrl(rawUrl, {
                ...this.PROXY_STREAM_HEADERS,
                'Referer': iframeUrl,
                'Origin': 'https://hanerix.com'
            });

            const sources: Source[] = [
                {
                    url: proxiedUrl,
                    type: 'hls',
                    quality: '1080p',
                    audioTracks: [
                        {
                            language: 'unknown',
                            label: 'Unknown'
                        }
                    ],
                    provider: { id: this.id, name: this.name }
                }
            ];

            return {
                sources,
                subtitles: [],
                diagnostics: []
            };
        } catch (error) {
            return this.emptyResult(
                error instanceof Error ? error.message : 'Unknown provider error'
            );
        }
    }

    // Mengganti fungsi fetchPage(JSON) menjadi fetchHtml(Teks murni)
    private async fetchHtml(url: string, headers: Record<string, string>): Promise<string | null> {
        try {
            const response = await fetch(url, { headers });
            if (response.status !== 200) return null;
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
            const response = await fetch(this.KLIKXXI_URL, {
                method: 'HEAD',
                headers: this.HEADERS
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
