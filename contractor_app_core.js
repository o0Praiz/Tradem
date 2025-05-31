// Contractor Mobile App - Core Implementation
// Based on contractor_mobile_app_v1.md specifications

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider } from 'react-redux';
import { store } from './src/store/contractorStore';
import { AuthProvider } from './src/contexts/AuthContext';
import BackgroundJob from '@react-native-async-storage/async-storage';

// Core Screens
import DashboardScreen from './src/screens/DashboardScreen';
import JobsScreen from './src/screens/JobsScreen';
import MyWorkScreen from './src/screens/MyWorkScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import JobDetailsScreen from './src/screens/JobDetailsScreen';
import ActiveJobScreen from './src/screens/ActiveJobScreen';

// Navigation Setup
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Main Tab Navigator for Contractors
function ContractorTabs() {
  const [newJobsCount, setNewJobsCount] = useState(0);

  useEffect(() => {
    fetchNewJobsCount();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Dashboard') iconName = 'home';
          else if (route.name === 'Jobs') iconName = 'briefcase';
          else if (route.name === 'MyWork') iconName = 'tool';
          else if (route.name === 'Earnings') iconName = 'dollar-sign';
          else if (route.name === 'Profile') iconName = 'user';
          
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen 
        name="Jobs" 
        component={JobsScreen}
        options={{
          tabBarLabel: 'Find Work',
          tabBarBadge: newJobsCount > 0 ? newJobsCount : null
        }}
      />
      <Tab.Screen name="MyWork" component={MyWorkScreen} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Dashboard Screen Implementation
function DashboardScreen() {
  const [contractorStatus, setContractorStatus] = useState('available');
  const [weeklyStats, setWeeklyStats] = useState({
    earned: 0,
    jobsCompleted: 0,
    rating: 0,
    completionRate: 0
  });
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [opportunities, setOpportunities] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    setupLocationTracking();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch weekly stats
      const statsResponse = await fetch('/api/v1/contractors/stats/weekly', {
        headers: { 'Authorization': `Bearer ${await getAuthToken()}` }
      });
      const stats = await statsResponse.json();
      setWeeklyStats(stats);

      // Fetch today's schedule
      const scheduleResponse = await fetch('/api/v1/contractors/schedule/today', {
        headers: { 'Authorization': `Bearer ${await getAuthToken()}` }
      });
      const schedule = await scheduleResponse.json();
      setTodaySchedule(schedule);

      // Fetch new opportunities
      const opportunitiesResponse = await fetch('/api/v1/jobs?available=true&limit=3', {
        headers: { 'Authorization': `Bearer ${await getAuthToken()}` }
      });
      const jobsData = await opportunitiesResponse.json();
      setOpportunities(jobsData.data);

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  const setupLocationTracking = () => {
    // Background location tracking for contractor
    if (contractorStatus === 'available') {
      startLocationTracking();
    }
  };

  const toggleAvailability = async () => {
    const newStatus = contractorStatus === 'available' ? 'unavailable' : 'available';
    
    try {
      await fetch('/api/v1/contractors/availability', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      setContractorStatus(newStatus);
      
      if (newStatus === 'available') {
        startLocationTracking();
      } else {
        stopLocationTracking();
      }
    } catch (error) {
      console.error('Failed to update availability:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header with Availability Toggle */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning, Mike</Text>
            <TouchableOpacity 
              style={[styles.statusToggle, { 
                backgroundColor: contractorStatus === 'available' ? '#22c55e' : '#6b7280' 
              }]}
              onPress={toggleAvailability}
            >
              <Text style={styles.statusText}>
                {contractorStatus === 'available' ? '✅ Available' : '⭕ Unavailable'}
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.notificationButton}>
              <Icon name="bell" size={24} color="#f97316" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Weekly Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>This Week's Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>${weeklyStats.earned}</Text>
              <Text style={styles.statLabel}>Earned</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{weeklyStats.jobsCompleted}</Text>
              <Text style={styles.statLabel}>Jobs</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{weeklyStats.rating}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{weeklyStats.completionRate}%</Text>
              <Text style={styles.statLabel}>Complete</Text>
            </View>
          </View>
        </View>

        {/* Today's Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          {todaySchedule.map(job => (
            <ScheduledJobCard key={job.id} job={job} />
          ))}
          {todaySchedule.length === 0 && (
            <Text style={styles.emptyText}>No jobs scheduled for today</Text>
          )}
        </View>

        {/* New Opportunities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New Opportunities ({opportunities.length})</Text>
          {opportunities.map(job => (
            <OpportunityCard key={job.id} job={job} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Scheduled Job Card Component
function ScheduledJobCard({ job }) {
  const handleNavigate = () => {
    navigation.navigate('ActiveJob', { jobId: job.id });
  };

  const handleContact = () => {
    // Open messaging or call customer
    const customerPhone = job.customer.phone;
    Linking.openURL(`tel:${customerPhone}`);
  };

  return (
    <View style={styles.jobCard}>
      <View style={styles.jobTime}>
        <Text style={styles.timeText}>
          {job.preferredTimeStart} - {job.preferredTimeEnd}
        </Text>
      </View>
      
      <View style={styles.jobInfo}>
        <Text style={styles.jobTitle}>{job.title}</Text>
        <Text style={styles.jobAddress}>
          📍 {job.serviceAddress.addressLine1} ({job.distance} mi away)
        </Text>
        <Text style={styles.customerName}>
          👤 {job.customer.firstName} {job.customer.lastName}
        </Text>
      </View>

      <View style={styles.jobActions}>
        <TouchableOpacity 
          style={styles.actionButtonPrimary}
          onPress={handleNavigate}
        >
          <Text style={styles.actionTextPrimary}>Navigate</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButtonSecondary}
          onPress={handleContact}
        >
          <Text style={styles.actionTextSecondary}>Contact</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButtonSecondary}
          onPress={() => navigation.navigate('JobDetails', { jobId: job.id })}
        >
          <Text style={styles.actionTextSecondary}>Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Opportunity Card Component
function OpportunityCard({ job }) {
  const handleViewDetails = () => {
    navigation.navigate('JobDetails', { jobId: job.id });
  };

  const handleQuickApply = async () => {
    try {
      const response = await fetch(`/api/v1/jobs/${job.id}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        },
        body: JSON.stringify({
          quotedPrice: job.estimatedCost,
          message: 'I can handle this job efficiently with my experience.',
          estimatedCompletionDate: new Date().toISOString().split('T')[0]
        })
      });

      if (response.ok) {
        Alert.alert('Success', 'Application submitted successfully!');
      } else {
        throw new Error('Failed to apply');
      }
    } catch (error) {
      console.error('Quick apply error:', error);
      Alert.alert('Error', 'Failed to submit application');
    }
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'emergency': return '#ef4444';
      case 'high': return '#f59e0b';
      case 'medium': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  return (
    <View style={styles.opportunityCard}>
      <View style={styles.opportunityHeader}>
        <Text style={styles.opportunityTitle}>{job.title}</Text>
        <View style={[styles.urgencyBadge, { backgroundColor: getUrgencyColor(job.priority) }]}>
          <Text style={styles.urgencyText}>{job.priority}</Text>
        </View>
      </View>
      
      <View style={styles.opportunityDetails}>
        <Text style={styles.opportunityPrice}>
          💰 ${job.estimatedCost} | 📍 {job.distance} mi away
        </Text>
        <Text style={styles.opportunityTime}>
          ⏰ {job.preferredDate} {job.preferredTimeStart}
        </Text>
      </View>

      <View style={styles.opportunityActions}>
        <TouchableOpacity 
          style={styles.viewDetailsButton}
          onPress={handleViewDetails}
        >
          <Text style={styles.viewDetailsText}>View Details</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.quickApplyButton}
          onPress={handleQuickApply}
        >
          <Text style={styles.quickApplyText}>Quick Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Active Job Screen for work in progress
function ActiveJobScreen({ route }) {
  const { jobId } = route.params;
  const [job, setJob] = useState(null);
  const [timer, setTimer] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [workPhotos, setWorkPhotos] = useState([]);
  const [materialsUsed, setMaterialsUsed] = useState([]);

  useEffect(() => {
    fetchJobDetails();
    setupTimer();
  }, []);

  const fetchJobDetails = async () => {
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${await getAuthToken()}` }
      });
      const jobData = await response.json();
      setJob(jobData);
    } catch (error) {
      console.error('Failed to fetch job details:', error);
    }
  };

  const startTimer = () => {
    setIsTimerRunning(true);
    // Start background timer
  };

  const pauseTimer = () => {
    setIsTimerRunning(false);
    // Pause background timer
  };

  const takePhoto = async () => {
    try {
      const photo = await ImagePicker.openCamera({
        width: 800,
        height: 600,
        cropping: false,
        includeBase64: false,
      });

      // Upload photo to server
      const formData = new FormData();
      formData.append('photo', {
        uri: photo.path,
        type: photo.mime,
        name: `job_${jobId}_${Date.now()}.jpg`
      });
      formData.append('jobId', jobId);
      formData.append('photoType', 'progress');

      const response = await fetch('/api/v1/jobs/photos', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${await getAuthToken()}`
        },
        body: formData
      });

      if (response.ok) {
        const photoData = await response.json();
        setWorkPhotos([...workPhotos, photoData]);
      }
    } catch (error) {
      console.error('Photo upload error:', error);
    }
  };

  const completeJob = async () => {
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        },
        body: JSON.stringify({
          workDuration: timer,
          materialsUsed,
          completionNotes: 'Job completed successfully'
        })
      });

      if (response.ok) {
        Alert.alert('Success', 'Job marked as completed!');
        navigation.goBack();
      }
    } catch (error) {
      console.error('Complete job error:', error);
    }
  };

  if (!job) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Job Header */}
        <View style={styles.activeJobHeader}>
          <Text style={styles.activeJobTitle}>{job.title}</Text>
          <View style={styles.timerContainer}>
            <Text style={styles.timerText}>
              ⏱️ {timer.hours}h {timer.minutes}m
            </Text>
            <TouchableOpacity 
              style={[styles.timerButton, { 
                backgroundColor: isTimerRunning ? '#ef4444' : '#22c55e' 
              }]}
              onPress={isTimerRunning ? pauseTimer : startTimer}
            >
              <Text style={styles.timerButtonText}>
                {isTimerRunning ? 'Pause' : 'Start'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Job Progress Checklist */}
        <View style={styles.progressSection}>
          <Text style={styles.sectionTitle}>Job Progress</Text>
          <View style={styles.checklist}>
            <ChecklistItem title="Arrived on time" completed={true} />
            <ChecklistItem title="Diagnosed issue" completed={true} />
            <ChecklistItem title="Took before photos" completed={true} />
            <ChecklistItem title="Installing new faucet" completed={false} />
            <ChecklistItem title="Testing & cleanup" completed={false} />
          </View>
        </View>

        {/* Work Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Work Photos</Text>
          <View style={styles.photoGrid}>
            {workPhotos.map((photo, index) => (
              <Image key={index} source={{ uri: photo.url }} style={styles.workPhoto} />
            ))}
            <TouchableOpacity style={styles.addPhotoButton} onPress={takePhoto}>
              <Icon name="plus" size={24} color="#64748b" />
              <Text style={styles.addPhotoText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Materials Used */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Materials Used</Text>
          {materialsUsed.map((material, index) => (
            <View key={index} style={styles.materialItem}>
              <Text style={styles.materialName}>{material.name}</Text>
              <Text style={styles.materialCost}>${material.cost}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.addMaterialButton}>
            <Text style={styles.addMaterialText}>+ Add Material</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.updateButton}>
            <Text style={styles.updateButtonText}>Update Customer</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.completeButton} onPress={completeJob}>
            <Text style={styles.completeButtonText}>Complete Job</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Checklist Item Component
function ChecklistItem({ title, completed }) {
  return (
    <View style={styles.checklistItem}>
      <Icon 
        name={completed ? "check-circle" : "circle"} 
        size={20} 
        color={completed ? "#22c55e" : "#cbd5e1"} 
      />
      <Text style={[styles.checklistText, { 
        color: completed ? "#1e293b" : "#64748b",
        textDecorationLine: completed ? "line-through" : "none"
      }]}>
        {title}
      </Text>
    </View>
  );
}

// Location tracking utilities
const startLocationTracking = () => {
  // Implement background location tracking
  BackgroundJob.start({
    taskName: 'location-tracking',
    taskTitle: 'Tracking location for job assignments',
    taskDesc: 'Keeping your location updated for better job matching',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    }
  });
};

const stopLocationTracking = () => {
  BackgroundJob.stop();
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  statusToggle: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  statsContainer: {
    padding: 16,
    backgroundColor: 'white',
    marginVertical: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f97316',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  section: {
    padding: 16,
    backgroundColor: 'white',
    marginVertical: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
  },
  jobCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f97316',
  },
  jobTime: {
    marginBottom: 8,
  },
  timeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  jobInfo: {
    marginBottom: 12,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  jobAddress: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 4,
  },
  customerName: {
    color: '#64748b',
    fontSize: 14,
  },
  jobActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButtonPrimary: {
    backgroundColor: '#f97316',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionTextPrimary: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionTextSecondary: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  opportunityCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  opportunityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  opportunityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  urgencyText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  opportunityDetails: {
    marginBottom: 12,
  },
  opportunityPrice: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  opportunityTime: {
    color: '#64748b',
    fontSize: 14,
  },
  opportunityActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewDetailsButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  viewDetailsText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '500',
  },
  quickApplyButton: {
    flex: 1,
    backgroundColor: '#f97316',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  quickApplyText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default function ContractorApp() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen 
              name="ContractorTabs" 
              component={ContractorTabs} 
              options={{ headerShown: false }}
            />
            <Stack.Screen name="JobDetails" component={JobDetailsScreen} />
            <Stack.Screen name="ActiveJob" component={ActiveJobScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </Provider>
  );
}