const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const db = require('./db');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configure CSP to allow Socket.io CDN and inline scripts
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://cdnjs.cloudflare.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https:", "https://cdn.socket.io", "https://cdnjs.cloudflare.com"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers like onclick
        connectSrc: ["'self'", "ws:", "wss:", "https://cdn.socket.io"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"]
    }
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// CORS middleware for frontend integration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3002');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Session-Token, X-API-Key');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// URL webhook n8n
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv963931.hstgr.cloud/webhook/whatsapp';
const API_KEY = process.env.API_KEY;
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
    console.error('❌ API_KEY tidak ditemukan di .env file!');
    process.exit(1);
}

// Session storage untuk dashboard
const activeSessions = new Map();

// Chat cache untuk performa - now stores WhatsApp chat objects
const chatCache = new Map();
let lastChatRefresh = 0;
const CHAT_CACHE_DURATION = 30000; // 30 detik

// Queue untuk webhook dengan retry mechanism
const webhookQueue = [];
let isProcessingQueue = false;

// Storage untuk raw message debugging
let recentRawMessages = [];

// Middleware untuk session dan API key
function sessionAuthMiddleware(req, res, next) {
    const sessionToken = req.headers['x-session-token'];
    if (sessionToken) {
        const session = activeSessions.get(sessionToken);
        if (!session) {
            return res.status(403).json({
                error: 'Invalid session token',
                code: 'INVALID_SESSION',
                details: 'Your session token is invalid or has been revoked'
            });
        }
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (session.created < oneDayAgo) {
            activeSessions.delete(sessionToken);
            return res.status(403).json({
                error: 'Session expired',
                code: 'SESSION_EXPIRED',
                details: 'Your session has expired. Please login again.'
            });
        }
        return next();
    }

    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(403).json({
            error: 'API key required',
            code: 'MISSING_API_KEY',
            details: 'This endpoint requires an API key for authentication'
        });
    }
    if (apiKey !== API_KEY) {
        return res.status(403).json({
            error: 'Invalid API key',
            code: 'INVALID_API_KEY',
            details: 'The provided API key is not valid'
        });
    }
    next();
}

// Input validation
function validateSendMessage(req, res, next) {
    const { to, message } = req.body;
    if (!to || typeof to !== 'string' || to.length < 5) {
        return res.status(400).json({ error: 'Invalid "to" field' });
    }
    if (!message || typeof message !== 'string' || message.length > 4096) {
        return res.status(400).json({ error: 'Invalid "message" field (max 4096 chars)' });
    }
    next();
}

let client = null;
let clientReady = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 3;

