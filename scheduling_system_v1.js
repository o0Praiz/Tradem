/**
 * Module: scheduling_system_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1, db_schema_foundation_v1, notification_service_v1, mapping_service_v1
 * Provides: Calendar integration, appointment scheduling, availability management, time optimization
 * Integration Points: Job management, contractor profiles, mobile apps, external calendar services
 * Last Updated: 2025-05-31
 */

const moment = require('moment-timezone');
const ical = require('ical-generator');
const { config } = require('./config/env');

// =================================================================
// SCHEDULING SERVICE CORE
// =================================================================

/**
 * Scheduling and Calendar Management Service
 * Handles contractor availability, job scheduling, and calendar integration
 */
class SchedulingService {
  constructor(database, notificationService = null, mappingService = null) {
    this.db = database;
    this.notificationService = notificationService;
    this.mappingService = mappingService;
  }

  // =================================================================
  // CONTRACTOR AVAILABILITY MANAGEMENT
  // =================================================================

  /**
   * Set contractor working hours and availability
   */
  async setContractorAvailability(contractorId, availabilityData) {
    try {
      const {
        workingHours,
        timeZone,
        breakDuration = 30,
        maxJobsPerDay = 6,
        advanceBookingDays = 30,
        emergencyAvailable = false,
        blockedDates = []
      } = availabilityData;

      // Validate working hours format
      this.validateWorkingHours(workingHours);

      // Update contractor availability
      const result = await this.db.query(`
        INSERT INTO contractor_availability (
          contractor_id, working_hours, time_zone, break_duration_minutes,
          max_jobs_per_day, advance_booking_days, emergency_available
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (contractor_id)
        DO UPDATE SET
          working_hours = EXCLUDED.working_hours,
          time_zone = EXCLUDED.time_zone,
          break_duration_minutes = EXCLUDED.break_duration_minutes,
          max_jobs_per_day = EXCLUDED.max_jobs_per_day,
          advance_booking_days = EXCLUDED.advance_booking_days,
          emergency_available = EXCLUDED.emergency_available,
          updated_at = NOW()
        RETURNING *
      `, [
        contractorId,
        JSON.stringify(workingHours),
        timeZone,
        breakDuration,
        maxJobsPerDay,
        advanceBookingDays,
        emergencyAvailable
      ]);

      // Add blocked dates
      if (blockedDates.length > 0) {
        await this.setBlockedDates(contractorId, blockedDates);
      }

      return {
        success: true,
        availability: result.rows[0]
      };

    } catch (error) {
      console.error('Set contractor availability error:', error);
      throw new Error(`Failed to set availability: ${error.message}`);
    }
  }

  /**
   * Get contractor availability for a date range
   */
  async getContractorAvailability(contractorId, startDate, endDate) {
    try {
      // Get contractor availability settings
      const availabilityResult = await this.db.query(`
        SELECT * FROM contractor_availability WHERE contractor_id = $1
      `, [contractorId]);

      if (availabilityResult.rows.length === 0) {
        return { available: false, reason: 'No availability settings found' };
      }

      const availability = availabilityResult.rows[0];
      const workingHours = availability.working_hours;
      const timeZone = availability.time_zone;

      // Get existing appointments in date range
      const appointmentsResult = await this.db.query(`
        SELECT 
          preferred_date, preferred_time_start, preferred_time_end,
          estimated_duration_hours
        FROM jobs 
        WHERE contractor_id = $1 
          AND status IN ('assigned', 'in_progress')
          AND preferred_date BETWEEN $2 AND $3
        ORDER BY preferred_date, preferred_time_start
      `, [contractorId, startDate, endDate]);

      const existingAppointments = appointmentsResult.rows;

      // Get blocked dates
      const blockedResult = await this.db.query(`
        SELECT blocked_date, reason
        FROM contractor_blocked_dates 
        WHERE contractor_id = $1 
          AND blocked_date BETWEEN $2 AND $3
      `, [contractorId, startDate, endDate]);

      const blockedDates = blockedResult.rows.map(row => ({
        date: row.blocked_date,
        reason: row.reason
      }));

      // Generate availability slots
      const availableSlots = this.generateAvailableSlots(
        startDate,
        endDate,
        workingHours,
        timeZone,
        existingAppointments,
        blockedDates,
        availability
      );

      return {
        available: true,
        timeZone,
        workingHours,
        availableSlots,
        existingAppointments: existingAppointments.length,
        blockedDates: blockedDates.length
      };

    } catch (error) {
      console.error('Get contractor availability error:', error);
      throw new Error(`Failed to get availability: ${error.message}`);
    }
  }

