const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function addPeakHoursTestData() {
  const dbPath = path.resolve('./anakisa.db');
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      throw err;
    }
    console.log('Connected to SQLite database');
  });

  try {
    // Generate mountain pattern data throughout the day
    const now = new Date();
    const testMessages = [];

    // Create messages following a mountain pattern (peak at business hours)
    const hourlyDistribution = [
      { hour: 8, count: 2 },   // 8 AM - low activity
      { hour: 9, count: 5 },   // 9 AM - rising
      { hour: 10, count: 12 }, // 10 AM - peak morning
      { hour: 11, count: 15 }, // 11 AM - highest peak
      { hour: 12, count: 10 }, // 12 PM - lunch dip
      { hour: 13, count: 8 },  // 1 PM - lunch
      { hour: 14, count: 14 }, // 2 PM - afternoon peak
      { hour: 15, count: 18 }, // 3 PM - highest peak
      { hour: 16, count: 12 }, // 4 PM - declining
      { hour: 17, count: 6 },  // 5 PM - end of day
      { hour: 18, count: 3 },  // 6 PM - evening
    ];

    let messageId = 1;

    for (const distribution of hourlyDistribution) {
      const targetDate = new Date(now);
      targetDate.setHours(distribution.hour, 0, 0, 0);

      // Generate messages distributed throughout the hour
      for (let i = 0; i < distribution.count; i++) {
        const minutesOffset = Math.floor(Math.random() * 60);
        const messageTime = new Date(targetDate.getTime() + minutesOffset * 60000);

        // Alternate between incoming and outgoing messages
        const isIncoming = i % 3 !== 0; // 2 out of 3 messages are incoming

        testMessages.push({
          message_id: `test_peak_${messageId++}`,
          chat_id: `test_chat_${(i % 3) + 1}@c.us`,
          sender_id: isIncoming ? `customer${(i % 5) + 1}@c.us` : (i % 2 === 0 ? 'ai_system' : `agent${(i % 2) + 1}@c.us`),
          body: generateMessageText(isIncoming),
          direction: isIncoming ? 'incoming' : 'outgoing',
          sender_type: isIncoming ? 'customer' : (i % 2 === 0 ? 'ai' : 'human'),
          timestamp: messageTime.getTime(),
          from_me: isIncoming ? 0 : 1,
          is_ai_generated: isIncoming ? 0 : (i % 2 === 0 ? 1 : 0)
        });
      }
    }

    console.log(`Generated ${testMessages.length} test messages across peak hours`);

    // Insert messages into database
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

    console.log('✅ Peak hours test data added successfully');

    // Check message statistics by hour
    const hourlyStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT
          CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) as hour,
          COUNT(*) as totalCount,
          COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as incomingCount,
          COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as outgoingCount,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiCount,
          COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanCount
        FROM messages
        WHERE message_id LIKE 'test_peak_%'
        GROUP BY CAST(strftime('%H', datetime(timestamp/1000, 'unixepoch')) AS INTEGER)
        ORDER BY hour
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('📊 Hourly Distribution:');
    hourlyStats.forEach(stat => {
      console.log(`  ${stat.hour.toString().padStart(2, '0')}:00 - Total: ${stat.totalCount}, Incoming: ${stat.incomingCount}, Outgoing: ${stat.outgoingCount} (AI: ${stat.aiCount}, Human: ${stat.humanCount})`);
    });

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

function generateMessageText(isIncoming) {
  const incomingMessages = [
    "Hello, I need help with my order",
    "Can you check the status of my delivery?",
    "I have a question about your services",
    "What are your business hours?",
    "Thank you for your help!",
    "How much does this cost?",
    "Where can I find more information?",
    "Is this available in stock?",
    "Can I speak to a representative?",
    "Excellent service, thank you!"
  ];

  const outgoingMessages = [
    "Hello! How can I assist you today?",
    "I'll check that for you right away.",
    "Thank you for your patience.",
    "Your order has been processed.",
    "Is there anything else I can help with?",
    "We appreciate your business!",
    "Let me transfer you to the right department.",
    "That's a great question!",
    "I'm here to help you.",
    "Have a wonderful day!"
  ];

  const messages = isIncoming ? incomingMessages : outgoingMessages;
  return messages[Math.floor(Math.random() * messages.length)];
}

addPeakHoursTestData().catch(console.error);