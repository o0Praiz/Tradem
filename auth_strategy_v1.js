/**
 * Module: auth_strategy_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1
 * Provides: JWT authentication, session management, OAuth integration, password security
 * Integration Points: All API routes, mobile apps, admin dashboard
 * Last Updated: 2025-05-31
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { config } = require('./config/env');

// =================================================================
// JWT TOKEN MANAGEMENT
// =================================================================

/**
 * JWT Token Service
 * Handles access token and refresh token generation and validation
 */
class JWTService {
  constructor() {
    this.accessTokenSecret = config.auth.jwt.secret;
    this.refreshTokenSecret = config.auth.jwt.secret + '_refresh';
    this.accessTokenExpiry = config.auth.jwt.accessTokenExpiry;
    this.refreshTokenExpiry = config.auth.jwt.refreshTokenExpiry;
    this.issuer = config.auth.jwt.issuer;
    this.audience = config.auth.jwt.audience;
  }

  /**
   * Generate access token for authenticated user
   */
  generateAccessToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      userType: user.user_type,
      accountStatus: user.account_status,
      emailVerified: !!user.email_verified_at,
      phoneVerified: !!user.phone_verified_at
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: this.issuer,
      audience: this.audience,
      subject: user.id
    });
  }

  /**
   * Generate refresh token for session management
   */
  generateRefreshToken(user, sessionId) {
    const payload = {
      userId: user.id,
      sessionId: sessionId,
      tokenType: 'refresh'
    };

    return jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: this.issuer,
      audience: this.audience,
      subject: user.id
    });
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.accessTokenSecret, {
        issuer: this.issuer,
        audience: this.audience
      });
    } catch (error) {
      throw new Error(`Invalid access token: ${error.message}`);
    }
  }

  /**
   * Verify and decode refresh token
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.refreshTokenSecret, {
        issuer: this.issuer,
        audience: this.audience
      });
    } catch (error) {
      throw new Error(`Invalid refresh token: ${error.message}`);
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader) {
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new Error('Invalid authorization header format');
    }

    return parts[1];
  }
}

// =================================================================
// PASSWORD SECURITY
// =================================================================

/**
 * Password Service
 * Handles password hashing, validation, and security requirements
 */
class PasswordService {
  constructor() {
    this.saltRounds = 12;
    this.requirements = config.auth.password;
  }

