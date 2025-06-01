/**
 * Module: smart_matching_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1, mapping_service_v1
 * Provides: AI-powered contractor matching with ML scoring algorithms
 * Integration Points: Job posting, contractor recommendations, mobile apps
 * Last Updated: 2025-05-31
 */

const tf = require('@tensorflow/tfjs-node');
const { config } = require('./config/env');

// =================================================================
// SMART MATCHING SERVICE
// =================================================================

/**
 * AI-Powered Smart Contractor Matching Service
 * Uses machine learning to optimize contractor-job matching
 */
class SmartMatchingService {
  constructor(database, mappingService) {
    this.db = database;
    this.mappingService = mappingService;
    this.model = null;
    this.isModelLoaded = false;
  }

  /**
   * Initialize and load the matching model
   */
  async initializeModel() {
    try {
      // Try to load existing model
      try {
        this.model = await tf.loadLayersModel('file://./models/contractor-matching-model.json');
        console.log('Loaded existing matching model');
      } catch (error) {
        // Create new model if none exists
        this.model = this.createMatchingModel();
        console.log('Created new matching model');
      }
      
      this.isModelLoaded = true;
      return { success: true };
    } catch (error) {
      console.error('Model initialization error:', error);
      throw new Error('Failed to initialize matching model');
    }
  }

