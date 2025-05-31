/**
 * Module: notification_service_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1, messaging_system_v1
 * Provides: Push notifications, SMS, email, notification preferences, delivery tracking
 * Integration Points: Mobile apps, web dashboard, job system, payment system
 * Last Updated: 2025-05-31
 */

const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
const { config } = require('./config/env');

// =================================================================
// NOTIFICATION SERVICE CORE
// =================================================================

/**
 * Unified Notification Service
 * Handles all notification types: push, SMS, email
 */
class NotificationService {
  constructor(database) {
    this.db = database;
    this.initializeServices();
  }

  /**
   * Initialize all notification services
   */
  initializeServices() {
    // Firebase Admin SDK for push notifications
    if (config.services.communication.fcm) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.mobile.pushNotifications.fcm.projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
      });
    }

    // SendGrid for email
    if (config.services.communication.sendgrid.apiKey) {
      sgMail.setApiKey(config.services.communication.sendgrid.apiKey);
    }

    // Twilio for SMS
    if (config.services.communication.twilio.accountSid) {
      this.twilioClient = twilio(
        config.services.communication.twilio.accountSid,
        config.services.communication.twilio.authToken
      );
    }
  }

  // =================================================================
  // PUSH NOTIFICATIONS
  // =================================================================

  /**
   * Send push notification to user
   */
  async sendPushNotification(userId, notification) {
    try {
      const { title, body, data = {}, priority = 'normal' } = notification;

      // Get user's notification tokens and preferences
      const userTokens = await this.getUserNotificationTokens(userId);
      const preferences = await this.getUserNotificationPreferences(userId);

      if (!preferences.pushNotifications || userTokens.length === 0) {
        console.log(`Push notifications disabled or no tokens for user ${userId}`);
        return { success: false, reason: 'disabled_or_no_tokens' };
      }

      // Prepare FCM message
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          userId: userId.toString(),
          timestamp: new Date().toISOString()
        },
        android: {
          priority: priority === 'high' ? 'high' : 'normal',
          notification: {
            icon: 'ic_notification',
            color: '#0ea5e9',
            sound: 'default',
            channelId: data.type || 'general'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: await this.getUnreadNotificationCount(userId),
              'mutable-content': 1
            }
          }
        }
      };

      // Send to all user's devices
      const results = [];
      for (const tokenData of userTokens) {
        try {
          const response = await admin.messaging().send({
            ...message,
            token: tokenData.token
          });

          results.push({
            token: tokenData.token,
            platform: tokenData.platform,
            success: true,
            messageId: response
          });

          // Update token last used timestamp
          await this.updateTokenLastUsed(tokenData.token);

        } catch (error) {
          console.error(`Push notification failed for token ${tokenData.token}:`, error);
          
          // Handle invalid tokens
          if (error.code === 'messaging/invalid-registration-token' || 
              error.code === 'messaging/registration-token-not-registered') {
            await this.removeInvalidToken(tokenData.token);
          }

          results.push({
            token: tokenData.token,
            platform: tokenData.platform,
            success: false,
            error: error.message
          });
        }
      }

      // Save notification to database
      await this.saveNotificationRecord({
        userId,
        type: data.type || 'general',
        title,
        body,
        data,
        channel: 'push',
        deliveryResults: results
      });

      const successCount = results.filter(r => r.success).length;
      return {
        success: successCount > 0,
        totalDevices: userTokens.length,
        successfulDeliveries: successCount,
        results
      };

    } catch (error) {
      console.error('Push notification service error:', error);
      throw new Error(`Failed to send push notification: ${error.message}`);
    }
  }

  /**
   * Send push notification to multiple users
   */
  async sendBulkPushNotification(userIds, notification) {
    const results = [];
    const batchSize = 100; // Process in batches to avoid overwhelming the system

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(userId => 
        this.sendPushNotification(userId, notification).catch(error => ({
          userId,
          success: false,
          error: error.message
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return {
      totalUsers: userIds.length,
      successfulUsers: results.filter(r => r.success).length,
      results
    };
  }

  // =================================================================
  // EMAIL NOTIFICATIONS
  // =================================================================

  /**
   * Send email notification
   */
  async sendEmailNotification(userId, emailData) {
    try {
      const { template, subject, data = {}, priority = 'normal' } = emailData;

      // Get user info and preferences
      const user = await this.getUserInfo(userId);
      const preferences = await this.getUserNotificationPreferences(userId);

      if (!preferences.emailNotifications) {
        console.log(`Email notifications disabled for user ${userId}`);
        return { success: false, reason: 'disabled' };
      }

      // Get email template
      const emailContent = await this.getEmailTemplate(template, {
        ...data,
        user: {
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email
        }
      });

      // Prepare SendGrid message
      const message = {
        to: user.email,
        from: {
          email: config.services.communication.sendgrid.fromEmail,
          name: config.services.communication.sendgrid.fromName
        },
        subject,
        html: emailContent.html,
        text: emailContent.text,
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true }
        },
        customArgs: {
          userId: userId.toString(),
          template,
          timestamp: new Date().toISOString()
        }
      };

      // Send email
      const response = await sgMail.send(message);

      // Save notification record
      await this.saveNotificationRecord({
        userId,
        type: template,
        title: subject,
        body: emailContent.text.substring(0, 500),
        data,
        channel: 'email',
        deliveryResults: [{
          success: true,
          messageId: response[0].headers['x-message-id']
        }]
      });

      return {
        success: true,
        messageId: response[0].headers['x-message-id'],
        email: user.email
      };

    } catch (error) {
      console.error('Email notification error:', error);
      
      // Save failed notification
      await this.saveNotificationRecord({
        userId,
        type: emailData.template,
        title: emailData.subject,
        body: 'Failed to send',
        data: emailData.data || {},
        channel: 'email',
        deliveryResults: [{
          success: false,
          error: error.message
        }]
      });

      throw new Error(`Failed to send email notification: ${error.message}`);
    }
  }

  // =================================================================
  // SMS NOTIFICATIONS
  // =================================================================

  /**
   * Send SMS notification
   */
  async sendSMSNotification(userId, smsData) {
    try {
      const { message, urgent = false } = smsData;

      // Get user info and preferences
      const user = await this.getUserInfo(userId);
      const preferences = await this.getUserNotificationPreferences(userId);

      if (!preferences.smsNotifications || !user.phone) {
        console.log(`SMS notifications disabled or no phone for user ${userId}`);
        return { success: false, reason: 'disabled_or_no_phone' };
      }

      // Send SMS via Twilio
      const response = await this.twilioClient.messages.create({
        body: message,
        from: config.services.communication.twilio.phoneNumber,
        to: user.phone,
        statusCallback: `${config.apiUrl}/webhooks/twilio/status`
      });

      // Save notification record
      await this.saveNotificationRecord({
        userId,
        type: urgent ? 'urgent_sms' : 'sms',
        title: 'SMS Notification',
        body: message,
        data: { urgent },
        channel: 'sms',
        deliveryResults: [{
          success: true,
          messageId: response.sid,
          phone: user.phone
        }]
      });

      return {
        success: true,
        messageId: response.sid,
        phone: user.phone,
        status: response.status
      };

    } catch (error) {
      console.error('SMS notification error:', error);
      
      // Save failed notification
      await this.saveNotificationRecord({
        userId,
        type: 'sms',
        title: 'SMS Notification',
        body: smsData.message,
        data: smsData,
        channel: 'sms',
        deliveryResults: [{
          success: false,
          error: error.message
        }]
      });

      throw new Error(`Failed to send SMS notification: ${error.message}`);
    }
  }

  // =================================================================
  // MULTI-CHANNEL NOTIFICATIONS
  // =================================================================

  /**
   * Send notification through multiple channels
   */
  async sendMultiChannelNotification(userId, notificationData) {
    const { channels = ['push'], ...data } = notificationData;
    const results = {};

    // Send through each requested channel
    const promises = channels.map(async (channel) => {
      try {
        switch (channel) {
          case 'push':
            results.push = await this.sendPushNotification(userId, data);
            break;
          case 'email':
            results.email = await this.sendEmailNotification(userId, data);
            break;
          case 'sms':
            results.sms = await this.sendSMSNotification(userId, data);
            break;
          default:
            console.warn(`Unknown notification channel: ${channel}`);
        }
      } catch (error) {
        results[channel] = { success: false, error: error.message };
      }
    });

    await Promise.all(promises);

    return {
      userId,
      channels,
      results,
      overallSuccess: Object.values(results).some(r => r.success)
    };
  }

  // =================================================================
  // NOTIFICATION TEMPLATES
  // =================================================================

  /**
   * Get email template with data substitution
   */
  async getEmailTemplate(templateName, data) {
    const templates = {
      // Job-related templates
      job_assigned: {
        subject: 'Job Assigned - {{job.title}}',
        html: `
          <h2>Your job has been assigned!</h2>
          <p>Hi {{user.firstName}},</p>
          <p>Great news! Your job "<strong>{{job.title}}</strong>" has been assigned to {{contractor.name}}.</p>
          <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px;">
            <h3>Job Details:</h3>
            <p><strong>Service:</strong> {{job.title}}</p>
            <p><strong>Contractor:</strong> {{contractor.name}}</p>
            <p><strong>Scheduled:</strong> {{job.scheduledDate}}</p>
            <p><strong>Price:</strong> ${{job.price}}</p>
          </div>
          <p>You can track the progress and communicate with your contractor through the app.</p>
          <a href="{{app.jobUrl}}" style="background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Job Details</a>
        `,
        text: `Your job "{{job.title}}" has been assigned to {{contractor.name}}. Scheduled for {{job.scheduledDate}} at ${{job.price}}.`
      },

      job_completed: {
        subject: 'Job Completed - {{job.title}}',
        html: `
          <h2>Job Completed!</h2>
          <p>Hi {{user.firstName}},</p>
          <p>{{contractor.name}} has marked your job "<strong>{{job.title}}</strong>" as completed.</p>
          <p>Please review the work and approve payment if you're satisfied.</p>
          <a href="{{app.jobUrl}}" style="background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Review & Approve</a>
        `,
        text: `Your job "{{job.title}}" has been completed by {{contractor.name}}. Please review and approve payment.`
      },

      // Payment-related templates
      payment_received: {
        subject: 'Payment Confirmed - ${{payment.amount}}',
        html: `
          <h2>Payment Confirmed</h2>
          <p>Hi {{user.firstName}},</p>
          <p>Your payment of <strong>${{payment.amount}}</strong> for "{{job.title}}" has been successfully processed.</p>
          <p>Thank you for using our platform!</p>
        `,
        text: `Payment of ${{payment.amount}} for "{{job.title}}" has been confirmed.`
      },

      // Welcome templates
      welcome_customer: {
        subject: 'Welcome to Trades Platform!',
        html: `
          <h2>Welcome to Trades Platform!</h2>
          <p>Hi {{user.firstName}},</p>
          <p>Welcome to the easiest way to find trusted local contractors for your home projects.</p>
          <p>Get started by posting your first job:</p>
          <a href="{{app.postJobUrl}}" style="background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Post Your First Job</a>
        `,
        text: `Welcome to Trades Platform! Start by posting your first job.`
      },

      welcome_contractor: {
        subject: 'Welcome to Trades Platform - Start Earning!',
        html: `
          <h2>Welcome to Trades Platform!</h2>
          <p>Hi {{user.firstName}},</p>
          <p>Welcome to our contractor network! Complete your profile verification to start receiving job opportunities.</p>
          <a href="{{app.profileUrl}}" style="background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Complete Profile</a>
        `,
        text: `Welcome to Trades Platform! Complete your profile to start receiving jobs.`
      }
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`Email template not found: ${templateName}`);
    }

    // Simple template substitution
    const substitute = (text, data) => {
      return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const value = path.split('.').reduce((obj, key) => obj?.[key], data);
        return value || match;
      });
    };

    return {
      subject: substitute(template.subject, data),
      html: substitute(template.html, data),
      text: substitute(template.text, data)
    };
  }

  // =================================================================
  // NOTIFICATION PREFERENCES
  // =================================================================

  /**
   * Get user notification preferences
   */
  async getUserNotificationPreferences(userId) {
    try {
      const result = await this.db.query(`
        SELECT 
          email_notifications, sms_notifications, push_notifications
        FROM user_preferences 
        WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        // Return default preferences
        return {
          emailNotifications: true,
          smsNotifications: true,
          pushNotifications: true
        };
      }

      const prefs = result.rows[0];
      return {
        emailNotifications: prefs.email_notifications,
        smsNotifications: prefs.sms_notifications,
        pushNotifications: prefs.push_notifications
      };

    } catch (error) {
      console.error('Get notification preferences error:', error);
      // Return safe defaults on error
      return {
        emailNotifications: false,
        smsNotifications: false,
        pushNotifications: false
      };
    }
  }

  /**
   * Update user notification preferences
   */
  async updateNotificationPreferences(userId, preferences) {
    try {
      const {
        emailNotifications,
        smsNotifications,
        pushNotifications
      } = preferences;

      await this.db.query(`
        UPDATE user_preferences 
        SET 
          email_notifications = $2,
          sms_notifications = $3,
          push_notifications = $4,
          updated_at = NOW()
        WHERE user_id = $1
      `, [userId, emailNotifications, smsNotifications, pushNotifications]);

      return { success: true };

    } catch (error) {
      console.error('Update notification preferences error:', error);
      throw new Error('Failed to update notification preferences');
    }
  }

  // =================================================================
  // TOKEN MANAGEMENT
  // =================================================================

  /**
   * Register device token for push notifications
   */
  async registerDeviceToken(userId, tokenData) {
    try {
      const { token, platform, deviceId, deviceInfo = {} } = tokenData;

      await this.db.query(`
        INSERT INTO notification_tokens (
          user_id, token, platform, device_id, device_info, is_active
        ) VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (user_id, token)
        DO UPDATE SET 
          platform = EXCLUDED.platform,
          device_id = EXCLUDED.device_id,
          device_info = EXCLUDED.device_info,
          is_active = true,
          last_used_at = NOW()
      `, [userId, token, platform, deviceId, JSON.stringify(deviceInfo)]);

      return { success: true };

    } catch (error) {
      console.error('Register device token error:', error);
      throw new Error('Failed to register device token');
    }
  }

  /**
   * Get user's notification tokens
   */
  async getUserNotificationTokens(userId) {
    try {
      const result = await this.db.query(`
        SELECT token, platform, device_id, last_used_at
        FROM notification_tokens 
        WHERE user_id = $1 AND is_active = true
        ORDER BY last_used_at DESC
      `, [userId]);

      return result.rows;

    } catch (error) {
      console.error('Get notification tokens error:', error);
      return [];
    }
  }

  /**
   * Remove invalid or expired token
   */
  async removeInvalidToken(token) {
    try {
      await this.db.query(`
        UPDATE notification_tokens 
        SET is_active = false 
        WHERE token = $1
      `, [token]);

    } catch (error) {
      console.error('Remove invalid token error:', error);
    }
  }

  /**
   * Update token last used timestamp
   */
  async updateTokenLastUsed(token) {
    try {
      await this.db.query(`
        UPDATE notification_tokens 
        SET last_used_at = NOW() 
        WHERE token = $1
      `, [token]);

    } catch (error) {
      console.error('Update token last used error:', error);
    }
  }

  // =================================================================
  // UTILITY FUNCTIONS
  // =================================================================

  /**
   * Get user basic info
   */
  async getUserInfo(userId) {
    try {
      const result = await this.db.query(`
        SELECT id, email, first_name, last_name, phone, user_type
        FROM users 
        WHERE id = $1
      `, [userId]);

      return result.rows[0];

    } catch (error) {
      console.error('Get user info error:', error);
      throw new Error('Failed to get user info');
    }
  }

  /**
   * Save notification record to database
   */
  async saveNotificationRecord(notificationData) {
    try {
      const {
        userId, type, title, body, data, channel, deliveryResults
      } = notificationData;

      const success = deliveryResults.some(r => r.success);

      await this.db.query(`
        INSERT INTO notifications (
          user_id, notification_type, title, message, metadata,
          sent_push, sent_email, sent_sms, delivered_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId, type, title, body, JSON.stringify({ data, deliveryResults }),
        channel === 'push' && success,
        channel === 'email' && success,
        channel === 'sms' && success,
        success ? new Date() : null
      ]);

    } catch (error) {
      console.error('Save notification record error:', error);
    }
  }

  /**
   * Get unread notification count for badge
   */
  async getUnreadNotificationCount(userId) {
    try {
      const result = await this.db.query(`
        SELECT COUNT(*) as count
        FROM notifications 
        WHERE user_id = $1 AND read_at IS NULL
      `, [userId]);

      return parseInt(result.rows[0].count) || 0;

    } catch (error) {
      console.error('Get unread count error:', error);
      return 0;
    }
  }
}

