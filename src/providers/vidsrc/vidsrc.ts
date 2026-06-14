import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source,
    Subtitle
} from '@omss/framework';

export class VidSrcProvider extends BaseProvider {
    readonly id = 'vidsrc';
    readonly name = 'VidSrc';
    readonly enabled = true;
    readonly BASE_URL = 'https://vidsrcme.ru';
    readonly HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        Referer: this.BASE_URL
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
            const pageUrl = this.buildPageUrl(media);
            console.log(`[VidSrc Debug] 1. Menuju Ruang Tamu: ${pageUrl}`);

            const html = await this.fetchPage(pageUrl, media);
            if (!html) {
                console.log(`[VidSrc Debug] ERROR: Ruang Tamu dikunci (Gagal fetch halaman pertama)`);
                return this.emptyResult('Failed to fetch page', media);
            }

            const secondUrl = this.extractSecondUrl(html);
            if (!secondUrl) {
                console.log(`[VidSrc Debug] ERROR: Brankas Iframe tidak ditemukan di Ruang Tamu`);
                return this.emptyResult('Invalid or expired token', media);
            }
            console.log(`[VidSrc Debug] 2. Menuju Brankas Iframe: ${secondUrl.url}`);

            const secondHtml = await this.fetchPage(secondUrl.url, media);
            if (!secondHtml) {
                console.log(`[VidSrc Debug] ERROR: Brankas Iframe kosong atau error`);
                return this.emptyResult('Failed to fetch stream page', media);
            }

            const thirdUrl = this.extractThirdUrl(secondHtml, secondUrl.url);
            if (!thirdUrl) {
                console.log(`[VidSrc Debug] ERROR: Gagal mengekstrak URL ketiga dari dalam Iframe`);
                return this.emptyResult('Failed to extract stream URL', media);
            }
            console.log(`[VidSrc Debug] 3. Menuju Server Video (RCP Gate): ${thirdUrl.url}`);

            // Taktik Lompatan Gaib (RCP Bypasser)
            let finalStreamUrl = thirdUrl.url;
            const rcpTokenMatch = finalStreamUrl.match(/\/prorcp\/([a-zA-Z0-9:=]+)/);
            
            if (rcpTokenMatch) {
                const rawToken = rcpTokenMatch[1];
                console.log(`[VidSrc Bypasser] Pos Satpam RCP terdeteksi. Mencuri kunci dengan token: ${rawToken.substring(0,20)}...`);
                
                try {
                    const domainMatch = finalStreamUrl.match(/^(https?:\/\/[^\/]+)/);
                    const baseDomain = domainMatch ? domainMatch[1] : 'https://cloudorchestranova.com';
                    const verifyUrl = `${baseDomain}/rcp_verify`;
                    
                    const verifyRes = await fetch(verifyUrl, {
                        method: 'POST',
                        headers: {
                            ...this.HEADERS,
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Origin': baseDomain,
                            'Referer': finalStreamUrl
                        },
                        body: `token=${encodeURIComponent(rawToken)}`
                    });
                    
                    const rcpKey = await verifyRes.text();
                    
                    if (rcpKey && rcpKey.length === 32) {
                        console.log(`[VidSrc Bypasser] Sukses! Kunci 32 karakter didapatkan: ${rcpKey}`);
                        finalStreamUrl = `${finalStreamUrl}?_rcp=${rcpKey}`;
                        console.log(`[VidSrc Bypasser] Membuka brankas asli: ${finalStreamUrl}`);
                    } else {
                        console.log(`[VidSrc Bypasser] Gagal mendapat kunci. Respon: ${rcpKey.substring(0,50)}`);
                    }
                } catch (bypassError) {
                    console.log(`[VidSrc Bypasser] Error saat menembus pos satpam:`, bypassError);
                }
            }

            const thirdHtml = await this.fetchPage(finalStreamUrl, media);
            if (!thirdHtml) {
                console.log(`[VidSrc Debug] ERROR: Server Video menolak akses ke brankas asli`);
                return this.emptyResult('Failed to fetch final stream page', media);
            }

            const m3u8Urls = this.extractM3u8Urls(thirdHtml);
            if (!m3u8Urls || m3u8Urls.length === 0) {
                console.log(`[VidSrc Debug] ERROR: Mesin pengekstrak M3U8 (Regex) meleset/usang!`);
                return this.emptyResult('Failed to extract m3u8 URLs', media);
            }

            console.log(`[VidSrc Debug] SUKSES! Ditemukan ${m3u8Urls.length} link video.`);

