interface BillingResponse {
    cancel_on: any; // Unknown
    changing_to: any; // Unknown
    credit_packs: { id: string, amount: number, price_usd: number }[];
    credits: number;
    is_active: boolean;
    is_past_due: boolean;
    monthly_limit: number;
    monthly_usage: number;
    period: null
    plan: any; // Unknown
    plans: { id: string, level: number, name: string, features: string, monthly_price_usd: number }[];
    renews_on: any; // Unknown
    subscription_type: any; // Unknown
    total_credits_left: number;
};

interface LyricsResponse {
    id: string;
};

interface LyricsProgressResponse {
    text?: string;
    title?: string;
    status: "complete" | "";
};

interface GenerateRequest {
    continue_at?: any; // Unknown
    continue_clip_id?: number;
    infill_end_s?: any; // Unknown
    infill_start_s?: any; // Unknown
    mv: string;
    gpt_description_prompt?: string; // GPT prompt.
    prompt: string; // Lyrics prompt or custom lyrics.
    tags?: string; // Tags aka style if used with custom lyrics.
    title?: string; // Song title if used with custom lyrics.
    make_instrumental?: boolean;
};

interface GenerateMetaData {
    prompt?: string; // Lyrics prompt or custom lyrics in custom mode.
    tags?: string; // Tags if used in custom mode.
    gpt_description_prompt?: string;
    audio_prompt_id: any; // Unknown
    history: any; // Unknown
    concat_history: any; // Unknown
    type: any; // Unknown
    duration?: number;
    refund_credits: any; // Unknown
    stream?: boolean;
    error_type: any;
    error_message?: string;
};

interface ClipInfo {
    id: string;
    video_url: string;
    audio_url: string;
    image_url?: string;
    image_large_url?: string;
    is_video_pending: boolean;
    major_model_version: string;
    model_name: string;
    metadata: GenerateMetaData;
    is_liked: false,
    user_id: string;
    display_name: string;
    handle: string;
    is_handle_updated: boolean;
    avatar_image_url: any; // Unknown
    is_trashed: boolean;
    reaction: any; // Unknown
    title: string;
    created_at: string;
    status: "completed" | "submitted" | "streaming";
};

interface GenerateResponse {
    id: string;
    clips: ClipInfo[],
    metadata: GenerateMetaData;
    major_model_version: string;
    status: "complete" | "";
    created_at: string;
    batch_size: number;
};

type ClipInfoResponse = ClipInfo[];

/**
 * Resolve after a given duration.
 * @param timeout How long to wait in ms.
 * @param max Optionally roll wait time up to this duration in ms.
 */
const sleep = (timeout: number, max?: number) => {
    if (max && max > timeout) {
        timeout = Math.round(timeout + Math.random() * (max - timeout));
    }
    if (timeout <= 0) return Promise.resolve();
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
};

export class SunoAiApi {
    private static CLERK_URL = "https://clerk.suno.com";
    private static API_URL = "https://studio-api.suno.ai";

    private readonly sessionId: string;
    private readonly headers: { [key: string]: string };
    private token?: string;
    private lastTokenRenew = 0;
    private renewTimeout?: NodeJS.Timeout;

    private constructor(headers: { [key: string]: string }, sessionId: string) {
        this.headers = headers;
        this.sessionId = sessionId;

        const renewLoop = () => {
            this.renewToken().then(() => {
                this.renewTimeout = setTimeout(renewLoop, 100_000);
            });
        }
        renewLoop();
    }

    /**
     * Clear events.
     */
    destroy() {
        if (this.renewTimeout) {
            clearTimeout(this.renewTimeout);
        }
    }

    /**
     * Create new SunoAiApi.
     * @param userAgent User agent for request headers.
     * @param cookie Cookie for request headers.
     * @returns 
     */
    static async create(userAgent: string, cookie: string) {
        const headers = {
            "User-Agent": userAgent,
            "Cookie": cookie,
        };
        const res = await fetch(`${SunoAiApi.CLERK_URL}/v1/client?_clerk_js_version=4.73.2`, { headers });
        if (res.status != 200) {
            throw new Error("Could not get session id! Status: " + res.status);
        }
        const body = await res.json();
        const sessionId = body.response["last_active_session_id"];
        if (!sessionId) {
            throw new Error("Could not get session id!");
        }
        const sapi = new SunoAiApi(headers, sessionId);
        await sapi.renewToken();
        return sapi;
    }

    private makeApiHeadsers(body?: string) {
        const headers = { ...this.headers };

        if (body) {
            headers["Content-Type"] = "application/json";
            headers["Content-Length"] = new Blob([body]).size.toString();
        }

        if (this.token) {
            headers["Authorization"] = `Bearer ${this.token}`;
        }

        return headers;
    }

