// Simple WebSocket test
console.log('Testing WebSocket connection...');

// Test different WebSocket URLs
const urls = [
  'ws://localhost:3000',
  'ws://localhost:3000/socket.io',
  'ws://localhost:3000/ws',
  'ws://localhost:3000/api/v1/websocket'
];

urls.forEach(url => {
  console.log(`Testing: ${url}`);
  try {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`✅ Connected to: ${url}`);
      ws.close();
    };

    ws.onerror = (error) => {
      console.log(`❌ Error connecting to ${url}:`, error);
    };

    ws.onclose = () => {
      console.log(`🔌 Closed connection to: ${url}`);
    };
  } catch (error) {
    console.log(`❌ Failed to create WebSocket for ${url}:`, error);
  }
});