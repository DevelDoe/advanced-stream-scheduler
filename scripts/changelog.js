#!/usr/bin/env node

import { execSync } from 'child_process';

function getChangelog(fromTag, toTag = 'HEAD') {
    try {
        const commits = execSync(
            `git log --pretty=format:"- %s" ${fromTag}..${toTag}`,
            { encoding: 'utf8' }
        );
        
        if (!commits.trim()) {
            return 'No changes detected';
        }
        
        return commits.trim();
    } catch (error) {
        return 'Unable to generate changelog';
    }
}

function main() {
    const args = process.argv.slice(2);
    const fromTag = args[0] || 'HEAD~10';
    const toTag = args[1] || 'HEAD';
    
    const changelog = getChangelog(fromTag, toTag);
    console.log(changelog);
}

// ES module equivalent of require.main === module
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
