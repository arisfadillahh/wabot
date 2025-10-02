const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const config = require('./src/config/config');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const helmet = require('helmet');
const CryptoJS = require('crypto-js');

// Load configuration first
const configData = config.load();
const database = require('./src/config/database');
const Analytics = require('./src/models/Analytics');
const MessageModel = require('./src/models/Message');

// Session token encryption
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// Encrypt session token
function encryptSessionToken(token) {
  return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
}

// Decrypt session token
function decryptSessionToken(encryptedToken) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Failed to decrypt session token:', error);
    return null;
  }
}

const app = express();
const server = http.createServer(app);

// Configure WebSocket for production
const isProduction = process.env.NODE_ENV === 'production';
const io = new Server(server, {
  cors: {
    origin: isProduction ? ['https://your-domain.com'] : ['http://localhost:3001', 'http://localhost:3002'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Security middleware for WebSocket connections
io.use((socket, next) => {
  const handshake = socket.handshake;

  // In production, require authentication
  if (isProduction) {
    const sessionToken = handshake.auth.token || handshake.headers['x-session-token'];
    if (!sessionToken) {
      return next(new Error('Authentication required'));
    }

    // Validate session token (decrypt and check)
    const decryptedToken = decryptSessionToken(sessionToken);
    if (!decryptedToken || !activeSessions.has(decryptedToken)) {
      return next(new Error('Invalid session'));
    }
  }

  next();
});

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

app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// CORS middleware for frontend integration
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'X-Session-Token', 'X-API-Key', 'X-CSRF-Token']
}));

// Session cookie configuration
const sessionCookieOptions = {
  key: '_session',
  path: '/',
  httpOnly: true,
  secure: false, // Set to true in production with HTTPS
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
};

// CSRF protection for state-changing operations - DISABLED FOR DEVELOPMENT
const csrfProtection = (req, res, next) => {
  // Skip CSRF protection for development
  next();
};

