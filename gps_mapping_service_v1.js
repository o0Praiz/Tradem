/**
 * Module: mapping_service_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1
 * Provides: GPS tracking, route optimization, geocoding, distance calculations
 * Integration Points: Mobile apps, job management, contractor matching
 * Last Updated: 2025-05-31
 */

const axios = require('axios');
const geolib = require('geolib');
const { config } = require('./config/env');

// =================================================================
// MAPPING SERVICE CORE
// =================================================================

/**
 * GPS and Mapping Service
 * Handles location services, geocoding, route optimization
 */
class MappingService {
  constructor(database) {
    this.db = database;
    this.googleMapsApiKey = config.services.maps.googleApiKey;
    this.mapboxApiKey = config.services.maps.mapboxApiKey;
  }

  // =================================================================
  // GEOCODING SERVICES
  // =================================================================

  /**
   * Convert address to coordinates using Google Geocoding API
   */
  async geocodeAddress(address) {
    try {
      const formattedAddress = typeof address === 'string' ? address : 
        `${address.addressLine1}, ${address.city}, ${address.state} ${address.zipCode}`;

      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: formattedAddress,
          key: this.googleMapsApiKey
        }
      });

      if (response.data.status !== 'OK' || response.data.results.length === 0) {
        throw new Error(`Geocoding failed: ${response.data.status}`);
      }

      const result = response.data.results[0];
      const location = result.geometry.location;

      return {
        latitude: location.lat,
        longitude: location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
        addressComponents: result.address_components,
        bounds: result.geometry.bounds,
        locationType: result.geometry.location_type
      };

    } catch (error) {
      console.error('Geocoding error:', error);
      throw new Error(`Failed to geocode address: ${error.message}`);
    }
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(latitude, longitude) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          latlng: `${latitude},${longitude}`,
          key: this.googleMapsApiKey
        }
      });

      if (response.data.status !== 'OK' || response.data.results.length === 0) {
        throw new Error(`Reverse geocoding failed: ${response.data.status}`);
      }

      const result = response.data.results[0];

      // Parse address components
      const components = {};
      result.address_components.forEach(component => {
        component.types.forEach(type => {
          components[type] = component.long_name;
        });
      });

      return {
        formattedAddress: result.formatted_address,
        streetNumber: components.street_number || '',
        route: components.route || '',
        city: components.locality || components.sublocality_level_1 || '',
        state: components.administrative_area_level_1 || '',
        zipCode: components.postal_code || '',
        country: components.country || '',
        placeId: result.place_id
      };

    } catch (error) {
      console.error('Reverse geocoding error:', error);
      throw new Error(`Failed to reverse geocode: ${error.message}`);
    }
  }

  // =================================================================
  // DISTANCE CALCULATIONS
  // =================================================================

  /**
   * Calculate distance between two points
   */
  calculateDistance(point1, point2, unit = 'miles') {
    const distance = geolib.getDistance(
      { latitude: point1.latitude, longitude: point1.longitude },
      { latitude: point2.latitude, longitude: point2.longitude }
    );

    // Convert from meters to requested unit
    switch (unit) {
      case 'miles':
        return Math.round((distance * 0.000621371) * 100) / 100;
      case 'kilometers':
        return Math.round((distance * 0.001) * 100) / 100;
      case 'feet':
        return Math.round(distance * 3.28084);
      default:
        return distance; // meters
    }
  }

  /**
   * Check if point is within radius of center
   */
  isWithinRadius(centerPoint, targetPoint, radiusMiles) {
    const distance = this.calculateDistance(centerPoint, targetPoint, 'miles');
    return distance <= radiusMiles;
  }

  /**
   * Find contractors within radius of location
   */
  async findNearbyContractors(location, tradeCategory, radiusMiles = 25, limit = 50) {
    try {
      const { latitude, longitude } = location;

      const query = `
        SELECT 
          cp.user_id,
          u.first_name,
          u.last_name,
          cp.business_name,
          cp.primary_trade,
          cp.average_rating,
          cp.total_jobs_completed,
          cp.response_time_hours,
          u.profile_image_url,
          ST_X(u.coordinates) as contractor_longitude,
          ST_Y(u.coordinates) as contractor_latitude,
          ST_Distance(
            u.coordinates::geography,
            ST_GeomFromText('POINT(${longitude} ${latitude})', 4326)::geography
          ) / 1609.34 as distance_miles
        FROM contractor_profiles cp
        JOIN users u ON cp.user_id = u.id
        WHERE 
          cp.available_for_work = true
          AND cp.approved_at IS NOT NULL
          AND (cp.primary_trade = $1 OR $1 = ANY(cp.secondary_trades))
          AND u.coordinates IS NOT NULL
          AND ST_DWithin(
            u.coordinates::geography,
            ST_GeomFromText('POINT(${longitude} ${latitude})', 4326)::geography,
            ${radiusMiles * 1609.34}
          )
        ORDER BY distance_miles ASC
        LIMIT $2
      `;

      const result = await this.db.query(query, [tradeCategory, limit]);

      return result.rows.map(row => ({
        contractorId: row.user_id,
        name: `${row.first_name} ${row.last_name}`,
        businessName: row.business_name,
        primaryTrade: row.primary_trade,
        rating: parseFloat(row.average_rating) || 0,
        jobsCompleted: row.total_jobs_completed || 0,
        responseTimeHours: parseFloat(row.response_time_hours) || 0,
        profileImageUrl: row.profile_image_url,
        location: {
          latitude: row.contractor_latitude,
          longitude: row.contractor_longitude
        },
        distance: Math.round(parseFloat(row.distance_miles) * 100) / 100
      }));

    } catch (error) {
      console.error('Find nearby contractors error:', error);
      throw new Error(`Failed to find nearby contractors: ${error.message}`);
    }
  }

  // =================================================================
  // ROUTE OPTIMIZATION
  // =================================================================

  /**
   * Get optimized route for multiple stops
   */
  async getOptimizedRoute(origin, destinations, options = {}) {
    try {
      const {
        mode = 'driving',
        optimize = true,
        avoidTolls = false,
        avoidHighways = false
      } = options;

      // Format waypoints for Google Directions API
      const waypoints = destinations.map(dest => 
        `${dest.latitude},${dest.longitude}`
      ).join('|');

      const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
        params: {
          origin: `${origin.latitude},${origin.longitude}`,
          destination: `${origin.latitude},${origin.longitude}`, // Return to origin
          waypoints: optimize ? `optimize:true|${waypoints}` : waypoints,
          mode,
          avoid: [
            avoidTolls ? 'tolls' : null,
            avoidHighways ? 'highways' : null
          ].filter(Boolean).join('|'),
          key: this.googleMapsApiKey
        }
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Route optimization failed: ${response.data.status}`);
      }

      const route = response.data.routes[0];
      const legs = route.legs;

      // Calculate total duration and distance
      const totalDuration = legs.reduce((sum, leg) => sum + leg.duration.value, 0);
      const totalDistance = legs.reduce((sum, leg) => sum + leg.distance.value, 0);

      // Get optimized waypoint order
      const waypointOrder = route.waypoint_order || destinations.map((_, index) => index);

      return {
        optimizedOrder: waypointOrder,
        totalDuration: {
          seconds: totalDuration,
          text: this.formatDuration(totalDuration)
        },
        totalDistance: {
          meters: totalDistance,
          miles: Math.round((totalDistance * 0.000621371) * 100) / 100,
          text: `${Math.round((totalDistance * 0.000621371) * 10) / 10} mi`
        },
        legs: legs.map((leg, index) => ({
          stepNumber: index + 1,
          startLocation: leg.start_location,
          endLocation: leg.end_location,
          duration: {
            seconds: leg.duration.value,
            text: leg.duration.text
          },
          distance: {
            meters: leg.distance.value,
            miles: Math.round((leg.distance.value * 0.000621371) * 100) / 100,
            text: leg.distance.text
          },
          startAddress: leg.start_address,
          endAddress: leg.end_address
        })),
        polyline: route.overview_polyline.points,
        bounds: route.bounds
      };

    } catch (error) {
      console.error('Route optimization error:', error);
      throw new Error(`Failed to optimize route: ${error.message}`);
    }
  }

  /**
   * Get driving directions between two points
   */
  async getDirections(origin, destination, options = {}) {
    try {
      const { mode = 'driving', alternatives = false } = options;

      const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
        params: {
          origin: `${origin.latitude},${origin.longitude}`,
          destination: `${destination.latitude},${destination.longitude}`,
          mode,
          alternatives,
          key: this.googleMapsApiKey
        }
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Directions failed: ${response.data.status}`);
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        duration: {
          seconds: leg.duration.value,
          text: leg.duration.text
        },
        distance: {
          meters: leg.distance.value,
          miles: Math.round((leg.distance.value * 0.000621371) * 100) / 100,
          text: leg.distance.text
        },
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        steps: leg.steps.map(step => ({
          instruction: step.html_instructions.replace(/<[^>]*>/g, ''), // Strip HTML
          distance: step.distance.text,
          duration: step.duration.text,
          startLocation: step.start_location,
          endLocation: step.end_location
        })),
        polyline: route.overview_polyline.points,
        bounds: route.bounds
      };

    } catch (error) {
      console.error('Get directions error:', error);
      throw new Error(`Failed to get directions: ${error.message}`);
    }
  }

  // =================================================================
  // REAL-TIME TRACKING
  // =================================================================

  /**
   * Update contractor location
   */
  async updateContractorLocation(contractorId, location, accuracy = null) {
    try {
      const { latitude, longitude, timestamp = new Date() } = location;

      // Update contractor's current location in database
      await this.db.query(`
        UPDATE users 
        SET 
          coordinates = ST_GeomFromText('POINT($2 $1)', 4326),
          updated_at = NOW()
        WHERE id = $3
      `, [latitude, longitude, contractorId]);

      // Save location history for tracking
      await this.db.query(`
        INSERT INTO contractor_location_history (
          contractor_id, latitude, longitude, accuracy, recorded_at
        ) VALUES ($1, $2, $3, $4, $5)
      `, [contractorId, latitude, longitude, accuracy, timestamp]);

      return { success: true };

    } catch (error) {
      console.error('Update contractor location error:', error);
      throw new Error(`Failed to update contractor location: ${error.message}`);
    }
  }

  /**
   * Get contractor's current location
   */
  async getContractorLocation(contractorId) {
    try {
      const result = await this.db.query(`
        SELECT 
          ST_X(coordinates) as longitude,
          ST_Y(coordinates) as latitude,
          updated_at
        FROM users 
        WHERE id = $1 AND coordinates IS NOT NULL
      `, [contractorId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        latitude: row.latitude,
        longitude: row.longitude,
        lastUpdated: row.updated_at
      };

    } catch (error) {
      console.error('Get contractor location error:', error);
      return null;
    }
  }

  /**
   * Track contractor en route to job
   */
  async trackContractorToJob(contractorId, jobId) {
    try {
      // Get job location
      const jobResult = await this.db.query(`
        SELECT 
          ST_X(service_coordinates) as longitude,
          ST_Y(service_coordinates) as latitude,
          service_address_line1,
          service_city,
          service_state
        FROM jobs 
        WHERE id = $1
      `, [jobId]);

      if (jobResult.rows.length === 0) {
        throw new Error('Job not found');
      }

      const jobLocation = {
        latitude: jobResult.rows[0].latitude,
        longitude: jobResult.rows[0].longitude
      };

      // Get contractor's current location
      const contractorLocation = await this.getContractorLocation(contractorId);
      if (!contractorLocation) {
        throw new Error('Contractor location not available');
      }

      // Calculate distance and ETA
      const distance = this.calculateDistance(contractorLocation, jobLocation, 'miles');
      const directions = await this.getDirections(contractorLocation, jobLocation);

      return {
        contractorLocation,
        jobLocation,
        distance: {
          miles: distance,
          text: `${distance} mi`
        },
        eta: {
          seconds: directions.duration.seconds,
          text: directions.duration.text
        },
        directions: directions.steps
      };

    } catch (error) {
      console.error('Track contractor to job error:', error);
      throw new Error(`Failed to track contractor: ${error.message}`);
    }
  }

  // =================================================================
  // SERVICE AREA MANAGEMENT
  // =================================================================

  /**
   * Set contractor service area
   */
  async setContractorServiceArea(contractorId, serviceArea) {
    try {
      const { radiusMiles, centerLocation, specificAreas = [] } = serviceArea;

      // Update contractor's work radius
      await this.db.query(`
        UPDATE contractor_profiles 
        SET work_radius_miles = $2
        WHERE user_id = $1
      `, [contractorId, radiusMiles]);

      // If specific service areas are provided, save them
      if (specificAreas.length > 0) {
        // Clear existing service areas
        await this.db.query(`
          DELETE FROM contractor_service_areas WHERE contractor_id = $1
        `, [contractorId]);

        // Add new service areas
        for (const area of specificAreas) {
          await this.db.query(`
            INSERT INTO contractor_service_areas (
              contractor_id, area_name, area_type, coordinates, radius_miles
            ) VALUES ($1, $2, $3, ST_GeomFromText('POINT($5 $4)', 4326), $6)
          `, [
            contractorId,
            area.name,
            area.type, // 'city', 'zip', 'radius'
            area.centerLocation.latitude,
            area.centerLocation.longitude,
            area.radiusMiles || radiusMiles
          ]);
        }
      }

      return { success: true };

    } catch (error) {
      console.error('Set contractor service area error:', error);
      throw new Error(`Failed to set service area: ${error.message}`);
    }
  }

  /**
   * Check if job is within contractor's service area
   */
  async isJobInServiceArea(contractorId, jobLocation) {
    try {
      const result = await this.db.query(`
        SELECT 
          work_radius_miles,
          ST_X(u.coordinates) as contractor_longitude,
          ST_Y(u.coordinates) as contractor_latitude
        FROM contractor_profiles cp
        JOIN users u ON cp.user_id = u.id
        WHERE cp.user_id = $1
      `, [contractorId]);

      if (result.rows.length === 0) {
        return false;
      }

      const contractor = result.rows[0];
      const contractorLocation = {
        latitude: contractor.contractor_latitude,
        longitude: contractor.contractor_longitude
      };

      const distance = this.calculateDistance(contractorLocation, jobLocation, 'miles');
      return distance <= contractor.work_radius_miles;

    } catch (error) {
      console.error('Check service area error:', error);
      return false;
    }
  }

  // =================================================================
  // UTILITY FUNCTIONS
  // =================================================================

  /**
   * Format duration in seconds to human readable text
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Get map static image URL
   */
  getStaticMapUrl(center, markers = [], options = {}) {
    const {
      zoom = 15,
      size = '600x400',
      maptype = 'roadmap'
    } = options;

    const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
    const params = new URLSearchParams({
      center: `${center.latitude},${center.longitude}`,
      zoom: zoom.toString(),
      size,
      maptype,
      key: this.googleMapsApiKey
    });

    // Add markers
    markers.forEach((marker, index) => {
      const markerParam = `color:${marker.color || 'red'}|label:${marker.label || (index + 1)}|${marker.latitude},${marker.longitude}`;
      params.append('markers', markerParam);
    });

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Validate coordinates
   */
  isValidCoordinates(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180
    );
  }

  /**
   * Get timezone from coordinates
   */
  async getTimezone(latitude, longitude) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/timezone/json', {
        params: {
          location: `${latitude},${longitude}`,
          timestamp: Math.floor(Date.now() / 1000),
          key: this.googleMapsApiKey
        }
      });

      if (response.data.status === 'OK') {
        return {
          timeZoneId: response.data.timeZoneId,
          timeZoneName: response.data.timeZoneName,
          dstOffset: response.data.dstOffset,
          rawOffset: response.data.rawOffset
        };
      }

      return null;

    } catch (error) {
      console.error('Get timezone error:', error);
      return null;
    }
  }
}

