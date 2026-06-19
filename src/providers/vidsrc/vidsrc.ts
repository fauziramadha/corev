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
    
    readonly BASE_URL = 'https://klikxxi.me/';
    readonly HANERIX_URL = 'https://hanerix.com/';
    
    private readonly SESSION_COOKIES = '_ym_uid=1781814223377007935; _ym_d=1781814223; _ym_isad=2; _ym_visorc=b';

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
            console.log(`[CCTV] Mulai mencari film: ${media.title}`);
            
            // LANGKAH 1: Pencarian
            const searchQuery = encodeURIComponent(media.title);
            const searchUrl = `${this.BASE_URL}?s=${searchQuery}`;
            console.log(`[CCTV] Langkah 1 - Mengunjungi: ${searchUrl}`);

            const searchHtml = await this.fetchHtml(searchUrl, {
                ...this.HEADERS,
                'Referer': 'https://google.com/'
            });

            if (!searchHtml) {
                console.log(`[CCTV] GAGAL: Tidak ada respon dari halaman pencarian KlikXXI.`);
                return this.emptyResult('Gagal memuat halaman pencarian KlikXXI');
            }
            
            if (searchHtml.includes('Cloudflare') || searchHtml.includes('Just a moment...')) {
                console.log(`[CCTV] GAGAL: Diblokir oleh tembok Cloudflare KlikXXI!`);
                return this.emptyResult('Diblokir Cloudflare');
            }

            // LANGKAH 2: Mengekstrak URL film dengan Pengecualian Ketat
            const firstWord = media.title.split(' ')[0].toLowerCase().replace(/[^a-z0-9]+/g, '');
            console.log(`[CCTV] Langkah 2 - Mencari tautan murni untuk: ${firstWord}`);
            
            // PERBAIKAN REGEX: (?!search\/|feed\/|tag\/|category\/|wp-) digunakan untuk memblokir tautan palsu/sistem
            const linkRegex = new RegExp(`href=["'](${this.BASE_URL}(?!search\\/|feed\\/|tag\\/|category\\/|wp-)[^"']*?${firstWord}[^"']*?\\/?)["']`, 'i');
            const linkMatch = searchHtml.match(linkRegex);

            if (!linkMatch || !linkMatch[1]) {
                console.log(`[CCTV] GAGAL: Tautan film murni tidak ditemukan di hasil pencarian.`);
                return this.emptyResult('Film tidak ditemukan di hasil pencarian');
            }

            let pageUrl = linkMatch[1];
            if (!pageUrl.endsWith('/')) pageUrl += '/';
            console.log(`[CCTV] Langkah 3 - Berhasil menemukan tautan film murni: ${pageUrl}`);

            // LANGKAH 3: Mengunjungi halaman film
            const pageHtml = await this.fetchHtml(pageUrl, {
                ...this.HEADERS,
                'Referer': searchUrl
            });

            if (!pageHtml) {
                console.log(`[CCTV] GAGAL: Gagal memuat halaman film.`);
                return this.emptyResult('Gagal memuat halaman film KlikXXI');
            }

            // LANGKAH 4: Mencari URL Hanerix (REVISI: Menangkap dari mana saja, tidak harus iframe)
            const hanerixMatch = pageHtml.match(/(https:\/\/hanerix\.com\/e\/[a-zA-Z0-9]+)/i);
            
            if (!hanerixMatch || !hanerixMatch[1]) {
                console.log(`[CCTV] GAGAL: hanerix.com/e/ tidak ditemukan sama sekali di dalam HTML halaman film.`);
                // Mengintip HTML jika gagal
                console.log(`[CCTV] Cuplikan HTML: ${pageHtml.substring(0, 300)}...`);
                return this.emptyResult('Tidak menemukan URL Hanerix');
            }

            const iframeUrl = hanerixMatch[1];
            console.log(`[CCTV] Langkah 4 - Berhasil menemukan URL Hanerix: ${iframeUrl}`);

            // LANGKAH 5: Membuka URL Hanerix untuk mencari m3u8
            const iframeHtml = await this.fetchHtml(iframeUrl, {
                ...this.HEADERS,
                'Referer': pageUrl 
            });

            if (!iframeHtml) {
                console.log(`[CCTV] GAGAL: Gagal memuat isi halaman Hanerix.`);
                return this.emptyResult('Gagal memuat halaman Hanerix');
            }

            // LANGKAH 6: Ekstrak m3u8
            const m3u8Match = iframeHtml.match(/(https:\/\/hanerix\.com\/stream\/[^"']+\.m3u8)/i);

            if (!m3u8Match || !m3u8Match[1]) {
                console.log(`[CCTV] GAGAL: Tautan .m3u8 tidak ditemukan di dalam skrip Hanerix.`);
                return this.emptyResult('Tautan master.m3u8 tidak ditemukan');
            }

            const rawUrl = m3u8Match[1];
            console.log(`[CCTV] Langkah Akhir - SUKSES menemukan m3u8: ${rawUrl}`);

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
                    audioTracks: [{ language: 'unknown', label: 'Unknown' }],
                    provider: { id: this.id, name: this.name }
                }
            ];

            return { sources, subtitles: [], diagnostics: [] };

        } catch (error) {
            console.log(`[CCTV] GAGAL SISTEM: ${error instanceof Error ? error.message : 'Unknown'}`);
            return this.emptyResult(error instanceof Error ? error.message : 'Unknown error');
        }
    }

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
        return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', message: `${this.name}: ${message}`, field: '', severity: 'error' }] };
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }
}
