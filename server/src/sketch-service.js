'use strict';

const https = require('https');

const SKETCH_MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const _sketchModelCooldownMap = new Map();

function isSketchModelCoolingDown(tier, modelName, now = Date.now()) {
    const key = `${tier}:${modelName}`;
    const until = _sketchModelCooldownMap.get(key) || 0;
    if (until <= now) {
        if (until) _sketchModelCooldownMap.delete(key);
        return false;
    }
    return true;
}

function markSketchModelCooldown(tier, modelName, cooldownMs = SKETCH_MODEL_COOLDOWN_MS) {
    if (_sketchModelCooldownMap.size >= 128) {
        const oldest = _sketchModelCooldownMap.keys().next().value;
        if (oldest !== undefined) _sketchModelCooldownMap.delete(oldest);
    }
    _sketchModelCooldownMap.set(`${tier}:${modelName}`, Date.now() + cooldownMs);
}

function sanitizeSketchPrompt(rawText) {
    return String(rawText || '')
        .replace(/\b(bloodied|blood-stained|blood|gore|visceral|horror|horrifying|corpse|mutilated|slaughtered|suicide|self-harm|macabre|grotesque)\b/gi, 'shadow-wreathed')
        .replace(/\b(killed by mortal wounds|slain by|meeting an absurd, tragicomic demise|death scene)\b/gi, 'in a dramatic dungeon confrontation with');
}

function buildSketchPayload(promptText, modelName = '', imageOnlyModalities = false) {
    const generationConfig = {
        responseModalities: imageOnlyModalities ? ['IMAGE'] : ['TEXT', 'IMAGE']
    };
    if (String(modelName || '').startsWith('gemini-3')) {
        generationConfig.thinkingConfig = { thinkingLevel: 'MINIMAL' };
    }
    return JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig,
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
        ]
    });
}

function buildModelOrder(models, requestedModel) {
    const list = Array.isArray(models) && models.length > 0
        ? models.slice()
        : ['gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
    const normalizedReq = requestedModel === 'gemini-3.1-flash-image-preview'
        ? 'gemini-3.1-flash-image'
        : String(requestedModel || '').trim();
    const startIdx = list.includes(normalizedReq) ? list.indexOf(normalizedReq) : 0;
    const ordered = [];
    for (let i = 0; i < list.length; i++) {
        ordered.push(list[(startIdx + i) % list.length]);
    }
    return ordered;
}

function extractUpstreamDiagnostic(respBody, redactFn, secret) {
    let detail = '';
    try {
        const parsed = JSON.parse(respBody);
        if (parsed && parsed.error && parsed.error.message) {
            detail = String(parsed.error.message);
        } else if (parsed && parsed.promptFeedback && parsed.promptFeedback.blockReason) {
            detail = `blockReason=${parsed.promptFeedback.blockReason}`;
        }
    } catch (_) {
        detail = String(respBody || '').slice(0, 140);
    }
    const clean = detail.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160);
    return typeof redactFn === 'function' ? redactFn(clean, secret) : clean;
}

function postJsonHttps(url, headers, bodyStr, agent, timeoutMs = 22000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const req = https.request(url, {
            method: 'POST',
            agent,
            headers: {
                ...headers,
                'Content-Length': Buffer.byteLength(bodyStr)
            },
            timeout: timeoutMs
        }, res => {
            let respBody = '';
            res.on('data', c => { respBody += c; });
            res.on('end', () => {
                if (settled) return;
                settled = true;
                resolve({ status: res.statusCode || 502, body: respBody });
            });
        });
        req.on('timeout', () => {
            if (settled) return;
            settled = true;
            req.destroy();
            const err = new Error('timeout');
            err.code = 'ETIMEDOUT';
            reject(err);
        });
        req.on('error', err => {
            if (settled) return;
            settled = true;
            reject(err);
        });
        req.write(bodyStr);
        req.end();
    });
}