  /**
   * Generate available time slots for booking
   */
  generateAvailableSlots(startDate, endDate, workingHours, timeZone, existingAppointments, blockedDates, settings) {
    const slots = [];
    const current = moment.tz(startDate, timeZone);
    const end = moment.tz(endDate, timeZone);

    while (current.isSameOrBefore(end, 'day')) {
      const dayOfWeek = current.format('dddd').toLowerCase();
      const dayHours = workingHours[dayOfWeek];

      // Skip if no working hours for this day
      if (!dayHours || !dayHours.enabled) {
        current.add(1, 'day');
        continue;
      }

      // Skip if date is blocked
      const isBlocked = blockedDates.some(blocked => 
        moment(blocked.date).isSame(current, 'day')
      );

      if (isBlocked) {
        current.add(1, 'day');
        continue;
      }

      // Generate slots for this day
      const daySlots = this.generateDaySlots(
        current.clone(),
        dayHours,
        existingAppointments,
        settings
      );

      slots.push({
        date: current.format('YYYY-MM-DD'),
        dayOfWeek: dayOfWeek,
        slots: daySlots
      });

      current.add(1, 'day');
    }

    return slots;
  }

  /**
   * Generate available slots for a specific day
   */
  generateDaySlots(date, dayHours, existingAppointments, settings) {
    const slots = [];
    const startTime = moment.tz(
      `${date.format('YYYY-MM-DD')} ${dayHours.start}`,
      'YYYY-MM-DD HH:mm',
      date.tz()
    );
    const endTime = moment.tz(
      `${date.format('YYYY-MM-DD')} ${dayHours.end}`,
      'YYYY-MM-DD HH:mm',
      date.tz()
    );

    // Get appointments for this day
    const dayAppointments = existingAppointments.filter(apt => 
      moment(apt.preferred_date).isSame(date, 'day')
    );

    // Sort appointments by start time
    dayAppointments.sort((a, b) => {
      const timeA = moment(`${a.preferred_date} ${a.preferred_time_start}`, 'YYYY-MM-DD HH:mm:ss');
      const timeB = moment(`${b.preferred_date} ${b.preferred_time_start}`, 'YYYY-MM-DD HH:mm:ss');
      return timeA.diff(timeB);
    });

    const slotDuration = 60; // 1-hour slots
    const current = startTime.clone();

    while (current.clone().add(slotDuration, 'minutes').isSameOrBefore(endTime)) {
      const slotEnd = current.clone().add(slotDuration, 'minutes');

      // Check if slot conflicts with existing appointments
      const hasConflict = dayAppointments.some(apt => {
        const aptStart = moment.tz(
          `${apt.preferred_date} ${apt.preferred_time_start}`,
          'YYYY-MM-DD HH:mm:ss',
          date.tz()
        );
        const aptEnd = moment.tz(
          `${apt.preferred_date} ${apt.preferred_time_end}`,
          'YYYY-MM-DD HH:mm:ss',
          date.tz()
        );

        return current.isBefore(aptEnd) && slotEnd.isAfter(aptStart);
      });

      if (!hasConflict) {
        slots.push({
          startTime: current.format('HH:mm'),
          endTime: slotEnd.format('HH:mm'),
          available: true,
          duration: slotDuration
        });
      }

      current.add(slotDuration, 'minutes');
    }

    return slots;
  }

  // =================================================================
  // JOB SCHEDULING
  // =================================================================

