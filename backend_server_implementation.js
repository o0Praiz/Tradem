// server.js - Production Backend Server
// Implements all your documented APIs with production-grade features

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

// Import your modules
const { config } = require('./config/env');
const { createAPIRoutes } = require('./api_routes_core_v1');
const { MessagingService } = require('./messaging_system_v1');
const { StripePaymentService } = require('./payment_processing_v1');
const { NotificationService } = require('./notification_service_v1');
const { MappingService } = require('./gps_mapping_service_v1');
const { ReviewService } = require('./review_system_v1');
const { SchedulingService } = require('./scheduling_system_v1');

// =================================================================
// SERVER SETUP
// =================================================================

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Database connection
const db = new Pool({
  host: config.database.postgres.host,
  port: config.database.postgres.port,
  database: config.database.postgres.database,
  user: config.database.postgres.username,
  password: config.database.postgres.password,
  ssl: config.database.postgres.ssl,
  max: config.database.postgres.pool.max,
  min: config.database.postgres.pool.min,
  idleTimeoutMillis: config.database.postgres.pool.idle,
  acquireTimeoutMillis: config.database.postgres.pool.acquire,
});

// =================================================================
// MIDDLEWARE SETUP
// =================================================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: config.cors.methods,
  allowedHeaders: config.cors.allowedHeaders
}));

// Compression and parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests from this IP',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', generalLimiter);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// =================================================================
// SERVICE INITIALIZATION
// =================================================================

// Initialize core services
const messagingService = new MessagingService(server, db);
const paymentService = new StripePaymentService();
const notificationService = new NotificationService(db);
const mappingService = new MappingService(db);
const reviewService = new ReviewService(db, notificationService);
const schedulingService = new SchedulingService(db, notificationService, mappingService);

// =================================================================
// API ROUTES
// =================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.NODE_ENV,
    uptime: process.uptime()
  });
});

// Mount API routes
app.use('/api/v1', createAPIRoutes(db));

// =================================================================
// WEBHOOK HANDLERS
// =================================================================

// Stripe webhooks
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const event = paymentService.validateWebhookSignature(req.body, sig);

    console.log(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object);
        break;
      case 'account.updated':
        await handleContractorAccountUpdate(event.data.object);
        break;
      case 'payout.paid':
        await handleContractorPayout(event.data.object);
        break;
      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Twilio webhooks for SMS status
app.post('/webhooks/twilio/status', express.urlencoded({ extended: false }), (req, res) => {
  const messageStatus = req.body.MessageStatus;
  const messageSid = req.body.MessageSid;
  
  console.log(`SMS ${messageSid} status: ${messageStatus}`);
  
  // Update notification status in database
  updateSMSStatus(messageSid, messageStatus);
  
  res.status(200).send('OK');
});

// =================================================================
// PAYMENT WEBHOOK HANDLERS
// =================================================================

async function handlePaymentSuccess(paymentIntent) {
  try {
    const jobId = paymentIntent.metadata.job_id;
    const customerId = paymentIntent.metadata.customer_id;

    // Update payment status in database
    await db.query(`
      UPDATE payments 
      SET 
        payment_status = 'completed',
        stripe_charge_id = $2,
        captured_at = NOW()
      WHERE stripe_payment_intent_id = $1
    `, [paymentIntent.id, paymentIntent.charges.data[0].id]);

    // Update job status
    await db.query(`
      UPDATE jobs SET status = 'payment_received' WHERE id = $1
    `, [jobId]);

    // Get job and contractor details
    const jobResult = await db.query(`
      SELECT j.*, c.first_name, c.last_name 
      FROM jobs j 
      JOIN users c ON j.contractor_id = c.id 
      WHERE j.id = $1
    `, [jobId]);

    if (jobResult.rows.length > 0) {
      const job = jobResult.rows[0];

      // Send notification to contractor
      await notificationService.sendMultiChannelNotification(job.contractor_id, {
        channels: ['push', 'email'],
        title: 'Payment Received!',
        body: `Payment of $${paymentIntent.amount / 100} received for "${job.title}"`,
        template: 'payment_received',
        data: {
          type: 'payment_received',
          jobId: job.id,
          amount: paymentIntent.amount / 100
        }
      });

      // Send system message to conversation
      const conversationResult = await db.query(`
        SELECT id FROM conversations 
        WHERE customer_id = $1 AND contractor_id = $2 AND job_id = $3
      `, [job.customer_id, job.contractor_id, job.id]);

      if (conversationResult.rows.length > 0) {
        await messagingService.sendSystemMessage(
          conversationResult.rows[0].id,
          'payment_processed',
          { amount: paymentIntent.amount / 100 }
        );
      }
    }

  } catch (error) {
    console.error('Payment success handler error:', error);
  }
}

