/**
 * Module: integration_testing_v1
 * Version: 1.0.0
 * Dependencies: All platform modules
 * Provides: Comprehensive integration testing framework for end-to-end workflows
 * Integration Points: All platform services, APIs, and user interfaces
 * Last Updated: 2025-05-31
 */

const request = require('supertest');
const { Pool } = require('pg');
const WebSocket = require('ws');
const { config } = require('./config/env');

// =================================================================
// INTEGRATION TEST FRAMEWORK
// =================================================================

/**
 * Comprehensive Integration Testing Suite
 * Tests complete user workflows across all platform services
 */
class IntegrationTestFramework {
  constructor() {
    this.baseUrl = config.apiUrl || 'http://localhost:3000/api/v1';
    this.wsUrl = config.wsUrl || 'http://localhost:3000';
    this.dbPool = new Pool({
      host: config.database.postgres.host,
      port: config.database.postgres.port,
      database: config.database.postgres.database + '_test',
      user: config.database.postgres.username,
      password: config.database.postgres.password
    });
    
    this.testUsers = {};
    this.testJobs = {};
    this.testTokens = {};
  }

  // =================================================================
  // TEST SETUP AND TEARDOWN
  // =================================================================

  /**
   * Setup test environment
   */
  async setupTestEnvironment() {
    try {
      console.log('🔧 Setting up integration test environment...');

      // Clear test database
      await this.clearTestData();

      // Create test users
      await this.createTestUsers();

      // Setup test webhooks
      await this.setupTestWebhooks();

      console.log('✅ Test environment setup complete');
      return { success: true };

    } catch (error) {
      console.error('❌ Test environment setup failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup test environment
   */
  async cleanupTestEnvironment() {
    try {
      console.log('🧹 Cleaning up test environment...');

      // Clear test data
      await this.clearTestData();

      // Close database connections
      await this.dbPool.end();

      console.log('✅ Test environment cleanup complete');

    } catch (error) {
      console.error('❌ Test cleanup failed:', error);
    }
  }

  /**
   * Clear all test data from database
   */
  async clearTestData() {
    const tables = [
      'job_photos', 'job_status_history', 'messages', 'conversations',
      'payments', 'reviews', 'notifications', 'notification_tokens',
      'contractor_location_history', 'jobs', 'contractor_profiles',
      'user_preferences', 'user_sessions', 'users'
    ];

    for (const table of tables) {
      await this.dbPool.query(`DELETE FROM ${table} WHERE created_at >= NOW() - INTERVAL '1 hour'`);
    }
  }

  /**
   * Create test users for different scenarios
   */
  async createTestUsers() {
    // Test customer
    const customerResponse = await request(this.baseUrl)
      .post('/auth/register')
      .send({
        email: 'test.customer@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Customer',
        userType: 'customer'
      });

    this.testUsers.customer = customerResponse.body.user;
    this.testTokens.customer = customerResponse.body.tokens.accessToken;

    // Test contractor
    const contractorResponse = await request(this.baseUrl)
      .post('/auth/register')
      .send({
        email: 'test.contractor@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Contractor',
        userType: 'contractor'
      });

    this.testUsers.contractor = contractorResponse.body.user;
    this.testTokens.contractor = contractorResponse.body.tokens.accessToken;

    // Setup contractor profile
    await this.setupContractorProfile();

    // Test admin
    const adminResponse = await request(this.baseUrl)
      .post('/auth/register')
      .send({
        email: 'test.admin@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'Admin',
        userType: 'admin'
      });

    this.testUsers.admin = adminResponse.body.user;
    this.testTokens.admin = adminResponse.body.tokens.accessToken;
  }

  /**
   * Setup contractor profile for testing
   */
  async setupContractorProfile() {
    await this.dbPool.query(`
      UPDATE contractor_profiles 
      SET 
        business_name = 'Test Plumbing Co',
        primary_trade = 'plumbing',
        years_experience = 5,
        hourly_rate = 75.00,
        available_for_work = true,
        approved_at = NOW()
      WHERE user_id = $1
    `, [this.testUsers.contractor.id]);

    // Set contractor location
    await this.dbPool.query(`
      UPDATE users 
      SET coordinates = ST_GeomFromText('POINT(-93.6250 41.5868)', 4326)
      WHERE id = $1
    `, [this.testUsers.contractor.id]);
  }

  // =================================================================
  // CORE WORKFLOW TESTS
  // =================================================================

  /**
   * Test complete job posting to completion workflow
   */
  async testCompleteJobWorkflow() {
    console.log('🔄 Testing complete job workflow...');

    try {
      // 1. Customer posts a job
      const jobResponse = await request(this.baseUrl)
        .post('/jobs')
        .set('Authorization', `Bearer ${this.testTokens.customer}`)
        .send({
          title: 'Kitchen Faucet Repair',
          description: 'Leaking kitchen faucet needs repair',
          tradeCategory: 'plumbing',
          serviceAddress: {
            addressLine1: '123 Test St',
            city: 'Des Moines',
            state: 'IA',
            zipCode: '50309',
            coordinates: {
              latitude: 41.5868,
              longitude: -93.6250
            }
          },
          estimatedCost: 150,
          priority: 'medium'
        });

      expect(jobResponse.status).toBe(201);
      const job = jobResponse.body;
      this.testJobs.mainJob = job;

      // 2. Contractor finds and applies for job
      const jobsResponse = await request(this.baseUrl)
        .get('/jobs')
        .set('Authorization', `Bearer ${this.testTokens.contractor}`)
        .query({ tradeCategory: 'plumbing' });

      expect(jobsResponse.status).toBe(200);
      expect(jobsResponse.body.data.length).toBeGreaterThan(0);

      // 3. Contractor submits quote
      const applyResponse = await request(this.baseUrl)
        .post(`/jobs/${job.id}/apply`)
        .set('Authorization', `Bearer ${this.testTokens.contractor}`)
        .send({
          quotedPrice: 125,
          message: 'I can fix this today',
          estimatedCompletionDate: new Date().toISOString().split('T')[0]
        });

      expect(applyResponse.status).toBe(200);

      // 4. Customer assigns job to contractor
      const assignResponse = await request(this.baseUrl)
        .post(`/jobs/${job.id}/assign`)
        .set('Authorization', `Bearer ${this.testTokens.customer}`)
        .send({
          contractorId: this.testUsers.contractor.id,
          agreedPrice: 125
        });

      expect(assignResponse.status).toBe(200);

      // 5. Create conversation
      const conversationResponse = await request(this.baseUrl)
        .post('/messages/conversations')
        .set('Authorization', `Bearer ${this.testTokens.customer}`)
        .send({
          otherUserId: this.testUsers.contractor.id,
          jobId: job.id
        });

      expect(conversationResponse.status).toBe(200);
      const conversationId = conversationResponse.body.conversationId;

      // 6. Test messaging
      await this.testMessaging(conversationId);

      // 7. Process payment
      await this.testPaymentProcessing(job.id, 125);

      // 8. Complete job and review
      await this.testJobCompletion(job.id);

      console.log('✅ Complete job workflow test passed');
      return { success: true };

    } catch (error) {
      console.error('❌ Job workflow test failed:', error);
      throw error;
    }
  }

  /**
   * Test messaging functionality
   */
  async testMessaging(conversationId) {
    console.log('💬 Testing messaging system...');

    // Test WebSocket connection
    const ws = new WebSocket(`${this.wsUrl}`, {
      headers: { Authorization: `Bearer ${this.testTokens.customer}` }
    });

    return new Promise((resolve, reject) => {
      ws.on('open', () => {
        // Join conversation
        ws.send(JSON.stringify({
          event: 'join_conversation',
          data: { conversationId }
        }));

        // Send test message
        setTimeout(() => {
          ws.send(JSON.stringify({
            event: 'send_message',
            data: {
              conversationId,
              messageText: 'When can you start the repair?',
              messageType: 'text'
            }
          }));
        }, 100);
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.event === 'new_message') {
          expect(message.data.messageText).toBe('When can you start the repair?');
          ws.close();
          resolve();
        }
      });

      ws.on('error', reject);

      setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket test timeout'));
      }, 5000);
    });
  }

