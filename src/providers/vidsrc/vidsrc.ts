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
    
    // Tiket bawaan jika pemanen otomatis gagal
    private readonly SESSION_COOKIES = '_ym_uid=1781814223377007935; _ym_d=1781814223; _ym_isad=2; _ym_visorc=b';

    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
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
            
            // LANGKAH 0: Pemanen Tiket (Auto-Cookie)
            console.log(`[CCTV] Langkah 0 - Mencoba memanen tiket (Cookie) segar...`);
            let activeCookies = this.SESSION_COOKIES;
            try {
                const initResponse = await fetch(this.BASE_URL, {
                    headers: this.HEADERS
                });
                const setCookie = initResponse.headers.get('set-cookie');
                if (setCookie) {
                    activeCookies = setCookie;
                    console.log(`[CCTV] Langkah 0 - SUKSES: Tiket baru berhasil dikantongi!`);
                } else {
                    console.log(`[CCTV] Langkah 0 - Peringatan: Tidak ada tiket baru, memakai tiket bawaan.`);
                }
            } catch (e) {
                console.log(`[CCTV] Langkah 0 - Gagal menghubungi beranda, memakai tiket bawaan.`);
            }

            const dynamicHeaders = {
                ...this.HEADERS,
                'Cookie': activeCookies
            };
            
            // LANGKAH 1 & 2: JALAN PINTAS NINJA (Merakit URL Otomatis)
            console.log(`[CCTV] Langkah 1 & 2 - Menggunakan Jalan Pintas Ninja (Mencegah Pencarian)...`);
            
            // Membersihkan judul dari karakter aneh dan mengganti spasi dengan strip (-)
            const baseSlug = media.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            
            // Menyiapkan daftar kemungkinan URL untuk diketuk
            const urlsToTry: string[] = [];
            if (media.releaseYear) {
                urlsToTry.push(`${this.BASE_URL}${baseSlug}-${media.releaseYear}/`);
            }
            urlsToTry.push(`${this.BASE_URL}${baseSlug}/`);

            let pageHtml: string | null = null;
            let pageUrl = '';

            for (const url of urlsToTry) {
                console.log(`[CCTV] Mengetuk pintu langsung: ${url}`);
                const html = await this.fetchHtml(url, {
                    ...dynamicHeaders,
                    'Referer': this.BASE_URL
                });

                // Pastikan halaman berhasil dimuat dan bukan halaman blokir Cloudflare
                if (html && !html.includes('Cloudflare') && !html.includes('Just a moment...')) {
                    pageHtml = html;
                    pageUrl = url;
                    break; // Berhenti mencari jika pintu berhasil dibuka
                }
            }

            if (!pageHtml) {
                console.log(`[CCTV] GAGAL: Semua pintu jalan pintas tertutup (URL tidak cocok atau diblokir).`);
                return this.emptyResult('Gagal memuat halaman film secara langsung');
            }

            console.log(`[CCTV] Langkah 3 - Berhasil mendarat di: ${pageUrl}`);
            
            const qualityLabel = this.detectQuality(pageHtml);
            console.log(`[CCTV] Kualitas Terdeteksi: ${qualityLabel}`);

            // LANGKAH 4: Pencurian ID Muvipro
            const postIdMatch = pageHtml.match(/post_id\s*=\s*["']?(\d+)["']?/i) || 
                                pageHtml.match(/data-post=["']?(\d+)["']?/i) || 
                                pageHtml.match(/id=["']?post-(\d+)["']?/i);

            if (!postIdMatch || !postIdMatch[1]) {
                console.log(`[CCTV] GAGAL: ID Film Muvipro tidak ditemukan di HTML.`);
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
                    ...dynamicHeaders,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': pageUrl
                },
                body: formData.toString()
            });

            if (ajaxResponse.status !== 200) {
                console.log(`[CCTV] GAGAL: Permintaan AJAX ditolak oleh peladen (${ajaxResponse.status}).`);
                return this.emptyResult('Permintaan AJAX ditolak peladen');
            }
            const ajaxHtml = await ajaxResponse.text();

            // LANGKAH 6: STRATEGI BUNGLON - Menangkap domain dinamis (hgcloud, dll)
            const iframeRegex = /(https?:\/\/[a-zA-Z0-9.-]+\/e\/[a-zA-Z0-9_-]+)/i;
            const iframeMatch = ajaxHtml.match(iframeRegex);
            
            if (!iframeMatch || !iframeMatch[1]) {
                console.log(`[CCTV] GAGAL: Tidak menemukan tautan iframe /e/ di balasan AJAX.`);
                return this.emptyResult('Tautan iframe rotasi tidak ditemukan');
            }

            const iframeUrl = iframeMatch[1];
            console.log(`[CCTV] Langkah 6 - Tautan Iframe Pintu Depan: ${iframeUrl}`);

            // LANGKAH 7: PEMBURU LEMPARAN (Redirect Hunter)
            console.log(`[CCTV] Langkah 7 - Mencegat Lemparan di Pintu Depan...`);
            
            const iframeResponse = await fetch(iframeUrl, {
                method: 'GET',
                headers: {
                    ...dynamicHeaders,
                    'Referer': pageUrl
                },
                redirect: 'manual' 
            });

            let targetHtml = '';
            let targetUrl = iframeUrl;

            // Jika dilempar (Status 301, 302, dsb)
            if (iframeResponse.status >= 300 && iframeResponse.status < 400) {
                const locationHeader = iframeResponse.headers.get('location');
                if (locationHeader) {
                    targetUrl = new URL(locationHeader, iframeUrl).href;
                    console.log(`[CCTV] Langkah 7 - Lemparan Terdeteksi! Menuju sarang asli: ${targetUrl}`);
                    
                    const realResponse = await fetch(targetUrl, {
                        method: 'GET',
                        headers: {
                            ...dynamicHeaders,
                            'Referer': pageUrl
                        }
                    });

                    if (realResponse.status === 200) {
                        targetHtml = await realResponse.text();
                        console.log(`[CCTV] Langkah 7 - Berhasil menyusup ke sarang asli.`);
                    } else {
                        console.log(`[CCTV] GAGAL: Sarang asli menolak ketukan pintu (${realResponse.status}).`);
                        return this.emptyResult('Ditolak oleh peladen tujuan');
                    }
                } else {
                    console.log(`[CCTV] GAGAL: Ada perintah lemparan tapi alamat tujuan kosong.`);
                    return this.emptyResult('Gagal melacak tujuan lemparan');
                }
            } else if (iframeResponse.status === 200) {
                console.log(`[CCTV] Langkah 7 - Tidak ada lemparan. Langsung masuk.`);
                targetHtml = await iframeResponse.text();
            } else {
                console.log(`[CCTV] GAGAL: Pintu Iframe rusak (${iframeResponse.status}).`);
                return this.emptyResult('Iframe gagal merespons');
            }

            if (!targetHtml) {
                console.log(`[CCTV] GAGAL: Halaman HTML di sarang asli kosong.`);
                return this.emptyResult('Isi HTML sarang kosong');
            }

            const finalOrigin = new URL(targetUrl).origin;

            // LANGKAH 8: Ekstrak M3U8 & Pemecah Sandi
            const m3u8Regex = /((?:https?:\/\/[^"'\s]+)?\/[^"'\s]+\.m3u8)/i;
            let m3u8Match = targetHtml.match(m3u8Regex);

            if (!m3u8Match || !m3u8Match[1]) {
                console.log(`[CCTV] Langkah 8 - M3U8 disandikan! Menjalankan Mesin Pemecah Sandi...`);
                const unpackedHtml = this.unpackEval(targetHtml);
                m3u8Match = unpackedHtml.match(m3u8Regex);
            }

            if (!m3u8Match || !m3u8Match[1]) {
                console.log(`[CCTV] GAGAL: Tautan master.m3u8 tidak ditemukan meski sandi telah dipecahkan.`);
                return this.emptyResult('Tautan master.m3u8 tidak ditemukan');
            }

            let rawUrl = m3u8Match[1];
            
            // STRATEGI MENYAMBUNG PETA
            if (!rawUrl.startsWith('http')) {
                console.log(`[CCTV] Langkah 8 - Alamat relatif terdeteksi: ${rawUrl}`);
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
            if (!match) {
                console.log(`[CCTV] Pemecah Sandi: Pola eval packer tidak ditemukan di dalam HTML.`);
                return html;
            }

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
            console.log(`[CCTV] Pemecah Sandi Berhasil Mengekstrak Tautan!`);
            return p;
        } catch (e) {
            console.log(`[CCTV] Pemecah Sandi Gagal: ${e}`);
            return html;
        }
    }

    // Fungsi Pembaca Kualitas
    private detectQuality(html: string): string {
        const text = html.toUpperCase();
        
        if (text.includes('BLURAY') || text.includes('WEB-DL') || text.includes('WEBDL') || text.includes('HD 1080')) return '1080p';
        if (text.includes('HDRIP') || text.includes('HD 720')) return '720p';
        if (text.includes('HDTC') || text.includes('HDTS') || text.includes('CAM')) return 'unknown'; 
        if (text.includes(' HD ')) return '1080p';
        
        return 'unknown'; 
    }

    // Fungsi penarik HTML, mengembalikan null jika bukan 200 OK (seperti saat 404 Not Found)
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
