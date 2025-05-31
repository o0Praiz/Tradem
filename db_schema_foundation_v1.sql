/**
 * Module: db_schema_foundation_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1
 * Provides: Core PostgreSQL database schema for users, jobs, payments, and platform data
 * Integration Points: All backend services, authentication, job management, payments
 * Last Updated: 2025-05-31
 */

-- =================================================================
-- TRADES PLATFORM DATABASE SCHEMA FOUNDATION
-- PostgreSQL Database Schema for Advanced Trades Management Platform
-- =================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =================================================================
-- ENUMS AND CUSTOM TYPES
-- =================================================================

-- User types in the system
CREATE TYPE user_type AS ENUM ('customer', 'contractor', 'admin', 'support');

-- User account status
CREATE TYPE account_status AS ENUM ('pending', 'active', 'suspended', 'deactivated', 'banned');

-- Trade categories
CREATE TYPE trade_category AS ENUM (
    'plumbing', 
    'hvac', 
    'carpentry', 
    'electrical', 
    'general_handyman',
    'painting',
    'flooring',
    'roofing',
    'appliance_repair',
    'landscaping'
);

-- Job status workflow
CREATE TYPE job_status AS ENUM (
    'draft',           -- Customer creating job
    'posted',          -- Job available for contractors
    'assigned',        -- Contractor assigned
    'in_progress',     -- Work being performed
    'completed',       -- Work finished, awaiting approval
    'approved',        -- Customer approved work
    'cancelled',       -- Job cancelled
    'disputed'         -- Issue requiring resolution
);

-- Payment status
CREATE TYPE payment_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'refunded',
    'disputed'
);

-- Priority levels
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'urgent');

-- Verification status
CREATE TYPE verification_status AS ENUM ('pending', 'in_progress', 'verified', 'failed', 'expired');

-- =================================================================
-- CORE USER MANAGEMENT
-- =================================================================

-- Users table - foundation for all platform users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    user_type user_type NOT NULL,
    account_status account_status DEFAULT 'pending',
    
    -- Personal Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    profile_image_url TEXT,
    
    -- Location data
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'United States',
    coordinates GEOMETRY(POINT, 4326), -- PostGIS point for lat/lng
    
    -- Authentication
    email_verified_at TIMESTAMP,
    phone_verified_at TIMESTAMP,
    last_login_at TIMESTAMP,
    
    -- Platform metadata
    referral_code VARCHAR(20) UNIQUE,
    referred_by_user_id UUID REFERENCES users(id),
    terms_accepted_at TIMESTAMP,
    privacy_accepted_at TIMESTAMP,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- User sessions for JWT token management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_type VARCHAR(50), -- mobile, web, desktop
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences and settings
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification preferences
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT true,
    push_notifications BOOLEAN DEFAULT true,
    marketing_emails BOOLEAN DEFAULT false,
    
    -- App preferences
    distance_unit VARCHAR(10) DEFAULT 'miles', -- miles, kilometers
    currency VARCHAR(3) DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'America/Chicago',
    language VARCHAR(10) DEFAULT 'en',
    
    -- Privacy settings
    profile_visibility VARCHAR(20) DEFAULT 'public', -- public, private, contractors_only
    location_sharing BOOLEAN DEFAULT true,
    
    -- Contractor-specific preferences
    work_radius_miles INTEGER DEFAULT 25,
    min_job_value DECIMAL(10,2),
    auto_accept_jobs BOOLEAN DEFAULT false,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- CONTRACTOR-SPECIFIC TABLES
-- =================================================================

-- Contractor profiles with business information
CREATE TABLE contractor_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Business Information
    business_name VARCHAR(255),
    business_type VARCHAR(50), -- sole_proprietorship, llc, corporation, partnership
    business_license_number VARCHAR(100),
    tax_id VARCHAR(50),
    
    -- Service Information
    primary_trade trade_category NOT NULL,
    secondary_trades trade_category[],
    years_experience INTEGER,
    service_description TEXT,
    hourly_rate DECIMAL(10,2),
    minimum_job_value DECIMAL(10,2),
    
    -- Availability
    available_for_work BOOLEAN DEFAULT true,
    work_schedule JSONB, -- Flexible schedule data
    emergency_services BOOLEAN DEFAULT false,
    
    -- Business Verification
    background_check_status verification_status DEFAULT 'pending',
    license_verification_status verification_status DEFAULT 'pending',
    insurance_verification_status verification_status DEFAULT 'pending',
    
    -- Platform metrics
    total_jobs_completed INTEGER DEFAULT 0,
    total_earnings DECIMAL(12,2) DEFAULT 0.00,
    average_rating DECIMAL(3,2) DEFAULT 0.00,
    completion_rate DECIMAL(5,2) DEFAULT 0.00,
    response_time_hours DECIMAL(5,2),
    
    -- Account status
    onboarding_completed_at TIMESTAMP,
    approved_at TIMESTAMP,
    suspended_at TIMESTAMP,
    suspension_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contractor licenses and certifications