async function handlePaymentFailure(paymentIntent) {
  try {
    const jobId = paymentIntent.metadata.job_id;
    const customerId = paymentIntent.metadata.customer_id;

    // Update payment status
    await db.query(`
      UPDATE payments 
      SET payment_status = 'failed'
      WHERE stripe_payment_intent_id = $1
    `, [paymentIntent.id]);

    // Notify customer
    await notificationService.sendMultiChannelNotification(customerId, {
      channels: ['push', 'email'],
      title: 'Payment Failed',
      body: 'Your payment could not be processed. Please update your payment method.',
      data: {
        type: 'payment_failed',
        jobId: jobId
      }
    });

  } catch (error) {
    console.error('Payment failure handler error:', error);
  }
}

// =================================================================
// REAL-TIME FEATURES
// =================================================================

// Real-time job updates
async function broadcastJobUpdate(jobId, updateData) {
  try {
    const jobResult = await db.query(`
      SELECT customer_id, contractor_id FROM jobs WHERE id = $1
    `, [jobId]);

    if (jobResult.rows.length > 0) {
      const { customer_id, contractor_id } = jobResult.rows[0];
      
      // Broadcast to both customer and contractor
      messagingService.broadcastJobUpdate(jobId, updateData);
      
      // Send push notifications if users are offline
      const updateMessage = getJobUpdateMessage(updateData.status);
      
      if (updateMessage) {
        await notificationService.sendPushNotification(customer_id, {
          title: 'Job Update',
          body: updateMessage,
          data: { type: 'job_update', jobId }
        });

        if (contractor_id) {
          await notificationService.sendPushNotification(contractor_id, {
            title: 'Job Update',
            body: updateMessage,
            data: { type: 'job_update', jobId }
          });
        }
      }
    }
  } catch (error) {
    console.error('Broadcast job update error:', error);
  }
}

function getJobUpdateMessage(status) {
  const messages = {
    'assigned': 'Your job has been assigned to a contractor',
    'in_progress': 'Work has started on your job',
    'completed': 'Your job has been completed',
    'approved': 'Job has been approved and payment processed'
  };
  return messages[status];
}

// =================================================================
// BACKGROUND JOBS
// =================================================================

// Cleanup expired sessions daily
setInterval(async () => {
  try {
    const result = await db.query(`
      DELETE FROM user_sessions WHERE expires_at < NOW()
    `);
    console.log(`Cleaned up ${result.rowCount} expired sessions`);
  } catch (error) {
    console.error('Session cleanup error:', error);
  }
}, 24 * 60 * 60 * 1000); // Run daily

// Update contractor locations every 5 minutes
setInterval(async () => {
  try {
    // Get active contractors and update their route optimization
    const activeContractors = await db.query(`
      SELECT DISTINCT contractor_id 
      FROM jobs 
      WHERE status = 'in_progress' 
        AND preferred_date = CURRENT_DATE
    `);

    for (const contractor of activeContractors.rows) {
      await schedulingService.optimizeContractorRoute(
        contractor.contractor_id, 
        new Date().toISOString().split('T')[0]
      );
    }
  } catch (error) {
    console.error('Route optimization error:', error);
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// =================================================================
// ERROR HANDLING
// =================================================================

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  // Log error to monitoring service
  if (config.monitoring.sentry.dsn) {
    // Sentry.captureException(error);
  }

  if (res.headersSent) {
    return next(error);
  }

  res.status(error.status || 500).json({
    error: config.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    code: error.code || 'INTERNAL_ERROR',
    ...(config.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

// =================================================================
// GRACEFUL SHUTDOWN
// =================================================================

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Close database connections
  await db.end();
  console.log('Database connections closed');

  // Close Socket.IO connections
  io.close(() => {
    console.log('Socket.IO server closed');
  });

  console.log('Graceful shutdown completed');
  process.exit(0);
}

// =================================================================
// SERVER START
// =================================================================

const PORT = config.PORT || 3000;

db.connect()
  .then(() => {
    console.log('✅ Database connected successfully');
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Environment: ${config.NODE_ENV}`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api/v1`);
      console.log(`💬 WebSocket server ready`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  });

// Export for testing
module.exports = { app, server, db };