// Customer Mobile App - Core Implementation
// Based on customer_mobile_app_v1.md specifications

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider } from 'react-redux';
import { store } from './src/store/store';
import { AuthProvider } from './src/contexts/AuthContext';

// Core Screens
import HomeScreen from './src/screens/HomeScreen';
import MyJobsScreen from './src/screens/MyJobsScreen';
import MessagesScreen from './src/screens/MessagesScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PostJobScreen from './src/screens/PostJobScreen';
import JobDetailsScreen from './src/screens/JobDetailsScreen';

// Navigation Setup
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Main Tab Navigator
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = 'home';
          else if (route.name === 'MyJobs') iconName = 'briefcase';
          else if (route.name === 'Messages') iconName = 'message-circle';
          else if (route.name === 'Profile') iconName = 'user';
          
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#0ea5e9',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="MyJobs" component={MyJobsScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Root Stack Navigator
function RootStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="MainTabs" 
        component={MainTabs} 
        options={{ headerShown: false }}
      />
      <Stack.Screen name="PostJob" component={PostJobScreen} />
      <Stack.Screen name="JobDetails" component={JobDetailsScreen} />
    </Stack.Navigator>
  );
}

// Home Screen Implementation
function HomeScreen() {
  const [user, setUser] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);

  useEffect(() => {
    // Fetch user data and recent jobs
    fetchUserData();
    fetchRecentJobs();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/v1/users/profile', {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`
        }
      });
      const userData = await response.json();
      setUser(userData);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
    }
  };

  const fetchRecentJobs = async () => {
    try {
      const response = await fetch('/api/v1/jobs?limit=5', {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`
        }
      });
      const jobsData = await response.json();
      setRecentJobs(jobsData.data);
    } catch (error) {
      console.error('Failed to fetch recent jobs:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>
            Welcome Back, {user?.firstName}
          </Text>
          <TouchableOpacity style={styles.notificationButton}>
            <Icon name="bell" size={24} color="#0ea5e9" />
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.postJobButton}
            onPress={() => navigation.navigate('PostJob')}
          >
            <Icon name="tool" size={24} color="white" />
            <Text style={styles.postJobText}>Post a Job</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.emergencyButton}>
            <Icon name="zap" size={24} color="white" />
            <Text style={styles.emergencyText}>Emergency</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Jobs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Recent Jobs</Text>
          {recentJobs.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
        </View>

        {/* Recommended Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recommended for You</Text>
          <RecommendationCard />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Job Card Component
function JobCard({ job }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'in_progress': return '#22c55e';
      case 'pending': return '#f59e0b';
      case 'completed': return '#6b7280';
      default: return '#3b82f6';
    }
  };

  return (
    <TouchableOpacity style={styles.jobCard}>
      <View style={styles.jobHeader}>
        <Text style={styles.jobTitle}>{job.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) }]}>
          <Text style={styles.statusText}>{job.status}</Text>
        </View>
      </View>
      
      <Text style={styles.jobDate}>
        {job.preferredDate} at {job.preferredTimeStart}
      </Text>
      
      {job.contractor && (
        <Text style={styles.contractorName}>
          {job.contractor.businessName}
        </Text>
      )}
      
      <View style={styles.jobActions}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// Post Job Screen Implementation
function PostJobScreen({ navigation }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [jobData, setJobData] = useState({
    title: '',
    description: '',
    tradeCategory: '',
    serviceAddress: {},
    estimatedCost: '',
    preferredDate: null,
    preferredTimeStart: '',
    preferredTimeEnd: '',
    photos: []
  });

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <TradeCategoryStep jobData={jobData} setJobData={setJobData} />;
      case 2:
        return <JobDetailsStep jobData={jobData} setJobData={setJobData} />;
      case 3:
        return <AddressStep jobData={jobData} setJobData={setJobData} />;
      case 4:
        return <PhotosStep jobData={jobData} setJobData={setJobData} />;
      case 5:
        return <SchedulingStep jobData={jobData} setJobData={setJobData} />;
      case 6:
        return <ReviewStep jobData={jobData} />;
      default:
        return null;
    }
  };

  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    } else {
      submitJob();
    }
  };

  const submitJob = async () => {
    try {
      const response = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        },
        body: JSON.stringify(jobData)
      });

      if (response.ok) {
        const newJob = await response.json();
        navigation.navigate('JobDetails', { jobId: newJob.id });
      } else {
        throw new Error('Failed to create job');
      }
    } catch (error) {
      console.error('Submit job error:', error);
      Alert.alert('Error', 'Failed to post job. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressHeader}>
        <Text style={styles.stepText}>Step {currentStep} of 6</Text>
        <View style={styles.progressBar}>
          <View 
            style={[styles.progressFill, { width: `${(currentStep / 6) * 100}%` }]} 
          />
        </View>
      </View>

      <ScrollView style={styles.stepContent}>
        {renderStep()}
      </ScrollView>

      <View style={styles.navigation}>
        {currentStep > 1 && (
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => setCurrentStep(currentStep - 1)}
          >
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={styles.nextButton}
          onPress={handleNext}
        >
          <Text style={styles.nextText}>
            {currentStep === 6 ? 'Post Job' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

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
  notificationButton: {
    padding: 8,
  },
  quickActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  postJobButton: {
    flex: 1,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  postJobText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emergencyButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emergencyText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
  },
  jobCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  jobDate: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 4,
  },
  contractorName: {
    color: '#0ea5e9',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  jobActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionText: {
    color: '#0ea5e9',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default function App() {
  return (
    <Provider store={store}>
      <AuthProvider>
        <NavigationContainer>
          <RootStack />
        </NavigationContainer>
      </AuthProvider>
    </Provider>
  );
}