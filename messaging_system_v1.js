/**
 * Module: messaging_system_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1, auth_strategy_v1
 * Provides: Real-time WebSocket messaging, push notifications, message persistence
 * Integration Points: Mobile apps, web dashboard, notification services
 * Last Updated: 2025-05-31
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { config } = require('./config/env');
const { AuthenticationService } = require('./auth/auth-strategy');

// =================================================================
// WEBSOCKET SERVER SETUP
// =================================================================

/**
 * Real-time Messaging Service
 * Handles WebSocket connections, message routing, and real-time updates
 */
class MessagingService {
  constructor(server, database) {
    this.db = database;
    this.authService = new AuthenticationService(database);
    
    // Initialize Socket.IO server
    this.io = new Server(server, {
      cors: {
        origin: config.cors.origin,
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Connected users map: userId -> socketId
    this.connectedUsers = new Map();
    
    // Active conversations map: conversationId -> Set of socketIds
    this.activeConversations = new Map();

    this.setupSocketHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket) => {
      console.log(`User ${socket.userId} connected with socket ${socket.id}`);
      
      // Add user to connected users map
      this.connectedUsers.set(socket.userId, socket.id);

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);

      // Socket event handlers
      socket.on('join_conversation', this.handleJoinConversation.bind(this, socket));
      socket.on('leave_conversation', this.handleLeaveConversation.bind(this, socket));
      socket.on('send_message', this.handleSendMessage.bind(this, socket));
      socket.on('typing_start', this.handleTypingStart.bind(this, socket));
      socket.on('typing_stop', this.handleTypingStop.bind(this, socket));
      socket.on('mark_read', this.handleMarkRead.bind(this, socket));
      socket.on('disconnect', this.handleDisconnect.bind(this, socket));

      // Send user their unread message count
      this.sendUnreadCount(socket.userId);
    });
  }

  /**
   * Authenticate socket connection using JWT
   */
  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = this.authService.jwtService.verifyAccessToken(token);
      
      // Get user info from database
      const result = await this.db.query(`
        SELECT id, email, user_type, first_name, last_name 
        FROM users WHERE id = $1 AND account_status = 'active'
      `, [decoded.userId]);

      if (result.rows.length === 0) {
        return next(new Error('User not found or inactive'));
      }

      const user = result.rows[0];
      socket.userId = user.id;
      socket.userType = user.user_type;
      socket.userName = `${user.first_name} ${user.last_name}`;

