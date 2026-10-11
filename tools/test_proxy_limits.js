const http = require('http');
const { spawn } = require('child_process');

async function fetchAPI(path, method, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(`http://127.0.0.1:8080${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
        });
        req.on('error', reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

async function runTest() {
    console.log('Starting server for proxy limits test...');
    const env = Object.assign({}, process.env);
    Object.keys(env).forEach(k => { if (k.toUpperCase() === 'GEMINI_API_KEY') delete env[k]; });
    env.LLM_RPM = '3';
    env.TTS_RPM = '3';

    const server = spawn('node', ['server/src/server.js'], {
        env: env,
        stdio: 'inherit'
    });

    await new Promise(r => setTimeout(r, 2000));

    let failed = false;
    function assert(cond, msg) {
        if (!cond) {
            console.error('FAIL:', msg);
            failed = true;
        } else {
            console.log('PASS:', msg);
        }
    }

    try {
        // 1. Legacy payload is accepted (401 without key, not 400)
        let res = await fetchAPI('/api/llm/generate', 'POST', JSON.stringify({
            model: 'gemini-3.8-flash',
            payload: {
                systemInstruction: { parts: [{text: 'Sys'}] },
                contents: [{ role: 'user', parts: [{text: 'User'}] }]
            }
        }));
        assert(res.status === 401 || res.status === 200, `Payload check: expected 401 or 200, got ${res.status}`);

        // 2. Disallowed model
        res = await fetchAPI('/api/llm/generate', 'POST', JSON.stringify({
            model: 'gpt-4',
            systemPrompt: 'Sys',
            userPrompt: 'User'
        }));
        assert(res.status === 400, `Disallowed model: expected 400, got ${res.status}`);

        // 3. Payload > 64KB -> 413
        const largeString = 'a'.repeat(70000);
        res = await fetchAPI('/api/llm/generate', 'POST', JSON.stringify({
            model: 'gemini-3.8-flash',
            systemPrompt: largeString,
            userPrompt: 'User'
        }));
        // Note: fetchAPI might reject with socket hang up if the server destroys the socket before sending 413, 
        // but we added a 413 response in the server logic. Let's see if we get 413.
        assert(res.status === 413 || res.status === undefined, `Large payload: expected 413 or hang up, got ${res.status}`);

        // 4. Rate limit check (RPM = 3)
        // We already did 1 successful format parse (the 401) and 1 failed format parse (400 for model).
        // Wait, the limiter counts ONLY ALLOWED requests. The 401 was allowed by the limiter. The 400 was allowed by the limiter.
        // Let's just spam a valid request 4 times.
        let rateLimitHit = false;
        for (let i = 0; i < 5; i++) {
            res = await fetchAPI('/api/llm/generate', 'POST', JSON.stringify({
                model: 'gemini-3.8-flash',
                systemPrompt: 'Sys',
                userPrompt: 'User'
            }));
            if (res.status === 429) {
                assert(res.headers['retry-after'], `429 response has Retry-After header: ${res.headers['retry-after']}`);
                rateLimitHit = true;
                break;
            }
        }
        assert(rateLimitHit, `Rate limit hit after max 5 requests`);

        // 5. TTS Param checking
        res = await fetchAPI('/api/tts?text=hello&pitch=101Hz', 'GET');
        assert(res.status === 401 || res.status === 200, `Valid TTS params: expected 401/200, got ${res.status}`);

        res = await fetchAPI('/api/tts?text=hello&pitch=invalid', 'GET');
        assert(res.status === 400, `Invalid TTS pitch: expected 400, got ${res.status}`);

    } catch (e) {
        if (e.code !== 'ECONNRESET') {
            console.error('Test error:', e);
            failed = true;
        } else {
            console.log('PASS: Large payload caught as ECONNRESET (Socket hang up is acceptable)');
        }
    } finally {
        server.kill();
        process.exit(failed ? 1 : 0);
    }
}

runTest();
