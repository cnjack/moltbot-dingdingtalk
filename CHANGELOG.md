# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-06

### Added
- **Multi-message type support**: Now supports receiving text, picture, audio, video, file, and richText messages
- **Voice recognition**: Audio messages automatically use DingTalk's built-in speech recognition (`recognition` field)
- **Media download**: Automatically downloads media files (images, audio, video, files) to local workspace
- **Auto Markdown detection**: Replies automatically detect markdown patterns and use rich text format
- **Access Token caching**: Improved performance with token caching and automatic refresh
- **New config option**: `robotCode` for media download (defaults to `clientId` if not set)
- **New environment variable**: `DINGTALK_ROBOT_CODE` support

### Changed
- `extractMessageContent()`: New function to parse multiple message types
- `detectMarkdownAndExtractTitle()`: Auto-detect markdown and extract title for rich replies
- `handleMessage()`: Updated to use new message parsing and support media downloads
- `sendMessage()`: Auto-detects markdown patterns in outbound messages
- `InboundContext`: Added `MediaPath`, `MediaType`, `MediaUrl` fields

### Message Types Supported
| Type | msgtype | Description |
|------|---------|-------------|
| Text | `text` | Plain text messages |
| Picture | `picture` | Image messages with download |
| Audio | `audio` | Voice messages with speech recognition |
| Video | `video` | Video messages with download |
| File | `file` | File messages with filename |
| RichText | `richText` | Mixed content (text + images) |

## [1.0.10] - 2026-02-05

### Changed
- Updated to support OpenClaw runtime

## [1.0.9] - 2026-02-03

### Changed
- Renamed from Clawdbot to OpenClaw following the upstream rebranding
- Updated plugin manifest from `clawdbot.plugin.json` to `openclaw.plugin.json`
- Updated package.json: `clawdbot` section renamed to `openclaw`, dependency changed to `openclaw`
- Updated all TypeScript types: `ClawdbotConfig` → `OpenClawConfig`, `ClawdbotPluginApi` → `OpenClawPluginApi`, etc.
- Updated README.md with new CLI commands and config paths

## [1.0.8] - 2026-01-29

### Changed
- All Chinese comments and log messages converted to English for better international support
- Improved code organization and readability
- Updated README with comprehensive documentation
- Added CHANGELOG

## [1.0.7] - 2026-01-29

### Fixed
- Fixed webhook lookup issue where reply messages couldn't find the correct session webhook
- Webhook is now stored with multiple keys (conversationId, senderId, prefixed formats) for flexible lookup
