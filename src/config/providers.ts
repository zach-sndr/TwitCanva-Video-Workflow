/**
 * providers.ts
 *
 * Central registry for AI providers and their models.
 * Extracted from NodeControls.tsx for shared use across the app.
 */

// ============================================================================
// PROVIDER DEFINITIONS
// ============================================================================

export interface ProviderKeyField {
    key: string;
    label: string;
    placeholder: string;
}

export interface Provider {
    id: string;
    name: string;
    keyFields: ProviderKeyField[];
}

export const PROVIDERS: Provider[] = [
    {
        id: 'google',
        name: 'Google',
        keyFields: [
            { key: 'GEMINI_API_KEY', label: 'API Key', placeholder: 'Enter Gemini API key' }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        keyFields: [
            { key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'Enter OpenAI API key' }
        ]
    },
    {
        id: 'kling',
        name: 'Kling AI',
        keyFields: [
            { key: 'KLING_ACCESS_KEY', label: 'Access Key', placeholder: 'Enter Kling access key' },
            { key: 'KLING_SECRET_KEY', label: 'Secret Key', placeholder: 'Enter Kling secret key' }
        ]
    },
    {
        id: 'hailuo',
        name: 'Hailuo',
        keyFields: [
            { key: 'HAILUO_API_KEY', label: 'API Key', placeholder: 'Enter Hailuo API key' }
        ]
    },
    {
        id: 'fal',
        name: 'Fal AI',
        keyFields: [
            { key: 'FAL_API_KEY', label: 'API Key', placeholder: 'Enter Fal AI API key' }
        ]
    },
    {
        id: 'kie',
        name: 'Kie.ai',
        keyFields: [
            { key: 'KIE_API_KEY', label: 'API Key', placeholder: 'Enter Kie.ai API key' }
        ]
    }
];

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export interface ImageModel {
    id: string;
    name: string;
    provider: string;
    supportsImageToImage: boolean;
    supportsMultiImage: boolean;
    recommended?: boolean;
    resolutions: string[];
    aspectRatios: string[];
}

export interface VideoModel {
    id: string;
    name: string;
    provider: string;
    supportsTextToVideo: boolean;
    supportsImageToVideo: boolean;
    supportsMultiImage: boolean;
    recommended?: boolean;
    durations: number[];
    resolutions: string[];
    aspectRatios: string[];
}

export const VIDEO_MODELS: VideoModel[] = [
    { id: 'veo-3.1', name: 'Veo 3.1', provider: 'google', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [4, 6, 8], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'kling-v2-1', name: 'Kling V2.1', provider: 'kling', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, recommended: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'kling-v2-1-master', name: 'Kling V2.1 Master', provider: 'kling', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'kling-v2-5-turbo', name: 'Kling V2.5 Turbo', provider: 'kling', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'kling-v2-6', name: 'Kling 2.6 (Motion)', provider: 'kling', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'hailuo-2.3', name: 'Hailuo 2.3', provider: 'hailuo', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5], resolutions: ['768p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'hailuo-2.3-fast', name: 'Hailuo 2.3 Fast', provider: 'hailuo', supportsTextToVideo: false, supportsImageToVideo: true, supportsMultiImage: false, durations: [5], resolutions: ['768p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'hailuo-02', name: 'Hailuo 02', provider: 'hailuo', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [5], resolutions: ['768p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'kie-veo3', name: 'Veo 3.1 (Kie.ai)', provider: 'kie', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [4, 6, 8], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'kie-veo3-fast', name: 'Veo 3.1 Fast (Kie.ai)', provider: 'kie', supportsTextToVideo: true, supportsImageToVideo: true, supportsMultiImage: true, durations: [4, 6, 8], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'kie-veo3-extend', name: 'Veo 3.1 Extend (Kie.ai)', provider: 'kie', supportsTextToVideo: false, supportsImageToVideo: true, supportsMultiImage: false, durations: [4, 6, 8], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
    { id: 'kie-kling-2.6-motion-control', name: 'Kling 2.6 Motion Control (Kie.ai)', provider: 'kie', supportsTextToVideo: false, supportsImageToVideo: true, supportsMultiImage: true, durations: [5, 10], resolutions: ['Auto', '720p', '1080p'], aspectRatios: ['16:9', '9:16'] },
];

export const IMAGE_MODELS: ImageModel[] = [
    {
        id: 'gpt-image-1.5',
        name: 'GPT Image 1.5',
        provider: 'openai',
        supportsImageToImage: true,
        supportsMultiImage: true,
        recommended: true,
        resolutions: ["Auto", "1K", "2K", "4K"],
        aspectRatios: ["Auto", "1024x1024", "1536x1024", "1024x1536"]
    },
    {
        id: 'gemini-pro',
        name: 'Nano Banana Pro',
        provider: 'google',
        supportsImageToImage: true,
        supportsMultiImage: true,
        resolutions: ["1K", "2K", "4K"],
        aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9"]
    },
    {
        id: 'kling-v1-5',
        name: 'Kling V1.5',
        provider: 'kling',
        supportsImageToImage: true,
        supportsMultiImage: false,
        resolutions: ["1K", "2K"],
        aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"]
    },
    {
        id: 'kling-v2-1',
        name: 'Kling V2.1',
        provider: 'kling',
        supportsImageToImage: false,
        supportsMultiImage: true,
        recommended: true,
        resolutions: ["1K", "2K"],
        aspectRatios: ["Auto", "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "21:9"]
    },
    {
        id: 'grok-imagine-text-to-image',
        name: 'Grok Imagine',
        provider: 'kie',
        supportsImageToImage: false,
        supportsMultiImage: false,
        recommended: true,
        resolutions: ["1K", "2K", "4K"],
        aspectRatios: ["Auto", "1:1", "3:2", "2:3", "16:9", "9:16"]
    },
    {
        id: 'grok-imagine-image-to-image',
        name: 'Grok Imagine (I2I)',
        provider: 'kie',
        supportsImageToImage: true,
        supportsMultiImage: false,
        resolutions: ["1K", "2K", "4K"],
        aspectRatios: ["Auto", "1:1", "3:2", "2:3", "16:9", "9:16"]
    },
];

/** All model IDs for backward-compatible default */
export const ALL_MODEL_IDS = [
    ...IMAGE_MODELS.map(m => m.id),
    ...VIDEO_MODELS.map(m => m.id)
];