// =================================================================
// LOCATION TRACKING FOR JOBS
// =================================================================

/**
 * Job Location Tracking Service
 * Tracks contractor movement during active jobs
 */
class JobLocationTracker {
  constructor(mappingService, database) {
    this.mappingService = mappingService;
    this.db = database;
    this.activeTracking = new Map(); // jobId -> tracking data
  }

  /**
   * Start tracking contractor for a job
   */
  async startJobTracking(jobId, contractorId) {
    try {
      // Get job details
      const jobResult = await this.db.query(`
        SELECT 
          customer_id,
          ST_X(service_coordinates) as job_longitude,
          ST_Y(service_coordinates) as job_latitude
        FROM jobs 
        WHERE id = $1 AND contractor_id = $2
      `, [jobId, contractorId]);

      if (jobResult.rows.length === 0) {
        throw new Error('Job not found or not assigned to contractor');
      }

      const job = jobResult.rows[0];
      const jobLocation = {
        latitude: job.job_latitude,
        longitude: job.job_longitude
      };

      // Store tracking data
      this.activeTracking.set(jobId, {
        contractorId,
        customerId: job.customer_id,
        jobLocation,
        startTime: new Date(),
        lastUpdate: null,
        arrived: false
      });

      return { success: true };

    } catch (error) {
      console.error('Start job tracking error:', error);
      throw new Error(`Failed to start job tracking: ${error.message}`);
    }
  }

