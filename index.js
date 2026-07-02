require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { useMongoDBAuthState } = require('mongo-baileys');
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pino = require('pino');

let crashCount = 0;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function startBot() {
    try {
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        const collection = client.db('vibe-bot').collection('session');
        const { state, saveCreds } = await useMongoDBAuthState(collection);

        console.log({
            noiseKey: state.creds.noiseKey?.private?.constructor?.name,
            signedKey: state.creds.signedIdentityKey?.private?.constructor?.name,
            pairingKey: state.creds.pairingEphemeralKeyPair?.private?.constructor?.name,
            registered: state.creds.registered
        });

        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            auth: state,
            browser: ["Ubuntu", "Chrome", "20.0.04"]
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                crashCount = 0; // Reset crash counter on successful connection
                console.log('Bot is online!');
            }
        });

        if (!sock.authState.creds.registered) {
            setTimeout(async () => {
                const code = await sock.requestPairingCode("2349019598495");
                console.log(`PAIRING CODE: ${code}`);
            }, 10000);
        }

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!text) return;

            try {
                const result = await model.generateContent(text);
                await sock.sendMessage(msg.key.remoteJid, { text: result.response.text() });
            } catch (err) {
                console.error("AI Error:", err);
            }
        });

    } catch (err) {
        crashCount++;
        console.error(`Crash #${crashCount} - Cause:`, err.message);
        if (crashCount >= 3) {
            console.error("Critical failure threshold reached. Terminating process.");
            process.exit(1); 
        }
        setTimeout(startBot, 5000);
    }
}
startBot();
