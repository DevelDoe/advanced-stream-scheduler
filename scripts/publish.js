#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
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

function exec(command, options = {}) {
    try {
        return execSync(command, { stdio: 'inherit', ...options });
    } catch (error) {
        log(`❌ Command failed: ${command}`, 'red');
        process.exit(1);
    }
}

function getCurrentVersion() {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.version;
}

function updateVersion(type) {
    log(`📦 Updating version (${type})...`, 'blue');
    exec(`npm version ${type} --no-git-tag-version`);
    const newVersion = getCurrentVersion();
    log(`✅ Version updated to ${newVersion}`, 'green');
    return newVersion;
}

function checkGitStatus() {
    log('🔍 Checking git status...', 'blue');
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
        log('❌ You have uncommitted changes. Please commit or stash them first.', 'red');
        log('Modified files:', 'yellow');
        log(status, 'yellow');
        process.exit(1);
    }
    log('✅ Git status clean', 'green');
}

function buildApp() {
    log('🔨 Building application...', 'blue');
    exec('npm run clean');
    exec('npm run dist');
    log('✅ Build completed', 'green');
}

function createGitTag(version) {
    log(`🏷️  Creating git tag v${version}...`, 'blue');
    exec(`git add .`);
    exec(`git commit -m "Release v${version}"`);
    exec(`git tag v${version}`);
    log('✅ Git tag created', 'green');
}

function pushToGitHub(version) {
    log('🚀 Pushing to GitHub...', 'blue');
    exec('git push origin main');
    exec(`git push origin v${version}`);
    log('✅ Pushed to GitHub', 'green');
}

function main() {
    const args = process.argv.slice(2);
    const type = args[0] || 'patch';
    
    if (!['patch', 'minor', 'major'].includes(type)) {
        log('❌ Invalid version type. Use: patch, minor, or major', 'red');
        process.exit(1);
    }
    
    log('🚀 Starting release process...', 'magenta');
    log(`📋 Release type: ${type}`, 'cyan');
    
    // Check prerequisites
    checkGitStatus();
    
    // Update version
    const newVersion = updateVersion(type);
    
    // Build the app
    buildApp();
    
    // Create git tag and push
    createGitTag(newVersion);
    pushToGitHub(newVersion);
    
    log('🎉 Release process completed!', 'green');
    log(`📦 Version ${newVersion} has been released`, 'green');
    log('🔗 Check GitHub for the release: https://github.com/your-username/arcane-stream-scheduler/releases', 'cyan');
}

if (require.main === module) {
    main();
}
