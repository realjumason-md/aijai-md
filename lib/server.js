import express from 'express';
import { createServer } from 'http';
import { parsePhoneNumber as PhoneNumber } from 'awesome-phonenumber';
import config from '../config.js';
const packageInfo = {
    name: config.botName || 'MEGA-MD',
    version: config.version || '6.0.0',
    description: config.description || 'WhatsApp Bot',
    author: config.author || 'GlobalTechInfo'
};
const app = express();
const server = createServer(app);
const PORT = Number(process.env.PORT) || config.port || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const pairingState = {
    status: 'initializing',
    code: null,
    phoneNumber: null,
    message: 'Starting the WhatsApp connection...'
};
let pairingHandler = null;

export function registerPairingHandler(handler) {
    pairingHandler = handler;
}

export function updatePairingState(updates) {
    Object.assign(pairingState, updates);
}

function getPublicPairingState() {
    return { ...pairingState };
}

function cleanPhoneNumber(value) {
    return String(value || '').replace(/\D/g, '');
}

app.use(express.json({ limit: '10kb' }));
app.get('/', (req, res) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeString = `${hours}h ${minutes}m ${seconds}s`;
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${packageInfo.name.toUpperCase()} Status</title>
        <style>
            :root { --primary: #25d366; --bg: #0f172a; --card-bg: rgba(30, 41, 59, 0.7); }
            body { 
                margin: 0; padding: 0; background: var(--bg); color: white; 
                font-family: 'Inter', system-ui, sans-serif;
                display: flex; justify-content: center; align-items: center; min-height: 100vh;
            }
            .container {
                background: var(--card-bg); backdrop-filter: blur(12px);
                border: 1px solid rgba(255,255,255,0.1); padding: 30px;
                border-radius: 24px; width: 90%; max-width: 400px; text-align: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            }
            .status-badge {
                display: inline-flex; align-items: center; background: rgba(37, 211, 102, 0.1);
                color: var(--primary); padding: 5px 15px; border-radius: 50px;
                font-size: 0.8rem; font-weight: bold; margin-bottom: 20px;
            }
            .dot { height: 8px; width: 8px; background: var(--primary); border-radius: 50%; margin-right: 8px; box-shadow: 0 0 10px var(--primary); }
            h1 { margin: 0; font-size: 1.8rem; letter-spacing: 1px; }
            .desc { color: #94a3b8; margin: 10px 0 25px 0; font-size: 0.9rem; }
             .grid { display: grid; gap: 12px; }
            .item { 
                background: rgba(0,0,0,0.2); padding: 12px 18px; border-radius: 12px;
                display: flex; justify-content: space-between; align-items: center;
            }
            .label { color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 800; }
            .val { font-weight: 600; font-family: monospace; color: #f1f5f9; }
             .pairing { margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); text-align: left; }
             .pairing h2 { margin: 0 0 8px; font-size: 1.1rem; }
             .pairing p { color: #94a3b8; font-size: 0.85rem; line-height: 1.5; margin: 0 0 14px; }
             .pairing form { display: grid; gap: 10px; }
             .pairing input { box-sizing: border-box; width: 100%; border: 1px solid rgba(255,255,255,0.15); background: rgba(15,23,42,0.9); color: white; border-radius: 10px; padding: 12px; font: inherit; }
             .pairing button { border: 0; border-radius: 10px; padding: 12px; background: var(--primary); color: #052e16; font: inherit; font-weight: 800; cursor: pointer; }
             .pairing button:disabled { cursor: wait; opacity: 0.65; }
             .pairing-status { min-height: 22px; color: #cbd5e1; font-size: 0.82rem; margin-top: 12px; }
             .pairing-code { display: block; margin-top: 12px; padding: 14px; border-radius: 10px; background: #052e16; color: #86efac; text-align: center; font: 800 1.5rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.12em; }
             .copy-button { margin-top: 10px; background: rgba(255,255,255,0.1) !important; color: #e2e8f0 !important; font-size: 0.8rem !important; }
            footer { margin-top: 25px; font-size: 0.7rem; color: #475569; letter-spacing: 1px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status-badge"><span class="dot"></span> SYSTEM ONLINE</div>
            <h1>${packageInfo.name.toUpperCase()}</h1>
            <p class="desc">${packageInfo.description}</p>
            
            <div class="grid">
                <div class="item"><span class="label">Version</span><span class="val">${packageInfo.version}</span></div>
                <div class="item"><span class="label">Author</span><span class="val">${packageInfo.author}</span></div>
                <div class="item"><span class="label">Uptime</span><span class="val">${uptimeString}</span></div>
            </div>

             <section class="pairing" aria-labelledby="pairing-title">
                 <h2 id="pairing-title">Connect WhatsApp</h2>
                 <p>Paste your full WhatsApp number with country code. Your pairing code will appear here instead of in the deployment logs.</p>
                 <form id="pairing-form">
                     <label class="label" for="phone-number">WhatsApp number</label>
                     <input id="phone-number" name="phoneNumber" type="tel" inputmode="tel" autocomplete="tel" placeholder="256700000000" required>
                     <button id="pairing-submit" type="submit">Generate pairing code</button>
                 </form>
                 <div id="pairing-status" class="pairing-status" role="status" aria-live="polite">Checking connection status...</div>
                 <div id="pairing-code-container" hidden>
                     <div class="label">Pairing code</div>
                     <code id="pairing-code" class="pairing-code"></code>
                     <button id="copy-code" class="copy-button" type="button">Copy code</button>
                 </div>
             </section>

            <footer>POWERED BY GLOBALTECHINFO</footer>
        </div>
         <script>
             const form = document.getElementById('pairing-form');
             const submitButton = document.getElementById('pairing-submit');
             const statusMessage = document.getElementById('pairing-status');
             const codeContainer = document.getElementById('pairing-code-container');
             const codeElement = document.getElementById('pairing-code');
             const copyButton = document.getElementById('copy-code');

             function showState(state) {
                 const messages = {
                     initializing: 'Starting the WhatsApp connection...',
                     waiting: 'Ready. Enter your number to generate a code.',
                     generating: 'Generating your pairing code...',
                     ready: 'Enter this code in WhatsApp on your phone.',
                     reconnecting: 'WhatsApp accepted the code. Finishing the login...',
                     connected: 'WhatsApp is connected.',
                     error: state.message || 'Something went wrong. Please try again.'
                 };
                 statusMessage.textContent = messages[state.status] || state.message || 'Ready.';
                 if (state.code) {
                     codeElement.textContent = state.code;
                     codeContainer.hidden = false;
                 } else if (state.status !== 'generating') {
                     codeContainer.hidden = true;
                     codeElement.textContent = '';
                 }
             }

             async function refreshPairingStatus() {
                 try {
                     const response = await fetch('/api/pairing/status');
                     if (response.ok) showState(await response.json());
                 } catch {
                     statusMessage.textContent = 'Unable to read connection status right now.';
                 }
             }

             form.addEventListener('submit', async (event) => {
                 event.preventDefault();
                 submitButton.disabled = true;
                 codeContainer.hidden = true;
                 statusMessage.textContent = 'Generating your pairing code...';
                 try {
                     const response = await fetch('/api/pairing/request', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ phoneNumber: document.getElementById('phone-number').value })
                     });
                     const result = await response.json();
                     if (!response.ok) throw new Error(result.message || 'Pairing code could not be generated.');
                     showState(result);
                 } catch (error) {
                     showState({ status: 'error', message: error.message });
                 } finally {
                     submitButton.disabled = false;
                 }
             });

             copyButton.addEventListener('click', async () => {
                 if (!codeElement.textContent) return;
                 await navigator.clipboard.writeText(codeElement.textContent);
                 copyButton.textContent = 'Copied';
                 setTimeout(() => { copyButton.textContent = 'Copy code'; }, 1500);
             });

             refreshPairingStatus();
             setInterval(refreshPairingStatus, 3000);
         </script>
    </body>
    </html>
    `);
});
app.get('/api/pairing/status', (req, res) => {
    res.json(getPublicPairingState());
});
app.post('/api/pairing/request', async (req, res) => {
    const phoneNumber = cleanPhoneNumber(req.body?.phoneNumber);
    const parsedNumber = PhoneNumber(`+${phoneNumber}`);
    if (!parsedNumber.valid) {
        return res.status(400).json({
            status: 'error',
            message: 'Enter a valid WhatsApp number with country code, for example 256700000000.'
        });
    }
    if (!pairingHandler) {
        return res.status(503).json({
            status: 'error',
            message: 'The WhatsApp connection is still starting. Try again in a few seconds.'
        });
    }
    try {
        const code = await pairingHandler(phoneNumber);
        return res.json({
            status: 'ready',
            code,
            phoneNumber,
            message: 'Enter this code in WhatsApp on your phone.'
        });
    }
    catch (error) {
        const isPairingBusy = error.code === 'PAIRING_BUSY';
        const isPairingCooldown = error.code === 'PAIRING_COOLDOWN';
        return res.status(isPairingBusy ? 409 : isPairingCooldown ? 429 : 500).json({
            status: 'error',
            message: isPairingBusy
                ? 'A pairing code is already being generated. Wait a moment and try again.'
                : isPairingCooldown
                    ? 'A pairing code was already issued. Finish that pairing instead of requesting another.'
                : 'The pairing code could not be generated. Try again.'
        });
    }
});
app.get(['/health', '/api/healthz'], (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        memory: {
            rss: `${Math.round(mem.rss / 1024 / 1024) }MB`,
            heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024) }MB`,
            heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024) }MB`
        },
        version: packageInfo.version,
        bot: packageInfo.name,
        timestamp: new Date().toISOString()
    });
});
app.get('/process', (req, res) => {
    const { send } = req.query;
    if (!send)
        return res.status(400).json({ error: 'Missing send query' });
    res.json({ status: 'Received', data: send });
});
app.get('/chat', (req, res) => {
    const { message, to } = req.query;
    if (!message || !to)
        return res.status(400).json({ error: 'Missing message or to query' });
    res.json({ status: 200, info: 'Message received (integration not implemented)' });
});
export { app, server, HOST, PORT };
