const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const EventEmitter = require('events');
const config = require('./config');

class DatabaseManager extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.isInitialized = false;
    this.connectionPool = [];
    this.maxPoolSize = config.get('DB_POOL_SIZE');
    this.activeConnections = 0;
  }

  /**
   * Initialize database connection and tables
   */
  async initialize() {
    try {
      const dbPath = path.resolve(config.get('DB_PATH'));

      // Create database connection with enhanced options
      this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX, (err) => {
        if (err) {
          this.emit('error', new Error(`Database connection error: ${err.message}`));
          throw new Error(`Database connection error: ${err.message}`);
        }
        console.log('✅ Connected to SQLite database');
      });

      // Enable foreign keys and configure pragmas
      await this.run('PRAGMA foreign_keys = ON');
      await this.run('PRAGMA journal_mode = WAL');
      await this.run('PRAGMA synchronous = NORMAL');
      await this.run('PRAGMA cache_size = -2000');
      await this.run('PRAGMA temp_store = MEMORY');
      await this.run('PRAGMA mmap_size = 268435456');

      // Initialize tables
      await this.createTables();
      this.isInitialized = true;
      this.emit('ready');

      console.log('✅ Database initialization completed');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    const tables = [
      {
        name: 'analytics',
        schema: `CREATE TABLE IF NOT EXISTS analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          chat_id TEXT NOT NULL,
          is_ai BOOLEAN,
          timestamp INTEGER NOT NULL,
          data TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'failed_webhooks',
        schema: `CREATE TABLE IF NOT EXISTS failed_webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT,
          payload TEXT,
          error TEXT,
          timestamp INTEGER,
          retry_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'chat_settings',
        schema: `CREATE TABLE IF NOT EXISTS chat_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT UNIQUE NOT NULL,
          ai_mode BOOLEAN DEFAULT TRUE,
          last_updated INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'sessions',
        schema: `CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_token TEXT UNIQUE NOT NULL,
          api_key_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          user_agent TEXT,
          ip_address TEXT
        )`
      },
      {
        name: 'messages',
        schema: `CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT UNIQUE NOT NULL,
          chat_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          body TEXT,
          type TEXT DEFAULT 'chat',
          timestamp INTEGER NOT NULL,
          from_me BOOLEAN DEFAULT FALSE,
          has_media BOOLEAN DEFAULT FALSE,
          media_type TEXT,
          media_size INTEGER,
          ack INTEGER DEFAULT 0,
          is_ai_generated BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      }
    ];

    for (const table of tables) {
      try {
        await this.run(table.schema);
        console.log(`✅ Table '${table.name}' ready`);
      } catch (error) {
        console.error(`❌ Error creating table '${table.name}':`, error.message);
        throw error;
      }
    }

    // Create indexes
    await this.createIndexes();
  }

  /**
   * Create database indexes
   */
  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_chat_id ON analytics(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(type)',
      'CREATE INDEX IF NOT EXISTS idx_failed_webhooks_timestamp ON failed_webhooks(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_failed_webhooks_retry_count ON failed_webhooks(retry_count)',
      'CREATE INDEX IF NOT EXISTS idx_chat_settings_chat_id ON chat_settings(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id)'
    ];

    for (const index of indexes) {
      try {
        await this.run(index);
      } catch (error) {
        console.warn('⚠️ Error creating index:', error.message);
      }
    }
  }

  /**
   * Execute a database query (returns number of changes)
   */
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      });
    });
  }

  /**
   * Execute a query and get single row
   */
  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Execute a query and get all rows
   */
  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Execute a query with each row callback
   */
  async each(sql, params = [], callback) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.each(sql, params, callback, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Begin transaction
   */
  async beginTransaction() {
    await this.run('BEGIN TRANSACTION');
  }

  /**
   * Commit transaction
   */
  async commitTransaction() {
    await this.run('COMMIT');
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction() {
    await this.run('ROLLBACK');
  }

  /**
   * Execute multiple queries in a transaction
   */
  async executeTransaction(queries) {
    try {
      await this.beginTransaction();

      const results = [];
      for (const query of queries) {
        const result = await this.run(query.sql, query.params);
        results.push(result);
      }

      await this.commitTransaction();
      return results;
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const result = await this.get('SELECT 1 as health');
      return { status: 'healthy', timestamp: Date.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, timestamp: Date.now() };
    }
  }

  /**
   * Backup database
   */
  async backup(backupPath) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const backup = new sqlite3.Database(backupPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
      });

      this.db.backup(backup)
        .then(() => {
          backup.close();
          resolve();
        })
        .catch(reject);
    });
  }

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      const stats = await this.all(`
        SELECT
          'analytics' as table_name,
          COUNT(*) as row_count,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='analytics') as index_count
        FROM analytics
        UNION ALL
        SELECT
          'failed_webhooks' as table_name,
          COUNT(*) as row_count,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='failed_webhooks') as index_count
        FROM failed_webhooks
        UNION ALL
        SELECT
          'chat_settings' as table_name,
          COUNT(*) as row_count,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='chat_settings') as index_count
        FROM chat_settings
        UNION ALL
        SELECT
          'sessions' as table_name,
          COUNT(*) as row_count,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='sessions') as index_count
        FROM sessions
        UNION ALL
        SELECT
          'messages' as table_name,
          COUNT(*) as row_count,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='messages') as index_count
        FROM messages
      `);

      return stats;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err.message);
          } else {
            console.log('✅ Database connection closed');
          }
          this.db = null;
          this.isInitialized = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Export singleton instance
module.exports = new DatabaseManager();