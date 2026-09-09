const FONT_LIST = [
    'Arial', 'Verdana', 'Times New Roman', 'Courier New',
    'Helvetica', 'Georgia', 'Tahoma', 'Trebuchet MS',
    'Comic Sans MS', 'Impact', 'Palatino Linotype', 'Lucida Console',
    'Gill Sans', 'Segoe UI', 'Calibri', 'Cambria',
    'Franklin Gothic Medium', 'Consolas', 'Monaco', 'Menlo'
];

async function sha256Hex(value) {
    const encoder = new TextEncoder();
    const data = encoder.encode(typeof value === 'string' ? value : String(value));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function stabilizeUserAgent(ua) {
    return String(ua)
        .replace(/\b(Chrome|Chromium|Firefox|Edg|EdgA|OPR|OPX|Version|Safari|CriOS|FxiOS|YaBrowser)\/(\d+)[\w.]*/g, '$1/$2')
        .replace(/\b(AppleWebKit|Gecko|Trident)\/[\d.]+/g, '$1')
        .replace(/\bSafari\/\d+[\w.]*/g, 'Safari');
}

async function collectUaSignal() {
    const uaData = navigator.userAgentData;
    if (uaData && typeof uaData.getHighEntropyValues === 'function') {
        try {
            const hints = await uaData.getHighEntropyValues([
                'architecture',
                'bitness',
                'model',
                'platformVersion'
            ]);
            const brands = (uaData.brands || [])
                .filter(b => b.brand && !/not.?a.?brand/i.test(b.brand))
                .map(b => `${b.brand}/${b.version}`)
                .sort()
                .join(',');
            const platformVersion = String(hints.platformVersion || '').split('.')[0];
            return [
                uaData.platform || '',
                platformVersion,
                hints.architecture || '',
                hints.bitness || '',
                hints.model || '',
                uaData.mobile ? 'm' : 'd',
                brands
            ].join('~');
        } catch (e) {
            // fallback below
        }
    }
    return stabilizeUserAgent(navigator.userAgent);
}

function detectFonts() {
    if (document.fonts && typeof document.fonts.check === 'function') {
        return FONT_LIST.filter(font => document.fonts.check(`12px "${font}"`)).join(',');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const text = 'Fingerprint Test 0123456789';
    const baselineFont = 'monospace';
    const baselineSize = '12px';

    ctx.font = `${baselineSize} ${baselineFont}`;
    const baselineWidth = ctx.measureText(text).width;

    const installed = [];
    for (const font of FONT_LIST) {
        ctx.font = `${baselineSize} "${font}", ${baselineFont}`;
        if (ctx.measureText(text).width !== baselineWidth) {
            installed.push(font);
        }
    }
    return installed.join(',');
}

function normalizeWebglRenderer(value) {
    return String(value || '')
        .replace(/^ANGLE \(/i, '')
        .replace(/Direct3D\d+[^,]*/gi, '')
        .replace(/\b(vs|ps)_\d+_\d+/gi, '')
        .replace(/\bD3D\d+[-.\w]*/gi, '')
        .replace(/\bOpenGL( ES)? [^,]*/gi, '')
        .replace(/\b\d+\.\d+\.\d+(\.\d+)?\b/g, '')
        .replace(/[()]/g, ' ')
        .replace(/[,\s]+/g, ' ')
        .trim();
}

async function collectCanvasSignal() {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return 'no_canvas';
    }

    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = '#069';
    ctx.fillText('Fingerprint', 2, 15);
    ctx.strokeStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(50, 25, 18, 0, Math.PI);
    ctx.stroke();

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return sha256Hex(Array.from(pixels).join(','));
}

function collectWebglSignal() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
        return 'no_webgl';
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);

    return `${vendor}~${normalizeWebglRenderer(renderer)}`;
}

async function collectAudioSignal() {
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) {
        return 'no_audio';
    }

    const ctx = new OfflineCtx(1, 44100, 44100);
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 10000;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);

    const buffer = await ctx.startRendering();
    const samples = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) {
        sum += Math.abs(samples[i]);
    }
    return sum.toFixed(4);
}

function collectHardwareSignal() {
    const memory = navigator.deviceMemory || 'na';
    const cores = navigator.hardwareConcurrency || 'na';
    const touch = navigator.maxTouchPoints || 0;
    const pdf = navigator.pdfViewerEnabled ? '1' : '0';
    return `${cores}x${memory}t${touch}p${pdf}`;
}

function collectScreenSignal() {
    const dpr = Math.round((window.devicePixelRatio || 1) * 2) / 2;
    return [
        screen.width,
        screen.height,
        screen.colorDepth,
        screen.pixelDepth,
        dpr
    ].join('x');
}

async function collectFingerprint() {
    const userAgent = await collectUaSignal();
    const language = navigator.language || 'unknown';
    const platform = navigator.platform || 'unknown';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const screenInfo = collectScreenSignal();
    const hardware = collectHardwareSignal();

    let canvasHash = 'no_canvas';
    try {
        canvasHash = await collectCanvasSignal();
    } catch (e) {
        canvasHash = 'no_canvas';
    }

    let webglHash = 'no_webgl';
    try {
        webglHash = collectWebglSignal();
    } catch (e) {
        webglHash = 'no_webgl';
    }

    let audioHash = 'no_audio';
    try {
        audioHash = await collectAudioSignal();
    } catch (e) {
        audioHash = 'no_audio';
    }

    let fontsHash = 'no_fonts';
    try {
        fontsHash = detectFonts();
    } catch (e) {
        fontsHash = 'no_fonts';
    }

    const rawString = [
        userAgent,
        language,
        platform,
        screenInfo,
        hardware,
        timeZone,
        canvasHash,
        webglHash,
        audioHash,
        fontsHash
    ].join('|');

    return sha256Hex(rawString);
}

/**
 * Отправляет POST-запрос с JSON и обрабатывает ответ.
 * @param {string} url - endpoint
 * @param {object} payload - данные
 * @returns {Promise<object>} - разобранный ответ сервера
 */
async function postJSON(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    let data = {};
    try {
        data = await response.json();
    } catch (e) {
        throw new Error('invalid_response');
    }

    if (!response.ok) {
        if (data.error === 'multiple_devices') {
            const err = new Error('multiple_devices');
            err.code = 'multiple_devices';
            throw err;
        }
        const err = new Error('auth_failed');
        err.code = 'auth_failed';
        throw err;
    }

    return data;
}

/**
 * Аутентификация устройства.
 * @returns {Promise<object>} - { status: 'authenticated', user_id: '...' }
 */
async function device_auth(user_id = null) {
    const fingerprint = await collectFingerprint();
    const payload = { fingerprint };
    if (user_id) payload.user_id = user_id;
    const result = await postJSON('/auth/authenticate', payload);
    return result;
}

/**
 * Регистрация устройства.
 * @param {string} user_id - идентификатор пользователя
 * @returns {Promise<object>} - { status: 'registered', user_id: '...' }
 */
async function device_register(user_id) {
    if (!user_id) {
        throw new Error('user_id_required');
    }
    const fingerprint = await collectFingerprint();
    const result = await postJSON('/auth/register', { fingerprint, user_id });
    return result;
}

export { device_auth, device_register };