            const sources: Source[] = m3u8Urls.map((url) => ({
                url: this.createProxyUrl(url, {
                    ...this.HEADERS,
                    Referer: 'https://cloudnestra.com/',
                    Origin: 'https://cloudnestra.com'
                }),
                type: 'hls',
                quality: 'Auto',
                audioTracks: [
                    {
                        label: 'English',
                        language: 'eng'
                    }
                ],
                provider: {
                    id: this.id,
                    name: this.name
                }
            }));

            return {
                sources,
                subtitles: [],
                diagnostics: []
            };
        } catch (error) {
            console.log(`[VidSrc Debug] FATAL ERROR:`, error);
            return this.emptyResult(
                error instanceof Error
                    ? error.message
                    : 'Unknown provider error',
                media
            );
        }
    }

    private buildPageUrl(media: ProviderMediaObject): string {
        if (media.type === 'movie') {
            return `${this.BASE_URL}/embed/movie?tmdb=${media.tmdbId}`;
        } else {
            return `${this.BASE_URL}/embed/tv?tmdb=${media.tmdbId}&season=${media.s}&episode=${media.e}`;
        }
    }

    private async fetchPage(
        url: string,
        media: ProviderMediaObject
    ): Promise<string | null> {
        try {
            if (url.startsWith('//')) {
                url = 'https:' + url;
            }

            const response = await fetch(url, {
                headers: this.HEADERS
            });

            if (response.status !== 200) {
                return null;
            }

            return await response.text();
        } catch {
            return null;
        }
    }

    private extractSecondUrl(html: string): { url: string } | null {
        const src = html.match(
            /<iframe[^>]*\s+src=["']([^"']+)["'][^>]*>/i
        )?.[1];

        if (!src) {
            return null;
        }

        return { url: src };
    }

    private extractThirdUrl(
        html: string,
        secondUrl: string
    ): { url: string } | null {
        const relSrc = html.match(/src:\s*['"]([^'"]+)['"]/i)?.[1];
        if (!relSrc) {
            return null;
        }

        if (secondUrl.startsWith('//')) {
            secondUrl = 'https:' + secondUrl;
        }

        let url: string;
        try {
            url = new URL(relSrc, secondUrl).href;
        } catch {
            return null;
        }

        return { url };
    }

    private extractM3u8Urls(thirdHtml: string): string[] | null {
        // Karena kita sudah menembus RCP, kita coba lagi Regex asli yang ringan
        const fileField = thirdHtml.match(/file\s*:\s*["']([^"']+)["']/i)?.[1];
        
        if (!fileField) {
            console.log(`[VidSrc Senter X-Ray] Regex "file:" masih gagal! Mencari blok JavaScript yang disembunyikan...`);
            
            const scripts = thirdHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
            if (scripts) {
                scripts.forEach((script, index) => {
                    if (script.length > 300 || script.toLowerCase().includes('m3u8') || script.toLowerCase().includes('atob')) {
                        console.log(`[VidSrc Senter X-Ray] Ditemukan Script Mencurigakan #${index + 1}:`);
                        console.log(script.substring(0, 2000));
                    }
                });
            } else {
                console.log(`[VidSrc Senter X-Ray] Ruangan ini kosong, tidak ada tag <script> sama sekali!`);
            }
            
            const directM3u8 = thirdHtml.match(/(https:\/\/[^"']+\.m3u8[^"']*)/i);
            if (directM3u8) {
                console.log(`[VidSrc Senter X-Ray] Kutemukan link m3u8 langsung: ${directM3u8[1]}`);
                return [directM3u8[1]];
            }
            
            return null;
        }

        const playerDomains = new Map<string, string>();
        playerDomains.set('{v1}', 'neonhorizonworkshops.com');
        playerDomains.set('{v2}', 'wanderlynest.com');
        playerDomains.set('{v3}', 'orchidpixelgardens.com');
        playerDomains.set('{v4}', 'cloudnestra.com');

        const rawUrls = fileField.split(/\s+or\s+/i);

        const m3u8Urls = rawUrls.map((template) => {
            let url = template;
            for (const [placeholder, domain] of playerDomains.entries()) {
                url = url.replace(placeholder, domain);
            }
            if (url.includes('{') || url.includes('}')) {
                return null;
            }
            return url;
        });

        const filteredM3u8Urls = m3u8Urls.filter(
            (url): url is string => url !== null
        );

        return filteredM3u8Urls.length > 0 ? filteredM3u8Urls : null;
    }

    private emptyResult(
        message: string,
        media: ProviderMediaObject
    ): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [
                {
                    code: 'PROVIDER_ERROR',
                    message: `${this.name}: ${message}.`,
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