  /**
   * Create neural network model for contractor matching
   */
  createMatchingModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [20], // Feature vector size
          units: 64,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu'
        }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid' // Output: match probability (0-1)
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  // =================================================================
  // SMART CONTRACTOR MATCHING
  // =================================================================

  /**
   * Find and rank contractors for a job using AI matching
   */
  async findBestContractors(jobData, options = {}) {
    try {
      const {
        maxResults = 10,
        radiusMiles = 25,
        minRating = 3.0,
        includeReasons = true
      } = options;

      // Get potential contractors within radius
      const potentialContractors = await this.mappingService.findNearbyContractors(
        jobData.location,
        jobData.tradeCategory,
        radiusMiles * 1.5, // Expanded radius for better selection
        maxResults * 3 // Get more candidates for filtering
      );

      if (potentialContractors.length === 0) {
        return { contractors: [], message: 'No contractors found in area' };
      }

      // Calculate smart scores for each contractor
      const scoredContractors = await Promise.all(
        potentialContractors.map(async (contractor) => {
          const score = await this.calculateContractorScore(jobData, contractor);
          return {
            ...contractor,
            smartScore: score.totalScore,
            scoreBreakdown: score.breakdown,
            matchReasons: includeReasons ? score.reasons : undefined
          };
        })
      );

      // Filter and sort by smart score
      const filteredContractors = scoredContractors
        .filter(contractor => 
          contractor.rating >= minRating && 
          contractor.smartScore > 0.3 // Minimum match threshold
        )
        .sort((a, b) => b.smartScore - a.smartScore)
        .slice(0, maxResults);

      return {
        contractors: filteredContractors,
        totalCandidates: potentialContractors.length,
        matchingAlgorithm: 'smart_ai_v1'
      };

    } catch (error) {
      console.error('Smart matching error:', error);
      throw new Error(`Failed to find contractors: ${error.message}`);
    }
  }

  /**
   * Calculate comprehensive matching score for contractor-job pair
   */
  async calculateContractorScore(jobData, contractor) {
    try {
      // Get contractor detailed profile
      const contractorProfile = await this.getContractorProfile(contractor.contractorId);
      
      // Get historical performance data
      const performanceData = await this.getContractorPerformance(contractor.contractorId);
      
      // Get customer preferences if available
      const customerPreferences = await this.getCustomerPreferences(jobData.customerId);

      // Calculate individual score components
      const scores = {
        // Core compatibility (40% weight)
        tradeMatch: this.calculateTradeMatchScore(jobData, contractorProfile),
        experience: this.calculateExperienceScore(jobData, contractorProfile),
        
        // Performance metrics (30% weight)
        qualityScore: this.calculateQualityScore(performanceData),
        reliabilityScore: this.calculateReliabilityScore(performanceData),
        
        // Logistics and availability (20% weight)
        locationScore: this.calculateLocationScore(jobData, contractor),
        availabilityScore: await this.calculateAvailabilityScore(contractor.contractorId, jobData.preferredDate),
        
        // Customer fit (10% weight)
        customerFitScore: this.calculateCustomerFitScore(contractorProfile, customerPreferences),
        pricingScore: this.calculatePricingScore(jobData, contractorProfile)
      };

      // Calculate weighted total score
      const totalScore = 
        (scores.tradeMatch * 0.15) +
        (scores.experience * 0.25) +
        (scores.qualityScore * 0.15) +
        (scores.reliabilityScore * 0.15) +
        (scores.locationScore * 0.10) +
        (scores.availabilityScore * 0.10) +
        (scores.customerFitScore * 0.05) +
        (scores.pricingScore * 0.05);

      // Generate match reasons
      const reasons = this.generateMatchReasons(scores, contractorProfile);

      return {
        totalScore: Math.min(Math.max(totalScore, 0), 1), // Clamp to [0, 1]
        breakdown: scores,
        reasons
      };

    } catch (error) {
      console.error('Score calculation error:', error);
      return { totalScore: 0, breakdown: {}, reasons: [] };
    }
  }

  // =================================================================
  // SCORE CALCULATION METHODS
  // =================================================================

  /**
   * Calculate trade specialization match score
   */
  calculateTradeMatchScore(jobData, contractorProfile) {
    let score = 0;

    // Perfect match for primary trade
    if (contractorProfile.primaryTrade === jobData.tradeCategory) {
      score = 1.0;
    }
    // Partial match for secondary trades
    else if (contractorProfile.secondaryTrades?.includes(jobData.tradeCategory)) {
      score = 0.7;
    }
    // General handyman bonus for small jobs
    else if (contractorProfile.primaryTrade === 'general_handyman' && 
             jobData.estimatedCost < 200) {
      score = 0.5;
    }

    // Specialization bonus
    if (jobData.jobComplexity === 'high' && contractorProfile.specializations?.length > 0) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate experience relevance score
   */
  calculateExperienceScore(jobData, contractorProfile) {
    const years = contractorProfile.yearsExperience || 0;
    const jobsCompleted = contractorProfile.totalJobsCompleted || 0;

    // Base experience score
    let experienceScore = Math.min(years / 10, 1.0); // Normalized to 10 years max
    
    // Job volume bonus
    let volumeScore = Math.min(jobsCompleted / 100, 1.0); // Normalized to 100 jobs max
    
    // Complexity adjustment
    if (jobData.jobComplexity === 'high' && years < 3) {
      experienceScore *= 0.5; // Penalty for complex jobs with low experience
    }
    
    // Emergency job experience
    if (jobData.urgency === 'emergency' && contractorProfile.emergencyServicesAvailable) {
      experienceScore += 0.2;
    }

    return Math.min((experienceScore * 0.7) + (volumeScore * 0.3), 1.0);
  }

  /**
   * Calculate quality performance score
   */
  calculateQualityScore(performanceData) {
    const avgRating = performanceData.averageRating || 0;
    const ratingCount = performanceData.totalReviews || 0;
    
    // Base quality from ratings
    let qualityScore = avgRating / 5.0;
    
    // Confidence adjustment based on review count
    const confidenceMultiplier = Math.min(ratingCount / 20, 1.0);
    qualityScore *= (0.5 + (confidenceMultiplier * 0.5));
    
    // Recent performance trend
    if (performanceData.recentRatingTrend > 0) {
      qualityScore += 0.1; // Bonus for improving performance
    }

    return Math.min(qualityScore, 1.0);
  }

  /**
   * Calculate reliability score
   */
  calculateReliabilityScore(performanceData) {
    const completionRate = performanceData.completionRate || 0;
    const onTimeRate = performanceData.onTimeRate || 0;
    const responseTimeHours = performanceData.averageResponseTime || 24;
    
    // Completion rate (50% weight)
    const completionScore = completionRate / 100;
    
    // On-time performance (30% weight)
    const timelinessScore = onTimeRate / 100;
    
    // Response time (20% weight)
    const responseScore = Math.max(0, 1 - (responseTimeHours / 24));
    
    return (completionScore * 0.5) + (timelinessScore * 0.3) + (responseScore * 0.2);
  }

  /**
   * Calculate location and travel score
   */
  calculateLocationScore(jobData, contractor) {
    const distance = contractor.distance || 0;
    const maxDistance = 25; // miles
    
    // Distance penalty (closer is better)
    let locationScore = Math.max(0, 1 - (distance / maxDistance));
    
    // Service area preference bonus
    if (distance <= 10) {
      locationScore += 0.1; // Bonus for very close contractors
    }
    
    return Math.min(locationScore, 1.0);
  }

  /**
   * Calculate availability score
   */
  async calculateAvailabilityScore(contractorId, preferredDate) {
    try {
      if (!preferredDate) return 0.8; // Default good score if no specific date

      const availability = await this.getContractorAvailability(contractorId, preferredDate);
      
      if (!availability.available) return 0;
      
      // Score based on how many slots are available
      const availableSlots = availability.availableSlots || 1;
      const maxSlots = 8; // Assume 8 possible slots per day
      
      return Math.min(availableSlots / maxSlots, 1.0);

    } catch (error) {
      return 0.5; // Default moderate score on error
    }
  }

  /**
   * Calculate customer preference fit score
   */
  calculateCustomerFitScore(contractorProfile, customerPreferences) {
    if (!customerPreferences) return 0.8; // Default good score

    let fitScore = 0.8; // Base score
    
    // Language preference
    if (customerPreferences.preferredLanguage && 
        contractorProfile.languages?.includes(customerPreferences.preferredLanguage)) {
      fitScore += 0.1;
    }
    
    // Gender preference (if specified)
    if (customerPreferences.contractorGenderPreference && 
        contractorProfile.gender === customerPreferences.contractorGenderPreference) {
      fitScore += 0.05;
    }
    
    // Communication style preference
    if (customerPreferences.communicationStyle === 'frequent' && 
        contractorProfile.communicationFrequency === 'high') {
      fitScore += 0.05;
    }

    return Math.min(fitScore, 1.0);
  }

  /**
   * Calculate pricing competitiveness score
   */
  calculatePricingScore(jobData, contractorProfile) {
    const jobBudget = jobData.estimatedCost || 0;
    const contractorRate = contractorProfile.hourlyRate || 0;
    
    if (!jobBudget || !contractorRate) return 0.7; // Default score

    const estimatedJobCost = contractorRate * (jobData.estimatedHours || 2);
    const priceDifference = Math.abs(estimatedJobCost - jobBudget) / jobBudget;
    
    // Score higher for closer to budget
    return Math.max(0, 1 - priceDifference);
  }

  // =================================================================
  // MACHINE LEARNING FEATURES
  // =================================================================

  /**
   * Extract features for ML model prediction
   */
  extractFeatures(jobData, contractorProfile, performanceData) {
    return [
      // Trade compatibility
      contractorProfile.primaryTrade === jobData.tradeCategory ? 1 : 0,
      contractorProfile.secondaryTrades?.includes(jobData.tradeCategory) ? 1 : 0,
      
      // Experience features
      Math.min((contractorProfile.yearsExperience || 0) / 10, 1),
      Math.min((contractorProfile.totalJobsCompleted || 0) / 100, 1),
      
      // Performance features
      (performanceData.averageRating || 0) / 5,
      (performanceData.completionRate || 0) / 100,
      (performanceData.onTimeRate || 0) / 100,
      Math.max(0, 1 - (performanceData.averageResponseTime || 24) / 24),
      
      // Location features
      Math.max(0, 1 - (contractorProfile.distance || 0) / 25),
      
      // Availability features
      contractorProfile.availableForWork ? 1 : 0,
      contractorProfile.emergencyServicesAvailable && jobData.urgency === 'emergency' ? 1 : 0,
      
      // Price features
      Math.min((contractorProfile.hourlyRate || 0) / 150, 1),
      
      // Job complexity features
      jobData.jobComplexity === 'low' ? 1 : 0,
      jobData.jobComplexity === 'medium' ? 1 : 0,
      jobData.jobComplexity === 'high' ? 1 : 0,
      
      // Urgency features
      jobData.urgency === 'low' ? 1 : 0,
      jobData.urgency === 'medium' ? 1 : 0,
      jobData.urgency === 'high' ? 1 : 0,
      jobData.urgency === 'emergency' ? 1 : 0,
      
      // Additional features
      (performanceData.totalReviews || 0) > 10 ? 1 : 0
    ];
  }

  /**
   * Train the matching model with historical data
   */
  async trainModel() {
    try {
      console.log('Starting model training...');
      
      // Get training data
      const trainingData = await this.getTrainingData();
      
      if (trainingData.length < 100) {
        console.log('Insufficient training data, using rule-based matching');
        return { success: false, reason: 'insufficient_data' };
      }

      // Prepare features and labels
      const features = trainingData.map(data => this.extractFeatures(data.job, data.contractor, data.performance));
      const labels = trainingData.map(data => data.successfulMatch ? 1 : 0);

      // Convert to tensors
      const xs = tf.tensor2d(features);
      const ys = tf.tensor1d(labels);

      // Train the model
      const history = await this.model.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, accuracy = ${logs.acc.toFixed(4)}`);
            }
          }
        }
      });

      // Save the trained model
      await this.model.save('file://./models/contractor-matching-model');

      // Cleanup tensors
      xs.dispose();
      ys.dispose();

      console.log('Model training completed successfully');
      return { success: true, finalLoss: history.history.loss.slice(-1)[0] };

    } catch (error) {
      console.error('Model training error:', error);
      throw new Error(`Failed to train model: ${error.message}`);
    }
  }

  // =================================================================
  // UTILITY METHODS
  // =================================================================

  /**
   * Generate human-readable match reasons
   */
  generateMatchReasons(scores, contractorProfile) {
    const reasons = [];

    if (scores.tradeMatch >= 0.9) {
      reasons.push(`Specializes in ${contractorProfile.primaryTrade}`);
    }
    
    if (scores.qualityScore >= 0.8) {
      reasons.push(`High quality rating (${contractorProfile.averageRating}/5)`);
    }
    
    if (scores.locationScore >= 0.8) {
      reasons.push('Located nearby');
    }
    
    if (scores.experience >= 0.7) {
      reasons.push(`${contractorProfile.yearsExperience}+ years experience`);
    }
    
    if (scores.availabilityScore >= 0.8) {
      reasons.push('Available at your preferred time');
    }
    
    if (scores.reliabilityScore >= 0.8) {
      reasons.push('Excellent reliability record');
    }

    return reasons;
  }

  /**
   * Get contractor detailed profile
   */
  async getContractorProfile(contractorId) {
    const result = await this.db.query(`
      SELECT cp.*, u.first_name, u.last_name
      FROM contractor_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.user_id = $1
    `, [contractorId]);

    return result.rows[0] || {};
  }

  /**
   * Get contractor performance data
   */
  async getContractorPerformance(contractorId) {
    const result = await this.db.query(`
      SELECT 
        AVG(overall_rating) as average_rating,
        COUNT(*) as total_reviews,
        AVG(CASE WHEN overall_rating >= 4 THEN 1.0 ELSE 0.0 END) as satisfaction_rate
      FROM reviews 
      WHERE reviewee_id = $1 AND is_public = true
    `, [contractorId]);

    return result.rows[0] || { average_rating: 0, total_reviews: 0, satisfaction_rate: 0 };
  }

  /**
   * Get customer preferences
   */
  async getCustomerPreferences(customerId) {
    const result = await this.db.query(`
      SELECT preferences FROM customer_preferences WHERE user_id = $1
    `, [customerId]);

    return result.rows[0]?.preferences || null;
  }

  /**
   * Get contractor availability
   */
  async getContractorAvailability(contractorId, date) {
    // This would integrate with the scheduling service
    return { available: true, availableSlots: 4 };
  }

  /**
   * Get training data for ML model
   */
  async getTrainingData() {
    const result = await this.db.query(`
      SELECT 
        j.*, cp.*, r.overall_rating,
        CASE WHEN r.overall_rating >= 4 THEN true ELSE false END as successful_match
      FROM jobs j
      JOIN contractor_profiles cp ON j.contractor_id = cp.user_id
      LEFT JOIN reviews r ON j.id = r.job_id
      WHERE j.status = 'completed' AND r.overall_rating IS NOT NULL
      ORDER BY j.created_at DESC
      LIMIT 1000
    `);

    return result.rows;
  }
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  SmartMatchingService
};