// CustomerApp/src/screens/PostJobScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

// Components
import { StepIndicator } from '../components/common/StepIndicator';
import { TradeSelector } from '../components/jobs/TradeSelector';
import { PhotoUploader } from '../components/common/PhotoUploader';
import { AddressInput } from '../components/common/AddressInput';
import { DateTimePicker } from '../components/common/DateTimePicker';
import { LoadingButton } from '../components/common/LoadingButton';

// Design System
import { colors, spacing, typography, shadows, borderRadius } from '../design-system';

// Types
import { JobCreateRequest, TradeCategory, JobPriority } from '../types/Job';

// Hooks
import { useJobs } from '../hooks/useJobs';

interface PostJobScreenProps {}

interface JobFormData {
  title: string;
  description: string;
  tradeCategory: TradeCategory | null;
  priority: JobPriority;
  serviceAddress: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  estimatedCost: string;
  preferredDate: Date | null;
  preferredTimeStart: Date | null;
  preferredTimeEnd: Date | null;
  photos: string[];
  customerNotes: string;
}

const STEPS = [
  { id: 1, title: 'Service Type', icon: 'construct' },
  { id: 2, title: 'Job Details', icon: 'document-text' },
  { id: 3, title: 'Location', icon: 'location' },
  { id: 4, title: 'Scheduling', icon: 'calendar' },
  { id: 5, title: 'Review', icon: 'checkmark-circle' },
];

