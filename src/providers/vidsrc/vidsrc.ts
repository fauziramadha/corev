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

            if (!searchHtml) return this.emptyResult('Gagal memuat halaman pencarian');

            // LANGKAH 2: Mengekstrak URL film
            const firstWord = media.title.split(' ')[0].toLowerCase().replace(/[^a-z0-9]+/g, '');
            const linkRegex = new RegExp(`href=["'](${this.BASE_URL}(?!search\\/|feed\\/|tag\\/|category\\/|wp-)[^"']*?${firstWord}[^"']*?\\/?)["']`, 'i');
            const linkMatch = searchHtml.match(linkRegex);

            if (!linkMatch || !linkMatch[1]) return this.emptyResult('Film tidak ditemukan di hasil pencarian');

            let pageUrl = linkMatch[1];
            if (!pageUrl.endsWith('/')) pageUrl += '/';
            console.log(`[CCTV] Langkah 3 - Mengunjungi halaman film: ${pageUrl}`);

            // LANGKAH 3: Mengunjungi halaman film
            const pageHtml = await this.fetchHtml(pageUrl, {
                ...this.HEADERS,
                'Referer': searchUrl
            });

            if (!pageHtml) return this.emptyResult('Gagal memuat halaman film');

            // Cek Cloudflare Level 2
            if (pageHtml.includes('Cloudflare') || pageHtml.includes('Just a moment...')) {
                console.log(`[CCTV] GAGAL: Halaman film utama diblokir oleh Cloudflare!`);
                return this.emptyResult('Diblokir Cloudflare di halaman film');
            }

            // LANGKAH 4: PEMINDAI FORENSIK
            const iframeRegex = /(https?:\/\/[a-zA-Z0-9.-]+\/e\/[a-zA-Z0-9_-]+)/i;
            const iframeMatch = pageHtml.match(iframeRegex);
            
            let iframeUrl = '';

            if (iframeMatch && iframeMatch[1]) {
                iframeUrl = iframeMatch[1];
                console.log(`[CCTV] Langkah 4 - Ketemu Langsung: ${iframeUrl}`);
            } else {
                console.log(`[CCTV] Memulai Pemindaian Forensik HTML...`);
                
                // Cek AJAX WordPress (Sistem klik tombol Play)
                if (pageHtml.includes('admin-ajax.php')) {
                    console.log(`[CCTV] FORENSIK: Situs ini menggunakan AJAX (Video disembunyikan dan butuh klik).`);
                    
                    // Mencari ID Film (Biasanya ada di atribut data-post atau id)
                    const postIdMatch = pageHtml.match(/data-post=["']?(\d+)["']?/i) || 
                                        pageHtml.match(/post_id\s*=\s*["']?(\d+)["']?/i) || 
                                        pageHtml.match(/id=["']?post-(\d+)["']?/i);
                                        
                    if (postIdMatch) {
                        console.log(`[CCTV] FORENSIK: ID Film Rahasia ditemukan -> ${postIdMatch[1]}`);
                    }
                }

                // Cek Sandi Base64
                const b64Regex = /["']([A-Za-z0-9+/]{40,}=*)["']/g;
                const b64Matches = pageHtml.match(b64Regex);
                let b64Found = false;

                if (b64Matches) {
                    for (const b64 of b64Matches) {
                        try {
                            // Menghilangkan tanda kutip
                            const cleanB64 = b64.replace(/["']/g, '');
                            const decoded = atob(cleanB64);
                            if (decoded.includes('http') || decoded.includes('iframe')) {
                                console.log(`[CCTV] FORENSIK: Sandi Base64 berhasil dipecahkan -> ${decoded.substring(0, 100)}...`);
                                b64Found = true;
                                // Jika ada URL iframe di dalamnya, tangkap!
                                const extractMatch = decoded.match(iframeRegex);
                                if (extractMatch) iframeUrl = extractMatch[1];
                                break;
                            }
                        } catch(e) { } // Abaikan jika gagal dekripsi
                    }
                }
                
                if (!b64Found) console.log(`[CCTV] FORENSIK: Tidak ada teks sandi Base64 yang relevan.`);

                if (!iframeUrl) return this.emptyResult('Iframe tidak ditemukan setelah forensik');
            }

            const dynamicOrigin = new URL(iframeUrl).origin;
            console.log(`[CCTV] Langkah 4 - Eksekusi Iframe: ${iframeUrl} (Domain: ${dynamicOrigin})`);

            // LANGKAH 5: Membuka URL rotasi untuk mencari m3u8
            const iframeHtml = await this.fetchHtml(iframeUrl, {
                ...this.HEADERS,
                'Referer': pageUrl 
            });

            if (!iframeHtml) return this.emptyResult('Gagal memuat halaman iframe');

            // LANGKAH 6: Ekstrak m3u8
            const m3u8Regex = /(https?:\/\/[a-zA-Z0-9.-]+\/stream\/[^"']+\.m3u8)/i;
            const m3u8Match = iframeHtml.match(m3u8Regex);

            if (!m3u8Match || !m3u8Match[1]) {
                console.log(`[CCTV] GAGAL: Tautan .m3u8 tidak ditemukan di dalam skrip iframe.`);
                return this.emptyResult('Tautan master.m3u8 tidak ditemukan');
            }

            const rawUrl = m3u8Match[1];
            console.log(`[CCTV] Langkah Akhir - SUKSES menemukan m3u8: ${rawUrl}`);

            const proxiedUrl = this.createProxyUrl(rawUrl, {
                ...this.PROXY_STREAM_HEADERS,
                'Referer': iframeUrl,
                'Origin': dynamicOrigin
            });

            return {
                sources: [
                    {
                        url: proxiedUrl,
                        type: 'hls',
                        quality: '1080p', 
                        audioTracks: [{ language: 'unknown', label: 'Unknown' }],
                        provider: { id: this.id, name: this.name }
                    }
                ],
                subtitles: [], 
                diagnostics: []
            };

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
