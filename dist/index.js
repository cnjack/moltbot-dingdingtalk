"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dingtalk_stream_1 = require("dingtalk-stream");
const axios_1 = __importDefault(require("axios"));
// Store plugin runtime
let pluginRuntime = null;
// Store session webhooks for reply
const sessionWebhooks = new Map();
// Store active clients for each account
const activeClients = new Map();
// Helper functions
function listDingTalkAccountIds(cfg) {
    const accounts = cfg.channels?.dingtalk?.accounts;
    return accounts ? Object.keys(accounts) : [];
}
function resolveDingTalkAccount(opts) {
    const { cfg, accountId = 'default' } = opts;
    const account = cfg.channels?.dingtalk?.accounts?.[accountId];
    return {
        accountId,
        name: account?.name,
        enabled: account?.enabled ?? false,
        configured: Boolean(account?.clientId && account?.clientSecret),
        config: account || { clientId: '', clientSecret: '' }
    };
}
// DingTalk Channel Plugin
const dingTalkChannelPlugin = {
    id: "dingtalk",
    meta: {
        id: "dingtalk",
        label: "钉钉",
        selectionLabel: "DingTalk Bot (Stream)",
        docsPath: "/channels/dingtalk",
        docsLabel: "dingtalk",
        blurb: "钉钉机器人通道插件 (Stream模式)",
        order: 100,
        aliases: ["dt", "ding"],
    },
    capabilities: {
        chatTypes: ["direct", "group"],
    },
    reload: { configPrefixes: ["channels.dingtalk"] },
    configSchema: {
        type: "object",
        properties: {
            channels: {
                type: "object",
                properties: {
                    dingtalk: {
                        type: "object",
                        properties: {
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
                                    },
                                    required: ["clientId", "clientSecret"],
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    config: {
        listAccountIds: (cfg) => listDingTalkAccountIds(cfg),
        resolveAccount: (cfg, accountId) => resolveDingTalkAccount({ cfg, accountId }),
        defaultAccountId: (_cfg) => 'default',
        isConfigured: (account) => account.configured,
        describeAccount: (account) => ({
            accountId: account.accountId,
            name: account.name,
            enabled: account.enabled,
            configured: account.configured,
        }),
    },
    gateway: {
        startAccount: async (ctx) => {
            const account = ctx.account;
            const config = account.config;
            const accountId = account.accountId;
            if (!config.clientId || !config.clientSecret) {
                ctx.log?.warn?.(`[${accountId}] missing clientId or clientSecret`);
                return;
            }
            ctx.log?.info?.(`[${accountId}] starting DingTalk Stream client`);
            try {
                const client = new dingtalk_stream_1.DWClient({
                    clientId: config.clientId,
                    clientSecret: config.clientSecret,
                });
                // Helper to safely handle messages
                const handleMessage = async (res) => {
                    try {
                        const message = JSON.parse(res.data);
                        const textContent = message.text?.content || "";
                        const senderId = message.senderId;
                        const convoId = message.conversationId;
                        const msgId = message.msgId;
                        // Store session webhook if provided (DingTalk Stream mode provides this for replies)
                        if (message.sessionWebhook) {
                            sessionWebhooks.set(convoId, message.sessionWebhook);
                        }
                        // Log reception
                        ctx.log?.info?.(`[${accountId}] received message from ${message.senderNick || senderId}: ${textContent}`);
                        // Filter out empty messages
                        if (!textContent)
                            return;
                        // Simple text cleaning (remove @bot mentions if possible, though DingTalk usually gives clean content or we might need to parse entities)
                        const cleanedText = textContent.replace(/@\w+\s*/g, '').trim();
                        // Forward the message to Clawdbot for processing
                        if (pluginRuntime?.runtime?.channel?.reply) {
                            const replyModule = pluginRuntime.runtime.channel.reply;
                            const chatType = String(message.conversationType) === '2' ? 'group' : 'direct';
                            const fromAddress = chatType === 'group' ? `dingtalk:group:${convoId}` : `dingtalk:${senderId}`;
                            const ctxPayload = {
                                Body: cleanedText,
                                RawBody: textContent,
                                CommandBody: cleanedText,
                                From: fromAddress,
                                To: 'bot',
                                SessionKey: `dingtalk:${convoId}`,
                                AccountId: accountId,
                                ChatType: chatType,
                                SenderName: message.senderNick,
                                SenderId: senderId,
                                Provider: 'dingtalk',
                                Surface: 'dingtalk',
                                MessageSid: message.msgId,
                                Timestamp: message.createAt,
                                // Required for some logic
                                GroupSubject: chatType === 'group' ? (message.conversationId) : undefined,
                            };
                            const finalizedCtx = replyModule.finalizeInboundContext(ctxPayload);
                            let replyBuffer = "";
                            let replySent = false;
                            const sendToDingTalk = async (text) => {
                                if (!text)
                                    return;
                                if (replySent) {
                                    ctx.log?.info?.(`[${accountId}] Reply already sent, skipping buffer flush.`);
                                    return;
                                }
                                const replyWebhook = sessionWebhooks.get(convoId) || config.webhookUrl;
                                if (!replyWebhook) {
                                    ctx.log?.error?.(`[${accountId}] No webhook to reply to ${convoId}`);
                                    return;
                                }
                                try {
                                    await axios_1.default.post(replyWebhook, {
                                        msgtype: "text",
                                        text: { content: text }
                                    }, { headers: { 'Content-Type': 'application/json' } });
                                    replySent = true;
                                    ctx.log?.info?.(`[${accountId}] Reply sent successfully.`);
                                }
                                catch (e) {
                                    ctx.log?.error?.(`[${accountId}] Failed to send reply: ${e}`);
                                }
                            };
                            const dispatcher = {
                                sendFinalReply: (payload) => {
                                    const text = payload.text || payload.content || '';
                                    sendToDingTalk(text).catch(e => ctx.log?.error?.(`[${accountId}] sendToDingTalk failed: ${e}`));
                                    return true;
                                },
                                typing: async () => { },
                                reaction: async () => { },
                                isSynchronous: () => false,
                                waitForIdle: async () => { },
                                sendBlockReply: async (block) => {
                                    // Accumulate text from blocks
                                    const text = block.text || block.delta || block.content || '';
                                    if (text) {
                                        replyBuffer += text;
                                    }
                                },
                                getQueuedCounts: () => ({ active: 0, queued: 0, final: 0 })
                            };
                            // Internal dispatch
                            const dispatchPromise = replyModule.dispatchReplyFromConfig({
                                ctx: finalizedCtx,
                                cfg: pluginRuntime.config,
                                dispatcher: dispatcher,
                                replyOptions: {}
                            });
                            // ACK immediately to prevent retries
                            if (res.headers && res.headers.messageId) {
                                client.socketCallBackResponse(res.headers.messageId, { status: "SUCCEED" });
                            }
                            // Wait for run to finish
                            await dispatchPromise;
                            // If final reply wasn't called but we have buffer (streaming case where agent didn't return final payload?)
                            if (!replySent && replyBuffer) {
                                ctx.log?.info?.(`[${accountId}] Sending accumulated buffer from blocks (len=${replyBuffer.length}).`);
                                await sendToDingTalk(replyBuffer);
                            }
                        }
                        else {
                            ctx.log?.error?.(`[${accountId}] runtime.channel.reply not available`);
                        }
                    }
                    catch (error) {
                        ctx.log?.error?.(`[${accountId}] error processing message: ${error instanceof Error ? error.message : String(error)}`);
                        console.error('DingTalk Handler Error:', error);
                    }
                };
                // Register callback for robot messages
                client.registerCallbackListener('/v1.0/im/bot/messages/get', handleMessage);
                // Connect to DingTalk Stream
                await client.connect();
                activeClients.set(accountId, client);
                ctx.log?.info?.(`[${accountId}] DingTalk Stream client connected`);
                // Handle abort signal for cleanup
                ctx.abortSignal?.addEventListener('abort', () => {
                    ctx.log?.info?.(`[${accountId}] stopping DingTalk Stream client`);
                    client.disconnect();
                    activeClients.delete(accountId);
                });
            }
            catch (error) {
                ctx.log?.error?.(`[${accountId}] failed to start: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        },
    },
    outbound: {
        deliveryMode: "direct",
        sendText: async (opts) => {
            const { text, account, target } = opts;
            const config = account.config;
            // Try session webhook first (for replies)
            const sessionWebhook = sessionWebhooks.get(target);
            if (sessionWebhook) {
                try {
                    await axios_1.default.post(sessionWebhook, {
                        msgtype: "text",
                        text: { content: text }
                    }, {
                        headers: { 'Content-Type': 'application/json' }
                    });
                    return { ok: true };
                }
                catch (error) {
                    // Fall through to webhookUrl
                }
            }
            // Fallback to webhookUrl for proactive messages
            if (config?.webhookUrl) {
                try {
                    await axios_1.default.post(config.webhookUrl, {
                        msgtype: "text",
                        text: { content: text }
                    }, {
                        headers: { 'Content-Type': 'application/json' }
                    });
                    return { ok: true };
                }
                catch (error) {
                    return { ok: false, error: error instanceof Error ? error.message : String(error) };
                }
            }
            return { ok: false, error: "No webhook available for sending messages" };
        }
    }
};
// Plugin object format required by Clawdbot
const plugin = {
    id: "dingtalk-channel",
    name: "DingTalk Channel",
    description: "DingTalk channel plugin using Stream mode",
    configSchema: {
        type: "object",
        properties: {}
    },
    register(api) {
        pluginRuntime = api;
        api.registerChannel({ plugin: dingTalkChannelPlugin });
    }
};
exports.default = plugin;
//# sourceMappingURL=index.js.map