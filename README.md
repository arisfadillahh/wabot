# WhatsApp Dashboard Bot

A powerful WhatsApp automation dashboard with AI assistant capabilities and N8N integration. This bot provides a real-time web interface for managing WhatsApp conversations with optional AI-powered responses and automation.

![WhatsApp Dashboard](https://img.shields.io/badge/WhatsApp-API-green) ![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16.0.0-brightgreen) ![Socket.io](https://img.shields.io/badge/Socket.io-4.x-blue)

## Features

### 🚀 Core Features
- **Real-time WhatsApp Web Interface**: Full WhatsApp Web experience with enhanced features
- **AI Assistant Integration**: Optional AI-powered responses for automated conversations
- **Live Dashboard**: Real-time messaging interface with WebSocket connectivity
- **Chat Management**: Organize and manage multiple conversations simultaneously
- **Message Analytics**: Comprehensive analytics dashboard with message trends and statistics

### 🤖 AI Assistant Features
- **Per-Chat AI Toggle**: Enable/disable AI assistant for individual conversations
- **Global AI Control**: Master toggle for AI across all chats
- **Smart Responses**: Intelligent message handling with N8N automation
- **Fallback Mechanism**: Seamless human handoff when AI is disabled

### 📊 Analytics & Monitoring
- **Message Trends**: Visual charts showing AI vs human message patterns
- **Activity Tracking**: Daily and weekly activity reports
- **Performance Metrics**: Response times, automation rates, and system health
- **Real-time Updates**: Live analytics with automatic refresh

### 🔧 Integration Features
- **N8N Webhook Integration**: Seamless automation workflow integration
- **Session Management**: Secure authentication with session tokens
- **Database Persistence**: SQLite storage for chat history and settings
- **Retry Mechanism**: Robust webhook retry system for failed deliveries

## Prerequisites

- **Node.js**: >= 16.0.0
- **npm**: >= 8.0.0
- **WhatsApp Account**: For connecting the bot
- **N8N Instance**: Optional, for workflow automation

## Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd whatsapp-dashboard-bot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Authentication
API_KEY=your-secure-api-key-here

# N8N Integration
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/whatsapp

# Server Configuration
PORT=3000
FRONTEND_URL=http://localhost:3000

# Database (optional)
DB_PATH=./anakisa.db
```

### 4. Start the Application

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

## Usage

### 1. Access the Dashboard
Open your browser and navigate to:
```
http://localhost:3000
```

### 2. Login
- Enter your API key when prompted
- The dashboard will authenticate and load your WhatsApp chats

### 3. Connect WhatsApp
- A QR code will be displayed in the terminal
- Scan the QR code with your WhatsApp mobile app
- Wait for the connection to establish

### 4. Using the Interface

#### Chat Selection
- **Left Sidebar**: Browse all your WhatsApp conversations
- **Search**: Filter chats by name or message content
- **Status Indicator**: Shows WhatsApp connection status

#### Individual Chat Features
- **AI Mode Toggle**: Enable/disable AI assistant for specific chats
- **Message Input**: Type and send messages when AI is disabled
- **Real-time Updates**: Messages update automatically via WebSocket

#### Global Controls
- **Settings Menu**: Access analytics, refresh data, and logout
- **Global AI Toggle**: Control AI assistant across all chats
- **Analytics Panel**: View detailed message statistics

#### AI Assistant Behavior
- **When Enabled**: AI handles all incoming messages automatically
- **When Disabled**: Manual message input is enabled
- **Automation**: Messages are processed through N8N workflows
- **Fallback**: Human agents can intervene at any time

## API Reference

### Authentication
All API endpoints require either:
- **Session Token**: For web dashboard authentication
- **API Key**: For direct API access

### Key Endpoints

#### Authentication
```http
POST /api/login
Content-Type: application/json

{
  "apiKey": "your-api-key"
}
```

#### Chat Management
```http
GET /api/chats
Authorization: Bearer <session-token>

GET /api/messages/{chatId}
Authorization: Bearer <session-token>

POST /api/send-message
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "chatId": "1234567890@c.us",
  "message": "Hello from dashboard!"
}
```

#### AI Controls
```http
GET /api/chat-settings
Authorization: Bearer <session-token>