  /**
   * Test payment processing
   */
  async testPaymentProcessing(jobId, amount) {
    console.log('💳 Testing payment processing...');

    // Create payment intent
    const paymentIntentResponse = await request(this.baseUrl)
      .post('/payments/intent')
      .set('Authorization', `Bearer ${this.testTokens.customer}`)
      .send({
        jobId,
        amount,
        paymentMethod: 'card'
      });

    expect(paymentIntentResponse.status).toBe(201);
    expect(paymentIntentResponse.body.clientSecret).toBeDefined();

    // Simulate payment confirmation (in real scenario, this would be handled by Stripe)
    const confirmResponse = await request(this.baseUrl)
      .post(`/payments/${paymentIntentResponse.body.paymentIntentId}/confirm`)
      .set('Authorization', `Bearer ${this.testTokens.customer}`);

    expect(confirmResponse.status).toBe(200);
  }

  /**
   * Test job completion and review
   */
  async testJobCompletion(jobId) {
    console.log('✅ Testing job completion and review...');

    // Contractor marks job as completed
    await this.dbPool.query(`
      UPDATE jobs SET status = 'completed', completed_at = NOW() WHERE id = $1
    `, [jobId]);

    // Customer approves job
    await this.dbPool.query(`
      UPDATE jobs SET status = 'approved', approved_at = NOW() WHERE id = $1
    `, [jobId]);

    // Customer submits review
    const reviewResponse = await request(this.baseUrl)
      .post('/reviews')
      .set('Authorization', `Bearer ${this.testTokens.customer}`)
      .send({
        jobId,
        reviewerId: this.testUsers.customer.id,
        revieweeId: this.testUsers.contractor.id,
        overallRating: 5,
        qualityRating: 5,
        communicationRating: 5,
        timelinessRating: 5,
        reviewText: 'Excellent work! Very professional and timely.',
        wouldRecommend: true
      });

    expect(reviewResponse.status).toBe(201);
  }

