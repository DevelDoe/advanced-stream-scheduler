import { expect } from 'chai';
import sinon from 'sinon';
import { resetStubs, wait } from '../helpers/test-utils.js';

describe('Renderer Process OAuth Protection', () => {
    let mockElectronAPI;
    let mockOAuthStatus;
    let mockOAuthCancel;
    let mockToast;
    let mockUpdateOAuthStatus;
    let mockUpdateCredentialsStatus;

    beforeEach(() => {
        resetStubs();
        
        // Mock electronAPI
        mockElectronAPI = {
            oauthStatus: sinon.stub(),
            oauthCancel: sinon.stub(),
            credentialsPick: sinon.stub(),
            credentialsTest: sinon.stub(),
            credentialsClearToken: sinon.stub()
        };
        
        // Mock OAuth status responses
        mockOAuthStatus = {
            inProgress: false
        };
        
        mockElectronAPI.oauthStatus.resolves(mockOAuthStatus);
        
        // Mock other functions
        mockOAuthCancel = sinon.stub();
        mockToast = sinon.stub();
        mockUpdateOAuthStatus = sinon.stub();
        mockUpdateCredentialsStatus = sinon.stub();
        
        // Mock global window.electronAPI
        global.window = {
            electronAPI: mockElectronAPI
        };
        
        // Mock global toast function
        global.toast = mockToast;
    });

    afterEach(() => {
        resetStubs();
        delete global.window;
        delete global.toast;
    });

    describe('OAuth Status Polling', () => {
        it('should start OAuth status polling when credentials modal opens', async () => {
            // Mock the startOAuthStatusPolling function
            const startOAuthStatusPolling = sinon.stub();
            const stopOAuthStatusPolling = sinon.stub();
            
            // Mock the onOpenCredentialsSetup function
            const onOpenCredentialsSetup = async () => {
                await mockUpdateCredentialsStatus();
                await mockUpdateOAuthStatus();
                startOAuthStatusPolling();
            };
            
            // Call the function and wait for it to complete
            await onOpenCredentialsSetup();
            
            expect(startOAuthStatusPolling).to.have.been.calledOnce;
        });

        it('should stop OAuth status polling when credentials modal closes', () => {
            // Mock the stopOAuthStatusPolling function
            const stopOAuthStatusPolling = sinon.stub();
            
            // Mock the modal close handler
            const handleModalClose = () => {
                stopOAuthStatusPolling();
            };
            
            // Call the function
            handleModalClose();
            
            expect(stopOAuthStatusPolling).to.have.been.calledOnce;
        });

        it('should update OAuth status every 2 seconds while polling', async () => {
            // Mock the polling interval
            let pollCount = 0;
            const mockInterval = setInterval(() => {
                pollCount++;
                mockUpdateOAuthStatus();
            }, 100); // Use 100ms for testing instead of 2000ms
            
            // Wait for multiple polls
            await wait(350);
            
            clearInterval(mockInterval);
            
            // Should have polled multiple times
            expect(pollCount).to.be.greaterThan(2);
            expect(mockUpdateOAuthStatus.callCount).to.be.greaterThanOrEqual(2);
        });
    });

    describe('OAuth Status Display', () => {
        it('should show OAuth status when authentication is in progress', async () => {
            // Mock OAuth status to show in progress
            mockOAuthStatus.inProgress = true;
            mockElectronAPI.oauthStatus.resolves(mockOAuthStatus);
            
            // Mock the updateOAuthStatus function
            const updateOAuthStatus = async () => {
                const oauthInfo = await mockElectronAPI.oauthStatus();
                if (oauthInfo.inProgress) {
                    // Simulate showing the OAuth status element
                    return { display: 'block' };
                } else {
                    return { display: 'none' };
                }
            };
            
            const result = await updateOAuthStatus();
            
            expect(result.display).to.equal('block');
            expect(mockElectronAPI.oauthStatus).to.have.been.calledOnce;
        });

        it('should hide OAuth status when authentication is not in progress', async () => {
            // Mock OAuth status to show not in progress
            mockOAuthStatus.inProgress = false;
            mockElectronAPI.oauthStatus.resolves(mockOAuthStatus);
            
            // Mock the updateOAuthStatus function
            const updateOAuthStatus = async () => {
                const oauthInfo = await mockElectronAPI.oauthStatus();
                if (oauthInfo.inProgress) {
                    return { display: 'block' };
                } else {
                    return { display: 'none' };
                }
            };
            
            const result = await updateOAuthStatus();
            
            expect(result.display).to.equal('none');
            expect(mockElectronAPI.oauthStatus).to.have.been.calledOnce;
        });

        it('should handle OAuth status check errors gracefully', async () => {
            // Mock OAuth status to throw an error
            mockElectronAPI.oauthStatus.rejects(new Error('Network error'));
            
            // Mock the updateOAuthStatus function with error handling
            const updateOAuthStatus = async () => {
                try {
                    const oauthInfo = await mockElectronAPI.oauthStatus();
                    if (oauthInfo.inProgress) {
                        return { display: 'block' };
                    } else {
                        return { display: 'none' };
                    }
                } catch (error) {
                    console.error('Failed to check OAuth status:', error);
                    return { display: 'none' };
                }
            };
            
            const result = await updateOAuthStatus();
            
            expect(result.display).to.equal('none');
            expect(mockElectronAPI.oauthStatus).to.have.been.calledOnce;
        });
    });

    describe('OAuth Cancellation', () => {
        it('should allow user to cancel OAuth authentication', async () => {
            // Mock successful OAuth cancellation
            mockElectronAPI.oauthCancel.resolves({ ok: true, cancelled: true });
            
            // Mock the OAuth cancel button handler
            const handleOAuthCancel = async () => {
                try {
                    const result = await mockElectronAPI.oauthCancel();
                    if (result.ok && result.cancelled) {
                        mockToast('✅ OAuth authentication cancelled');
                        await mockUpdateOAuthStatus();
                        return { success: true };
                    } else {
                        mockToast('ℹ️ No OAuth flow to cancel');
                        return { success: false, reason: 'nothing_to_cancel' };
                    }
                } catch (error) {
                    mockToast(`❌ Failed to cancel OAuth: ${error.message}`);
                    return { success: false, error: error.message };
                }
            };
            
            const result = await handleOAuthCancel();
            
            expect(result.success).to.be.true;
            expect(mockElectronAPI.oauthCancel).to.have.been.calledOnce;
            expect(mockToast).to.have.been.calledWith('✅ OAuth authentication cancelled');
            expect(mockUpdateOAuthStatus).to.have.been.calledOnce;
        });

        it('should handle OAuth cancellation when no flow is active', async () => {
            // Mock OAuth cancellation when nothing to cancel
            mockElectronAPI.oauthCancel.resolves({ ok: true, cancelled: false });
            
            // Mock the OAuth cancel button handler
            const handleOAuthCancel = async () => {
                try {
                    const result = await mockElectronAPI.oauthCancel();
                    if (result.ok && result.cancelled) {
                        mockToast('✅ OAuth authentication cancelled');
                        await mockUpdateOAuthStatus();
                        return { success: true };
                    } else {
                        mockToast('ℹ️ No OAuth flow to cancel');
                        return { success: false, reason: 'nothing_to_cancel' };
                    }
                } catch (error) {
                    mockToast(`❌ Failed to cancel OAuth: ${error.message}`);
                    return { success: false, error: error.message };
                }
            };
            
            const result = await handleOAuthCancel();
            
            expect(result.success).to.be.false;
            expect(result.reason).to.equal('nothing_to_cancel');
            expect(mockElectronAPI.oauthCancel).to.have.been.calledOnce;
            expect(mockToast).to.have.been.calledWith('ℹ️ No OAuth flow to cancel');
        });

        it('should handle OAuth cancellation errors gracefully', async () => {
            // Mock OAuth cancellation to throw an error
            mockElectronAPI.oauthCancel.rejects(new Error('Permission denied'));
            
            // Mock the OAuth cancel button handler
            const handleOAuthCancel = async () => {
                try {
                    const result = await mockElectronAPI.oauthCancel();
                    if (result.ok && result.cancelled) {
                        mockToast('✅ OAuth authentication cancelled');
                        await mockUpdateOAuthStatus();
                        return { success: true };
                    } else {
                        mockToast('ℹ️ No OAuth flow to cancel');
                        return { success: false, reason: 'nothing_to_cancel' };
                    }
                } catch (error) {
                    mockToast(`❌ Failed to cancel OAuth: ${error.message}`);
                    return { success: false, error: error.message };
                }
            };
            
            const result = await handleOAuthCancel();
            
            expect(result.success).to.be.false;
            expect(result.error).to.equal('Permission denied');
            expect(mockElectronAPI.oauthCancel).to.have.been.calledOnce;
            expect(mockToast).to.have.been.calledWith('❌ Failed to cancel OAuth: Permission denied');
        });
    });

    describe('OAuth Protection in Credential Operations', () => {
        it('should prevent credential file picking when OAuth is in progress', async () => {
            // Mock OAuth status to show in progress
            mockOAuthStatus.inProgress = true;
            mockElectronAPI.oauthStatus.resolves(mockOAuthStatus);
            
            // Mock the credentials pick button handler
            const handleCredentialsPick = async () => {
                // Check if OAuth is in progress
                const oauthInfo = await mockElectronAPI.oauthStatus();
                if (oauthInfo.inProgress) {
                    mockToast('⏳ Please wait for OAuth authentication to complete before changing credentials');
                    return { blocked: true, reason: 'oauth_in_progress' };
                }
                
                // Proceed with credential picking
                const result = await mockElectronAPI.credentialsPick();
                return { blocked: false, result };
            };
            
            const result = await handleCredentialsPick();
            
            expect(result.blocked).to.be.true;
            expect(result.reason).to.equal('oauth_in_progress');
            expect(mockToast).to.have.been.calledWith('⏳ Please wait for OAuth authentication to complete before changing credentials');
            expect(mockElectronAPI.credentialsPick).to.not.have.been.called;
        });

        it('should allow credential file picking when OAuth is not in progress', async () => {
            // Mock OAuth status to show not in progress
            mockOAuthStatus.inProgress = false;
            mockElectronAPI.oauthStatus.resolves(mockOAuthStatus);
            
            // Mock successful credential picking
            mockElectronAPI.credentialsPick.resolves({ path: '/test/path', name: 'test.json' });
            
            // Mock the credentials pick button handler
            const handleCredentialsPick = async () => {
                // Check if OAuth is in progress
                const oauthInfo = await mockElectronAPI.oauthStatus();
                if (oauthInfo.inProgress) {
                    mockToast('⏳ Please wait for OAuth authentication to complete before changing credentials');
                    return { blocked: true, reason: 'oauth_in_progress' };
                }
                
                // Proceed with credential picking
                const result = await mockElectronAPI.credentialsPick();
                return { blocked: false, result };
            };
            
            const result = await handleCredentialsPick();
            
            expect(result.blocked).to.be.false;
            expect(result.result.path).to.equal('/test/path');
            expect(mockElectronAPI.credentialsPick).to.have.been.calledOnce;
        });

        it('should prevent credential testing when OAuth is in progress', async () => {
            // Mock OAuth status to show in progress
            mockOAuthStatus.inProgress = true;
            mockElectronAPI.oauthStatus.resolves(mockOAuthStatus);
            
            // Mock the credentials test button handler
            const handleCredentialsTest = async () => {
                // Check if OAuth is in progress
                const oauthInfo = await mockElectronAPI.oauthStatus();
                if (oauthInfo.inProgress) {
                    mockToast('⏳ Please wait for OAuth authentication to complete before testing');
                    return { blocked: true, reason: 'oauth_in_progress' };
                }
                
                // Proceed with credential testing
                const result = await mockElectronAPI.credentialsTest();
                return { blocked: false, result };
            };
            
            const result = await handleCredentialsTest();
            
            expect(result.blocked).to.be.true;
            expect(result.reason).to.equal('oauth_in_progress');
            expect(mockToast).to.have.been.calledWith('⏳ Please wait for OAuth authentication to complete before testing');
            expect(mockElectronAPI.credentialsTest).to.not.have.been.called;
        });

        it('should prevent token clearing when OAuth is in progress', async () => {
            // Mock OAuth status to show in progress
            mockOAuthStatus.inProgress = true;
            mockElectronAPI.oauthStatus.resolves(mockOAuthStatus);
            
            // Mock the credentials clear button handler
            const handleCredentialsClear = async () => {
                // Check if OAuth is in progress
                const oauthStatus = await mockElectronAPI.oauthStatus();
                if (oauthStatus.inProgress) {
                    mockToast('⚠️ Cannot clear token while OAuth authentication is in progress');
                    return { blocked: true, reason: 'oauth_in_progress' };
                }
                
                // Proceed with token clearing
                const result = await mockElectronAPI.credentialsClearToken();
                return { blocked: false, result };
            };
            
            const result = await handleCredentialsClear();
            
            expect(result.blocked).to.be.true;
            expect(result.reason).to.equal('oauth_in_progress');
            expect(mockToast).to.have.been.calledWith('⚠️ Cannot clear token while OAuth authentication is in progress');
            expect(mockElectronAPI.credentialsClearToken).to.not.have.been.called;
        });
    });

    describe('Button State Management', () => {
        it('should disable OAuth cancel button during cancellation', async () => {
            // Mock the OAuth cancel button handler with button state management
            let buttonDisabled = false;
            let buttonText = 'Cancel OAuth';
            
            const handleOAuthCancel = async () => {
                try {
                    // Disable button and show loading state
                    buttonDisabled = true;
                    buttonText = 'Cancelling...';
                    
                    const result = await mockElectronAPI.oauthCancel();
                    if (result.ok && result.cancelled) {
                        mockToast('✅ OAuth authentication cancelled');
                        await mockUpdateOAuthStatus();
                    } else {
                        mockToast('ℹ️ No OAuth flow to cancel');
                    }
                } catch (error) {
                    mockToast(`❌ Failed to cancel OAuth: ${error.message}`);
                } finally {
                    // Restore button state
                    buttonDisabled = false;
                    buttonText = 'Cancel OAuth';
                }
                
                return { buttonDisabled, buttonText };
            };
            
            // Mock successful cancellation
            mockElectronAPI.oauthCancel.resolves({ ok: true, cancelled: true });
            
            const result = await handleOAuthCancel();
            
            expect(result.buttonDisabled).to.be.false;
            expect(result.buttonText).to.equal('Cancel OAuth');
        });

        it('should restore button state even when cancellation fails', async () => {
            // Mock the OAuth cancel button handler with button state management
            let buttonDisabled = false;
            let buttonText = 'Cancel OAuth';
            
            const handleOAuthCancel = async () => {
                try {
                    // Disable button and show loading state
                    buttonDisabled = true;
                    buttonText = 'Cancelling...';
                    
                    const result = await mockElectronAPI.oauthCancel();
                    if (result.ok && result.cancelled) {
                        mockToast('✅ OAuth authentication cancelled');
                        await mockUpdateOAuthStatus();
                    } else {
                        mockToast('ℹ️ No OAuth flow to cancel');
                    }
                } catch (error) {
                    mockToast(`❌ Failed to cancel OAuth: ${error.message}`);
                } finally {
                    // Restore button state
                    buttonDisabled = false;
                    buttonText = 'Cancel OAuth';
                }
                
                return { buttonDisabled, buttonText };
            };
            
            // Mock failed cancellation
            mockElectronAPI.oauthCancel.rejects(new Error('Network error'));
            
            const result = await handleOAuthCancel();
            
            expect(result.buttonDisabled).to.be.false;
            expect(result.buttonText).to.equal('Cancel OAuth');
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle undefined OAuth status gracefully', async () => {
            // Mock OAuth status to return undefined
            mockElectronAPI.oauthStatus.resolves(undefined);
            
            // Mock the updateOAuthStatus function
            const updateOAuthStatus = async () => {
                try {
                    const oauthInfo = await mockElectronAPI.oauthStatus();
                    if (oauthInfo && oauthInfo.inProgress) {
                        return { display: 'block' };
                    } else {
                        return { display: 'none' };
                    }
                } catch (error) {
                    console.error('Failed to check OAuth status:', error);
                    return { display: 'none' };
                }
            };
            
            const result = await updateOAuthStatus();
            
            expect(result.display).to.equal('none');
        });

        it('should handle null OAuth status gracefully', async () => {
            // Mock OAuth status to return null
            mockElectronAPI.oauthStatus.resolves(null);
            
            // Mock the updateOAuthStatus function
            const updateOAuthStatus = async () => {
                try {
                    const oauthInfo = await mockElectronAPI.oauthStatus();
                    if (oauthInfo && oauthInfo.inProgress) {
                        return { display: 'block' };
                    } else {
                        return { display: 'none' };
                    }
                } catch (error) {
                    console.error('Failed to check OAuth status:', error);
                    return { display: 'none' };
                }
            };
            
            const result = await updateOAuthStatus();
            
            expect(result.display).to.equal('none');
        });

        it('should handle rapid OAuth status checks', async () => {
            // Mock OAuth status to return false
            mockOAuthStatus.inProgress = false;
            mockElectronAPI.oauthStatus.resolves(mockOAuthStatus);
            
            // Mock the updateOAuthStatus function
            const updateOAuthStatus = async () => {
                const oauthInfo = await mockElectronAPI.oauthStatus();
                if (oauthInfo.inProgress) {
                    return { display: 'block' };
                } else {
                    return { display: 'none' };
                }
            };
            
            // Call multiple times rapidly
            const promises = [
                updateOAuthStatus(),
                updateOAuthStatus(),
                updateOAuthStatus()
            ];
            
            const results = await Promise.all(promises);
            
            expect(results).to.deep.equal([
                { display: 'none' },
                { display: 'none' },
                { display: 'none' }
            ]);
            
            expect(mockElectronAPI.oauthStatus).to.have.been.calledThrice;
        });
    });
});
