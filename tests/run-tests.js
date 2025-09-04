#!/usr/bin/env node


/**
 * Test Runner for Advanced Stream Scheduler
 * 
 * This script runs all tests and provides a summary of results.
 * It can be used to run tests individually or all at once.
 */

import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
    log('\n' + '='.repeat(60), 'bright');
    log(` ${message}`, 'bright');
    log('='.repeat(60), 'bright');
}

function logSection(message) {
    log('\n' + '-'.repeat(40), 'cyan');
    log(` ${message}`, 'cyan');
    log('-'.repeat(40), 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

// Find all test files recursively
function findTestFiles(dir, testFiles = []) {
    const items = readdirSync(dir);
    
    for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
            findTestFiles(fullPath, testFiles);
        } else if (item.endsWith('.test.js')) {
            testFiles.push(fullPath);
        }
    }
    
    return testFiles;
}

// Run a single test file
function runTestFile(testFile) {
    try {
        logInfo(`Running: ${testFile}`);
        
        const result = execSync(`npx mocha "${testFile}" --reporter spec`, {
            encoding: 'utf8',
            stdio: 'pipe'
        });
        
        logSuccess(`Test passed: ${testFile}`);
        return { success: true, file: testFile, output: result };
    } catch (error) {
        logError(`Test failed: ${testFile}`);
        return { success: false, file: testFile, error: error.message, output: error.stdout || '' };
    }
}

// Run all tests
function runAllTests() {
    logHeader('Advanced Stream Scheduler - Test Suite');
    
    const testFiles = findTestFiles('./tests');
    
    if (testFiles.length === 0) {
        logWarning('No test files found in ./tests directory');
        return;
    }
    
    logSection(`Found ${testFiles.length} test files`);
    testFiles.forEach(file => logInfo(`  ${file}`));
    
    logSection('Running Tests');
    
    const results = [];
    let passed = 0;
    let failed = 0;
    
    for (const testFile of testFiles) {
        const result = runTestFile(testFile);
        results.push(result);
        
        if (result.success) {
            passed++;
        } else {
            failed++;
        }
    }
    
    // Summary
    logSection('Test Results Summary');
    logSuccess(`Passed: ${passed}`);
    
    if (failed > 0) {
        logError(`Failed: ${failed}`);
    } else {
        logSuccess(`Failed: ${failed}`);
    }
    
    logInfo(`Total: ${testFiles.length}`);
    
    // Show failed tests details
    if (failed > 0) {
        logSection('Failed Tests Details');
        results
            .filter(r => !r.success)
            .forEach(result => {
                logError(`${result.file}`);
                log(`  Error: ${result.error}`, 'red');
                if (result.output) {
                    log(`  Output: ${result.output.substring(0, 200)}...`, 'yellow');
                }
            });
    }
    
    // Overall result
    logSection('Overall Result');
    if (failed === 0) {
        logSuccess('🎉 All tests passed! The codebase is in good shape.');
    } else {
        logError(`💥 ${failed} test(s) failed. Please review and fix the issues.`);
        process.exit(1);
    }
}

// Run specific test category
function runTestCategory(category) {
    logHeader(`Running ${category} Tests`);
    
    const testFiles = findTestFiles('./tests')
        .filter(file => file.includes(category));
    
    if (testFiles.length === 0) {
        logWarning(`No test files found for category: ${category}`);
        return;
    }
    
    logSection(`Found ${testFiles.length} test files for ${category}`);
    testFiles.forEach(file => logInfo(`  ${file}`));
    
    logSection('Running Tests');
    
    const results = [];
    let passed = 0;
    let failed = 0;
    
    for (const testFile of testFiles) {
        const result = runTestFile(testFile);
        results.push(result);
        
        if (result.success) {
            passed++;
        } else {
            failed++;
        }
    }
    
    // Summary
    logSection(`${category} Test Results`);
    logSuccess(`Passed: ${passed}`);
    logError(`Failed: ${failed}`);
    logInfo(`Total: ${testFiles.length}`);
    
    if (failed === 0) {
        logSuccess(`🎉 All ${category} tests passed!`);
    } else {
        logError(`💥 ${failed} ${category} test(s) failed.`);
        process.exit(1);
    }
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // Run all tests
        runAllTests();
    } else if (args[0] === '--help' || args[0] === '-h') {
        logHeader('Test Runner Help');
        logInfo('Usage:');
        log('  node tests/run-tests.js              # Run all tests');
        log('  node tests/run-tests.js oauth        # Run OAuth-related tests');
        log('  node tests/run-tests.js scheduler    # Run scheduler tests');
        log('  node tests/run-tests.js obs          # Run OBS integration tests');
        log('  node tests/run-tests.js action       # Run action management tests');
        log('  node tests/run-tests.js integration  # Run integration tests');
        log('  node tests/run-tests.js --help       # Show this help');
    } else {
        // Run specific category
        const category = args[0].toLowerCase();
        runTestCategory(category);
    }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
