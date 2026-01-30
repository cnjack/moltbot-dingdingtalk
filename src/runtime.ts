import { DWClient } from "dingtalk-stream";
import axios from "axios";

// Types for Clawdbot core runtime (obtained from pluginRuntime)
export interface ClawdbotCoreRuntime {
  channel: {
    routing: {
      resolveAgentRoute: (opts: {
        cfg: unknown;
        channel: string;
        accountId: string;
        peer: { kind: "direct" | "group"; id: string };
      }) => { agentId: string; sessionKey: string; accountId: string };
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
        deliver: (payload: { text?: string; content?: string; mediaUrls?: string[] }) => Promise<void>;
        onError?: (err: unknown, info: { kind: string }) => void;
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
      }) => Promise<{ queuedFinal: boolean; counts: { final: number } }>;
      dispatchReplyWithBufferedBlockDispatcher: (opts: {
        ctx: unknown;
        cfg: unknown;
        dispatcherOptions: {
          deliver: (payload: { text?: string; content?: string }) => Promise<void>;
          onError?: (err: unknown, info: { kind: string }) => void;
        };
        replyOptions?: {
          verboseLevel?: "off" | "on" | "full";
          onToolResult?: (payload: { text?: string; mediaUrls?: string[] }) => Promise<void>;
        };
      }) => Promise<void>;
    };
    session: {
      resolveStorePath: (
        storeConfig: unknown,
        opts: { agentId: string }
      ) => string;
      readSessionUpdatedAt?: (opts: { storePath: string; sessionKey: string }) => number | null;
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
    getChildLogger: (opts: { module: string }) => {
      info: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string) => void;
      debug?: (msg: string) => void;
    };
  };
}

// Types
export interface DingTalkRuntime {
  channel: {
    dingtalk: {
      sendMessage: (
        target: string,
        text: string,
        opts?: { accountId?: string; mediaUrl?: string; markdown?: boolean }
      ) => Promise<{ ok: boolean; error?: string }>;
      probe: (
        clientId: string,
        clientSecret: string,
        timeoutMs?: number
      ) => Promise<{ ok: boolean; error?: string; bot?: { name?: string } }>;
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

// Storage
const activeClients = new Map<string, DWClient>();
const sessionWebhooks = new Map<string, string>();

// Runtime implementation
const dingtalkRuntime: DingTalkRuntime = {
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
          const payload: Record<string, unknown> = {
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

          await axios.post(webhook, payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
          });
          return { ok: true };
        } catch (error) {
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
          const response = await axios.post(
            "https://api.dingtalk.com/v1.0/oauth2/accessToken",
            { appKey: clientId, appSecret: clientSecret },
            {
              headers: { "Content-Type": "application/json" },
              timeout: timeoutMs,
            }
          );

          if (response.data?.accessToken) {
            return { ok: true, bot: { name: "DingTalk Bot" } };
          }
          return { ok: false, error: "Invalid credentials" };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },

      getClient: (accountId) => activeClients.get(accountId),
      setClient: (accountId, client) => activeClients.set(accountId, client),
      removeClient: (accountId) => activeClients.delete(accountId),
      setSessionWebhook: (conversationId, webhook) =>
        sessionWebhooks.set(conversationId, webhook),
      getSessionWebhook: (conversationId) => sessionWebhooks.get(conversationId),
    },
  },
  logging: {
    shouldLogVerbose: () => process.env.DEBUG === "true",
  },
};

let runtimeInstance: DingTalkRuntime | null = null;

export function getDingTalkRuntime(): DingTalkRuntime {
  if (!runtimeInstance) {
    runtimeInstance = dingtalkRuntime;
  }
  return runtimeInstance;
}

export function setDingTalkRuntime(runtime: DingTalkRuntime): void {
  runtimeInstance = runtime;
}
