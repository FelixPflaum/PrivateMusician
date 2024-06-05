import { Logger } from "./Logger";
import { L } from "./lang/language";
import type { ClipInfo } from "./suna_ai_api/ApiMsgTypes";
import { SunoAiApi } from "./suna_ai_api/SunoAiApi";

// When to shut down clients if they aren't used.
const CLEANUP_TIME = 30 * 60_1000;

export const enum ComissionState {
    billing, lyrics, waitForStream, streaming, clipDone
};

export type ComissionStatusFunc = (status: ComissionState, statusText: string, songInfo?: SongInfo) => void;

export interface SongInfo {
    title: string;
    lyrics: string;
    duration: number;
    style: string;
    mp3Url: string;
    imgUrl?: string | undefined;
}

class ApiClientWrapper {
    readonly id: number;
    private readonly info: { agent: string, cookie: string };
    lastUsed = 0;
    private isUsed = false;
    private _client?: SunoAiApi;

    constructor(id: number, info: { agent: string, cookie: string }) {
        this.id = id;
        this.info = info;
    }

    get client() {
        return this._client;
    }

    /** Set this as being in use. */
    claim() {
        this.isUsed = true;
        this.lastUsed = Date.now();
    }

    /** Set this to no longer be in use. */
    release() {
        this.isUsed = false;
    }

    /** Check if API clinet is created. */
    isActive() {
        return !!this.client;
    }

    /** Check if API client is created and not in use. */
    isAvailableForUse() {
        return !!this.client && !this.isUsed;
    }

    /** Create API client. */
    async activate() {
        this._client = await SunoAiApi.create(this.info.agent, this.info.cookie);
    }

    /** Destroy API client. */
    deactivate() {
        if (this.isUsed) throw new Error("Can't deactivate used client!");
        if (this._client) {
            this._client.destroy();
            delete this._client;
        }
    }
}

export class Artist {
    private readonly clients: ApiClientWrapper[] = [];
    private readonly logger: Logger = new Logger("Artist");
    readonly name: string;
    style: string;
    language: string;

    constructor(name: string, style: string, lang: string, clientInfos: { agent: string, cookie: string }[]) {
        this.name = name;
        this.style = style;
        this.language = lang;

        for (let i = 0; i < clientInfos.length; i++) {
            this.clients[i] = new ApiClientWrapper(i, clientInfos[i]!);
        }

        const cleanup = () => {
            this.logger.log("Doing cleanup.");
            const now = Date.now();
            for (const clientData of this.clients) {
                if (clientData.isActive() && !clientData.isAvailableForUse() && now > clientData.lastUsed + CLEANUP_TIME) {
                    this.logger.log("Deactivate client " + clientData.id);
                    clientData.deactivate();
                }
            }
            setTimeout(cleanup, 60_000);
        }
        cleanup();
    }

    // TODO: Concurrent requests or client rotation?
    private async getClient() {
        let freeClient: ApiClientWrapper | undefined;

        for (const clientData of this.clients) {
            if (clientData.isAvailableForUse()) {
                freeClient = clientData;
                break;
            }
        }

        if (!freeClient) {
            for (const clientData of this.clients) {
                if (!clientData.isActive()) {
                    this.logger.log("Activate client " + clientData.id);
                    try {
                        await clientData.activate();
                        freeClient = clientData;
                    } catch (error) {
                        this.logger.logError("Failed to activate client!", error);
                    }
                }
            }
        }

        if (!freeClient) return;
        freeClient.claim();
        return freeClient;
    }

    private songInfoFromClip(clip: ClipInfo): SongInfo {
        return {
            title: clip.title,
            lyrics: clip.metadata.prompt ?? "Error",
            duration: clip.metadata.duration ?? 0,
            style: clip.metadata.tags ?? "Error",
            mp3Url: `https://cdn1.suno.ai/${clip.id}.mp3`,
            imgUrl: clip.image_large_url ?? clip.image_url,
        }
    }

    private async doComissionWork(client: SunoAiApi, songDesc: string | { title: string, text: string }, statusUpdate: ComissionStatusFunc): Promise<{ error?: string, songInfos: SongInfo[] }> {
        try {
            statusUpdate(ComissionState.billing, L("Checking payment..."));
            const binfo = await client.checkBillingInfo();
            if (binfo.total_credits_left <= 0) {
                return { error: L("I'm overworked for today, go away!"), songInfos: [] };
            }
        } catch (error) {
            this.logger.logError("Error on getting billing info!", error);
            return { error: L("I don't want to talk right now!"), songInfos: [] };
        }

        let text: string;
        let title: string;

        if (typeof songDesc === "string") {
            try {
                statusUpdate(ComissionState.lyrics, L("Writing fire lyrics..."));

                if (!songDesc.toLowerCase().includes(this.language)) {
                    songDesc += "\nWrite song in the language: " + this.language;
                }

                const lyrics = await client.generateLyrics(songDesc);
                text = lyrics.text;
                title = lyrics.title;
            } catch (error) {
                this.logger.logError(`Error on getting lyrics with prompt: ${songDesc}`, error);
                return { error: L("Unable to compose lyrics!"), songInfos: [] };
            }
        } else {
            text = songDesc.text;
            title = songDesc.title;
        }

        let clipInfos: ClipInfo[];
        try {
            statusUpdate(ComissionState.waitForStream, L("Gathering band..."));
            clipInfos = await client.generateCustomSong(title, text, this.style);
        } catch (error) {
            this.logger.logError(`Error on generateCustomSong`, error);
            return { error: L("Failed to gather band!"), songInfos: [] };
        }

        statusUpdate(ComissionState.streaming, L("Recording songs..."));

        try {
            const finalClipInfos = await client.waitForClipCompletion(clipInfos, clip => {
                statusUpdate(ComissionState.clipDone, "", this.songInfoFromClip(clip));
            });
            return { songInfos: finalClipInfos.map(c => this.songInfoFromClip(c)) };
        } catch (error) {
            this.logger.logError(`Error on waiting for clip completion`, error);
            return { error: L("Failed to complete songs."), songInfos: [] };
        }
    }

    /**
     * Create song from description prompt.
     * @param songDesc 
     * @param statusUpdate 
     * @returns 
     */
    async comission(songDesc: string, statusUpdate: ComissionStatusFunc): Promise<{ error?: string, songInfos: SongInfo[] }> {
        let client: ApiClientWrapper | undefined;
        try {
            client = await this.getClient();
            if (!client || !client.client) return { error: L("I'm busy!"), songInfos: [] };
            const res = await this.doComissionWork(client.client, songDesc, statusUpdate);
            return res;
        } catch (error) {
            this.logger.logError(`Error on comission`, error);
            return { error: L("Studio exploded or something."), songInfos: [] };
        } finally {
            if (client) client.release();
        }
    }

    /**
     * Create song with custom lyrics.
     * @param title 
     * @param text 
     * @param statusUpdate 
     * @returns 
     */
    async comissionWithLyrics(title: string, text: string, statusUpdate: ComissionStatusFunc): Promise<{ error?: string, songInfos: SongInfo[] }> {
        let client: ApiClientWrapper | undefined;
        try {
            client = await this.getClient();
            if (!client || !client.client) return { error: L("I'm busy!"), songInfos: [] };
            const res = await this.doComissionWork(client.client, { title, text }, statusUpdate);
            return res;
        } catch (error) {
            this.logger.logError("Error on comission", error);
            return { error: L("Studio exploded or something."), songInfos: [] };
        } finally {
            if (client) client.release();
        }
    }
}
