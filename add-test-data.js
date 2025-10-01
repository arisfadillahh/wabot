const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function addTestData() {
  const dbPath = path.resolve('./anakisa.db');
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      throw err;
    }
    console.log('Connected to SQLite database');
  });

  try {
    // Add test messages with proper direction and sender_type
    const testMessages = [
      {
        message_id: 'test_incoming_1',
        chat_id: 'test_chat_1@c.us',
        sender_id: 'customer1@c.us',
        body: 'Hello, I need help',
        direction: 'incoming',
        sender_type: 'customer',
        timestamp: Date.now() - 3600000, // 1 hour ago
        from_me: 0,
        is_ai_generated: 0
      },
      {
        message_id: 'test_ai_reply_1',
        chat_id: 'test_chat_1@c.us',
        sender_id: 'ai_system',
        body: 'Hello! How can I assist you today?',
        direction: 'outgoing',
        sender_type: 'ai',
        timestamp: Date.now() - 3500000, // 58 minutes ago
        from_me: 1,
        is_ai_generated: 1
      },
      {
        message_id: 'test_human_reply_1',
        chat_id: 'test_chat_1@c.us',
        sender_id: 'agent1@c.us',
        body: 'I will help you with your issue',
        direction: 'outgoing',
        sender_type: 'human',
        timestamp: Date.now() - 3000000, // 50 minutes ago
        from_me: 1,
        is_ai_generated: 0
      }
    ];

    for (const msg of testMessages) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR IGNORE INTO messages (message_id, chat_id, sender_id, body, direction, sender_type, timestamp, from_me, is_ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [msg.message_id, msg.chat_id, msg.sender_id, msg.body, msg.direction, msg.sender_type, msg.timestamp, msg.from_me, msg.is_ai_generated],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    console.log('✅ Test data added successfully');

    // Check message statistics
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incoming,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoing,
          COUNT(CASE WHEN sender_type = 'customer' THEN 1 END) as customer,
          COUNT(CASE WHEN sender_type = 'ai' THEN 1 END) as ai,
          COUNT(CASE WHEN sender_type = 'human' THEN 1 END) as human
        FROM messages
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log('📊 Message Statistics:', stats);

  } catch (error) {
    console.error('❌ Error:', error.message);
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

addTestData().catch(console.error);