const config = require('../config/config');
const logger = require('../config/logger');

async function migrateMessageSchema() {
  try {
    // Load config first
    await config.load();

    // Get database manager
    const DatabaseManager = require('../config/database');
    const db = DatabaseManager;

    // Initialize database if not already done
    if (!db.isInitialized) {
      await db.initialize();
    }

    console.log('🔄 Starting message schema migration...');

    // Add new columns to existing messages table
    await db.run(`
      ALTER TABLE messages
      ADD COLUMN direction TEXT NOT NULL DEFAULT 'incoming'
    `);

    await db.run(`
      ALTER TABLE messages
      ADD COLUMN sender_type TEXT NOT NULL DEFAULT 'customer'
    `);

    // Update existing records to have proper direction values
    await db.run(`
      UPDATE messages
      SET direction = CASE
        WHEN from_me = 1 THEN 'outgoing'
        ELSE 'incoming'
      END
    `);

    // Update existing records to have proper sender_type values
    await db.run(`
      UPDATE messages
      SET sender_type = CASE
        WHEN from_me = 1 AND is_ai_generated = 1 THEN 'ai'
        WHEN from_me = 1 AND is_ai_generated = 0 THEN 'human'
        ELSE 'customer'
      END
    `);

    // Create the new indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction)',
      'CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type)',
      'CREATE INDEX IF NOT EXISTS idx_messages_chat_direction ON messages(chat_id, direction)',
      'CREATE INDEX IF NOT EXISTS idx_messages_timestamp_direction ON messages(timestamp, direction)'
    ];

    for (const index of indexes) {
      await db.run(index);
    }

    console.log('✅ Message schema migration completed successfully');

    // Log the results
    const messageStats = await db.get(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incoming,
        COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoing,
        COUNT(CASE WHEN sender_type = 'customer' THEN 1 END) as customer_messages,
        COUNT(CASE WHEN sender_type = 'ai' THEN 1 END) as ai_messages,
        COUNT(CASE WHEN sender_type = 'human' THEN 1 END) as human_messages
      FROM messages
    `);

    console.log('📊 Updated message statistics:', messageStats);

  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('ℹ️ Migration already completed - columns already exist');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }
}

module.exports = { migrateMessageSchema };