const PostJobScreen: React.FC<PostJobScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { createJob, isLoading } = useJobs();

  // Get initial data from navigation params
  const initialTradeCategory = route.params?.tradeCategory;
  const initialUrgency = route.params?.urgency;

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<JobFormData>({
    title: '',
    description: '',
    tradeCategory: initialTradeCategory || null,
    priority: initialUrgency === 'emergency' ? 'urgent' : 'medium',
    serviceAddress: {
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
    },
    estimatedCost: '',
    preferredDate: null,
    preferredTimeStart: null,
    preferredTimeEnd: null,
    photos: [],
    customerNotes: '',
  });

  useEffect(() => {
    if (initialUrgency === 'emergency') {
      // Skip to step 2 for emergency jobs
      setCurrentStep(2);
    }
  }, [initialUrgency]);

  const updateFormData = (updates: Partial<JobFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const canProceedToNextStep = () => {
    switch (currentStep) {
      case 1:
        return formData.tradeCategory !== null;
      case 2:
        return formData.title.trim() && formData.description.trim();
      case 3:
        return formData.serviceAddress.addressLine1.trim() && 
               formData.serviceAddress.city.trim() && 
               formData.serviceAddress.state.trim() && 
               formData.serviceAddress.zipCode.trim();
      case 4:
        return true; // Scheduling is optional
      case 5:
        return true; // Review step
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (canProceedToNextStep() && currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSubmit = async () => {
    try {
      const jobData: JobCreateRequest = {
        title: formData.title,
        description: formData.description,
        tradeCategory: formData.tradeCategory!,
        priority: formData.priority,
        serviceAddress: formData.serviceAddress,
        estimatedCost: formData.estimatedCost ? parseFloat(formData.estimatedCost) : undefined,
        preferredDate: formData.preferredDate?.toISOString().split('T')[0],
        preferredTimeStart: formData.preferredTimeStart?.toTimeString().split(' ')[0],
        preferredTimeEnd: formData.preferredTimeEnd?.toTimeString().split(' ')[0],
        photos: formData.photos,
        customerNotes: formData.customerNotes,
      };

      await createJob(jobData);
      
      Alert.alert(
        'Job Posted Successfully!',
        'We\'re finding qualified contractors in your area. You\'ll receive notifications when contractors apply.',
        [
          {
            text: 'View Job',
            onPress: () => navigation.navigate('MyJobs'),
          },
          {
            text: 'Post Another',
            onPress: () => {
              setCurrentStep(1);
              setFormData({
                title: '',
                description: '',
                tradeCategory: null,
                priority: 'medium',
                serviceAddress: {
                  addressLine1: '',
                  addressLine2: '',
                  city: '',
                  state: '',
                  zipCode: '',
                },
                estimatedCost: '',
                preferredDate: null,
                preferredTimeStart: null,
                preferredTimeEnd: null,
                photos: [],
                customerNotes: '',
              });
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to post job. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to auto-fill your address.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const geocoded = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (geocoded.length > 0) {
        const address = geocoded[0];
        updateFormData({
          serviceAddress: {
            addressLine1: `${address.streetNumber || ''} ${address.street || ''}`.trim(),
            addressLine2: '',
            city: address.city || '',
            state: address.region || '',
            zipCode: address.postalCode || '',
            coordinates: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            },
          },
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to get current location.');
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <Step1TradeSelection />;
      case 2:
        return <Step2JobDetails />;
      case 3:
        return <Step3Location />;
      case 4:
        return <Step4Scheduling />;
      case 5:
        return <Step5Review />;
      default:
        return null;
    }
  };

  // Step 1: Trade Selection
  const Step1TradeSelection = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What kind of work do you need?</Text>
      <Text style={styles.stepSubtitle}>
        Select the trade category that best matches your project
      </Text>
      
      <TradeSelector
        selectedTrade={formData.tradeCategory}
        onTradeSelect={(trade) => updateFormData({ tradeCategory: trade })}
        urgency={formData.priority}
      />
      
      {formData.priority === 'urgent' && (
        <View style={styles.emergencyBanner}>
          <Ionicons name="flash" size={20} color={colors.error[500]} />
          <Text style={styles.emergencyText}>
            Emergency service - We'll prioritize finding available contractors
          </Text>
        </View>
      )}
    </View>
  );

  // Step 2: Job Details
  const Step2JobDetails = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Describe your job</Text>
      <Text style={styles.stepSubtitle}>
        Provide details to help contractors understand your needs
      </Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Job Title *</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., Kitchen faucet repair"
          value={formData.title}
          onChangeText={(text) => updateFormData({ title: text })}
          maxLength={100}
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Description *</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          placeholder="Describe the problem, what needs to be done, and any relevant details..."
          value={formData.description}
          onChangeText={(text) => updateFormData({ description: text })}
          multiline
          numberOfLines={4}
          maxLength={500}
        />
        <Text style={styles.characterCount}>
          {formData.description.length}/500
        </Text>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Estimated Budget (Optional)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., 150"
          value={formData.estimatedCost}
          onChangeText={(text) => updateFormData({ estimatedCost: text })}
          keyboardType="numeric"
        />
        <Text style={styles.inputHelper}>
          This helps contractors provide accurate quotes
        </Text>
      </View>
      
      <PhotoUploader
        photos={formData.photos}
        onPhotosChange={(photos) => updateFormData({ photos })}
        maxPhotos={5}
      />
    </View>
  );

  // Step 3: Location
  const Step3Location = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Where is the job located?</Text>
      
      <TouchableOpacity style={styles.locationButton} onPress={getCurrentLocation}>
        <Ionicons name="location" size={20} color={colors.primary[500]} />
        <Text style={styles.locationButtonText}>Use Current Location</Text>
      </TouchableOpacity>
      
      <AddressInput
        address={formData.serviceAddress}
        onAddressChange={(address) => updateFormData({ serviceAddress: address })}
      />
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Access Instructions (Optional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          placeholder="e.g., Use side entrance, gate code is 1234..."
          value={formData.customerNotes}
          onChangeText={(text) => updateFormData({ customerNotes: text })}
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
  );

  // Step 4: Scheduling
  const Step4Scheduling = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>When would you like this done?</Text>
      <Text style={styles.stepSubtitle}>
        Choose your preferred date and time (optional)
      </Text>
      
      <DateTimePicker
        selectedDate={formData.preferredDate}
        selectedStartTime={formData.preferredTimeStart}
        selectedEndTime={formData.preferredTimeEnd}
        onDateChange={(date) => updateFormData({ preferredDate: date })}
        onStartTimeChange={(time) => updateFormData({ preferredTimeStart: time })}
        onEndTimeChange={(time) => updateFormData({ preferredTimeEnd: time })}
        urgency={formData.priority}
      />
      
      <View style={styles.flexibleOption}>
        <TouchableOpacity
          style={styles.flexibleButton}
          onPress={() => updateFormData({ 
            preferredDate: null, 
            preferredTimeStart: null, 
            preferredTimeEnd: null 
          })}
        >
          <Ionicons name="time" size={20} color={colors.primary[500]} />
          <Text style={styles.flexibleText}>I'm flexible with timing</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Step 5: Review
  const Step5Review = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Review your job posting</Text>
      
      <View style={styles.reviewCard}>
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Service Type</Text>
          <Text style={styles.reviewValue}>
            {formData.tradeCategory?.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
        
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Job Title</Text>
          <Text style={styles.reviewValue}>{formData.title}</Text>
        </View>
        
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Description</Text>
          <Text style={styles.reviewValue}>{formData.description}</Text>
        </View>
        
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Location</Text>
          <Text style={styles.reviewValue}>
            {formData.serviceAddress.addressLine1}, {formData.serviceAddress.city}, {formData.serviceAddress.state}
          </Text>
        </View>
        
        {formData.preferredDate && (
          <View style={styles.reviewSection}>
            <Text style={styles.reviewLabel}>Preferred Date</Text>
            <Text style={styles.reviewValue}>
              {formData.preferredDate.toLocaleDateString()}
              {formData.preferredTimeStart && ` at ${formData.preferredTimeStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </Text>
          </View>
        )}
        
        {formData.estimatedCost && (
          <View style={styles.reviewSection}>
            <Text style={styles.reviewLabel}>Estimated Budget</Text>
            <Text style={styles.reviewValue}>${formData.estimatedCost}</Text>
          </View>
        )}
      </View>
      
      <View style={styles.termsContainer}>
        <Text style={styles.termsText}>
          By posting this job, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.neutral[700]} />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Post a Job</Text>
          
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={24} color={colors.neutral[700]} />
          </TouchableOpacity>
        </View>

        {/* Step Indicator */}
        <StepIndicator
          steps={STEPS}
          currentStep={currentStep}
          completedSteps={currentStep - 1}
        />

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {renderStepContent()}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          {currentStep < STEPS.length ? (
            <LoadingButton
              title="Next"
              onPress={handleNext}
              disabled={!canProceedToNextStep()}
              loading={false}
              style={styles.nextButton}
            />
          ) : (
            <LoadingButton
              title="Post Job"
              onPress={handleSubmit}
              loading={isLoading}
              style={styles.submitButton}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  
  keyboardView: {
    flex: 1,
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  
  backButton: {
    padding: spacing[1],
  },
  
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.semibold,
    color: colors.neutral[900],
  },
  
  closeButton: {
    padding: spacing[1],
  },
  
  content: {
    flex: 1,
  },
  
  stepContainer: {
    padding: spacing[4],
  },
  
  stepTitle: {
    fontSize: typography.fontSize['2xl'],
    fontFamily: typography.fontFamily.bold,
    color: colors.neutral[900],
    marginBottom: spacing[2],
  },
  
  stepSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[600],
    marginBottom: spacing[6],
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.base,
  },
  
  inputGroup: {
    marginBottom: spacing[4],
  },
  
  inputLabel: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.neutral[700],
    marginBottom: spacing[2],
  },
  
  textInput: {
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.neutral[900],
  },
  
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  
  characterCount: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
    textAlign: 'right',
    marginTop: spacing[1],
  },
  
  inputHelper: {
    fontSize: typography.fontSize.xs,
    color: colors.neutral[500],
    marginTop: spacing[1],
  },
  
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.md,
    paddingVertical: spacing[3],
    marginBottom: spacing[4],
  },
  
  locationButtonText: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary[600],
    marginLeft: spacing[2],
  },
  
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginTop: spacing[4],
  },
  
  emergencyText: {
    fontSize: typography.fontSize.sm,
    color: colors.error[600],
    marginLeft: spacing[2],
    flex: 1,
  },
  
  flexibleOption: {
    marginTop: spacing[4],
  },
  
  flexibleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[50],
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: borderRadius.md,
    paddingVertical: spacing[3],
  },
  
  flexibleText: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.neutral[700],
    marginLeft: spacing[2],
  },
  
  reviewCard: {
    backgroundColor: colors.neutral[50],
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  
  reviewSection: {
    marginBottom: spacing[3],
  },
  
  reviewLabel: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.neutral[600],
    marginBottom: spacing[1],
  },
  
  reviewValue: {
    fontSize: typography.fontSize.base,
    color: colors.neutral[900],
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.base,
  },
  
  termsContainer: {
    marginTop: spacing[4],
  },
  
  termsText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
    textAlign: 'center',
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  
  footer: {
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  
  nextButton: {
    backgroundColor: colors.primary[500],
  },
  
  submitButton: {
    backgroundColor: colors.success[500],
  },
});

export default PostJobScreen;