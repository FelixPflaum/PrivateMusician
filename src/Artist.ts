import { Logger } from "./Logger";
import { L } from "./lang/language";
import { ClipInfo } from "./suna_ai_api/ApiMsgTypes";
import { SunoAiApi } from "./suna_ai_api/SunoAiApi";

// When to shut down clients if they aren't used.
const CLEANUP_TIME = 30 * 60_1000;

export const enum ComissionState {
    billing, lyrics, waitForStream, streaming, clipDone 
};

export type ComissionStatusFunc = (status: ComissionState, statusText: string, doneClip?: ClipInfo) => void;

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

    private async doComissionWork(client: SunoAiApi, songDesc: string | { title: string, text: string }, statusUpdate: ComissionStatusFunc): Promise<{ error?: string, clipInfos: ClipInfo[] }> {
        try {
            statusUpdate(ComissionState.billing, L("Checking payment..."));
            const binfo = await client.checkBillingInfo();
            if (binfo.total_credits_left <= 0) {
                return { error: L("I'm overworked for today, go away!"), clipInfos: [] };
            }
        } catch (error) {
            this.logger.logError("Error on getting billing info!", error);
            return { error: L("I don't want to talk right now!"), clipInfos: [] };
        }

        let text: string;
        let title: string;

        if (typeof songDesc === "string") {
            try {
                statusUpdate(ComissionState.lyrics, L("Writing fire lyrics..."));

                if (!songDesc.toLowerCase().includes(this.language)) {
                    songDesc += " Write song in the language: " + this.language;
                }

                const lyrics = await client.generateLyrics(songDesc);
                text = lyrics.text;
                title = lyrics.title;
            } catch (error) {
                this.logger.logError(`Error on getting lyrics with prompt: ${songDesc}`, error);
                return { error: L("Unable to compose lyrics!"), clipInfos: [] };
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
            return { error: L("Failed to gather band!"), clipInfos: [] };
        }

        statusUpdate(ComissionState.streaming, L("Recording songs..."));

        try {
            const finalClipInfos = await client.waitForClipCompletion(clipInfos, clip => {
                statusUpdate(ComissionState.clipDone, "", clip);
            });
            return { clipInfos: finalClipInfos };
        } catch (error) {
            this.logger.logError(`Error on waiting for clip completion`, error);
            return { error: L("Failed to complete songs."), clipInfos: [] };
        }
    }

    /**
     * Create song from description prompt.
     * @param songDesc 
     * @param statusUpdate 
     * @returns 
     */
    async comission(songDesc: string, statusUpdate: ComissionStatusFunc): Promise<{ error?: string, clipInfos: ClipInfo[] }> {
        let client: ApiClientWrapper | undefined;
        try {
            client = await this.getClient();
            if (!client || !client.client) return { error: L("I'm busy!"), clipInfos: [] };
            const res = await this.doComissionWork(client.client, songDesc, statusUpdate);
            return res;
        } catch (error) {
            this.logger.logError(`Error on comission`, error);
            return { error: L("Studio exploded or something."), clipInfos: [] };
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
    async comissionWithLyrics(title: string, text: string, statusUpdate: ComissionStatusFunc): Promise<{ error?: string, clipInfos: ClipInfo[] }> {
        let client: ApiClientWrapper | undefined;
        try {
            client = await this.getClient();
            if (!client || !client.client) return { error: L("I'm busy!"), clipInfos: [] };
            const res = await this.doComissionWork(client.client, { title, text }, statusUpdate);
            return res;
        } catch (error) {
            this.logger.logError("Error on comission", error);
            return { error: L("Studio exploded or something."), clipInfos: [] };
        } finally {
            if (client) client.release();
        }
    }

    /**
     * Get mp3 files for complete clip.
     * @param clip The completed clip.
     * @returns MP3 file as ArrayBuffer.
     */
    async getMp3FromClip(clip: ClipInfo) {
        const res = await fetch(`https://cdn1.suno.ai/${clip.id}.mp3`);
        if (res.status != 200) {
            this.logger.logError("Could not load mp3 file!", await res.text());
            throw new Error(L("Could not load mp3 file!"));
        }
        return await res.arrayBuffer();
    }
}
