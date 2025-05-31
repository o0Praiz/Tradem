/**
 * Module: config_env_v1
 * Version: 1.0.0
 * Dependencies: []
 * Provides: Environment configuration management, API keys, database connections
 * Integration Points: All backend services, mobile apps, admin dashboard
 * Last Updated: 2025-05-31
 */

// config/env.js - Environment Configuration Management
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Environment Configuration Object
 * Centralizes all environment variables with validation and defaults
 */
const config = {
  // Application Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  API_VERSION: process.env.API_VERSION || 'v1',
  
  // Database Configuration
  database: {
    // PostgreSQL (Primary Database)
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'trades_platform',
      username: process.env.POSTGRES_USER || 'trades_user',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: process.env.POSTGRES_SSL === 'true',
      pool: {
        min: parseInt(process.env.POSTGRES_POOL_MIN || '2', 10),
        max: parseInt(process.env.POSTGRES_POOL_MAX || '10', 10),
        idle: parseInt(process.env.POSTGRES_POOL_IDLE || '10000', 10),
        acquire: parseInt(process.env.POSTGRES_POOL_ACQUIRE || '30000', 10),
      }
    },
    
    // Redis (Cache & Sessions)
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'trades:',
      ttl: parseInt(process.env.REDIS_TTL || '86400', 10), // 24 hours
    },
    
    // MongoDB (Logs & Analytics)
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/trades_logs',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE || '10', 10),
      }
    }
  },

  // Authentication & Security
  auth: {
    // JWT Configuration
    jwt: {
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
      refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
      issuer: process.env.JWT_ISSUER || 'trades-platform',
      audience: process.env.JWT_AUDIENCE || 'trades-users',
    },
    
    // Password Requirements
    password: {
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
      requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
      requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
      requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
      requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
    },
    
    // OAuth Providers
    oauth: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
      },
      apple: {
        clientId: process.env.APPLE_CLIENT_ID || '',
        teamId: process.env.APPLE_TEAM_ID || '',
        keyId: process.env.APPLE_KEY_ID || '',
        privateKey: process.env.APPLE_PRIVATE_KEY || '',
      }
    }
  },

  // Payment Processing
  payments: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      connectClientId: process.env.STRIPE_CONNECT_CLIENT_ID || '',
    },
    
    // Platform Fee Configuration
    fees: {
      platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT || '2.9'),
      stripeFeePercent: parseFloat(process.env.STRIPE_FEE_PERCENT || '2.9'),
      stripeFeeFixed: parseInt(process.env.STRIPE_FEE_FIXED || '30', 10), // cents
    }
  },

  // External Services
  services: {
    // Maps & Geolocation
    maps: {
      googleApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
      mapboxApiKey: process.env.MAPBOX_API_KEY || '',
    },
    
    // Communication
    communication: {
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
      },
      sendgrid: {
        apiKey: process.env.SENDGRID_API_KEY || '',
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@tradesplatform.com',
        fromName: process.env.SENDGRID_FROM_NAME || 'Trades Platform',
      }
    },
    
    // Background Checks & Verification
    verification: {
      checkr: {
        apiKey: process.env.CHECKR_API_KEY || '',
        baseUrl: process.env.CHECKR_BASE_URL || 'https://api.checkr.com/v1',
      }
    },
    
    // File Storage
    storage: {
      aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        region: process.env.AWS_REGION || 'us-east-1',
        s3Bucket: process.env.AWS_S3_BUCKET || 'trades-platform-files',
        cloudFrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN || '',
      }
    }
  },

  // Monitoring & Logging
  monitoring: {
    // Error Tracking
    sentry: {
      dsn: process.env.SENTRY_DSN || '',
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    },
    
    // Application Monitoring
    datadog: {
      apiKey: process.env.DATADOG_API_KEY || '',
      appKey: process.env.DATADOG_APP_KEY || '',
      service: process.env.DATADOG_SERVICE || 'trades-platform',
    },
    
    // Logging
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
      destination: process.env.LOG_DESTINATION || 'console',
    }
  },

  // Rate Limiting
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },

  // Mobile App Configuration
  mobile: {
    // Push Notifications
    pushNotifications: {
      fcm: {
        serverKey: process.env.FCM_SERVER_KEY || '',
        projectId: process.env.FCM_PROJECT_ID || '',
      },
      apns: {
        keyId: process.env.APNS_KEY_ID || '',
        teamId: process.env.APNS_TEAM_ID || '',
        bundleId: process.env.APNS_BUNDLE_ID || '',
        privateKey: process.env.APNS_PRIVATE_KEY || '',
        production: process.env.APNS_PRODUCTION === 'true',
      }
    },
    
    // App Store Configuration
    appStore: {
      iosAppId: process.env.IOS_APP_ID || '',
      androidPackageName: process.env.ANDROID_PACKAGE_NAME || '',
      universalLinks: process.env.UNIVERSAL_LINKS_DOMAIN || '',
    }
  }
};

/**
 * Validation function to ensure required environment variables are set
 */
function validateConfig() {
  const requiredVars = [
    'JWT_SECRET',
    'POSTGRES_PASSWORD',
    'STRIPE_SECRET_KEY',
    'GOOGLE_MAPS_API_KEY',
    'SENDGRID_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate JWT secret strength in production
  if (config.NODE_ENV === 'production' && config.auth.jwt.secret.length < 32) {
    throw new Error('JWT secret must be at least 32 characters long in production');
  }

  return true;
}

/**
 * Get configuration for specific environment
 */
function getConfig(environment = config.NODE_ENV) {
  return {
    ...config,
    isProduction: environment === 'production',
    isDevelopment: environment === 'development',
    isTesting: environment === 'test',
  };
}

/**
 * Database connection string builders
 */
const connectionStrings = {
  postgres: () => {
    const { postgres } = config.database;
    return `postgresql://${postgres.username}:${postgres.password}@${postgres.host}:${postgres.port}/${postgres.database}${postgres.ssl ? '?ssl=true' : ''}`;
  },
  
  redis: () => {
    const { redis } = config.database;
    const auth = redis.password ? `:${redis.password}@` : '';
    return `redis://${auth}${redis.host}:${redis.port}/${redis.db}`;
  }
};

// Export configuration
module.exports = {
  config: getConfig(),
  validateConfig,
  getConfig,
  connectionStrings,
  
  // Environment helpers
  isProduction: () => config.NODE_ENV === 'production',
  isDevelopment: () => config.NODE_ENV === 'development',
  isTesting: () => config.NODE_ENV === 'test',
};

// Validate configuration on load (except in test environment)
if (process.env.NODE_ENV !== 'test') {
  try {
    validateConfig();
    console.log(`Configuration loaded successfully for ${config.NODE_ENV} environment`);
  } catch (error) {
    console.error('Configuration validation failed:', error.message);
    process.exit(1);
  }
}