      next();

    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  }

  // =================================================================
  // CONVERSATION MANAGEMENT
  // =================================================================

  /**
   * Handle user joining a conversation
   */
  async handleJoinConversation(socket, data) {
    try {
      const { conversationId } = data;

      // Verify user has access to this conversation
      const hasAccess = await this.verifyConversationAccess(socket.userId, conversationId);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied to conversation' });
        return;
      }

      // Join conversation room
      socket.join(`conversation_${conversationId}`);
      
      // Track active conversation
      if (!this.activeConversations.has(conversationId)) {
        this.activeConversations.set(conversationId, new Set());
      }
      this.activeConversations.get(conversationId).add(socket.id);

      // Send recent messages
      const messages = await this.getRecentMessages(conversationId, 50);
      socket.emit('conversation_history', { conversationId, messages });

      // Mark messages as delivered
      await this.markMessagesAsDelivered(conversationId, socket.userId);

      console.log(`User ${socket.userId} joined conversation ${conversationId}`);

    } catch (error) {
      console.error('Join conversation error:', error);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  }

  /**
   * Handle user leaving a conversation
   */
  handleLeaveConversation(socket, data) {
    const { conversationId } = data;
    
    socket.leave(`conversation_${conversationId}`);
    
    if (this.activeConversations.has(conversationId)) {
      this.activeConversations.get(conversationId).delete(socket.id);
      
      // Remove conversation from map if no active users
      if (this.activeConversations.get(conversationId).size === 0) {
        this.activeConversations.delete(conversationId);
      }
    }

    console.log(`User ${socket.userId} left conversation ${conversationId}`);
  }

  /**
   * Verify user has access to conversation
   */
  async verifyConversationAccess(userId, conversationId) {
    try {
      const result = await this.db.query(`
        SELECT id FROM conversations 
        WHERE id = $1 AND (customer_id = $2 OR contractor_id = $2)
      `, [conversationId, userId]);

      return result.rows.length > 0;

    } catch (error) {
      console.error('Conversation access verification error:', error);
      return false;
    }
  }

  // =================================================================
  // MESSAGE HANDLING
  // =================================================================

  /**
   * Handle sending a message
   */
  async handleSendMessage(socket, data) {
    try {
      const { conversationId, messageText, messageType = 'text', attachmentUrl } = data;

      // Verify conversation access
      const hasAccess = await this.verifyConversationAccess(socket.userId, conversationId);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied to conversation' });
        return;
      }

      // Validate message content
      if (!messageText?.trim() && !attachmentUrl) {
        socket.emit('error', { message: 'Message content required' });
        return;
      }

      // Save message to database
      const message = await this.saveMessage({
        conversationId,
        senderId: socket.userId,
        messageText: messageText?.trim(),
        messageType,
        attachmentUrl
      });

      // Update conversation last message timestamp
      await this.updateConversationTimestamp(conversationId);

      // Prepare message for broadcast
      const messageData = {
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        senderName: socket.userName,
        messageText: message.message_text,
        messageType: message.message_type,
        attachmentUrl: message.attachment_url,
        sentAt: message.sent_at,
        deliveredAt: null,
        readAt: null
      };

      // Broadcast to conversation participants
      this.io.to(`conversation_${conversationId}`).emit('new_message', messageData);

      // Get conversation participants for push notifications
      const participants = await this.getConversationParticipants(conversationId);
      
      // Send push notifications to offline users
      for (const participant of participants) {
        if (participant.id !== socket.userId && !this.connectedUsers.has(participant.id)) {
          await this.sendPushNotification(participant.id, {
            title: `New message from ${socket.userName}`,
            body: messageText || 'Sent an attachment',
            data: {
              type: 'new_message',
              conversationId,
              messageId: message.id
            }
          });
        }
      }

      // Update unread counts
      await this.updateUnreadCounts(conversationId, socket.userId);

      console.log(`Message sent in conversation ${conversationId} by user ${socket.userId}`);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  /**
   * Save message to database
   */
  async saveMessage(messageData) {
    try {
      const { conversationId, senderId, messageText, messageType, attachmentUrl } = messageData;

      const result = await this.db.query(`
        INSERT INTO messages (
          conversation_id, sender_id, message_text, message_type, attachment_url
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [conversationId, senderId, messageText, messageType, attachmentUrl]);

      return result.rows[0];

    } catch (error) {
      console.error('Save message error:', error);
      throw new Error('Failed to save message');
    }
  }

  /**
   * Get recent messages for conversation
   */
  async getRecentMessages(conversationId, limit = 50) {
    try {
      const result = await this.db.query(`
        SELECT 
          m.*,
          u.first_name || ' ' || u.last_name as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = $1
        ORDER BY m.sent_at DESC
        LIMIT $2
      `, [conversationId, limit]);

      return result.rows.reverse().map(row => ({
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        senderName: row.sender_name,
        messageText: row.message_text,
        messageType: row.message_type,
        attachmentUrl: row.attachment_url,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        readAt: row.read_at
      }));

    } catch (error) {
      console.error('Get recent messages error:', error);
      throw new Error('Failed to get messages');
    }
  }

  // =================================================================
  // TYPING INDICATORS
  // =================================================================

  /**
   * Handle typing start event
   */
  handleTypingStart(socket, data) {
    const { conversationId } = data;
    
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      conversationId,
      userId: socket.userId,
      userName: socket.userName,
      isTyping: true
    });
  }

  /**
   * Handle typing stop event
   */
  handleTypingStop(socket, data) {
    const { conversationId } = data;
    
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      conversationId,
      userId: socket.userId,
      userName: socket.userName,
      isTyping: false
    });
  }

  // =================================================================
  // READ RECEIPTS
  // =================================================================

  /**
   * Handle mark messages as read
   */
  async handleMarkRead(socket, data) {
    try {
      const { conversationId, messageId } = data;

      // Mark message and previous messages as read
      await this.db.query(`
        UPDATE messages 
        SET read_at = NOW()
        WHERE conversation_id = $1 
          AND sender_id != $2 
          AND sent_at <= (SELECT sent_at FROM messages WHERE id = $3)
          AND read_at IS NULL
      `, [conversationId, socket.userId, messageId]);

      // Broadcast read receipt to conversation
      socket.to(`conversation_${conversationId}`).emit('messages_read', {
        conversationId,
        readByUserId: socket.userId,
        readByUserName: socket.userName,
        readAt: new Date().toISOString()
      });

      // Update unread count
      await this.sendUnreadCount(socket.userId);

    } catch (error) {
      console.error('Mark read error:', error);
      socket.emit('error', { message: 'Failed to mark messages as read' });
    }
  }

  /**
   * Mark messages as delivered when user joins conversation
   */
  async markMessagesAsDelivered(conversationId, userId) {
    try {
      await this.db.query(`
        UPDATE messages 
        SET delivered_at = NOW()
        WHERE conversation_id = $1 
          AND sender_id != $2 
          AND delivered_at IS NULL
      `, [conversationId, userId]);

    } catch (error) {
      console.error('Mark delivered error:', error);
    }
  }

  // =================================================================
  // CONVERSATION UTILITIES
  // =================================================================

  /**
   * Create or get conversation between users
   */
  async createOrGetConversation(customerId, contractorId, jobId = null) {
    try {
      // Check if conversation already exists
      let result = await this.db.query(`
        SELECT id FROM conversations 
        WHERE customer_id = $1 AND contractor_id = $2 AND job_id = $3
      `, [customerId, contractorId, jobId]);

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }

      // Create new conversation
      result = await this.db.query(`
        INSERT INTO conversations (customer_id, contractor_id, job_id)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [customerId, contractorId, jobId]);

      return result.rows[0].id;

    } catch (error) {
      console.error('Create conversation error:', error);
      throw new Error('Failed to create conversation');
    }
  }

  /**
   * Get conversation participants
   */
  async getConversationParticipants(conversationId) {
    try {
      const result = await this.db.query(`
        SELECT 
          u.id, u.first_name, u.last_name, u.user_type
        FROM conversations c
        JOIN users u ON (u.id = c.customer_id OR u.id = c.contractor_id)
        WHERE c.id = $1
      `, [conversationId]);

      return result.rows;

    } catch (error) {
      console.error('Get participants error:', error);
      throw new Error('Failed to get conversation participants');
    }
  }

  /**
   * Update conversation timestamp
   */
  async updateConversationTimestamp(conversationId) {
    try {
      await this.db.query(`
        UPDATE conversations 
        SET last_message_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [conversationId]);

    } catch (error) {
      console.error('Update conversation timestamp error:', error);
    }
  }

  // =================================================================
  // UNREAD MESSAGE COUNTS
  // =================================================================

  /**
   * Get and send unread message count to user
   */
  async sendUnreadCount(userId) {
    try {
      const result = await this.db.query(`
        SELECT COUNT(*) as unread_count
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE (c.customer_id = $1 OR c.contractor_id = $1)
          AND m.sender_id != $1
          AND m.read_at IS NULL
      `, [userId]);

      const unreadCount = parseInt(result.rows[0].unread_count);
      
      if (this.connectedUsers.has(userId)) {
        const socketId = this.connectedUsers.get(userId);
        this.io.to(socketId).emit('unread_count', { count: unreadCount });
      }

      return unreadCount;

    } catch (error) {
      console.error('Get unread count error:', error);
    }
  }

  /**
   * Update unread counts for conversation participants
   */
  async updateUnreadCounts(conversationId, senderId) {
    try {
      const participants = await this.getConversationParticipants(conversationId);
      
      for (const participant of participants) {
        if (participant.id !== senderId) {
          await this.sendUnreadCount(participant.id);
        }
      }

    } catch (error) {
      console.error('Update unread counts error:', error);
    }
  }

  // =================================================================
  // PUSH NOTIFICATIONS
  // =================================================================

  /**
   * Send push notification to user
   */
  async sendPushNotification(userId, notificationData) {
    try {
      // Get user's notification tokens
      const result = await this.db.query(`
        SELECT token, platform FROM notification_tokens 
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return; // No notification tokens found
      }

      // Save notification to database
      await this.db.query(`
        INSERT INTO notifications (
          user_id, notification_type, title, message, metadata, sent_push
        ) VALUES ($1, $2, $3, $4, $5, true)
      `, [
        userId,
        notificationData.data?.type || 'message',
        notificationData.title,
        notificationData.body,
        JSON.stringify(notificationData.data || {})
      ]);

      // TODO: Implement actual push notification sending
      // This would integrate with Firebase Cloud Messaging (FCM) for Android
      // and Apple Push Notification Service (APNs) for iOS
      console.log(`Push notification sent to user ${userId}:`, notificationData);

    } catch (error) {
      console.error('Push notification error:', error);
    }
  }

  // =================================================================
  // SYSTEM MESSAGES
  // =================================================================

  /**
   * Send system message to conversation
   */
  async sendSystemMessage(conversationId, messageType, messageData) {
    try {
      const systemMessages = {
        job_assigned: 'Job has been assigned to contractor',
        job_started: 'Contractor has started working on the job',
        job_completed: 'Job has been marked as completed',
        payment_processed: 'Payment has been processed successfully',
        job_cancelled: 'Job has been cancelled'
      };

      const messageText = systemMessages[messageType] || 'System update';

      const message = await this.saveMessage({
        conversationId,
        senderId: null, // System message
        messageText,
        messageType: 'system'
      });

      // Broadcast system message
      this.io.to(`conversation_${conversationId}`).emit('system_message', {
        id: message.id,
        conversationId,
        messageType,
        messageText,
        messageData,
        sentAt: message.sent_at
      });

    } catch (error) {
      console.error('System message error:', error);
    }
  }

  // =================================================================
  // CONNECTION MANAGEMENT
  // =================================================================

  /**
   * Handle user disconnect
   */
  handleDisconnect(socket) {
    console.log(`User ${socket.userId} disconnected`);
    
    // Remove from connected users
    this.connectedUsers.delete(socket.userId);
    
    // Remove from active conversations
    for (const [conversationId, socketIds] of this.activeConversations.entries()) {
      socketIds.delete(socket.id);
      
      if (socketIds.size === 0) {
        this.activeConversations.delete(conversationId);
      }
    }
  }

  // =================================================================
  // PUBLIC API METHODS
  // =================================================================

  /**
   * Send message to specific user (called from API routes)
   */
  async sendMessageToUser(userId, messageData) {
    if (this.connectedUsers.has(userId)) {
      const socketId = this.connectedUsers.get(userId);
      this.io.to(socketId).emit('direct_message', messageData);
    }
  }

  /**
   * Broadcast job update to relevant users
   */
  async broadcastJobUpdate(jobId, updateData) {
    try {
      // Get job participants
      const result = await this.db.query(`
        SELECT customer_id, contractor_id FROM jobs WHERE id = $1
      `, [jobId]);

      if (result.rows.length > 0) {
        const { customer_id, contractor_id } = result.rows[0];
        
        // Send to customer
        if (this.connectedUsers.has(customer_id)) {
          const socketId = this.connectedUsers.get(customer_id);
          this.io.to(socketId).emit('job_update', { jobId, ...updateData });
        }
        
        // Send to contractor
        if (contractor_id && this.connectedUsers.has(contractor_id)) {
          const socketId = this.connectedUsers.get(contractor_id);
          this.io.to(socketId).emit('job_update', { jobId, ...updateData });
        }
      }

    } catch (error) {
      console.error('Broadcast job update error:', error);
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      activeConversations: this.activeConversations.size,
      totalSockets: this.io.sockets.sockets.size
    };
  }
}