async function trySketchTier({
    tier,
    orderedModels,
    sanitizedPrompt,
    apiKey,
    customKey,
    geminiHttpsAgent,
    getGcpAuthContext,
    redactSecret
}) {
    let vertexCtx = null;
    if (tier === 'vertex') {
        vertexCtx = await getGcpAuthContext();
        if (!vertexCtx || !vertexCtx.token || !vertexCtx.projectId) {
            return { ok: false, lastStatus: 0, reason: apiKey ? 'vertex_unavailable' : 'no_api_key' };
        }
    } else if (!apiKey) {
        return { ok: false, lastStatus: 0, reason: 'no_api_key' };
    }

    const activeQueue = orderedModels.filter(m => customKey || !isSketchModelCoolingDown(tier, m));
    const candidates = activeQueue.length > 0 ? activeQueue : orderedModels;

    let lastStatus = 502;
    let sawNoImage = false;
    let sawTimeout = false;
    let sawNetworkError = false;

    for (const modelName of candidates) {
        let retriedSafe = false;
        let imageOnlyModalities = false;

        for (let attempt = 0; attempt < 3; attempt++) {
            const promptText = retriedSafe
                ? `${sanitizedPrompt} Safe classical fantasy book illustration, atmospheric lighting, PG-rated.`
                : sanitizedPrompt;
            const payloadStr = buildSketchPayload(promptText, modelName, imageOnlyModalities);
            const url = tier === 'vertex'
                ? `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(vertexCtx.projectId)}/locations/global/publishers/google/models/${encodeURIComponent(modelName)}:generateContent`
                : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
            const headers = tier === 'vertex'
                ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vertexCtx.token}` }
                : { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };

            let result = null;
            try {
                result = await postJsonHttps(url, headers, payloadStr, geminiHttpsAgent, 22000);
            } catch (err) {
                if (err && err.code === 'ETIMEDOUT') {
                    sawTimeout = true;
                    console.warn(`[Sketch] ${tier} ${modelName} timed out after 22s`);
                } else {
                    sawNetworkError = true;
                    const msg = typeof redactSecret === 'function' ? redactSecret(err.message || 'network_error', apiKey) : 'network_error';
                    console.warn(`[Sketch] ${tier} ${modelName} network error: ${msg}`);
                }
                break;
            }

            const status = result.status;
            lastStatus = status;

            if (status === 200) {
                try {
                    const rb = JSON.parse(result.body);
                    const cand = (rb && rb.candidates && rb.candidates[0]) || {};
                    const parts = (cand.content && cand.content.parts) || [];
                    const imgPart = parts.find(p => p && p.inlineData && p.inlineData.data);
                    if (imgPart) {
                        const mime = imgPart.inlineData.mimeType || 'image/png';
                        return {
                            ok: true,
                            imageUrl: `data:${mime};base64,${imgPart.inlineData.data}`,
                            model: modelName
                        };
                    }
                    sawNoImage = true;
                    const finishReason = cand.finishReason || (rb.promptFeedback && rb.promptFeedback.blockReason) || 'NO_IMAGE_PART';
                    console.warn(`[Sketch] ${tier} ${modelName} HTTP 200 returned no image (finishReason=${finishReason})`);
                    if (!retriedSafe && (cand.finishReason === 'IMAGE_SAFETY' || cand.finishReason === 'SAFETY')) {
                        retriedSafe = true;
                        continue;
                    }
                    if (!imageOnlyModalities) {
                        imageOnlyModalities = true;
                        continue;
                    }
                } catch (_) {
                    sawNoImage = true;
                    console.warn(`[Sketch] ${tier} ${modelName} HTTP 200 returned malformed JSON`);
                }
                break;
            }

            const diag = extractUpstreamDiagnostic(result.body, redactSecret, apiKey);
            console.warn(`[Sketch] ${tier} ${modelName} HTTP ${status}: ${diag || 'upstream error'}`);

            if (status === 429 && !customKey) {
                markSketchModelCooldown(tier, modelName, SKETCH_MODEL_COOLDOWN_MS);
                break;
            }

            // Fallback to ['IMAGE'] modality if a model rejects ['TEXT', 'IMAGE']
            if (status === 400 && !imageOnlyModalities && !result.body.includes('API_KEY_INVALID')) {
                imageOnlyModalities = true;
                continue;
            }

            // Invalid API key won't succeed on other models in the same AI Studio tier
            if (tier === 'aistudio' && (status === 401 || (status === 400 && result.body.includes('API_KEY_INVALID')))) {
                return { ok: false, lastStatus: status, reason: `upstream_error_${status}` };
            }

            break;
        }
    }

    if (sawNoImage) return { ok: false, lastStatus: 200, reason: 'upstream_no_image' };
    if (sawTimeout) return { ok: false, lastStatus: 504, reason: 'timeout' };
    if (sawNetworkError) return { ok: false, lastStatus: 502, reason: 'network_error' };
    return { ok: false, lastStatus, reason: `upstream_error_${lastStatus}` };
}

async function generateChronicleSketch({
    prompt,
    requestedModel = '',
    models,
    apiKey = '',
    customKey = '',
    geminiHttpsAgent,
    getGcpAuthContext,
    redactSecret
}) {
    const sanitizedPrompt = sanitizeSketchPrompt(prompt);
    const orderedModels = buildModelOrder(models, requestedModel);
    const preferAiStudio = Boolean(apiKey && !apiKey.startsWith('AQ.'));
    const tiers = preferAiStudio
        ? (customKey ? ['aistudio'] : ['aistudio', 'vertex'])
        : (apiKey ? ['vertex', 'aistudio'] : ['vertex']);

    let lastResult = { ok: false, lastStatus: 0, reason: apiKey ? 'upstream_error_502' : 'no_api_key' };
    for (const tier of tiers) {
        const res = await trySketchTier({
            tier,
            orderedModels,
            sanitizedPrompt,
            apiKey,
            customKey,
            geminiHttpsAgent,
            getGcpAuthContext,
            redactSecret
        });
        if (res.ok) {
            return { ok: true, imageUrl: res.imageUrl, model: res.model };
        }
        if (res.reason !== 'vertex_unavailable') {
            lastResult = res;
        }
    }

    return {
        ok: false,
        fallback: true,
        reason: lastResult.reason || (apiKey ? 'upstream_error_502' : 'no_api_key')
    };
}

module.exports = {
    SKETCH_MODEL_COOLDOWN_MS,
    _sketchModelCooldownMap,
    isSketchModelCoolingDown,
    markSketchModelCooldown,
    sanitizeSketchPrompt,
    buildSketchPayload,
    generateChronicleSketch
};
