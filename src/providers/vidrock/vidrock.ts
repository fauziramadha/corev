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
    
    // Header standar untuk mengambil data halaman (Mimetik Android)
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': this.BASE_URL,
        'Origin': this.BASE_URL,
        'Sec-Ch-Ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
    };

    // Header mutlak (Bunglon) khusus untuk menipu Cloudflare saat mengunduh pecahan video .ts
    readonly PROXY_STREAM_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': this.BASE_URL,
        'Origin': this.BASE_URL,
        'Sec-Ch-Ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'no-cors', // Mode krusial agar tidak dicekik
        'Sec-Fetch-Site': 'same-site' // Mengaku sebagai orang dalam
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
            const pageUrl = await this.buildUrl(media);
            const data = await this.fetchPage(pageUrl);

            if (!data) {
                return this.emptyResult('Failed to fetch page');
            }

            const resp = data as VidrockStreams;
            const sources: Source[] = [];

            for (const [_, stream] of Object.entries(resp)) {
                if (!stream?.url) continue;

                let finalUrl: string;

                if (stream.url.includes('hls2.vdrk.site')) {
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

                        sources.push({
                            // Menyuntikkan tameng pelindung ke dalam proksi
                            url: this.createProxyUrl(finalUrl, {
                                ...this.PROXY_STREAM_HEADERS
                            }),
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
                            provider: { id: this.id, name: this.name }
                        });
                    });

                    continue;
                } else {
                    finalUrl = this.createProxyUrl(
                        stream.url,
                        stream.url.includes('67streams')
                            ? {
                                  ...this.PROXY_STREAM_HEADERS,
                                  referrer: this.BASE_URL,
                                  origin: this.BASE_URL.replace('net/', 'net')
                              }
                            : { ...this.PROXY_STREAM_HEADERS }
                    );
                }

                sources.push({
                    url: finalUrl,
                    quality: '1080',
                    type: 'hls',
                    audioTracks: [
                        {
                            language:
                                stream.language === 'English'
                                    ? 'eng'
                                    : 'unknown',
                            label: stream.language ?? 'Unknown'
                        }
                    ],
                    provider: { id: this.id, name: this.name },
                    // Mengirimkan header secara utuh ke frontend agar OMSS bisa mengeksekusinya
                    headers: this.PROXY_STREAM_HEADERS 
                });
            }

            const subtitles = await this.fetchSubtitles(media);

            return {
                sources,
                subtitles,
                diagnostics: []
            };
        } catch (error) {
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

            const response = await fetch(subUrl, {
                headers: {
                    ...this.HEADERS,
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
                    ...this.HEADERS,
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
            const response = await fetch(url, {
                headers: { ...this.HEADERS, Referer: this.BASE_URL },
                referrer: this.BASE_URL
            });

            if (response.status !== 200) return null;

            const contentType = response.headers.get('content-type') ?? '';

            if (contentType.includes('application/json')) {
                return await response.json();
            }

            return await response.text();
        } catch {
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
                headers: this.HEADERS
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