// =================================================================
// NOTIFICATION TRIGGERS
// =================================================================

/**
 * Notification Triggers for various platform events
 */
class NotificationTriggers {
  constructor(notificationService) {
    this.notificationService = notificationService;
  }

  /**
   * Job-related notifications
   */
  async onJobAssigned(jobData) {
    const { jobId, customerId, contractorId } = jobData;

    // Notify customer
    await this.notificationService.sendMultiChannelNotification(customerId, {
      channels: ['push', 'email'],
      title: 'Job Assigned!',
      body: `Your job has been assigned to a contractor.`,
      template: 'job_assigned',
      data: { type: 'job_assigned', jobId }
    });

    // Notify contractor
    await this.notificationService.sendMultiChannelNotification(contractorId, {
      channels: ['push'],
      title: 'New Job Assigned',
      body: `You've been assigned a new job. Check the details!`,
      data: { type: 'job_assigned', jobId }
    });
  }

  async onJobCompleted(jobData) {
    const { jobId, customerId, contractorId } = jobData;

    // Notify customer to review and approve
    await this.notificationService.sendMultiChannelNotification(customerId, {
      channels: ['push', 'email'],
      title: 'Job Completed!',
      body: `Your contractor has completed the work. Please review and approve.`,
      template: 'job_completed',
      data: { type: 'job_completed', jobId }
    });
  }

