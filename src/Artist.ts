import { L } from "./Localization";
import { Logger } from "./Logger";
import { ClipInfo } from "./suna_ai_api/ApiMsgTypes";
import { SunoAiApi } from "./suna_ai_api/SunoAiApi";

// When to shut down clients if they aren't used.
const CLEANUP_TIME = 30 * 60_1000;

class ClientData {
    readonly id: number;
    private readonly info: { agent: string, cookie: string };
    lastUsed = 0;
    isUsed = false; // Client is being used.
    private _client?: SunoAiApi;

    constructor(id: number, info: { agent: string, cookie: string }) {
        this.id = id;
        this.info = info;
    }

    get client() {
        return this._client;
    }

    isActive() {
        return !!this.client;
    }

    isAvailableForUse() {
        return !!this.client && !this.isUsed;
    }

    async activate() {
        this._client = await SunoAiApi.create(this.info.agent, this.info.cookie);
    }

    deactivate() {
        if (this.isUsed) throw new Error("Can't deactivate used client!");
        if (this._client) {
            this._client.destroy();
            delete this._client;
        }
    }
}

export class Artist {
    private readonly clients: ClientData[] = [];
    private readonly logger: Logger = new Logger("Artist");
    readonly name: string;
    private style: string;
    private language: string;

    constructor(name: string, style: string, lang: string, clientInfos: { agent: string, cookie: string }[]) {
        this.name = name;
        this.style = style;
        this.language = lang;

        for (let i = 0; i < clientInfos.length; i++) {
            this.clients[i] = new ClientData(i, clientInfos[i]!);
        }

        const cleanup = () => {
            this.logger.log("Doing cleanup.");
            const now = Date.now();
            for (const clientData of this.clients) {
                if (!clientData.isUsed && clientData.isActive() && now > clientData.lastUsed + CLEANUP_TIME) {
                    this.logger.log("Deactivate client " + clientData.id);
                    clientData.deactivate();
                }
            }
            setTimeout(cleanup, 60_000);
        }
        cleanup();
    }

    /**
     * Get an API client, setting it as being in use. Use setUnused if you are done with it!
     * @returns 
     */
    private async getClient() {
        let freeClient: ClientData | undefined;

        for (const clientData of this.clients) {
            if (clientData.isAvailableForUse()) {
                freeClient = clientData;
                break;
            }
        }

        if (!freeClient) {
            for (const clientData of this.clients) {
                if (!clientData.isUsed && !clientData.isActive()) {
                    if (clientData.client) clientData.client.destroy();
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

        freeClient.isUsed = true;
        freeClient.lastUsed = Date.now();

        return freeClient;
    }

    private async doComissionWork(client: SunoAiApi, songDesc: string | { title: string, text: string }, statusUpdate?: (status: string, doneClip?: ClipInfo) => void): Promise<{ error?: string, clipInfos: ClipInfo[] }> {
        try {
            if (statusUpdate) statusUpdate(L("Checking payment..."));
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
                if (statusUpdate) statusUpdate(L("Writing fire lyrics..."));

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
            if (statusUpdate) statusUpdate(L("Gathering band..."));
            clipInfos = await client.generateCustomSong(title, text, this.style);
        } catch (error) {
            this.logger.logError(`Error on generateCustomSong`, error);
            return { error: L("Failed to gather band!"), clipInfos: [] };
        }

        if (statusUpdate) statusUpdate(L("Recording songs..."));

        try {
            const finalClipInfos = await client.waitForClipCompletion(clipInfos, clip => {
                if (statusUpdate) statusUpdate(L("Recording songs..."), clip);
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
    async comission(songDesc: string, statusUpdate?: (status: string, doneClip?: ClipInfo) => void): Promise<{ error?: string, clipInfos: ClipInfo[] }> {
        let client: ClientData | undefined;
        try {
            client = await this.getClient();
            if (!client || !client.client) return { error: L("I'm already busy!"), clipInfos: [] };
            const res = await this.doComissionWork(client.client, songDesc, statusUpdate);
            return res;
        } catch (error) {
            this.logger.logError(`Error on comission`, error);
            return { error: L("Studio exploded or something."), clipInfos: [] };
        } finally {
            if (client) client.isUsed = false;
        }
    }

    /**
     * Create song with custom lyrics.
     * @param title 
     * @param text 
     * @param statusUpdate 
     * @returns 
     */
    async comissionWithLyrics(title: string, text: string, statusUpdate?: (status: string, doneClip?: ClipInfo) => void): Promise<{ error?: string, clipInfos: ClipInfo[] }> {
        let client: ClientData | undefined;
        try {
            client = await this.getClient();
            if (!client || !client.client) return { error: L("I'm already busy!"), clipInfos: [] };
            const res = await this.doComissionWork(client.client, { title, text }, statusUpdate);
            return res;
        } catch (error) {
            this.logger.logError(`Error on comission`, error);
            return { error: L("Studio exploded or something."), clipInfos: [] };
        } finally {
            if (client) client.isUsed = false;
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
            this.logger.logError(L("Could not load mp3 file!"), await res.text());
            throw new Error("Could not load mp3 file!");
        }
        return await res.arrayBuffer();
    }

    /**
     * Set style used for custom songs.
     * @param style 
     */
    setStyle(style: string) {
        this.style = style;
    }

    /**
     * Get current style tags.
     * @returns 
     */
    getStyle() {
        return this.style;
    }

    /**
    * Set language used for generated lyrics.
    * @param style 
    */
    setLang(language: string) {
        this.language = language;
    }

    /**
     * Get current style tags.
     * @returns 
     */
    getLang() {
        return this.language;
    }
}
