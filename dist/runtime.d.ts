import { DWClient } from "dingtalk-stream";
export interface ClawdbotCoreRuntime {
    channel: {
        routing: {
            resolveAgentRoute: (opts: {
                cfg: unknown;
                channel: string;
                accountId: string;
                peer: {
                    kind: "direct" | "group";
                    id: string;
                };
            }) => {
                agentId: string;
                sessionKey: string;
                accountId: string;
            };
        };
        reply: {
            formatAgentEnvelope: (opts: {
                channel: string;
                from: string;
                timestamp?: number;
                previousTimestamp?: number | null;
                envelope: unknown;
                body: string;
            }) => string;
            resolveEnvelopeFormatOptions: (cfg: unknown) => unknown;
            resolveHumanDelayConfig: (cfg: unknown, agentId?: string) => unknown;
            finalizeInboundContext: (ctx: unknown) => unknown;
            createReplyDispatcherWithTyping: (opts: {
                responsePrefix?: string;
                responsePrefixContextProvider?: () => Promise<string>;
                humanDelay?: unknown;
                deliver: (payload: {
                    text?: string;
                    content?: string;
                    mediaUrls?: string[];
                }) => Promise<void>;
                onError?: (err: unknown, info: {
                    kind: string;
                }) => void;
                onReplyStart?: () => void;
                onIdle?: () => void;
            }) => {
                dispatcher: unknown;
                replyOptions: Record<string, unknown>;
                markDispatchIdle: () => void;
            };
            dispatchReplyFromConfig: (opts: {
                ctx: unknown;
                cfg: unknown;
                dispatcher: unknown;
                replyOptions?: Record<string, unknown>;
            }) => Promise<{
                queuedFinal: boolean;
                counts: {
                    final: number;
                };
            }>;
            dispatchReplyWithBufferedBlockDispatcher: (opts: {
                ctx: unknown;
                cfg: unknown;
                dispatcherOptions: {
                    deliver: (payload: {
                        text?: string;
                        content?: string;
                    }) => Promise<void>;
                    onError?: (err: unknown, info: {
                        kind: string;
                    }) => void;
                };
                replyOptions?: {
                    verboseLevel?: "off" | "on" | "full";
                    onToolResult?: (payload: {
                        text?: string;
                        mediaUrls?: string[];
                    }) => Promise<void>;
                };
            }) => Promise<void>;
        };
        session: {
            resolveStorePath: (storeConfig: unknown, opts: {
                agentId: string;
            }) => string;
            readSessionUpdatedAt?: (opts: {
                storePath: string;
                sessionKey: string;
            }) => number | null;
            recordInboundSession: (opts: {
                storePath: string;
                sessionKey: string;
                ctx: unknown;
                onRecordError: (err: unknown) => void;
            }) => Promise<void>;
        };
        text: {
            resolveMarkdownTableMode: (opts: {
                cfg: unknown;
                channel: string;
                accountId: string;
            }) => "off" | "plain" | "markdown" | "bullets" | "code";
            chunkMarkdownTextWithMode: (text: string, limit: number, mode: string) => string[];
            resolveChunkMode: (cfg: unknown, channel: string, accountId?: string) => string;
        };
    };
    logging: {
        shouldLogVerbose: () => boolean;
        getChildLogger: (opts: {
            module: string;
        }) => {
            info: (msg: string) => void;
            warn: (msg: string) => void;
            error: (msg: string) => void;
            debug?: (msg: string) => void;
        };
    };
}
export interface DingTalkRuntime {
    channel: {
        dingtalk: {
            sendMessage: (target: string, text: string, opts?: {
                accountId?: string;
                mediaUrl?: string;
                markdown?: boolean;
            }) => Promise<{
                ok: boolean;
                error?: string;
            }>;
            probe: (clientId: string, clientSecret: string, timeoutMs?: number) => Promise<{
                ok: boolean;
                error?: string;
                bot?: {
                    name?: string;
                };
            }>;
            getClient: (accountId: string) => DWClient | undefined;
            setClient: (accountId: string, client: DWClient) => void;
            removeClient: (accountId: string) => void;
            setSessionWebhook: (conversationId: string, webhook: string) => void;
            getSessionWebhook: (conversationId: string) => string | undefined;
        };
    };
    logging: {
        shouldLogVerbose: () => boolean;
    };
}
export declare function getDingTalkRuntime(): DingTalkRuntime;
export declare function setDingTalkRuntime(runtime: DingTalkRuntime): void;
//# sourceMappingURL=runtime.d.ts.map