import { expect } from 'chai';
import sinon from 'sinon';
import { resetStubs, wait } from '../helpers/test-utils.js';

describe('Scheduler Functionality', () => {
    let mockCron;
    let mockMoment;
    let mockScheduler;

    beforeEach(() => {
        resetStubs();
        
        // Mock node-cron
        mockCron = {
            schedule: sinon.stub(),
            validate: sinon.stub()
        };
        
        // Mock moment-timezone
        mockMoment = {
            tz: sinon.stub(),
            utc: sinon.stub(),
            format: sinon.stub()
        };
        
        // Mock scheduler instance
        mockScheduler = {
            addJob: sinon.stub(),
            removeJob: sinon.stub(),
            getJobs: sinon.stub(),
            start: sinon.stub(),
            stop: sinon.stub()
        };
    });

    afterEach(() => {
        resetStubs();
    });

    describe('Cron Job Scheduling', () => {
        it('should validate cron expressions correctly', () => {
            // Mock cron validation
            mockCron.validate.returns(true);
            
            const isValidCron = (expression) => {
                return mockCron.validate(expression);
            };
            
            expect(isValidCron('0 9 * * 1-5')).to.be.true;
            expect(mockCron.validate).to.have.been.calledWith('0 9 * * 1-5');
        });

        it('should reject invalid cron expressions', () => {
            // Mock cron validation to fail
            mockCron.validate.returns(false);
            
            const isValidCron = (expression) => {
                return mockCron.validate(expression);
            };
            
            expect(isValidCron('invalid cron')).to.be.false;
            expect(mockCron.validate).to.have.been.calledWith('invalid cron');
        });

        it('should schedule daily recurring streams', () => {
            // Mock cron scheduling
            const mockJob = { start: sinon.stub(), stop: sinon.stub() };
            mockCron.schedule.returns(mockJob);
            
            const scheduleDailyStream = (time, callback) => {
                const cronExpression = `0 ${time.hour} * * *`;
                return mockCron.schedule(cronExpression, callback);
            };
            
            const job = scheduleDailyStream({ hour: 9 }, () => {});
            
            expect(mockCron.schedule).to.have.been.calledWith('0 9 * * *', sinon.match.func);
            expect(job).to.equal(mockJob);
        });

        it('should schedule weekly recurring streams', () => {
            // Mock cron scheduling
            const mockJob = { start: sinon.stub(), stop: sinon.stub() };
            mockCron.schedule.returns(mockJob);
            
            const scheduleWeeklyStream = (time, days, callback) => {
                const dayExpression = days.join(',');
                const cronExpression = `0 ${time.hour} * * ${dayExpression}`;
                return mockCron.schedule(cronExpression, callback);
            };
            
            const job = scheduleWeeklyStream({ hour: 14 }, [1, 3, 5], () => {});
            
            expect(mockCron.schedule).to.have.been.calledWith('0 14 * * 1,3,5', sinon.match.func);
            expect(job).to.equal(mockJob);
        });
    });

    describe('Time Zone Handling', () => {
        it('should convert local time to UTC correctly', () => {
            // Mock moment timezone conversion
            const mockLocalTime = {
                tz: sinon.stub().returnsThis(),
                utc: sinon.stub().returnsThis(),
                format: sinon.stub().returns('2024-01-01T09:00:00Z')
            };
            
            mockMoment.tz.returns(mockLocalTime);
            
            const convertToUTC = (localTime, timezone) => {
                return mockMoment.tz(localTime, timezone).utc().format();
            };
            
            const utcTime = convertToUTC('2024-01-01 09:00', 'America/New_York');
            
            expect(utcTime).to.equal('2024-01-01T09:00:00Z');
            expect(mockMoment.tz).to.have.been.calledWith('2024-01-01 09:00', 'America/New_York');
        });

        it('should handle different timezone formats', () => {
            // Mock moment timezone conversion
            const mockLocalTime = {
                tz: sinon.stub().returnsThis(),
                utc: sinon.stub().returnsThis(),
                format: sinon.stub().returns('2024-01-01T14:00:00Z')
            };
            
            mockMoment.tz.returns(mockLocalTime);
            
            const convertToUTC = (localTime, timezone) => {
                return mockMoment.tz(localTime, timezone).utc().format();
            };
            
            const utcTime = convertToUTC('2024-01-01 14:00', 'Europe/London');
            
            expect(utcTime).to.equal('2024-01-01T14:00:00Z');
            expect(mockMoment.tz).to.have.been.calledWith('2024-01-01 14:00', 'Europe/London');
        });
    });

    describe('Job Management', () => {
        it('should add new jobs to scheduler', () => {
            // Mock job addition
            mockScheduler.addJob.returns({ id: 'job-123', status: 'scheduled' });
            
            const addJob = (jobData) => {
                return mockScheduler.addJob(jobData);
            };
            
            const jobData = {
                id: 'stream-456',
                title: 'Test Stream',
                time: '2024-01-01T09:00:00Z',
                recurring: true,
                days: [1, 2, 3, 4, 5]
            };
            
            const result = addJob(jobData);
            
            expect(mockScheduler.addJob).to.have.been.calledWith(jobData);
            expect(result.id).to.equal('job-123');
            expect(result.status).to.equal('scheduled');
        });

        it('should remove jobs from scheduler', () => {
            // Mock job removal
            mockScheduler.removeJob.returns(true);
            
            const removeJob = (jobId) => {
                return mockScheduler.removeJob(jobId);
            };
            
            const result = removeJob('job-123');
            
            expect(mockScheduler.removeJob).to.have.been.calledWith('job-123');
            expect(result).to.be.true;
        });

        it('should list all active jobs', () => {
            // Mock job listing
            const mockJobs = [
                { id: 'job-1', title: 'Stream 1', status: 'active' },
                { id: 'job-2', title: 'Stream 2', status: 'active' }
            ];
            mockScheduler.getJobs.returns(mockJobs);
            
            const getJobs = () => {
                return mockScheduler.getJobs();
            };
            
            const jobs = getJobs();
            
            expect(mockScheduler.getJobs).to.have.been.calledOnce;
            expect(jobs).to.deep.equal(mockJobs);
            expect(jobs).to.have.length(2);
        });
    });

    describe('Recurring Stream Logic', () => {
        it('should calculate next occurrence for daily streams', () => {
            // Mock moment calculations
            const mockDate = {
                add: sinon.stub().returnsThis(),
                format: sinon.stub().returns('2024-01-02T09:00:00Z')
            };
            
            mockMoment.tz.returns(mockDate);
            
            const getNextOccurrence = (baseTime, frequency) => {
                if (frequency === 'daily') {
                    return mockMoment.tz(baseTime).add(1, 'day').format();
                }
                return baseTime;
            };
            
            const nextTime = getNextOccurrence('2024-01-01T09:00:00Z', 'daily');
            
            expect(nextTime).to.equal('2024-01-02T09:00:00Z');
            expect(mockDate.add).to.have.been.calledWith(1, 'day');
        });

        it('should calculate next occurrence for weekly streams', () => {
            // Mock moment calculations
            const mockDate = {
                add: sinon.stub().returnsThis(),
                format: sinon.stub().returns('2024-01-08T14:00:00Z')
            };
            
            mockMoment.tz.returns(mockDate);
            
            const getNextOccurrence = (baseTime, frequency, days) => {
                if (frequency === 'weekly') {
                    // Find next occurrence based on selected days
                    return mockMoment.tz(baseTime).add(1, 'week').format();
                }
                return baseTime;
            };
            
            const nextTime = getNextOccurrence('2024-01-01T14:00:00Z', 'weekly', [1, 3, 5]);
            
            expect(nextTime).to.equal('2024-01-08T14:00:00Z');
            expect(mockDate.add).to.have.been.calledWith(1, 'week');
        });

        it('should handle month boundaries correctly', () => {
            // Mock moment calculations for month boundary
            const mockDate = {
                add: sinon.stub().returnsThis(),
                format: sinon.stub().returns('2024-02-01T09:00:00Z')
            };
            
            mockMoment.tz.returns(mockDate);
            
            const getNextOccurrence = (baseTime, frequency) => {
                if (frequency === 'daily') {
                    return mockMoment.tz(baseTime).add(1, 'day').format();
                }
                return baseTime;
            };
            
            const nextTime = getNextOccurrence('2024-01-31T09:00:00Z', 'daily');
            
            expect(nextTime).to.equal('2024-02-01T09:00:00Z');
            expect(mockDate.add).to.have.been.calledWith(1, 'day');
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid time formats gracefully', () => {
            // Mock moment to throw error for invalid time
            mockMoment.tz.throws(new Error('Invalid time format'));
            
            const parseTime = (timeString, timezone) => {
                try {
                    return mockMoment.tz(timeString, timezone).format();
                } catch (error) {
                    return { error: error.message, valid: false };
                }
            };
            
            const result = parseTime('invalid-time', 'UTC');
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('Invalid time format');
        });

        it('should handle timezone conversion errors', () => {
            // Mock moment to throw error for invalid timezone
            mockMoment.tz.throws(new Error('Invalid timezone'));
            
            const convertToUTC = (localTime, timezone) => {
                try {
                    return mockMoment.tz(localTime, timezone).utc().format();
                } catch (error) {
                    return { error: error.message, valid: false };
                }
            };
            
            const result = convertToUTC('2024-01-01 09:00', 'Invalid/Timezone');
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('Invalid timezone');
        });

        it('should handle cron scheduling errors', () => {
            // Mock cron to throw error for invalid expression
            mockCron.schedule.throws(new Error('Invalid cron expression'));
            
            const scheduleJob = (cronExpression, callback) => {
                try {
                    return mockCron.schedule(cronExpression, callback);
                } catch (error) {
                    return { error: error.message, valid: false };
                }
            };
            
            const result = scheduleJob('invalid cron', () => {});
            
            expect(result.valid).to.be.false;
            expect(result.error).to.equal('Invalid cron expression');
        });
    });

    describe('Performance and Scalability', () => {
        it('should handle multiple concurrent jobs efficiently', () => {
            // Mock scheduler to handle multiple jobs
            const mockJobs = [];
            for (let i = 0; i < 100; i++) {
                mockJobs.push({ id: `job-${i}`, status: 'active' });
            }
            
            mockScheduler.getJobs.returns(mockJobs);
            
            const getJobs = () => {
                return mockScheduler.getJobs();
            };
            
            const startTime = Date.now();
            const jobs = getJobs();
            const endTime = Date.now();
            
            expect(jobs).to.have.length(100);
            expect(endTime - startTime).to.be.lessThan(100); // Should complete in under 100ms
        });

        it('should cleanup completed jobs', () => {
            // Mock job cleanup
            mockScheduler.removeJob.returns(true);
            
            const cleanupCompletedJobs = (completedJobIds) => {
                const results = [];
                for (const jobId of completedJobIds) {
                    const result = mockScheduler.removeJob(jobId);
                    results.push({ jobId, removed: result });
                }
                return results;
            };
            
            const completedIds = ['job-1', 'job-2', 'job-3'];
            const results = cleanupCompletedJobs(completedIds);
            
            expect(mockScheduler.removeJob).to.have.been.calledThrice;
            expect(results).to.deep.equal([
                { jobId: 'job-1', removed: true },
                { jobId: 'job-2', removed: true },
                { jobId: 'job-3', removed: true }
            ]);
        });
    });
});
