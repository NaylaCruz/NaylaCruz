require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pino = require('pino');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot is connected successfully!');
        }
    });

    if (!sock.authState.creds.registered) {
        console.log("Waiting for stable connection...");
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode("2349019598495");
                console.log(`\n\n************************************\nYOUR PAIRING CODE: ${code}\n************************************\n`);
            } catch (err) {
                console.log("Could not request code yet, waiting for next cycle.");
            }
        }, 15000);
    } else {
        console.log("Session found! Bot is already registered.");
    }
}
startBot();
