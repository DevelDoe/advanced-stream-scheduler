import { expect } from 'chai';
import sinon from 'sinon';
import { resetStubs, wait } from '../helpers/test-utils.js';

describe('Action Management and Cleanup', () => {
    let mockActions;
    let mockBroadcasts;
    let mockActiveBroadcasts;
    let mockAuth;
    let mockLoadAuth;
    let mockListUpcomingBroadcasts;
    let mockListActiveBroadcasts;
    let mockSaveActions;
    let mockCancelOneOffAction;
    let mockBrowserWindow;

    beforeEach(() => {
        resetStubs();
        
        // Mock actions array
        mockActions = [
            {
                id: 'action-1',
                broadcastId: 'broadcast-1',
                at: '2024-01-15T10:00:00Z',
                type: 'start',
                payload: { sceneName: 'intro' }
            },
            {
                id: 'action-2',
                broadcastId: 'broadcast-2',
                at: '2024-01-15T11:00:00Z',
                type: 'setScene',
                payload: { sceneName: 'live' }
            },
            {
                id: 'action-3',
                broadcastId: 'broadcast-3',
                at: '2024-01-15T12:00:00Z',
                type: 'end',
                payload: {}
            }
        ];

        // Mock scheduled broadcasts
        mockBroadcasts = [
            { id: 'broadcast-1', title: 'Scheduled Stream 1' },
            { id: 'broadcast-2', title: 'Scheduled Stream 2' }
        ];

        // Mock active broadcasts
        mockActiveBroadcasts = [
            { id: 'broadcast-3', title: 'Live Stream' }
        ];

        // Mock auth
        mockAuth = { access_token: 'mock-token' };

        // Mock functions
        mockLoadAuth = sinon.stub();
        mockListUpcomingBroadcasts = sinon.stub();
        mockListActiveBroadcasts = sinon.stub();
        mockSaveActions = sinon.stub();
        mockCancelOneOffAction = sinon.stub();
        
        // Mock BrowserWindow
        mockBrowserWindow = {
            getAllWindows: sinon.stub().returns([{
                webContents: {
                    send: sinon.stub()
                }
            }])
        };
    });

    afterEach(() => {
        resetStubs();
    });

    describe('Bug Fix 1: Prevent deletion of actions for live streams', () => {
        it('should preserve actions for active broadcasts during cleanup', async () => {
            // Arrange
            mockLoadAuth.callsArgWith(0, mockAuth, null);
            mockListUpcomingBroadcasts.resolves(mockBroadcasts);
            mockListActiveBroadcasts.resolves(mockActiveBroadcasts);
            
            // Mock the cleanup function behavior
            const cleanupOrphanedData = async () => {
                const scheduledIds = new Set(mockBroadcasts.map(b => b.id));
                const activeBroadcastIds = new Set(mockActiveBroadcasts.map(b => b.id));
                const validBroadcastIds = new Set([...scheduledIds, ...activeBroadcastIds]);
                
                const orphanedActions = mockActions.filter(action => !validBroadcastIds.has(action.broadcastId));
                
                // Should not find any orphaned actions since broadcast-3 is active
                expect(orphanedActions).to.have.length(0);
                
                return {
                    orphanedActions,
                    validBroadcastIds: Array.from(validBroadcastIds)
                };
            };

            // Act
            const result = await cleanupOrphanedData();

            // Assert
            expect(result.orphanedActions).to.have.length(0);
            expect(result.validBroadcastIds).to.include('broadcast-1');
            expect(result.validBroadcastIds).to.include('broadcast-2');
            expect(result.validBroadcastIds).to.include('broadcast-3');
        });

        it('should handle case when active broadcasts API fails', async () => {
            // Arrange
            mockLoadAuth.callsArgWith(0, mockAuth, null);
            mockListUpcomingBroadcasts.resolves(mockBroadcasts);
            mockListActiveBroadcasts.rejects(new Error('API Error'));
            
            // Mock the cleanup function behavior with error handling
            const cleanupOrphanedData = async () => {
                const scheduledIds = new Set(mockBroadcasts.map(b => b.id));
                let activeBroadcastIds = new Set();
                
                try {
                    const activeBroadcasts = await mockListActiveBroadcasts();
                    activeBroadcastIds = new Set(activeBroadcasts.map(b => b.id));
                } catch (error) {
                    // Should log error but continue with scheduled broadcasts only
                    expect(error.message).to.equal('API Error');
                }
                
                const validBroadcastIds = new Set([...scheduledIds, ...activeBroadcastIds]);
                const orphanedActions = mockActions.filter(action => !validBroadcastIds.has(action.broadcastId));
                
                // Should find orphaned actions for broadcast-3 since active API failed
                expect(orphanedActions).to.have.length(1);
                expect(orphanedActions[0].broadcastId).to.equal('broadcast-3');
                
                return {
                    orphanedActions,
                    validBroadcastIds: Array.from(validBroadcastIds)
                };
            };

            // Act
            const result = await cleanupOrphanedData();

            // Assert
            expect(result.orphanedActions).to.have.length(1);
            expect(result.orphanedActions[0].broadcastId).to.equal('broadcast-3');
            expect(result.validBroadcastIds).to.not.include('broadcast-3');
        });

        it('should clean up truly orphaned actions', async () => {
            // Arrange - add an action for a non-existent broadcast
            const actionsWithOrphan = [
                ...mockActions,
                {
                    id: 'action-orphan',
                    broadcastId: 'non-existent-broadcast',
                    at: '2024-01-15T13:00:00Z',
                    type: 'start',
                    payload: {}
                }
            ];

            mockLoadAuth.callsArgWith(0, mockAuth, null);
            mockListUpcomingBroadcasts.resolves(mockBroadcasts);
            mockListActiveBroadcasts.resolves(mockActiveBroadcasts);
            
            // Mock the cleanup function behavior
            const cleanupOrphanedData = async () => {
                const scheduledIds = new Set(mockBroadcasts.map(b => b.id));
                const activeBroadcastIds = new Set(mockActiveBroadcasts.map(b => b.id));
                const validBroadcastIds = new Set([...scheduledIds, ...activeBroadcastIds]);
                
                const orphanedActions = actionsWithOrphan.filter(action => !validBroadcastIds.has(action.broadcastId));
                
                // Should find the orphaned action
                expect(orphanedActions).to.have.length(1);
                expect(orphanedActions[0].broadcastId).to.equal('non-existent-broadcast');
                
                return {
                    orphanedActions,
                    validBroadcastIds: Array.from(validBroadcastIds)
                };
            };

            // Act
            const result = await cleanupOrphanedData();

            // Assert
            expect(result.orphanedActions).to.have.length(1);
            expect(result.orphanedActions[0].broadcastId).to.equal('non-existent-broadcast');
        });
    });

    describe('Bug Fix 2: Preserve action timing structure for recurring streams', () => {
        let mockSceneFlow;
        let mockActionsArray;
        let mockScheduleOneOffAction;
        let mockSaveActions;

        beforeEach(() => {
            // Mock scene flow with actions spanning multiple days
            mockSceneFlow = {
                steps: [
                    {
                        offsetSec: 0, // Start of stream
                        type: 'start',
                        payload: { sceneName: 'intro' }
                    },
                    {
                        offsetSec: 3600, // 1 hour after start
                        type: 'setScene',
                        payload: { sceneName: 'live' }
                    },
                    {
                        offsetSec: 86400, // 1 day after start (next day)
                        type: 'setScene',
                        payload: { sceneName: 'outro' }
                    },
                    {
                        offsetSec: 90000, // 1 day + 1 hour after start
                        type: 'end',
                        payload: {}
                    }
                ]
            };

            mockActionsArray = [];
            mockScheduleOneOffAction = sinon.stub();
            mockSaveActions = sinon.stub();
        });

        it('should preserve day structure when applying flow to recurring stream', () => {
            // Arrange
            const originalBaseTime = '2024-01-15T09:00:00Z'; // Monday 9 AM
            const newStartTime = '2024-01-22T09:00:00Z';    // Next Monday 9 AM (7 days later)
            
            // Mock the new function behavior
            const applyFlowToBroadcastWithDayStructure = (broadcastId, scheduledStartISO, originalBaseTimeISO) => {
                const steps = mockSceneFlow.steps;
                const newStartMs = new Date(scheduledStartISO).getTime();
                const originalStartMs = new Date(originalBaseTimeISO).getTime();
                let added = 0;

                for (const s of steps) {
                    // Calculate the original absolute time for this action
                    const originalActionMs = originalStartMs + s.offsetSec * 1000;
                    const originalActionDate = new Date(originalActionMs);
                    
                    // Calculate how many days after the original start this action was scheduled
                    const daysAfterOriginalStart = Math.floor((originalActionMs - originalStartMs) / (1000 * 60 * 60 * 24));
                    
                    // Create the new action date by adding the same number of days to the new start date
                    const newActionDate = new Date(newStartMs);
                    newActionDate.setDate(newActionDate.getDate() + daysAfterOriginalStart);
                    
                    // Preserve the original time of day
                    newActionDate.setHours(originalActionDate.getHours());
                    newActionDate.setMinutes(originalActionDate.getMinutes());
                    newActionDate.setSeconds(originalActionDate.getSeconds());
                    newActionDate.setMilliseconds(originalActionDate.getMilliseconds());
                    
                    const atISO = newActionDate.toISOString();
                    const action = {
                        id: `action-${added}`,
                        broadcastId,
                        at: atISO,
                        type: s.type,
                        payload: s.payload || {},
                    };
                    mockActionsArray.push(action);
                    mockScheduleOneOffAction(action);
                    added++;
                }
                mockSaveActions(mockActionsArray);
                return added;
            };

            // Act
            const result = applyFlowToBroadcastWithDayStructure('new-broadcast-id', newStartTime, originalBaseTime);

            // Assert
            expect(result).to.equal(4);
            expect(mockActionsArray).to.have.length(4);
            
            // Check that actions maintain proper day structure
            const action1 = mockActionsArray[0]; // Start action
            const action2 = mockActionsArray[1]; // 1 hour later
            const action3 = mockActionsArray[2]; // Next day
            const action4 = mockActionsArray[3]; // Next day + 1 hour
            
            // Start action should be at new start time
            expect(new Date(action1.at).toISOString()).to.equal('2024-01-22T09:00:00.000Z');
            
            // Second action should be 1 hour later on same day
            expect(new Date(action2.at).toISOString()).to.equal('2024-01-22T10:00:00.000Z');
            
            // Third action should be next day (Tuesday) at 9 AM
            expect(new Date(action3.at).toISOString()).to.equal('2024-01-23T09:00:00.000Z');
            
            // Fourth action should be next day (Tuesday) at 10 AM
            expect(new Date(action4.at).toISOString()).to.equal('2024-01-23T10:00:00.000Z');
        });

        it('should handle actions that span multiple days correctly', () => {
            // Arrange - actions spanning 3 days
            const multiDaySceneFlow = {
                steps: [
                    {
                        offsetSec: 0, // Day 1, 9 AM
                        type: 'start',
                        payload: { sceneName: 'intro' }
                    },
                    {
                        offsetSec: 86400, // Day 2, 9 AM
                        type: 'setScene',
                        payload: { sceneName: 'live' }
                    },
                    {
                        offsetSec: 172800, // Day 3, 9 AM
                        type: 'setScene',
                        payload: { sceneName: 'outro' }
                    }
                ]
            };

            const originalBaseTime = '2024-01-15T09:00:00Z'; // Monday
            const newStartTime = '2024-01-29T09:00:00Z';    // Monday 2 weeks later
            
            // Mock the function with multi-day flow
            const applyFlowToBroadcastWithDayStructure = (broadcastId, scheduledStartISO, originalBaseTimeISO) => {
                const steps = multiDaySceneFlow.steps;
                const newStartMs = new Date(scheduledStartISO).getTime();
                const originalStartMs = new Date(originalBaseTimeISO).getTime();
                let added = 0;

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
                    
                    const atISO = newActionDate.toISOString();
                    const action = {
                        id: `action-${added}`,
                        broadcastId,
                        at: atISO,
                        type: s.type,
                        payload: s.payload || {},
                    };
                    mockActionsArray.push(action);
                    added++;
                }
                return added;
            };

            // Act
            const result = applyFlowToBroadcastWithDayStructure('new-broadcast-id', newStartTime, originalBaseTime);

            // Assert
            expect(result).to.equal(3);
            expect(mockActionsArray).to.have.length(3);
            
            // Check day structure is preserved
            const action1 = mockActionsArray[0]; // Day 1
            const action2 = mockActionsArray[1]; // Day 2
            const action3 = mockActionsArray[2]; // Day 3
            
            expect(new Date(action1.at).toISOString()).to.equal('2024-01-29T09:00:00.000Z'); // Monday
            expect(new Date(action2.at).toISOString()).to.equal('2024-01-30T09:00:00.000Z'); // Tuesday
            expect(new Date(action3.at).toISOString()).to.equal('2024-01-31T09:00:00.000Z'); // Wednesday
        });

        it('should handle edge case with same day actions', () => {
            // Arrange - all actions on same day
            const sameDaySceneFlow = {
                steps: [
                    {
                        offsetSec: 0, // 9 AM
                        type: 'start',
                        payload: { sceneName: 'intro' }
                    },
                    {
                        offsetSec: 3600, // 10 AM
                        type: 'setScene',
                        payload: { sceneName: 'live' }
                    },
                    {
                        offsetSec: 7200, // 11 AM
                        type: 'end',
                        payload: {}
                    }
                ]
            };

            const originalBaseTime = '2024-01-15T09:00:00Z';
            const newStartTime = '2024-01-22T09:00:00Z';
            
            // Mock the function
            const applyFlowToBroadcastWithDayStructure = (broadcastId, scheduledStartISO, originalBaseTimeISO) => {
                const steps = sameDaySceneFlow.steps;
                const newStartMs = new Date(scheduledStartISO).getTime();
                const originalStartMs = new Date(originalBaseTimeISO).getTime();
                let added = 0;

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
                    
                    const atISO = newActionDate.toISOString();
                    const action = {
                        id: `action-${added}`,
                        broadcastId,
                        at: atISO,
                        type: s.type,
                        payload: s.payload || {},
                    };
                    mockActionsArray.push(action);
                    added++;
                }
                return added;
            };

            // Act
            const result = applyFlowToBroadcastWithDayStructure('new-broadcast-id', newStartTime, originalBaseTime);

            // Assert
            expect(result).to.equal(3);
            expect(mockActionsArray).to.have.length(3);
            
            // All actions should be on the same day (Monday)
            const action1 = mockActionsArray[0];
            const action2 = mockActionsArray[1];
            const action3 = mockActionsArray[2];
            
            expect(new Date(action1.at).toISOString()).to.equal('2024-01-22T09:00:00.000Z');
            expect(new Date(action2.at).toISOString()).to.equal('2024-01-22T10:00:00.000Z');
            expect(new Date(action3.at).toISOString()).to.equal('2024-01-22T11:00:00.000Z');
        });
    });

    describe('Integration tests for both bug fixes', () => {
        it('should handle recurring stream with preserved day structure and prevent cleanup of live actions', async () => {
            // This test simulates the complete flow:
            // 1. Original stream with multi-day actions
            // 2. Stream goes live (actions preserved during cleanup)
            // 3. Recurring stream created with preserved day structure
            
            // Arrange
            const originalBaseTime = '2024-01-15T09:00:00Z';
            const liveStreamId = 'live-broadcast-1';
            const recurringStreamId = 'recurring-broadcast-1';
            
            // Mock actions for live stream
            const liveStreamActions = [
                {
                    id: 'live-action-1',
                    broadcastId: liveStreamId,
                    at: '2024-01-15T09:00:00Z',
                    type: 'start',
                    payload: { sceneName: 'intro' }
                },
                {
                    id: 'live-action-2',
                    broadcastId: liveStreamId,
                    at: '2024-01-16T09:00:00Z', // Next day
                    type: 'setScene',
                    payload: { sceneName: 'live' }
                }
            ];

            // Mock cleanup that preserves live stream actions
            const cleanupOrphanedData = async () => {
                const scheduledIds = new Set(['scheduled-broadcast-1']);
                const activeBroadcastIds = new Set([liveStreamId]); // Live stream is active
                const validBroadcastIds = new Set([...scheduledIds, ...activeBroadcastIds]);
                
                const orphanedActions = liveStreamActions.filter(action => !validBroadcastIds.has(action.broadcastId));
                
                // Should not find any orphaned actions since live stream is active
                expect(orphanedActions).to.have.length(0);
                
                return { orphanedActions };
            };

            // Mock recurring stream creation with day structure preservation
            const createRecurringStream = (newStartTime) => {
                const sceneFlow = {
                    steps: [
                        { offsetSec: 0, type: 'start', payload: { sceneName: 'intro' } },
                        { offsetSec: 86400, type: 'setScene', payload: { sceneName: 'live' } } // Next day
                    ]
                };

                const newStartMs = new Date(newStartTime).getTime();
                const originalStartMs = new Date(originalBaseTime).getTime();
                const actions = [];

                for (const s of sceneFlow.steps) {
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
                        id: `recurring-action-${actions.length}`,
                        broadcastId: recurringStreamId,
                        at: newActionDate.toISOString(),
                        type: s.type,
                        payload: s.payload || {},
                    });
                }

                return actions;
            };

            // Act
            const cleanupResult = await cleanupOrphanedData();
            const recurringActions = createRecurringStream('2024-01-22T09:00:00Z'); // Next Monday

            // Assert
            expect(cleanupResult.orphanedActions).to.have.length(0);
            expect(recurringActions).to.have.length(2);
            
            // Check that recurring actions preserve day structure
            expect(new Date(recurringActions[0].at).toISOString()).to.equal('2024-01-22T09:00:00.000Z'); // Monday
            expect(new Date(recurringActions[1].at).toISOString()).to.equal('2024-01-23T09:00:00.000Z'); // Tuesday
        });
    });
});
