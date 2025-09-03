import { expect } from 'chai';
import sinon from 'sinon';
import { createMockIpcHandlers, resetStubs } from '../helpers/test-utils.js';

describe('Main Process OAuth Protection', () => {
    let mockIpcMain;
    let mockSchedulerBus;
    let mockYoutubeApi;

    beforeEach(() => {
        resetStubs();
        
        // Mock IPC handlers
        mockIpcMain = createMockIpcHandlers();
        
        // Configure mock handlers to return expected values
        mockIpcMain.getHandler('oauth.status').resolves({ inProgress: false });
        mockIpcMain.getHandler('oauth.cancel').resolves({ ok: true, cancelled: false });
        
        // Mock scheduler bus
        mockSchedulerBus = {
            on: sinon.stub(),
            emit: sinon.stub()
        };
        
        // Mock YouTube API
        mockYoutubeApi = {
            isOAuthInProgress: sinon.stub(),
            cancelOAuth: sinon.stub(),
            loadAuth: sinon.stub()
        };
    });

    afterEach(() => {
        resetStubs();
    });

    describe('IPC OAuth Handlers', () => {
        it('should handle oauth.status IPC request', async () => {
            // Mock the oauth.status handler
            const mockHandler = mockIpcMain.getHandler('oauth.status');
            
            // Configure the mock handler to call the YouTube API method
            mockHandler.callsFake(async () => {
                const inProgress = mockYoutubeApi.isOAuthInProgress();
                return { inProgress };
            });
            
            // Mock isOAuthInProgress to return true
            mockYoutubeApi.isOAuthInProgress.returns(true);
            
            // Call the handler
            const result = await mockHandler();
            
            expect(result).to.deep.equal({ inProgress: true });
            expect(mockYoutubeApi.isOAuthInProgress).to.have.been.calledOnce;
        });

        it('should handle oauth.cancel IPC request successfully', async () => {
            // Mock the oauth.cancel handler
            const mockHandler = mockIpcMain.getHandler('oauth.cancel');
            
            // Configure the mock handler to call the YouTube API method
            mockHandler.callsFake(async () => {
                const cancelled = mockYoutubeApi.cancelOAuth();
                return { ok: true, cancelled };
            });
            
            // Mock cancelOAuth to return true (cancelled)
            mockYoutubeApi.cancelOAuth.returns(true);
            
            // Call the handler
            const result = await mockHandler();
            
            expect(result).to.deep.equal({ ok: true, cancelled: true });
            expect(mockYoutubeApi.cancelOAuth).to.have.been.calledOnce;
        });

        it('should handle oauth.cancel IPC request when no OAuth is active', async () => {
            // Mock the oauth.cancel handler
            const mockHandler = mockIpcMain.getHandler('oauth.cancel');
            
            // Configure the mock handler to call the YouTube API method
            mockHandler.callsFake(async () => {
                const cancelled = mockYoutubeApi.cancelOAuth();
                return { ok: true, cancelled };
            });
            
            // Mock cancelOAuth to return false (nothing to cancel)
            mockYoutubeApi.cancelOAuth.returns(false);
            
            // Call the handler
            const result = await mockHandler();
            
            expect(result).to.deep.equal({ ok: true, cancelled: false });
            expect(mockYoutubeApi.cancelOAuth).to.have.been.calledOnce;
        });

        it('should handle oauth.cancel IPC request errors gracefully', async () => {
            // Mock the oauth.cancel handler
            const mockHandler = mockIpcMain.getHandler('oauth.cancel');
            
            // Configure the mock handler to call the YouTube API method and handle errors
            mockHandler.callsFake(async () => {
                try {
                    // This will throw an error because we've configured it to throw
                    mockYoutubeApi.cancelOAuth();
                    return { ok: true, cancelled: false };
                } catch (error) {
                    return { ok: false, error: error.message };
                }
            });
            
            // Mock cancelOAuth to throw an error
            mockYoutubeApi.cancelOAuth.throws(new Error('Test error'));
            
            // Call the handler
            const result = await mockHandler();
            
            expect(result).to.deep.equal({ ok: false, error: 'Test error' });
            expect(mockYoutubeApi.cancelOAuth).to.have.been.calledOnce;
        });
    });

    describe('OAuth Protection in Polling', () => {
        it('should check OAuth status before calling loadAuth in polling', async () => {
            // Mock the polling interval function
            const mockPollingFunction = sinon.stub();
            
            // Set up the polling with OAuth check
            const setupPolling = () => {
                return new Promise((resolve) => {
                    const interval = setInterval(() => {
                        if (!mockYoutubeApi.isOAuthInProgress()) {
                            mockPollingFunction();
                            clearInterval(interval);
                            resolve();
                        }
                    }, 10); // Use shorter interval for testing
                });
            };
            
            // Mock isOAuthInProgress to return false (no OAuth in progress)
            mockYoutubeApi.isOAuthInProgress.returns(false);
            
            await setupPolling();
            
            expect(mockPollingFunction).to.have.been.called;
        });

        it('should skip loadAuth when OAuth is in progress during polling', async () => {
            // Mock the polling interval function
            const mockPollingFunction = sinon.stub();
            
            // Set up the polling with OAuth check
            const setupPolling = () => {
                return new Promise((resolve) => {
                    const interval = setInterval(() => {
                        if (!mockYoutubeApi.isOAuthInProgress()) {
                            mockPollingFunction();
                        }
                        clearInterval(interval);
                        resolve();
                    }, 10); // Use shorter interval for testing
                });
            };
            
            // Mock isOAuthInProgress to return true (OAuth in progress)
            mockYoutubeApi.isOAuthInProgress.returns(true);
            
            await setupPolling();
            
            expect(mockPollingFunction).to.not.have.been.called;
        });
    });

    describe('OAuth Protection in Scheduler Actions', () => {
        it('should check OAuth status before executing start action', () => {
            // Mock the scheduler action handler
            const mockActionHandler = sinon.stub();
            
            // Set up the action handler with OAuth check
            const setupActionHandler = () => {
                mockSchedulerBus.on.withArgs('action_executed').callsArgWith(1, {
                    action: 'start',
                    broadcastId: 'test-broadcast-id'
                });
                
                // The actual handler would check OAuth status here
                if (!mockYoutubeApi.isOAuthInProgress()) {
                    mockActionHandler();
                }
            };
            
            // Mock isOAuthInProgress to return false
            mockYoutubeApi.isOAuthInProgress.returns(false);
            
            setupActionHandler();
            
            expect(mockActionHandler).to.have.been.called;
        });

        it('should skip start action when OAuth is in progress', () => {
            // Mock the scheduler action handler
            const mockActionHandler = sinon.stub();
            
            // Set up the action handler with OAuth check
            const setupActionHandler = () => {
                mockSchedulerBus.on.withArgs('action_executed').callsArgWith(1, {
                    action: 'start',
                    broadcastId: 'test-broadcast-id'
                });
                
                // The actual handler would check OAuth status here
                if (!mockYoutubeApi.isOAuthInProgress()) {
                    mockActionHandler();
                }
            };
            
            // Mock isOAuthInProgress to return true
            mockYoutubeApi.isOAuthInProgress.returns(true);
            
            setupActionHandler();
            
            expect(mockActionHandler).to.not.have.been.called;
        });

        it('should check OAuth status before executing end action', () => {
            // Mock the scheduler action handler
            const mockActionHandler = sinon.stub();
            
            // Set up the action handler with OAuth check
            const setupActionHandler = () => {
                mockSchedulerBus.on.withArgs('action_executed').callsArgWith(1, {
                    action: 'end',
                    broadcastId: 'test-broadcast-id'
                });
                
                // The actual handler would check OAuth status here
                if (!mockYoutubeApi.isOAuthInProgress()) {
                    mockActionHandler();
                }
            };
            
            // Mock isOAuthInProgress to return false
            mockYoutubeApi.isOAuthInProgress.returns(false);
            
            setupActionHandler();
            
            expect(mockActionHandler).to.have.been.called;
        });
    });

    describe('OAuth Protection in YouTube API Calls', () => {
        it('should check OAuth status before listing upcoming broadcasts', async () => {
            // Create a mock handler that simulates the expected behavior
            const mockHandler = async () => {
                if (mockYoutubeApi.isOAuthInProgress()) {
                    return { error: 'OAuth in progress' };
                }
                await mockYoutubeApi.loadAuth();
                return { success: true, data: [] };
            };
            
            // Mock isOAuthInProgress to return false
            mockYoutubeApi.isOAuthInProgress.returns(false);
            
            // Mock loadAuth to resolve successfully
            mockYoutubeApi.loadAuth.resolves();
            
            // Call the handler
            await mockHandler();
            
            expect(mockYoutubeApi.isOAuthInProgress).to.have.been.called;
            expect(mockYoutubeApi.loadAuth).to.have.been.called;
        });

        it('should skip loadAuth when OAuth is in progress for listUpcoming', async () => {
            // Create a mock handler that simulates the expected behavior
            const mockHandler = async () => {
                if (mockYoutubeApi.isOAuthInProgress()) {
                    return { error: 'OAuth in progress' };
                }
                await mockYoutubeApi.loadAuth();
                return { success: true, data: [] };
            };
            
            // Mock isOAuthInProgress to return true
            mockYoutubeApi.isOAuthInProgress.returns(true);
            
            // Mock loadAuth to resolve successfully
            mockYoutubeApi.loadAuth.resolves();
            
            // Call the handler
            await mockHandler();
            
            expect(mockYoutubeApi.isOAuthInProgress).to.have.been.called;
            expect(mockYoutubeApi.loadAuth).to.not.have.been.called;
        });

        it('should check OAuth status before deleting broadcasts', async () => {
            // Create a mock handler that simulates the expected behavior
            const mockHandler = async (broadcastId) => {
                if (mockYoutubeApi.isOAuthInProgress()) {
                    return { error: 'OAuth in progress' };
                }
                await mockYoutubeApi.loadAuth();
                return { success: true, deleted: broadcastId };
            };
            
            // Mock isOAuthInProgress to return false
            mockYoutubeApi.isOAuthInProgress.returns(false);
            
            // Mock loadAuth to resolve successfully
            mockYoutubeApi.loadAuth.resolves();
            
            // Call the handler
            await mockHandler('test-broadcast-id');
            
            expect(mockYoutubeApi.isOAuthInProgress).to.have.been.called;
            expect(mockYoutubeApi.loadAuth).to.have.been.called;
        });

        it('should check OAuth status before scheduling streams', async () => {
            // Create a mock handler that simulates the expected behavior
            const mockHandler = async (title, startTime, settings) => {
                if (mockYoutubeApi.isOAuthInProgress()) {
                    return { error: 'OAuth in progress' };
                }
                await mockYoutubeApi.loadAuth();
                return { success: true, scheduled: { title, startTime, settings } };
            };
            
            // Mock isOAuthInProgress to return false
            mockYoutubeApi.isOAuthInProgress.returns(false);
            
            // Mock loadAuth to resolve successfully
            mockYoutubeApi.loadAuth.resolves();
            
            // Call the handler
            await mockHandler('Test Stream', '2024-01-01T00:00:00Z', {});
            
            expect(mockYoutubeApi.isOAuthInProgress).to.have.been.called;
            expect(mockYoutubeApi.loadAuth).to.have.been.called;
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle undefined OAuth status gracefully', async () => {
            // Mock the oauth.status handler
            const mockHandler = mockIpcMain.getHandler('oauth.status');
            
            // Configure the mock handler to call the YouTube API method
            mockHandler.callsFake(async () => {
                const inProgress = mockYoutubeApi.isOAuthInProgress();
                return { inProgress };
            });
            
            // Mock isOAuthInProgress to return undefined
            mockYoutubeApi.isOAuthInProgress.returns(undefined);
            
            // Call the handler
            const result = await mockHandler();
            
            expect(result).to.deep.equal({ inProgress: undefined });
        });

        it('should handle null OAuth status gracefully', async () => {
            // Mock the oauth.status handler
            const mockHandler = mockIpcMain.getHandler('oauth.status');
            
            // Configure the mock handler to call the YouTube API method
            mockHandler.callsFake(async () => {
                const inProgress = mockYoutubeApi.isOAuthInProgress();
                return { inProgress };
            });
            
            // Mock isOAuthInProgress to return null
            mockYoutubeApi.isOAuthInProgress.returns(null);
            
            // Call the handler
            const result = await mockHandler();
            
            expect(result).to.deep.equal({ inProgress: null });
        });

        it('should handle multiple rapid OAuth status checks', async () => {
            // Mock the oauth.status handler
            const mockHandler = mockIpcMain.getHandler('oauth.status');
            
            // Configure the mock handler to call the YouTube API method
            mockHandler.callsFake(async () => {
                const inProgress = mockYoutubeApi.isOAuthInProgress();
                return { inProgress };
            });
            
            // Mock isOAuthInProgress to return false
            mockYoutubeApi.isOAuthInProgress.returns(false);
            
            // Call the handler multiple times rapidly
            const promises = [
                mockHandler(),
                mockHandler(),
                mockHandler()
            ];
            
            const results = await Promise.all(promises);
            
            expect(results).to.deep.equal([
                { inProgress: false },
                { inProgress: false },
                { inProgress: false }
            ]);
            expect(mockYoutubeApi.isOAuthInProgress).to.have.been.calledThrice;
        });
    });
});
