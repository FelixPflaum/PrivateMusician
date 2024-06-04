import { Logger } from "../Logger";
import type { BillingResponse, ClipInfo, ClipInfoResponse, GenerateRequest, GenerateResponse, LyricsProgressResponse, LyricsResponse } from "./ApiMsgTypes";

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

    private readonly logger = new Logger("SunoAiPi");
    private readonly sessionId: string;
    private readonly headers: { [key: string]: string };
    private token?: string;
    private lastTokenRenew = 0;
    private renewTimeout?: NodeJS.Timeout;

    private constructor(headers: { [key: string]: string }, sessionId: string) {
        this.headers = headers;
        this.sessionId = sessionId;
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

    private renewToken: () => Promise<void> = async () => {
        const now = Date.now();
        if (now - this.lastTokenRenew < 60_000) return;
        this.lastTokenRenew = now;

        this.logger.log("renew token");
        const res = await this.apiPost(`${SunoAiApi.CLERK_URL}/v1/client/sessions/${this.sessionId}/tokens?_clerk_js_version==4.73.2`);
        const token = res["jwt"];

        this.logger.log("newToken: " + token);
        this.token = token;

        this.renewTimeout = setTimeout(this.renewToken, 100_000);
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
        await sleep(5_000);
        let lyricsRes = await this.apiGet(`${SunoAiApi.API_URL}/api/generate/lyrics/${id}`) as LyricsProgressResponse;
        while (lyricsRes.status !== "complete") {
            await sleep(5_000);
            lyricsRes = await this.apiGet(`${SunoAiApi.API_URL}/api/generate/lyrics/${id}`) as LyricsProgressResponse;
        }

        return {
            title: lyricsRes.title!,
            text: lyricsRes.text!,
        };
    }

    /**
     * Generate a song using custom lyrics and style. Resolve when status of all clips is completed.
     * @param title The title of the song.
     * @param lyrics Custom lyrics or a lyrics generation prompt.
     * @param styleTags 
     * @returns Array of ClipInfo objects when their status changes to streaming or completed.
     */
    generateCustomSong(title: string, lyrics: string, styleTags: string) {
        return this.generateSongs(lyrics, { title: title, tags: styleTags });
    }

    /**
     * Resolve when status of all clips is completed.
     * @param ids The ids of the clips to wait for.
     * @param onClipDone Callback for when individual clips are completed.
     */
    async waitForClipCompletion(clips: ClipInfo[], onClipDone: (clip: ClipInfo) => void): Promise<ClipInfo[]> {
        const clipIds = clips.map((clip) => clip.id);
        const progressUrl = `${SunoAiApi.API_URL}/api/feed/?ids=${clipIds.join(",")}`;

        const lastStatus: { [id: string]: ClipInfo } = {};
        for (const clip of clips) {
            lastStatus[clip.id] = clip;
        }

        while (true) {
            await this.renewToken();
            this.logger.log("Get clip progress info: " + progressUrl);
            const progressRes = await this.apiGet(progressUrl) as ClipInfoResponse;
            const done = progressRes.every(clip => {
                if (clip.metadata.error_message) {
                    throw new Error("Error on song generation request: " + clip.metadata.error_message);
                }
                if (clip.status == "complete") {
                    if (lastStatus[clip.id]?.status != clip.status) {
                        lastStatus[clip.id] = clip;
                        onClipDone(clip);
                    }
                    return true;
                }
                return false;
            });
            if (done) return Object.values(lastStatus);
            await sleep(10_000);
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

        this.logger.log("generateSongs req: " + JSON.stringify(reqOptions, null, 4));
        const res = await this.apiPost(`${SunoAiApi.API_URL}/api/generate/v2/`, reqOptions) as GenerateResponse;
        //this.logger.log("generateSongs res: " + JSON.stringify(res, null, 4));

        const clipIds = res.clips.map((audio) => audio.id);
        const progressUrl = `${SunoAiApi.API_URL}/api/feed/?ids=${clipIds.join(",")}`;
        while (true) {
            await sleep(10_000);
            await this.renewToken();
            this.logger.log("Get clip info: " + progressUrl);
            const progressRes = await this.apiGet(progressUrl) as ClipInfoResponse;

            progressRes.every(clip => {
                if (clip.metadata.error_message) throw new Error("Error on song generation request: " + clip.metadata.error_message);
            });

            if (progressRes.every(clip => clip.status == "streaming" || clip.status == "complete")) {
                return progressRes;
            }
        }
    }
}