  /**
   * Schedule a job with a contractor
   */
  async scheduleJob(jobId, contractorId, schedulingData) {
    try {
      const {
        preferredDate,
        preferredTimeStart,
        preferredTimeEnd,
        estimatedDuration,
        customerNotes,
        urgency = 'normal'
      } = schedulingData;

      // Validate availability
      const availability = await this.checkSchedulingAvailability(
        contractorId,
        preferredDate,
        preferredTimeStart,
        estimatedDuration
      );

      if (!availability.available) {
        throw new Error(`Time slot not available: ${availability.reason}`);
      }

      // Update job with scheduling information
      const result = await this.db.query(`
        UPDATE jobs 
        SET 
          preferred_date = $2,
          preferred_time_start = $3,
          preferred_time_end = $4,
          estimated_duration_hours = $5,
          customer_notes = $6,
          urgency_level = $7,
          status = 'assigned',
          assigned_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        jobId,
        preferredDate,
        preferredTimeStart,
        preferredTimeEnd,
        estimatedDuration,
        customerNotes,
        urgency
      ]);

      const job = result.rows[0];

      // Create calendar event
      const calendarEvent = await this.createCalendarEvent(job);

      // Send notifications
      if (this.notificationService) {
        await this.sendSchedulingNotifications(job);
      }

      // Optimize contractor's route if multiple jobs same day
      await this.optimizeContractorRoute(contractorId, preferredDate);

      return {
        success: true,
        job: job,
        calendarEvent: calendarEvent,
        message: 'Job scheduled successfully'
      };

    } catch (error) {
      console.error('Schedule job error:', error);
      throw new Error(`Failed to schedule job: ${error.message}`);
    }
  }

  /**
   * Check if scheduling slot is available
   */
  async checkSchedulingAvailability(contractorId, date, startTime, duration) {
    try {
      // Get contractor availability settings
      const availabilityResult = await this.db.query(`
        SELECT * FROM contractor_availability WHERE contractor_id = $1
      `, [contractorId]);

      if (availabilityResult.rows.length === 0) {
        return { available: false, reason: 'No availability settings found' };
      }

      const availability = availabilityResult.rows[0];
      const workingHours = availability.working_hours;
      const timeZone = availability.time_zone;

      // Check if date is within advance booking limit
      const requestedDate = moment.tz(date, timeZone);
      const today = moment.tz(timeZone);
      const daysInAdvance = requestedDate.diff(today, 'days');

      if (daysInAdvance > availability.advance_booking_days) {
        return { 
          available: false, 
          reason: `Cannot book more than ${availability.advance_booking_days} days in advance` 
        };
      }

      // Check if date is in the past
      if (requestedDate.isBefore(today, 'day')) {
        return { available: false, reason: 'Cannot book in the past' };
      }

      // Check working hours for day of week
      const dayOfWeek = requestedDate.format('dddd').toLowerCase();
      const dayHours = workingHours[dayOfWeek];

      if (!dayHours || !dayHours.enabled) {
        return { available: false, reason: 'Contractor not available on this day' };
      }

      // Check if time is within working hours
      const requestedStart = moment.tz(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm', timeZone);
      const requestedEnd = requestedStart.clone().add(duration, 'hours');
      
      const workStart = moment.tz(`${date} ${dayHours.start}`, 'YYYY-MM-DD HH:mm', timeZone);
      const workEnd = moment.tz(`${date} ${dayHours.end}`, 'YYYY-MM-DD HH:mm', timeZone);

      if (requestedStart.isBefore(workStart) || requestedEnd.isAfter(workEnd)) {
        return { 
          available: false, 
          reason: `Outside working hours (${dayHours.start} - ${dayHours.end})` 
        };
      }

      // Check for conflicts with existing jobs
      const conflictResult = await this.db.query(`
        SELECT id, title 
        FROM jobs 
        WHERE contractor_id = $1 
          AND preferred_date = $2
          AND status IN ('assigned', 'in_progress')
          AND (
            (preferred_time_start <= $3 AND preferred_time_end > $3) OR
            (preferred_time_start < $4 AND preferred_time_end >= $4) OR
            (preferred_time_start >= $3 AND preferred_time_end <= $4)
          )
      `, [contractorId, date, startTime, requestedEnd.format('HH:mm:ss')]);

      if (conflictResult.rows.length > 0) {
        return { 
          available: false, 
          reason: `Conflicts with existing job: ${conflictResult.rows[0].title}` 
        };
      }

      // Check daily job limit
      const dailyJobsResult = await this.db.query(`
        SELECT COUNT(*) as job_count
        FROM jobs 
        WHERE contractor_id = $1 
          AND preferred_date = $2
          AND status IN ('assigned', 'in_progress')
      `, [contractorId, date]);

      const currentJobs = parseInt(dailyJobsResult.rows[0].job_count);
      if (currentJobs >= availability.max_jobs_per_day) {
        return { 
          available: false, 
          reason: `Daily job limit reached (${availability.max_jobs_per_day})` 
        };
      }

      return { available: true };

    } catch (error) {
      console.error('Check scheduling availability error:', error);
      return { available: false, reason: 'Error checking availability' };
    }
  }

  /**
   * Reschedule an existing job
   */
  async rescheduleJob(jobId, newSchedulingData, requestedBy) {
    try {
      const {
        newDate,
        newStartTime,
        newEndTime,
        reason
      } = newSchedulingData;

      // Get current job details
      const jobResult = await this.db.query(`
        SELECT * FROM jobs WHERE id = $1
      `, [jobId]);

      if (jobResult.rows.length === 0) {
        throw new Error('Job not found');
      }

      const job = jobResult.rows[0];

      // Check new availability
      const estimatedDuration = moment(newEndTime, 'HH:mm').diff(moment(newStartTime, 'HH:mm'), 'hours', true);
      const availability = await this.checkSchedulingAvailability(
        job.contractor_id,
        newDate,
        newStartTime,
        estimatedDuration
      );

      if (!availability.available) {
        throw new Error(`New time slot not available: ${availability.reason}`);
      }

      // Update job
      await this.db.query(`
        UPDATE jobs 
        SET 
          preferred_date = $2,
          preferred_time_start = $3,
          preferred_time_end = $4,
          updated_at = NOW()
        WHERE id = $1
      `, [jobId, newDate, newStartTime, newEndTime]);

      // Log reschedule event
      await this.db.query(`
        INSERT INTO job_reschedule_history (
          job_id, requested_by, old_date, old_start_time, old_end_time,
          new_date, new_start_time, new_end_time, reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        jobId, requestedBy, job.preferred_date, job.preferred_time_start, job.preferred_time_end,
        newDate, newStartTime, newEndTime, reason
      ]);

      // Send notifications
      if (this.notificationService) {
        await this.sendRescheduleNotifications(job, newSchedulingData, requestedBy);
      }

      return { success: true, message: 'Job rescheduled successfully' };

    } catch (error) {
      console.error('Reschedule job error:', error);
      throw new Error(`Failed to reschedule job: ${error.message}`);
    }
  }

