import type { z } from "zod";

// Channel ID
export const CHANNEL_ID = "moltbot-dingtalk-stream";
export const DEFAULT_ACCOUNT_ID = "default";

// Verbose level type
export type VerboseLevel = "off" | "on" | "full";

// DingTalk account configuration interface
export interface DingTalkAccountConfig {
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  webhookUrl?: string;
  name?: string;
  // Group settings
  groupPolicy?: "open" | "allowlist";
  requireMention?: boolean;
  // DM settings
  dm?: {
    policy?: "open" | "pairing" | "allowlist";
    allowFrom?: string[];
  };
  // Verbose level: controls tool call information display
  // - "off": don't show tool calls (default)
  // - "on": show tool summaries  
  // - "full": show tool summaries + output
  verboseLevel?: VerboseLevel;
}

// Resolved account with computed fields
export interface ResolvedDingTalkAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  tokenSource: "config" | "env" | "none";
  verboseLevel: VerboseLevel;
  config: DingTalkAccountConfig;
}

// Channel configuration interface
export interface DingTalkChannelConfig {
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  webhookUrl?: string;
  name?: string;
  groupPolicy?: "open" | "allowlist";
  requireMention?: boolean;
  dm?: {
    policy?: "open" | "pairing" | "allowlist";
    allowFrom?: string[];
  };
  // Verbose level: controls tool call information display
  // - "off": don't show tool calls (default)
  // - "on": show tool summaries  
  // - "full": show tool summaries + output
  verboseLevel?: VerboseLevel;
  accounts?: Record<string, DingTalkAccountConfig>;
}

// Full config interface
export interface ClawdbotConfig {
  channels?: {
    [CHANNEL_ID]?: DingTalkChannelConfig;
    defaults?: {
      groupPolicy?: "open" | "allowlist";
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Config schema for validation
export const DingTalkConfigSchema = {
  type: "object" as const,
  properties: {
    enabled: { type: "boolean" as const },
    clientId: { type: "string" as const },
    clientSecret: { type: "string" as const },
    webhookUrl: { type: "string" as const },
    name: { type: "string" as const },
    groupPolicy: { type: "string" as const, enum: ["open", "allowlist"] },
    requireMention: { type: "boolean" as const },
    verboseLevel: { type: "string" as const, enum: ["off", "on", "full"] },
    dm: {
      type: "object" as const,
      properties: {
        policy: { type: "string" as const, enum: ["open", "pairing", "allowlist"] },
        allowFrom: { type: "array" as const, items: { type: "string" as const } },
      },
    },
    accounts: {
      type: "object" as const,
      additionalProperties: {
        type: "object" as const,
        properties: {
          enabled: { type: "boolean" as const },
          clientId: { type: "string" as const },
          clientSecret: { type: "string" as const },
          webhookUrl: { type: "string" as const },
          name: { type: "string" as const },
          verboseLevel: { type: "string" as const, enum: ["off", "on", "full"] },
        },
        required: ["clientId", "clientSecret"],
      },
    },
  },
};

// Helper functions
export function listDingTalkAccountIds(cfg: ClawdbotConfig): string[] {
  const channelConfig = cfg.channels?.[CHANNEL_ID];
  if (!channelConfig) return [];

  const accountIds: string[] = [];

  // Check for top-level (default) account
  if (channelConfig.clientId && channelConfig.clientSecret) {
    accountIds.push(DEFAULT_ACCOUNT_ID);
  }

  // Check for named accounts
  const accounts = channelConfig.accounts;
  if (accounts) {
    for (const id of Object.keys(accounts)) {
      if (id !== DEFAULT_ACCOUNT_ID || !accountIds.includes(DEFAULT_ACCOUNT_ID)) {
        accountIds.push(id);
      }
    }
  }

  return accountIds;
}

export function resolveDingTalkAccount(opts: {
  cfg: ClawdbotConfig;
  accountId?: string;
}): ResolvedDingTalkAccount {
  const { cfg, accountId = DEFAULT_ACCOUNT_ID } = opts;
  const channelConfig = cfg.channels?.[CHANNEL_ID];

  // Try to get account config
  let accountConfig: DingTalkAccountConfig | undefined;
  let tokenSource: "config" | "env" | "none" = "none";

  if (accountId === DEFAULT_ACCOUNT_ID) {
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
    } else if (channelConfig?.accounts?.[DEFAULT_ACCOUNT_ID]) {
      accountConfig = channelConfig.accounts[DEFAULT_ACCOUNT_ID];
      tokenSource = "config";
    } else if (process.env.DINGTALK_CLIENT_ID && process.env.DINGTALK_CLIENT_SECRET) {
      accountConfig = {
        enabled: true,
        clientId: process.env.DINGTALK_CLIENT_ID,
        clientSecret: process.env.DINGTALK_CLIENT_SECRET,
        webhookUrl: process.env.DINGTALK_WEBHOOK_URL,
      };
      tokenSource = "env";
    }
  } else {
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

export function resolveDefaultDingTalkAccountId(cfg: ClawdbotConfig): string {
  const accountIds = listDingTalkAccountIds(cfg);
  return accountIds.includes(DEFAULT_ACCOUNT_ID)
    ? DEFAULT_ACCOUNT_ID
    : accountIds[0] || DEFAULT_ACCOUNT_ID;
}

export function normalizeAccountId(accountId?: string): string {
  if (!accountId || accountId === "default" || accountId === "") {
    return DEFAULT_ACCOUNT_ID;
  }
  return accountId.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

export function setAccountEnabledInConfig(opts: {
  cfg: ClawdbotConfig;
  accountId: string;
  enabled: boolean;
}): ClawdbotConfig {
  const { cfg, accountId, enabled } = opts;
  const channelConfig = cfg.channels?.[CHANNEL_ID] || {};

  if (accountId === DEFAULT_ACCOUNT_ID && channelConfig.clientId) {
    // Top-level default account
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_ID]: {
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
      [CHANNEL_ID]: {
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

export function deleteAccountFromConfig(opts: {
  cfg: ClawdbotConfig;
  accountId: string;
}): ClawdbotConfig {
  const { cfg, accountId } = opts;
  const channelConfig = cfg.channels?.[CHANNEL_ID];

  if (!channelConfig) return cfg;

  if (accountId === DEFAULT_ACCOUNT_ID && channelConfig.clientId) {
    // Remove top-level credentials
    const { clientId, clientSecret, webhookUrl, name, ...rest } = channelConfig;
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_ID]: rest,
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
        [CHANNEL_ID]: {
          ...channelConfig,
          accounts: remainingAccounts,
        },
      },
    };
  }

  return cfg;
}

export function applyAccountNameToConfig(opts: {
  cfg: ClawdbotConfig;
  accountId: string;
  name?: string;
}): ClawdbotConfig {
  const { cfg, accountId, name } = opts;
  if (!name) return cfg;

  const channelConfig = cfg.channels?.[CHANNEL_ID] || {};

  if (accountId === DEFAULT_ACCOUNT_ID && channelConfig.clientId) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_ID]: {
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
      [CHANNEL_ID]: {
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
