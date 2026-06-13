import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source,
    Subtitle
} from '@omss/framework';

// Konfigurasi Domain Sumber 4 Server Utama
const SITE_DOMAINS = {
    vidfast: 'https://vidfast.pro',
    vidsync: 'https://vidsync.xyz',
    onetouchtv: 'https://onetouchtv.xyz',
    vidlink: 'https://vidlink.pro'
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

        // Menjalankan keempat peretas secara serentak (Paralel)
        const promises = [
            this.handleVidfast(media),
            this.handleVidsync(media),
            this.handleOneTouchTV(media),
            this.handleVidlink(media)
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
    // 1. VIDFAST HANDLER (POST /api/dec-vidfast)
    // =====================================================================
    private async handleVidfast(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.vidfast}/embed/movie/${media.tmdbId}`
                : `${SITE_DOMAINS.vidfast}/embed/tv/${media.tmdbId}/${media.s}/${media.e}`;
                
            this.logSafe('Vidfast: Fetching Source', url);
            const html = await this.fetchHTML(url);
            
            // Ekstraksi token dari HTML
            const encryptedText = this.extractRegex(html, /['"]?file['"]?\s*:\s*['"]([^"]+)['"]/i) || this.extractRegex(html, /data-text="([^"]+)"/i);
            if (!encryptedText) throw new Error('Vidfast: Encrypted text not found');

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
    // 2. VIDSYNC HANDLER (POST /api/dec-vidsync | Requires text & id)
    // =====================================================================
    private async handleVidsync(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.vidsync}/movie/${media.tmdbId}`
                : `${SITE_DOMAINS.vidsync}/tv/${media.tmdbId}/${media.s}/${media.e}`;
                
            this.logSafe('Vidsync: Fetching Source', url);
            const html = await this.fetchHTML(url);
            
            // Mencari dua parameter krusial: text dan id
            const encryptedText = this.extractRegex(html, /data-text="([^"]+)"/i) || this.extractRegex(html, /['"]?encrypted['"]?\s*:\s*['"]([^"]+)['"]/i);
            const videoId = this.extractRegex(html, /data-id="([^"]+)"/i) || this.extractRegex(html, /['"]?id['"]?\s*:\s*['"]([^"]+)['"]/i);
            
            if (!encryptedText || !videoId) throw new Error('Vidsync: Text or ID token not found');

            const decryptUrl = `${this.DECRYPT_API_URL}/dec-vidsync`;
            const response = await fetch(decryptUrl, {
                method: 'POST',
                headers: { ...this.HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: encryptedText, id: videoId })
            });
            const data = await response.json();

            if (!data || !data.url) throw new Error('Vidsync: Decryption failed');

            return {
                source: this.formatSource(data.url, 'Vidsync', SITE_DOMAINS.vidsync)
            };
        } catch (error) {
            this.logSafe('Vidsync Error', error instanceof Error ? error.message : error);
            return null;
        }
    }

    // =====================================================================
    // 3. ONETOUCHTV HANDLER (POST /api/dec-onetouchtv)
    // =====================================================================
    private async handleOneTouchTV(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.onetouchtv}/movie/${media.tmdbId}`
                : `${SITE_DOMAINS.onetouchtv}/tv/${media.tmdbId}/${media.s}/${media.e}`;
                
            this.logSafe('OneTouchTV: Fetching Source', url);
            const html = await this.fetchHTML(url);
            
            // Ekstraksi token dari HTML
            const encryptedText = this.extractRegex(html, /<input[^>]+id="token"[^>]+value="([^"]+)"/i) || this.extractRegex(html, /data-text="([^"]+)"/i);
            if (!encryptedText) throw new Error('OneTouchTV: Encrypted token not found');

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
    // 4. VIDLINK HANDLER (GET /api/enc-vidlink?text=_____)
    // =====================================================================
    private async handleVidlink(media: ProviderMediaObject) {
        try {
            const url = media.type === 'movie' 
                ? `${SITE_DOMAINS.vidlink}/movie/${media.tmdbId}`
                : `${SITE_DOMAINS.vidlink}/tv/${media.tmdbId}/${media.s}/${media.e}`;
                
            this.logSafe('Vidlink: Fetching Source', url);
            const html = await this.fetchHTML(url);
            
            // Ekstraksi token dari HTML
            const encryptedText = this.extractRegex(html, /data-enc="([^"]+)"/i) || this.extractRegex(html, /['"]?encrypted['"]?\s*:\s*['"]([^"]+)['"]/i);
            if (!encryptedText) throw new Error('Vidlink: Encrypted text not found in HTML');

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
    // Fungsi Bantuan (Helpers)
    // =====================================================================
    
    private async fetchHTML(url: string): Promise<string> {
        const response = await fetch(url, { headers: this.HEADERS });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    }

    private extractRegex(html: string, pattern: RegExp): string | null {
        const match = html.match(pattern);
        return match ? match[1] : null;
    }

    private formatSource(finalUrl: string, serverName: string, originSite: string): Source {
        const isMp4 = finalUrl.toLowerCase().includes('.mp4');
        
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
        try {
            const response = await fetch(`${this.DECRYPT_API_URL}/enc-vidlink?text=ping`, { method: 'GET' });
            return response.status === 200 || response.status === 400;
        } catch {
            return false;
        }
    }
}
