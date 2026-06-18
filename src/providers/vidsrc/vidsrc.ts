import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source,
    Subtitle
} from '@omss/framework';

export class HanerixProvider extends BaseProvider {
    readonly id = 'klikxxi';
    readonly name = 'KlikXXI (Hanerix)';
    readonly enabled = true;
    
    // WAJIB: Kerangka OMSS mengharuskan variabel ini bernama BASE_URL
    readonly BASE_URL = 'https://klikxxi.me/';
    readonly HANERIX_URL = 'https://hanerix.com/';
    
    // Tiket sesi Yandex Metrika hasil tangkapan Inspect Element
    private readonly SESSION_COOKIES = '_ym_uid=1781814223377007935; _ym_d=1781814223; _ym_isad=2; _ym_visorc=b';

    // Header penyamaran tingkat dasar
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
        'Sec-Fetch-Dest': 'empty',
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
            // LANGKAH 1: TAKTIK B - Melakukan Pencarian di Situs KlikXXI
            const searchQuery = encodeURIComponent(media.title);
            const searchUrl = `${this.BASE_URL}?s=${searchQuery}`;

            const searchHtml = await this.fetchHtml(searchUrl, {
                ...this.HEADERS,
                'Referer': 'https://google.com/'
            });

            if (!searchHtml) {
                return this.emptyResult('Gagal memuat halaman pencarian KlikXXI');
            }

            // LANGKAH 2: Mengekstrak URL film dari hasil pencarian
            // Kita ubah judul menjadi huruf kecil-bergaris agar akurat saat mencocokkan tautan
            const cleanTitle = media.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            
            // Mencari pola tautan: <a href="https://klikxxi.me/apapun-judul-film-apapun/">
            const linkRegex = new RegExp(`href=["'](${this.BASE_URL}[^"']*?${cleanTitle}[^"']*?\\/)["']`, 'i');
            const linkMatch = searchHtml.match(linkRegex);

            if (!linkMatch || !linkMatch[1]) {
                return this.emptyResult('Film tidak ditemukan di hasil pencarian KlikXXI');
            }

            const pageUrl = linkMatch[1]; // Hasil: https://klikxxi.me/backrooms-2026/

            // LANGKAH 3: Mengunjungi halaman film untuk memancing iframe Hanerix
            const pageHtml = await this.fetchHtml(pageUrl, {
                ...this.HEADERS,
                'Referer': searchUrl
            });

            if (!pageHtml) {
                return this.emptyResult('Gagal memuat halaman film KlikXXI');
            }

            // Mencari pola: <iframe ... src="https://hanerix.com/e/9xb50ftb077c"
            const iframeMatch = pageHtml.match(/<iframe[^>]+src=["'](https:\/\/hanerix\.com\/e\/[^"']+)["']/i);
            
            if (!iframeMatch || !iframeMatch[1]) {
                return this.emptyResult('Tidak menemukan iframe Hanerix di halaman film tersebut');
            }

            const iframeUrl = iframeMatch[1];

            // LANGKAH 4: Mengunjungi halaman iframe untuk mencari master.m3u8
            const iframeHtml = await this.fetchHtml(iframeUrl, {
                ...this.HEADERS,
                'Referer': pageUrl 
            });

            if (!iframeHtml) {
                return this.emptyResult('Gagal memuat iframe Hanerix');
            }

            // LANGKAH 5: Menarik tautan .m3u8 murni dari skrip
            const m3u8Match = iframeHtml.match(/(https:\/\/hanerix\.com\/stream\/[^"']+\.m3u8)/i);

            if (!m3u8Match || !m3u8Match[1]) {
                return this.emptyResult('Tautan master.m3u8 tidak ditemukan di dalam iframe');
            }

            const rawUrl = m3u8Match[1];

            // LANGKAH 6: Membungkus URL dengan proksi internal OMSS beserta tiket Yandex
            const proxiedUrl = this.createProxyUrl(rawUrl, {
                ...this.PROXY_STREAM_HEADERS,
                'Referer': iframeUrl,
                'Origin': this.HANERIX_URL.replace(/\/$/, '')
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

    // Fungsi khusus untuk mengambil HTML mentah (scraping)
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
