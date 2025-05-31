/**
 * Module: payment_processing_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1, auth_strategy_v1
 * Provides: Stripe marketplace payment processing, contractor payouts, escrow system
 * Integration Points: Mobile apps, API routes, webhook handling, admin dashboard
 * Last Updated: 2025-05-31
 */

const stripe = require('stripe');
const { config } = require('./config/env');

// =================================================================
// STRIPE SERVICE CONFIGURATION
// =================================================================

/**
 * Stripe Service for marketplace payments
 * Handles customer payments, contractor payouts, and platform fees
 */
class StripePaymentService {
  constructor() {
    this.stripe = stripe(config.payments.stripe.secretKey);
    this.webhookSecret = config.payments.stripe.webhookSecret;
    this.connectClientId = config.payments.stripe.connectClientId;
    this.platformFeePercent = config.payments.fees.platformFeePercent;
  }

  // =================================================================
  // CONTRACTOR ONBOARDING (STRIPE CONNECT)
  // =================================================================

  /**
   * Create Stripe Connect account for contractor
   */
  async createContractorAccount(contractorData) {
    try {
      const {
        email, firstName, lastName, phone, businessName, businessType,
        address, dateOfBirth, ssn, businessTaxId
      } = contractorData;

      const accountData = {
        type: 'express',
        country: 'US',
        email: email,
        business_type: businessType === 'individual' ? 'individual' : 'company',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        business_profile: {
          mcc: '1799', // Special Trade Contractors
          url: `https://tradesplatform.com/contractors/${contractorData.id}`,
          product_description: 'Professional trade services'
        },
        settings: {
          payouts: {
            schedule: {
              interval: 'weekly',
              weekly_anchor: 'friday'
            }
          }
        }
      };

      // Add individual information
      if (businessType === 'individual') {
        accountData.individual = {
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          email: email,
          dob: {
            day: dateOfBirth.getDate(),
            month: dateOfBirth.getMonth() + 1,
            year: dateOfBirth.getFullYear()
          },
          address: {
            line1: address.addressLine1,
            line2: address.addressLine2,
            city: address.city,
            state: address.state,
            postal_code: address.zipCode,
            country: 'US'
          },
          ssn_last_4: ssn?.slice(-4)
        };
      }

      // Add company information
      if (businessType !== 'individual') {
        accountData.company = {
          name: businessName,
          phone: phone,
          address: {
            line1: address.addressLine1,
            line2: address.addressLine2,
            city: address.city,
            state: address.state,
            postal_code: address.zipCode,
            country: 'US'
          },
          tax_id: businessTaxId
        };
      }

      const account = await this.stripe.accounts.create(accountData);

      return {
        stripeAccountId: account.id,
        onboardingRequired: true,
        accountStatus: 'pending'
      };

    } catch (error) {
      console.error('Stripe account creation error:', error);
      throw new Error(`Failed to create contractor account: ${error.message}`);
    }
  }

  /**
   * Create onboarding link for contractor
   */
  async createOnboardingLink(stripeAccountId, contractorId) {
    try {
      const accountLink = await this.stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `https://tradesplatform.com/contractor/onboarding/refresh?contractor_id=${contractorId}`,
        return_url: `https://tradesplatform.com/contractor/onboarding/complete?contractor_id=${contractorId}`,
        type: 'account_onboarding'
      });

