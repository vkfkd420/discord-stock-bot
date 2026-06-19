const axios = require('axios');

function resolveProvider() {
    const explicit = process.env.LLM_PROVIDER?.toLowerCase();
    if (explicit === 'gemini' || explicit === 'groq' || explicit === 'openai') return explicit;

    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.OPENAI_API_KEY) return 'openai';

    return null;
}

const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite'];

async function callGeminiOnce(apiKey, model, systemPrompt, userPrompt) {
    const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 8192 },
        },
        { timeout: 120000, validateStatus: () => true }
    );

    if (res.status === 429) {
        const msg = res.data?.error?.message || 'quota exceeded';
        return { ok: false, retry: true, error: `429 ${msg}` };
    }
    if (res.status >= 400) {
        const msg = res.data?.error?.message || res.statusText;
        return { ok: false, retry: res.status >= 500, error: `${res.status} ${msg}` };
    }

    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, retry: false, error: 'Gemini 응답이 비어 있습니다.' };
    return { ok: true, text: text.trim() };
}

async function callGemini(systemPrompt, userPrompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    const primary = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const models = [primary, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== primary)];

    let lastError = '';
    for (const model of models) {
        console.log(`[LLM] Gemini model: ${model}`);
        const result = await callGeminiOnce(apiKey, model, systemPrompt, userPrompt);
        if (result.ok) {
            if (model !== primary) {
                console.log(`[LLM] ${primary} 실패 → ${model}로 대체 응답 (내용이 달라질 수 있음)`);
            }
            return result.text;
        }
        lastError = result.error;
        if (!result.retry) break;
    }

    throw new Error(
        `Gemini 호출 실패: ${lastError}\n` +
            '무료 한도 초과일 수 있습니다. .env에 GEMINI_MODEL=gemini-2.5-flash 를 설정하거나 내일 다시 시도하세요.'
    );
}

async function callGroq(systemPrompt, userPrompt) {
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    const res = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
        },
        {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 120000,
        }
    );

    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq 응답이 비어 있습니다.');
    return text.trim();
}

async function callOpenAI(systemPrompt, userPrompt) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
        },
        {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 120000,
        }
    );

    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI 응답이 비어 있습니다.');
    return text.trim();
}

async function callLLM(systemPrompt, userPrompt) {
    const provider = resolveProvider();

    if (!provider) {
        throw new Error(
            'LLM API 키가 없습니다. 무료: GEMINI_API_KEY 또는 GROQ_API_KEY를 .env에 추가하세요.'
        );
    }

    console.log(`[LLM] ${provider} 호출 중...`);

    switch (provider) {
        case 'gemini':
            return callGemini(systemPrompt, userPrompt);
        case 'groq':
            return callGroq(systemPrompt, userPrompt);
        case 'openai':
            return callOpenAI(systemPrompt, userPrompt);
        default:
            throw new Error(`지원하지 않는 LLM_PROVIDER: ${provider}`);
    }
}

module.exports = { callLLM, resolveProvider };