CREATE TABLE contractor_licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractor_profiles(user_id) ON DELETE CASCADE,
    
    license_type VARCHAR(100) NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    issuing_authority VARCHAR(255) NOT NULL,
    issued_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    verification_status verification_status DEFAULT 'pending',
    verification_date TIMESTAMP,
    
    -- Document storage
    license_document_url TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(contractor_id, license_number)
);

-- Contractor insurance information
CREATE TABLE contractor_insurance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractor_profiles(user_id) ON DELETE CASCADE,
    
    insurance_type VARCHAR(100) NOT NULL, -- general_liability, workers_comp, professional
    insurance_company VARCHAR(255) NOT NULL,
    policy_number VARCHAR(100) NOT NULL,
    coverage_amount DECIMAL(12,2) NOT NULL,
    effective_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    verification_status verification_status DEFAULT 'pending',
    
    -- Document storage
    certificate_url TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- JOB MANAGEMENT
-- =================================================================

-- Jobs table - core job posting and management
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES users(id),
    contractor_id UUID REFERENCES contractor_profiles(user_id),
    
    -- Job Details
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    trade_category trade_category NOT NULL,
    priority priority_level DEFAULT 'medium',
    status job_status DEFAULT 'draft',
    
    -- Location
    service_address_line1 VARCHAR(255) NOT NULL,
    service_address_line2 VARCHAR(255),
    service_city VARCHAR(100) NOT NULL,
    service_state VARCHAR(50) NOT NULL,
    service_zip_code VARCHAR(20) NOT NULL,
    service_coordinates GEOMETRY(POINT, 4326),
    access_instructions TEXT,
    
    -- Pricing
    estimated_cost DECIMAL(10,2),
    quoted_price DECIMAL(10,2),
    final_price DECIMAL(10,2),
    pricing_type VARCHAR(20) DEFAULT 'fixed', -- fixed, hourly, materials_plus_labor
    
    -- Scheduling
    preferred_date DATE,
    preferred_time_start TIME,
    preferred_time_end TIME,
    flexible_scheduling BOOLEAN DEFAULT false,
    urgency_level priority_level DEFAULT 'medium',
    
    -- Job lifecycle timestamps
    posted_at TIMESTAMP,
    assigned_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    approved_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    
    -- Customer requirements
    requires_license BOOLEAN DEFAULT true,
    requires_insurance BOOLEAN DEFAULT true,
    requires_background_check BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job photos for before/during/after documentation
CREATE TABLE job_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    
    photo_url TEXT NOT NULL,
    photo_type VARCHAR(20) NOT NULL, -- before, during, after, issue, completion
    caption TEXT,
    timestamp_taken TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job status history for audit trail
CREATE TABLE job_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES users(id),
    
    previous_status job_status,
    new_status job_status NOT NULL,
    reason TEXT,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- PAYMENT SYSTEM
-- =================================================================

-- Payment transactions
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    contractor_id UUID NOT NULL REFERENCES contractor_profiles(user_id),
    
    -- Payment details
    amount_total DECIMAL(10,2) NOT NULL,
    amount_contractor DECIMAL(10,2) NOT NULL,
    amount_platform_fee DECIMAL(10,2) NOT NULL,
    amount_stripe_fee DECIMAL(10,2) NOT NULL,
    
    payment_status payment_status DEFAULT 'pending',
    payment_method VARCHAR(50), -- card, bank_transfer, apple_pay, google_pay
    
    -- Stripe integration
    stripe_payment_intent_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    stripe_transfer_id VARCHAR(255),
    
    -- Processing timestamps
    authorized_at TIMESTAMP,
    captured_at TIMESTAMP,
    transferred_at TIMESTAMP,
    refunded_at TIMESTAMP,
    
    -- Dispute handling
    disputed_at TIMESTAMP,
    dispute_reason TEXT,
    resolved_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contractor payout information
