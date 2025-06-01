// CustomerApp/src/screens/HomeScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';

// Custom Components
import { JobCard } from '../components/jobs/JobCard';
import { ServiceCard } from '../components/services/ServiceCard';
import { NotificationBadge } from '../components/common/NotificationBadge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

// Hooks and Services
import { useJobs } from '../hooks/useJobs';
import { useNotifications } from '../hooks/useNotifications';
import { colors, spacing, typography, shadows } from '../design-system';

// Types
import { RootState } from '../store';
import { Job } from '../types/Job';

interface HomeScreenProps {}

const HomeScreen: React.FC<HomeScreenProps> = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  
  // State
  const [refreshing, setRefreshing] = useState(false);
  
  // Selectors
  const user = useSelector((state: RootState) => state.auth.user);
  const { recentJobs, isLoading } = useJobs();
  const { unreadCount } = useNotifications();

  // Effects
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    // Load recent jobs, notifications, recommendations
    try {
      // This would dispatch actions to load data
      // dispatch(loadRecentJobs());
      // dispatch(loadRecommendations());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handlePostJob = () => {
    navigation.navigate('PostJob');
  };

  const handleEmergencyService = () => {
    navigation.navigate('PostJob', { urgency: 'emergency' });
  };

  const handleViewJob = (job: Job) => {
    navigation.navigate('JobDetails', { jobId: job.id });
  };

  const handleServicePress = (serviceType: string) => {
    navigation.navigate('PostJob', { tradeCategory: serviceType });
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.menuButton}>
              <Ionicons name="menu" size={24} color={colors.neutral[700]} />
            </TouchableOpacity>
            <View>
              <Text style={styles.welcomeText}>Welcome back,</Text>
              <Text style={styles.userName}>{user?.firstName || 'User'}</Text>
            </View>
          </View>
          
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.notificationButton}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={24} color={colors.neutral[700]} />
              {unreadCount > 0 && <NotificationBadge count={unreadCount} />}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => navigation.navigate('Profile')}
            >
              <Ionicons name="person-circle-outline" size={28} color={colors.primary[500]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <View style={styles.quickActionsCard}>
            <View style={styles.quickActionsHeader}>
              <Ionicons name="build" size={24} color={colors.primary[500]} />
              <Text style={styles.quickActionsTitle}>Need a Repair?</Text>
            </View>
            
            <View style={styles.quickActionButtons}>
              <TouchableOpacity style={styles.primaryButton} onPress={handlePostJob}>
                <Text style={styles.primaryButtonText}>Post a Job</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.emergencyButton} onPress={handleEmergencyService}>
                <Ionicons name="flash" size={16} color={colors.white} />
                <Text style={styles.emergencyButtonText}>Emergency</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Recent Jobs */}
        {recentJobs && recentJobs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📍 Your Recent Jobs</Text>
              <TouchableOpacity onPress={() => navigation.navigate('MyJobs')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            
            {recentJobs.slice(0, 2).map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onPress={() => handleViewJob(job)}
                showActions={true}
                variant="summary"
              />
            ))}
          </View>
        )}

        {/* Service Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Popular Services</Text>
          
          <View style={styles.servicesGrid}>
            <ServiceCard
              icon="water"
              title="Plumbing"
              subtitle="Pipes, fixtures, repairs"
              color={colors.primary[500]}
              onPress={() => handleServicePress('plumbing')}
            />
            
            <ServiceCard
              icon="flash"
              title="Electrical"
              subtitle="Wiring, outlets, fixtures"
              color={colors.warning[500]}
              onPress={() => handleServicePress('electrical')}
            />
            
            <ServiceCard
              icon="snow"
              title="HVAC"
              subtitle="Heating & cooling"
              color={colors.secondary[500]}
              onPress={() => handleServicePress('hvac')}
            />
            
            <ServiceCard
              icon="hammer"
              title="Carpentry"
              subtitle="Framing, finish work"
              color={colors.success[600]}
              onPress={() => handleServicePress('carpentry')}
            />
            
            <ServiceCard
              icon="brush"
              title="Painting"
              subtitle="Interior & exterior"
              color={colors.error[500]}
              onPress={() => handleServicePress('painting')}
            />
            
            <ServiceCard
              icon="home"
              title="General"
              subtitle="Handyman services"
              color={colors.neutral[600]}
              onPress={() => handleServicePress('general_handyman')}
            />
          </View>
        </View>

        {/* Recommendations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Recommended for You</Text>
          
          <View style={styles.recommendationCard}>
            <View style={styles.recommendationHeader}>
              <Ionicons name="snow" size={24} color={colors.secondary[500]} />
              <Text style={styles.recommendationTitle}>HVAC Maintenance Special</Text>
            </View>
            
            <Text style={styles.recommendationDescription}>
              Winter prep service starting at $89. Highly rated contractors in your area.
            </Text>
            
            <View style={styles.recommendationFooter}>
              <View style={styles.recommendationMeta}>
                <Ionicons name="star" size={14} color={colors.warning[400]} />
                <Text style={styles.recommendationRating}>4.9★</Text>
                <Text style={styles.recommendationDistance}>| 15 min away</Text>
              </View>
              
              <TouchableOpacity style={styles.recommendationButton}>
                <Text style={styles.recommendationButtonText}>Learn More</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Safety padding for bottom tabs */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  
  scrollView: {
    flex: 1,
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.white,
  },
  
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  menuButton: {
    marginRight: spacing[3],
  },
  
  welcomeText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    fontFamily: typography.fontFamily.regular,
  },
  
  userName: {
    fontSize: typography.fontSize.lg,
    color: colors.neutral[900],
    fontFamily: typography.fontFamily.semibold,
  },
  
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  
  notificationButton: {
    position: 'relative',
  },
  
  profileButton: {},
  
  quickActionsContainer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  
  quickActionsCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing[4],
    ...shadows.base,
  },
  
  quickActionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  
  quickActionsTitle: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.semibold,
    color: colors.neutral[900],
    marginLeft: spacing[2],
  },
  
  quickActionButtons: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary[500],
    paddingVertical: spacing[3],
    borderRadius: 12,
    alignItems: 'center',
  },
  
  primaryButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.semibold,
  },
  
  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error[500],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: 12,
    gap: spacing[1],
  },
  
  emergencyButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.semibold,
  },
  
  section: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[6],
  },
  
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.semibold,
    color: colors.neutral[900],
  },
  
  seeAllText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[500],
    fontFamily: typography.fontFamily.medium,
  },
  
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  
  recommendationCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing[4],
    ...shadows.base,
  },
  
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  
  recommendationTitle: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.semibold,
    color: colors.neutral[900],
    marginLeft: spacing[2],
  },
  
  recommendationDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
    marginBottom: spacing[3],
  },
  
  recommendationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  recommendationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  recommendationRating: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[700],
    marginLeft: spacing[1],
  },
  
  recommendationDistance: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
  },
  
  recommendationButton: {
    backgroundColor: colors.primary[100],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 8,
  },
  
  recommendationButtonText: {
    color: colors.primary[600],
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
  },
  
  bottomPadding: {
    height: spacing[8],
  },
});

export default HomeScreen;