  /**
   * Hash password with bcrypt
   */
  async hashPassword(plainPassword) {
    if (!this.validatePasswordRequirements(plainPassword)) {
      throw new Error('Password does not meet security requirements');
    }

    return await bcrypt.hash(plainPassword, this.saltRounds);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Validate password meets security requirements
   */
  validatePasswordRequirements(password) {
    const { requirements } = this;
    const errors = [];

    // Length check
    if (password.length < requirements.minLength) {
      errors.push(`Password must be at least ${requirements.minLength} characters long`);
    }

    // Uppercase check
    if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Lowercase check
    if (requirements.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Number check
    if (requirements.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Special character check
    if (requirements.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    if (errors.length > 0) {
      throw new Error(errors.join('. '));
    }

    return true;
  }

  /**
   * Generate secure random password
   */
  generateSecurePassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    // Ensure at least one character from each required category
    if (this.requirements.requireLowercase) password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    if (this.requirements.requireUppercase) password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    if (this.requirements.requireNumbers) password += '0123456789'[Math.floor(Math.random() * 10)];
    if (this.requirements.requireSpecialChars) password += '!@#$%^&*'[Math.floor(Math.random() * 8)];

    // Fill remaining length with random characters
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}

// =================================================================
// SESSION MANAGEMENT
// =================================================================

/**
 * Session Service
 * Manages user sessions, refresh tokens, and device tracking
 */
class SessionService {
  constructor(database) {
    this.db = database;
    this.jwtService = new JWTService();
  }

  /**
   * Create new user session
   */
  async createSession(user, deviceInfo = {}) {
    const sessionId = crypto.randomUUID();
    const refreshToken = this.jwtService.generateRefreshToken(user, sessionId);
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days

    await this.db.query(`
      INSERT INTO user_sessions (
        id, user_id, refresh_token_hash, device_type, device_info, 
        ip_address, user_agent, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      sessionId,
      user.id,
      refreshTokenHash,
      deviceInfo.deviceType || 'unknown',
      JSON.stringify(deviceInfo),
      deviceInfo.ipAddress || null,
      deviceInfo.userAgent || null,
      expiresAt
    ]);

    return {
      sessionId,
      refreshToken,
      expiresAt
    };
  }

  /**
   * Validate session and refresh token
   */
  async validateSession(refreshToken) {
    try {
      const decoded = this.jwtService.verifyRefreshToken(refreshToken);
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      const result = await this.db.query(`
        SELECT s.*, u.id, u.email, u.user_type, u.account_status, 
               u.email_verified_at, u.phone_verified_at
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = $1 AND s.refresh_token_hash = $2 AND s.expires_at > NOW()
      `, [decoded.sessionId, refreshTokenHash]);

      if (result.rows.length === 0) {
        throw new Error('Invalid or expired session');
      }

      const session = result.rows[0];

      // Update last used timestamp
      await this.db.query(`
        UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1
      `, [session.id]);

      return {
        session,
        user: {
          id: session.user_id,
          email: session.email,
          user_type: session.user_type,
          account_status: session.account_status,
          email_verified_at: session.email_verified_at,
          phone_verified_at: session.phone_verified_at
        }
      };
    } catch (error) {
      throw new Error(`Session validation failed: ${error.message}`);
    }
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId) {
    await this.db.query(`
      DELETE FROM user_sessions WHERE id = $1
    `, [sessionId]);
  }

  /**
   * Revoke all sessions for user
   */
  async revokeAllUserSessions(userId) {
    await this.db.query(`
      DELETE FROM user_sessions WHERE user_id = $1
    `, [userId]);
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    const result = await this.db.query(`
      DELETE FROM user_sessions WHERE expires_at < NOW()
    `);
    return result.rowCount;
  }
}

// =================================================================
// AUTHENTICATION MIDDLEWARE
// =================================================================

/**
 * Authentication Middleware Factory
 * Creates middleware functions for route protection
 */
class AuthMiddleware {
  constructor(database) {
    this.jwtService = new JWTService();
    this.sessionService = new SessionService(database);
    this.db = database;
  }

  /**
   * Require authentication middleware
   */
  requireAuth() {
    return async (req, res, next) => {
      try {
        const token = this.jwtService.extractTokenFromHeader(req.headers.authorization);
        const decoded = this.jwtService.verifyAccessToken(token);

        // Fetch current user data
        const result = await this.db.query(`
          SELECT id, email, user_type, account_status, email_verified_at, phone_verified_at
          FROM users WHERE id = $1 AND account_status = 'active'
        `, [decoded.userId]);

        if (result.rows.length === 0) {
          return res.status(401).json({ error: 'User not found or inactive' });
        }

        req.user = result.rows[0];
        req.tokenPayload = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Authentication required' });
      }
    };
  }

  /**
   * Require specific user type
   */
  requireUserType(allowedTypes) {
    const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
    
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!types.includes(req.user.user_type)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    };
  }

  /**
   * Require email verification
   */
  requireEmailVerification() {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.email_verified_at) {
        return res.status(403).json({ error: 'Email verification required' });
      }

      next();
    };
  }

  /**
   * Optional authentication middleware
   */
  optionalAuth() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          return next();
        }

        const token = this.jwtService.extractTokenFromHeader(authHeader);
        const decoded = this.jwtService.verifyAccessToken(token);

        const result = await this.db.query(`
          SELECT id, email, user_type, account_status, email_verified_at, phone_verified_at
          FROM users WHERE id = $1
        `, [decoded.userId]);

        if (result.rows.length > 0) {
          req.user = result.rows[0];
          req.tokenPayload = decoded;
        }
      } catch (error) {
        // Ignore authentication errors for optional auth
      }
      
      next();
    };
  }
}

// =================================================================
// OAUTH INTEGRATION
// =================================================================

/**
 * OAuth Service
 * Handles Google and Apple Sign-In integration
 */
class OAuthService {
  constructor(database) {
    this.db = database;
    this.passwordService = new PasswordService();
  }

  /**
   * Handle Google OAuth callback
   */
  async handleGoogleAuth(googleProfile) {
    const { id: googleId, email, given_name, family_name, picture } = googleProfile;

    // Check if user exists with this email
    let user = await this.findUserByEmail(email);

    if (!user) {
      // Create new user
      const tempPassword = this.passwordService.generateSecurePassword();
      const hashedPassword = await this.passwordService.hashPassword(tempPassword);

      const result = await this.db.query(`
        INSERT INTO users (
          email, password_hash, user_type, first_name, last_name, 
          profile_image_url, email_verified_at, account_status
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'active')
        RETURNING *
      `, [email, hashedPassword, 'customer', given_name, family_name, picture]);

      user = result.rows[0];
    }

    return user;
  }

  /**
   * Handle Apple OAuth callback
   */
  async handleAppleAuth(appleProfile) {
    const { sub: appleId, email, name } = appleProfile;

    let user = await this.findUserByEmail(email);

    if (!user) {
      const tempPassword = this.passwordService.generateSecurePassword();
      const hashedPassword = await this.passwordService.hashPassword(tempPassword);

      const result = await this.db.query(`
        INSERT INTO users (
          email, password_hash, user_type, first_name, last_name,
          email_verified_at, account_status
        ) VALUES ($1, $2, $3, $4, $5, NOW(), 'active')
        RETURNING *
      `, [
        email, 
        hashedPassword, 
        'customer', 
        name?.firstName || '', 
        name?.lastName || ''
      ]);

      user = result.rows[0];
    }

    return user;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email) {
    const result = await this.db.query(`
      SELECT * FROM users WHERE email = $1
    `, [email]);

    return result.rows[0] || null;
  }
}

// =================================================================
// AUTHENTICATION SERVICE FACTORY
// =================================================================

/**
 * Main Authentication Service
 * Orchestrates all authentication-related functionality
 */
class AuthenticationService {
  constructor(database) {
    this.db = database;
    this.jwtService = new JWTService();
    this.passwordService = new PasswordService();
    this.sessionService = new SessionService(database);
    this.oAuthService = new OAuthService(database);
    this.middleware = new AuthMiddleware(database);
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(email, password, deviceInfo = {}) {
    const result = await this.db.query(`
      SELECT * FROM users WHERE email = $1 AND account_status = 'active'
    `, [email]);

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];
    const isValidPassword = await this.passwordService.verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await this.db.query(`
      UPDATE users SET last_login_at = NOW() WHERE id = $1
    `, [user.id]);

    // Create session
    const session = await this.sessionService.createSession(user, deviceInfo);
    
    // Generate access token
    const accessToken = this.jwtService.generateAccessToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type,
        emailVerified: !!user.email_verified_at,
        phoneVerified: !!user.phone_verified_at
      },
      tokens: {
        accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt
      }
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    const { user } = await this.sessionService.validateSession(refreshToken);
    const accessToken = this.jwtService.generateAccessToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        emailVerified: !!user.email_verified_at,
        phoneVerified: !!user.phone_verified_at
      }
    };
  }

  /**
   * Logout user and revoke session
   */
  async logout(refreshToken) {
    try {
      const decoded = this.jwtService.verifyRefreshToken(refreshToken);
      await this.sessionService.revokeSession(decoded.sessionId);
    } catch (error) {
      // Token might be invalid, but that's okay for logout
    }
  }

  /**
   * Get all service instances for dependency injection
   */
  getServices() {
    return {
      jwtService: this.jwtService,
      passwordService: this.passwordService,
      sessionService: this.sessionService,
      oAuthService: this.oAuthService,
      middleware: this.middleware
    };
  }
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  AuthenticationService,
  JWTService,
  PasswordService,
  SessionService,
  AuthMiddleware,
  OAuthService
};