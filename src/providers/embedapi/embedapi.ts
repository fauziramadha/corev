import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source,
    Subtitle
} from '@omss/framework';

// Konfigurasi 3 Domain Embed Utama
const SITE_DOMAINS = {
    filmu: 'https://embed.filmu.in',
    vidfast: 'https://vidfast.pro',
    vidking: 'https://www.vidking.net'
};

export class EmbedApiProvider extends BaseProvider {
    readonly id = 'embedapi';
    readonly name = 'Embed API Backup';
    readonly enabled = true;

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

        this.logSafe('Initiating Direct Embed Generation', `TMDB ID: ${media.tmdbId}`);

        // =====================================================================
        // 1. FILMU HANDLER
        // =====================================================================
        const filmuUrl = media.type === 'movie'
            ? `${SITE_DOMAINS.filmu}/movie/${media.tmdbId}`
            : `${SITE_DOMAINS.filmu}/tv/${media.tmdbId}/${media.s}/${media.e}`;
        
        sources.push({
            url: filmuUrl,
            quality: 'Auto',
            type: 'embed' as any, // Menggunakan 'embed' agar aplikasi tahu ini link Iframe/Webview
            audioTracks: [{ language: 'English', label: 'eng' }],
            provider: { id: this.id, name: `${this.name} - Filmu` }
        });

        // =====================================================================
        // 2. VIDFAST HANDLER
        // =====================================================================
        const vidfastUrl = media.type === 'movie'
            ? `${SITE_DOMAINS.vidfast}/movie/${media.tmdbId}`
            : `${SITE_DOMAINS.vidfast}/tv/${media.tmdbId}/${media.s}/${media.e}`;
        
        sources.push({
            url: vidfastUrl,
            quality: 'Auto',
            type: 'embed' as any,
            audioTracks: [{ language: 'English', label: 'eng' }],
            provider: { id: this.id, name: `${this.name} - Vidfast` }
        });

        // =====================================================================
        // 3. VIDKING HANDLER
        // =====================================================================
        const vidkingUrl = media.type === 'movie'
            ? `${SITE_DOMAINS.vidking}/embed/movie/${media.tmdbId}`
            : `${SITE_DOMAINS.vidking}/embed/tv/${media.tmdbId}/${media.s}/${media.e}`;
        
        sources.push({
            url: vidkingUrl,
            quality: 'Auto',
            type: 'embed' as any,
            audioTracks: [{ language: 'English', label: 'eng' }],
            provider: { id: this.id, name: `${this.name} - Vidking` }
        });

        this.logSafe('Direct Embed URLs Generated Successfully', sources.map(s => s.url));

        return {
            sources,
            subtitles: [],
            diagnostics: []
        };
    }

    async healthCheck(): Promise<boolean> {
        // Selalu mengembalikan nilai 'true' karena Vercel tidak perlu melakukan fetch ke luar
        return true;
    }
}