  // =================================================================
  // ROUTE OPTIMIZATION
  // =================================================================

  /**
   * Optimize contractor's route for a specific day
   */
  async optimizeContractorRoute(contractorId, date) {
    try {
      if (!this.mappingService) {
        console.log('Mapping service not available for route optimization');
        return { optimized: false };
      }

      // Get all jobs for the day
      const jobsResult = await this.db.query(`
        SELECT 
          id, title,
          service_address_line1, service_city, service_state,
          ST_X(service_coordinates) as longitude,
          ST_Y(service_coordinates) as latitude,
          preferred_time_start, estimated_duration_hours
        FROM jobs 
        WHERE contractor_id = $1 
          AND preferred_date = $2
          AND status IN ('assigned', 'in_progress')
          AND service_coordinates IS NOT NULL
        ORDER BY preferred_time_start
      `, [contractorId, date]);

      const jobs = jobsResult.rows;

      if (jobs.length <= 1) {
        return { optimized: false, reason: 'Not enough jobs to optimize' };
      }

      // Get contractor's home/starting location
      const contractorLocation = await this.mappingService.getContractorLocation(contractorId);
      if (!contractorLocation) {
        return { optimized: false, reason: 'Contractor location not available' };
      }

      // Prepare destinations for route optimization
      const destinations = jobs.map(job => ({
        jobId: job.id,
        latitude: job.latitude,
        longitude: job.longitude,
        address: `${job.service_address_line1}, ${job.service_city}, ${job.service_state}`,
        scheduledTime: job.preferred_time_start,
        duration: job.estimated_duration_hours || 2
      }));

      // Get optimized route
      const optimizedRoute = await this.mappingService.getOptimizedRoute(
        contractorLocation,
        destinations,
        { optimize: true, mode: 'driving' }
      );

      // Update job order if optimization provides significant savings
      const currentTotalTime = this.calculateCurrentRouteTime(jobs);
      const optimizedTotalTime = optimizedRoute.totalDuration.seconds;

      if (optimizedTotalTime < currentTotalTime * 0.85) { // 15% improvement
        await this.updateJobScheduleOrder(contractorId, date, optimizedRoute.optimizedOrder, destinations);
        
        return {
          optimized: true,
          timeSaved: currentTotalTime - optimizedTotalTime,
          newOrder: optimizedRoute.optimizedOrder,
          totalDistance: optimizedRoute.totalDistance.miles
        };
      }

      return { optimized: false, reason: 'Current schedule is already optimal' };

    } catch (error) {
      console.error('Route optimization error:', error);
      return { optimized: false, reason: 'Optimization failed' };
    }
  }

