# Release Checklist

## Pre-Release

- [ ] All features are implemented and tested
- [ ] All bugs are fixed
- [ ] README is up to date
- [ ] Version number is correct in `package.json`
- [ ] No sensitive data in the codebase
- [ ] All dependencies are up to date
- [ ] Build works locally (`npm run dist`)

## Release Process

### 1. Automated Release (Recommended)
```bash
# Choose release type:
npm run publish:patch  # Bug fixes
npm run publish:minor  # New features  
npm run publish:major  # Breaking changes
```

### 2. Manual Release (If needed)
```bash
# Update version
npm version patch|minor|major

# Build
npm run dist

# Create tag
git tag v$(npm run version --silent)
git push origin main
git push origin v$(npm run version --silent)
```

## Post-Release

- [ ] GitHub release is created automatically
- [ ] Release notes are accurate
- [ ] Download links work
- [ ] Test installer on clean system
- [ ] Test portable version
- [ ] Update documentation if needed
- [ ] Announce on social media/discord

## Release Types

### Patch (1.0.0 → 1.0.1)
- Bug fixes
- Minor improvements
- Documentation updates

### Minor (1.0.0 → 1.1.0)
- New features
- Non-breaking changes
- UI improvements

### Major (1.0.0 → 2.0.0)
- Breaking changes
- Major refactoring
- Significant new functionality

## Testing Checklist

- [ ] App starts without errors
- [ ] Google OAuth setup works
- [ ] OBS WebSocket connection works
- [ ] Stream scheduling works
- [ ] Actions are executed correctly
- [ ] Recurring streams work
- [ ] Cleanup functions work
- [ ] All menu options work
- [ ] Error handling works properly
