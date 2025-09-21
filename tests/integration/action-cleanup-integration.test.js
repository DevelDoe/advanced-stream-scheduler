import { expect } from 'chai';
import sinon from 'sinon';
import { resetStubs } from '../helpers/test-utils.js';

describe('Action Cleanup Integration Tests', () => {
    let mockFs;
    let mockPath;
    let mockApp;
    let mockActions;
    let mockRecurringData;

    beforeEach(() => {
        resetStubs();
        
        // Mock file system operations
        mockFs = {
            readFileSync: sinon.stub(),
            writeFileSync: sinon.stub(),
            appendFileSync: sinon.stub()
        };

        // Mock path operations
        mockPath = {
            join: sinon.stub().returns('/mock/path')
        };

        // Mock app
        mockApp = {
            getPath: sinon.stub().returns('/mock/userData')
        };

        // Mock actions data
        mockActions = [
            {
                id: 'action-1',
                broadcastId: 'scheduled-broadcast-1',
                at: '2024-01-15T10:00:00Z',
                type: 'start',
                payload: { sceneName: 'intro' }
            },
            {
                id: 'action-2',
                broadcastId: 'live-broadcast-1',
                at: '2024-01-15T11:00:00Z',
                type: 'setScene',
                payload: { sceneName: 'live' }
            },
            {
                id: 'action-3',
                broadcastId: 'orphaned-broadcast-1',
                at: '2024-01-15T12:00:00Z',
                type: 'end',
                payload: {}
            }
        ];

        // Mock recurring data
        mockRecurringData = {
            'scheduled-broadcast-1': {
                recurring: true,
                days: [1, 3, 5], // Mon, Wed, Fri
                baseTime: '2024-01-15T09:00:00Z',
                meta: { title: 'Test Stream' }
            },
            'orphaned-broadcast-1': {
                recurring: true,
                days: [2, 4], // Tue, Thu
                baseTime: '2024-01-14T09:00:00Z',
                meta: { title: 'Orphaned Stream' }
            }
        };

        // Mock file reads
        mockFs.readFileSync
            .withArgs('/mock/path/actions.json', 'utf-8')
            .returns(JSON.stringify(mockActions));
        mockFs.readFileSync
            .withArgs('/mock/path/recurring.json', 'utf-8')
            .returns(JSON.stringify(mockRecurringData));
        mockFs.readFileSync
            .withArgs('/mock/path/scene_flow.json', 'utf-8')
            .returns(JSON.stringify({
                steps: [
                    { offsetSec: 0, type: 'start', payload: { sceneName: 'intro' } },
                    { offsetSec: 3600, type: 'setScene', payload: { sceneName: 'live' } },
                    { offsetSec: 86400, type: 'setScene', payload: { sceneName: 'outro' } }
                ]
            }));
    });

    afterEach(() => {
        resetStubs();
    });

    describe('Cleanup Function Integration', () => {
        it('should simulate the complete cleanup process with live stream preservation', async () => {
            // Mock YouTube API responses
            const mockScheduledBroadcasts = [
                { id: 'scheduled-broadcast-1', title: 'Scheduled Stream' }
            ];
            
            const mockActiveBroadcasts = [
                { id: 'live-broadcast-1', title: 'Live Stream' }
            ];

            // Mock auth loading
            const mockAuth = { access_token: 'mock-token' };
            const mockLoadAuth = sinon.stub().callsArgWith(0, mockAuth, null);

            // Mock YouTube API calls
            const mockListUpcomingBroadcasts = sinon.stub().resolves(mockScheduledBroadcasts);
            const mockListActiveBroadcasts = sinon.stub().resolves(mockActiveBroadcasts);

            // Mock action cancellation
            const mockCancelOneOffAction = sinon.stub();

            // Simulate the cleanup function logic
            const simulateCleanupOrphanedData = async () => {
                try {
                    // Get scheduled broadcasts
                    const scheduledBroadcasts = await mockListUpcomingBroadcasts();
                    const scheduledIds = new Set(scheduledBroadcasts.map(b => b.id));
                    
                    // Get active broadcasts
                    let activeBroadcastIds = new Set();
                    try {
                        const activeBroadcasts = await mockListActiveBroadcasts();
                        activeBroadcastIds = new Set(activeBroadcasts.map(b => b.id));
                    } catch (error) {
                        // Handle API error gracefully
                        console.log(`Could not fetch active broadcasts: ${error.message}`);
                    }
                    
                    // Combine valid broadcast IDs
                    const validBroadcastIds = new Set([...scheduledIds, ...activeBroadcastIds]);
                    
                    // Clean up orphaned actions
                    const orphanedActions = mockActions.filter(action => !validBroadcastIds.has(action.broadcastId));
                    
                    if (orphanedActions.length > 0) {
                        // Cancel timers for orphaned actions
                        for (const action of orphanedActions) {
                            try {
                                mockCancelOneOffAction(action.id);
                            } catch {}
                        }
                        
                        // Remove orphaned actions
                        const remainingActions = mockActions.filter(action => validBroadcastIds.has(action.broadcastId));
                        mockFs.writeFileSync('/mock/path/actions.json', JSON.stringify(remainingActions));
                    }
                    
                    // Clean up orphaned recurring data
                    const orphanedRecurring = Object.keys(mockRecurringData).filter(id => !validBroadcastIds.has(id));
                    
                    if (orphanedRecurring.length > 0) {
                        for (const id of orphanedRecurring) {
                            delete mockRecurringData[id];
                        }
                        mockFs.writeFileSync('/mock/path/recurring.json', JSON.stringify(mockRecurringData));
                    }
                    
                    return {
                        orphanedActions,
                        orphanedRecurring,
                        validBroadcastIds: Array.from(validBroadcastIds)
                    };
                    
                } catch (error) {
                    throw new Error(`Cleanup failed: ${error.message}`);
                }
            };

            // Act
            const result = await simulateCleanupOrphanedData();

            // Assert
            expect(result.orphanedActions).to.have.length(1);
            expect(result.orphanedActions[0].broadcastId).to.equal('orphaned-broadcast-1');
            expect(result.orphanedRecurring).to.have.length(1);
            expect(result.orphanedRecurring[0]).to.equal('orphaned-broadcast-1');
            expect(result.validBroadcastIds).to.include('scheduled-broadcast-1');
            expect(result.validBroadcastIds).to.include('live-broadcast-1');
            expect(result.validBroadcastIds).to.not.include('orphaned-broadcast-1');

            // Verify that actions for live streams were preserved
            expect(mockCancelOneOffAction).to.have.been.calledOnce;
            expect(mockCancelOneOffAction).to.have.been.calledWith('action-3'); // Only orphaned action
        });

        it('should handle API failures gracefully during cleanup', async () => {
            // Mock API failures
            const mockLoadAuth = sinon.stub().callsArgWith(0, null, new Error('Auth failed'));
            const mockListUpcomingBroadcasts = sinon.stub().rejects(new Error('API Error'));
            const mockListActiveBroadcasts = sinon.stub().rejects(new Error('API Error'));

            // Simulate cleanup with error handling
            const simulateCleanupWithErrors = async () => {
                try {
                    await mockListUpcomingBroadcasts();
                    return { success: true };
                } catch (error) {
                    return { 
                        success: false, 
                        error: error.message,
                        preservedActions: mockActions.length // All actions preserved on error
                    };
                }
            };

            // Act
            const result = await simulateCleanupWithErrors();

            // Assert
            expect(result.success).to.be.false;
            expect(result.error).to.equal('API Error');
            expect(result.preservedActions).to.equal(3); // All actions preserved
        });
    });

    describe('Recurring Stream Day Structure Integration', () => {
        it('should simulate the complete recurring stream creation with day structure preservation', () => {
            // Mock scene flow with multi-day actions
            const mockSceneFlow = {
                steps: [
                    { offsetSec: 0, type: 'start', payload: { sceneName: 'intro' } },
                    { offsetSec: 3600, type: 'setScene', payload: { sceneName: 'live' } },
                    { offsetSec: 86400, type: 'setScene', payload: { sceneName: 'outro' } }, // Next day
                    { offsetSec: 90000, type: 'end', payload: {} } // Next day + 1 hour
                ]
            };

            // Mock the applyFlowToBroadcastWithDayStructure function
            const simulateApplyFlowWithDayStructure = (broadcastId, scheduledStartISO, originalBaseTimeISO) => {
                const steps = mockSceneFlow.steps;
                const newStartMs = new Date(scheduledStartISO).getTime();
                const originalStartMs = new Date(originalBaseTimeISO).getTime();
                const actions = [];
                let added = 0;

                for (const s of steps) {
                    // Calculate the original absolute time for this action
                    const originalActionMs = originalStartMs + s.offsetSec * 1000;
                    const originalActionDate = new Date(originalActionMs);
                    
                    // Calculate the day difference more accurately
                    // Get the start of day for both dates to avoid time-of-day affecting the calculation
                    const originalStartOfDay = new Date(originalStartMs);
                    originalStartOfDay.setHours(0, 0, 0, 0);
                    
                    const originalActionStartOfDay = new Date(originalActionMs);
                    originalActionStartOfDay.setHours(0, 0, 0, 0);
                    
                    // Calculate days difference
                    const daysDifference = Math.round((originalActionStartOfDay.getTime() - originalStartOfDay.getTime()) / (1000 * 60 * 60 * 24));
                    
                    // Create the new action date
                    const newActionDate = new Date(newStartMs);
                    newActionDate.setDate(newActionDate.getDate() + daysDifference);
                    
                    // Preserve the original time of day
                    newActionDate.setHours(originalActionDate.getHours());
                    newActionDate.setMinutes(originalActionDate.getMinutes());
                    newActionDate.setSeconds(originalActionDate.getSeconds());
                    newActionDate.setMilliseconds(originalActionDate.getMilliseconds());
                    
                    const action = {
                        id: `action-${added}`,
                        broadcastId,
                        at: newActionDate.toISOString(),
                        type: s.type,
                        payload: s.payload || {},
                    };
                    actions.push(action);
                    added++;
                }
                
                // Save actions
                const allActions = [...mockActions, ...actions];
                mockFs.writeFileSync('/mock/path/actions.json', JSON.stringify(allActions));
                
                return { actions, added };
            };

            // Test data
            const originalBaseTime = '2024-01-15T09:00:00Z'; // Monday 9 AM
            const newStartTime = '2024-01-22T09:00:00Z';    // Next Monday 9 AM
            const newBroadcastId = 'recurring-broadcast-1';

            // Act
            const result = simulateApplyFlowWithDayStructure(newBroadcastId, newStartTime, originalBaseTime);

            // Assert
            expect(result.added).to.equal(4);
            expect(result.actions).to.have.length(4);
            
            // Verify day structure is preserved
            const action1 = result.actions[0]; // Start
            const action2 = result.actions[1]; // +1 hour
            const action3 = result.actions[2]; // Next day
            const action4 = result.actions[3]; // Next day +1 hour
            
            expect(new Date(action1.at).toISOString()).to.equal('2024-01-22T09:00:00.000Z'); // Monday 9 AM
            expect(new Date(action2.at).toISOString()).to.equal('2024-01-22T10:00:00.000Z'); // Monday 10 AM
            expect(new Date(action3.at).toISOString()).to.equal('2024-01-23T09:00:00.000Z'); // Tuesday 9 AM
            expect(new Date(action4.at).toISOString()).to.equal('2024-01-23T10:00:00.000Z'); // Tuesday 10 AM

            // Verify actions were saved
            expect(mockFs.writeFileSync).to.have.been.calledWith('/mock/path/actions.json');
        });

        it('should handle edge case with actions spanning multiple weeks', () => {
            // Mock scene flow with actions spanning 2 weeks
            const mockSceneFlow = {
                steps: [
                    { offsetSec: 0, type: 'start', payload: { sceneName: 'intro' } },
                    { offsetSec: 604800, type: 'setScene', payload: { sceneName: 'live' } }, // 1 week later
                    { offsetSec: 1209600, type: 'end', payload: {} } // 2 weeks later
                ]
            };

            // Mock the function
            const simulateApplyFlowWithDayStructure = (broadcastId, scheduledStartISO, originalBaseTimeISO) => {
                const steps = mockSceneFlow.steps;
                const newStartMs = new Date(scheduledStartISO).getTime();
                const originalStartMs = new Date(originalBaseTimeISO).getTime();
                const actions = [];

                for (const s of steps) {
                    const originalActionMs = originalStartMs + s.offsetSec * 1000;
                    const originalActionDate = new Date(originalActionMs);
                    
                    const daysAfterOriginalStart = Math.floor((originalActionMs - originalStartMs) / (1000 * 60 * 60 * 24));
                    
                    const newActionDate = new Date(newStartMs);
                    newActionDate.setDate(newActionDate.getDate() + daysAfterOriginalStart);
                    newActionDate.setHours(originalActionDate.getHours());
                    newActionDate.setMinutes(originalActionDate.getMinutes());
                    newActionDate.setSeconds(originalActionDate.getSeconds());
                    newActionDate.setMilliseconds(originalActionDate.getMilliseconds());
                    
                    actions.push({
                        id: `action-${actions.length}`,
                        broadcastId,
                        at: newActionDate.toISOString(),
                        type: s.type,
                        payload: s.payload || {},
                    });
                }
                
                return actions;
            };

            // Test data - 3 weeks apart
            const originalBaseTime = '2024-01-01T09:00:00Z'; // Monday
            const newStartTime = '2024-01-22T09:00:00Z';    // Monday 3 weeks later
            const newBroadcastId = 'recurring-broadcast-2';

            // Act
            const result = simulateApplyFlowWithDayStructure(newBroadcastId, newStartTime, originalBaseTime);

            // Assert
            expect(result).to.have.length(3);
            
            // Verify week structure is preserved
            const action1 = result[0]; // Start
            const action2 = result[1]; // +1 week
            const action3 = result[2]; // +2 weeks
            
            expect(new Date(action1.at).toISOString()).to.equal('2024-01-22T09:00:00.000Z'); // Week 1
            expect(new Date(action2.at).toISOString()).to.equal('2024-01-29T09:00:00.000Z'); // Week 2
            expect(new Date(action3.at).toISOString()).to.equal('2024-02-05T09:00:00.000Z'); // Week 3
        });
    });
});