      return accountLink.url;

    } catch (error) {
      console.error('Onboarding link creation error:', error);
      throw new Error(`Failed to create onboarding link: ${error.message}`);
    }
  }

  /**
   * Check contractor account status
   */
  async getAccountStatus(stripeAccountId) {
    try {
      const account = await this.stripe.accounts.retrieve(stripeAccountId);

      return {
        accountId: account.id,
        detailsSubmitted: account.details_submitted,
        payoutsEnabled: account.payouts_enabled,
        chargesEnabled: account.charges_enabled,
        requirements: {
          currentlyDue: account.requirements.currently_due,
          eventuallyDue: account.requirements.eventually_due,
          pastDue: account.requirements.past_due,
          pendingVerification: account.requirements.pending_verification
        },
        accountStatus: this.determineAccountStatus(account)
      };

    } catch (error) {
      console.error('Account status check error:', error);
      throw new Error(`Failed to get account status: ${error.message}`);
    }
  }

  /**
   * Determine overall account status
   */
  determineAccountStatus(account) {
    if (!account.details_submitted) return 'incomplete';
    if (account.requirements.currently_due.length > 0) return 'requires_information';
    if (account.requirements.past_due.length > 0) return 'past_due';
    if (!account.payouts_enabled || !account.charges_enabled) return 'restricted';
    return 'active';
  }

  // =================================================================
  // PAYMENT PROCESSING
  // =================================================================

  /**
   * Create payment intent for job payment
   */
  async createPaymentIntent(paymentData) {
    try {
      const {
        jobId, customerId, contractorStripeAccountId, amount,
        platformFee, description, metadata = {}
      } = paymentData;

      const applicationFee = Math.round(platformFee * 100); // Convert to cents
      const amountCents = Math.round(amount * 100);

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        payment_method_types: ['card'],
        application_fee_amount: applicationFee,
        transfer_data: {
          destination: contractorStripeAccountId
        },
        metadata: {
          job_id: jobId,
          customer_id: customerId,
          type: 'job_payment',
          ...metadata
        },
        description: description || `Payment for job #${jobId}`,
        automatic_payment_methods: {
          enabled: true
        }
      });

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: amount,
        platformFee: platformFee,
        contractorAmount: amount - platformFee,
        status: paymentIntent.status
      };

    } catch (error) {
      console.error('Payment intent creation error:', error);
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }

  /**
   * Confirm payment intent
   */
  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
        return_url: 'https://tradesplatform.com/payment/complete'
      });

      return {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        chargeId: paymentIntent.charges.data[0]?.id,
        transferId: paymentIntent.charges.data[0]?.transfer,
        amount: paymentIntent.amount / 100,
        applicationFee: paymentIntent.application_fee_amount / 100
      };

    } catch (error) {
      console.error('Payment confirmation error:', error);
      throw new Error(`Failed to confirm payment: ${error.message}`);
    }
  }

  /**
   * Create setup intent for saving payment methods
   */
  async createSetupIntent(customerId) {
    try {
      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session'
      });

      return {
        setupIntentId: setupIntent.id,
        clientSecret: setupIntent.client_secret,
        status: setupIntent.status
      };

    } catch (error) {
      console.error('Setup intent creation error:', error);
      throw new Error(`Failed to create setup intent: ${error.message}`);
    }
  }

  // =================================================================
  // CUSTOMER MANAGEMENT
  // =================================================================

  /**
   * Create Stripe customer
   */
  async createCustomer(customerData) {
    try {
      const { email, firstName, lastName, phone, address } = customerData;

      const customer = await this.stripe.customers.create({
        email: email,
        name: `${firstName} ${lastName}`,
        phone: phone,
        address: address ? {
          line1: address.addressLine1,
          line2: address.addressLine2,
          city: address.city,
          state: address.state,
          postal_code: address.zipCode,
          country: 'US'
        } : undefined,
        metadata: {
          user_id: customerData.id,
          user_type: 'customer'
        }
      });

      return customer.id;

    } catch (error) {
      console.error('Customer creation error:', error);
      throw new Error(`Failed to create customer: ${error.message}`);
    }
  }

  /**
   * Get customer payment methods
   */
  async getCustomerPaymentMethods(stripeCustomerId) {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card'
      });

      return paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year
        },
        isDefault: pm.id === paymentMethods.data[0]?.id
      }));

    } catch (error) {
      console.error('Get payment methods error:', error);
      throw new Error(`Failed to get payment methods: ${error.message}`);
    }
  }

  /**
   * Attach payment method to customer
   */
  async attachPaymentMethod(paymentMethodId, stripeCustomerId) {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      });

      return {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year
        }
      };

    } catch (error) {
      console.error('Attach payment method error:', error);
      throw new Error(`Failed to attach payment method: ${error.message}`);
    }
  }

  // =================================================================
  // ESCROW AND HOLD FUNCTIONALITY
  // =================================================================

  /**
   * Create escrow payment (authorize but don't capture)
   */
  async createEscrowPayment(paymentData) {
    try {
      const {
        jobId, customerId, contractorStripeAccountId, amount,
        platformFee, description
      } = paymentData;

      const applicationFee = Math.round(platformFee * 100);
      const amountCents = Math.round(amount * 100);

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        payment_method_types: ['card'],
        application_fee_amount: applicationFee,
        transfer_data: {
          destination: contractorStripeAccountId
        },
        capture_method: 'manual', // Authorize but don't capture
        metadata: {
          job_id: jobId,
          customer_id: customerId,
          type: 'escrow_payment'
        },
        description: description || `Escrow payment for job #${jobId}`
      });

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        escrowHeld: true
      };

    } catch (error) {
      console.error('Escrow payment creation error:', error);
      throw new Error(`Failed to create escrow payment: ${error.message}`);
    }
  }

  /**
   * Release escrow payment when job is completed
   */
  async releaseEscrowPayment(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.capture(paymentIntentId);

      return {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        chargeId: paymentIntent.charges.data[0]?.id,
        transferId: paymentIntent.charges.data[0]?.transfer,
        releasedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Escrow release error:', error);
      throw new Error(`Failed to release escrow payment: ${error.message}`);
    }
  }

  /**
   * Cancel escrow payment and refund customer
   */
  async cancelEscrowPayment(paymentIntentId, reason = 'requested_by_customer') {
    try {
      const paymentIntent = await this.stripe.paymentIntents.cancel(paymentIntentId, {
        cancellation_reason: reason
      });

      return {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        cancelledAt: new Date().toISOString(),
        reason: reason
      };

    } catch (error) {
      console.error('Escrow cancellation error:', error);
      throw new Error(`Failed to cancel escrow payment: ${error.message}`);
    }
  }

  // =================================================================
  // REFUNDS AND DISPUTES
  // =================================================================

  /**
   * Process refund
   */
  async processRefund(chargeId, amount, reason = 'requested_by_customer') {
    try {
      const refund = await this.stripe.refunds.create({
        charge: chargeId,
        amount: amount ? Math.round(amount * 100) : undefined, // Partial or full refund
        reason: reason,
        metadata: {
          refund_reason: reason,
          processed_at: new Date().toISOString()
        }
      });

      return {
        refundId: refund.id,
        chargeId: refund.charge,
        amount: refund.amount / 100,
        status: refund.status,
        reason: refund.reason
      };

    } catch (error) {
      console.error('Refund processing error:', error);
      throw new Error(`Failed to process refund: ${error.message}`);
    }
  }

  // =================================================================
  // PAYOUT MANAGEMENT
  // =================================================================

  /**
   * Get contractor payout schedule
   */
  async getPayoutSchedule(stripeAccountId) {
    try {
      const account = await this.stripe.accounts.retrieve(stripeAccountId);

      return {
        interval: account.settings.payouts.schedule.interval,
        weeklyAnchor: account.settings.payouts.schedule.weekly_anchor,
        monthlyAnchor: account.settings.payouts.schedule.monthly_anchor,
        nextPayoutDate: await this.calculateNextPayoutDate(account.settings.payouts.schedule)
      };

    } catch (error) {
      console.error('Payout schedule error:', error);
      throw new Error(`Failed to get payout schedule: ${error.message}`);
    }
  }

  /**
   * Get contractor balance and pending payouts
   */
  async getContractorBalance(stripeAccountId) {
    try {
      const balance = await this.stripe.balance.retrieve({
        stripeAccount: stripeAccountId
      });

      const pendingPayouts = await this.stripe.payouts.list({
        limit: 10,
        status: 'pending'
      }, {
        stripeAccount: stripeAccountId
      });

      return {
        available: balance.available.map(b => ({
          amount: b.amount / 100,
          currency: b.currency
        })),
        pending: balance.pending.map(b => ({
          amount: b.amount / 100,
          currency: b.currency
        })),
        pendingPayouts: pendingPayouts.data.map(p => ({
          id: p.id,
          amount: p.amount / 100,
          currency: p.currency,
          arrivalDate: new Date(p.arrival_date * 1000),
          status: p.status
        }))
      };

    } catch (error) {
      console.error('Balance retrieval error:', error);
      throw new Error(`Failed to get contractor balance: ${error.message}`);
    }
  }

  // =================================================================
  // UTILITY FUNCTIONS
  // =================================================================

  /**
   * Calculate platform fee based on job amount
   */
  calculatePlatformFee(jobAmount) {
    const platformFee = jobAmount * (this.platformFeePercent / 100);
    const stripeFee = (jobAmount * 0.029) + 0.30; // Stripe's standard fee
    
    return {
      jobAmount: jobAmount,
      platformFee: Math.round(platformFee * 100) / 100,
      stripeFee: Math.round(stripeFee * 100) / 100,
      contractorAmount: Math.round((jobAmount - platformFee) * 100) / 100,
      totalFees: Math.round((platformFee + stripeFee) * 100) / 100
    };
  }

  /**
   * Calculate next payout date
   */
  async calculateNextPayoutDate(schedule) {
    const now = new Date();
    const nextPayout = new Date(now);

    if (schedule.interval === 'daily') {
      nextPayout.setDate(now.getDate() + 1);
    } else if (schedule.interval === 'weekly') {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = dayNames.indexOf(schedule.weekly_anchor);
      const currentDay = now.getDay();
      
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget <= 0) daysUntilTarget += 7;
      
      nextPayout.setDate(now.getDate() + daysUntilTarget);
    } else if (schedule.interval === 'monthly') {
      nextPayout.setMonth(now.getMonth() + 1);
      nextPayout.setDate(schedule.monthly_anchor || 1);
    }

    return nextPayout.toISOString();
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload, signature) {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (error) {
      console.error('Webhook signature validation failed:', error);
      throw new Error('Invalid webhook signature');
    }
  }
}