  /**
   * Calculate current route time
   */
  calculateCurrentRouteTime(jobs) {
    // Simple estimation: 30 minutes travel between jobs + job duration
    const travelTime = (jobs.length - 1) * 30 * 60; // seconds
    const workTime = jobs.reduce((total, job) => total + (job.estimated_duration_hours * 3600), 0);
    return travelTime + workTime;
  }

  /**
   * Update job schedule order based on optimization
   */
  async updateJobScheduleOrder(contractorId, date, optimizedOrder, destinations) {
    try {
      let currentTime = moment.tz(`${date} 08:00`, 'YYYY-MM-DD HH:mm', 'America/Chicago');

      for (const orderIndex of optimizedOrder) {
        const destination = destinations[orderIndex];
        const newStartTime = currentTime.format('HH:mm:ss');
        const newEndTime = currentTime.add(destination.duration, 'hours').format('HH:mm:ss');

        await this.db.query(`
          UPDATE jobs 
          SET 
            preferred_time_start = $2,
            preferred_time_end = $3
          WHERE id = $1
        `, [destination.jobId, newStartTime, newEndTime]);

        // Add travel time to next job (estimated 30 minutes)
        currentTime.add(30, 'minutes');
      }

    } catch (error) {
      console.error('Update job schedule order error:', error);
    }
  }

  // =================================================================
  // CALENDAR INTEGRATION
  // =================================================================

  /**
   * Create calendar event for scheduled job
   */
  async createCalendarEvent(job) {
    try {
      const cal = ical({
        domain: 'tradesplatform.com',
        name: 'Trades Platform Schedule',
        timezone: 'America/Chicago'
      });

      const startDateTime = moment.tz(
        `${job.preferred_date} ${job.preferred_time_start}`,
        'YYYY-MM-DD HH:mm:ss',
        'America/Chicago'
      );

      const endDateTime = moment.tz(
        `${job.preferred_date} ${job.preferred_time_end}`,
        'YYYY-MM-DD HH:mm:ss',
        'America/Chicago'
      );

      const event = cal.createEvent({
        start: startDateTime.toDate(),
        end: endDateTime.toDate(),
        summary: job.title,
        description: `
Job: ${job.title}
Address: ${job.service_address_line1}, ${job.service_city}, ${job.service_state}
Price: $${job.quoted_price || job.estimated_cost}
Notes: ${job.customer_notes || 'No additional notes'}

Trades Platform Job #${job.id}
        `.trim(),
        location: `${job.service_address_line1}, ${job.service_city}, ${job.service_state}`,
        url: `https://tradesplatform.com/jobs/${job.id}`,
        organizer: {
          name: 'Trades Platform',
          email: 'noreply@tradesplatform.com'
        }
      });

      // Save calendar event data
      await this.db.query(`
        INSERT INTO job_calendar_events (
          job_id, event_uid, calendar_data, created_at
        ) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (job_id) 
        DO UPDATE SET 
          event_uid = EXCLUDED.event_uid,
          calendar_data = EXCLUDED.calendar_data,
          updated_at = NOW()
      `, [job.id, event.uid(), cal.toString()]);

      return {
        eventUid: event.uid(),
        calendarData: cal.toString(),
        icsUrl: `https://tradesplatform.com/api/calendar/job/${job.id}.ics`
      };

    } catch (error) {
      console.error('Create calendar event error:', error);
      return null;
    }
  }

  /**
   * Get contractor's calendar for date range
   */
  async getContractorCalendar(contractorId, startDate, endDate) {
    try {
      const result = await this.db.query(`
        SELECT 
          j.*,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.phone as customer_phone
        FROM jobs j
        JOIN users c ON j.customer_id = c.id
        WHERE j.contractor_id = $1 
          AND j.preferred_date BETWEEN $2 AND $3
          AND j.status IN ('assigned', 'in_progress', 'completed')
        ORDER BY j.preferred_date, j.preferred_time_start
      `, [contractorId, startDate, endDate]);

      const events = result.rows.map(job => ({
        id: job.id,
        title: job.title,
        date: job.preferred_date,
        startTime: job.preferred_time_start,
        endTime: job.preferred_time_end,
        status: job.status,
        address: `${job.service_address_line1}, ${job.service_city}`,
        customer: {
          name: `${job.customer_first_name} ${job.customer_last_name}`,
          phone: job.customer_phone
        },
        price: job.quoted_price || job.estimated_cost,
        notes: job.customer_notes
      }));

      return { events };

    } catch (error) {
      console.error('Get contractor calendar error:', error);
      throw new Error(`Failed to get calendar: ${error.message}`);
    }
  }

