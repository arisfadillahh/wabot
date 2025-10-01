const db = require('./src/config/database');

async function testMessages() {
    try {
        console.log('Testing recent outgoing messages...');

        const messages = await db.all(`
            SELECT direction, sender_type, body, timestamp
            FROM messages
            WHERE direction = 'outgoing'
            ORDER BY timestamp DESC
            LIMIT 5
        `);

        console.log('Recent outgoing messages:');
        messages.forEach(msg => {
            console.log(`- ${msg.direction} | ${msg.sender_type} | ${msg.body.substring(0, 50)}... | ${new Date(msg.timestamp * 1000).toISOString()}`);
        });

        // Check summary stats
        const stats = await db.get(`
            SELECT
                COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanResponses,
                COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiResponses
            FROM messages
        `);

        console.log('\nResponse counts:');
        console.log(`Human responses: ${stats.humanResponses}`);
        console.log(`AI responses: ${stats.aiResponses}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

testMessages();