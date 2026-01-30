"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DingTalkConfigSchema = exports.DEFAULT_ACCOUNT_ID = exports.CHANNEL_ID = void 0;
exports.listDingTalkAccountIds = listDingTalkAccountIds;
exports.resolveDingTalkAccount = resolveDingTalkAccount;
exports.resolveDefaultDingTalkAccountId = resolveDefaultDingTalkAccountId;
exports.normalizeAccountId = normalizeAccountId;
exports.setAccountEnabledInConfig = setAccountEnabledInConfig;
exports.deleteAccountFromConfig = deleteAccountFromConfig;
exports.applyAccountNameToConfig = applyAccountNameToConfig;
// Channel ID
exports.CHANNEL_ID = "moltbot-dingtalk-stream";
exports.DEFAULT_ACCOUNT_ID = "default";
// Config schema for validation
exports.DingTalkConfigSchema = {
    type: "object",
    properties: {
        enabled: { type: "boolean" },
        clientId: { type: "string" },
        clientSecret: { type: "string" },
        webhookUrl: { type: "string" },
        name: { type: "string" },
        groupPolicy: { type: "string", enum: ["open", "allowlist"] },
        requireMention: { type: "boolean" },
        verboseLevel: { type: "string", enum: ["off", "on", "full"] },
        dm: {
            type: "object",
            properties: {
                policy: { type: "string", enum: ["open", "pairing", "allowlist"] },
                allowFrom: { type: "array", items: { type: "string" } },
            },
        },
        accounts: {
            type: "object",
            additionalProperties: {
                type: "object",
                properties: {
                    enabled: { type: "boolean" },
                    clientId: { type: "string" },
                    clientSecret: { type: "string" },
                    webhookUrl: { type: "string" },
                    name: { type: "string" },
                    verboseLevel: { type: "string", enum: ["off", "on", "full"] },
                },
                required: ["clientId", "clientSecret"],
            },
        },
    },
};
// Helper functions
function listDingTalkAccountIds(cfg) {
    const channelConfig = cfg.channels?.[exports.CHANNEL_ID];
    if (!channelConfig)
        return [];
    const accountIds = [];
    // Check for top-level (default) account
    if (channelConfig.clientId && channelConfig.clientSecret) {
        accountIds.push(exports.DEFAULT_ACCOUNT_ID);
    }
    // Check for named accounts
    const accounts = channelConfig.accounts;
    if (accounts) {
        for (const id of Object.keys(accounts)) {
            if (id !== exports.DEFAULT_ACCOUNT_ID || !accountIds.includes(exports.DEFAULT_ACCOUNT_ID)) {
                accountIds.push(id);
            }
        }
    }
    return accountIds;
}
function resolveDingTalkAccount(opts) {
    const { cfg, accountId = exports.DEFAULT_ACCOUNT_ID } = opts;
    const channelConfig = cfg.channels?.[exports.CHANNEL_ID];
    // Try to get account config
    let accountConfig;
    let tokenSource = "none";
    if (accountId === exports.DEFAULT_ACCOUNT_ID) {
        // For default account, check top-level first, then accounts.default
        if (channelConfig?.clientId && channelConfig?.clientSecret) {
            accountConfig = {
                enabled: channelConfig.enabled,
                clientId: channelConfig.clientId,
                clientSecret: channelConfig.clientSecret,
                webhookUrl: channelConfig.webhookUrl,
                name: channelConfig.name,
                groupPolicy: channelConfig.groupPolicy,
                requireMention: channelConfig.requireMention,
                dm: channelConfig.dm,
            };
            tokenSource = "config";
        }
        else if (channelConfig?.accounts?.[exports.DEFAULT_ACCOUNT_ID]) {
            accountConfig = channelConfig.accounts[exports.DEFAULT_ACCOUNT_ID];
            tokenSource = "config";
        }
        else if (process.env.DINGTALK_CLIENT_ID && process.env.DINGTALK_CLIENT_SECRET) {
            accountConfig = {
                enabled: true,
                clientId: process.env.DINGTALK_CLIENT_ID,
                clientSecret: process.env.DINGTALK_CLIENT_SECRET,
                webhookUrl: process.env.DINGTALK_WEBHOOK_URL,
            };
            tokenSource = "env";
        }
    }
    else {
        // Named account
        accountConfig = channelConfig?.accounts?.[accountId];
        if (accountConfig) {
            tokenSource = "config";
        }
    }
    const config = accountConfig || { clientId: "", clientSecret: "" };
    return {
        accountId,
        name: config.name,
        enabled: config.enabled ?? true,
        configured: Boolean(config.clientId?.trim() && config.clientSecret?.trim()),
        clientId: config.clientId || "",
        clientSecret: config.clientSecret || "",
        tokenSource,
        config,
        verboseLevel: config.verboseLevel ?? channelConfig?.verboseLevel ?? "off",
    };
}
function resolveDefaultDingTalkAccountId(cfg) {
    const accountIds = listDingTalkAccountIds(cfg);
    return accountIds.includes(exports.DEFAULT_ACCOUNT_ID)
        ? exports.DEFAULT_ACCOUNT_ID
        : accountIds[0] || exports.DEFAULT_ACCOUNT_ID;
}
function normalizeAccountId(accountId) {
    if (!accountId || accountId === "default" || accountId === "") {
        return exports.DEFAULT_ACCOUNT_ID;
    }
    return accountId.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}