  async onJobCancelled(jobData) {
    const { jobId, customerId, contractorId, cancelledBy } = jobData;

    const otherUserId = cancelledBy === customerId ? contractorId : customerId;
    const isCustomer = cancelledBy === customerId;

    await this.notificationService.sendMultiChannelNotification(otherUserId, {
      channels: ['push', 'sms'],
      title: 'Job Cancelled',
      body: `The ${isCustomer ? 'customer' : 'contractor'} has cancelled the job.`,
      urgent: true,
      data: { type: 'job_cancelled', jobId }
    });
  }

  /**
   * Payment-related notifications
   */
  async onPaymentReceived(paymentData) {
    const { contractorId, amount, jobId } = paymentData;

    await this.notificationService.sendMultiChannelNotification(contractorId, {
      channels: ['push', 'email'],
      title: 'Payment Received!',
      body: `You've received a payment of $${amount}.`,
      template: 'payment_received',
      data: { type: 'payment_received', amount, jobId }
    });
  }

  async onPaymentFailed(paymentData) {
    const { customerId, amount, jobId } = paymentData;

    await this.notificationService.sendMultiChannelNotification(customerId, {
      channels: ['push', 'email'],
      title: 'Payment Failed',
      body: `Your payment of $${amount} could not be processed.`,
      data: { type: 'payment_failed', amount, jobId }
    });
  }

