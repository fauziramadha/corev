import { BaseProvider } from '@omss/framework';
import type {
    ProviderCapabilities,
    ProviderMediaObject,
    ProviderResult,
    Source,
    Subtitle
} from '@omss/framework';
import { encryptItemId } from './encrypt.js';
import { VidrockStreams, VidrockCDN } from './vidrock.types.js';

const PROXY_PREFIX = 'https://proxy.vidrock.store/';

export class VidRockProvider extends BaseProvider {
    readonly id = 'vidrock';
    readonly name = 'VidRock';
    readonly enabled = true;
    readonly BASE_URL = 'https://vidrock.ru/';
    readonly SUB_BASE_URL = 'https://sub.vdrk.site';
    
    // PATCH 1: Pakaian Khusus untuk mengambil data JSON (API)
    readonly API_HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: this.BASE_URL,
        Origin: this.BASE_URL.replace(/\/$/, '')
    };

    // PATCH 2: Pakaian Khusus Penonton Asli (Video Player)
    readonly STREAM_HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
        Accept: '*/*', // Menyamar sebagai pemutar video sungguhan
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: this.BASE_URL,
        Origin: this.BASE_URL.replace(/\/$/, '')
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv']
    };

    private logSafe(action: string, data: any) {
        try {
            const output = typeof data === 'string' ? data : JSON.stringify(data);
            console.log(`[VidRock Debug] ${action}:`, output.length > 500 ? output.substring(0, 500) + '... (truncated)' : output);
        } catch (e) {
            console.log(`[VidRock Debug] ${action}: (Unloggable data)`);
        }
    }

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
            const pageUrl = await this.buildUrl(media);
            this.logSafe('Fetching API URL', pageUrl);

            const data = await this.fetchPage(pageUrl);

            if (!data) {
                this.logSafe('Error', 'Failed to fetch page data. Possible encryption or endpoint change.');
                return this.emptyResult('Failed to fetch page');
            }

            this.logSafe('API Response JSON', data);

            const resp = data as VidrockStreams;
            const sources: Source[] = [];
            const cleanOrigin = this.BASE_URL.replace(/\/$/, '');

            for (const [serverName, stream] of Object.entries(resp)) {
                if (!stream?.url) continue;

                let finalUrl: string;
                const providerName = `${this.name} - ${serverName}`;

                if (stream.url.includes('hls2.vdrk.site')) {
                    this.logSafe('Processing Asian Stream (hls2)', stream.url);
                    const secondData = (await this.fetchPage(stream.url)) as
                        | VidrockCDN[]
                        | null;
                    if (!secondData) continue;

                    secondData.forEach((obj) => {
                        if (obj.url.startsWith(PROXY_PREFIX)) {
                            const encodedPath = obj.url.slice(
                                PROXY_PREFIX.length
                            );
                            finalUrl = decodeURIComponent(
                                encodedPath.replace(/^\//, '')
                            );
                        } else {
                            finalUrl = obj.url;
                        }

                        let streamHeaders;
                        
                        // PATCH 3: Menggunakan STREAM_HEADERS untuk proksi video
                        if (finalUrl.includes('storrrrrrm.site') || finalUrl.includes('hellstorm.lol')) {
                            this.logSafe('Applying Vidrock Stream Headers to Asian CDN', finalUrl);
                            streamHeaders = {
                                ...this.STREAM_HEADERS,
                                Referer: this.BASE_URL,
                                Origin: cleanOrigin
                            };
                        } else {
                            this.logSafe('Applying LokLok Stream Headers to Asian CDN', finalUrl);
                            streamHeaders = {
                                ...this.STREAM_HEADERS,
                                Referer: 'https://lok-lok.cc/',
                                Origin: 'https://lok-lok.cc'
                            };
                        }

                        const proxyUrl = this.createProxyUrl(finalUrl, streamHeaders);
                        
                        this.logSafe('Generated Asian Proxy URL', proxyUrl);

                        sources.push({
                            url: proxyUrl,
                            type: obj.url.includes('.mp4') ? 'mp4' : 'hls',
                            quality: obj.resolution + 'p',
                            audioTracks: [
                                {
                                    language:
                                        stream.language === 'English'
                                            ? 'eng'
                                            : 'unknown',
                                    label: stream.language ?? 'Unknown'
                                }
                            ],
                            provider: { id: this.id, name: providerName }
                        });
                    });

                    continue;
                } else {
                    let headersToProxy;

                    // PATCH 4: Menggunakan STREAM_HEADERS untuk proksi video
                    if (stream.url.includes('storrrrrrm.site') || stream.url.includes('hellstorm.lol')) {
                        this.logSafe('Applying Standard Stream Headers to CDN', stream.url);
                        headersToProxy = { ...this.STREAM_HEADERS, Referer: this.BASE_URL, Origin: cleanOrigin };
                    } else if (stream.url.includes('67streams')) {
                        headersToProxy = {
                              Referer: this.BASE_URL,
                              Origin: cleanOrigin
                          };
                    } else {
                        headersToProxy = { ...this.STREAM_HEADERS, Referer: this.BASE_URL, Origin: cleanOrigin };
                    }

                    finalUrl = this.createProxyUrl(stream.url, headersToProxy);
                    this.logSafe('Generated Proxy URL', finalUrl);
                }

                sources.push({
                    url: finalUrl,
                    quality: '1080',
                    type: stream.url.includes('.mp4') ? 'mp4' : 'hls',
                    audioTracks: [
                        {
                            language:
                                stream.language === 'English'
                                    ? 'eng'
                                    : 'unknown',
                            label: stream.language ?? 'Unknown'
                        }
                    ],
                    provider: { id: this.id, name: providerName }
                });
            }

            const subtitles = await this.fetchSubtitles(media);

            return {
                sources,
                subtitles,
                diagnostics: []
            };
        } catch (error) {
            this.logSafe('Critical Error', error instanceof Error ? error.message : 'Unknown provider error');
            return this.emptyResult(
                error instanceof Error
                    ? error.message
                    : 'Unknown provider error'
            );
        }
    }

    private async fetchSubtitles(
        media: ProviderMediaObject
    ): Promise<Subtitle[]> {
        try {
            let subUrl: string;
            if (media.type === 'tv') {
                subUrl = `${this.SUB_BASE_URL}/v2/tv/${media.tmdbId}/${media.s}/${media.e}`;
            } else {
                subUrl = `${this.SUB_BASE_URL}/v2/movie/${media.tmdbId}`;
            }

            this.logSafe('Fetching Subtitles', subUrl);

            // PATCH 5: Subtitle aman memakai API_HEADERS
            const response = await fetch(subUrl, {
                headers: {
                    ...this.API_HEADERS,
                    Referer: this.BASE_URL
                }
            });

            if (response.status !== 200) {
                return [];
            }

            const subsData = (await response.json()) as Array<{
                label: string;
                file: string;
            }>;

            return subsData.map((sub) => ({
                url: this.createProxyUrl(sub.file, {
                    ...this.STREAM_HEADERS,
                    Referer: subUrl
                }),
                format: 'vtt',
                label: sub.label
            }));
        } catch {
            return [];
        }
    }

    private async buildUrl(media: ProviderMediaObject): Promise<string> {
        let itemId: string;
        if (media.type === 'tv') {
            itemId = `${media.tmdbId}_${media.s}_${media.e}`;
        } else {
            itemId = `${media.tmdbId}`;
        }

        const encrypted = await encryptItemId(itemId);
        return `${this.BASE_URL}api/${media.type}/${encrypted}`;
    }

    private async fetchPage(url: string): Promise<any | null> {
        try {
            // PATCH 6: Selalu gunakan API_HEADERS untuk mengambil data JSON
            const response = await fetch(url, {
                headers: { ...this.API_HEADERS, Referer: this.BASE_URL },
                referrer: this.BASE_URL
            });

            if (response.status !== 200) {
                this.logSafe('Fetch Page Failed', `Status ${response.status} for ${url}`);
                return null;
            }

            const contentType = response.headers.get('content-type') ?? '';

            if (contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch (error) {
            this.logSafe('Fetch Page Exception', error);
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
                headers: this.API_HEADERS
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