  // =================================================================
  // UTILITY FUNCTIONS
  // =================================================================

  /**
   * Validate working hours format
   */
  validateWorkingHours(workingHours) {
    const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const day of requiredDays) {
      if (!workingHours[day]) {
        throw new Error(`Missing working hours for ${day}`);
      }

      const dayHours = workingHours[day];
      if (dayHours.enabled && (!dayHours.start || !dayHours.end)) {
        throw new Error(`Invalid working hours for ${day}`);
      }
    }
  }

  /**
   * Set blocked dates for contractor
   */
  async setBlockedDates(contractorId, blockedDates) {
    try {
      // Clear existing blocked dates
      await this.db.query(`
        DELETE FROM contractor_blocked_dates WHERE contractor_id = $1
      `, [contractorId]);

      // Add new blocked dates
      for (const blockedDate of blockedDates) {
        await this.db.query(`
          INSERT INTO contractor_blocked_dates (
            contractor_id, blocked_date, reason, all_day
          ) VALUES ($1, $2, $3, $4)
        `, [
          contractorId,
          blockedDate.date,
          blockedDate.reason || 'Unavailable',
          blockedDate.allDay !== false
        ]);
      }

    } catch (error) {
      console.error('Set blocked dates error:', error);
      throw new Error('Failed to set blocked dates');
    }
  }

  /**
   * Send scheduling notifications
   */
  async sendSchedulingNotifications(job) {
    if (!this.notificationService) return;

    try {
      // Notify customer
      await this.notificationService.sendMultiChannelNotification(job.customer_id, {
        channels: ['push', 'email'],
        title: 'Job Scheduled!',
        body: `Your job "${job.title}" has been scheduled for ${job.preferred_date}.`,
        template: 'job_scheduled',
        data: {
          type: 'job_scheduled',
          jobId: job.id,
          date: job.preferred_date,
          time: job.preferred_time_start
        }
      });

      // Notify contractor
      await this.notificationService.sendMultiChannelNotification(job.contractor_id, {
        channels: ['push'],
        title: 'New Job Added to Schedule',
        body: `"${job.title}" scheduled for ${job.preferred_date} at ${job.preferred_time_start}.`,
        data: {
          type: 'job_scheduled',
          jobId: job.id,
          date: job.preferred_date,
          time: job.preferred_time_start
        }
      });

    } catch (error) {
      console.error('Send scheduling notifications error:', error);
    }
  }

  /**
   * Send reschedule notifications
   */
  async sendRescheduleNotifications(job, newSchedulingData, requestedBy) {
    if (!this.notificationService) return;

    try {
      const isCustomerRequest = requestedBy === job.customer_id;
      const notifyUserId = isCustomerRequest ? job.contractor_id : job.customer_id;
      const requesterType = isCustomerRequest ? 'customer' : 'contractor';

      await this.notificationService.sendMultiChannelNotification(notifyUserId, {
        channels: ['push', 'sms'],
        title: 'Job Rescheduled',
        body: `The ${requesterType} has rescheduled "${job.title}" to ${newSchedulingData.newDate}.`,
        data: {
          type: 'job_rescheduled',
          jobId: job.id,
          newDate: newSchedulingData.newDate,
          newTime: newSchedulingData.newStartTime
        }
      });

    } catch (error) {
      console.error('Send reschedule notifications error:', error);
    }
  }

  /**
   * Get scheduling statistics for contractor
   */
  async getContractorSchedulingStats(contractorId, period = 'month') {
    try {
      const periodClause = period === 'week' ? 'INTERVAL \'7 days\'' : 'INTERVAL \'30 days\'';

      const result = await this.db.query(`
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_jobs,
          AVG(EXTRACT(EPOCH FROM (preferred_time_end::time - preferred_time_start::time))/3600) as avg_job_duration,
          COUNT(DISTINCT preferred_date) as working_days
        FROM jobs 
        WHERE contractor_id = $1 
          AND preferred_date >= NOW() - ${periodClause}
          AND status IN ('assigned', 'in_progress', 'completed', 'cancelled')
      `, [contractorId]);

      return result.rows[0];

    } catch (error) {
      console.error('Get scheduling stats error:', error);
      throw new Error('Failed to get scheduling statistics');
    }
  }
}

// =================================================================
// EXPORTS
// =================================================================

module.exports = {
  SchedulingService
};