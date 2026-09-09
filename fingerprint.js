function detectFonts() {
    const fontList = [
        'Arial', 'Verdana', 'Times New Roman', 'Courier New',
        'Helvetica', 'Georgia', 'Tahoma', 'Trebuchet MS',
        'Comic Sans MS', 'Impact', 'Palatino Linotype', 'Lucida Console',
        'Gill Sans', 'Segoe UI', 'Calibri', 'Cambria',
        'Franklin Gothic Medium', 'Consolas', 'Monaco', 'Menlo'
    ];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const text = 'Fingerprint Test 0123456789';
    const baselineFont = 'monospace';
    const baselineSize = '12px';

    ctx.font = `${baselineSize} ${baselineFont}`;
    const baselineWidth = ctx.measureText(text).width;

    const installed = [];

    for (const font of fontList) {
        ctx.font = `${baselineSize} "${font}", ${baselineFont}`;
        const width = ctx.measureText(text).width;
        if (width !== baselineWidth) {
            installed.push(font);
        }
    }

    return installed.join(',');
}

async function collectFingerprint() {
    const userAgent = navigator.userAgent;
    const acceptLanguage = navigator.language || 'unknown';
    const languages = (navigator.languages && navigator.languages.join(',')) || acceptLanguage;
    const platform = navigator.platform || 'unknown';
    const screenInfo = `${screen.width}x${screen.height}x${screen.colorDepth}x${screen.pixelDepth}`;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const availInfo = `${screen.availWidth}x${screen.availHeight}`;

    let canvasHash = '';
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 200, 50);
        ctx.fillStyle = '#069';
        ctx.fillText('Fingerprint', 2, 15);
        canvasHash = canvas.toDataURL();
    } catch (e) {
        canvasHash = 'no_canvas';
    }

    let webglHash = '';
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
            const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
            webglHash = `${vendor}~${renderer}`;
        } else {
            webglHash = 'no_webgl';
        }
    } catch (e) {
        webglHash = 'no_webgl';
    }

    let audioHash = '';
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        const oscillator = audioCtx.createOscillator();
        const analyser = audioCtx.createAnalyser();
        oscillator.connect(analyser);
        analyser.connect(audioCtx.destination);
        oscillator.start(0);
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);
        oscillator.stop(0);
        audioCtx.close();
        audioHash = freqData.slice(0, 50).join(',');
    } catch (e) {
        audioHash = 'no_audio';
    }

    let plugins = '';
    try {
        plugins = Array.from(navigator.plugins).map(p => p.name).join(';');
    } catch (e) {
        plugins = 'no_plugins';
    }

    let fontsHash = '';
    try {
        fontsHash = detectFonts();
    } catch (e) {
        fontsHash = 'no_fonts';
    }

    const rawString = [
        userAgent,
        acceptLanguage + '|' + languages,
        platform,
        screenInfo,
        availInfo,
        timeZone,
        canvasHash,
        webglHash,
        audioHash,
        plugins,
        fontsHash          
    ].join('|');

    const encoder = new TextEncoder();
    const data = encoder.encode(rawString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
async function device_auth() {
    const fingerprint = await collectFingerprint();
    const result = await postJSON('/auth/authenticate', { fingerprint });
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