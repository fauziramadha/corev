import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source,
    Subtitle
} from '@omss/framework';

// Konfigurasi Domain Sumber (Bisa diubah jika domain mereka berganti)
const SITE_DOMAINS = {
    vidlink: 'https://vidlink.pro',
    moviesFlix: 'https://movies-flix.com',
    vidfast: 'https://vidfast.co',
    lordflix: 'https://lordflix.com',
    onetouchtv: 'https://onetouchtv.me'
};

export class EmbedApiProvider extends BaseProvider {
    readonly id = 'embedapi';
    readonly name = 'Embed API Backup';
    readonly enabled = true;
    
    // Base URL untuk alat peretas (Decrypter)
    readonly DECRYPT_API_URL = 'https://enc-dec.app/api';
    
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    // Fungsi Logger Aman
    private logSafe(action: string, data: any) {
        try {
            const output = typeof data === 'string' ? data : JSON.stringify(data);
            console.log(`[EmbedAPI Debug] ${action}:`, output.length > 500 ? output.substring(0, 500) + '... (truncated)' : output);
        } catch (e) {
            console.log(`[EmbedAPI Debug] ${action}: (Unloggable data)`);
        }
    }

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media);
    }

    private async getSources(media: ProviderMediaObject): Promise<ProviderResult> {
        const sources: Source[] = [];
        const subtitles: Subtitle[] = [];

        this.logSafe('Initiating Embed API Backup', `TMDB ID: ${media.tmdbId}`);

        // Menjalankan kelima peretas secara serentak (Paralel) agar cepat
        const promises = [
            this.handleVidlink(media),
            this.handleMoviesFlix(media),
            this.handleVidfast(media),
            this.handleLordflix(media),
            this.handleOneTouchTV(media)
        ];

        const results = await Promise.allSettled(promises);

        results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
                if (result.value.source) sources.push(result.value.source);
            }
        });

        if (sources.length === 0) {
            return this.emptyResult('All decryption attempts failed or no sources found.');
        }

        return {
            sources,
            subtitles,
            diagnostics: []
        };
    }

    // =====================================================================
    // 1. VIDLINK HANDLER (GET /api/enc-vidlink?text=_____)
    // =====================================================================
    private async handleVidlink(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.vidlink}/movie/${media.tmdbId}`
                : `${SITE_DOMAINS.vidlink}/tv/${media.tmdbId}/${media.s}/${media.e}`;
                
            this.logSafe('Vidlink: Fetching Source', url);
            const html = await this.fetchHTML(url);
            
            // Mencari teks acak (Kunci ini bisa disesuaikan dengan struktur asli Vidlink)
            const encryptedText = this.extractRegex(html, /data-enc="([^"]+)"/i) || this.extractRegex(html, /['"]?encrypted['"]?\s*:\s*['"]([^"]+)['"]/i);
            if (!encryptedText) throw new Error('Vidlink: Encrypted text not found in HTML');

            this.logSafe('Vidlink: Decrypting', `Text length: ${encryptedText.length}`);
            
            // Sesuai Instruksi: Menggunakan GET request
            const decryptUrl = `${this.DECRYPT_API_URL}/enc-vidlink?text=${encodeURIComponent(encryptedText)}`;
            const response = await fetch(decryptUrl, { method: 'GET', headers: this.HEADERS });
            const data = await response.json();

            if (!data || !data.url) throw new Error('Vidlink: Decryption failed to return URL');

            return {
                source: this.formatSource(data.url, 'Vidlink', SITE_DOMAINS.vidlink)
            };
        } catch (error) {
            this.logSafe('Vidlink Error', error instanceof Error ? error.message : error);
            return null;
        }
    }

    // =====================================================================
    // 2. MOVIES-FLIX HANDLER (POST /api/dec-movies-flix)
    // =====================================================================
    private async handleMoviesFlix(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.moviesFlix}/movie/${media.tmdbId}`
                : `${SITE_DOMAINS.moviesFlix}/tv/${media.tmdbId}/${media.s}/${media.e}`;
                
            const html = await this.fetchHTML(url);
            const encryptedText = this.extractRegex(html, /id="flix-data"\s+value="([^"]+)"/i) || this.extractRegex(html, /sourceData\s*=\s*['"]([^"]+)['"]/i);
            if (!encryptedText) throw new Error('MoviesFlix: Encrypted text not found');

            // Sesuai Instruksi: Menggunakan POST request dengan body JSON
            const decryptUrl = `${this.DECRYPT_API_URL}/dec-movies-flix`;
            const response = await fetch(decryptUrl, {
                method: 'POST',
                headers: { ...this.HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: encryptedText })
            });
            const data = await response.json();

            if (!data || !data.url) throw new Error('MoviesFlix: Decryption failed');

            return {
                source: this.formatSource(data.url, 'Movies-Flix', SITE_DOMAINS.moviesFlix)
            };
        } catch (error) {
            this.logSafe('MoviesFlix Error', error instanceof Error ? error.message : error);
            return null;
        }
    }

    // =====================================================================
    // 3. VIDFAST HANDLER (POST /api/dec-vidfast)
    // =====================================================================
    private async handleVidfast(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.vidfast}/embed/movie/${media.tmdbId}`
                : `${SITE_DOMAINS.vidfast}/embed/tv/${media.tmdbId}/${media.s}/${media.e}`;
                
            const html = await this.fetchHTML(url);
            const encryptedText = this.extractRegex(html, /['"]?file['"]?\s*:\s*['"]([^"]+)['"]/i);
            if (!encryptedText) throw new Error('Vidfast: Encrypted text not found');

            // Sesuai Instruksi: Menggunakan POST request dengan body JSON
            const decryptUrl = `${this.DECRYPT_API_URL}/dec-vidfast`;
            const response = await fetch(decryptUrl, {
                method: 'POST',
                headers: { ...this.HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: encryptedText })
            });
            const data = await response.json();

            if (!data || !data.url) throw new Error('Vidfast: Decryption failed');

            return {
                source: this.formatSource(data.url, 'Vidfast', SITE_DOMAINS.vidfast)
            };
        } catch (error) {
            this.logSafe('Vidfast Error', error instanceof Error ? error.message : error);
            return null;
        }
    }

    // =====================================================================
    // 4. LORDFLIX HANDLER (POST /api/dec-lordflix | Requires text & sign)
    // =====================================================================
    private async handleLordflix(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.lordflix}/embed/${media.tmdbId}`
                : `${SITE_DOMAINS.lordflix}/embed/${media.tmdbId}/${media.s}/${media.e}`;
                
            const html = await this.fetchHTML(url);
            
            // Mencari dua parameter yang dibutuhkan: text dan sign
            const encryptedText = this.extractRegex(html, /data-text="([^"]+)"/i);
            const signToken = this.extractRegex(html, /data-sign="([^"]+)"/i);
            
            if (!encryptedText || !signToken) throw new Error('Lordflix: Text or Sign token not found');

            // Sesuai Instruksi: Menggunakan POST request dengan 2 parameter JSON
            const decryptUrl = `${this.DECRYPT_API_URL}/dec-lordflix`;
            const response = await fetch(decryptUrl, {
                method: 'POST',
                headers: { ...this.HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: encryptedText, sign: signToken })
            });
            const data = await response.json();

            if (!data || !data.url) throw new Error('Lordflix: Decryption failed');

            return {
                source: this.formatSource(data.url, 'Lordflix', SITE_DOMAINS.lordflix)
            };
        } catch (error) {
            this.logSafe('Lordflix Error', error instanceof Error ? error.message : error);
            return null;
        }
    }

    // =====================================================================
    // 5. ONETOUCHTV HANDLER (POST /api/dec-onetouchtv)
    // =====================================================================
    private async handleOneTouchTV(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.onetouchtv}/movie/${media.tmdbId}`
                : `${SITE_DOMAINS.onetouchtv}/tv/${media.tmdbId}/${media.s}/${media.e}`;
                
            const html = await this.fetchHTML(url);
            const encryptedText = this.extractRegex(html, /<input[^>]+id="token"[^>]+value="([^"]+)"/i);
            if (!encryptedText) throw new Error('OneTouchTV: Encrypted token not found');

            // Sesuai Instruksi: Menggunakan POST request dengan body JSON
            const decryptUrl = `${this.DECRYPT_API_URL}/dec-onetouchtv`;
            const response = await fetch(decryptUrl, {
                method: 'POST',
                headers: { ...this.HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: encryptedText })
            });
            const data = await response.json();

            if (!data || !data.url) throw new Error('OneTouchTV: Decryption failed');

            return {
                source: this.formatSource(data.url, 'OneTouchTV', SITE_DOMAINS.onetouchtv)
            };
        } catch (error) {
            this.logSafe('OneTouchTV Error', error instanceof Error ? error.message : error);
            return null;
        }
    }

    // =====================================================================
    // Fungsi Bantuan (Helpers)
    // =====================================================================
    
    // Fungsi untuk menarik HTML mentah dari situs sumber
    private async fetchHTML(url: string): Promise<string> {
        const response = await fetch(url, { headers: this.HEADERS });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    }

    // Fungsi ekstraksi regex standar untuk menarik token yang tersembunyi
    private extractRegex(html: string, pattern: RegExp): string | null {
        const match = html.match(pattern);
        return match ? match[1] : null;
    }

    // Fungsi pembungkus URL hasil dekripsi menjadi format yang dikenali OMSS
    private formatSource(finalUrl: string, serverName: string, originSite: string): Source {
        const isMp4 = finalUrl.toLowerCase().includes('.mp4');
        
        // Membungkus URL menggunakan Proxy Vercel agar terhindar dari CORS layar hitam
        const proxiedUrl = this.createProxyUrl(finalUrl, {
            ...this.HEADERS,
            Referer: `${originSite}/`,
            Origin: originSite
        });

        return {
            url: proxiedUrl,
            quality: 'Auto',
            type: isMp4 ? 'mp4' : 'hls',
            audioTracks: [{ language: 'English', label: 'eng' }],
            provider: { id: this.id, name: `${this.name} - ${serverName}` }
        };
    }

    private emptyResult(message: string): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [{
                code: 'PROVIDER_ERROR',
                message: `${this.name}: ${message}`,
                field: '',
                severity: 'warning'
            }]
        };
    }

    async healthCheck(): Promise<boolean> {
        // Melakukan ping ringan ke API Enc-Dec untuk memastikan server pemecah sandi sedang hidup
        try {
            const response = await fetch(`${this.DECRYPT_API_URL}/enc-vidlink?text=ping`, { method: 'GET' });
            return response.status === 200 || response.status === 400; // 400 berarti hidup tapi menolak 'ping'
        } catch {
            return false;
        }
    }
}
