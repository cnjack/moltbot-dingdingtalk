# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
