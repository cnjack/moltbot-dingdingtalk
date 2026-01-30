"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDingTalkRuntime = getDingTalkRuntime;
exports.setDingTalkRuntime = setDingTalkRuntime;
const axios_1 = __importDefault(require("axios"));
// Storage
const activeClients = new Map();
const sessionWebhooks = new Map();
// Runtime implementation
const dingtalkRuntime = {
    channel: {
        dingtalk: {
            sendMessage: async (target, text, opts = {}) => {
                // Try multiple formats to find webhook
                // target can be: "dingtalk:user:xxx", "dingtalk:channel:xxx", or plain conversationId
                const normalizedTarget = target
                    .replace(/^dingtalk:(user|channel|group):/, "")
                    .replace(/^dingtalk:/, "");
                let webhook = sessionWebhooks.get(target)
                    || sessionWebhooks.get(normalizedTarget);
                // Fallback: iterate all keys for partial match
                if (!webhook) {
                    for (const [key, value] of sessionWebhooks.entries()) {
                        if (key.includes(normalizedTarget) || normalizedTarget.includes(key)) {
                            webhook = value;
                            break;
                        }
                    }
                }
                if (!webhook) {
                    console.error(`[DingTalk] No webhook for target: ${target}, normalized: ${normalizedTarget}, available keys: ${Array.from(sessionWebhooks.keys()).join(", ")}`);
                    return { ok: false, error: `No webhook available for target: ${target}` };
                }
                try {
                    const payload = {
                        msgtype: "text",
                        text: { content: text },
                    };
                    // Use markdown format for tool calls, media, or when explicitly requested
                    if (opts.markdown || opts.mediaUrl) {
                        payload.msgtype = "markdown";
                        const markdownText = opts.mediaUrl
                            ? `${text}\n\n![image](${opts.mediaUrl})`
                            : text;
                        payload.markdown = {
                            title: "Message",
                            text: markdownText,
                        };
                        delete payload.text;
                    }
                    await axios_1.default.post(webhook, payload, {
                        headers: { "Content-Type": "application/json" },
                        timeout: 10000,
                    });
                    return { ok: true };
                }
                catch (error) {
                    console.error(`[DingTalk] Send failed:`, error);
                    return {
                        ok: false,
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            },
            probe: async (clientId, clientSecret, timeoutMs = 5000) => {
                try {
                    // Verify credentials by fetching access_token from DingTalk API
                    const response = await axios_1.default.post("https://api.dingtalk.com/v1.0/oauth2/accessToken", { appKey: clientId, appSecret: clientSecret }, {
                        headers: { "Content-Type": "application/json" },
                        timeout: timeoutMs,
                    });
                    if (response.data?.accessToken) {
                        return { ok: true, bot: { name: "DingTalk Bot" } };
                    }
                    return { ok: false, error: "Invalid credentials" };
                }
                catch (error) {
                    return {
                        ok: false,
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            },
            getClient: (accountId) => activeClients.get(accountId),
            setClient: (accountId, client) => activeClients.set(accountId, client),
            removeClient: (accountId) => activeClients.delete(accountId),
            setSessionWebhook: (conversationId, webhook) => sessionWebhooks.set(conversationId, webhook),
            getSessionWebhook: (conversationId) => sessionWebhooks.get(conversationId),
        },
    },
    logging: {
        shouldLogVerbose: () => process.env.DEBUG === "true",
    },
};
let runtimeInstance = null;
function getDingTalkRuntime() {
    if (!runtimeInstance) {
        runtimeInstance = dingtalkRuntime;
    }
    return runtimeInstance;
}
function setDingTalkRuntime(runtime) {
    runtimeInstance = runtime;
}
//# sourceMappingURL=runtime.js.map