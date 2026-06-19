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
    
    // Cookie sesi untuk melewati pemblokiran dasar
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
            console.log(`[CCTV] =======================================`);
            console.log(`[CCTV] Memulai Operasi: ${media.title}`);
            
            // LANGKAH 1: Melakukan Pencarian
            const searchQuery = encodeURIComponent(media.title);
            const searchUrl = `${this.BASE_URL}?s=${searchQuery}`;
            console.log(`[CCTV] Langkah 1 - Pencarian: ${searchUrl}`);

            const searchHtml = await this.fetchHtml(searchUrl, {
                ...this.HEADERS,
                'Referer': 'https://google.com/'
            });

            if (!searchHtml) return this.emptyResult('Gagal memuat halaman pencarian');
            if (searchHtml.includes('Cloudflare') || searchHtml.includes('Just a moment...')) return this.emptyResult('Diblokir Cloudflare di awal');

            // LANGKAH 2: Mengekstrak URL film yang tepat
            const firstWord = media.title.split(' ')[0].toLowerCase().replace(/[^a-z0-9]+/g, '');
            const linkRegex = new RegExp(`href=["'](${this.BASE_URL}(?!search\\/|feed\\/|tag\\/|category\\/|wp-)[^"']*?${firstWord}[^"']*?\\/?)["']`, 'i');
            const linkMatch = searchHtml.match(linkRegex);

            if (!linkMatch || !linkMatch[1]) return this.emptyResult('Film tidak ditemukan di hasil pencarian');

            let pageUrl = linkMatch[1];
            if (!pageUrl.endsWith('/')) pageUrl += '/';
            console.log(`[CCTV] Langkah 2 - URL Film Ditemukan: ${pageUrl}`);

            // LANGKAH 3: Memuat Halaman Film & Deteksi Kualitas
            const pageHtml = await this.fetchHtml(pageUrl, {
                ...this.HEADERS,
                'Referer': searchUrl
            });

            if (!pageHtml) return this.emptyResult('Gagal memuat halaman film');
            
            const qualityLabel = this.detectQuality(pageHtml);
            console.log(`[CCTV] Langkah 3 - Kualitas Terdeteksi: ${qualityLabel}`);

            // LANGKAH 4: Pencurian ID Muvipro
            const postIdMatch = pageHtml.match(/post_id\s*=\s*["']?(\d+)["']?/i) || 
                                pageHtml.match(/data-post=["']?(\d+)["']?/i) || 
                                pageHtml.match(/id=["']?post-(\d+)["']?/i);

            if (!postIdMatch || !postIdMatch[1]) {
                console.log(`[CCTV] GAGAL: ID Film Muvipro tidak ditemukan.`);
                return this.emptyResult('Gagal menemukan ID Muvipro');
            }

            const postId = postIdMatch[1];
            console.log(`[CCTV] Langkah 4 - ID Film Muvipro: ${postId}`);

            // LANGKAH 5: Pemalsuan Surat AJAX
            console.log(`[CCTV] Langkah 5 - Mengirim permintaan AJAX...`);
            const formData = new URLSearchParams();
            formData.append('action', 'muvipro_player_content');
            formData.append('tab', 'p1');
            formData.append('post_id', postId);

            const ajaxResponse = await fetch(`${this.BASE_URL}wp-admin/admin-ajax.php`, {
                method: 'POST',
                headers: {
                    ...this.HEADERS,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': pageUrl
                },
                body: formData.toString()
            });

            if (ajaxResponse.status !== 200) return this.emptyResult('Permintaan AJAX ditolak peladen');
            const ajaxHtml = await ajaxResponse.text();

            // LANGKAH 6: STRATEGI BUNGLON - Menangkap domain dinamis (vibuxer, hgcloud, dll)
            const iframeRegex = /(https?:\/\/[a-zA-Z0-9.-]+\/e\/[a-zA-Z0-9_-]+)/i;
            const iframeMatch = ajaxHtml.match(iframeRegex);
            
            if (!iframeMatch || !iframeMatch[1]) {
                console.log(`[CCTV] GAGAL: Tidak menemukan tautan /e/ di balasan AJAX.`);
                return this.emptyResult('Tautan iframe rotasi tidak ditemukan');
            }

            const iframeUrl = iframeMatch[1];
            const dynamicOrigin = new URL(iframeUrl).origin;
            console.log(`[CCTV] Langkah 6 - Tautan Iframe: ${iframeUrl} (Domain: ${dynamicOrigin})`);

            // LANGKAH 7: Eksekusi Iframe & Ekstrak M3U8
            const iframeHtml = await this.fetchHtml(iframeUrl, {
                ...this.HEADERS,
                'Referer': pageUrl 
            });

            if (!iframeHtml) return this.emptyResult('Gagal memuat isi iframe rotasi');

            const m3u8Regex = /(https?:\/\/[a-zA-Z0-9.-]+\/stream\/[^"']+\.m3u8)/i;
            const m3u8Match = iframeHtml.match(m3u8Regex);

            if (!m3u8Match || !m3u8Match[1]) {
                console.log(`[CCTV] GAGAL: Tautan master.m3u8 tidak ditemukan.`);
                return this.emptyResult('Tautan master.m3u8 tidak ditemukan');
            }

            const rawUrl = m3u8Match[1];
            console.log(`[CCTV] Langkah Akhir - SUKSES menemukan m3u8: ${rawUrl}`);

            // Membungkus URL menggunakan proksi OMSS
            const proxiedUrl = this.createProxyUrl(rawUrl, {
                ...this.PROXY_STREAM_HEADERS,
                'Referer': iframeUrl,
                'Origin': dynamicOrigin
            });

            const sources: Source[] = [
                {
                    url: proxiedUrl,
                    type: 'hls',
                    quality: qualityLabel, 
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

    // Fungsi Pembaca Kualitas
    private detectQuality(html: string): string {
        const text = html.toUpperCase();
        
        // 5. HD (WEBDL, BLURAY) -> Kualitas Tinggi
        if (text.includes('BLURAY') || text.includes('WEB-DL') || text.includes('WEBDL') || text.includes('HD 1080')) {
            return '1080p';
        }
        // 4. HDRIP -> Kualitas Menengah Atas
        if (text.includes('HDRIP') || text.includes('HD 720')) {
            return '720p';
        }
        // Kualitas Rendah / Perekaman Bioskop (1. CAM, 2. HDTS, 3. HDTC)
        if (text.includes('HDTC') || text.includes('HDTS') || text.includes('CAM')) {
            return 'unknown'; 
        }
        // Deteksi HD umum
        if (text.includes(' HD ')) {
            return '1080p';
        }
        
        return 'unknown'; // Bawaan jika tidak ada tanda apa-apa
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