// Middleware to provide CSRF token to frontend
app.get('/api/csrf-token', (req, res) => {
  // Generate a simple CSRF token for development
  const crypto = require('crypto');
  const csrfToken = crypto.randomBytes(32).toString('hex');

  // Store token in session for validation
  req.csrfToken = () => csrfToken;

  res.json({
    csrfToken: csrfToken
  });
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
    // Check for session token in header or cookie
    const encryptedSessionToken = req.headers['x-session-token'] || req.cookies[sessionCookieOptions.key];

    if (encryptedSessionToken) {
        // Decrypt session token
        const sessionToken = decryptSessionToken(encryptedSessionToken);
        if (!sessionToken) {
            return res.status(403).json({
                error: 'Invalid session token',
                code: 'INVALID_SESSION',
                details: 'Your session token is invalid or has been corrupted'
            });
        }

        const session = activeSessions.get(sessionToken);
        if (!session) {
            return res.status(403).json({
                error: 'Invalid session token',
                code: 'INVALID_SESSION',
                details: 'Your session token is invalid or has been revoked'
            });
        }
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        // Support both old format (created) and new format (createdAt)
        const sessionCreated = session.createdAt || session.created;
        if (sessionCreated < oneDayAgo) {
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
        try {
            await database.run(`CREATE TABLE IF NOT EXISTS failed_webhooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT,
                payload TEXT,
                error TEXT,
                timestamp INTEGER,
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
        } catch (err) {
            console.warn('Failed to create failed_webhooks table:', err.message);
        }

        try {
            await database.run(
                `INSERT INTO failed_webhooks (message_id, payload, error, timestamp, retry_count) VALUES (?, ?, ?, ?, ?)`,
                [
                    item.payload.id || 'unknown',
                    JSON.stringify(item.payload),
                    error.message,
                    Date.now(),
                    item.retryCount || 0
                ]
            );
            console.log(`📝 Logged failed webhook for message ${item.payload.id}`);
        } catch (err) {
            console.error('Failed to log failed webhook:', err.message);
        }
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
        try {
            await database.run(
                `INSERT INTO analytics (type, chat_id, is_ai, timestamp, data) VALUES (?, ?, ?, ?, ?)`,
                [type, chatId, isAi ? 1 : 0, Date.now(), data ? JSON.stringify(data) : null]
            );
        } catch (err) {
            console.error('Error logging analytics:', err);
        }
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
                timestamp: msg.timestamp * 1000, // Convert Unix timestamp (seconds) to milliseconds
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
    client.on('qr', async qr => {
        console.log('📱 Scan QR code berikut:');
        qrcode.generate(qr, { small: true });

        // Generate HTML QR code for frontend
        try {
            const qrHtml = await QRCode.toDataURL(qr, {
                width: 200,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            // Send both data URL and raw QR for different frontend implementations
            io.emit('whatsapp:qr', {
                qrCode: qr,
                qrHtml: qrHtml,
                qrDataUrl: qrHtml
            });
            io.emit('qr', { qr }); // Keep for backward compatibility
        } catch (error) {
            console.error('Error generating QR code:', error);
            // Fallback to raw QR
            io.emit('whatsapp:qr', { qrCode: qr });
            io.emit('qr', { qr });
        }

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
        io.emit('whatsapp:ready', { status: 'ready', isReady: true });
        io.emit('ready'); // Keep for backward compatibility
        
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
        io.emit('whatsapp:status', { status: 'disconnected', isReady: false, reason });
        io.emit('disconnected', { reason }); // Keep for backward compatibility

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
        io.emit('whatsapp:status', { status: 'auth_failure', isReady: false, error: 'Authentication failed' });
        io.emit('auth_failure'); // Keep for backward compatibility
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
                const chatSetting = await database.get("SELECT ai_mode FROM chat_settings WHERE chat_id = ?", [chatId]);

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

            // Store incoming message in database
            try {
                await MessageModel.store({
                    messageId: msg.id._serialized,
                    chatId: chatId,
                    senderId: msg.from,
                    body: msg.body || '',
                    type: msg.type,
                    direction: 'incoming',
                    senderType: 'customer',
                    timestamp: msg.timestamp,
                    fromMe: msg.fromMe,
                    hasMedia: msg.hasMedia,
                    ack: msg.ack,
                    isAiGenerated: false
                });
                console.log(`💾 Database message stored for incoming message ${msg.id._serialized}`);
            } catch (dbError) {
                console.error('Error storing incoming message in database:', dbError);
            }

            // Log analytics untuk tracking AI vs Human
            try {
                await Analytics.logMessage(chatId, 'incoming', 'customer', {
                    messageId: msg.id._serialized,
                    messageType: msg.type,
                    fromMe: msg.fromMe,
                    bodyLength: msg.body ? msg.body.length : 0
                });
                console.log(`📊 Analytics logged for message ${msg.id._serialized} (AI: ${shouldSendWebhook})`);
            } catch (analyticsError) {
                console.error('Error logging analytics:', analyticsError);
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

                // Store sent message in database
                try {
                    await MessageModel.store({
                        messageId: msg.id._serialized,
                        chatId: chatId,
                        senderId: client.info.wid._serialized,
                        body: msg.body || '',
                        type: msg.type,
                        direction: 'outgoing',
                        senderType: 'human',
                        timestamp: msg.timestamp,
                        fromMe: true,
                        hasMedia: msg.hasMedia,
                        ack: msg.ack,
                        isAiGenerated: false
                    });
                    console.log(`💾 Database message stored for sent message ${msg.id._serialized} (Human)`);
                } catch (dbError) {
                    console.error('Error storing sent message in database:', dbError);
                }

                // Log analytics untuk sent messages (always human)
                try {
                    await Analytics.logMessage(chatId, 'outgoing', 'human', {
                        messageId: msg.id._serialized,
                        messageType: msg.type,
                        fromMe: true,
                        bodyLength: msg.body ? msg.body.length : 0,
                        source: 'sent_mobile'
                    });
                    console.log(`📊 Analytics logged for sent message ${msg.id._serialized} (Human: mobile)`);
                } catch (analyticsError) {
                    console.error('Error logging analytics for sent message:', analyticsError);
                }

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
app.post('/api/login', csrfProtection, (req, res) => {
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
    const encryptedSessionToken = encryptSessionToken(sessionToken);

    activeSessions.set(sessionToken, {
        createdAt: Date.now(),
        created: Date.now(), // Keep for backward compatibility
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

// Session refresh endpoint
app.post('/api/auth/refresh', sessionAuthMiddleware, (req, res) => {
    const encryptedSessionToken = req.headers['x-session-token'] || req.cookies[sessionCookieOptions.key];

    if (!encryptedSessionToken) {
        return res.status(401).json({
            error: 'No session token provided',
            code: 'MISSING_TOKEN'
        });
    }

    // Decrypt and validate session
    const sessionToken = decryptSessionToken(encryptedSessionToken);
    if (!sessionToken || !activeSessions.has(sessionToken)) {
        return res.status(401).json({
            error: 'Invalid or expired session',
            code: 'INVALID_SESSION'
        });
    }

    const session = activeSessions.get(sessionToken);
    const now = Date.now();
    const sessionAge = now - (session.createdAt || session.created);
    const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
    const remainingTime = maxSessionAge - sessionAge;

    // Extend session if less than 1 hour remaining
    if (remainingTime < 60 * 60 * 1000) {
        session.createdAt = now - (maxSessionAge - remainingTime);
        console.log('Session extended for user');
    }

    res.json({
        success: true,
        session: {
            createdAt: session.createdAt || session.created,
            expiresAt: (session.createdAt || session.created) + maxSessionAge,
            remainingTime: remainingTime
        }
    });
});

// Auth validate endpoint for session tokens
app.post('/api/auth/validate', (req, res) => {
    const { sessionToken } = req.body;
    console.log('Session validate attempt:', {
        hasSessionToken: !!sessionToken,
        sessionTokenPrefix: sessionToken ? sessionToken.substring(0, 8) : 'null',
        activeSessionsCount: activeSessions.size
    });

    if (!sessionToken) {
        console.log('Session validate failed: No session token provided');
        return res.status(400).json({
            error: 'Session token is required',
            code: 'MISSING_SESSION_TOKEN'
        });
    }

    // Check if session exists in active sessions
    const session = activeSessions.get(sessionToken);
    if (!session) {
        console.log('Session validate failed: Invalid or expired session token');
        return res.status(401).json({
            error: 'Invalid or expired session',
            code: 'INVALID_SESSION'
        });
    }

    // Check if session is expired (24 hours)
    const now = Date.now();
    const sessionAge = now - session.createdAt;
    const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

    if (sessionAge > maxSessionAge) {
        console.log('Session validate failed: Session expired');
        activeSessions.delete(sessionToken);
        return res.status(401).json({
            error: 'Session expired',
            code: 'SESSION_EXPIRED'
        });
    }

    console.log('Session validate successful');
    res.json({
        success: true,
        valid: true,
        session: {
            createdAt: session.createdAt,
            expiresAt: session.createdAt + maxSessionAge,
            remainingTime: maxSessionAge - sessionAge
        }
    });
});

// v1 API Sessions endpoint for frontend compatibility
app.post('/api/v1/sessions/login', (req, res) => {
    const { apiKey } = req.body;

    console.log('v1 Sessions login attempt:', {
        receivedApiKey: apiKey ? `${apiKey.substring(0, 4)}...` : 'null',
        expectedApiKey: API_KEY ? `${API_KEY.substring(0, 4)}...` : 'null',
        apiKeyType: typeof apiKey,
        expectedType: typeof API_KEY,
        apiKeyLength: apiKey ? apiKey.length : 0,
        expectedLength: API_KEY ? API_KEY.length : 0
    });

    if (!apiKey) {
        console.log('v1 Sessions login failed: API key is empty or null');
        return res.status(400).json({
            error: 'API key is required',
            code: 'MISSING_API_KEY',
            details: 'The API key field cannot be empty'
        });
    }

    if (typeof apiKey !== 'string') {
        console.log('v1 Sessions login failed: API key is not a string');
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
        console.log('v1 Sessions login failed: API key mismatch', {
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

    console.log('v1 Sessions login successful for API key');

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const encryptedSessionToken = encryptSessionToken(sessionToken);

    activeSessions.set(sessionToken, {
        createdAt: Date.now(),
        created: Date.now(), // Keep for backward compatibility
        apiKey: trimmedApiKey
    });

    // Clean old sessions (older than 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const [token, data] of activeSessions.entries()) {
        if (data.created < oneDayAgo) {
            activeSessions.delete(token);
        }
    }

    // Set secure session cookie
    res.cookie(sessionCookieOptions.key, encryptedSessionToken, {
      ...sessionCookieOptions,
      secure: sessionCookieOptions.secure,
      httpOnly: sessionCookieOptions.httpOnly,
      sameSite: sessionCookieOptions.sameSite
    });

    res.json({
        success: true,
        userId: 'user_' + Date.now(), // Add userId for frontend compatibility
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        whatsappReady: clientReady,
        message: 'Login successful'
    });
});

// v1 API - Session logout
app.post('/api/v1/sessions/logout', sessionAuthMiddleware, csrfProtection, (req, res) => {
    const encryptedSessionToken = req.headers['x-session-token'];
    if (encryptedSessionToken) {
        const sessionToken = decryptSessionToken(encryptedSessionToken);
        if (sessionToken && activeSessions.has(sessionToken)) {
            activeSessions.delete(sessionToken);
        }
    }

    // Clear session cookie
    res.clearCookie(sessionCookieOptions.key);

    res.json({
        success: true,
        message: 'Logout successful'
    });
});

// v1 API - WhatsApp status
app.get('/api/v1/whatsapp/status', (req, res) => {
    res.json({
        isReady: clientReady,
        isAuthenticated: clientReady,
        isConnected: clientReady,
        lastActivity: clientReady ? new Date().toISOString() : undefined,
        error: clientReady ? undefined : 'WhatsApp client not ready'
    });
});

// v1 API - WhatsApp client info
app.get('/api/v1/whatsapp/client-info', sessionAuthMiddleware, (req, res) => {
    if (!client || !clientReady) {
        return res.status(503).json({
            error: 'WhatsApp client not ready',
            code: 'CLIENT_NOT_READY'
        });
    }

    res.json({
        wid: client.info.wid._serialized,
        pushname: client.info.pushname,
        platform: client.info.platform,
        connected: client.info.connected
    });
});

// v1 API - Analytics dashboard
app.get('/api/v1/analytics/dashboard', sessionAuthMiddleware, async (req, res) => {
    try {
        console.log('Dashboard API endpoint called');
        const days = parseInt(req.query.days) || 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get message statistics from database with error handling
        let totalMessagesResult = { count: 0 };
        let sentMessagesResult = { count: 0 };
        let receivedMessagesResult = { count: 0 };
        let failedMessagesResult = { count: 0 };

        try {
            [totalMessagesResult, sentMessagesResult, receivedMessagesResult, failedMessagesResult] = await Promise.all([
                database.get('SELECT COUNT(*) as count FROM messages WHERE timestamp >= ?', [startDate.toISOString()]).catch(() => ({ count: 0 })),
                database.get('SELECT COUNT(*) as count FROM messages WHERE timestamp >= ? AND from_me = 1', [startDate.toISOString()]).catch(() => ({ count: 0 })),
                database.get('SELECT COUNT(*) as count FROM messages WHERE timestamp >= ? AND from_me = 0', [startDate.toISOString()]).catch(() => ({ count: 0 })),
                database.get('SELECT COUNT(*) as count FROM messages WHERE timestamp >= ? AND status = "failed"', [startDate.toISOString()]).catch(() => ({ count: 0 }))
            ]);
        } catch (dbError) {
            console.log('Database query error, using default values:', dbError.message);
        }

        // Get daily activity
        const dailyActivity = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const [sentResult, receivedResult, failedResult] = await Promise.all([
                database.get('SELECT COUNT(*) as count FROM messages WHERE date(timestamp) = ? AND from_me = 1', [dateStr]).catch(() => ({ count: 0 })),
                database.get('SELECT COUNT(*) as count FROM messages WHERE date(timestamp) = ? AND from_me = 0', [dateStr]).catch(() => ({ count: 0 })),
                database.get('SELECT COUNT(*) as count FROM messages WHERE date(timestamp) = ? AND status = "failed"', [dateStr]).catch(() => ({ count: 0 }))
            ]);

            dailyActivity.push({
                date: dateStr,
                sent: sentResult.count,
                received: receivedResult.count,
                failed: failedResult.count
            });
        }

        // Get unique contacts count with error handling
        let contactsResult = { count: 0 };
        try {
            contactsResult = await database.get('SELECT COUNT(DISTINCT chat_id) as count FROM messages WHERE timestamp >= ?', [startDate.toISOString()]).catch(() => ({ count: 0 }));
        } catch (contactsError) {
            console.log('Contacts query error, using default value:', contactsError.message);
        }

        const response = {
            success: true,
            data: {
                dashboard: {
                    overview: {
                        totalMessages: totalMessagesResult.count,
                        totalContacts: contactsResult.count,
                        messagesSent: sentMessagesResult.count,
                        messagesReceived: receivedMessagesResult.count,
                        failedMessages: failedMessagesResult.count,
                        unreadMessages: 0, // TODO: Implement unread tracking
                        connectionStatus: clientReady ? 'connected' : 'disconnected',
                        lastActivity: new Date().toISOString(),
                        messageTrend: 'up',
                        contactTrend: 'up'
                    },
                    dailyActivity: dailyActivity,
                    connectionStatus: clientReady ? 'connected' : 'disconnected'
                }
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Dashboard analytics error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: 'Failed to fetch dashboard data',
            code: 'DASHBOARD_ERROR',
            details: error.message
        });
    }
});

// Test endpoint - Analytics overview (no auth for testing)
app.get('/api/test/analytics/overview', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;

        // Use Analytics model to get real data from messages
        const overview = await Analytics.getOverview(days);

        res.json({
            success: true,
            data: overview
        });
    } catch (error) {
        console.error('Error fetching analytics overview:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics overview'
        });
    }
});

// v1 API - Analytics overview
app.get('/api/v1/analytics/overview', sessionAuthMiddleware, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;

        // Use Analytics model to get real data from messages
        const overview = await Analytics.getOverview(days);

        // Get additional metrics
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const [messageStats, contactsStats] = await Promise.all([
            database.get(`
                SELECT
                    COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiResponses,
                    COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanResponses,
                    COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingMessages,
                    COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingMessages,
                    COUNT(CASE WHEN has_media = 1 THEN 1 END) as mediaMessages
                FROM messages WHERE timestamp >= ?
            `, [Math.floor(startDate.getTime() / 1000)]),
            database.get('SELECT COUNT(DISTINCT chat_id) as count FROM messages WHERE timestamp >= ?', [Math.floor(startDate.getTime() / 1000)])
        ]);

        res.json({
            success: true,
            data: {
                totalMessages: overview.totalMessages || 0,
                incomingMessages: overview.incomingMessages || 0,
                outgoingMessages: overview.outgoingMessages || 0,
                aiResponses: overview.aiProcessed || 0, // Use aiProcessed from Analytics.getOverview
                humanResponses: overview.humanProcessed || 0, // Use humanProcessed from Analytics.getOverview
                messagesToday: overview.messagesToday || 0,
                totalChats: overview.totalChats || 0,
                activeContacts: contactsStats.count || 0,
                mediaMessages: messageStats.mediaMessages || 0,
                successRate: 100, // WhatsApp messages don't typically fail in the same way
                avgResponseTime: 0 // TODO: Implement response time calculation
            }
        });
    } catch (error) {
        console.error('Overview analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch overview data',
            code: 'OVERVIEW_ERROR'
        });
    }
});

// v1 API - Detailed message stats with human/AI breakdown
app.get('/api/v1/analytics/detailed-message-stats', sessionAuthMiddleware, async (req, res) => {
    try {
        const { chatId, days = 30 } = req.query;

        // Use Analytics model to get detailed message statistics
        const stats = await Analytics.getDetailedMessageStats(chatId, parseInt(days));

        res.json({
            success: true,
            data: {
                stats,
                filters: {
                    chatId: chatId || 'all',
                    days: parseInt(days)
                },
                timestamp: Date.now()
            }
        });
    } catch (error) {
        console.error('Detailed message stats error:', error);
        res.status(500).json({
            error: 'Failed to fetch detailed message statistics',
            code: 'DETAILED_STATS_ERROR'
        });
    }
});

// Test Analytics - Daily activity (without authentication for testing)
app.get('/api/test/analytics/daily', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        // Use Analytics model to get real daily activity data
        const dailyActivity = await Analytics.getDailyActivity(days);

        res.json({
            success: true,
            data: {
                dailyActivity: dailyActivity,
                totalDays: days
            }
        });
    } catch (error) {
        console.error('Daily analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch daily analytics',
            code: 'DAILY_ANALYTICS_ERROR'
        });
    }
});

// Test Analytics - Message trends (without authentication for testing)
app.get('/api/test/analytics/trends', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        // Use Analytics model to get trends data with proper message counting
        const dailyActivity = await Analytics.getDailyActivity(days);

        // Format for trends chart - Total, AI, and Human messages
        const trends = dailyActivity.map(day => ({
            date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            total: day.total,
            ai: day.ai,
            human: day.human,
            incoming: day.incoming,
            outgoing: day.outgoing
        }));

        res.json({
            success: true,
            data: {
                trends: trends,
                totalDays: days
            }
        });
    } catch (error) {
        console.error('Trends analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch trends analytics',
            code: 'TRENDS_ANALYTICS_ERROR'
        });
    }
});

// Test Analytics - Peak hours analysis (without authentication for testing)
app.get('/api/test/analytics/peak-hours', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        // Use Analytics model to get real peak hours data
        const peakHoursData = await Analytics.getPeakHours(days);

        res.json({
            success: true,
            data: peakHoursData
        });
    } catch (error) {
        console.error('Peak hours analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch peak hours analytics',
            code: 'PEAK_HOURS_ANALYTICS_ERROR'
        });
    }
});

// Test Analytics - Hourly activity (without authentication for testing)
app.get('/api/test/analytics/hourly', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        // Use Analytics model to get real hourly activity data
        const hourlyActivity = await Analytics.getHourlyActivity(days);

        res.json({
            success: true,
            data: {
                hourlyActivity: hourlyActivity,
                totalDays: days
            }
        });
    } catch (error) {
        console.error('Hourly analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch hourly analytics',
            code: 'HOURLY_ANALYTICS_ERROR'
        });
    }
});

// v1 API - Analytics daily activity
app.get('/api/v1/analytics/daily', sessionAuthMiddleware, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        // Use Analytics model to get real daily activity data
        const dailyActivity = await Analytics.getDailyActivity(days);

        res.json({
            success: true,
            data: {
                dailyActivity: dailyActivity,
                totalDays: days
            }
        });
    } catch (error) {
        console.error('Daily analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch daily analytics',
            code: 'DAILY_ANALYTICS_ERROR'
        });
    }
});

// v1 API - Analytics message trends
app.get('/api/v1/analytics/trends', sessionAuthMiddleware, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        // Use Analytics model to get trends data with proper message counting
        const dailyActivity = await Analytics.getDailyActivity(days);

        // Format for trends chart - Total, AI, and Human messages
        const trends = dailyActivity.map(day => ({
            date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            total: day.total,
            ai: day.ai,
            human: day.human,
            incoming: day.incoming,
            outgoing: day.outgoing
        }));

        res.json({
            success: true,
            data: {
                trends: trends,
                totalDays: days
            }
        });
    } catch (error) {
        console.error('Trends analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch trends data',
            code: 'TRENDS_ERROR'
        });
    }
});

// v1 API - Chats
app.get('/api/v1/whatsapp/chats', sessionAuthMiddleware, async (req, res) => {
    try {
        if (!client || !clientReady) {
            // Return demo data when WhatsApp client is not ready
            const demoChats = [
                {
                    id: 'demo_chat_1',
                    name: 'Demo Contact 1',
                    isGroup: false,
                    isReadOnly: false,
                    unreadCount: 2,
                    timestamp: new Date().toISOString(),
                    lastMessage: {
                        content: 'Hello! This is a demo message.',
                        fromMe: false,
                        timestamp: new Date().toISOString()
                    }
                },
                {
                    id: 'demo_chat_2',
                    name: 'Demo Group',
                    isGroup: true,
                    isReadOnly: false,
                    unreadCount: 0,
                    timestamp: new Date(Date.now() - 3600000).toISOString(),
                    lastMessage: {
                        content: 'Welcome to the demo group!',
                        fromMe: true,
                        timestamp: new Date(Date.now() - 3600000).toISOString()
                    }
                },
                {
                    id: 'demo_chat_3',
                    name: 'Support Team',
                    isGroup: false,
                    isReadOnly: false,
                    unreadCount: 1,
                    timestamp: new Date(Date.now() - 7200000).toISOString(),
                    lastMessage: {
                        content: 'How can I help you today?',
                        fromMe: false,
                        timestamp: new Date(Date.now() - 7200000).toISOString()
                    }
                }
            ];

            return res.json({
                success: true,
                data: {
                    chats: demoChats,
                    pagination: {
                        page: 1,
                        limit: 50,
                        total: demoChats.length,
                        pages: 1
                    }
                },
                demo: true
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const chats = await client.getChats();
        const limitedChats = chats.slice(offset, offset + limit);

        const formattedChats = await Promise.all(limitedChats.map(async (chat) => {
            const lastMessage = chat.lastMessage;
            return {
                id: chat.id._serialized,
                name: chat.name || (chat.isGroup ? chat.groupMetadata?.subject : chat.contact?.pushname || 'Unknown'),
                isGroup: chat.isGroup,
                isReadOnly: chat.isReadOnly,
                unreadCount: chat.unreadCount,
                timestamp: chat.timestamp ? new Date(chat.timestamp * 1000).toISOString() : new Date().toISOString(),
                lastMessage: lastMessage ? {
                    content: lastMessage.body || lastMessage.caption || 'Media',
                    fromMe: lastMessage.fromMe,
                    timestamp: new Date(lastMessage.timestamp * 1000).toISOString()
                } : undefined
            };
        }));

        res.json({
            success: true,
            data: {
                chats: formattedChats,
                pagination: {
                    page,
                    limit,
                    total: chats.length,
                    pages: Math.ceil(chats.length / limit)
                }
            }
        });
    } catch (error) {
        console.error('Chats fetch error:', error);

        // Return demo data on error instead of failing
        const demoChats = [
            {
                id: 'error_demo_chat_1',
                name: 'Demo Contact (Error Fallback)',
                isGroup: false,
                isReadOnly: false,
                unreadCount: 0,
                timestamp: new Date().toISOString(),
                lastMessage: {
                    content: 'Chats temporarily unavailable. Showing demo data.',
                    fromMe: false,
                    timestamp: new Date().toISOString()
                }
            }
        ];

        res.json({
            success: true,
            data: {
                chats: demoChats,
                pagination: {
                    page: 1,
                    limit: 50,
                    total: demoChats.length,
                    pages: 1
                }
            },
            error: 'Using demo data due to error',
            demo: true
        });
    }
});

// TODO: Mount structured API routes (v2) when fully implemented
// const apiRoutes = require('./src/routes');
// app.use('/api/v2', apiRoutes);

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
app.post('/send', sessionAuthMiddleware, csrfProtection, validateSendMessage, async (req, res) => {
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
app.post('/api/send-message', sessionAuthMiddleware, csrfProtection, async (req, res) => {
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
    const chatId = req.params.chatId;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    if (!chatId || typeof chatId !== 'string') {
        return res.status(400).json({ error: 'Invalid chatId' });
    }

    try {
        if (!clientReady) {
            // Return demo messages when WhatsApp client is not ready
            const demoMessages = [
                {
                    id: 'demo_msg_1',
                    chatId: chatId,
                    body: 'Hello! This is a demo message.',
                    fromMe: false,
                    timestamp: Date.now() - 3600000, // 1 hour ago in milliseconds
                    type: 'chat',
                    status: 'delivered'
                },
                {
                    id: 'demo_msg_2',
                    chatId: chatId,
                    body: 'This is a demo response from the system.',
                    fromMe: true,
                    timestamp: Date.now() - 1800000, // 30 minutes ago in milliseconds
                    type: 'chat',
                    status: 'delivered'
                }
            ];

            return res.json({
                messages: demoMessages,
                pagination: {
                    limit,
                    count: demoMessages.length,
                    hasMore: false
                },
                demo: true
            });
        }

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

        // Return demo messages on error instead of failing
        const demoMessages = [
            {
                id: 'error_demo_msg_1',
                chatId: chatId,
                body: 'Messages are temporarily unavailable. Showing demo data.',
                fromMe: false,
                timestamp: Date.now(), // Current time in milliseconds
                type: 'chat',
                status: 'delivered'
            }
        ];

        res.json({
            messages: demoMessages,
            pagination: {
                limit,
                count: demoMessages.length,
                hasMore: false
            },
            error: 'Using demo data due to error',
            demo: true
        });
    }
});

// Mark messages as read
app.post('/api/messages/:chatId/read', sessionAuthMiddleware, async (req, res) => {
    if (!clientReady) {
        return res.status(503).json({ error: 'WhatsApp client not ready' });
    }

    const chatId = req.params.chatId;

    if (!chatId || typeof chatId !== 'string') {
        return res.status(400).json({ error: 'Invalid chatId' });
    }

    try {
        console.log(`🔍 Marking messages as read for chat: ${chatId}`);

        // Get the chat and mark messages as read
        const chat = await client.getChatById(chatId);

        // Mark all messages as read in WhatsApp
        await chat.sendSeen();

        // Clear the chat cache to refresh unread counts
        chatCache.clear();
        lastChatRefresh = 0;

        console.log(`✅ Messages marked as read for chat: ${chatId}`);

        res.json({
            success: true,
            message: 'Messages marked as read successfully',
            chatId: chatId
        });

    } catch (error) {
        console.error(`❌ Failed to mark messages as read for chat ${chatId}:`, error);
        res.status(500).json({
            error: 'Failed to mark messages as read',
            details: error.message
        });
    }
});

// Chat settings endpoints
app.get('/api/chat-settings', sessionAuthMiddleware, async (req, res) => {
    try {
        const rows = await database.all("SELECT chat_id, ai_mode, last_updated FROM chat_settings", []);
        const settingsObj = {};
        (rows || []).forEach(row => {
            settingsObj[row.chat_id] = {
                aiMode: row.ai_mode === 1,
                lastUpdated: row.last_updated
            };
        });

        res.json({ settings: settingsObj });
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

            try {
                await database.run(
                    `INSERT OR REPLACE INTO chat_settings (chat_id, ai_mode, last_updated, updated_at)
                     VALUES (?, ?, ?, datetime('now'))`,
                    [chatId, 1, Date.now()] // 1 = AI mode enabled
                );
                enabledCount++;
            } catch (err) {
                console.error(`Error enabling AI for chat ${chatId}:`, err);
            }
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
        await database.run(
            `INSERT OR REPLACE INTO chat_settings (chat_id, ai_mode, last_updated, updated_at)
             VALUES (?, ?, ?, datetime('now'))`,
            [chatId, aiMode ? 1 : 0, Date.now()]
        );

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
        const totalChats = (await database.get("SELECT COUNT(*) as count FROM (SELECT DISTINCT chat_id FROM analytics)"))?.count || 0;
        const totalMessages = (await database.get("SELECT COUNT(*) as count FROM analytics WHERE type = 'message'"))?.count || 0;
        const aiProcessed = (await database.get("SELECT COUNT(*) as count FROM analytics WHERE type = 'message' AND is_ai = 1"))?.count || 0;
        const humanProcessed = (await database.get("SELECT COUNT(*) as count FROM analytics WHERE type = 'message' AND is_ai = 0"))?.count || 0;

        // Get daily activity for last 7 days
        const dailyActivity = {};
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const count = (await database.get(
                "SELECT COUNT(*) as count FROM analytics WHERE type = 'message' AND date(timestamp/1000, 'unixepoch') = ?",
                [dateStr]
            ))?.count || 0;

            dailyActivity[dateStr] = count;
        }

        // Get recent activity
        const recentActivity = await database.all(
            "SELECT * FROM analytics ORDER BY timestamp DESC LIMIT 10",
            []
        );

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
        const tableExists = await database.get("SELECT name FROM sqlite_master WHERE type='table' AND name='failed_webhooks'");

        if (!tableExists) {
            return res.json({ message: 'No failed webhooks table exists', count: 0 });
        }

        const failedWebhooks = await database.all(
            `SELECT * FROM failed_webhooks WHERE retry_count < 3 ORDER BY timestamp DESC LIMIT 50`,
            []
        );

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
                
                try {
                    await database.run(
                        `UPDATE failed_webhooks SET retry_count = retry_count + 1 WHERE id = ?`,
                        [failed.id]
                    );
                } catch (err) {
                    console.error('Error updating retry count:', err.message);
                }
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

        // Store AI message in database with proper tracking
        await MessageModel.store({
            messageId: messageId,
            chatId: chatId,
            senderId: client.info.wid._serialized,
            body: message,
            type: 'chat',
            direction: 'outgoing',
            senderType: 'ai',
            timestamp: timestamp,
            fromMe: true,
            hasMedia: false,
            ack: sentMsg.ack,
            isAiGenerated: true
        });

        // Log analytics for AI-sent message with proper tracking
        await Analytics.logMessage(chatId, 'outgoing', 'ai', {
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

// Test endpoint for simulating real-time messages
app.post('/api/test/simulate-message', async (req, res) => {
  try {
    const { messageCount = 5 } = req.body;
    const db = require('./src/config/database');

    const now = Date.now();
    const testMessages = [];

    // Generate realistic test messages
    for (let i = 0; i < messageCount; i++) {
      const hoursBack = Math.floor(Math.random() * 3);
      const messageTime = now - (hoursBack * 60 * 60 * 1000) + (Math.random() * 60 * 60 * 1000);

      const messageData = {
        message_id: `test_rt_${now}_${i}`,
        chat_id: `test_rt_chat_${(i % 3) + 1}@c.us`,
        sender_id: Math.random() > 0.6 ? `customer${(i % 5) + 1}@c.us` :
                   Math.random() > 0.5 ? 'ai_system' : `agent${(i % 2) + 1}@c.us`,
        body: generateTestMessage(Math.random() > 0.6 ? 'incoming' : (Math.random() > 0.5 ? 'ai' : 'human')),
        direction: Math.random() > 0.6 ? 'incoming' : 'outgoing',
        sender_type: Math.random() > 0.6 ? 'customer' : (Math.random() > 0.5 ? 'ai' : 'human'),
        timestamp: messageTime,
        from_me: Math.random() > 0.6 ? 0 : 1,
        is_ai_generated: Math.random() > 0.5 ? 1 : 0
      };

      testMessages.push(messageData);
    }

    // Insert messages into database
    let insertedCount = 0;
    for (const msg of testMessages) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR IGNORE INTO messages (message_id, chat_id, sender_id, body, direction, sender_type, timestamp, from_me, is_ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [msg.message_id, msg.chat_id, msg.sender_id, msg.body, msg.direction, msg.sender_type, msg.timestamp, msg.from_me, msg.is_ai_generated],
          function(err) {
            if (err) reject(err);
            else if (this.changes > 0) insertedCount++;
            resolve();
          }
        );
      });
    }

    // Get updated analytics summary
    const Analytics = require('./src/models/Analytics');
    const updatedAnalytics = await Analytics.getOverview();
    const updatedPeakHours = await Analytics.getPeakHours();

    res.json({
      success: true,
      message: `Successfully simulated ${insertedCount} new messages`,
      insertedCount,
      totalMessages: updatedAnalytics.totalMessages,
      incomingMessages: updatedAnalytics.incomingMessages,
      outgoingMessages: updatedAnalytics.outgoingMessages,
      aiProcessed: updatedAnalytics.aiProcessed,
      humanProcessed: updatedAnalytics.humanProcessed,
      peakHoursData: updatedPeakHours.hourlyData.slice(-6)
    });

  } catch (error) {
    console.error('Error simulating messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate test message content
function generateTestMessage(type) {
  const incomingMessages = [
    "Hello, I need help with my order status",
    "Can you check when my delivery will arrive?",
    "I have a question about your pricing plans",
    "What are your business hours?",
    "Thank you for the quick response!"
  ];

  const aiMessages = [
    "Hello! I'm here to help you with your inquiry.",
    "I'll check that information for you right away.",
    "Thank you for your patience. Your order is being processed.",
    "I understand your concern. Let me assist you with that."
  ];

  const humanMessages = [
    "Hi there! I'll personally handle your request.",
    "Let me look into that for you immediately.",
    "I've processed your order and you should receive confirmation shortly.",
    "I understand the urgency and I'm expediting your case."
  ];

  let messages;
  switch (type) {
    case 'incoming':
      messages = incomingMessages;
      break;
    case 'ai':
      messages = aiMessages;
      break;
    case 'human':
      messages = humanMessages;
      break;
    default:
      messages = [...incomingMessages, ...aiMessages, ...humanMessages];
  }

  return messages[Math.floor(Math.random() * messages.length)];
}

// Clear cache endpoint for debugging
app.post('/api/clear-cache', sessionAuthMiddleware, (req, res) => {
    chatCache.clear();
    lastChatRefresh = 0;
    res.json({ message: 'Cache cleared successfully' });
});

// Request QR code generation
app.post('/api/request-qr', sessionAuthMiddleware, (req, res) => {
    console.log('📱 Manual QR request received');

    if (clientReady) {
        return res.json({
            success: false,
            message: 'WhatsApp client is already ready'
        });
    }

    if (!client) {
        console.log('🔄 Reinitializing WhatsApp client for QR generation...');
        initializeWhatsAppClient();
        return res.json({
            success: true,
            message: 'WhatsApp client reinitialized for QR generation'
        });
    }

    res.json({
        success: true,
        message: 'QR generation request received, client should be generating QR'
    });
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

    // Handle manual QR request
    socket.on('request-qr', () => {
        console.log('📱 QR request received via WebSocket from:', socket.id);

        if (clientReady) {
            socket.emit('qr-response', {
                success: false,
                message: 'WhatsApp client is already ready'
            });
            return;
        }

        if (!client) {
            console.log('🔄 Reinitializing WhatsApp client for QR generation...');
            initializeWhatsAppClient();
            socket.emit('qr-response', {
                success: true,
                message: 'WhatsApp client reinitialized for QR generation'
            });
            return;
        }

        // If client exists but not ready, try to trigger QR generation
        // by destroying and recreating the client
        try {
            if (client) {
                client.destroy();
                client = null;
                clientReady = false;
            }
            console.log('🔄 Destroyed old client, reinitializing for QR...');
            initializeWhatsAppClient();

            socket.emit('qr-response', {
                success: true,
                message: 'Client destroyed and reinitialized for QR generation'
            });
        } catch (error) {
            console.error('Error reinitializing client:', error);
            socket.emit('qr-response', {
                success: false,
                message: 'Failed to reinitialize client',
                error: error.message
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Dashboard client disconnected: ${socket.id}`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    chatCache.clear();
    webhookQueue.length = 0;

    if (client) {
        client.destroy();
    }

    try {
        await database.close();
        console.log('Database connection closed.');
    } catch (err) {
        console.error('Error closing database:', err);
    }
    
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});

// Initialize database
async function initializeApp() {
    try {
        await database.initialize();
        console.log('✅ Database initialized successfully');

        // Start server after database is ready
        server.listen(PORT, () => {
            console.log(`🌐 Webhook listening on port ${PORT}`);
            console.log(`📱 Dashboard: http://localhost:${PORT}`);
            console.log(`🔧 Original endpoints: /send, /typing`);
            console.log(`📊 Dashboard API: /api/chats, /api/messages/:chatId`);
            console.log(`📦 Webhook Status: /api/webhook-status`);
            console.log(`🔄 Retry Failed: /api/retry-failed-webhooks`);
            console.log(`🗑️ Clear Cache: /api/clear-cache`);
            console.log(`🤖 AI Reply Webhook: /webhook/reply`);
        });

        // Initialize WhatsApp client after database is ready
        initializeWhatsAppClient();
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
}

// Start the application
initializeApp();
