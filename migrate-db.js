const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function runMigration() {
  const dbPath = path.resolve('./anakisa.db');
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      throw err;
    }
    console.log('Connected to SQLite database');
  });

  try {
    // Check if columns already exist
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(messages)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const hasDirection = tableInfo.some(col => col.name === 'direction');
    const hasSenderType = tableInfo.some(col => col.name === 'sender_type');

    if (hasDirection && hasSenderType) {
      console.log('ℹ️ Migration already completed - columns already exist');
      return;
    }

    console.log('🔄 Starting message schema migration...');

    // Add direction column if not exists
    if (!hasDirection) {
      await new Promise((resolve, reject) => {
        db.run("ALTER TABLE messages ADD COLUMN direction TEXT NOT NULL DEFAULT 'incoming'", (err) => {
          if (err && !err.message.includes('duplicate column name')) reject(err);
          else resolve();
        });
      });
      console.log('✅ Added direction column');
    }

    // Add sender_type column if not exists
    if (!hasSenderType) {
      await new Promise((resolve, reject) => {
        db.run("ALTER TABLE messages ADD COLUMN sender_type TEXT NOT NULL DEFAULT 'customer'", (err) => {
          if (err && !err.message.includes('duplicate column name')) reject(err);
          else resolve();
        });
      });
      console.log('✅ Added sender_type column');
    }

    // Update existing records
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE messages
        SET direction = CASE
          WHEN from_me = 1 THEN 'outgoing'
          ELSE 'incoming'
        END
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ Updated direction values');

    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE messages
        SET sender_type = CASE
          WHEN from_me = 1 AND is_ai_generated = 1 THEN 'ai'
          WHEN from_me = 1 AND is_ai_generated = 0 THEN 'human'
          ELSE 'customer'
        END
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✅ Updated sender_type values');

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction)',
      'CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type)',
      'CREATE INDEX IF NOT EXISTS idx_messages_chat_direction ON messages(chat_id, direction)',
      'CREATE INDEX IF NOT EXISTS idx_messages_timestamp_direction ON messages(timestamp, direction)'
    ];

    for (const indexSql of indexes) {
      await new Promise((resolve, reject) => {
        db.run(indexSql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    console.log('✅ Created indexes');

    // Get statistics
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incoming,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoing,
          COUNT(CASE WHEN sender_type = 'customer' THEN 1 END) as customer_messages,
          COUNT(CASE WHEN sender_type = 'ai' THEN 1 END) as ai_messages,
          COUNT(CASE WHEN sender_type = 'human' THEN 1 END) as human_messages
        FROM messages
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log('📊 Updated message statistics:', stats);
    console.log('✅ Migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}

runMigration().catch(console.error);