  /**
   * Update contractor location during job
   */
  async updateJobLocation(jobId, location) {
    try {
      if (!this.activeTracking.has(jobId)) {
        throw new Error('Job tracking not active');
      }

      const tracking = this.activeTracking.get(jobId);
      const { contractorId, customerId, jobLocation } = tracking;

      // Update contractor location
      await this.mappingService.updateContractorLocation(contractorId, location);

      // Calculate distance to job site
      const distance = this.mappingService.calculateDistance(location, jobLocation, 'miles');

      // Check if contractor has arrived (within 0.1 miles)
      const hasArrived = distance <= 0.1;
      
      if (hasArrived && !tracking.arrived) {
        tracking.arrived = true;
        tracking.arrivedAt = new Date();

        // Notify customer of arrival
        await this.notifyCustomerOfArrival(customerId, jobId);
      }

      // Update tracking data
      tracking.lastUpdate = new Date();
      tracking.currentLocation = location;
      tracking.distanceToJob = distance;

      return {
        success: true,
        distance: distance,
        arrived: hasArrived,
        eta: hasArrived ? null : await this.calculateETA(location, jobLocation)
      };

    } catch (error) {
      console.error('Update job location error:', error);
      throw new Error(`Failed to update job location: ${error.message}`);
    }
  }

