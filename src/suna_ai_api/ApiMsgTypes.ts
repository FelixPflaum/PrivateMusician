export interface BillingResponse {
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

export interface LyricsResponse {
    id: string;
};

export interface LyricsProgressResponse {
    text?: string;
    title?: string;
    status: "complete" | "";
};

export interface GenerateRequest {
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

export interface GenerateMetaData {
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

export interface ClipInfo {
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
    status: "complete" | "submitted" | "streaming";
};

export interface GenerateResponse {
    id: string;
    clips: ClipInfo[],
    metadata: GenerateMetaData;
    major_model_version: string;
    status: "complete" | "";
    created_at: string;
    batch_size: number;
};

export type ClipInfoResponse = ClipInfo[];