import sharp from 'sharp';

function getTargetSize(targetAspectRatio, targetResolution) {
    const targetLandscape = targetAspectRatio !== '9:16';
    const resolutionBase = {
        '4K': { width: 3840, height: 2160 },
        '1080p': { width: 1920, height: 1080 },
        '720p': { width: 1280, height: 720 },
        '512p': { width: 910, height: 512 }
    }[targetResolution] || { width: 1280, height: 720 };

    return targetLandscape
        ? resolutionBase
        : { width: resolutionBase.height, height: resolutionBase.width };
}

function getTargetRatio(targetAspectRatio) {
    return targetAspectRatio === '9:16' ? (9 / 16) : (16 / 9);
}

export async function normalizeImageForVeo(dataUrl, targetAspectRatio, targetResolution) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;

    const match = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid image input format for Veo (expected data URL)');
    }

    const sourceMimeType = match[1];
    const sourceBuffer = Buffer.from(match[2], 'base64');
    const targetRatio = getTargetRatio(targetAspectRatio);
    const targetSize = getTargetSize(targetAspectRatio, targetResolution);

    const oriented = sharp(sourceBuffer).rotate();
    const metadata = await oriented.metadata();
    const srcWidth = metadata.width || targetSize.width;
    const srcHeight = metadata.height || targetSize.height;
    const srcRatio = srcWidth / srcHeight;

    let cropWidth = srcWidth;
    let cropHeight = srcHeight;

    if (Math.abs(srcRatio - targetRatio) > 0.002) {
        if (srcRatio > targetRatio) {
            cropWidth = Math.max(1, Math.round(srcHeight * targetRatio));
            cropHeight = srcHeight;
        } else {
            cropWidth = srcWidth;
            cropHeight = Math.max(1, Math.round(srcWidth / targetRatio));
        }
    }

    const outputBuffer = await sharp(sourceBuffer)
        .rotate()
        .resize(cropWidth, cropHeight, { fit: 'cover', position: 'centre' })
        .resize(targetSize.width, targetSize.height, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 92 })
        .toBuffer();

    console.log('[Veo Input Normalize]', {
        sourceMimeType,
        sourceSize: `${srcWidth}x${srcHeight}`,
        targetAspectRatio,
        targetResolution,
        outputSize: `${targetSize.width}x${targetSize.height}`
    });

    return {
        mimeType: 'image/jpeg',
        imageBytes: outputBuffer.toString('base64'),
        buffer: outputBuffer,
        sourceWidth: srcWidth,
        sourceHeight: srcHeight,
        outputWidth: targetSize.width,
        outputHeight: targetSize.height,
        targetAspectRatio,
        targetResolution
    };
}

export async function normalizeImageDataUrlForVeo(dataUrl, targetAspectRatio, targetResolution) {
    const normalized = await normalizeImageForVeo(dataUrl, targetAspectRatio, targetResolution);
    if (!normalized) return null;
    return `data:${normalized.mimeType};base64,${normalized.imageBytes}`;
}
