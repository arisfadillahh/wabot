const db = require('./src/config/database');
const config = require('./src/config/config');

async function testTimestamp() {
    try {
        await config.load();

        console.log('Testing timestamp formats...');

        // Get recent messages with timestamps
        const messages = await db.all(`
            SELECT message_id, body, timestamp, created_at
            FROM messages
            ORDER BY created_at DESC
            LIMIT 5
        `);

        console.log('\nRecent messages:');
        messages.forEach(msg => {
            console.log(`- ${msg.message_id.substring(0, 30)}...`);
            console.log(`  Body: ${msg.body.substring(0, 30)}...`);
            console.log(`  Timestamp: ${msg.timestamp} (${typeof msg.timestamp})`);
            console.log(`  Created At: ${msg.created_at} (${typeof msg.created_at})`);
            console.log(`  Timestamp Date: ${new Date(msg.timestamp * 1000).toISOString()}`);
            console.log(`  Created At Date: ${new Date(msg.created_at).toISOString()}`);
            console.log('');
        });

        // Test query with different timestamp formats
        const now = Date.now();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        console.log('Current time:');
        console.log(`- Date.now(): ${now} (ms)`);
        console.log(`- Today start: ${todayStart.getTime()} (ms)`);
        console.log(`- Today start (seconds): ${Math.floor(todayStart.getTime() / 1000)} (s)`);

        // Count messages with today's timestamp (milliseconds)
        const countMs = await db.get(`
            SELECT COUNT(*) as count
            FROM messages
            WHERE timestamp >= ?
        `, [todayStart.getTime()]);

        // Count messages with today's timestamp (seconds)
        const countSec = await db.get(`
            SELECT COUNT(*) as count
            FROM messages
            WHERE timestamp >= ?
        `, [Math.floor(todayStart.getTime() / 1000)]);

        console.log('\nMessage counts today:');
        console.log(`- Using milliseconds: ${countMs.count}`);
        console.log(`- Using seconds: ${countSec.count}`);

        // Test ai/human response counts
        const responses = await db.get(`
            SELECT
                COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'ai' THEN 1 END) as aiResponses,
                COUNT(CASE WHEN direction = 'outgoing' AND sender_type = 'human' THEN 1 END) as humanResponses
            FROM messages
        `);

        console.log('\nResponse counts:');
        console.log(`- AI responses: ${responses.aiResponses}`);
        console.log(`- Human responses: ${responses.humanResponses}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

testTimestamp();