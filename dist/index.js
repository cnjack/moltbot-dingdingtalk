"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dingtalkPlugin = void 0;
const dingtalk_stream_1 = require("dingtalk-stream");
const runtime_js_1 = require("./runtime.js");
const schema_js_1 = require("./schema.js");
// ============================================================================
// Channel Meta
// ============================================================================
const meta = {
    id: schema_js_1.CHANNEL_ID,
    label: "DingTalk",
    selectionLabel: "DingTalk Bot (Stream)",
    docsPath: "/channels/dingtalk",
    docsLabel: "dingtalk",
    blurb: "DingTalk bot channel plugin (Stream mode)",
    order: 100,
    aliases: ["dt", "ding", "dingtalk"],
};
// ============================================================================
// Store plugin runtime reference
// ============================================================================
let pluginRuntime = null;
// ============================================================================
// DingTalk Channel Plugin
// ============================================================================
exports.dingtalkPlugin = {
    id: schema_js_1.CHANNEL_ID,
    meta,
    capabilities: {
        chatTypes: ["direct", "group"],
        media: true,
        threads: false,
    },
    reload: { configPrefixes: [`channels.${schema_js_1.CHANNEL_ID}`] },
    configSchema: schema_js_1.DingTalkConfigSchema,
    // ============================================================================
    // Config Management
    // ============================================================================
    config: {
        listAccountIds: (cfg) => (0, schema_js_1.listDingTalkAccountIds)(cfg),
        resolveAccount: (cfg, accountId) => (0, schema_js_1.resolveDingTalkAccount)({ cfg, accountId }),
        defaultAccountId: (cfg) => (0, schema_js_1.resolveDefaultDingTalkAccountId)(cfg),
        setAccountEnabled: ({ cfg, accountId, enabled }) => (0, schema_js_1.setAccountEnabledInConfig)({ cfg, accountId, enabled }),
        deleteAccount: ({ cfg, accountId }) => (0, schema_js_1.deleteAccountFromConfig)({ cfg, accountId }),
        isConfigured: (account) => account.configured,
        describeAccount: (account) => ({
            accountId: account.accountId,
            name: account.name,
            enabled: account.enabled,
            configured: account.configured,
            tokenSource: account.tokenSource,
        }),
    },
    // ============================================================================
    // Security (DM Policy)
    // ============================================================================
    security: {
        resolveDmPolicy: ({ cfg, accountId, account }) => {
            const resolvedAccountId = accountId ?? account.accountId ?? schema_js_1.DEFAULT_ACCOUNT_ID;
            const channelConfig = cfg.channels?.[schema_js_1.CHANNEL_ID];
            const useAccountPath = Boolean(channelConfig?.accounts?.[resolvedAccountId]);
            const allowFromPath = useAccountPath
                ? `channels.${schema_js_1.CHANNEL_ID}.accounts.${resolvedAccountId}.dm.`
                : `channels.${schema_js_1.CHANNEL_ID}.dm.`;
            return {
                policy: account.config.dm?.policy ?? "open",
                allowFrom: account.config.dm?.allowFrom ?? [],
                allowFromPath,
                normalizeEntry: (raw) => raw.replace(/^dingtalk:/i, ""),
            };
        },
    },
    // ============================================================================
    // Mentions
    // ============================================================================
    mentions: {
        stripPatterns: () => ["@\\S+\\s*"],
    },
    // ============================================================================
    // Groups
    // ============================================================================
    groups: {
        resolveRequireMention: ({ cfg, accountId }) => {
            const account = (0, schema_js_1.resolveDingTalkAccount)({ cfg, accountId });
            return account.config.requireMention ?? true;
        },
    },
    // ============================================================================
    // Messaging
    // ============================================================================
    messaging: {
        normalizeTarget: (target) => {
            if (target.startsWith("dingtalk:"))
                return target;
            if (target.startsWith("group:"))
                return `dingtalk:${target}`;
            if (target.startsWith("user:"))
                return `dingtalk:${target}`;
            return `dingtalk:${target}`;
        },
        targetResolver: {
            looksLikeId: (id) => /^[a-zA-Z0-9_-]+$/.test(id),
            hint: "<conversationId|user:ID>",
        },
    },
    // ============================================================================
    // Setup (Account Configuration)
    // ============================================================================
    setup: {
        resolveAccountId: ({ accountId }) => (0, schema_js_1.normalizeAccountId)(accountId),
        applyAccountName: ({ cfg, accountId, name }) => (0, schema_js_1.applyAccountNameToConfig)({ cfg, accountId, name }),
        validateInput: ({ accountId, input }) => {
            if (input.useEnv && accountId !== schema_js_1.DEFAULT_ACCOUNT_ID) {
                return "Environment variables can only be used for the default account";
            }
            if (!input.useEnv && (!input.clientId || !input.clientSecret)) {
                return "DingTalk requires clientId and clientSecret";
            }
            return null;
        },
        applyAccountConfig: ({ cfg, accountId, input }) => {
            const namedConfig = (0, schema_js_1.applyAccountNameToConfig)({
                cfg,
                accountId,
                name: input.name,
            });
            if (accountId === schema_js_1.DEFAULT_ACCOUNT_ID) {
                return {
                    ...namedConfig,
                    channels: {
                        ...namedConfig.channels,
                        [schema_js_1.CHANNEL_ID]: {
                            ...namedConfig.channels?.[schema_js_1.CHANNEL_ID],
                            enabled: true,
                            ...(input.useEnv ? {} : { clientId: input.clientId, clientSecret: input.clientSecret }),
                        },
                    },
                };
            }
            return {
                ...namedConfig,
                channels: {
                    ...namedConfig.channels,
                    [schema_js_1.CHANNEL_ID]: {
                        ...namedConfig.channels?.[schema_js_1.CHANNEL_ID],
                        enabled: true,
                        accounts: {
                            ...namedConfig.channels?.[schema_js_1.CHANNEL_ID]?.accounts,
                            [accountId]: {
                                ...namedConfig.channels?.[schema_js_1.CHANNEL_ID]?.accounts?.[accountId],
                                enabled: true,
                                clientId: input.clientId,
                                clientSecret: input.clientSecret,
                            },
                        },
                    },
                },
            };
        },
    },
    // ============================================================================
    // Outbound (Send Messages)
    // ============================================================================
    outbound: {
        deliveryMode: "direct",
        textChunkLimit: 2000,
        sendText: async ({ to, text, accountId }) => {
            const result = await (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.sendMessage(to, text, {
                accountId,
            });
            return { channel: schema_js_1.CHANNEL_ID, ...result };
        },
        sendMedia: async ({ to, text, mediaUrl, accountId }) => {
            const result = await (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.sendMessage(to, text, {
                accountId,
                mediaUrl,
            });
            return { channel: schema_js_1.CHANNEL_ID, ...result };
        },
    },
    // ============================================================================
    // Status (Probe & Monitoring)
    // ============================================================================
    status: {
        defaultRuntime: {
            accountId: schema_js_1.DEFAULT_ACCOUNT_ID,
            running: false,
            lastStartAt: null,
            lastStopAt: null,
            lastError: null,
        },
        probeAccount: async ({ account, timeoutMs }) => {
            if (!account.clientId || !account.clientSecret) {
                return { ok: false, error: "Missing clientId or clientSecret" };
            }
            return (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.probe(account.clientId, account.clientSecret, timeoutMs);
        },
        buildAccountSnapshot: ({ account, runtime, probe }) => ({
            accountId: account.accountId,
            name: account.name,
            enabled: account.enabled,
            configured: account.configured,
            tokenSource: account.tokenSource,
            running: runtime?.running ?? false,
            lastStartAt: runtime?.lastStartAt ?? null,
            lastStopAt: runtime?.lastStopAt ?? null,
            lastError: runtime?.lastError ?? null,
            probe,
        }),
    },
    // ============================================================================
    // Gateway (Start/Stop Bot)
    // ============================================================================
    gateway: {
        startAccount: async (ctx) => {
            const { account, cfg, abortSignal, log, statusSink } = ctx;
            const accountId = account.accountId;
            const core = pluginRuntime?.runtime;
            if (!account.clientId || !account.clientSecret) {
                log?.warn?.(`[${accountId}] Missing clientId or clientSecret`);
                return;
            }
            if (!core?.channel?.reply) {
                log?.error?.(`[${accountId}] runtime.channel.reply not available`);
                return;
            }
            log?.info?.(`[${accountId}] Starting DingTalk Stream client`);
            // Probe 检测凭据
            try {
                const probe = await (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.probe(account.clientId, account.clientSecret, 2500);
                if (probe.ok) {
                    log?.info?.(`[${accountId}] Credentials verified successfully`);
                    ctx.setStatus?.({ accountId, probe });
                }
                else {
                    log?.warn?.(`[${accountId}] Credential verification failed: ${probe.error}`);
                }
            }
            catch (err) {
                log?.debug?.(`[${accountId}] Probe failed: ${String(err)}`);
            }
            const client = new dingtalk_stream_1.DWClient({
                clientId: account.clientId,
                clientSecret: account.clientSecret,
            });
            const handleMessage = async (res) => {
                try {
                    const message = JSON.parse(res.data);
                    const textContent = message.text?.content || "";
                    const senderId = message.senderId;
                    const convoId = message.conversationId;
                    log?.info?.(`[${accountId}] Received message from ${message.senderNick || senderId}: ${textContent}`);
                    statusSink?.({ lastInboundAt: Date.now() });
                    if (!textContent)
                        return;
                    const rawBody = textContent;
                    const cleanedText = textContent.replace(/@\S+\s*/g, "").trim();
                    const chatType = String(message.conversationType) === "2" ? "group" : "direct";
                    // Store session webhook with multiple keys for flexible lookup
                    if (message.sessionWebhook) {
                        (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.setSessionWebhook(convoId, message.sessionWebhook);
                        if (chatType === "direct" && senderId) {
                            (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.setSessionWebhook(senderId, message.sessionWebhook);
                            (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.setSessionWebhook(`dingtalk:user:${senderId}`, message.sessionWebhook);
                        }
                        if (chatType === "group" && convoId) {
                            (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.setSessionWebhook(`dingtalk:channel:${convoId}`, message.sessionWebhook);
                        }
                    }
                    const route = core.channel.routing?.resolveAgentRoute?.({
                        cfg,
                        channel: schema_js_1.CHANNEL_ID,
                        accountId,
                        peer: {
                            kind: chatType === "group" ? "group" : "direct",
                            id: chatType === "group" ? convoId : senderId,
                        },
                    }) ?? { agentId: "main", sessionKey: `dingtalk:${convoId}`, accountId };
                    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions?.(cfg) ?? {};
                    const body = core.channel.reply.formatAgentEnvelope?.({
                        channel: "DingTalk",
                        from: message.senderNick ?? message.senderId,
                        timestamp: message.createAt,
                        envelope: envelopeOptions,
                        body: cleanedText,
                    }) ?? cleanedText;
                    const ctxPayload = {
                        Body: body,
                        RawBody: rawBody,
                        CommandBody: cleanedText,
                        From: `dingtalk:user:${senderId}`,
                        To: chatType === "group" ? `dingtalk:channel:${convoId}` : `dingtalk:user:${senderId}`,
                        SessionKey: route.sessionKey,
                        AccountId: route.accountId,
                        ChatType: chatType,
                        ConversationLabel: chatType === "group" ? convoId : undefined,
                        SenderName: message.senderNick,
                        SenderId: senderId,
                        SenderUsername: message.senderNick,
                        Provider: "dingtalk",
                        Surface: "dingtalk",
                        MessageSid: message.msgId,
                        Timestamp: message.createAt,
                        GroupSubject: chatType === "group" ? convoId : undefined,
                        OriginatingChannel: schema_js_1.CHANNEL_ID,
                        OriginatingTo: chatType === "group" ? `dingtalk:channel:${convoId}` : `dingtalk:user:${senderId}`,
                    };
                    const finalizedCtx = core.channel.reply.finalizeInboundContext(ctxPayload);
                    const storePath = core.channel.session?.resolveStorePath?.(cfg.session, { agentId: route.agentId }) ?? "";
                    if (core.channel.session?.recordInboundSession) {
                        await core.channel.session.recordInboundSession({
                            storePath,
                            sessionKey: route.sessionKey,
                            ctx: finalizedCtx,
                            onRecordError: (err) => {
                                log?.error?.(`[${accountId}] Failed to record session: ${String(err)}`);
                            },
                        });
                    }
                    if (res.headers?.messageId) {
                        client.socketCallBackResponse(res.headers.messageId, { status: "SUCCEED" });
                    }
                    const DINGTALK_TEXT_LIMIT = 2000;
                    const deliverDingTalkReply = async (payload) => {
                        const text = payload.text || payload.content || "";
                        if (!text) {
                            log?.warn?.(`[${accountId}] Received empty payload`);
                            return;
                        }
                        log?.info?.(`[${accountId}] Sending reply: ${text.substring(0, 50)}...`);
                        const chunkMode = core.channel.text?.resolveChunkMode?.(cfg, schema_js_1.CHANNEL_ID, accountId) ?? "smart";
                        const chunks = core.channel.text?.chunkMarkdownTextWithMode?.(text, DINGTALK_TEXT_LIMIT, chunkMode) ?? [text];
                        for (const chunk of chunks.length > 0 ? chunks : [text]) {
                            if (!chunk)
                                continue;
                            const result = await (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.sendMessage(convoId, chunk, {
                                accountId,
                            });
                            if (result.ok) {
                                log?.info?.(`[${accountId}] Reply sent successfully`);
                                statusSink?.({ lastOutboundAt: Date.now() });
                            }
                            else {
                                log?.error?.(`[${accountId}] Failed to send reply: ${result.error}`);
                            }
                        }
                    };
                    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
                        ctx: finalizedCtx,
                        cfg,
                        dispatcherOptions: {
                            deliver: deliverDingTalkReply,
                            onError: (err, info) => {
                                log?.error?.(`[${accountId}] DingTalk ${info.kind} reply failed: ${String(err)}`);
                            },
                        },
                        replyOptions: {
                            verboseLevel: account.verboseLevel,
                            onToolResult: async (payload) => {
                                const text = payload.text || "";
                                if (!text)
                                    return;
                                // Format tool result for better readability in DingTalk
                                let formattedText = text;
                                // Check if this is a tool output (contains newlines after the tool name)
                                // Format: "🛠️ Exec: command\noutput..."
                                const toolOutputMatch = text.match(/^(🛠️\s*\w+:\s*[^\n]+)\n([\s\S]+)$/);
                                if (toolOutputMatch && toolOutputMatch[1] && toolOutputMatch[2]) {
                                    const toolHeader = toolOutputMatch[1];
                                    const toolOutput = toolOutputMatch[2];
                                    // Wrap the output in a code block for better formatting
                                    formattedText = `${toolHeader}\n\`\`\`\n${toolOutput.trim()}\n\`\`\``;
                                }
                                const result = await (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.sendMessage(convoId, formattedText, {
                                    accountId,
                                    markdown: true,
                                });
                                if (result.ok) {
                                    statusSink?.({ lastOutboundAt: Date.now() });
                                }
                                else {
                                    log?.error?.(`[${accountId}] Failed to send tool result: ${result.error}`);
                                }
                            },
                        },
                    });
                    log?.info?.(`[${accountId}] dispatchReplyWithBufferedBlockDispatcher completed`);
                }
                catch (error) {
                    log?.error?.(`[${accountId}] Error processing message: ${error instanceof Error ? error.message : String(error)}`);
                }
            };
            client.registerCallbackListener("/v1.0/im/bot/messages/get", handleMessage);
            await client.connect();
            (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.setClient(accountId, client);
            log?.info?.(`[${accountId}] DingTalk Stream client connected`);
            abortSignal?.addEventListener("abort", () => {
                log?.info?.(`[${accountId}] Stopping DingTalk Stream client`);
                client.disconnect();
                (0, runtime_js_1.getDingTalkRuntime)().channel.dingtalk.removeClient(accountId);
            });
        },
    },
};
// ============================================================================
// Plugin Export
// ============================================================================
const plugin = {
    id: schema_js_1.CHANNEL_ID,
    name: "DingTalk Channel",
    description: "DingTalk channel plugin (Stream mode)",
    register(api) {
        pluginRuntime = api;
        api.registerChannel({ plugin: exports.dingtalkPlugin });
    },
};
exports.default = plugin;
//# sourceMappingURL=index.js.map