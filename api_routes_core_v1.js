/**
 * Module: api_routes_core_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1, auth_strategy_v1, api_specification_v1
 * Provides: Express.js route handlers for core API functionality
 * Integration Points: Mobile apps, admin dashboard, external services
 * Last Updated: 2025-05-31
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { AuthenticationService } = require('./auth/auth-strategy');
const { config } = require('./config/env');
const rateLimit = require('express-rate-limit');

// =================================================================
// MIDDLEWARE SETUP
// =================================================================

/**
 * Validation error handler middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array()
    });
  }
  next();
};

/**
 * Rate limiting configurations
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED'
  },
});

// =================================================================
// AUTHENTICATION ROUTES
// =================================================================

/**
 * Authentication routes factory
 */
function createAuthRoutes(database) {
  const router = express.Router();
  const authService = new AuthenticationService(database);
  const { middleware } = authService.getServices();

  // User Registration
  router.post('/register',
    authLimiter,
    [
      body('email').isEmail().normalizeEmail(),
      body('password').isLength({ min: 8 }),
      body('firstName').trim().isLength({ min: 1 }),
      body('lastName').trim().isLength({ min: 1 }),
      body('userType').isIn(['customer', 'contractor']),
      body('phone').optional().isMobilePhone(),
      body('referralCode').optional().isLength({ min: 6, max: 20 })
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const { email, password, firstName, lastName, userType, phone, referralCode } = req.body;

        // Check if user already exists
        const existingUser = await database.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (existingUser.rows.length > 0) {
          return res.status(409).json({
            error: 'Email already registered',
            code: 'EMAIL_EXISTS'
          });
        }

        // Hash password
        const { passwordService } = authService.getServices();
        const hashedPassword = await passwordService.hashPassword(password);

        // Create user
        const userResult = await database.query(`
          INSERT INTO users (
            email, password_hash, user_type, first_name, last_name, phone, 
            account_status, referral_code, referred_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, email, user_type, first_name, last_name, created_at
        `, [
          email,
          hashedPassword,
          userType,
          firstName,
          lastName,
          phone || null,
          'pending',
          generateReferralCode(),
          referralCode ? await getUserIdByReferralCode(database, referralCode) : null
        ]);

        const user = userResult.rows[0];

        // Create user preferences
        await database.query(`
          INSERT INTO user_preferences (user_id) VALUES ($1)
        `, [user.id]);

        // Create contractor profile if contractor
        if (userType === 'contractor') {
          await database.query(`
            INSERT INTO contractor_profiles (user_id) VALUES ($1)
          `, [user.id]);
        }

        // Generate tokens
        const deviceInfo = {
          deviceType: req.headers['x-device-type'] || 'web',
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        };

        const session = await authService.sessionService.createSession(user, deviceInfo);
        const accessToken = authService.jwtService.generateAccessToken(user);

        res.status(201).json({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            userType: user.user_type,
            emailVerified: false,
            phoneVerified: false
          },
          tokens: {
            accessToken,
            refreshToken: session.refreshToken,
            expiresAt: session.expiresAt
          }
        });

      } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
          error: 'Registration failed',
          code: 'REGISTRATION_ERROR'
        });
      }
    }
  );

  // User Login
  router.post('/login',
    authLimiter,
    [
      body('email').isEmail().normalizeEmail(),
      body('password').notEmpty(),
      body('deviceInfo').optional().isObject()
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const { email, password, deviceInfo = {} } = req.body;

        const deviceData = {
          ...deviceInfo,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        };

        const result = await authService.authenticateUser(email, password, deviceData);

        res.json(result);

      } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
      }
    }
  );

  // Token Refresh
  router.post('/refresh',
    [
      body('refreshToken').notEmpty()
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const { refreshToken } = req.body;
        const result = await authService.refreshAccessToken(refreshToken);
        res.json(result);

      } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }
    }
  );

  // Logout
  router.post('/logout',
    middleware.requireAuth(),
    [
      body('refreshToken').notEmpty()
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const { refreshToken } = req.body;
        await authService.logout(refreshToken);
        res.json({ message: 'Logged out successfully' });

      } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
          error: 'Logout failed',
          code: 'LOGOUT_ERROR'
        });
      }
    }
  );

  return router;
}

// =================================================================
// USER MANAGEMENT ROUTES
// =================================================================