    private async apiPost(url: string, sendData?: Object) {
        const body = sendData ? JSON.stringify(sendData) : "";

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 10_000);

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: this.makeApiHeadsers(body),
                body: body,
                signal: controller.signal,
            });

            if (res.status != 200) {
                throw new Error("Status code: " + res.status + " | " + (await res.text()));
            }

            return await res.json();
        } catch (error) {
            if (error instanceof Error && error.name == "AbortError") throw new Error("Request timed out!");
            throw error;
        } finally {
            clearTimeout(id);
        }
    }

    private async apiGet(url: string) {
        const res = await fetch(url, {
            method: "GET",
            headers: this.makeApiHeadsers(),
        });

        if (res.status != 200) {
            throw new Error("Status code: " + res.status + " | " + (await res.text()));
        }

        return await res.json();
    }

    private async renewToken(): Promise<void> {
        const now = Date.now();
        if (now - this.lastTokenRenew < 60_000) return;
        this.lastTokenRenew = now;

        console.log("renew token");
        const res = await this.apiPost(`${SunoAiApi.CLERK_URL}/v1/client/sessions/${this.sessionId}/tokens?_clerk_js_version==4.73.2`);
        const token = res["jwt"];

        console.log("newToken:", token);
        this.token = token;
    }

    /**
     * Get billing info, including credits info.
     * @returns The BillingResponse.
     */
    async checkBillingInfo(): Promise<BillingResponse> {
        await this.renewToken();

        const response = await this.apiGet(`${SunoAiApi.API_URL}/api/billing/info/`) as BillingResponse;
        return response;
    }

    /**
     * Generate lyrics.
     * @param prompt The prompt to generate lyrics with.
     * @returns The lyrics string.
     */
    async generateLyrics(prompt: string): Promise<{ title: string, text: string }> {
        await this.renewToken();

        const res = await this.apiPost(`${SunoAiApi.API_URL}/api/generate/lyrics/`, { prompt }) as LyricsResponse;
        const id = res.id;
        await sleep(2);
        let lyricsRes = await this.apiGet(`${SunoAiApi.API_URL}/api/generate/lyrics/${id}`) as LyricsProgressResponse;
        while (lyricsRes.status !== 'complete') {
            await sleep(3);
            lyricsRes = await this.apiGet(`${SunoAiApi.API_URL}/api/generate/lyrics/${id}`) as LyricsProgressResponse;
        }

        return {
            title: lyricsRes.title!,
            text: lyricsRes.text!,
        };
    }

    /**
     * Generate a song using custom lyrics and style.
     * @param title The title of the song.
     * @param lyrics Custom lyrics or a lyrics generation prompt.
     * @param styleTags 
     * @returns 
     */
    generateCustomSong(title: string, lyrics: string, styleTags: string) {
        return this.generateSongs(lyrics, { title: title, tags: styleTags });
    }

    /**
     * Resolve when status of all clips is completed.
     * @param ids The ids of the clips to wait for.
     * @param onClipDone Callback for when individual clips are completed.
     */
    async waitForClipCompletion(ids: string[], onClipDone: (id: string) => void) {
        const progressUrl = `${SunoAiApi.API_URL}/api/feed/?ids=${ids.join(',')}`;
       
        const lastStatus: { [id: string]: string } = {};
        for (const id of ids) {
            lastStatus[id] = "";
        }

        while (true) {
            await this.renewToken();
            console.log("Get clip info: " + progressUrl);
            const progressRes = await this.apiGet(progressUrl) as ClipInfoResponse;
            const done = progressRes.every(clip => {
                if (clip.metadata.error_message) {
                    throw new Error("Error on song generation request: " + clip.metadata.error_message);
                }
                if (clip.status == "completed") {
                    if (lastStatus[clip.id] != clip.status) {
                        lastStatus[clip.id] = clip.status;
                        onClipDone(clip.id);
                    }
                    return true;
                }
                return false;
            });
            if (done) return;
            await sleep(10);
        }
    }

    /**
     * Generates songs.
     * @param prompt The gpt prompt or lyrics (prompt) in custom mode, see customSongData.
     * @param customSongData Title and style tags used in custom mode.
     * @param make_instrumental 
     * @returns Array of ClipInfo objects when their status changes to streaming or completed.
     */
    private async generateSongs(prompt: string, customSongData?: { tags: string, title: string }, make_instrumental?: boolean): Promise<ClipInfo[]> {
        await this.renewToken();

        const reqOptions: GenerateRequest = {
            mv: "chirp-v3-5",
            prompt: "",
        };

        if (make_instrumental) reqOptions.make_instrumental = true;

        if (!customSongData) {
            reqOptions.gpt_description_prompt = prompt;
        } else {
            reqOptions.prompt = prompt;
            reqOptions.tags = customSongData.tags;
            reqOptions.title = customSongData.title;
        }

        console.log("generateSongs req: " + JSON.stringify(reqOptions, null, 4));
        const res = await this.apiPost(`${SunoAiApi.API_URL}/api/generate/v2/`, reqOptions) as GenerateResponse;
        console.log("generateSongs res: " + JSON.stringify(res, null, 4));

        const clipIds = res.clips.map((audio) => audio.id);
        const progressUrl = `${SunoAiApi.API_URL}/api/feed/?ids=${clipIds.join(',')}`;
        while (true) {
            await sleep(10);
            await this.renewToken();
            console.log("Get clip info: " + progressUrl);
            const progressRes = await this.apiGet(progressUrl) as ClipInfoResponse;

            progressRes.every(clip => {
                if (clip.metadata.error_message) throw new Error("Error on song generation request: " + clip.metadata.error_message);
            });

            if (progressRes.every(clip => clip.status == "streaming" || clip.status == "completed")) {
                return progressRes;
            }
        }
    }
}
