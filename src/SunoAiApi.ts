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
}

interface LyricsResponse {
    id: string;
}

interface LyricsProgressResponse {
    text?: string;
    title?: string;
    status: "complete" | "";
}

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

    private constructor(headers: { [key: string]: string }, sessionId: string) {
        this.headers = headers;
        this.sessionId = sessionId;
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

        const res = await fetch(url, {
            method: "POST",
            headers: this.makeApiHeadsers(body),
            body: body,
        });

        if (res.status != 200) {
            throw new Error("Status code: " + res.status + " | " + (await res.text()));
        }

        return await res.json();
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

    /**
     * Renew jwt token.
     */
    async renewToken(): Promise<void> {
        const now = Date.now();
        if (now - this.lastTokenRenew < 60_000) return;

        console.log("renew token");
        const res = await this.apiPost(`${SunoAiApi.CLERK_URL}/v1/client/sessions/${this.sessionId}/tokens?_clerk_js_version==4.73.2`);
        const token = res["jwt"];

        console.log("newToken:", token);
        this.token = token;
        this.lastTokenRenew = now;
    }

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
}
