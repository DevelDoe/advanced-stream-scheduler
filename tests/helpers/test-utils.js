import { expect, use } from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';

// Configure Chai to use Sinon matchers
use(sinonChai);

// Global test utilities
global.expect = expect;
global.sinon = sinon;

// Helper to create mock OAuth2 client
export function createMockOAuth2Client() {
    return {
        generateAuthUrl: sinon.stub().returns('https://mock-oauth-url.com'),
        getToken: sinon.stub(),
        setCredentials: sinon.stub(),
        on: sinon.stub()
    };
}

// Helper to create mock HTTP server
export function createMockHttpServer() {
    return {
        listen: sinon.stub().callsArg(1), // Calls callback immediately
        close: sinon.stub().callsArg(0),  // Calls callback immediately
        on: sinon.stub()
    };
}

// Helper to create mock Google APIs
export function createMockGoogleApis() {
    return {
        youtube: {
            v3: {
                broadcasts: {
                    list: sinon.stub(),
                    insert: sinon.stub(),
                    update: sinon.stub(),
                    delete: sinon.stub()
                },
                liveStreams: {
                    list: sinon.stub(),
                    insert: sinon.stub(),
                    update: sinon.stub(),
                    delete: sinon.stub()
                }
            }
        }
    };
}

// Helper to reset all stubs
export function resetStubs() {
    sinon.restore();
}

// Helper to create a mock callback function
export function createMockCallback() {
    return sinon.stub();
}

// Helper to wait for async operations
export function wait(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to create mock IPC handlers
export function createMockIpcHandlers() {
    const mockHandlers = {
        'oauth.status': sinon.stub().resolves({ inProgress: false }),
        'oauth.cancel': sinon.stub().resolves({ ok: true, cancelled: false }),
        'yt.listUpcoming': sinon.stub().resolves([]),
        'yt.deleteBroadcast': sinon.stub().resolves({ success: true }),
        'scheduleStream': sinon.stub().resolves({ success: true })
    };
    
    return {
        handle: sinon.stub().callsFake((channel, handler) => {
            if (mockHandlers[channel]) {
                mockHandlers[channel] = handler;
            }
        }),
        on: sinon.stub(),
        send: sinon.stub(),
        // Helper to get handlers for testing
        getHandler: (channel) => mockHandlers[channel]
    };
}