  // =================================================================
  // NOTIFICATION TESTS
  // =================================================================

  /**
   * Test notification system
   */
  async testNotificationSystem() {
    console.log('🔔 Testing notification system...');

    try {
      // Register device token
      const tokenResponse = await request(this.baseUrl)
        .post('/notifications/register-token')
        .set('Authorization', `Bearer ${this.testTokens.customer}`)
        .send({
          token: 'test_push_token_123',
          platform: 'ios',
          deviceId: 'test_device_123'
        });

      expect(tokenResponse.status).toBe(200);

      // Test notification preferences
      const preferencesResponse = await request(this.baseUrl)
        .put('/notifications/preferences')
        .set('Authorization', `Bearer ${this.testTokens.customer}`)
        .send({
          emailNotifications: true,
          smsNotifications: false,
          pushNotifications: true
        });

      expect(preferencesResponse.status).toBe(200);

      // Test sending notification
      const notificationResponse = await request(this.baseUrl)
        .post('/notifications/send')
        .set('Authorization', `Bearer ${this.testTokens.admin}`)
        .send({
          userId: this.testUsers.customer.id,
          channels: ['push'],
          title: 'Test Notification',
          body: 'This is a test notification',
          data: { type: 'test' }
        });

      expect(notificationResponse.status).toBe(200);

      console.log('✅ Notification system test passed');

    } catch (error) {
      console.error('❌ Notification test failed:', error);
      throw error;
    }
  }

  // =================================================================
  // PERFORMANCE TESTS
  // =================================================================

