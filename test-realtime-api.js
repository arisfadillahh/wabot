const express = require('express');
const router = express.Router();
const Analytics = require('../src/models/Analytics');

// Test endpoint to simulate new messages for real-time testing
router.post('/simulate-message', async (req, res) => {
  try {
    const { messageCount = 5, messageTypes = ['mixed'] } = req.body;

    const now = Date.now();
    const testMessages = [];

    // Generate realistic test messages distributed across recent hours
    for (let i = 0; i < messageCount; i++) {
      const hoursBack = Math.floor(Math.random() * 3); // Messages in last 3 hours
      const messageTime = now - (hoursBack * 60 * 60 * 1000) + (Math.random() * 60 * 60 * 1000);

      // Determine message type based on request
      let messageType;
      if (messageTypes.includes('incoming')) {
        messageType = 'incoming';
      } else if (messageTypes.includes('outgoing')) {
        messageType = Math.random() > 0.5 ? 'ai' : 'human';
      } else {
        // Mixed: 60% incoming, 25% AI, 15% human
        const rand = Math.random();
        if (rand < 0.6) messageType = 'incoming';
        else if (rand < 0.85) messageType = 'ai';
        else messageType = 'human';
      }

      const messageData = {
        message_id: `test_rt_${now}_${i}`,
        chat_id: `test_rt_chat_${(i % 3) + 1}@c.us`,
        sender_id: messageType === 'incoming' ? `customer${(i % 5) + 1}@c.us` :
                   messageType === 'ai' ? 'ai_system' : `agent${(i % 2) + 1}@c.us`,
        body: generateTestMessage(messageType),
        direction: messageType === 'incoming' ? 'incoming' : 'outgoing',
        sender_type: messageType === 'incoming' ? 'customer' : messageType,
        timestamp: messageTime,
        from_me: messageType === 'incoming' ? 0 : 1,
        is_ai_generated: messageType === 'ai' ? 1 : 0
      };

      testMessages.push(messageData);
    }

    // Insert test messages into database
    const db = require('../src/config/database');
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

    // Log analytics for each message
    for (const msg of testMessages) {
      try {
        await Analytics.logMessage(msg.chat_id, msg.direction, msg.sender_type, {
          messageId: msg.message_id,
          message: msg.body,
          timestamp: msg.timestamp,
          source: 'realtime_test'
        });
      } catch (error) {
        console.warn('Failed to log analytics for test message:', error.message);
      }
    }

    // Get updated analytics summary
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
      peakHoursData: updatedPeakHours.hourlyData.slice(-6) // Last 6 hours
    });

  } catch (error) {
    console.error('Error simulating messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate realistic test message content
function generateTestMessage(type) {
  const incomingMessages = [
    "Hello, I need help with my order status",
    "Can you check when my delivery will arrive?",
    "I have a question about your pricing plans",
    "What are your business hours?",
    "Thank you for the quick response!",
    "Is this product still available?",
    "Can I speak to a human agent?",
    "How do I track my shipment?",
    "Excellent service, very satisfied!",
    "I need to cancel my subscription"
  ];

  const aiMessages = [
    "Hello! I'm here to help you with your inquiry.",
    "I'll check that information for you right away.",
    "Thank you for your patience. Your order is being processed.",
    "I understand your concern. Let me assist you with that.",
    "Based on your request, I can help you with the following options...",
    "That's a great question! Here's what I found for you.",
    "I'm here to make your experience as smooth as possible.",
    "Let me transfer you to the right department for better assistance.",
    "Thank you for contacting us. We value your business!",
    "Is there anything else I can help you with today?"
  ];

  const humanMessages = [
    "Hi there! I'll personally handle your request.",
    "Let me look into that for you immediately.",
    "I've processed your order and you should receive a confirmation shortly.",
    "I understand the urgency and I'm expediting your case.",
    "Thanks for reaching out - I've taken care of this for you.",
    "I've escalated this to our priority queue for you.",
    "Your satisfaction is our priority. Let me fix this right away.",
    "I've personally reviewed your account and made the necessary changes.",
    "Rest assured, I'm monitoring your case until completion.",
    "You're all set! Is there anything else you need help with?"
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

module.exports = router;