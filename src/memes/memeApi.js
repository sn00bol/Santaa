const API_BASE_URL = 'https://api.memegen.link';
const API_HOSTNAME = 'api.memegen.link';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SLAP_TEMPLATE_ID = 'slap';

let templatesPromise;

async function requestJson(url, options = {}, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('Global fetch is not available in this Node.js runtime.');
    }
    const response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
            Accept: 'application/json',
            ...options.headers,
        },
    });
    if (!response.ok) {
        throw new Error(`MemeGen API request failed with HTTP ${response.status}.`);
    }
    return response.json();
}

function validateImageUrl(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== API_HOSTNAME) {
        throw new Error('MemeGen API returned an unexpected image URL.');
    }
    return parsed.toString();
}

async function getMemeTemplates(fetchImpl = globalThis.fetch) {
    if (fetchImpl !== globalThis.fetch) {
        const templates = await requestJson(`${API_BASE_URL}/templates`, {}, fetchImpl);
        return validateTemplates(templates);
    }
    if (!templatesPromise) {
        templatesPromise = requestJson(`${API_BASE_URL}/templates`)
            .then(validateTemplates)
            .catch(error => {
                templatesPromise = null;
                throw error;
            });
    }
    return templatesPromise;
}

function validateTemplates(templates) {
    if (!Array.isArray(templates)) {
        throw new Error('MemeGen API returned an invalid template list.');
    }
    return templates.filter(template =>
        typeof template.id === 'string' &&
        /^[a-z0-9_-]+$/i.test(template.id) &&
        Number.isInteger(template.lines) &&
        template.lines >= 2 &&
        template.lines <= 3
    );
}

async function createMemeImage(templateId, text, fetchImpl = globalThis.fetch) {
    if (
        !/^[a-z0-9_-]+$/i.test(templateId) ||
        !Array.isArray(text) ||
        (text.length !== 2 && text.length !== 3) ||
        text.some(line => typeof line !== 'string')
    ) {
        throw new Error('Invalid meme template or caption data.');
    }
    const result = await requestJson(`${API_BASE_URL}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            template_id: templateId,
            text,
            extension: 'png',
        }),
    }, fetchImpl);

    if (typeof result.url !== 'string') {
        throw new Error('MemeGen API did not return a meme image URL.');
    }
    return validateImageUrl(result.url);
}

async function downloadMemeImage(imageUrl, fetchImpl = globalThis.fetch) {
    const safeUrl = validateImageUrl(imageUrl);
    const response = await fetchImpl(safeUrl, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: 'image/png,image/jpeg,image/*' },
    });
    if (!response.ok) {
        throw new Error(`Meme image download failed with HTTP ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
        throw new Error('MemeGen API returned a non-image response.');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
        throw new Error('MemeGen API returned an empty or oversized image.');
    }
    return buffer;
}

async function createRandomMeme(text, random = Math.random, fetchImpl = globalThis.fetch) {
    const templates = (await getMemeTemplates(fetchImpl)).filter(template => template.lines === 2);
    if (templates.length === 0) {
        throw new Error('MemeGen API has no two-caption templates available.');
    }
    const template = templates[Math.floor(random() * templates.length)];
    const url = await createMemeImage(template.id, text, fetchImpl);
    return { template, url };
}

module.exports = {
    API_BASE_URL,
    SLAP_TEMPLATE_ID,
    createMemeImage,
    createRandomMeme,
    downloadMemeImage,
    getMemeTemplates,
    validateImageUrl,
    validateTemplates,
};
