# DingTalk Channel for Clawdbot

A Clawdbot channel plugin for DingTalk (钉钉) using **Stream Mode** for seamless integration.

## Features

- **Stream Mode**: Uses WebSocket for real-time message receiving (no public IP required)
- **Zero Configuration**: No webhook setup, ngrok, or firewall configuration needed
- **Single/Group Chat**: Supports both direct messages and group mentions
- **Easy Setup**: Just configure your DingTalk app credentials
- **Media Support**: Send images via markdown format
- **Auto Chunking**: Automatically splits long messages (2000 char limit)

## Installation

### Option 1: From npm (recommended)
```bash
clawdbot plugins install moltbot-dingtalk-stream
```

### Option 2: Manual installation
```bash
git clone https://github.com/your-repo/moltbot-dingtalk-stream.git
cd moltbot-dingtalk-stream
npm install && npm run build
cp -r . ~/.clawdbot/extensions/moltbot-dingtalk-stream
clawdbot gateway restart
```

## Configuration

Configure in your `~/.clawdbot/clawdbot.json`:

```json
{
  "channels": {
    "moltbot-dingtalk-stream": {
      "enabled": true,
      "clientId": "YOUR_APP_KEY",
      "clientSecret": "YOUR_APP_SECRET"
    }
  }
}
```

Or use environment variables:
```bash
export DINGTALK_CLIENT_ID="YOUR_APP_KEY"
export DINGTALK_CLIENT_SECRET="YOUR_APP_SECRET"
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
          "clientSecret": "APP_SECRET_1"
        },
        "work": {
          "enabled": true,
          "clientId": "APP_KEY_2",
          "clientSecret": "APP_SECRET_2"
        }
      }
    }
  }
}
```

## DingTalk App Setup

1. Go to [DingTalk Developer Console](https://open.dingtalk.com/)
2. Create an **Enterprise Internal Application**
3. Add **Robot** capability
4. Enable **Stream Mode** (消息接收模式 → Stream模式)
5. Copy the **AppKey** (as `clientId`) and **AppSecret** (as `clientSecret`)
6. Publish and deploy the application

## Proactive Messaging (CLI)

Send messages to DingTalk conversations using the Clawdbot CLI:

```bash
# Send to a specific conversation
clawdbot send --channel moltbot-dingtalk-stream --to <conversationId> "Hello from CLI"

# The conversationId can be found in logs when a message is received
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No messages received | Check if Stream Mode is enabled in DingTalk app settings |
| Connection failed | Verify `clientId` and `clientSecret` are correct |
| Reply not sent | Ensure the bot has been messaged first (webhook is per-session) |
| Permission denied | Check app permissions in DingTalk Developer Console |

### Debug Logs

```bash
clawdbot logs --follow
```

Look for `[default] DingTalk Stream client connected` to confirm connection.

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  DingTalk API   │ ◄─────────────────► │  Clawdbot Plugin │
│  (Stream Mode)  │                     │  (This Plugin)   │
└─────────────────┘                     └──────────────────┘
                                               │
                                               ▼
                                        ┌──────────────────┐
                                        │  Clawdbot Agent  │
                                        │  (AI Processing) │
                                        └──────────────────┘
```

## License

MIT

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.