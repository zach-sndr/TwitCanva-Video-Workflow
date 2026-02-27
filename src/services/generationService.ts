/**
 * generationService.ts
 *
 * Frontend service layer for AI content generation.
 * Proxies requests to backend API which handles multiple providers:
 * - Image: Gemini Pro, Kling AI
 * - Video: Veo 3.1, Kling AI
 */

/**
 * Convert aspect ratio to OpenAI size format for GPT Image 1.5
 * Maps frontend-friendly aspect ratios to API-expected dimensions
 */
function mapAspectRatioToOpenAISize(aspectRatio: string | undefined, imageModel: string | undefined): string | undefined {
    if (!aspectRatio || aspectRatio === 'Auto') return 'auto';

    // Only convert for GPT Image 1.5
    if (imageModel === 'gpt-image-1.5') {
        const sizeMap: Record<string, string> = {
            '1:1': '1024x1024',
            '3:2': '1536x1024',
            '2:3': '1024x1536'
        };
        return sizeMap[aspectRatio] || 'auto';
    }

    // For other models, return as-is (they use aspect ratio strings)
    return aspectRatio;
}

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  variations?: 1 | 2 | 4;
  imageBase64?: string | string[]; // Supports single image or array of images
  imageModel?: string; // Image model version (e.g., 'gemini-pro', 'kling-v2')
  nodeId?: string; // ID of the node initiating generation
  // Kling V1.5 reference settings
  klingReferenceMode?: 'subject' | 'face';
  klingFaceIntensity?: number; // 0-100
  klingSubjectIntensity?: number; // 0-100
}

export interface GenerateVideoParams {
  prompt: string;
  imageBase64?: string; // For Image-to-Video (start frame)
  lastFrameBase64?: string; // For frame-to-frame interpolation (end frame)
  referenceImages?: string[]; // For reference/ingredients mode (3+ images)
  aspectRatio?: string;
  resolution?: string; // Add resolution to params
  duration?: number; // Video duration in seconds (e.g., 5, 6, 8, 10)
  videoModel?: string; // Video model version (e.g., 'veo-3.1', 'kling-v2-1')
  motionReferenceUrl?: string; // For Kling 2.6 motion control
  generateAudio?: boolean; // For Kling 2.6 and Veo 3.1 native audio (default: true)
  grokImagineMode?: 'fun' | 'normal' | 'spicy'; // For Kie Grok Imagine video models
  // Kie.ai Veo extend / callbacks
  taskId?: string;
  veoTaskId?: string;
  extendModel?: string;
  seeds?: number;
  watermark?: string;
  callBackUrl?: string;
  nodeId?: string; // ID of the node initiating generation
}

/**
 * Result object for image generation (supports single or multiple images)
 */
export interface ImageGenerationResult {
  resultUrl: string;       // Primary image URL (for backward compatibility)
  resultUrls?: string[];  // All image URLs (for carousel support, e.g., Kie returns 6)
}

/**
 * Generates an image by calling the backend API
 */
export const generateImage = async (params: GenerateImageParams): Promise<ImageGenerationResult> => {
  try {
    // Convert aspect ratio to OpenAI size format for GPT Image 1.5
    const convertedAspectRatio = mapAspectRatioToOpenAISize(params.aspectRatio, params.imageModel);

    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        aspectRatio: convertedAspectRatio
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || response.statusText);
    }

    const data = await response.json();
    if (!data.resultUrl) {
      throw new Error("No image data returned from server");
    }
    // Return both resultUrl (for backward compatibility) and resultUrls (if available)
    return {
      resultUrl: data.resultUrl,
      resultUrls: data.resultUrls || [data.resultUrl]
    };

  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

/**
 * Generates a video by calling the backend API
 */
export const generateVideo = async (params: GenerateVideoParams): Promise<string> => {
  try {
    const response = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || response.statusText);
    }

    const data = await response.json();
    if (!data.resultUrl) {
      throw new Error("No video data returned from server");
    }
    return data.resultUrl;

  } catch (error) {
    console.error("Video Generation Error:", error);
    throw error;
  }
};