  /**
   * User onboarding notifications
   */
  async onUserRegistration(userData) {
    const { userId, userType } = userData;

    const template = userType === 'customer' ? 'welcome_customer' : 'welcome_contractor';

    await this.notificationService.sendEmailNotification(userId, {
      template,
      subject: 'Welcome to Trades Platform!',
      data: { userType }
    });
  }

  /**
   * Emergency notifications
   */
  async onEmergencyJob(jobData) {
    const { jobId, location, tradeCategory } = jobData;

    // Get nearby contractors
    const nearbyContractors = await this.getNearbyContractors(location, tradeCategory);

    // Send urgent notifications to qualified contractors
    const notifications = nearbyContractors.map(contractorId =>
      this.notificationService.sendMultiChannelNotification(contractorId, {
        channels: ['push', 'sms'],
        title: '🚨 Emergency Job Available',
        body: `Urgent ${tradeCategory} job available nearby. Premium pay!`,
        urgent: true,
        data: { type: 'emergency_job', jobId }
      })
    );

    await Promise.all(notifications);
  }

  /**
   * Get contractors near location
   */
  async getNearbyContractors(location, tradeCategory, radiusMiles = 25) {
    // This would integrate with the contractor database
    // For now, returning mock data
    return ['contractor-1', 'contractor-2', 'contractor-3'];
  }
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  NotificationService,
  NotificationTriggers
};