# Testing Guide for Advanced Stream Scheduler

This directory contains comprehensive tests for the Advanced Stream Scheduler application, ensuring code quality, reliability, and preventing regressions.

## 🧪 Test Framework

- **Mocha**: Test runner and framework
- **Chai**: Assertion library with BDD syntax
- **Sinon**: Mocking and stubbing library
- **Babel**: ES6+ support for modern JavaScript features

## 📁 Test Structure

```
tests/
├── helpers/           # Test utilities and common mocks
│   └── test-utils.js
├── unit/             # Unit tests for individual modules
│   ├── youtube-api.test.js
│   ├── main-process-oauth.test.js
│   ├── renderer-oauth.test.js
│   ├── scheduler.test.js
│   └── obs-integration.test.js
├── integration/      # Integration tests (future)
├── run-tests.js      # Custom test runner
└── README.md         # This file
```

## 🚀 Running Tests

### Run All Tests
```bash
npm test
# or
npx mocha
# or
node tests/run-tests.js
```

### Run Specific Test Categories
```bash
# OAuth-related tests
node tests/run-tests.js oauth

# Scheduler tests
node tests/run-tests.js scheduler

# OBS integration tests
node tests/run-tests.js obs
```

### Run Individual Test Files
```bash
npx mocha tests/unit/youtube-api.test.js
npx mocha tests/unit/scheduler.test.js
```

### Watch Mode (Development)
```bash
npm run test:watch
```

## 🎯 Test Categories

### 1. OAuth Flow Protection Tests
**File**: `tests/unit/youtube-api.test.js`
- Global state management for OAuth flows
- Prevention of multiple simultaneous OAuth processes
- Request queuing and callback management
- Timeout mechanisms and cleanup
- Manual cancellation functionality

**File**: `tests/unit/main-process-oauth.test.js`
- IPC handlers for OAuth status and cancellation
- OAuth protection in polling mechanisms
- OAuth checks in scheduler actions
- OAuth protection in YouTube API calls

**File**: `tests/unit/renderer-oauth.test.js`
- OAuth status display and polling
- User interface for OAuth cancellation
- OAuth protection in credential operations
- Button state management during OAuth flows

### 2. Scheduler Functionality Tests
**File**: `tests/unit/scheduler.test.js`
- Cron job scheduling and validation
- Timezone handling and conversion
- Job management (add, remove, list)
- Recurring stream logic
- Error handling and edge cases
- Performance and scalability

### 3. OBS Integration Tests
**File**: `tests/unit/obs-integration.test.js`
- OBS WebSocket connection management
- Scene management and switching
- Stream control (start/stop)
- Settings management and validation
- Event handling
- Error recovery and resilience
- Performance monitoring

## 🛠️ Writing New Tests

### Test Structure
```javascript
import { expect } from 'chai';
import sinon from 'sinon';
import { createMockOAuth2Client, resetStubs } from '../helpers/test-utils.js';

describe('Feature Name', () => {
    let mockDependency;
    
    beforeEach(() => {
        resetStubs();
        mockDependency = createMockOAuth2Client();
    });
    
    afterEach(() => {
        resetStubs();
    });
    
    describe('Specific Functionality', () => {
        it('should behave correctly under normal conditions', async () => {
            // Arrange
            mockDependency.method.returns('expected value');
            
            // Act
            const result = await functionUnderTest();
            
            // Assert
            expect(result).to.equal('expected value');
            expect(mockDependency.method).to.have.been.calledOnce;
        });
        
        it('should handle errors gracefully', async () => {
            // Arrange
            mockDependency.method.rejects(new Error('Test error'));
            
            // Act & Assert
            try {
                await functionUnderTest();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.equal('Test error');
            }
        });
    });
});
```

### Best Practices
1. **Use descriptive test names** that explain the expected behavior
2. **Follow AAA pattern**: Arrange, Act, Assert
3. **Mock external dependencies** to isolate the unit under test
4. **Test both success and failure scenarios**
5. **Use beforeEach/afterEach** for setup and cleanup
6. **Group related tests** using describe blocks
7. **Test edge cases** and error conditions
8. **Keep tests focused** on a single piece of functionality

### Mocking Guidelines
- Use Sinon stubs for function calls
- Mock external APIs and services
- Create realistic mock data
- Reset mocks between tests
- Use the helper functions in `test-utils.js`

## 🔧 Test Configuration

### Mocha Configuration (`.mocharc.js`)
- ES6+ support via Babel
- 5-second timeout for tests
- Spec reporter for clear output
- Recursive test discovery

### Babel Configuration (`.babelrc`)
- Preset-env for modern JavaScript features
- Compatible with Node.js and browser environments

## 📊 Test Coverage

### Current Coverage Areas
- ✅ OAuth flow protection (comprehensive)
- ✅ Main process OAuth integration
- ✅ Renderer process OAuth UI
- ✅ Scheduler functionality
- ✅ OBS integration
- ✅ Error handling and edge cases

### Future Coverage Areas
- [ ] Integration tests between modules
- [ ] End-to-end user workflow tests
- [ ] Performance and load testing
- [ ] Security testing
- [ ] Accessibility testing

## 🐛 Debugging Tests

### Common Issues
1. **Import/Export errors**: Check ES module syntax
2. **Mock not working**: Ensure `resetStubs()` is called
3. **Async test failures**: Check for proper async/await usage
4. **Timeout errors**: Increase timeout for slow operations

### Debug Commands
```bash
# Run with verbose output
npx mocha --reporter spec --timeout 10000

# Run single test with debugging
npx mocha --grep "test name" --reporter spec

# Run with Node.js debugging
node --inspect-brk node_modules/.bin/mocha
```

## 📈 Continuous Integration

### GitHub Actions
Tests should run automatically on:
- Pull requests
- Push to main branch
- Scheduled runs

### Pre-commit Hooks
Consider adding pre-commit hooks to run tests before commits:
```bash
# Install husky and lint-staged
npm install --save-dev husky lint-staged

# Add to package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test"
    }
  }
}
```

## 🤝 Contributing

When adding new features:
1. **Write tests first** (TDD approach)
2. **Ensure all tests pass** before submitting PR
3. **Add tests for edge cases** and error conditions
4. **Update this README** if adding new test categories
5. **Follow existing test patterns** and conventions

## 📚 Resources

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertion Library](https://www.chaijs.com/)
- [Sinon.js Documentation](https://sinonjs.org/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## 🎉 Success Metrics

- **Test Coverage**: Aim for >90% code coverage
- **Test Execution Time**: All tests should complete in <30 seconds
- **Test Reliability**: Tests should be deterministic and not flaky
- **Maintenance**: Tests should be easy to understand and maintain

---

**Remember**: Good tests are an investment in code quality and developer productivity. They catch bugs early, prevent regressions, and serve as living documentation of how the code should behave.