CREATE TABLE contractor_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contractor_id UUID NOT NULL REFERENCES contractor_profiles(user_id),
    
    -- Stripe Connect account info
    stripe_account_id VARCHAR(255) UNIQUE,
    account_status VARCHAR(50), -- pending, active, restricted, rejected
    
    -- Bank account details (encrypted/tokenized)
    bank_account_last4 VARCHAR(4),
    bank_name VARCHAR(255),
    routing_number_last4 VARCHAR(4),
    
    -- Payout preferences
    payout_schedule VARCHAR(20) DEFAULT 'weekly', -- daily, weekly, monthly
    minimum_payout_amount DECIMAL(10,2) DEFAULT 50.00,
    
    -- Verification status
    identity_verified BOOLEAN DEFAULT false,
    bank_verified BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =================================================================
-- RATING AND REVIEW SYSTEM
-- =================================================================

-- Reviews from customers about contractors and vice versa
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    reviewee_id UUID NOT NULL REFERENCES users(id),
    
    -- Rating and feedback
    overall_rating INTEGER NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
    timeliness_rating INTEGER CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
    
    review_text TEXT,
    would_recommend BOOLEAN,
    
    -- Moderation
    is_public BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    moderated_at TIMESTAMP,
    moderated_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one review per job per direction
    UNIQUE(job_id, reviewer_id, reviewee_id)
);

-- =================================================================
-- MESSAGING SYSTEM
-- =================================================================

-- Conversations between users
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id),
    
    -- Participants
    customer_id UUID NOT NULL REFERENCES users(id),
    contractor_id UUID NOT NULL REFERENCES users(id),
    
    -- Conversation status
    is_active BOOLEAN DEFAULT true,
    last_message_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(job_id, customer_id, contractor_id)
);

-- Messages within conversations
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    
    message_text TEXT,
    message_type VARCHAR(20) DEFAULT 'text', -- text, image, document, system
    attachment_url TEXT,
    
    -- Message status
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    
    -- System message data
    system_message_type VARCHAR(50), -- job_assigned, payment_completed, etc.
    system_message_data JSONB
);

-- =================================================================
-- NOTIFICATIONS
-- =================================================================

-- Push notification tokens for mobile apps
CREATE TABLE notification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    token VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL, -- ios, android, web
    device_id VARCHAR(255),
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, token)
);

-- Notification history
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    -- Related entities
    job_id UUID REFERENCES jobs(id),
    conversation_id UUID REFERENCES conversations(id),
    
    -- Delivery status
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    clicked_at TIMESTAMP,
    
    -- Delivery methods
    sent_push BOOLEAN DEFAULT false,
    sent_email BOOLEAN DEFAULT false,
    sent_sms BOOLEAN DEFAULT false,
    
    -- Notification data
    action_url TEXT,
    metadata JSONB
);

-- =================================================================
-- INDEXES FOR PERFORMANCE
-- =================================================================

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_type_status ON users(user_type, account_status);
CREATE INDEX idx_users_location ON users USING GIST(coordinates);

-- Job indexes
CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_jobs_contractor ON jobs(contractor_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_trade_category ON jobs(trade_category);
CREATE INDEX idx_jobs_location ON jobs USING GIST(service_coordinates);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
CREATE INDEX idx_jobs_preferred_date ON jobs(preferred_date);

-- Payment indexes
CREATE INDEX idx_payments_job ON payments(job_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_contractor ON payments(contractor_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- Message indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);

-- Review indexes
CREATE INDEX idx_reviews_job ON reviews(job_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);

-- =================================================================
-- FUNCTIONS AND TRIGGERS
-- =================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contractor_profiles_updated_at BEFORE UPDATE ON contractor_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update contractor metrics
CREATE OR REPLACE FUNCTION update_contractor_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update contractor profile metrics when job status changes to completed/approved
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        UPDATE contractor_profiles 
        SET 
            total_jobs_completed = total_jobs_completed + 1,
            total_earnings = total_earnings + COALESCE(NEW.final_price, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = NEW.contractor_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_contractor_metrics_trigger 
    AFTER UPDATE ON jobs
    FOR EACH ROW 
    EXECUTE FUNCTION update_contractor_metrics();