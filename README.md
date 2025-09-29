# WhatsApp Dashboard Bot - Complete Refactor

A comprehensive WhatsApp bot dashboard with modern architecture, real-time features, and advanced analytics. This project has been completely refactored from a monolithic structure to a clean MVC architecture with a modern Next.js frontend.

![WhatsApp Dashboard](https://img.shields.io/badge/WhatsApp-API-green) ![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-14-blue) ![Socket.io](https://img.shields.io/badge/Socket.io-4.x-blue)

## 🚀 Features

### Backend (Node.js/Express)
- **MVC Architecture**: Clean separation of concerns with models, views, and controllers
- **RESTful API**: Comprehensive API endpoints with versioning
- **WhatsApp Integration**: Full WhatsApp Web.js integration with QR code authentication
- **Real-time Communication**: WebSocket support for live updates
- **Advanced Analytics**: Message statistics, daily activity tracking, and reporting
- **Webhook Management**: N8N webhook integration with retry mechanisms and queue management
- **Health Monitoring**: System health checks and performance monitoring
- **Security**: API key authentication, rate limiting, and input validation
- **Caching**: LRU cache with TTL support for performance optimization
- **Logging**: Comprehensive Winston logging with structured output

### Frontend (Next.js/React)
- **Modern UI**: Built with Next.js 14, TypeScript, and Tailwind CSS
- **Component Library**: shadcn/ui components with consistent design system
- **Real-time Updates**: WebSocket integration for live chat and notifications
- **Responsive Design**: Mobile-optimized with touch-friendly navigation
- **State Management**: Zustand for efficient state management
- **Authentication**: Secure session-based authentication
- **Analytics Dashboard**: Interactive charts and data visualization
- **Chat Interface**: Modern messaging interface with real-time updates
- **Settings Management**: Comprehensive configuration interface

### 🏗️ Architecture

The project follows a clean separation between backend and frontend:

#### Backend Structure (MVC Pattern)
```
src/
├── controllers/          # Business logic handlers
├── models/              # Database models
├── services/            # Business services
├── middleware/          # Express middleware
├── routes/              # Route definitions
└── utils/               # Utility functions
```

#### Frontend Structure (Next.js App Router)
```
frontend/src/
├── app/                 # Next.js App Router
├── components/          # React components
├── lib/                 # Utility libraries
├── store/               # State management
└── types/               # TypeScript definitions
```

### 🔧 Key Technical Features

#### Security & Authentication
- API key-based authentication
- Session management with automatic expiration
- Rate limiting and request validation
- Secure WebSocket connections
- Input sanitization and validation

#### Real-time Features
- Live chat updates via WebSocket
- Real-time notifications
- Message status tracking
- Connection status monitoring

#### Performance & Caching
- LRU cache for frequently accessed data
- Database query optimization
- WebSocket connection pooling
- Static asset optimization

#### Testing & Quality
- Unit tests for business logic
- Integration tests for API endpoints
- Component tests for React components
- End-to-end testing capabilities

## Prerequisites

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **WhatsApp Account**: For connecting the bot
- **N8N Instance**: Optional, for workflow automation

## Installation

### Backend Setup

1. Navigate to the backend directory:
```bash
cd /home/dev/wabot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the backend server:
```bash
npm start
# or for development
npm run dev
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
npm start
```

### Environment Configuration

#### Backend (.env)
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_PATH=./data/wabot.db

# Security
JWT_SECRET=your-secret-key-here
API_RATE_LIMIT=100

# WhatsApp
WHATSAPP_SESSION_PATH=./sessions/.wwebjs_auth/

# Webhooks
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_DELAY=5000

# Cache
CACHE_TTL=300
CACHE_MAX_SIZE=100

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

#### Frontend (.env)
```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v2
NEXT_PUBLIC_WS_URL=ws://localhost:3000

# Analytics
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

## Usage

### 1. Access the Applications

**Backend API**: `http://localhost:3000`
**Frontend Dashboard**: `http://localhost:3001` (or configured port)

### 2. Authentication

1. **Login**: Navigate to the frontend dashboard and enter your API key
2. **Session**: The system creates a secure session with automatic expiration
3. **WhatsApp Connection**: Scan the QR code displayed in the terminal

### 3. Using the Modern Interface

#### Dashboard Features
- **Real-time Analytics**: Live message statistics and trends
- **Chat Overview**: Recent conversations with unread indicators
- **Quick Actions**: Fast access to common operations
- **Status Monitoring**: System health and connection status

#### Chat Interface
- **Modern Messaging**: Clean, intuitive chat interface
- **Real-time Updates**: Live message updates via WebSocket
- **Media Support**: Send and receive images, documents, etc.
- **Search & Filter**: Find messages and conversations easily

#### Analytics Dashboard
- **Interactive Charts**: Visual data representation
- **Time Range Selection**: Custom date ranges for analysis
- **Export Capabilities**: Download reports in various formats
- **Performance Metrics**: Response times and success rates

#### Settings & Configuration
- **User Preferences**: Theme, language, and notification settings
- **API Management**: Key generation and rotation
- **Security Options**: Two-factor authentication and session controls
- **Integration Settings**: N8N webhook configuration

### 4. Key Features

#### Real-time Communication
- **WebSocket Integration**: Instant message updates
- **Push Notifications**: Real-time alerts for new messages
- **Online Status**: Live connection status indicators
- **Message Status**: Sent, delivered, read receipts

#### Advanced Analytics
- **Message Trends**: Daily, weekly, monthly patterns
- **Contact Engagement**: Most active contacts analysis
- **Performance Metrics**: System response times and success rates
- **Custom Reports**: Exportable analytics data

#### Security & Privacy
- **End-to-End Encryption**: WhatsApp native encryption
- **Secure Sessions**: Token-based authentication
- **Rate Limiting**: Protection against abuse
- **Data Validation**: Input sanitization and protection

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

## 🎯 Refactoring Achievements

This project has undergone a complete architectural transformation:

### Before (Monolithic Architecture)
- Single codebase with mixed concerns
- Basic HTML/JS frontend
- Limited separation of business logic
- Minimal testing infrastructure
- Basic security measures

### After (Modern Architecture)
- **Clean Separation**: Backend API + Frontend application
- **MVC Pattern**: Proper separation of concerns
- **Modern Stack**: Next.js 14, TypeScript, Tailwind CSS
- **Comprehensive Testing**: Unit, integration, and E2E tests
- **Advanced Security**: Rate limiting, validation, authentication
- **Performance Optimization**: Caching, optimization, monitoring
- **Real-time Features**: WebSocket integration and live updates
- **Responsive Design**: Mobile-first approach with touch optimization

### Key Improvements
1. **Architecture**: From monolithic to microservices-like separation
2. **Code Quality**: Type safety, modular design, comprehensive testing
3. **User Experience**: Modern UI, real-time updates, mobile optimization
4. **Security**: Enhanced authentication, validation, and protection
5. **Performance**: Caching, optimization, and monitoring capabilities
6. **Maintainability**: Clean code structure, documentation, and testing

### Backward Compatibility
- All existing API endpoints preserved
- Original "123" API key authentication maintained
- WhatsApp functionality fully retained
- Database schema compatibility ensured
- N8N integration kept intact

## Development

### Project Structure
```
/home/dev/wabot/              # Backend (Node.js/Express)
├── src/
│   ├── controllers/          # MVC Controllers
│   ├── models/              # Database Models
│   ├── services/            # Business Logic
│   ├── middleware/          # Express Middleware
│   ├── routes/              # Route Definitions
│   └── utils/               # Utility Functions
├── frontend/                # Frontend (Next.js/React)
│   ├── src/
│   │   ├── app/             # Next.js App Router
│   │   ├── components/      # React Components
│   │   ├── lib/             # Utility Libraries
│   │   ├── store/           # State Management
│   │   └── types/           # TypeScript Definitions
│   └── __tests__/          # Test Files
└── data/                    # Database and session files
```

### Key Dependencies
- **Backend**: Express, WhatsApp Web.js, Socket.io, Winston, SQLite3
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS, Zustand
- **Testing**: Jest, React Testing Library, Supertest
- **UI Components**: shadcn/ui, Framer Motion, Lucide Icons
- **Build Tools**: ESLint, Prettier, PostCSS

### Development Workflow
1. **Backend Development**: Work in `/home/dev/wabot`
2. **Frontend Development**: Work in `/home/dev/wabot/frontend`
3. **Testing**: Run tests in both backend and frontend directories
4. **Integration**: Test API integration between frontend and backend
5. **Deployment**: Build frontend and deploy both services

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