function createUserRoutes(database) {
  const router = express.Router();
  const authService = new AuthenticationService(database);
  const { middleware } = authService.getServices();

  // Get User Profile
  router.get('/profile',
    middleware.requireAuth(),
    async (req, res) => {
      try {
        const result = await database.query(`
          SELECT 
            u.id, u.email, u.first_name, u.last_name, u.user_type,
            u.phone, u.date_of_birth, u.profile_image_url,
            u.address_line1, u.address_line2, u.city, u.state, u.zip_code,
            u.email_verified_at, u.phone_verified_at,
            ST_X(u.coordinates) as longitude, ST_Y(u.coordinates) as latitude,
            up.email_notifications, up.sms_notifications, up.push_notifications,
            up.distance_unit, up.timezone, up.language
          FROM users u
          LEFT JOIN user_preferences up ON u.id = up.user_id
          WHERE u.id = $1
        `, [req.user.id]);

        if (result.rows.length === 0) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }

        const user = result.rows[0];

        res.json({
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          userType: user.user_type,
          phone: user.phone,
          dateOfBirth: user.date_of_birth,
          profileImageUrl: user.profile_image_url,
          emailVerified: !!user.email_verified_at,
          phoneVerified: !!user.phone_verified_at,
          address: {
            addressLine1: user.address_line1,
            addressLine2: user.address_line2,
            city: user.city,
            state: user.state,
            zipCode: user.zip_code,
            coordinates: user.longitude && user.latitude ? {
              latitude: user.latitude,
              longitude: user.longitude
            } : null
          },
          preferences: {
            emailNotifications: user.email_notifications,
            smsNotifications: user.sms_notifications,
            pushNotifications: user.push_notifications,
            distanceUnit: user.distance_unit,
            timezone: user.timezone,
            language: user.language
          }
        });

      } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
          error: 'Failed to get profile',
          code: 'PROFILE_ERROR'
        });
      }
    }
  );

  // Update User Profile
  router.put('/profile',
    middleware.requireAuth(),
    [
      body('firstName').optional().trim().isLength({ min: 1 }),
      body('lastName').optional().trim().isLength({ min: 1 }),
      body('phone').optional().isMobilePhone(),
      body('dateOfBirth').optional().isISO8601(),
      body('address').optional().isObject(),
      body('preferences').optional().isObject()
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const updates = req.body;
        const userId = req.user.id;

        // Update user table
        const userFields = ['firstName', 'lastName', 'phone', 'dateOfBirth'];
        const userUpdates = {};
        
        userFields.forEach(field => {
          if (updates[field] !== undefined) {
            const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
            userUpdates[dbField] = updates[field];
          }
        });

        // Handle address updates
        if (updates.address) {
          const { addressLine1, addressLine2, city, state, zipCode, coordinates } = updates.address;
          if (addressLine1) userUpdates.address_line1 = addressLine1;
          if (addressLine2) userUpdates.address_line2 = addressLine2;
          if (city) userUpdates.city = city;
          if (state) userUpdates.state = state;
          if (zipCode) userUpdates.zip_code = zipCode;
          
          if (coordinates && coordinates.latitude && coordinates.longitude) {
            userUpdates.coordinates = `POINT(${coordinates.longitude} ${coordinates.latitude})`;
          }
        }

        if (Object.keys(userUpdates).length > 0) {
          const setClause = Object.keys(userUpdates).map((key, index) => 
            key === 'coordinates' ? `${key} = ST_GeomFromText($${index + 2}, 4326)` : `${key} = $${index + 2}`
          ).join(', ');
          
          const values = [userId, ...Object.values(userUpdates).map(val => 
            val === userUpdates.coordinates ? val.replace('POINT(', '').replace(')', '') : val
          )];

          await database.query(`
            UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, values);
        }

        // Update preferences
        if (updates.preferences) {
          const prefFields = Object.keys(updates.preferences);
          if (prefFields.length > 0) {
            const prefSetClause = prefFields.map((field, index) => `${field} = $${index + 2}`).join(', ');
            const prefValues = [userId, ...prefFields.map(field => updates.preferences[field])];

            await database.query(`
              UPDATE user_preferences SET ${prefSetClause}, updated_at = CURRENT_TIMESTAMP
              WHERE user_id = $1
            `, prefValues);
          }
        }

        res.json({ message: 'Profile updated successfully' });

      } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
          error: 'Failed to update profile',
          code: 'UPDATE_PROFILE_ERROR'
        });
      }
    }
  );

  return router;
}

// =================================================================
// JOB MANAGEMENT ROUTES
// =================================================================

function createJobRoutes(database) {
  const router = express.Router();
  const authService = new AuthenticationService(database);
  const { middleware } = authService.getServices();

  // Get Jobs List
  router.get('/',
    middleware.requireAuth(),
    [
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('status').optional().isIn(['draft', 'posted', 'assigned', 'in_progress', 'completed', 'approved', 'cancelled', 'disputed']),
      query('tradeCategory').optional().isIn(['plumbing', 'hvac', 'carpentry', 'electrical', 'general_handyman', 'painting', 'flooring', 'roofing', 'appliance_repair', 'landscaping']),
      query('location').optional().matches(/^-?\d+\.?\d*,-?\d+\.?\d*,\d+$/)
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const { page = 1, limit = 20, status, tradeCategory, location } = req.query;
        const offset = (page - 1) * limit;
        const userId = req.user.id;
        const userType = req.user.user_type;

        let whereClause = '';
        let params = [limit, offset];
        let paramCount = 2;

        // Filter based on user type
        if (userType === 'customer') {
          whereClause = 'WHERE j.customer_id = $3';
          params.push(userId);
          paramCount++;
        } else if (userType === 'contractor') {
          // Show available jobs or assigned jobs for contractors
          whereClause = 'WHERE (j.status = \'posted\' OR j.contractor_id = $3)';
          params.push(userId);
          paramCount++;
        }

        // Add filters
        if (status) {
          whereClause += whereClause ? ' AND' : 'WHERE';
          whereClause += ` j.status = $${++paramCount}`;
          params.push(status);
        }

        if (tradeCategory) {
          whereClause += whereClause ? ' AND' : 'WHERE';
          whereClause += ` j.trade_category = $${++paramCount}`;
          params.push(tradeCategory);
        }

        // Location-based filtering for contractors
        if (location && userType === 'contractor') {
          const [lat, lng, radius] = location.split(',');
          whereClause += whereClause ? ' AND' : 'WHERE';
          whereClause += ` ST_DWithin(
            j.service_coordinates, 
            ST_GeomFromText('POINT(${lng} ${lat})', 4326)::geography, 
            ${radius * 1609.34}
          )`;
        }

        const query = `
          SELECT 
            j.id, j.title, j.description, j.trade_category, j.status, j.priority,
            j.service_address_line1, j.service_city, j.service_state,
            j.estimated_cost, j.quoted_price, j.final_price,
            j.preferred_date, j.preferred_time_start, j.preferred_time_end,
            j.created_at, j.updated_at,
            c.first_name as customer_first_name, c.last_name as customer_last_name,
            con.business_name as contractor_business_name,
            ST_X(j.service_coordinates) as longitude, ST_Y(j.service_coordinates) as latitude,
            (SELECT COUNT(*) FROM job_photos WHERE job_id = j.id) as photo_count
          FROM jobs j
          LEFT JOIN users c ON j.customer_id = c.id
          LEFT JOIN contractor_profiles con ON j.contractor_id = con.user_id
          ${whereClause}
          ORDER BY j.created_at DESC
          LIMIT $1 OFFSET $2
        `;

        const result = await database.query(query, params);

        // Get total count for pagination
        const countQuery = `
          SELECT COUNT(*) FROM jobs j ${whereClause}
        `;
        const countResult = await database.query(countQuery, params.slice(2));

        const jobs = result.rows.map(row => ({
          id: row.id,
          title: row.title,
          description: row.description,
          tradeCategory: row.trade_category,
          status: row.status,
          priority: row.priority,
          serviceAddress: {
            addressLine1: row.service_address_line1,
            city: row.service_city,
            state: row.service_state,
            coordinates: row.longitude && row.latitude ? {
              latitude: row.latitude,
              longitude: row.longitude
            } : null
          },
          estimatedCost: row.estimated_cost,
          quotedPrice: row.quoted_price,
          finalPrice: row.final_price,
          preferredDate: row.preferred_date,
          preferredTimeStart: row.preferred_time_start,
          preferredTimeEnd: row.preferred_time_end,
          customer: row.customer_first_name ? {
            firstName: row.customer_first_name,
            lastName: row.customer_last_name
          } : null,
          contractor: row.contractor_business_name ? {
            businessName: row.contractor_business_name
          } : null,
          photoCount: row.photo_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));

        const total = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(total / limit);

        res.json({
          data: jobs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages
          }
        });

      } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({
          error: 'Failed to get jobs',
          code: 'GET_JOBS_ERROR'
        });
      }
    }
  );

  // Create New Job (Customers only)
  router.post('/',
    middleware.requireAuth(),
    middleware.requireUserType(['customer']),
    [
      body('title').trim().isLength({ min: 1, max: 255 }),
      body('description').trim().isLength({ min: 10 }),
      body('tradeCategory').isIn(['plumbing', 'hvac', 'carpentry', 'electrical', 'general_handyman', 'painting', 'flooring', 'roofing', 'appliance_repair', 'landscaping']),
      body('serviceAddress').isObject(),
      body('serviceAddress.addressLine1').trim().isLength({ min: 1 }),
      body('serviceAddress.city').trim().isLength({ min: 1 }),
      body('serviceAddress.state').trim().isLength({ min: 2, max: 50 }),
      body('serviceAddress.zipCode').trim().isLength({ min: 5 }),
      body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
      body('estimatedCost').optional().isFloat({ min: 0 }),
      body('preferredDate').optional().isISO8601(),
      body('preferredTimeStart').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      body('preferredTimeEnd').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const {
          title, description, tradeCategory, serviceAddress, priority = 'medium',
          estimatedCost, preferredDate, preferredTimeStart, preferredTimeEnd
        } = req.body;

        const customerId = req.user.id;

        // Create coordinates from address (in real implementation, use geocoding service)
        const coordinates = serviceAddress.coordinates ? 
          `POINT(${serviceAddress.coordinates.longitude} ${serviceAddress.coordinates.latitude})` : null;

        const result = await database.query(`
          INSERT INTO jobs (
            customer_id, title, description, trade_category, priority,
            service_address_line1, service_address_line2, service_city, 
            service_state, service_zip_code, service_coordinates,
            estimated_cost, preferred_date, preferred_time_start, preferred_time_end,
            status, posted_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
          RETURNING *
        `, [
          customerId, title, description, tradeCategory, priority,
          serviceAddress.addressLine1, serviceAddress.addressLine2 || null,
          serviceAddress.city, serviceAddress.state, serviceAddress.zipCode,
          coordinates ? `ST_GeomFromText('${coordinates}', 4326)` : null,
          estimatedCost || null, preferredDate || null,
          preferredTimeStart || null, preferredTimeEnd || null, 'posted'
        ]);

        const job = result.rows[0];

        // Log job status change
        await database.query(`
          INSERT INTO job_status_history (job_id, changed_by, new_status, reason)
          VALUES ($1, $2, $3, $4)
        `, [job.id, customerId, 'posted', 'Job created and posted']);

        res.status(201).json({
          id: job.id,
          title: job.title,
          description: job.description,
          tradeCategory: job.trade_category,
          status: job.status,
          priority: job.priority,
          estimatedCost: job.estimated_cost,
          preferredDate: job.preferred_date,
          createdAt: job.created_at
        });

      } catch (error) {
        console.error('Create job error:', error);
        res.status(500).json({
          error: 'Failed to create job',
          code: 'CREATE_JOB_ERROR'
        });
      }
    }
  );

  return router;
}

// =================================================================
// ROUTE FACTORY FUNCTION
// =================================================================

/**
 * Create complete API router with all routes
 */
function createAPIRoutes(database) {
  const router = express.Router();

  // Apply global middleware
  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true }));
  router.use(apiLimiter);

  // Add CORS headers
  router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.cors.origin);
    res.header('Access-Control-Allow-Methods', config.cors.methods.join(','));
    res.header('Access-Control-Allow-Headers', config.cors.allowedHeaders.join(','));
    res.header('Access-Control-Allow-Credentials', config.cors.credentials);
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // Mount route modules
  router.use('/auth', createAuthRoutes(database));
  router.use('/users', createUserRoutes(database));
  router.use('/jobs', createJobRoutes(database));

  // Global error handler
  router.use((error, req, res, next) => {
    console.error('API Error:', error);
    
    res.status(error.status || 500).json({
      error: error.message || 'Internal server error',
      code: error.code || 'INTERNAL_ERROR',
      ...(config.NODE_ENV === 'development' && { stack: error.stack })
    });
  });

  // 404 handler
  router.use('*', (req, res) => {
    res.status(404).json({
      error: 'Endpoint not found',
      code: 'NOT_FOUND'
    });
  });

  return router;
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Generate unique referral code
 */
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get user ID by referral code
 */
async function getUserIdByReferralCode(database, referralCode) {
  const result = await database.query(
    'SELECT id FROM users WHERE referral_code = $1',
    [referralCode]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  createAPIRoutes,
  createAuthRoutes,
  createUserRoutes,
  createJobRoutes,
  handleValidationErrors,
  authLimiter,
  apiLimiter
};