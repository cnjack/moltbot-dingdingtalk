import { type ClawdbotCoreRuntime } from "./runtime.js";
import { DingTalkConfigSchema, type ClawdbotConfig, type ResolvedDingTalkAccount } from "./schema.js";
interface ClawdbotPluginApi {
    config: ClawdbotConfig;
    logger: Console;
    runtime: ClawdbotCoreRuntime;
    registerChannel(opts: {
        plugin: ChannelPlugin;
    }): void;
    registerService?(service: unknown): void;
}
interface GatewayContext {
    account: ResolvedDingTalkAccount;
    cfg: ClawdbotConfig;
    runtime: ClawdbotCoreRuntime;
    abortSignal?: AbortSignal;
    log?: {
        info: (msg: string) => void;
        warn: (msg: string) => void;
        error: (msg: string) => void;
        debug?: (msg: string) => void;
    };
    setStatus?: (status: Record<string, unknown>) => void;
    statusSink?: (patch: {
        lastInboundAt?: number;
        lastOutboundAt?: number;
    }) => void;
}
interface ChannelPlugin {
    id: string;
    meta: {
        id: string;
        label: string;
        selectionLabel: string;
        docsPath: string;
        docsLabel: string;
        blurb: string;
        order: number;
        aliases: string[];
    };
    capabilities: {
        chatTypes: readonly string[];
        media?: boolean;
        threads?: boolean;
    };
    reload: {
        configPrefixes: string[];
    };
    configSchema: typeof DingTalkConfigSchema;
    config: {
        listAccountIds: (cfg: ClawdbotConfig) => string[];
        resolveAccount: (cfg: ClawdbotConfig, accountId?: string) => ResolvedDingTalkAccount;
        defaultAccountId: (cfg: ClawdbotConfig) => string;
        setAccountEnabled: (opts: {
            cfg: ClawdbotConfig;
            accountId: string;
            enabled: boolean;
        }) => ClawdbotConfig;
        deleteAccount: (opts: {
            cfg: ClawdbotConfig;
            accountId: string;
        }) => ClawdbotConfig;
        isConfigured: (account: ResolvedDingTalkAccount) => boolean;
        describeAccount: (account: ResolvedDingTalkAccount) => Record<string, unknown>;
    };
    security?: {
        resolveDmPolicy: (opts: {
            cfg: ClawdbotConfig;
            accountId?: string;
            account: ResolvedDingTalkAccount;
        }) => {
            policy: string;
            allowFrom: string[];
            allowFromPath: string;
            normalizeEntry: (raw: string) => string;
        };
    };
    mentions?: {
        stripPatterns: () => string[];
    };
    groups?: {
        resolveRequireMention: (opts: {
            cfg: ClawdbotConfig;
            accountId?: string;
        }) => boolean;
    };
    messaging?: {
        normalizeTarget: (target: string) => string;
        targetResolver?: {
            looksLikeId: (id: string) => boolean;
            hint: string;
        };
    };
    setup?: {
        resolveAccountId: (opts: {
            accountId?: string;
        }) => string;
        applyAccountName: (opts: {
            cfg: ClawdbotConfig;
            accountId: string;
            name?: string;
        }) => ClawdbotConfig;
        validateInput: (opts: {
            accountId: string;
            input: SetupInput;
        }) => string | null;
        applyAccountConfig: (opts: {
            cfg: ClawdbotConfig;
            accountId: string;
            input: SetupInput;
        }) => ClawdbotConfig;
    };
    outbound: {
        deliveryMode: "direct";
        textChunkLimit?: number;
        sendText: (opts: {
            to: string;
            text: string;
            accountId?: string;
            deps?: Record<string, unknown>;
            replyToId?: string;
        }) => Promise<{
            channel: string;
            ok: boolean;
            error?: string;
        }>;
        sendMedia?: (opts: {
            to: string;
            text: string;
            mediaUrl: string;
            accountId?: string;
        }) => Promise<{
            channel: string;
            ok: boolean;
            error?: string;
        }>;
    };
    status?: {
        defaultRuntime: {
            accountId: string;
            running: boolean;
            lastStartAt: null;
            lastStopAt: null;
            lastError: null;
        };
        probeAccount: (opts: {
            account: ResolvedDingTalkAccount;
            timeoutMs?: number;
        }) => Promise<{
            ok: boolean;
            error?: string;
            bot?: {
                name?: string;
            };
        }>;
        buildAccountSnapshot: (opts: {
            account: ResolvedDingTalkAccount;
            runtime?: Record<string, unknown>;
            probe?: Record<string, unknown>;
        }) => Record<string, unknown>;
    };
    gateway: {
        startAccount: (ctx: GatewayContext) => Promise<void>;
    };
}
interface SetupInput {
    name?: string;
    clientId?: string;
    clientSecret?: string;
    useEnv?: boolean;
}
export declare const dingtalkPlugin: ChannelPlugin;
declare const plugin: {
    id: string;
    name: string;
    description: string;
    register(api: ClawdbotPluginApi): void;
};
export default plugin;
//# sourceMappingURL=index.d.ts.map