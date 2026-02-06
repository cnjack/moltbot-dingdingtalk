# DingTalk Channel for OpenClaw

An OpenClaw channel plugin for DingTalk (钉钉) using **Stream Mode** for seamless integration.

> version `1.1.0` - Multi-message type support & Markdown replies

## Features

- **Stream Mode**: Uses WebSocket for real-time message receiving (no public IP required)
- **Zero Configuration**: No webhook setup, ngrok, or firewall configuration needed
- **Single/Group Chat**: Supports both direct messages and group mentions
- **Multi-Message Types**: Supports text, image, audio, video, and file messages
- **Voice Recognition**: Audio messages automatically use DingTalk's built-in speech recognition
- **Markdown Replies**: Auto-detects markdown patterns for rich text formatting
- **Media Download**: Automatically downloads media files to local workspace
- **Auto Chunking**: Automatically splits long messages (2000 char limit)

## Supported Message Types

| Type | Incoming | Outgoing | Notes |
|------|:--------:|:--------:|-------|
| Text | ✅ | ✅ | Plain text messages |
| Image | ✅ (download) | ✅ (markdown) | Auto-downloaded to workspace |
| Audio | ✅ (with recognition) | ❌ | Speech-to-text included |
| Video | ✅ (download) | ❌ | Auto-downloaded to workspace |
| File | ✅ (download) | ❌ | Filename preserved |
| RichText | ✅ | ❌ | Mixed text + images |
| Markdown | - | ✅ | Auto-detected for replies |

## Installation

### Option 1: From npm (recommended)
```bash
openclaw plugins install moltbot-dingtalk-stream
```

### Option 2: Manual installation
```bash
git clone https://github.com/your-repo/moltbot-dingtalk-stream.git
cd moltbot-dingtalk-stream
npm install
# optional: typecheck only (no JS build)
npm run typecheck
cp -r . ~/.openclaw/extensions/moltbot-dingtalk-stream
openclaw gateway restart
```

## Configuration

Configure in your `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "moltbot-dingtalk-stream": {
      "enabled": true,
      "clientId": "YOUR_APP_KEY",
      "clientSecret": "YOUR_APP_SECRET",
      "robotCode": "YOUR_ROBOT_CODE"
    }
  }
}
```

> **Note**: `robotCode` is optional and defaults to `clientId`. It's required for media download functionality.

Or use environment variables:
```bash
export DINGTALK_CLIENT_ID="YOUR_APP_KEY"
export DINGTALK_CLIENT_SECRET="YOUR_APP_SECRET"
export DINGTALK_ROBOT_CODE="YOUR_ROBOT_CODE"  # optional
```

### Multi-Account Setup

```json
{
  "channels": {
    "moltbot-dingtalk-stream": {
      "enabled": true,
      "accounts": {
        "default": {
          "enabled": true,
          "clientId": "APP_KEY_1",
          "clientSecret": "APP_SECRET_1",
          "robotCode": "ROBOT_CODE_1"
        },
        "work": {
          "enabled": true,
          "clientId": "APP_KEY_2",
          "clientSecret": "APP_SECRET_2",
          "robotCode": "ROBOT_CODE_2"
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|:--------:|---------|-------------|
| `clientId` | string | ✅ | - | DingTalk App Key |
| `clientSecret` | string | ✅ | - | DingTalk App Secret |
| `robotCode` | string | ❌ | clientId | Robot code for media download |
| `enabled` | boolean | ❌ | true | Enable/disable the channel |
| `requireMention` | boolean | ❌ | true | Require @mention in groups |
| `verboseLevel` | "off"\|"on"\|"full" | ❌ | "off" | Tool call display level |

## DingTalk App Setup

1. Go to [DingTalk Developer Console](https://open.dingtalk.com/)
2. Create an **Enterprise Internal Application**
3. Add **Robot** capability
4. Enable **Stream Mode** (消息接收模式 → Stream模式)
5. Copy the **AppKey** (as `clientId`) and **AppSecret** (as `clientSecret`)
6. Note the **Robot Code** (机器人代码) for media download
7. Publish and deploy the application

## Proactive Messaging (CLI)

Send messages to DingTalk conversations using the OpenClaw CLI:

```bash
# Send to a specific conversation
openclaw send --channel moltbot-dingtalk-stream --to <conversationId> "Hello from CLI"

# The conversationId can be found in logs when a message is received
```

## Message Handling

### Incoming Messages

The plugin automatically handles different message types:

```
User sends image → [图片] placeholder + downloaded file path
User sends audio → Speech recognition text + downloaded audio file  
User sends video → [视频] placeholder + downloaded video file
User sends file  → [文件: filename] + downloaded file
```

### Outgoing Messages

Markdown formatting is auto-detected:

```markdown
# Header       → Markdown mode
**Bold text**  → Markdown mode
- List item    → Markdown mode
Plain text     → Text mode
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No messages received | Check if Stream Mode is enabled in DingTalk app settings |
| Connection failed | Verify `clientId` and `clientSecret` are correct |
| Reply not sent | Ensure the bot has been messaged first (webhook is per-session) |
| Permission denied | Check app permissions in DingTalk Developer Console |
| Media not downloading | Ensure `robotCode` is configured (defaults to clientId) |
| Voice text not showing | Use audio messages (语音), recognition is automatic |

### Debug Logs

```bash
openclaw logs --follow
```

Look for `[default] DingTalk Stream client connected` to confirm connection.

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  DingTalk API   │ ◄─────────────────► │  OpenClaw Plugin │
│  (Stream Mode)  │                     │  (This Plugin)   │
└─────────────────┘                     └──────────────────┘
                                               │
                                               ▼
                                   ┌────────────────────────┐
                                   │     Media Download     │
                                   │  (image/audio/video)   │
                                   └────────────────────────┘
                                               │
                                               ▼
                                        ┌──────────────────┐
                                        │  OpenClaw Agent  │
                                        │  (AI Processing) │
                                        └──────────────────┘
                                               │
                                               ▼
                                   ┌────────────────────────┐
                                   │   Markdown Detection   │
                                   │   (Auto-formatting)    │
                                   └────────────────────────┘
```

## License

MIT

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.
