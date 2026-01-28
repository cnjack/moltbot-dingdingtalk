# DingTalk Channel for Moltbot

A Moltbot channel plugin for DingTalk (钉钉) using **Stream Mode** for seamless integration.

## Features

- **Stream Mode**: Uses WebSocket for receiving messages (no public IP required)
- **Zero Configuration**: No webhook setup, ngrok, or firewall configuration needed
- **Single/Group Chat**: Supports both direct messages and group mentions
- **Easy Setup**: Just configure your DingTalk app credentials

## Proactive Messaging (CLI)

You can send messages to DingTalk conversations using the Clawdbot CLI. You need the `conversationId` (which you can find in the logs when a message is received).

```bash
clawdbot send --channel dingtalk --to <conversationId> "Hello from CLI"
```

## Troubleshooting

- **Logs**: Check `~/.clawdbot/logs/gateway.log` for debug information.
- **Connection**: Ensure your server has outbound internet access to DingTalk servers.
- **Permissions**: Verify your DingTalk app has the necessary robot permissions.

## Quick Start

1. Install the plugin:
   ```bash
   npm install moltbot-dingtalk-stream
   ```

2. Configure in your moltbot config:
   ```json
   {
     "channels": {
       "dingtalk": {
         "accounts": {
           "default": {
             "enabled": true,
             "clientId": "YOUR_APP_KEY",
             "clientSecret": "YOUR_APP_SECRET"
           }
         }
       }
     }
   }
   ```

3. Set up your DingTalk app:
   - Create an enterprise internal app at [DingTalk Developer Console](https://open.dingtalk.com/)
   - Add Robot capability with **Stream Mode** enabled
   - Use the AppKey as `clientId` and AppSecret as `clientSecret`

## Documentation

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed setup and configuration.

## License

MIT