  /**
   * Stop tracking when job is completed
   */
  async stopJobTracking(jobId) {
    if (this.activeTracking.has(jobId)) {
      const tracking = this.activeTracking.get(jobId);
      tracking.endTime = new Date();
      
      // Save tracking summary to database
      await this.saveTrackingSummary(jobId, tracking);
      
      // Remove from active tracking
      this.activeTracking.delete(jobId);
    }

    return { success: true };
  }

  /**
   * Calculate ETA to job location
   */
  async calculateETA(currentLocation, jobLocation) {
    try {
      const directions = await this.mappingService.getDirections(currentLocation, jobLocation);
      return {
        seconds: directions.duration.seconds,
        text: directions.duration.text
      };
    } catch (error) {
      // Fallback to simple time calculation if directions fail
      const distance = this.mappingService.calculateDistance(currentLocation, jobLocation, 'miles');
      const estimatedMinutes = Math.round(distance * 2.5); // Assume 25 mph average
      return {
        seconds: estimatedMinutes * 60,
        text: `${estimatedMinutes} min`
      };
    }
  }

  /**
   * Notify customer of contractor arrival
   */
  async notifyCustomerOfArrival(customerId, jobId) {
    // This would integrate with the notification service
    console.log(`Contractor has arrived for job ${jobId}. Notifying customer ${customerId}`);
  }

  /**
   * Save tracking summary to database
   */
  async saveTrackingSummary(jobId, tracking) {
    try {
      await this.db.query(`
        INSERT INTO job_tracking_summary (
          job_id, contractor_id, start_time, end_time, 
          arrived_at, total_distance_miles
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        jobId,
        tracking.contractorId,
        tracking.startTime,
        tracking.endTime,
        tracking.arrivedAt || null,
        tracking.totalDistance || 0
      ]);
    } catch (error) {
      console.error('Save tracking summary error:', error);
    }
  }

  /**
   * Get current job tracking status
   */
  getJobTrackingStatus(jobId) {
    if (!this.activeTracking.has(jobId)) {
      return null;
    }

    const tracking = this.activeTracking.get(jobId);
    return {
      contractorId: tracking.contractorId,
      currentLocation: tracking.currentLocation,
      distanceToJob: tracking.distanceToJob,
      arrived: tracking.arrived,
      arrivedAt: tracking.arrivedAt,
      lastUpdate: tracking.lastUpdate
    };
  }
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  MappingService,
  JobLocationTracker
};