// =================================================================
// MESSAGE API ROUTES
// =================================================================

/**
 * Create messaging API routes
 */
function createMessagingRoutes(database, messagingService) {
  const express = require('express');
  const router = express.Router();
  const authService = new AuthenticationService(database);
  const { middleware } = authService.getServices();

  // Get user conversations
  router.get('/conversations',
    middleware.requireAuth(),
    async (req, res) => {
      try {
        const userId = req.user.id;

        const result = await database.query(`
          SELECT 
            c.id, c.job_id, c.last_message_at,
            CASE 
              WHEN c.customer_id = $1 THEN contractor.first_name || ' ' || contractor.last_name
              ELSE customer.first_name || ' ' || customer.last_name
            END as other_user_name,
            CASE 
              WHEN c.customer_id = $1 THEN contractor.id
              ELSE customer.id
            END as other_user_id,
            lm.message_text as last_message_text,
            lm.sent_at as last_message_sent_at,
            (
              SELECT COUNT(*) FROM messages m 
              WHERE m.conversation_id = c.id 
                AND m.sender_id != $1 
                AND m.read_at IS NULL
            ) as unread_count
          FROM conversations c
          LEFT JOIN users customer ON c.customer_id = customer.id
          LEFT JOIN users contractor ON c.contractor_id = contractor.id
          LEFT JOIN LATERAL (
            SELECT message_text, sent_at 
            FROM messages 
            WHERE conversation_id = c.id 
            ORDER BY sent_at DESC 
            LIMIT 1
          ) lm ON true
          WHERE c.customer_id = $1 OR c.contractor_id = $1
          ORDER BY c.last_message_at DESC NULLS LAST
        `, [userId]);

        const conversations = result.rows.map(row => ({
          id: row.id,
          jobId: row.job_id,
          otherUser: {
            id: row.other_user_id,
            name: row.other_user_name
          },
          lastMessage: row.last_message_text ? {
            text: row.last_message_text,
            sentAt: row.last_message_sent_at
          } : null,
          unreadCount: parseInt(row.unread_count),
          lastMessageAt: row.last_message_at
        }));

        res.json(conversations);

      } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
          error: 'Failed to get conversations',
          code: 'GET_CONVERSATIONS_ERROR'
        });
      }
    }
  );

  // Create new conversation
  router.post('/conversations',
    middleware.requireAuth(),
    async (req, res) => {
      try {
        const { otherUserId, jobId } = req.body;
        const userId = req.user.id;
        const userType = req.user.user_type;

        let customerId, contractorId;
        if (userType === 'customer') {
          customerId = userId;
          contractorId = otherUserId;
        } else {
          customerId = otherUserId;
          contractorId = userId;
        }

        const conversationId = await messagingService.createOrGetConversation(
          customerId, contractorId, jobId
        );

        res.json({ conversationId });

      } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({
          error: 'Failed to create conversation',
          code: 'CREATE_CONVERSATION_ERROR'
        });
      }
    }
  );

  return router;
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  MessagingService,
  createMessagingRoutes
};