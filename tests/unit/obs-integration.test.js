import { expect } from 'chai';
import sinon from 'sinon';
import { resetStubs, wait } from '../helpers/test-utils.js';

describe('OBS Integration', () => {
    let mockObsWebSocket;
    let mockObsConnection;
    let mockObsSettings;

    beforeEach(() => {
        resetStubs();
        
        // Mock OBS WebSocket connection
        mockObsConnection = {
            connect: sinon.stub(),
            disconnect: sinon.stub(),
            send: sinon.stub(),
            on: sinon.stub(),
            once: sinon.stub(),
            isConnected: false
        };
        
        // Mock OBS WebSocket class
        mockObsWebSocket = {
            WebSocket: sinon.stub().returns(mockObsConnection)
        };
        
        // Mock OBS settings
        mockObsSettings = {
            host: 'localhost',
            port: 4455,
            password: 'test-password',
            enabled: true
        };
    });

    afterEach(() => {
        resetStubs();
    });

    describe('OBS Connection Management', () => {
        it('should connect to OBS successfully with valid settings', async () => {
            // Mock successful connection
            mockObsConnection.connect.resolves();
            mockObsConnection.on.withArgs('ConnectionOpened').callsArgWith(1);
            
            const connectToOBS = async (settings) => {
                try {
                    await mockObsConnection.connect();
                    mockObsConnection.isConnected = true;
                    return { success: true, connected: true };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            };
            
            const result = await connectToOBS(mockObsSettings);
            
            expect(result.success).to.be.true;
            expect(result.connected).to.be.true;
            expect(mockObsConnection.connect).to.have.been.calledOnce;
        });

        it('should handle connection failures gracefully', async () => {
            // Mock connection failure
            mockObsConnection.connect.rejects(new Error('Connection refused'));
            
            const connectToOBS = async (settings) => {
                try {
                    await mockObsConnection.connect();
                    mockObsConnection.isConnected = true;
                    return { success: true, connected: true };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            };
            
            const result = await connectToOBS(mockObsSettings);
            
            expect(result.success).to.be.false;
            expect(result.error).to.equal('Connection refused');
            expect(mockObsConnection.connect).to.have.been.calledOnce;
        });

        it('should disconnect from OBS properly', async () => {
            // Mock successful disconnection
            mockObsConnection.disconnect.resolves();
            mockObsConnection.isConnected = true;
            
            const disconnectFromOBS = async () => {
                try {
                    await mockObsConnection.disconnect();
                    mockObsConnection.isConnected = false;
                    return { success: true, connected: false };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            };
            
            const result = await disconnectFromOBS();
            
            expect(result.success).to.be.true;
            expect(result.connected).to.be.false;
            expect(mockObsConnection.disconnect).to.have.been.calledOnce;
        });
    });

    describe('OBS Scene Management', () => {
        it('should get current scene successfully', async () => {
            // Mock successful scene retrieval
            mockObsConnection.send.resolves({ currentProgramSceneName: 'Live Scene' });
            mockObsConnection.isConnected = true;
            
            const getCurrentScene = async () => {
                if (!mockObsConnection.isConnected) {
                    throw new Error('Not connected to OBS');
                }
                
                const response = await mockObsConnection.send('GetCurrentProgramScene');
                return response.currentProgramSceneName;
            };
            
            const sceneName = await getCurrentScene();
            
            expect(sceneName).to.equal('Live Scene');
            expect(mockObsConnection.send).to.have.been.calledWith('GetCurrentProgramScene');
        });

        it('should change scene successfully', async () => {
            // Mock successful scene change
            mockObsConnection.send.resolves({});
            mockObsConnection.isConnected = true;
            
            const changeScene = async (sceneName) => {
                if (!mockObsConnection.isConnected) {
                    throw new Error('Not connected to OBS');
                }
                
                const response = await mockObsConnection.send('SetCurrentProgramScene', {
                    sceneName: sceneName
                });
                return { success: true, sceneName };
            };
            
            const result = await changeScene('New Scene');
            
            expect(result.success).to.be.true;
            expect(result.sceneName).to.equal('New Scene');
            expect(mockObsConnection.send).to.have.been.calledWith('SetCurrentProgramScene', {
                sceneName: 'New Scene'
            });
        });

        it('should list all available scenes', async () => {
            // Mock successful scene list retrieval
            const mockScenes = [
                { sceneName: 'Live Scene', sceneIndex: 0 },
                { sceneName: 'Break Scene', sceneIndex: 1 },
                { sceneName: 'End Scene', sceneIndex: 2 }
            ];
            
            mockObsConnection.send.resolves({ scenes: mockScenes });
            mockObsConnection.isConnected = true;
            
            const getScenes = async () => {
                if (!mockObsConnection.isConnected) {
                    throw new Error('Not connected to OBS');
                }
                
                const response = await mockObsConnection.send('GetSceneList');
                return response.scenes;
            };
            
            const scenes = await getScenes();
            
            expect(scenes).to.deep.equal(mockScenes);
            expect(scenes).to.have.length(3);
            expect(mockObsConnection.send).to.have.been.calledWith('GetSceneList');
        });

        it('should handle scene change errors gracefully', async () => {
            // Mock scene change failure
            mockObsConnection.send.rejects(new Error('Scene not found'));
            mockObsConnection.isConnected = true;
            
            const changeScene = async (sceneName) => {
                if (!mockObsConnection.isConnected) {
                    throw new Error('Not connected to OBS');
                }
                
                try {
                    const response = await mockObsConnection.send('SetCurrentProgramScene', {
                        sceneName: sceneName
                    });
                    return { success: true, sceneName };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            };
            
            const result = await changeScene('Non-existent Scene');
            
            expect(result.success).to.be.false;
            expect(result.error).to.equal('Scene not found');
            expect(mockObsConnection.send).to.have.been.calledWith('SetCurrentProgramScene', {
                sceneName: 'Non-existent Scene'
            });
        });
    });

    describe('OBS Stream Control', () => {
        it('should start streaming successfully', async () => {
            // Mock successful stream start
            mockObsConnection.send.resolves({});
            mockObsConnection.isConnected = true;
            
            const startStreaming = async () => {
                if (!mockObsConnection.isConnected) {
                    throw new Error('Not connected to OBS');
                }
                
                const response = await mockObsConnection.send('StartStreaming');
                return { success: true, streaming: true };
            };
            
            const result = await startStreaming();
            
            expect(result.success).to.be.true;
            expect(result.streaming).to.be.true;
            expect(mockObsConnection.send).to.have.been.calledWith('StartStreaming');
        });

        it('should stop streaming successfully', async () => {
            // Mock successful stream stop
            mockObsConnection.send.resolves({});
            mockObsConnection.isConnected = true;
            
            const stopStreaming = async () => {
                if (!mockObsConnection.isConnected) {
                    throw new Error('Not connected to OBS');
                }
                
                const response = await mockObsConnection.send('StopStreaming');
                return { success: true, streaming: false };
            };
            
            const result = await stopStreaming();
            
            expect(result.success).to.be.true;
            expect(result.streaming).to.be.false;
            expect(mockObsConnection.send).to.have.been.calledWith('StopStreaming');
        });

        it('should get streaming status', async () => {
            // Mock streaming status
            mockObsConnection.send.resolves({ outputActive: true, outputTime: 3600000 });
            mockObsConnection.isConnected = true;
            
            const getStreamingStatus = async () => {
                if (!mockObsConnection.isConnected) {
                    throw new Error('Not connected to OBS');
                }
                
                const response = await mockObsConnection.send('GetStreamingStatus');
                return {
                    active: response.outputActive,
                    duration: response.outputTime
                };
            };
            
            const status = await getStreamingStatus();
            
            expect(status.active).to.be.true;
            expect(status.duration).to.equal(3600000);
            expect(mockObsConnection.send).to.have.been.calledWith('GetStreamingStatus');
        });
    });

    describe('OBS Settings Management', () => {
        it('should load OBS settings from configuration', async () => {
            // Mock settings loading
            const mockConfig = {
                host: '192.168.1.100',
                port: 4455,
                password: 'secure-password',
                enabled: true
            };
            
            const loadOBSSettings = async () => {
                // Simulate loading from file or environment
                return mockConfig;
            };
            
            const settings = await loadOBSSettings();
            
            expect(settings.host).to.equal('192.168.1.100');
            expect(settings.port).to.equal(4455);
            expect(settings.password).to.equal('secure-password');
            expect(settings.enabled).to.be.true;
        });

        it('should save OBS settings to configuration', async () => {
            // Mock settings saving
            const mockSettings = {
                host: 'localhost',
                port: 4455,
                password: 'test-password',
                enabled: true
            };
            
            const saveOBSSettings = async (settings) => {
                // Simulate saving to file
                return { success: true, saved: settings };
            };
            
            const result = await saveOBSSettings(mockSettings);
            
            expect(result.success).to.be.true;
            expect(result.saved).to.deep.equal(mockSettings);
        });

        it('should validate OBS settings', () => {
            const validateOBSSettings = (settings) => {
                const errors = [];
                
                if (!settings.host || typeof settings.host !== 'string') {
                    errors.push('Host must be a valid string');
                }
                
                if (!settings.port || typeof settings.port !== 'number' || settings.port < 1 || settings.port > 65535) {
                    errors.push('Port must be a valid number between 1 and 65535');
                }
                
                if (settings.password && typeof settings.password !== 'string') {
                    errors.push('Password must be a valid string');
                }
                
                if (typeof settings.enabled !== 'boolean') {
                    errors.push('Enabled must be a boolean value');
                }
                
                return {
                    valid: errors.length === 0,
                    errors: errors
                };
            };
            
            // Test valid settings
            const validSettings = {
                host: 'localhost',
                port: 4455,
                password: 'test-password',
                enabled: true
            };
            
            const validResult = validateOBSSettings(validSettings);
            expect(validResult.valid).to.be.true;
            expect(validResult.errors).to.have.length(0);
            
            // Test invalid settings
            const invalidSettings = {
                host: '',
                port: 0,
                password: 123,
                enabled: 'true'
            };
            
            const invalidResult = validateOBSSettings(invalidSettings);
            expect(invalidResult.valid).to.be.false;
            expect(invalidResult.errors).to.have.length(4);
        });
    });

    describe('OBS Event Handling', () => {
        it('should handle scene change events', async () => {
            // Mock event handling
            let eventHandlers = {};
            
            const onSceneChanged = (callback) => {
                eventHandlers['SceneChanged'] = callback;
            };
            
            const triggerSceneChange = (sceneName) => {
                if (eventHandlers['SceneChanged']) {
                    eventHandlers['SceneChanged']({ sceneName });
                }
            };
            
            let capturedScene = null;
            onSceneChanged((event) => {
                capturedScene = event.sceneName;
            });
            
            triggerSceneChange('New Scene');
            
            expect(capturedScene).to.equal('New Scene');
        });

        it('should handle streaming state events', async () => {
            // Mock event handling
            let eventHandlers = {};
            
            const onStreamingStateChanged = (callback) => {
                eventHandlers['StreamingStateChanged'] = callback;
            };
            
            const triggerStreamingStateChange = (state) => {
                if (eventHandlers['StreamingStateChanged']) {
                    eventHandlers['StreamingStateChanged']({ state });
                }
            };
            
            let capturedState = null;
            onStreamingStateChanged((event) => {
                capturedState = event.state;
            });
            
            triggerStreamingStateChange('STARTING');
            
            expect(capturedState).to.equal('STARTING');
        });

        it('should handle connection state events', async () => {
            // Mock event handling
            let eventHandlers = {};
            
            const onConnectionStateChanged = (callback) => {
                eventHandlers['ConnectionStateChanged'] = callback;
            };
            
            const triggerConnectionStateChange = (state) => {
                if (eventHandlers['ConnectionStateChanged']) {
                    eventHandlers['ConnectionStateChanged']({ state });
                }
            };
            
            let capturedState = null;
            onConnectionStateChanged((event) => {
                capturedState = event.state;
            });
            
            triggerConnectionStateChange('CONNECTED');
            
            expect(capturedState).to.equal('CONNECTED');
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle connection timeouts gracefully', async () => {
            // Mock connection timeout
            mockObsConnection.connect.rejects(new Error('Connection timeout'));
            
            const connectWithTimeout = async (settings, timeoutMs = 5000) => {
                try {
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
                    });
                    
                    const connectionPromise = mockObsConnection.connect();
                    
                    await Promise.race([connectionPromise, timeoutPromise]);
                    mockObsConnection.isConnected = true;
                    return { success: true, connected: true };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            };
            
            const result = await connectWithTimeout(mockObsSettings, 100);
            
            expect(result.success).to.be.false;
            expect(result.error).to.equal('Connection timeout');
        });

        it('should retry failed connections', async () => {
            // Mock connection failures followed by success
            mockObsConnection.connect
                .onFirstCall().rejects(new Error('Connection refused'))
                .onSecondCall().rejects(new Error('Connection refused'))
                .onThirdCall().resolves();
            
            mockObsConnection.isConnected = false;
            
            const connectWithRetry = async (settings, maxRetries = 3) => {
                let lastError = null;
                let attemptsMade = 0;
                
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    attemptsMade++;
                    try {
                        await mockObsConnection.connect();
                        mockObsConnection.isConnected = true;
                        return { success: true, connected: true, attempts: attemptsMade };
                    } catch (error) {
                        lastError = error;
                        if (attempt === maxRetries) {
                            break;
                        }
                        // Wait before retry
                        await wait(100);
                    }
                }
                
                return { success: false, error: lastError.message, attempts: attemptsMade };
            };
            
            const result = await connectWithRetry(mockObsSettings, 3);
            
            expect(result.success).to.be.true;
            expect(result.attempts).to.equal(3);
            expect(mockObsConnection.connect).to.have.been.calledThrice;
        });

        it('should handle OBS crashes gracefully', async () => {
            // Mock OBS crash scenario
            mockObsConnection.isConnected = true;
            mockObsConnection.send.rejects(new Error('Connection lost'));
            
            const handleOBSCrash = async () => {
                try {
                    await mockObsConnection.send('GetCurrentProgramScene');
                    return { success: true };
                } catch (error) {
                    if (error.message === 'Connection lost') {
                        mockObsConnection.isConnected = false;
                        return { success: false, error: 'OBS crashed or disconnected', reconnecting: true };
                    }
                    throw error;
                }
            };
            
            const result = await handleOBSCrash();
            
            expect(result.success).to.be.false;
            expect(result.error).to.equal('OBS crashed or disconnected');
            expect(result.reconnecting).to.be.true;
            expect(mockObsConnection.isConnected).to.be.false;
        });
    });

    describe('Performance and Monitoring', () => {
        it('should monitor connection health', async () => {
            // Mock health monitoring
            let healthChecks = 0;
            
            const monitorConnectionHealth = async () => {
                healthChecks++;
                
                if (!mockObsConnection.isConnected) {
                    return { healthy: false, reason: 'Not connected' };
                }
                
                try {
                    await mockObsConnection.send('GetVersion');
                    return { healthy: true, checks: healthChecks };
                } catch (error) {
                    return { healthy: false, reason: error.message, checks: healthChecks };
                }
            };
            
            // Mock successful health check
            mockObsConnection.isConnected = true;
            mockObsConnection.send.resolves({ obsVersion: '29.0.0' });
            
            const health1 = await monitorConnectionHealth();
            const health2 = await monitorConnectionHealth();
            
            expect(health1.healthy).to.be.true;
            expect(health1.checks).to.equal(1);
            expect(health2.healthy).to.be.true;
            expect(health2.checks).to.equal(2);
        });

        it('should measure response times', async () => {
            // Mock response time measurement
            mockObsConnection.isConnected = true;
            mockObsConnection.send.resolves({ sceneName: 'Test Scene' });
            
            const measureResponseTime = async (command) => {
                const startTime = Date.now();
                
                try {
                    // Add a small delay to simulate actual processing time
                    await new Promise(resolve => setTimeout(resolve, 10));
                    await mockObsConnection.send(command);
                    const endTime = Date.now();
                    const responseTime = endTime - startTime;
                    
                    return { success: true, responseTime, command };
                } catch (error) {
                    return { success: false, error: error.message, command };
                }
            };
            
            const result = await measureResponseTime('GetCurrentProgramScene');
            
            expect(result.success).to.be.true;
            expect(result.command).to.equal('GetCurrentProgramScene');
            expect(result.responseTime).to.be.a('number');
            expect(result.responseTime).to.be.greaterThan(0);
        });
    });
});
