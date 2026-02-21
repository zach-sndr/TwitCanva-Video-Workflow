/**
 * kling-kie.js
 *
 * Kling 2.6 Motion Control API via Kie.ai
 * API: https://kie.ai/model/kling-2.6/motion-control.md
 */

const KIE_KLING_BASE_URL = 'https://api.kie.ai/api/v1';

/**
 * Generate video using Kling 2.6 Motion Control via Kie.ai
 *
 * @param {Object} params
 * @param {string} params.prompt - Text prompt to guide the generation
 * @param {string} params.characterImageBase64 - Base64 character reference image
 * @param {string} params.motionVideoBase64 - Base64 motion reference video
 * @param {string} params.apiKey - Kie.ai API key
 * @returns {Promise<string>} URL of the generated video
 */
export async function generateKlingMotionControlViaKie({
    prompt,
    characterImageBase64,
    motionVideoBase64,
    apiKey
}) {
    console.log('\n========================================');
    console.log('[Kling 2.6 Motion Control via Kie.ai] Starting generation');
    console.log(`[Kling 2.6 via Kie.ai] Parameters:`);
    console.log(`  - Prompt: ${prompt ? prompt.substring(0, 50) + '...' : '(none)'}`);
    console.log(`  - Character Image: ${characterImageBase64 ? 'YES' : 'NO'}`);
    console.log(`  - Motion Video: ${motionVideoBase64 ? 'YES' : 'NO'}`);
    console.log('========================================\n');

    if (!apiKey) {
        throw new Error('[Kling 2.6 via Kie.ai] API key is required');
    }

    try {
        // Step 1: Upload character image to get URL
        console.log('[Kling 2.6 via Kie.ai] Uploading character image...');
        const imageUploadRes = await fetch(`${KIE_KLING_BASE_URL}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: characterImageBase64,
                file_type: 'image'
            })
        });

        if (!imageUploadRes.ok) {
            throw new Error(`Failed to upload image: ${await imageUploadRes.text()}`);
        }

        const imageUpload = await imageUploadRes.json();
        const imageUrl = imageUpload.file_url || imageUpload.url;
        console.log('[Kling 2.6 via Kie.ai] Image uploaded:', imageUrl);

        // Step 2: Upload motion video to get URL
        console.log('[Kling 2.6 via Kie.ai] Uploading motion video...');
        const videoUploadRes = await fetch(`${KIE_KLING_BASE_URL}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: motionVideoBase64,
                file_type: 'video'
            })
        });

        if (!videoUploadRes.ok) {
            throw new Error(`Failed to upload video: ${await videoUploadRes.text()}`);
        }

        const videoUpload = await videoUploadRes.json();
        const videoUrl = videoUpload.file_url || videoUpload.url;
        console.log('[Kling 2.6 via Kie.ai] Video uploaded:', videoUrl);

        // Step 3: Create motion control task
        console.log('[Kling 2.6 via Kie.ai] Creating motion control task...');

        const createTaskBody = {
            model: 'kling-2.6/motion-control',
            input: {
                input_urls: [imageUrl],
                video_urls: [videoUrl],
                character_orientation: 'video',
                mode: '720p',
                prompt: prompt || ''
            }
        };

        console.log('[Kling 2.6 via Kie.ai] Request:', JSON.stringify(createTaskBody, null, 2));

        const createRes = await fetch(`${KIE_KLING_BASE_URL}/jobs/createTask`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(createTaskBody)
        });

        if (!createRes.ok) {
            const errorText = await createRes.text();
            throw new Error(`Failed to create task: ${createRes.status} - ${errorText}`);
        }

        const createResult = await createRes.json();
        console.log('[Kling 2.6 via Kie.ai] Task created:', JSON.stringify(createResult, null, 2));

        const taskId = createResult.taskId || createResult.task_id;
        if (!taskId) {
            throw new Error('No taskId returned from Kie.ai');
        }

        // Step 4: Poll for completion
        console.log('[Kling 2.6 via Kie.ai] Polling for task:', taskId);
        const resultVideoUrl = await pollKieKlingTask(taskId, apiKey);

        console.log('\n========================================');
        console.log('[Kling 2.6 via Kie.ai] SUCCESS!');
        console.log(`[Kling 2.6 via Kie.ai] Video URL: ${resultVideoUrl}`);
        console.log('========================================\n');

        return resultVideoUrl;

    } catch (error) {
        console.error('[Kling 2.6 via Kie.ai] Error:', error.message);
        throw error;
    }
}

/**
 * Poll Kie.ai Kling task for completion
 */
async function pollKieKlingTask(taskId, apiKey, maxWaitMs = 600000) {
    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const response = await fetch(`${KIE_KLING_BASE_URL}/jobs/recordInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to poll task: ${response.status}`);
        }

        const result = await response.json();
        console.log('[Kling 2.6 via Kie.ai] Task status:', result.status, result.message);

        if (result.status === 'completed' || result.status === 'succeed') {
            return result.result?.video_url || result.video_url || result.url;
        } else if (result.status === 'failed' || result.status === 'error') {
            throw new Error(`Kling generation failed: ${result.message || 'Unknown error'}`);
        }
    }

    throw new Error('Kling generation timed out');
}
