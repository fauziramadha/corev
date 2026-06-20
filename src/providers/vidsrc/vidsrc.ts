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
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
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
            
            // LANGKAH 0: Pemanen Tiket (Opsional, agar terlihat natural)
            let activeCookies = this.SESSION_COOKIES;
            try {
                const initResponse = await fetch(this.BASE_URL, { headers: this.HEADERS });
                const setCookie = initResponse.headers.get('set-cookie');
                if (setCookie) activeCookies = setCookie;
            } catch (e) {
                // Abaikan jika gagal
            }

            const dynamicHeaders = {
                ...this.HEADERS,
                'Cookie': activeCookies
            };
            
            // LANGKAH 1: JALUR TOL WP-JSON (Mengetuk Pintu Belakang)
            const searchQuery = encodeURIComponent(media.title);
            const apiUrl = `${this.BASE_URL}wp-json/wp/v2/posts?search=${searchQuery}`;
            console.log(`[CCTV] Langkah 1 - Mengetuk Pintu Belakang JSON: ${apiUrl}`);

            const apiResponse = await fetch(apiUrl, {
                method: 'GET',
                headers: dynamicHeaders
            });

            if (!apiResponse.ok) {
                console.log(`[CCTV] GAGAL: Pintu belakang JSON ditutup atau diblokir Cloudflare (${apiResponse.status}).`);
                return this.emptyResult('Jalur WP-JSON gagal diakses');
            }

            // PERBAIKAN TS: Memaksa TypeScript menganggap data ini sebagai daftar/array
            const apiData = (await apiResponse.json()) as any[];

            if (!apiData || apiData.length === 0) {
                console.log(`[CCTV] GAGAL: Film tidak ditemukan di dalam brankas JSON.`);
                return this.emptyResult('Film tidak ditemukan di database');
            }

            // Mengambil hasil pencarian pertama
            const post = apiData[0];
            const contentHTML = post.content?.rendered || '';
            const titleHTML = post.title?.rendered || '';
            
            console.log(`[CCTV] Langkah 2 - Brankas Terbuka! Ditemukan: ${titleHTML}`);

            // LANGKAH 2: EKSTRAKSI HARTA KARUN (Mencari Iframe di dalam JSON)
            // Regex ini akan mencari URL yang diawali http dan mengandung /e/
            const iframeRegex = /(https?:\/\/[a-zA-Z0-9.-]+\/e\/[a-zA-Z0-9_-]+)/i;
            const iframeMatch = contentHTML.match(iframeRegex);
            
            if (!iframeMatch || !iframeMatch[1]) {
                console.log(`[CCTV] GAGAL: Tautan iframe /e/ tidak ditemukan di dalam teks JSON.`);
                return this.emptyResult('Tautan iframe rotasi tidak ditemukan');
            }

            const iframeUrl = iframeMatch[1];
            console.log(`[CCTV] Langkah 2 - Harta Karun Iframe Ditemukan: ${iframeUrl}`);

            // Mendeteksi kualitas dari judul atau isi JSON
            const qualityLabel = this.detectQuality(titleHTML + ' ' + contentHTML);

            // LANGKAH 3: PEMBURU LEMPARAN (Redirect Hunter)
            console.log(`[CCTV] Langkah 3 - Mencegat Lemparan Iframe...`);
            
            const iframeResponse = await fetch(iframeUrl, {
                method: 'GET',
                headers: {
                    ...dynamicHeaders,
                    'Referer': this.BASE_URL
                },
                redirect: 'manual' 
            });

            let targetHtml = '';
            let targetUrl = iframeUrl;

            // Jika ada lemparan Matryoshka (Status 301, 302, dsb)
            if (iframeResponse.status >= 300 && iframeResponse.status < 400) {
                const locationHeader = iframeResponse.headers.get('location');
                if (locationHeader) {
                    targetUrl = new URL(locationHeader, iframeUrl).href;
                    console.log(`[CCTV] Langkah 3 - Lemparan Terdeteksi! Menuju sarang asli: ${targetUrl}`);
                    
                    const realResponse = await fetch(targetUrl, {
                        method: 'GET',
                        headers: {
                            ...dynamicHeaders,
                            'Referer': this.BASE_URL
                        }
                    });

                    if (realResponse.status === 200) {
                        targetHtml = await realResponse.text();
                        console.log(`[CCTV] Langkah 3 - Berhasil menyusup ke sarang asli.`);
                    } else {
                        console.log(`[CCTV] GAGAL: Sarang asli menolak ketukan (${realResponse.status}).`);
                        return this.emptyResult('Ditolak oleh peladen tujuan');
                    }
                } else {
                    return this.emptyResult('Gagal melacak tujuan lemparan');
                }
            } else if (iframeResponse.status === 200) {
                targetHtml = await iframeResponse.text();
            } else {
                return this.emptyResult('Iframe gagal merespons');
            }

            if (!targetHtml) return this.emptyResult('Isi HTML sarang kosong');

            const finalOrigin = new URL(targetUrl).origin;

            // LANGKAH 4: EKSTRAK M3U8 & PEMECAH SANDI
            const m3u8Regex = /((?:https?:\/\/[^"'\s]+)?\/[^"'\s]+\.m3u8)/i;
            let m3u8Match = targetHtml.match(m3u8Regex);

            if (!m3u8Match || !m3u8Match[1]) {
                console.log(`[CCTV] Langkah 4 - M3U8 disandikan! Menjalankan Mesin Pemecah Sandi...`);
                const unpackedHtml = this.unpackEval(targetHtml);
                m3u8Match = unpackedHtml.match(m3u8Regex);
            }

            if (!m3u8Match || !m3u8Match[1]) {
                console.log(`[CCTV] GAGAL: Tautan master.m3u8 tidak ditemukan.`);
                return this.emptyResult('Tautan master.m3u8 tidak ditemukan');
            }

            let rawUrl = m3u8Match[1];
            
            // Menyambung alamat relatif
            if (!rawUrl.startsWith('http')) {
                rawUrl = rawUrl.startsWith('/') ? `${finalOrigin}${rawUrl}` : `${finalOrigin}/${rawUrl}`;
            }

            console.log(`[CCTV] Langkah Akhir - SUKSES menemukan m3u8: ${rawUrl}`);

            // Membungkus URL menggunakan proksi OMSS
            const proxiedUrl = this.createProxyUrl(rawUrl, {
                ...this.PROXY_STREAM_HEADERS,
                'Referer': targetUrl,
                'Origin': finalOrigin
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

    // Fungsi Mesin Pemecah Sandi JavaScript (JWPlayer Packer)
    private unpackEval(html: string): string {
        try {
            const match = html.match(/}\s*\(\s*(['"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])(.*?)\5\.split\(['"]\|['"]\)/s);
            if (!match) return html;

            let p = match[2];
            p = p.replace(/\\'/g, "'").replace(/\\"/g, '"');
            
            const a = parseInt(match[3], 10);
            let c = parseInt(match[4], 10);
            const k = match[6].split('|');

            while (c--) {
                if (k[c]) {
                    const radix = c.toString(a);
                    const regex = new RegExp('\\b' + radix + '\\b', 'g');
                    p = p.replace(regex, () => k[c]);
                }
            }
            return p;
        } catch (e) {
            return html;
        }
    }

    // Fungsi Pembaca Kualitas
    private detectQuality(text: string): string {
        const upperText = text.toUpperCase();
        if (upperText.includes('BLURAY') || upperText.includes('WEB-DL') || upperText.includes('WEBDL') || upperText.includes('HD 1080')) return '1080p';
        if (upperText.includes('HDRIP') || upperText.includes('HD 720')) return '720p';
        if (upperText.includes('HDTC') || upperText.includes('HDTS') || upperText.includes('CAM')) return 'unknown'; 
        if (upperText.includes(' HD ')) return '1080p';
        return 'unknown'; 
    }

    private emptyResult(message: string): ProviderResult {
        return { sources: [], subtitles: [], diagnostics: [{ code: 'PROVIDER_ERROR', message: `${this.name}: ${message}`, field: '', severity: 'error' }] };
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }
}
