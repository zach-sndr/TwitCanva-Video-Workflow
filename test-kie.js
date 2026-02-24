/**
 * Test script to check how many images Kie.ai Grok Imagine returns
 */

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_BASE_URL = 'https://api.kie.ai';

if (!KIE_API_KEY) {
    console.error('Please set KIE_API_KEY in your environment');
    process.exit(1);
}

async function pollTask(taskId) {
    const maxWaitMs = 120000; // 2 minutes
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < maxWaitMs) {
        const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${KIE_API_KEY}`
            }
        });

        const result = await response.json();
        const state = result.data?.state;
        console.log(`Task ${taskId} state: ${state}`);

        if (state === 'success') {
            const resultJson = JSON.parse(result.data?.resultJson || '{}');
            const imageUrls = resultJson?.resultUrls;
            console.log('\n=== RESULT ===');
            console.log('Number of images returned:', imageUrls?.length || 0);
            console.log('Image URLs:', imageUrls);
            return imageUrls;
        } else if (state === 'fail') {
            throw new Error(`Task failed: ${result.data?.failMsg}`);
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Task timed out');
}

async function testTextToImage() {
    console.log('\n=== Testing Text-to-Image ===');

    const body = {
        model: 'grok-imagine/text-to-image',
        input: {
            prompt: 'A cute orange cat sitting on a rainbow, cartoon style, bright colors',
            aspect_ratio: '1:1'
        }
    };

    const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${KIE_API_KEY}`
        },
        body: JSON.stringify(body)
    });

    const result = await response.json();
    console.log('Create task response:', result);

    if (result.code !== 200) {
        throw new Error(`API error: ${result.msg}`);
    }

    const taskId = result.data?.taskId;
    console.log('Task ID:', taskId);

    return pollTask(taskId);
}

async function testImageToImage() {
    console.log('\n=== Testing Image-to-Image ===');

    // Using a simple base64 image for testing
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const body = {
        model: 'grok-imagine/image-to-image',
        input: {
            prompt: 'Transform this into a watercolor painting',
            image_urls: [`data:image/png;base64,${testImageBase64}`],
            aspect_ratio: '1:1'
        }
    };

    const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${KIE_API_KEY}`
        },
        body: JSON.stringify(body)
    });

    const result = await response.json();
    console.log('Create task response:', result);

    if (result.code !== 200) {
        throw new Error(`API error: ${result.msg}`);
    }

    const taskId = result.data?.taskId;
    console.log('Task ID:', taskId);

    return pollTask(taskId);
}

async function main() {
    try {
        console.log('Testing Kie.ai Grok Imagine API...');
        console.log('API Key:', KIE_API_KEY.substring(0, 10) + '...');

        await testTextToImage();
        // Uncomment to test I2I as well
        // await testImageToImage();

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
