/**
 * Module: review_system_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1, notification_service_v1
 * Provides: Rating and review management, quality assurance, reputation tracking
 * Integration Points: Job completion, mobile apps, admin dashboard, contractor profiles
 * Last Updated: 2025-05-31
 */

const { config } = require('./config/env');

// =================================================================
// REVIEW SYSTEM CORE
// =================================================================

/**
 * Review and Rating Management Service
 * Handles customer feedback, contractor ratings, and quality metrics
 */
class ReviewService {
  constructor(database, notificationService = null) {
    this.db = database;
    this.notificationService = notificationService;
  }

  // =================================================================
  // REVIEW CREATION AND MANAGEMENT
  // =================================================================

  /**
   * Submit a review for a completed job
   */
  async submitReview(reviewData) {
    try {
      const {
        jobId,
        reviewerId,
        revieweeId,
        overallRating,
        qualityRating,
        communicationRating,
        timelinessRating,
        reviewText,
        wouldRecommend,
        photos = []
      } = reviewData;

      // Validate ratings
      const ratings = [overallRating, qualityRating, communicationRating, timelinessRating];
      if (ratings.some(rating => rating < 1 || rating > 5)) {
        throw new Error('All ratings must be between 1 and 5');
      }

      // Check if review already exists
      const existingReview = await this.db.query(`
        SELECT id FROM reviews 
        WHERE job_id = $1 AND reviewer_id = $2 AND reviewee_id = $3
      `, [jobId, reviewerId, revieweeId]);

      if (existingReview.rows.length > 0) {
        throw new Error('Review already exists for this job');
      }

      // Verify job completion and participant validity
      const jobVerification = await this.verifyJobAndParticipants(jobId, reviewerId, revieweeId);
      if (!jobVerification.valid) {
        throw new Error(jobVerification.reason);
      }

      // Create review
      const result = await this.db.query(`
        INSERT INTO reviews (
          job_id, reviewer_id, reviewee_id, overall_rating, quality_rating,
          communication_rating, timeliness_rating, review_text, would_recommend
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        jobId, reviewerId, revieweeId, overallRating, qualityRating,
        communicationRating, timelinessRating, reviewText, wouldRecommend
      ]);

      const review = result.rows[0];

      // Save review photos if provided
      if (photos.length > 0) {
        await this.saveReviewPhotos(review.id, photos);
      }

      // Update reviewer's overall ratings
      await this.updateContractorRatings(revieweeId);

      // Send notification to reviewee
      if (this.notificationService) {
        await this.notificationService.sendPushNotification(revieweeId, {
          title: 'New Review Received!',
          body: `You received a ${overallRating}-star review.`,
          data: {
            type: 'new_review',
            reviewId: review.id,
            jobId,
            rating: overallRating
          }
        });
      }

      // Check for quality issues
      await this.checkQualityFlags(review);

      return {
        reviewId: review.id,
        averageRating: await this.getContractorAverageRating(revieweeId),
        message: 'Review submitted successfully'
      };

    } catch (error) {
      console.error('Submit review error:', error);
      throw new Error(`Failed to submit review: ${error.message}`);
    }
  }

  /**
   * Get reviews for a contractor
   */
  async getContractorReviews(contractorId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        minRating = 1,
        sortBy = 'recent' // 'recent', 'rating_high', 'rating_low'
      } = options;

      const offset = (page - 1) * limit;

      let orderClause = 'ORDER BY r.created_at DESC';
      if (sortBy === 'rating_high') {
        orderClause = 'ORDER BY r.overall_rating DESC, r.created_at DESC';
      } else if (sortBy === 'rating_low') {
        orderClause = 'ORDER BY r.overall_rating ASC, r.created_at DESC';
      }

      const result = await this.db.query(`
        SELECT 
          r.*,
          reviewer.first_name as reviewer_first_name,
          reviewer.last_name as reviewer_last_name,
          reviewer.profile_image_url as reviewer_image,
          j.title as job_title,
          j.trade_category,
          j.final_price
        FROM reviews r
        JOIN users reviewer ON r.reviewer_id = reviewer.id
        JOIN jobs j ON r.job_id = j.id
        WHERE r.reviewee_id = $1 
          AND r.overall_rating >= $2
          AND r.is_public = true
        ${orderClause}
        LIMIT $3 OFFSET $4
      `, [contractorId, minRating, limit, offset]);

      // Get total count for pagination
      const countResult = await this.db.query(`
        SELECT COUNT(*) 
        FROM reviews 
        WHERE reviewee_id = $1 AND overall_rating >= $2 AND is_public = true
      `, [contractorId, minRating]);

      const reviews = await Promise.all(result.rows.map(async (row) => {
        const photos = await this.getReviewPhotos(row.id);
        
        return {
          id: row.id,
          jobId: row.job_id,
          jobTitle: row.job_title,
          tradeCategory: row.trade_category,
          jobPrice: row.final_price,
          reviewer: {
            firstName: row.reviewer_first_name,
            lastName: row.reviewer_last_name,
            profileImage: row.reviewer_image
          },
          ratings: {
            overall: row.overall_rating,
            quality: row.quality_rating,
            communication: row.communication_rating,
            timeliness: row.timeliness_rating
          },
          reviewText: row.review_text,
          wouldRecommend: row.would_recommend,
          photos,
          createdAt: row.created_at,
          verifiedPurchase: true // All reviews are from actual jobs
        };
      }));

      return {
        reviews,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.rows[0].count),
          totalPages: Math.ceil(countResult.rows[0].count / limit)
        }
      };

    } catch (error) {
      console.error('Get contractor reviews error:', error);
      throw new Error(`Failed to get reviews: ${error.message}`);
    }
  }

  /**
   * Get review statistics for a contractor
   */
  async getContractorReviewStats(contractorId) {
    try {
      const result = await this.db.query(`
        SELECT 
          COUNT(*) as total_reviews,
          AVG(overall_rating) as average_overall,
          AVG(quality_rating) as average_quality,
          AVG(communication_rating) as average_communication,
          AVG(timeliness_rating) as average_timeliness,
          COUNT(CASE WHEN would_recommend = true THEN 1 END) as recommend_count,
          COUNT(CASE WHEN overall_rating = 5 THEN 1 END) as five_star_count,
          COUNT(CASE WHEN overall_rating = 4 THEN 1 END) as four_star_count,
          COUNT(CASE WHEN overall_rating = 3 THEN 1 END) as three_star_count,
          COUNT(CASE WHEN overall_rating = 2 THEN 1 END) as two_star_count,
          COUNT(CASE WHEN overall_rating = 1 THEN 1 END) as one_star_count
        FROM reviews 
        WHERE reviewee_id = $1 AND is_public = true
      `, [contractorId]);

      const stats = result.rows[0];
      const totalReviews = parseInt(stats.total_reviews);

      if (totalReviews === 0) {
        return {
          totalReviews: 0,
          averageRating: 0,
          recommendationRate: 0,
          ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        };
      }

      return {
        totalReviews,
        averageRating: Math.round(parseFloat(stats.average_overall) * 10) / 10,
        averageRatings: {
          overall: Math.round(parseFloat(stats.average_overall) * 10) / 10,
          quality: Math.round(parseFloat(stats.average_quality) * 10) / 10,
          communication: Math.round(parseFloat(stats.average_communication) * 10) / 10,
          timeliness: Math.round(parseFloat(stats.average_timeliness) * 10) / 10
        },
        recommendationRate: Math.round((parseInt(stats.recommend_count) / totalReviews) * 100),
        ratingDistribution: {
          5: parseInt(stats.five_star_count),
          4: parseInt(stats.four_star_count),
          3: parseInt(stats.three_star_count),
          2: parseInt(stats.two_star_count),
          1: parseInt(stats.one_star_count)
        },
        ratingPercentages: {
          5: Math.round((parseInt(stats.five_star_count) / totalReviews) * 100),
          4: Math.round((parseInt(stats.four_star_count) / totalReviews) * 100),
          3: Math.round((parseInt(stats.three_star_count) / totalReviews) * 100),
          2: Math.round((parseInt(stats.two_star_count) / totalReviews) * 100),
          1: Math.round((parseInt(stats.one_star_count) / totalReviews) * 100)
        }
      };

    } catch (error) {
      console.error('Get contractor review stats error:', error);
      throw new Error(`Failed to get review statistics: ${error.message}`);
    }
  }

  // =================================================================
  // QUALITY ASSURANCE
  // =================================================================

  /**
   * Check for quality issues and flag reviews for moderation
   */
  async checkQualityFlags(review) {
    try {
      const flags = [];

      // Flag low ratings
      if (review.overall_rating <= 2) {
        flags.push({
          type: 'low_rating',
          severity: 'high',
          description: 'Review contains low overall rating'
        });
      }

      // Flag potential inappropriate content
      const inappropriateWords = await this.checkInappropriateContent(review.review_text);
      if (inappropriateWords.length > 0) {
        flags.push({
          type: 'inappropriate_content',
          severity: 'high',
          description: `Potential inappropriate content detected: ${inappropriateWords.join(', ')}`
        });
      }

      // Flag extremely short reviews for low ratings
      if (review.overall_rating <= 2 && review.review_text && review.review_text.length < 20) {
        flags.push({
          type: 'insufficient_detail',
          severity: 'medium',
          description: 'Low rating with insufficient detail provided'
        });
      }

      // Flag reviews that are significantly different from contractor's average
      const avgRating = await this.getContractorAverageRating(review.reviewee_id);
      if (avgRating > 0 && Math.abs(review.overall_rating - avgRating) >= 3) {
        flags.push({
          type: 'rating_outlier',
          severity: 'medium',
          description: 'Rating significantly different from contractor average'
        });
      }

      // Save flags if any exist
      if (flags.length > 0) {
        await this.saveQualityFlags(review.id, flags);
        
        // Auto-hide review if high severity flags exist
        const hasHighSeverity = flags.some(flag => flag.severity === 'high');
        if (hasHighSeverity) {
          await this.setReviewVisibility(review.id, false);
        }
      }

      return flags;

    } catch (error) {
      console.error('Quality check error:', error);
      return [];
    }
  }

  /**
   * Check for inappropriate content in review text
   */
  async checkInappropriateContent(text) {
    if (!text) return [];

    const inappropriateWords = [
      // This would be a comprehensive list of inappropriate words
      'spam', 'fake', 'scam', 'terrible', 'awful', 'worst'
      // Add more words as needed
    ];

    const foundWords = inappropriateWords.filter(word => 
      text.toLowerCase().includes(word.toLowerCase())
    );

    return foundWords;
  }

  /**
   * Save quality flags for a review
   */
  async saveQualityFlags(reviewId, flags) {
    try {
      for (const flag of flags) {
        await this.db.query(`
          INSERT INTO review_quality_flags (
            review_id, flag_type, severity, description, auto_generated
          ) VALUES ($1, $2, $3, $4, true)
        `, [reviewId, flag.type, flag.severity, flag.description]);
      }
    } catch (error) {
      console.error('Save quality flags error:', error);
    }
  }

  /**
   * Moderate a review (approve/reject)
   */
  async moderateReview(reviewId, moderatorId, action, reason = null) {
    try {
      const validActions = ['approve', 'reject', 'hide', 'flag_for_review'];
      if (!validActions.includes(action)) {
        throw new Error('Invalid moderation action');
      }

      // Update review moderation status
      await this.db.query(`
        UPDATE reviews 
        SET 
          is_public = $2,
          moderated_at = NOW(),
          moderated_by = $3
        WHERE id = $1
      `, [reviewId, action === 'approve', moderatorId]);

      // Log moderation action
      await this.db.query(`
        INSERT INTO review_moderation_log (
          review_id, moderator_id, action, reason
        ) VALUES ($1, $2, $3, $4)
      `, [reviewId, moderatorId, action, reason]);

      return { success: true };

    } catch (error) {
      console.error('Moderate review error:', error);
      throw new Error(`Failed to moderate review: ${error.message}`);
    }
  }

  // =================================================================
  // CONTRACTOR REPUTATION MANAGEMENT
  // =================================================================

  /**
   * Update contractor's overall ratings and statistics
   */
  async updateContractorRatings(contractorId) {
    try {
      const stats = await this.getContractorReviewStats(contractorId);

      await this.db.query(`
        UPDATE contractor_profiles 
        SET 
          average_rating = $2,
          total_reviews = $3,
          recommendation_rate = $4,
          updated_at = NOW()
        WHERE user_id = $1
      `, [
        contractorId, 
        stats.averageRating, 
        stats.totalReviews, 
        stats.recommendationRate
      ]);

      // Update contractor badges based on performance
      await this.updateContractorBadges(contractorId, stats);

      return stats;

    } catch (error) {
      console.error('Update contractor ratings error:', error);
      throw new Error('Failed to update contractor ratings');
    }
  }

  /**
   * Award badges to contractors based on performance
   */
  async updateContractorBadges(contractorId, stats) {
    try {
      const badges = [];

      // Excellence badges
      if (stats.averageRating >= 4.8 && stats.totalReviews >= 50) {
        badges.push('top_rated_pro');
      } else if (stats.averageRating >= 4.5 && stats.totalReviews >= 25) {
        badges.push('highly_rated');
      }

      // Experience badges
      if (stats.totalReviews >= 100) {
        badges.push('experienced_pro');
      } else if (stats.totalReviews >= 50) {
        badges.push('established_contractor');
      }

      // Recommendation badge
      if (stats.recommendationRate >= 95 && stats.totalReviews >= 20) {
        badges.push('highly_recommended');
      }

      // Quality badges
      const qualityStats = await this.getContractorQualityMetrics(contractorId);
      if (qualityStats.qualityScore >= 4.8) {
        badges.push('quality_excellence');
      }

      if (qualityStats.communicationScore >= 4.8) {
        badges.push('communication_excellence');
      }

      if (qualityStats.timelinessScore >= 4.8) {
        badges.push('timeliness_excellence');
      }

      // Update contractor badges
      await this.db.query(`
        UPDATE contractor_profiles 
        SET contractor_badges = $2
        WHERE user_id = $1
      `, [contractorId, JSON.stringify(badges)]);

      return badges;

    } catch (error) {
      console.error('Update contractor badges error:', error);
      return [];
    }
  }

  /**
   * Get contractor quality metrics
   */
  async getContractorQualityMetrics(contractorId) {
    try {
      const result = await this.db.query(`
        SELECT 
          AVG(quality_rating) as quality_score,
          AVG(communication_rating) as communication_score,
          AVG(timeliness_rating) as timeliness_score,
          COUNT(*) as review_count
        FROM reviews 
        WHERE reviewee_id = $1 AND is_public = true
      `, [contractorId]);

      const metrics = result.rows[0];
      return {
        qualityScore: parseFloat(metrics.quality_score) || 0,
        communicationScore: parseFloat(metrics.communication_score) || 0,
        timelinessScore: parseFloat(metrics.timeliness_score) || 0,
        reviewCount: parseInt(metrics.review_count) || 0
      };

    } catch (error) {
      console.error('Get quality metrics error:', error);
      return { qualityScore: 0, communicationScore: 0, timelinessScore: 0, reviewCount: 0 };
    }
  }

  // =================================================================
  // UTILITY FUNCTIONS
  // =================================================================

  /**
   * Verify job completion and participant validity
   */
  async verifyJobAndParticipants(jobId, reviewerId, revieweeId) {
    try {
      const result = await this.db.query(`
        SELECT 
          customer_id, contractor_id, status,
          approved_at, completed_at
        FROM jobs 
        WHERE id = $1
      `, [jobId]);

      if (result.rows.length === 0) {
        return { valid: false, reason: 'Job not found' };
      }

      const job = result.rows[0];

      // Check if job is completed
      if (job.status !== 'approved') {
        return { valid: false, reason: 'Job must be completed and approved before reviewing' };
      }

      // Verify participants
      const validParticipant = (
        (reviewerId === job.customer_id && revieweeId === job.contractor_id) ||
        (reviewerId === job.contractor_id && revieweeId === job.customer_id)
      );

      if (!validParticipant) {
        return { valid: false, reason: 'Invalid reviewer or reviewee for this job' };
      }

      return { valid: true };

    } catch (error) {
      console.error('Verify job participants error:', error);
      return { valid: false, reason: 'Verification failed' };
    }
  }

  /**
   * Get contractor average rating
   */
  async getContractorAverageRating(contractorId) {
    try {
      const result = await this.db.query(`
        SELECT AVG(overall_rating) as avg_rating
        FROM reviews 
        WHERE reviewee_id = $1 AND is_public = true
      `, [contractorId]);

      return parseFloat(result.rows[0].avg_rating) || 0;

    } catch (error) {
      console.error('Get average rating error:', error);
      return 0;
    }
  }

  /**
   * Save review photos
   */
  async saveReviewPhotos(reviewId, photos) {
    try {
      for (const photo of photos) {
        await this.db.query(`
          INSERT INTO review_photos (
            review_id, photo_url, caption, photo_type
          ) VALUES ($1, $2, $3, $4)
        `, [reviewId, photo.url, photo.caption || null, photo.type || 'general']);
      }
    } catch (error) {
      console.error('Save review photos error:', error);
    }
  }

  /**
   * Get review photos
   */
  async getReviewPhotos(reviewId) {
    try {
      const result = await this.db.query(`
        SELECT photo_url, caption, photo_type
        FROM review_photos 
        WHERE review_id = $1
        ORDER BY created_at ASC
      `, [reviewId]);

      return result.rows.map(row => ({
        url: row.photo_url,
        caption: row.caption,
        type: row.photo_type
      }));

    } catch (error) {
      console.error('Get review photos error:', error);
      return [];
    }
  }

  /**
   * Set review visibility
   */
  async setReviewVisibility(reviewId, isPublic) {
    try {
      await this.db.query(`
        UPDATE reviews 
        SET is_public = $2
        WHERE id = $1
      `, [reviewId, isPublic]);

      return { success: true };

    } catch (error) {
      console.error('Set review visibility error:', error);
      throw new Error('Failed to update review visibility');
    }
  }

  /**
   * Get reviews requiring moderation
   */
  async getReviewsForModeration(options = {}) {
    try {
      const { page = 1, limit = 20, flagType = null } = options;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE r.moderated_at IS NULL';
      const params = [limit, offset];

      if (flagType) {
        whereClause += ' AND EXISTS (SELECT 1 FROM review_quality_flags f WHERE f.review_id = r.id AND f.flag_type = $3)';
        params.push(flagType);
      }

      const result = await this.db.query(`
        SELECT 
          r.*,
          reviewer.first_name as reviewer_name,
          reviewee.first_name as reviewee_name,
          j.title as job_title,
          ARRAY_AGG(f.flag_type) as flags
        FROM reviews r
        JOIN users reviewer ON r.reviewer_id = reviewer.id
        JOIN users reviewee ON r.reviewee_id = reviewee.id
        JOIN jobs j ON r.job_id = j.id
        LEFT JOIN review_quality_flags f ON r.id = f.review_id
        ${whereClause}
        GROUP BY r.id, reviewer.first_name, reviewee.first_name, j.title
        ORDER BY r.created_at ASC
        LIMIT $1 OFFSET $2
      `, params);

      return result.rows.map(row => ({
        id: row.id,
        jobTitle: row.job_title,
        reviewerName: row.reviewer_name,
        revieweeName: row.reviewee_name,
        overallRating: row.overall_rating,
        reviewText: row.review_text,
        flags: row.flags.filter(f => f !== null),
        createdAt: row.created_at
      }));

    } catch (error) {
      console.error('Get reviews for moderation error:', error);
      throw new Error('Failed to get reviews for moderation');
    }
  }
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  ReviewService
};