  /**
   * Test system performance under load
   */
  async testPerformance() {
    console.log('⚡ Testing system performance...');

    const startTime = Date.now();
    const concurrentRequests = 50;
    const promises = [];

    // Test concurrent API requests
    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        request(this.baseUrl)
          .get('/jobs')
          .set('Authorization', `Bearer ${this.testTokens.customer}`)
      );
    }

    const responses = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Verify all requests succeeded
    responses.forEach(response => {
      expect(response.status).toBe(200);
    });

    // Check performance metrics
    const avgResponseTime = totalTime / concurrentRequests;
    expect(avgResponseTime).toBeLessThan(500); // Less than 500ms average

    console.log(`✅ Performance test passed: ${concurrentRequests} requests in ${totalTime}ms`);
    console.log(`📊 Average response time: ${avgResponseTime.toFixed(2)}ms`);

    return {
      totalRequests: concurrentRequests,
      totalTime,
      averageResponseTime: avgResponseTime
    };
  }

  // =================================================================
  // SECURITY TESTS
  // =================================================================

  /**
   * Test security measures
   */
  async testSecurity() {
    console.log('🔐 Testing security measures...');

    try {
      // Test unauthorized access
      const unauthorizedResponse = await request(this.baseUrl)
        .get('/jobs')
        .expect(401);

      // Test invalid token
      const invalidTokenResponse = await request(this.baseUrl)
        .get('/jobs')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      // Test SQL injection protection
      const sqlInjectionResponse = await request(this.baseUrl)
        .get('/jobs')
        .set('Authorization', `Bearer ${this.testTokens.customer}`)
        .query({ status: "'; DROP TABLE users; --" })
        .expect(200); // Should not crash, just return normal results

      // Test rate limiting
      const rateLimitPromises = [];
      for (let i = 0; i < 200; i++) {
        rateLimitPromises.push(
          request(this.baseUrl)
            .post('/auth/login')
            .send({
              email: 'test@example.com',
              password: 'wrong_password'
            })
        );
      }

      const rateLimitResponses = await Promise.all(rateLimitPromises);
      const rateLimitedCount = rateLimitResponses.filter(r => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0); // Should have some rate limited responses

      console.log('✅ Security tests passed');

    } catch (error) {
      console.error('❌ Security test failed:', error);
      throw error;
    }
  }

  // =================================================================
  // DATA INTEGRITY TESTS
  // =================================================================

  /**
   * Test data integrity and consistency
   */
  async testDataIntegrity() {
    console.log('🗄️ Testing data integrity...');

    try {
      // Test referential integrity
      const jobId = this.testJobs.mainJob?.id;
      if (jobId) {
        // Verify job exists in database
        const jobResult = await this.dbPool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        expect(jobResult.rows.length).toBe(1);

        // Verify related records exist
        const statusResult = await this.dbPool.query(
          'SELECT * FROM job_status_history WHERE job_id = $1', 
          [jobId]
        );
        expect(statusResult.rows.length).toBeGreaterThan(0);
      }

      // Test user data consistency
      const userResult = await this.dbPool.query(`
        SELECT u.*, up.*, cp.*
        FROM users u
        LEFT JOIN user_preferences up ON u.id = up.user_id
        LEFT JOIN contractor_profiles cp ON u.id = cp.user_id
        WHERE u.email LIKE '%@example.com'
      `);

      userResult.rows.forEach(user => {
        expect(user.first_name).toBeDefined();
        expect(user.email).toMatch(/@example\.com$/);
        
        if (user.user_type === 'contractor') {
          expect(user.primary_trade).toBeDefined();
        }
      });

      console.log('✅ Data integrity tests passed');

    } catch (error) {
      console.error('❌ Data integrity test failed:', error);
      throw error;
    }
  }

  // =================================================================
  // COMPREHENSIVE TEST RUNNER
  // =================================================================

  /**
   * Run all integration tests
   */
  async runAllTests() {
    console.log('🚀 Starting comprehensive integration tests...');

    const results = {
      startTime: new Date(),
      tests: {},
      overall: { passed: 0, failed: 0 }
    };

    const tests = [
      { name: 'Environment Setup', fn: () => this.setupTestEnvironment() },
      { name: 'Complete Job Workflow', fn: () => this.testCompleteJobWorkflow() },
      { name: 'Notification System', fn: () => this.testNotificationSystem() },
      { name: 'Performance', fn: () => this.testPerformance() },
      { name: 'Security', fn: () => this.testSecurity() },
      { name: 'Data Integrity', fn: () => this.testDataIntegrity() }
    ];

    for (const test of tests) {
      try {
        console.log(`\n🧪 Running ${test.name} tests...`);
        const result = await test.fn();
        results.tests[test.name] = { 
          status: 'PASSED', 
          result,
          timestamp: new Date()
        };
        results.overall.passed++;
        console.log(`✅ ${test.name} tests PASSED`);
      } catch (error) {
        results.tests[test.name] = { 
          status: 'FAILED', 
          error: error.message,
          timestamp: new Date()
        };
        results.overall.failed++;
        console.log(`❌ ${test.name} tests FAILED: ${error.message}`);
      }
    }

    // Cleanup
    await this.cleanupTestEnvironment();

    results.endTime = new Date();
    results.duration = results.endTime - results.startTime;

    console.log('\n📊 Integration Test Results:');
    console.log(`✅ Passed: ${results.overall.passed}`);
    console.log(`❌ Failed: ${results.overall.failed}`);
    console.log(`⏱️ Duration: ${results.duration}ms`);

    return results;
  }

  /**
   * Setup test webhooks for external service testing
   */
  async setupTestWebhooks() {
    // Mock webhook endpoints for testing external integrations
    // This would typically be handled by a test server
    console.log('🔗 Setting up test webhooks...');
  }
}

// =================================================================
// TESTING UTILITIES
// =================================================================

/**
 * Custom assertion helpers for integration tests
 */
const expect = {
  toBe: (actual, expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${actual} to be ${expected}`);
    }
  },
  
  toBeGreaterThan: (actual, expected) => {
    if (actual <= expected) {
      throw new Error(`Expected ${actual} to be greater than ${expected}`);
    }
  },
  
  toBeLessThan: (actual, expected) => {
    if (actual >= expected) {
      throw new Error(`Expected ${actual} to be less than ${expected}`);
    }
  },
  
  toBeDefined: (actual) => {
    if (actual === undefined) {
      throw new Error('Expected value to be defined');
    }
  },
  
  toMatch: (actual, pattern) => {
    if (!pattern.test(actual)) {
      throw new Error(`Expected ${actual} to match ${pattern}`);
    }
  }
};

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  IntegrationTestFramework,
  expect
};

// =================================================================
// TEST RUNNER SCRIPT
// =================================================================

if (require.main === module) {
  const testFramework = new IntegrationTestFramework();
  
  testFramework.runAllTests()
    .then(results => {
      console.log('\n🎉 Integration testing complete!');
      process.exit(results.overall.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('💥 Integration testing failed:', error);
      process.exit(1);
    });
}