function setAccountEnabledInConfig(opts) {
    const { cfg, accountId, enabled } = opts;
    const channelConfig = cfg.channels?.[exports.CHANNEL_ID] || {};
    if (accountId === exports.DEFAULT_ACCOUNT_ID && channelConfig.clientId) {
        // Top-level default account
        return {
            ...cfg,
            channels: {
                ...cfg.channels,
                [exports.CHANNEL_ID]: {
                    ...channelConfig,
                    enabled,
                },
            },
        };
    }
    // Named account
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            [exports.CHANNEL_ID]: {
                ...channelConfig,
                accounts: {
                    ...channelConfig.accounts,
                    [accountId]: {
                        ...channelConfig.accounts?.[accountId],
                        enabled,
                    },
                },
            },
        },
    };
}
function deleteAccountFromConfig(opts) {
    const { cfg, accountId } = opts;
    const channelConfig = cfg.channels?.[exports.CHANNEL_ID];
    if (!channelConfig)
        return cfg;
    if (accountId === exports.DEFAULT_ACCOUNT_ID && channelConfig.clientId) {
        // Remove top-level credentials
        const { clientId, clientSecret, webhookUrl, name, ...rest } = channelConfig;
        return {
            ...cfg,
            channels: {
                ...cfg.channels,
                [exports.CHANNEL_ID]: rest,
            },
        };
    }
    // Remove named account
    if (channelConfig.accounts?.[accountId]) {
        const { [accountId]: removed, ...remainingAccounts } = channelConfig.accounts;
        return {
            ...cfg,
            channels: {
                ...cfg.channels,
                [exports.CHANNEL_ID]: {
                    ...channelConfig,
                    accounts: remainingAccounts,
                },
            },
        };
    }
    return cfg;
}
function applyAccountNameToConfig(opts) {
    const { cfg, accountId, name } = opts;
    if (!name)
        return cfg;
    const channelConfig = cfg.channels?.[exports.CHANNEL_ID] || {};
    if (accountId === exports.DEFAULT_ACCOUNT_ID && channelConfig.clientId) {
        return {
            ...cfg,
            channels: {
                ...cfg.channels,
                [exports.CHANNEL_ID]: {
                    ...channelConfig,
                    name,
                },
            },
        };
    }
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            [exports.CHANNEL_ID]: {
                ...channelConfig,
                accounts: {
                    ...channelConfig.accounts,
                    [accountId]: {
                        ...channelConfig.accounts?.[accountId],
                        name,
                    },
                },
            },
        },
    };
}
//# sourceMappingURL=schema.js.map