POST /api/chat-settings/{chatId}/toggle
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "aiMode": true
}

POST /api/enable-all-ai
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "aiMode": true
}
```

#### Analytics
```http
GET /api/analytics
Authorization: Bearer <session-token>
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `API_KEY` | Authentication key for the dashboard | - | Yes |
| `N8N_WEBHOOK_URL` | N8N webhook endpoint for automation | - | No |
| `PORT` | Server port number | `3000` | No |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` | No |
| `DB_PATH` | SQLite database file path | `./anakisa.db` | No |

### N8N Integration

The bot integrates with N8N for advanced automation workflows:

1. **Setup N8N**: Deploy your N8N instance
2. **Create Webhook**: Set up a webhook node to receive WhatsApp messages
3. **Configure Workflows**: Build automation workflows with AI processing
4. **Set Webhook URL**: Configure the `N8N_WEBHOOK_URL` in your `.env` file

### Database Schema

The application uses SQLite with the following tables:

#### `analytics`
- Message tracking and analytics data
- AI vs human message classification
- Timestamp-based indexing

#### `chat_settings`
- Per-chat AI configuration
- Individual chat preferences

#### `failed_webhooks`
- Webhook retry mechanism
- Error tracking and debugging

## Security Features

### 🔐 Authentication
- **API Key Authentication**: Secure access control
- **Session Management**: Token-based sessions with expiration
- **CORS Protection**: Cross-origin resource sharing restrictions

### 🛡️ Security Headers
- **CSP (Content Security Policy)**: Prevents XSS attacks
- **Helmet.js**: Security middleware for Express
- **Rate Limiting**: Protection against brute force attacks

### 🔒 Data Protection
- **Input Validation**: Sanitization of all user inputs
- **SQL Injection Prevention**: Parameterized database queries
- **Secure Session Storage**: Encrypted session data

## Development

### Project Structure
```
whatsapp-dashboard-bot/
├── public/
│   └── index.html              # Frontend dashboard
├── db.js                       # Database configuration
├── server.js                   # Main application server
├── package.json               # Dependencies and scripts
├── .env                       # Environment variables
└── README.md                  # This file
```

### Key Dependencies
- **whatsapp-web.js**: WhatsApp Web API integration
- **socket.io**: Real-time WebSocket communication
- **express**: Web server framework
- **sqlite3**: Database persistence
- **helmet**: Security middleware
- **axios**: HTTP client for webhooks

### Development Workflow
1. **Feature Development**: Create branches for new features
2. **Testing**: Test thoroughly with different WhatsApp scenarios
3. **Security Review**: Ensure all security measures are in place
4. **Documentation**: Update documentation for new features

## Troubleshooting

### Common Issues

#### WhatsApp Connection Issues
- **QR Code Not Scanning**: Ensure WhatsApp mobile app is updated
- **Connection Drops**: Check internet stability and WhatsApp Web availability
- **Authentication Failed**: Clear browser cache and reconnect

#### AI Assistant Not Working
- **N8N Webhook**: Verify webhook URL is accessible
- **API Key**: Ensure correct API key configuration
- **Session Expiration**: Re-authenticate if session expires

#### Dashboard Loading Issues
- **Port Conflicts**: Check if port 3000 is available
- **Firewall**: Ensure firewall allows the application port
- **Browser Compatibility**: Use modern browsers (Chrome, Firefox, Safari)

### Performance Optimization
- **Database Indexes**: Automatic indexing for query performance
- **Chat Caching**: In-memory caching for faster chat loading
- **Webhook Queue**: Batch processing for webhook deliveries

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Add tests if applicable**
5. **Submit a pull request**

## Support

For support and questions:
- **Documentation**: Check this README and inline code comments
- **Issues**: Report bugs and feature requests
- **Community**: Join discussions about improvements

## Acknowledgments

- **WhatsApp Web.js**: For the WhatsApp Web API implementation
- **Socket.io**: For real-time communication capabilities
- **N8N**: For workflow automation integration
- **Node.js Community**: For the excellent ecosystem and tools

---

**Note**: This bot is for educational and development purposes. Ensure compliance with WhatsApp's terms of service when using this application in production environments.