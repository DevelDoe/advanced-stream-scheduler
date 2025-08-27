# Arcane Stream Scheduler

A desktop application for scheduling and automating YouTube live streams with OBS integration.

## 🚀 Quick Start (For Users)

### **📦 Installation**
1. **Download** the latest release from [GitHub Releases](https://github.com/DevelDoe/arcane-stream-scheduler/releases)
2. **Install** the `.exe` file (Windows installer)
3. **Run** the application
4. **Setup** Google OAuth credentials (see detailed instructions below)

### **🔄 Auto-Updates**
The app automatically checks for updates every 6 hours and on startup. When an update is available:
- **Notification** appears in the log
- **Update badge** shows in the status bar
- **Download** happens automatically
- **Install prompt** appears when ready

You can also manually check for updates via **Tools → Check for Updates**.

### 2. First-Time Setup
1. **Launch** the application
2. **Google Setup**: Go to `File → Google Credentials Setup` and follow the instructions
3. **OBS Setup**: Go to `File → OBS Settings` and configure your OBS connection
4. **Start Scheduling**: Create your first stream!

### 3. Basic Usage
- **Schedule Streams**: Fill in title, time, and details, then click "Schedule Stream"
- **Add Actions**: Click "Add Action" on any stream to automate OBS scene changes
- **Monitor Status**: Watch the status badges to see if everything is working

---

## 📋 For Developers

### 🚀 Quick Release Commands

```bash
# Make your changes and commit them first
git add .
git commit -m "Your changes"

# Then release:
npm run publish:patch  # Bug fixes (1.0.0 → 1.0.1)
npm run publish:minor  # New features (1.0.0 → 1.1.0)  
npm run publish:major  # Breaking changes (1.0.0 → 2.0.0)
```

**What happens automatically:**
1. ✅ Version gets bumped
2. 🔨 App gets built for Windows
3. 🏷️ Git tag is created and pushed
4. 📋 GitHub release is created with installer & portable versions

**See full details in the [Development section](#development) below.**

## 📋 Detailed Setup Instructions

### 1. Google OAuth Credentials Setup

Before using the app, you need to set up Google OAuth credentials:

1. **Go to Google Cloud Console**
   - Visit [https://console.cloud.google.com/](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable YouTube Data API**
   - Go to "APIs & Services" → "Library"
   - Search for "YouTube Data API v3"
   - Click on it and press "Enable"

3. **Create OAuth Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Choose "Desktop application" as the application type
   - Give it a name (e.g., "Arcane Stream Scheduler")
   - Click "Create"

4. **Download Credentials**
   - Download the credentials file (it will have a random name like "client_secret_123456789-abcdefghijklmnop.apps.googleusercontent.com.json")
   - **No need to rename it** - the app will handle any filename

5. **Add Credentials to App**
   - Open the app
   - Go to **File → Google Credentials Setup**
   - Click "Select Credentials File" and choose your downloaded file
   - The app will validate and copy the file to the correct location

### 2. OBS Setup

1. **Install OBS WebSocket Plugin**
   - Download from: [https://github.com/obsproject/obs-websocket/releases](https://github.com/obsproject/obs-websocket/releases)
   - Install the plugin for your OBS version

2. **Configure OBS WebSocket**
   - In OBS, go to **Tools → WebSocket Server Settings**
   - Enable the WebSocket server
   - Set port to 4455 (default)
   - Optionally set a password

3. **Configure App OBS Settings**
   - In the app, go to **File → OBS Settings**
   - Set the host (usually "localhost")
   - Set the port (usually 4455)
   - Add password if you set one in OBS
   - Click "Test Connection" to verify

### 3. Create OBS Scenes

The app expects these scenes to exist in OBS:
- `intro` - Scene shown before going live
- `live` - Main streaming scene
- `end` - Scene shown when ending stream

You can customize scene names in the action settings.

## Usage

### Scheduling a Stream

1. Fill in the stream details:
   - **Title**: Your stream title
   - **Start Time**: When the stream should start
   - **Description**: Stream description
   - **Visibility**: Public, Unlisted, or Private
   - **Latency**: Ultra Low (recommended), Low, or Normal

2. **Optional Settings**:
   - **Thumbnail**: Click "Choose Thumbnail" to upload a custom thumbnail
   - **Recurring**: Check to make this stream repeat on selected days

3. Click "Schedule Stream"

### Managing Actions

Each scheduled stream can have automated actions:

1. **Add Action**: Click "Add Action" on any stream
2. **Action Types**:
   - **Change Scene**: Switch to a specific OBS scene
   - **End Stream**: Stop the stream

3. **Timing**: Set when each action should occur relative to stream start

### Monitoring

- **Status Badges**: Show real-time status of different components
- **Log**: View detailed activity logs
- **Refresh**: Click "Refresh Upcoming" to update the stream list

## Troubleshooting

### YouTube API Issues

- **"Credentials not configured"**: Use File → Google Credentials Setup
- **"Token invalid"**: Clear the stored token in credentials setup
- **"API quota exceeded"**: Check your Google Cloud Console quotas

### OBS Connection Issues

- **"OBS Connection: DOWN"**: 
  - Verify OBS is running
  - Check WebSocket server is enabled
  - Verify port and password settings
  - Test connection in OBS Settings

### General Issues

- **"Cleanup Orphaned Data"**: Removes actions for deleted streams
- **"Restart Scheduler"**: Restarts the automation system
- **Check logs**: Look at the log panel for detailed error messages

## File Locations

The app stores data in these locations:

- **Windows**: `%APPDATA%\Arcane Stream Scheduler\`
- **macOS**: `~/Library/Application Support/Arcane Stream Scheduler/`
- **Linux**: `~/.config/Arcane Stream Scheduler/`

Files include:
- `credentials.json` - Your Google OAuth credentials
- `token.json` - Stored authentication token
- `actions.json` - Scheduled actions
- `obs_config.json` - OBS WebSocket settings
- `upload_defaults.json` - Default stream settings

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build for distribution
npm run dist
```

### Publishing Releases

The app uses automated releases via GitHub Actions. To publish a new release:

```bash
# Patch release (bug fixes)
npm run publish:patch

# Minor release (new features)
npm run publish:minor

# Major release (breaking changes)
npm run publish:major
```

This will:
1. ✅ Check for uncommitted changes
2. 📦 Bump the version number
3. 🔨 Build the application
4. 🏷️ Create a git tag
5. 🚀 Push to GitHub
6. 📋 Automatically create a GitHub release with artifacts

### Release Artifacts

Each release includes:
- **Windows Installer** (`.exe`) - Automatic installation
- **Windows Portable** (`.zip`) - Portable version
- **Release Notes** - Auto-generated changelog

### Requirements

- Node.js 18+
- OBS Studio with WebSocket plugin
- Google Cloud Console account

## License

ISC License
