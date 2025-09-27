const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const dbPath = path.join(__dirname, 'anakisa.db');

// Create database connection with better error handling
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
        console.log('⚠️ Running without database persistence');
    } else {
        console.log('✅ Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Create analytics table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        is_ai BOOLEAN,
        timestamp INTEGER NOT NULL,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating analytics table:', err.message);
        } else {
            console.log('✅ Analytics table ready');
            // Create indexes after table is created successfully
            createAnalyticsIndexes();
        }
    });

    // Create failed_webhooks table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS failed_webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT,
        payload TEXT,
        error TEXT,
        timestamp INTEGER,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating failed_webhooks table:', err.message);
        } else {
            console.log('✅ Failed webhooks table ready');
        }
    });

    // Create chat_settings table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS chat_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT UNIQUE NOT NULL,
        ai_mode BOOLEAN DEFAULT TRUE,
        last_updated INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating chat_settings table:', err.message);
        } else {
            console.log('✅ Chat settings table ready');
        }
        completeInitialization();
    });
}

// Create analytics indexes after table is ready
function createAnalyticsIndexes() {
    db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp)`, (err) => {
        if (err) console.error('Error creating analytics timestamp index:', err.message);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_chat_id ON analytics(chat_id)`, (err) => {
        if (err) console.error('Error creating analytics chat_id index:', err.message);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(type)`, (err) => {
        if (err) console.error('Error creating analytics type index:', err.message);
    });
}

// Final initialization completion
function completeInitialization() {
    console.log('✅ Database initialization completed');
}

// Export database instance
module.exports = db;

// Handle graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('✅ Database connection closed');
        }
        process.exit(0);
    });
});