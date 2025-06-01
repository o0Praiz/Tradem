// CustomerApp/src/components/jobs/JobCard.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import moment from 'moment';

// Design System
import { colors, spacing, typography, shadows, borderRadius } from '../../design-system';

// Types
import { Job, JobStatus } from '../../types/Job';

interface JobCardProps {
  job: Job;
  onPress: () => void;
  showActions?: boolean;
  variant?: 'summary' | 'detailed' | 'compact';
}

const JobCard: React.FC<JobCardProps> = ({
  job,
  onPress,
  showActions = false,
  variant = 'summary'
}) => {
  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'posted':
        return colors.primary[500];
      case 'assigned':
        return colors.warning[500];
      case 'in_progress':
        return colors.success[500];
      case 'completed':
        return colors.neutral[500];
      case 'cancelled':
        return colors.error[500];
      default:
        return colors.neutral[400];
    }
  };

  const getStatusText = (status: JobStatus) => {
    switch (status) {
      case 'posted':
        return 'Finding Contractors';
      case 'assigned':
        return 'Contractor Assigned';
      case 'in_progress':
        return 'Work in Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case 'posted':
        return 'search';
      case 'assigned':
        return 'person';
      case 'in_progress':
        return 'build';
      case 'completed':
        return 'checkmark-circle';
      case 'cancelled':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

  const getTradeIcon = (tradeCategory: string) => {
    switch (tradeCategory) {
      case 'plumbing':
        return 'water';
      case 'electrical':
        return 'flash';
      case 'hvac':
        return 'snow';
      case 'carpentry':
        return 'hammer';
      case 'painting':
        return 'brush';
      case 'general_handyman':
        return 'build';
      default:
        return 'construct';
    }
  };

  const formatDate = (date: string) => {
    const jobDate = moment(date);
    const now = moment();
    
    if (jobDate.isSame(now, 'day')) {
      return 'Today';
    } else if (jobDate.isSame(now.clone().add(1, 'day'), 'day')) {
      return 'Tomorrow';
    } else if (jobDate.isAfter(now) && jobDate.diff(now, 'days') <= 7) {
      return jobDate.format('dddd');
    } else {
      return jobDate.format('MMM D');
    }
  };

  const formatTime = (time: string) => {
    return moment(time, 'HH:mm:ss').format('h:mm A');
  };

  if (variant === 'compact') {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress}>
        <View style={styles.compactHeader}>
          <View style={styles.compactTitleRow}>
            <Ionicons 
              name={getTradeIcon(job.tradeCategory)} 
              size={16} 
              color={colors.primary[500]} 
            />
            <Text style={styles.compactTitle} numberOfLines={1}>
              {job.title}
            </Text>
          </View>
          
          <View style={[styles.compactStatus, { backgroundColor: getStatusColor(job.status) }]}>
            <Text style={styles.compactStatusText}>
              {getStatusText(job.status)}
            </Text>
          </View>
        </View>
        
        <Text style={styles.compactPrice}>
          ${job.finalPrice || job.quotedPrice || job.estimatedCost}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardContent}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.titleSection}>
            <View style={styles.titleRow}>
              <Ionicons 
                name={getTradeIcon(job.tradeCategory)} 
                size={20} 
                color={colors.primary[500]} 
              />
              <Text style={styles.title} numberOfLines={1}>
                {job.title}
              </Text>
            </View>
            
            <View style={styles.metaRow}>
              {job.preferredDate && (
                <View style={styles.metaItem}>
                  <Ionicons name="calendar" size={14} color={colors.neutral[500]} />
                  <Text style={styles.metaText}>
                    {formatDate(job.preferredDate)}
                    {job.preferredTimeStart && `, ${formatTime(job.preferredTimeStart)}`}
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          <View style={styles.statusSection}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) }]}>
              <Ionicons 
                name={getStatusIcon(job.status)} 
                size={12} 
                color={colors.white} 
              />
              <Text style={styles.statusText}>
                {getStatusText(job.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* Contractor Info (if assigned) */}
        {job.contractor && (
          <View style={styles.contractorSection}>
            <View style={styles.contractorInfo}>
              <Ionicons name="person" size={16} color={colors.neutral[600]} />
              <Text style={styles.contractorName}>
                {job.contractor.businessName || `${job.contractor.firstName} ${job.contractor.lastName}`}
              </Text>
              {job.contractor.rating && (
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={12} color={colors.warning[400]} />
                  <Text style={styles.ratingText}>
                    {job.contractor.rating.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Location */}
        <View style={styles.locationSection}>
          <Ionicons name="location" size={14} color={colors.neutral[500]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {job.serviceAddress?.addressLine1}, {job.serviceAddress?.city}
          </Text>
        </View>

        {/* Price and Actions */}
        <View style={styles.footerRow}>
          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>
              {job.finalPrice ? 'Final Price' : job.quotedPrice ? 'Quoted' : 'Estimated'}
            </Text>
            <Text style={styles.priceAmount}>
              ${job.finalPrice || job.quotedPrice || job.estimatedCost}
            </Text>
          </View>
          
          {showActions && (
            <View style={styles.actionsSection}>
              {job.status === 'in_progress' && (
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Track</Text>
                </TouchableOpacity>
              )}
              
              {job.status === 'completed' && !job.reviewed && (
                <TouchableOpacity style={[styles.actionButton, styles.reviewButton]}>
                  <Text style={[styles.actionButtonText, styles.reviewButtonText]}>
                    Review
                  </Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={styles.detailsButton}>
                <Text style={styles.detailsButtonText}>Details</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Progress Indicator (for in-progress jobs) */}
        {job.status === 'in_progress' && job.progress && (
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${job.progress.percentage}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {job.progress.currentStep}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
    ...shadows.base,
  },
  
  compactCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  
  cardContent: {
    padding: spacing[4],
  },
  
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  
  compactTitle: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.neutral[900],
    marginLeft: spacing[2],
    flex: 1,
  },
  
  compactStatus: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
  },
  
  compactStatusText: {
    fontSize: typography.fontSize.xs,
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
  },
  
  compactPrice: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.success[600],
  },
  
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  
  titleSection: {
    flex: 1,
    marginRight: spacing[3],
  },
  
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  
  title: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.semibold,
    color: colors.neutral[900],
    marginLeft: spacing[2],
    flex: 1,
  },
  
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  metaText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    marginLeft: spacing[1],
  },
  
  statusSection: {
    alignItems: 'flex-end',
  },
  
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    gap: spacing[1],
  },
  
  statusText: {
    fontSize: typography.fontSize.xs,
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
  },
  
  contractorSection: {
    marginBottom: spacing[3],
  },
  
  contractorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[50],
    padding: spacing[2],
    borderRadius: borderRadius.md,
  },
  
  contractorName: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.neutral[900],
    marginLeft: spacing[2],
    flex: 1,
  },
  
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  
  ratingText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[700],
  },
  
  locationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  
  locationText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    marginLeft: spacing[2],
    flex: 1,
  },
  
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  
  priceSection: {
    flex: 1,
  },
  
  priceLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
    fontFamily: typography.fontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  
  priceAmount: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.success[600],
  },
  
  actionsSection: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  
  actionButton: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
  },
  
  actionButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
  },
  
  reviewButton: {
    backgroundColor: colors.warning[500],
  },
  
  reviewButtonText: {
    color: colors.white,
  },
  
  detailsButton: {
    borderWidth: 1,
    borderColor: colors.neutral[300],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
  },
  
  detailsButtonText: {
    color: colors.neutral[700],
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
  },
  
  progressSection: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  
  progressBar: {
    height: 4,
    backgroundColor: colors.neutral[200],
    borderRadius: 2,
    marginBottom: spacing[2],
  },
  
  progressFill: {
    height: '100%',
    backgroundColor: colors.success[500],
    borderRadius: 2,
  },
  
  progressText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    textAlign: 'center',
  },
});

export default JobCard;