// =================================================================
// PAYMENT DATABASE INTEGRATION
// =================================================================

/**
 * Payment Database Service
 * Handles database operations for payment records
 */
class PaymentDatabaseService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Create payment record
   */
  async createPaymentRecord(paymentData) {
    try {
      const {
        jobId, customerId, contractorId, amountTotal, amountContractor,
        amountPlatformFee, stripePaymentIntentId, status = 'pending'
      } = paymentData;

      const result = await this.db.query(`
        INSERT INTO payments (
          job_id, customer_id, contractor_id, amount_total, amount_contractor,
          amount_platform_fee, stripe_payment_intent_id, payment_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        jobId, customerId, contractorId, amountTotal, amountContractor,
        amountPlatformFee, stripePaymentIntentId, status
      ]);

      return result.rows[0];

    } catch (error) {
      console.error('Payment record creation error:', error);
      throw new Error('Failed to create payment record');
    }
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(paymentIntentId, status, metadata = {}) {
    try {
      const updateFields = ['payment_status = $2'];
      const values = [paymentIntentId, status];
      let paramCount = 2;

      if (metadata.chargeId) {
        updateFields.push(`stripe_charge_id = $${++paramCount}`);
        values.push(metadata.chargeId);
      }

      if (metadata.transferId) {
        updateFields.push(`stripe_transfer_id = $${++paramCount}`);
        values.push(metadata.transferId);
      }

      if (status === 'completed') {
        updateFields.push(`captured_at = NOW()`);
      }

      const result = await this.db.query(`
        UPDATE payments 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE stripe_payment_intent_id = $1
        RETURNING *
      `, values);

      return result.rows[0];

    } catch (error) {
      console.error('Payment status update error:', error);
      throw new Error('Failed to update payment status');
    }
  }

  /**
   * Get payment by job ID
   */
  async getPaymentByJobId(jobId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM payments WHERE job_id = $1
      `, [jobId]);

      return result.rows[0] || null;

    } catch (error) {
      console.error('Get payment error:', error);
      throw new Error('Failed to get payment record');
    }
  }

  /**
   * Update contractor payout info
   */
  async updateContractorPayout(contractorId, stripeAccountId, accountStatus) {
    try {
      const result = await this.db.query(`
        INSERT INTO contractor_payouts (contractor_id, stripe_account_id, account_status)
        VALUES ($1, $2, $3)
        ON CONFLICT (contractor_id) 
        DO UPDATE SET 
          stripe_account_id = EXCLUDED.stripe_account_id,
          account_status = EXCLUDED.account_status,
          updated_at = NOW()
        RETURNING *
      `, [contractorId, stripeAccountId, accountStatus]);

      return result.rows[0];

    } catch (error) {
      console.error('Contractor payout update error:', error);
      throw new Error('Failed to update contractor payout info');
    }
  }
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  StripePaymentService,
  PaymentDatabaseService
};