// ===================================================
// WEBHOOK QUEUE PROCESSOR (unchanged)
// ===================================================
async function processWebhookQueue() {
    if (isProcessingQueue || webhookQueue.length === 0) return;
    
    isProcessingQueue = true;
    console.log(`📦 Processing webhook queue: ${webhookQueue.length} items`);
    
    while (webhookQueue.length > 0) {
        const item = webhookQueue.shift();
        try {
            await sendToWebhookWithRetry(item.url, item.payload, 5);
            console.log(`✅ Successfully sent webhook for message ${item.payload.id}`);
        } catch (error) {
            console.error(`❌ Failed to send webhook after all retries:`, error.message);
            await logFailedWebhook(item, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    isProcessingQueue = false;
    console.log('📦 Webhook queue processing completed');
}

// Log failed webhooks for debugging
async function logFailedWebhook(item, error) {
    try {
        await new Promise((resolve) => {
            db.run(`CREATE TABLE IF NOT EXISTS failed_webhooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT,
                payload TEXT,
                error TEXT,
                timestamp INTEGER,
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, function(err) {
                if (err) {
                    console.warn('Failed to create failed_webhooks table:', err.message);
                }
                resolve();
            });
        });

        await new Promise((resolve) => {
            db.run(
                `INSERT INTO failed_webhooks (message_id, payload, error, timestamp, retry_count) VALUES (?, ?, ?, ?, ?)`,
                [
                    item.payload.id || 'unknown',
                    JSON.stringify(item.payload),
                    error.message,
                    Date.now(),
                    item.retryCount || 0
                ],
                function (err) {
                    if (err) {
                        console.error('Failed to log failed webhook:', err.message);
                    } else {
                        console.log(`📝 Logged failed webhook for message ${item.payload.id}`);
                    }
                    resolve();
                }
            );
        });
    } catch (dbError) {
        console.error('Database error while logging failed webhook:', dbError.message);
    }
}

// ===================================================
// WEBHOOK SENDER DENGAN RETRY (unchanged)
// ===================================================
async function sendToWebhookWithRetry(url, payload, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const requestId = crypto.randomBytes(16).toString('hex');
            
            const response = await axios.post(url, payload, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'WhatsApp-Bot/1.0',
                    'X-Request-ID': requestId,
                    'X-Retry-Attempt': attempt.toString()
                },
                validateStatus: function (status) {
                    return status < 400;
                }
            });
            
            console.log(`➡️ Webhook sent successfully (attempt ${attempt}, request ${requestId}):`, {
                status: response.status,
                messageId: payload.id,
                from: payload.from
            });
            return response;
            
        } catch (err) {
            const isLastAttempt = attempt === maxRetries;
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
            
            console.error(`❌ Webhook failed (attempt ${attempt}/${maxRetries}):`, {
                error: err.message,
                messageId: payload.id,
                from: payload.from,
                status: err.response?.status,
                statusText: err.response?.statusText
            });
            
            if (isLastAttempt) {
                throw new Error(`Webhook failed after ${maxRetries} attempts: ${err.message}`);
            }
            
            console.log(`⏳ Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// ===================================================
// ANALYTICS LOGGING FUNCTION
// ===================================================
async function logAnalytics(type, chatId, isAi, data = null) {
    try {
        await new Promise((resolve) => {
            db.run(
                `INSERT INTO analytics (type, chat_id, is_ai, timestamp, data) VALUES (?, ?, ?, ?, ?)`,
                [type, chatId, isAi ? 1 : 0, Date.now(), data ? JSON.stringify(data) : null],
                (err) => {
                    if (err) {
                        console.error('Error logging analytics:', err);
                    }
                    resolve();
                }
            );
        });
    } catch (error) {
        console.error('Database error logging analytics:', error);
    }
}

// ===================================================
// NEW WHATSAPP DIRECT CHAT FUNCTIONS
// ===================================================

// Get all chats directly from WhatsApp client
async function getWhatsAppChats() {
    if (!client || !clientReady) {
        throw new Error('WhatsApp client not ready');
    }
    
    try {
        console.log('📱 Fetching chats directly from WhatsApp...');
        const chats = await client.getChats();
        
        // Convert WhatsApp chat objects to our format
        const formattedChats = chats
            .filter(chat => chat.lastMessage) // Only chats with messages
            .sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp) // Sort by last message time
            .map(chat => ({
                id: chat.id._serialized,
                name: chat.name || chat.id.user || 'Unknown Contact',
                isGroup: chat.isGroup,
                lastMessage: chat.lastMessage?.body || (chat.lastMessage?.hasMedia ? '📎 Media' : 'No message'),
                lastTimestamp: chat.lastMessage?.timestamp || 0,
                unreadCount: chat.unreadCount || 0,
                archived: chat.archived || false,
                pinned: chat.pinned || false
            }));
        
        console.log(`📱 Retrieved ${formattedChats.length} chats from WhatsApp`);
        return formattedChats;
    } catch (error) {
        console.error('❌ Failed to get chats from WhatsApp:', error);
        throw error;
    }
}

// Get messages from a specific chat directly from WhatsApp
async function getWhatsAppMessages(chatId, limit = 50) {
    if (!client || !clientReady) {
        throw new Error('WhatsApp client not ready');
    }
    
    try {
        console.log(`📱 Fetching messages for chat ${chatId} directly from WhatsApp...`);
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit });
        
        // Convert WhatsApp message objects to our format
        const formattedMessages = messages
            .sort((a, b) => a.timestamp - b.timestamp) // Sort chronologically
            .map(msg => ({
                id: msg.id._serialized,
                chatId: chatId,
                sender: msg.from,
                body: msg.body || '',
                timestamp: msg.timestamp,
                fromMe: msg.fromMe,
                type: msg.type,
                hasMedia: msg.hasMedia,
                ack: msg.ack,
                author: msg.author || null,
                vCards: msg.vCards || [],
                location: msg.location || null,
                links: msg.links || [],
                mentionedIds: msg.mentionedIds || [],
                source: msg.fromMe ? 'whatsapp_web' : 'user'
            }));
        
        console.log(`📱 Retrieved ${formattedMessages.length} messages from WhatsApp for chat ${chatId}`);
        return formattedMessages;
    } catch (error) {
        console.error(`❌ Failed to get messages for chat ${chatId}:`, error);
        throw error;
    }
}

// ===================================================
// INITIALIZE WHATSAPP CLIENT
// ===================================================
function initializeWhatsAppClient() {
    client = new Client({
        authStrategy: new LocalAuth({ clientId: "whatsapp-bot" }),
        puppeteer: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--disable-extensions'
            ],
            headless: true
        }
    });

    // QR
    client.on('qr', qr => {
        console.log('📱 Scan QR code berikut:');
        qrcode.generate(qr, { small: true });
        io.emit('qr', { qr });
        clientReady = false;
    });

    // Ready
    client.on('ready', () => {
        console.log('✅ WhatsApp client is ready and session saved!');
        console.log('📱 Client info:', {
            wid: client.info.wid._serialized,
            platform: client.info.platform,
            connected: client.info.connected
        });
        clientReady = true;
        reconnectAttempts = 0;
        chatCache.clear(); // Clear cache when ready
        io.emit('ready');
        
        if (webhookQueue.length > 0) {
            console.log(`📦 Processing ${webhookQueue.length} queued webhooks...`);
            processWebhookQueue();
        }
    });

    // Disconnected
    client.on('disconnected', (reason) => {
        console.log('⚠️ WhatsApp client disconnected:', reason);
        clientReady = false;
        chatCache.clear();
        io.emit('disconnected', { reason });

        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`🔄 Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
            setTimeout(() => {
                initializeWhatsAppClient();
            }, 5000 * reconnectAttempts);
        }
    });

    // Auth failure
    client.on('auth_failure', () => {
        console.error('❌ Authentication failed');
        clientReady = false;
        chatCache.clear();
        io.emit('auth_failure');
    });

    // Message handler - Keep webhook functionality unchanged
    client.on('message', async msg => {
        console.log('🔥 MESSAGE EVENT TRIGGERED!');
        try {
            console.log(`📩 Pesan dari ${msg.from}: ${msg.body}`);
            console.log(`📩 Message details:`, {
                id: msg.id._serialized,
                fromMe: msg.fromMe,
                type: msg.type,
                timestamp: msg.timestamp,
                hasMedia: msg.hasMedia
            });

            // Payload lengkap untuk n8n sesuai format original
            let payload = {
                id: msg.id,
                body: msg.body,
                type: msg.type,
                timestamp: msg.timestamp,
                from: msg.from,
                to: msg.to,
                author: msg.author,
                fromMe: msg.fromMe,
                hasMedia: msg.hasMedia,
                ack: msg.ack,
                vCards: msg.vCards,
                location: msg.location,
                links: msg.links,
                mentionedIds: msg.mentionedIds || [],
                _data: msg._data // semua data mentah
            };

            // Get chat info
            const chat = await msg.getChat();
            const chatId = chat.id._serialized;

            // Check AI mode setting before sending webhook
            let shouldSendWebhook = true; // Default to true for backward compatibility
            try {
                const chatSetting = await new Promise((resolve) => {
                    db.get("SELECT ai_mode FROM chat_settings WHERE chat_id = ?", [chatId], (err, row) => {
                        if (err) {
                            console.error('Error checking AI mode:', err);
                            resolve(null);
                        } else {
                            resolve(row);
                        }
                    });
                });

                // If setting exists and AI mode is disabled (0), don't send webhook
                if (chatSetting && chatSetting.ai_mode === 0) {
                    shouldSendWebhook = false;
                    console.log(`🚫 Webhook skipped - AI mode disabled for chat ${chatId}`);
                }
            } catch (dbError) {
                console.error('Database error checking AI mode:', dbError);
                // Continue with webhook on database errors (fail-safe)
            }

            // Handle media dengan size limit
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();

                    // Check media size (limit 25MB)
                    const mediaSize = Buffer.byteLength(media.data, 'base64');
                    if (mediaSize > 25 * 1024 * 1024) {
                        console.warn(`⚠️ Media too large: ${mediaSize} bytes`);
                        payload.media = { error: 'Media too large', size: mediaSize, mimetype: media.mimetype };
                    } else {
                        payload.media = {
                            mimetype: media.mimetype,
                            filename: media.filename || null,
                            data: media.data,
                            size: mediaSize
                        };
                        console.log(`📎 Media downloaded: ${mediaSize} bytes, ${media.mimetype}`);
                    }
                } catch (mediaError) {
                    console.error("⚠️ Gagal download media:", mediaError.message);
                    payload.media = { error: mediaError.message, hasMedia: true };
                }
            }

            // Only add to webhook queue if AI mode is enabled
            if (shouldSendWebhook) {
                // Add to webhook queue instead of sending directly
                webhookQueue.push({
                    url: N8N_WEBHOOK_URL,
                    payload: payload,
                    messageId: msg.id._serialized,
                    timestamp: Date.now()
                });

                console.log(`📦 Added message to webhook queue: ${msg.id._serialized} (queue size: ${webhookQueue.length})`);

                // Process queue if not already processing
                if (!isProcessingQueue) {
                    setImmediate(() => processWebhookQueue());
                }
            }

            // Emit ke dashboard dengan data yang lebih lengkap
            const messageData = {
                chatId: chatId,
                id: msg.id._serialized,
                body: msg.body || '',
                fromMe: msg.fromMe,
                timestamp: msg.timestamp,
                type: msg.type,
                hasMedia: msg.hasMedia,
                sender: msg.from,
                to: msg.to,
                ack: msg.ack,
                author: msg.author || null,
                source: msg.fromMe ? 'whatsapp_web' : 'user'
            };

            console.log(`📡 Emitting new_message to dashboard:`, {
                chatId: messageData.chatId,
                messageId: messageData.id,
                fromMe: messageData.fromMe,
                source: messageData.source,
                body: messageData.body.substring(0, 50) + '...'
            });

            io.emit('new_message', messageData);

            // Emit event khusus untuk update chat list
            const chatUpdateData = {
                chatId: chatId,
                lastMessage: msg.body || (msg.hasMedia ? '📎 Media' : 'Empty message'),
                lastTimestamp: msg.timestamp,
                unreadCount: chat.unreadCount || 0
            };

            console.log(`📡 Emitting chat_updated to dashboard:`, {
                chatId: chatUpdateData.chatId,
                lastMessage: chatUpdateData.lastMessage.substring(0, 30) + '...',
                lastTimestamp: chatUpdateData.lastTimestamp
            });

            io.emit('chat_updated', chatUpdateData);

            // Clear chat cache when new message arrives dan trigger refresh
            chatCache.clear();
            lastChatRefresh = 0;

        } catch (err) {
            console.error('❌ Error processing message:', err.message);
            
            // Still try to send basic payload to n8n for failed messages (if AI mode enabled)
            try {
                if (shouldSendWebhook) {
                    const fallbackPayload = {
                        id: msg.id?._serialized || crypto.randomBytes(16).toString('hex'),
                        error: 'Failed to process message',
                        errorDetails: err.message,
                        from: msg.from,
                        timestamp: Date.now(),
                        type: 'error'
                    };

                    webhookQueue.push({
                        url: N8N_WEBHOOK_URL,
                        payload: fallbackPayload,
                        messageId: fallbackPayload.id,
                        timestamp: Date.now()
                    });

                    if (!isProcessingQueue) {
                        setImmediate(() => processWebhookQueue());
                    }
                }
            } catch (fallbackError) {
                console.error('❌ Failed to create fallback payload:', fallbackError.message);
            }
        }
    });

    // Handle sent messages (from other devices)
    client.on('message_create', async msg => {
        try {
            console.log('📤 Message create event triggered (sent message)');

            // Only process if it's a message sent by this account (from other devices)
            if (msg.fromMe) {
                console.log(`📤 Sent message to ${msg.to}: ${msg.body}`);

                const chat = await msg.getChat();
                const chatId = chat.id._serialized;

                // Create message data for dashboard
                const messageData = {
                    chatId: chatId,
                    id: msg.id._serialized,
                    body: msg.body || '',
                    fromMe: true,
                    timestamp: msg.timestamp,
                    type: msg.type,
                    hasMedia: msg.hasMedia,
                    sender: client.info.wid._serialized,
                    to: msg.to,
                    ack: msg.ack,
                    author: msg.author || null,
                    source: 'whatsapp_mobile' // Indicate sent from mobile device
                };

                console.log(`📡 Emitting sent message to dashboard:`, {
                    chatId: messageData.chatId,
                    messageId: messageData.id,
                    fromMe: messageData.fromMe,
                    source: messageData.source,
                    body: messageData.body.substring(0, 50) + '...'
                });

                // Emit to dashboard
                io.emit('new_message', messageData);

                // Emit chat update
                io.emit('chat_updated', {
                    chatId: chatId,
                    lastMessage: msg.body || (msg.hasMedia ? '📎 Media' : 'Empty message'),
                    lastTimestamp: msg.timestamp,
                    unreadCount: 0
                });

                // Clear cache to refresh
                chatCache.clear();
                lastChatRefresh = 0;
            }
        } catch (err) {
            console.error('❌ Error processing sent message:', err.message);
        }
    });

    client.initialize().catch(err => {
        console.error('❌ Failed to initialize WhatsApp client:', err);
    });
}

// Process webhook queue periodically
setInterval(() => {
    if (webhookQueue.length > 0 && !isProcessingQueue) {
        console.log(`📦 Periodic queue check: ${webhookQueue.length} items pending`);
        processWebhookQueue();
    }
}, 5000);

// ===================================================
// API ENDPOINTS
// ===================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        whatsapp: clientReady ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        cachedChats: chatCache.size,
        webhookQueueSize: webhookQueue.length,
        isProcessingQueue: isProcessingQueue
    });
});

// Check WhatsApp session status
app.get('/api/session-status', sessionAuthMiddleware, (req, res) => {
    res.json({
        hasSession: clientReady,
        status: clientReady ? 'authenticated' : 'needs_authentication',
        timestamp: new Date().toISOString()
    });
});

// Debug endpoint untuk melihat konfigurasi API key
app.get('/debug/config', (req, res) => {
    const apiKey = req.headers['x-debug-key'];
    if (apiKey !== 'debug123') {
        return res.status(403).json({ error: 'Unauthorized debug access' });
    }
    
    res.json({
        hasApiKey: !!API_KEY,
        apiKeyLength: API_KEY ? API_KEY.length : 0,
        apiKeyFirst4: API_KEY ? API_KEY.substring(0, 4) + '...' : 'null',
        environment: {
            NODE_ENV: process.env.NODE_ENV || 'not set',
            PORT: PORT,
            N8N_WEBHOOK_URL: N8N_WEBHOOK_URL
        },
        activeSessions: activeSessions.size
    });
});

// Login endpoint untuk dashboard
app.post('/api/login', (req, res) => {
    const { apiKey } = req.body;

    console.log('Login attempt:', {
        receivedApiKey: apiKey ? `${apiKey.substring(0, 4)}...` : 'null',
        expectedApiKey: API_KEY ? `${API_KEY.substring(0, 4)}...` : 'null',
        apiKeyType: typeof apiKey,
        expectedType: typeof API_KEY,
        apiKeyLength: apiKey ? apiKey.length : 0,
        expectedLength: API_KEY ? API_KEY.length : 0
    });

    if (!apiKey) {
        console.log('Login failed: API key is empty or null');
        return res.status(400).json({
            error: 'API key is required',
            code: 'MISSING_API_KEY',
            details: 'The API key field cannot be empty'
        });
    }

    if (typeof apiKey !== 'string') {
        console.log('Login failed: API key is not a string');
        return res.status(400).json({
            error: 'API key must be a string',
            code: 'INVALID_TYPE',
            details: 'The API key must be a string value'
        });
    }

    // Trim whitespace from both keys for comparison
    const trimmedApiKey = apiKey.trim();
    const trimmedExpectedKey = API_KEY ? API_KEY.trim() : '';

    if (trimmedApiKey !== trimmedExpectedKey) {
        console.log('Login failed: API key mismatch', {
            receivedLength: trimmedApiKey.length,
            expectedLength: trimmedExpectedKey.length,
            receivedFirst4: trimmedApiKey.substring(0, 4),
            expectedFirst4: trimmedExpectedKey.substring(0, 4)
        });
        return res.status(403).json({
            error: 'Invalid API key',
            code: 'INVALID_API_KEY',
            details: 'The provided API key does not match the expected key'
        });
    }

    console.log('Login successful for API key');

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    activeSessions.set(sessionToken, {
        created: Date.now(),
        apiKey: trimmedApiKey
    });

    // Clean old sessions (older than 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [token, data] of activeSessions.entries()) {
        if (data.created < oneDayAgo) {
            activeSessions.delete(token);
        }
    }

    res.json({
        success: true,
        sessionToken,
        whatsappReady: clientReady
    });
});

// Endpoint typing
app.post('/typing', sessionAuthMiddleware, async (req, res) => {
    const { to } = req.body;
    
    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }
    
    try {
        const chat = await client.getChatById(to);
        await chat.sendStateTyping();
        res.json({ success: true, message: `Typing dimulai untuk ${to}` });
    } catch (err) {
        console.error("⚠️ Gagal start typing:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint kirim pesan
app.post('/send', sessionAuthMiddleware, validateSendMessage, async (req, res) => {
    const { to, message } = req.body;

    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }

    try {
        const chat = await client.getChatById(to);
        await chat.clearState();
        const sentMsg = await client.sendMessage(to, message);

        // Emit ke dashboard dengan data yang lebih lengkap
        const messageId = sentMsg.id._serialized;
        const timestamp = Math.floor(Date.now() / 1000);

        const messageData = {
            chatId: chat.id._serialized,
            id: messageId,
            body: message,
            fromMe: true,
            timestamp: timestamp,
            type: 'chat',
            sender: client.info.wid._serialized,
            to: chat.id._serialized,
            ack: 1,
            source: 'whatsapp_web'
        };

        io.emit('new_message', messageData);

        // Emit event khusus untuk update chat list
        io.emit('chat_updated', {
            chatId: chat.id._serialized,
            lastMessage: message,
            lastTimestamp: timestamp,
            unreadCount: 0
        });

        // Clear chat cache to refresh dan trigger refresh
        chatCache.clear();
        lastChatRefresh = 0;

        res.json({ success: true, message: `Pesan terkirim ke ${to}` });
    } catch (err) {
        console.error("⚠️ Gagal kirim pesan:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// New endpoint for dashboard send message
app.post('/api/send-message', sessionAuthMiddleware, async (req, res) => {
    const { chatId, message } = req.body;

    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }

    if (!chatId || !message) {
        return res.status(400).json({ error: 'chatId and message are required' });
    }

    if (typeof message !== 'string' || message.length > 4096) {
        return res.status(400).json({ error: 'Message must be a string and max 4096 characters' });
    }

    try {
        const chat = await client.getChatById(chatId);
        await chat.clearState();
        const sentMsg = await client.sendMessage(chatId, message);

        // Emit ke dashboard dengan data yang lebih lengkap
        const messageId = sentMsg.id._serialized;
        const timestamp = Math.floor(Date.now() / 1000);

        const messageData = {
            chatId: chatId,
            id: messageId,
            body: message,
            fromMe: true,
            timestamp: timestamp,
            type: 'chat',
            sender: client.info.wid._serialized,
            to: chatId,
            ack: 1,
            source: 'whatsapp_web'
        };

        io.emit('new_message', messageData);

        // Emit event khusus untuk update chat list
        io.emit('chat_updated', {
            chatId: chatId,
            lastMessage: message,
            lastTimestamp: timestamp,
            unreadCount: 0
        });

        // Log analytics for human-sent message
        await logAnalytics('message', chatId, false, {
            messageId: messageId,
            message: message,
            source: 'dashboard',
            sentBy: 'human'
        });

        // Clear chat cache to refresh dan trigger refresh
        chatCache.clear();
        lastChatRefresh = 0;

        res.json({
            success: true,
            messageId: messageId,
            message: 'Message sent successfully'
        });
    } catch (err) {
        console.error("⚠️ Failed to send message:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// NEW DASHBOARD API ENDPOINTS - Direct from WhatsApp
// ===================================================

// Get chats directly from WhatsApp
app.get('/api/chats', sessionAuthMiddleware, async (req, res) => {
    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    
    try {
        // Check cache first
        const now = Date.now();
        const cacheKey = `chats_${page}_${limit}`;
        
        if (chatCache.has(cacheKey) && (now - lastChatRefresh) < CHAT_CACHE_DURATION) {
            console.log('📱 Returning cached chats');
            return res.json(chatCache.get(cacheKey));
        }
        
        // Fetch fresh data from WhatsApp
        const allChats = await getWhatsAppChats();
        
        // Apply pagination
        const offset = (page - 1) * limit;
        const chats = allChats.slice(offset, offset + limit);
        
        const result = {
            chats: chats,
            pagination: {
                page,
                limit,
                total: allChats.length,
                totalPages: Math.ceil(allChats.length / limit),
                hasMore: offset + limit < allChats.length
            }
        };
        
        // Cache the result
        chatCache.set(cacheKey, result);
        lastChatRefresh = now;
        
        console.log(`📱 Loaded ${chats.length} chats from WhatsApp (page ${page})`);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Failed to load chats from WhatsApp:', error);
        res.status(500).json({ 
            error: 'Failed to load chats from WhatsApp', 
            details: error.message 
        });
    }
});

// Get messages directly from WhatsApp
app.get('/api/messages/:chatId', sessionAuthMiddleware, async (req, res) => {
    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }
    
    const chatId = req.params.chatId;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    
    if (!chatId || typeof chatId !== 'string') {
        return res.status(400).json({ error: 'Invalid chatId' });
    }
    
    try {
        // Check cache first
        const cacheKey = `messages_${chatId}_${limit}`;
        const now = Date.now();
        
        if (chatCache.has(cacheKey) && (now - chatCache.get(cacheKey + '_timestamp')) < 10000) { // 10 second cache for messages
            console.log(`📱 Returning cached messages for ${chatId}`);
            return res.json(chatCache.get(cacheKey));
        }
        
        // Fetch fresh data from WhatsApp
        const messages = await getWhatsAppMessages(chatId, limit);
        
        const result = {
            messages,
            pagination: {
                limit,
                count: messages.length,
                hasMore: messages.length === limit
            }
        };
        
        // Cache the result
        chatCache.set(cacheKey, result);
        chatCache.set(cacheKey + '_timestamp', now);
        
        console.log(`📱 Loaded ${messages.length} messages from WhatsApp for chat ${chatId}`);
        res.json(result);
        
    } catch (error) {
        console.error(`❌ Failed to load messages for chat ${chatId}:`, error);
        res.status(500).json({ 
            error: 'Failed to load messages from WhatsApp', 
            details: error.message 
        });
    }
});

// Chat settings endpoints
app.get('/api/chat-settings', sessionAuthMiddleware, async (req, res) => {
    try {
        const settings = await new Promise((resolve) => {
            db.all("SELECT chat_id, ai_mode, last_updated FROM chat_settings", [], (err, rows) => {
                if (err) {
                    console.error('Error fetching chat settings:', err);
                    resolve({});
                } else {
                    const settingsObj = {};
                    (rows || []).forEach(row => {
                        settingsObj[row.chat_id] = {
                            aiMode: row.ai_mode === 1,
                            lastUpdated: row.last_updated
                        };
                    });
                    resolve(settingsObj);
                }
            });
        });

        res.json({ settings });
    } catch (error) {
        console.error('Error fetching chat settings:', error);
        res.status(500).json({ error: 'Failed to fetch chat settings' });
    }
});

// Enable AI mode for all chats
app.post('/api/enable-all-ai', sessionAuthMiddleware, async (req, res) => {
    try {
        // Get all chats from WhatsApp
        if (!client || !clientReady) {
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        const chats = await client.getChats();
        let enabledCount = 0;

        for (const chat of chats) {
            const chatId = chat.id._serialized;

            await new Promise((resolve) => {
                db.run(
                    `INSERT OR REPLACE INTO chat_settings (chat_id, ai_mode, last_updated, updated_at)
                     VALUES (?, ?, ?, datetime('now'))`,
                    [chatId, 1, Date.now()], // 1 = AI mode enabled
                    (err) => {
                        if (err) {
                            console.error(`Error enabling AI for chat ${chatId}:`, err);
                        } else {
                            enabledCount++;
                        }
                        resolve();
                    }
                );
            });
        }

        res.json({
            success: true,
            message: `AI mode enabled for ${enabledCount} chats`,
            enabledCount
        });
    } catch (error) {
        console.error('Error enabling AI for all chats:', error);
        res.status(500).json({ error: 'Failed to enable AI for all chats' });
    }
});

app.post('/api/chat-settings/:chatId/toggle', sessionAuthMiddleware, async (req, res) => {
    const { chatId } = req.params;
    const { aiMode } = req.body;

    try {
        await new Promise((resolve) => {
            db.run(
                `INSERT OR REPLACE INTO chat_settings (chat_id, ai_mode, last_updated, updated_at)
                 VALUES (?, ?, ?, datetime('now'))`,
                [chatId, aiMode ? 1 : 0, Date.now()],
                (err) => {
                    if (err) {
                        console.error('Error updating chat settings:', err);
                    }
                    resolve();
                }
            );
        });

        res.json({ success: true, aiMode });
    } catch (error) {
        console.error('Error updating chat settings:', error);
        res.status(500).json({ error: 'Failed to update chat settings' });
    }
});

// Analytics endpoint
app.get('/api/analytics', sessionAuthMiddleware, async (req, res) => {
    try {
        // Get basic analytics from database
        const totalChats = await new Promise((resolve) => {
            db.get("SELECT COUNT(*) as count FROM (SELECT DISTINCT chat_id FROM analytics)", (err, row) => {
                resolve(err ? 0 : row.count);
            });
        });

        const totalMessages = await new Promise((resolve) => {
            db.get("SELECT COUNT(*) as count FROM analytics WHERE type = 'message'", (err, row) => {
                resolve(err ? 0 : row.count);
            });
        });

        const aiProcessed = await new Promise((resolve) => {
            db.get("SELECT COUNT(*) as count FROM analytics WHERE type = 'message' AND is_ai = 1", (err, row) => {
                resolve(err ? 0 : row.count);
            });
        });

        const humanProcessed = await new Promise((resolve) => {
            db.get("SELECT COUNT(*) as count FROM analytics WHERE type = 'message' AND is_ai = 0", (err, row) => {
                resolve(err ? 0 : row.count);
            });
        });

        // Get daily activity for last 7 days
        const dailyActivity = {};
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const count = await new Promise((resolve) => {
                db.get(
                    "SELECT COUNT(*) as count FROM analytics WHERE type = 'message' AND date(timestamp/1000, 'unixepoch') = ?",
                    [dateStr],
                    (err, row) => {
                        resolve(err ? 0 : row.count);
                    }
                );
            });

            dailyActivity[dateStr] = count;
        }

        // Get recent activity
        const recentActivity = await new Promise((resolve) => {
            db.all(
                "SELECT * FROM analytics ORDER BY timestamp DESC LIMIT 10",
                [],
                (err, rows) => {
                    if (err) {
                        resolve([]);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });

        res.json({
            totalChats,
            totalMessages,
            aiProcessed,
            humanProcessed,
            dailyActivity,
            recentActivity: recentActivity.map(activity => ({
                timestamp: activity.timestamp,
                description: `${activity.type} - ${activity.chat_id}`
            })),
            avgResponseTime: 0 // Placeholder
        });

    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            error: 'Failed to fetch analytics',
            details: error.message
        });
    }
});

// New endpoint to check webhook queue status
app.get('/api/webhook-status', sessionAuthMiddleware, (req, res) => {
    res.json({
        queueSize: webhookQueue.length,
        isProcessing: isProcessingQueue,
        lastProcessed: lastChatRefresh,
        webhookUrl: N8N_WEBHOOK_URL,
        whatsappReady: clientReady
    });
});

// New endpoint to retry failed webhooks
app.post('/api/retry-failed-webhooks', sessionAuthMiddleware, async (req, res) => {
    try {
        const tableExists = await new Promise((resolve) => {
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='failed_webhooks'", (err, row) => {
                resolve(!!row);
            });
        });

        if (!tableExists) {
            return res.json({ message: 'No failed webhooks table exists', count: 0 });
        }

        const failedWebhooks = await new Promise((resolve) => {
            db.all(
                `SELECT * FROM failed_webhooks WHERE retry_count < 3 ORDER BY timestamp DESC LIMIT 50`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('Error querying failed webhooks:', err.message);
                        resolve([]);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });

        if (failedWebhooks.length === 0) {
            return res.json({ message: 'No failed webhooks to retry', count: 0 });
        }

        let retryCount = 0;
        for (const failed of failedWebhooks) {
            try {
                const payload = JSON.parse(failed.payload);
                webhookQueue.push({
                    url: N8N_WEBHOOK_URL,
                    payload: payload,
                    messageId: failed.message_id,
                    timestamp: Date.now(),
                    retryCount: failed.retry_count + 1
                });
                
                await new Promise((resolve) => {
                    db.run(
                        `UPDATE failed_webhooks SET retry_count = retry_count + 1 WHERE id = ?`,
                        [failed.id],
                        (err) => { 
                            if (err) {
                                console.error('Error updating retry count:', err.message);
                            }
                            resolve();
                        }
                    );
                });
                retryCount++;
            } catch (parseError) {
                console.error('Failed to parse failed webhook payload:', parseError.message);
            }
        }

        if (!isProcessingQueue) {
            processWebhookQueue();
        }

        res.json({ 
            message: 'Failed webhooks added to retry queue', 
            count: retryCount,
            total: failedWebhooks.length
        });

    } catch (error) {
        console.error('Error in retry failed webhooks:', error.message);
        res.status(500).json({ error: 'Failed to retry webhooks', details: error.message });
    }
});

// Webhook endpoint for receiving n8n AI replies
app.post('/webhook/reply', async (req, res) => {
    const { chatId, message, originalMessageId } = req.body;

    if (!chatId || !message) {
        return res.status(400).json({ error: 'chatId and message are required' });
    }

    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }

    try {
        // Send the AI reply via WhatsApp
        const sentMsg = await client.sendMessage(chatId, message);
        const messageId = sentMsg.id._serialized;
        const timestamp = Math.floor(Date.now() / 1000);

        // Log analytics for AI-sent message
        await logAnalytics('message', chatId, true, {
            messageId: messageId,
            message: message,
            originalMessageId: originalMessageId,
            source: 'n8n_webhook',
            sentBy: 'ai'
        });

        // Emit to dashboard for real-time updates dengan data yang lebih lengkap
        const messageData = {
            chatId: chatId,
            id: messageId,
            body: message,
            fromMe: true,
            timestamp: timestamp,
            type: 'chat',
            sender: client.info.wid._serialized,
            to: chatId,
            ack: 1,
            source: 'n8n_webhook'
        };

        io.emit('new_message', messageData);

        // Emit event khusus untuk update chat list
        io.emit('chat_updated', {
            chatId: chatId,
            lastMessage: message,
            lastTimestamp: timestamp,
            unreadCount: 0
        });

        // Clear chat cache to refresh dan trigger refresh
        chatCache.clear();
        lastChatRefresh = 0;

        console.log(`🤖 AI reply sent to ${chatId}: ${message.substring(0, 50)}...`);

        res.json({
            success: true,
            messageId: messageId,
            message: 'AI reply sent successfully'
        });
    } catch (err) {
        console.error('❌ Error sending AI reply:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Clear cache endpoint for debugging
app.post('/api/clear-cache', sessionAuthMiddleware, (req, res) => {
    chatCache.clear();
    lastChatRefresh = 0;
    res.json({ message: 'Cache cleared successfully' });
});

// Frontend now handled by Next.js (public directory reserved for Next.js static assets)

// Socket.IO untuk dashboard real-time
io.on('connection', (socket) => {
    console.log(`🔌 Dashboard client connected: ${socket.id}`);
    
    socket.emit('status', { 
        whatsappReady: clientReady,
        timestamp: new Date().toISOString(),
        cachedChats: chatCache.size,
        webhookQueueSize: webhookQueue.length
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Dashboard client disconnected: ${socket.id}`);
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    chatCache.clear();
    webhookQueue.length = 0;
    
    if (client) {
        client.destroy();
    }
    
    db.close((err) => {
        if (err) console.error('Error closing database:', err);
        else console.log('Database connection closed.');
    });
    
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});

// Jalankan Express + Socket.IO
server.listen(PORT, () => {
    console.log(`🌐 Webhook listening on port ${PORT}`);
    console.log(`📱 Dashboard: http://31.97.106.122:${PORT}`);
    console.log(`🔧 Original endpoints: /send, /typing`);
    console.log(`📊 Dashboard API: /api/chats, /api/messages/:chatId`);
    console.log(`📦 Webhook Status: /api/webhook-status`);
    console.log(`🔄 Retry Failed: /api/retry-failed-webhooks`);
    console.log(`🗑️ Clear Cache: /api/clear-cache`);
    console.log(`🤖 AI Reply Webhook: /webhook/reply`);
});

// Initialize WhatsApp client
initializeWhatsAppClient();
