export declare const CHANNEL_ID = "moltbot-dingtalk-stream";
export declare const DEFAULT_ACCOUNT_ID = "default";
export type VerboseLevel = "off" | "on" | "full";
export interface DingTalkAccountConfig {
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
    verboseLevel?: VerboseLevel;
}
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
    verboseLevel?: VerboseLevel;
    accounts?: Record<string, DingTalkAccountConfig>;
}
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
export declare const DingTalkConfigSchema: {
    type: "object";
    properties: {
        enabled: {
            type: "boolean";
        };
        clientId: {
            type: "string";
        };
        clientSecret: {
            type: "string";
        };
        webhookUrl: {
            type: "string";
        };
        name: {
            type: "string";
        };
        groupPolicy: {
            type: "string";
            enum: string[];
        };
        requireMention: {
            type: "boolean";
        };
        verboseLevel: {
            type: "string";
            enum: string[];
        };
        dm: {
            type: "object";
            properties: {
                policy: {
                    type: "string";
                    enum: string[];
                };
                allowFrom: {
                    type: "array";
                    items: {
                        type: "string";
                    };
                };
            };
        };
        accounts: {
            type: "object";
            additionalProperties: {
                type: "object";
                properties: {
                    enabled: {
                        type: "boolean";
                    };
                    clientId: {
                        type: "string";
                    };
                    clientSecret: {
                        type: "string";
                    };
                    webhookUrl: {
                        type: "string";
                    };
                    name: {
                        type: "string";
                    };
                    verboseLevel: {
                        type: "string";
                        enum: string[];
                    };
                };
                required: string[];
            };
        };
    };
};
export declare function listDingTalkAccountIds(cfg: ClawdbotConfig): string[];
export declare function resolveDingTalkAccount(opts: {
    cfg: ClawdbotConfig;
    accountId?: string;
}): ResolvedDingTalkAccount;
export declare function resolveDefaultDingTalkAccountId(cfg: ClawdbotConfig): string;
export declare function normalizeAccountId(accountId?: string): string;
export declare function setAccountEnabledInConfig(opts: {
    cfg: ClawdbotConfig;
    accountId: string;
    enabled: boolean;
}): ClawdbotConfig;
export declare function deleteAccountFromConfig(opts: {
    cfg: ClawdbotConfig;
    accountId: string;
}): ClawdbotConfig;
export declare function applyAccountNameToConfig(opts: {
    cfg: ClawdbotConfig;
    accountId: string;
    name?: string;
}): ClawdbotConfig;
//# sourceMappingURL=schema.d.ts.map