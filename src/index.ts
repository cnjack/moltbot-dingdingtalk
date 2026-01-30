import { DWClient } from "dingtalk-stream";
import { getDingTalkRuntime, type ClawdbotCoreRuntime } from "./runtime.js";
import {
  CHANNEL_ID,
  DEFAULT_ACCOUNT_ID,
  DingTalkConfigSchema,
  listDingTalkAccountIds,
  resolveDingTalkAccount,
  resolveDefaultDingTalkAccountId,
  normalizeAccountId,
  setAccountEnabledInConfig,
  deleteAccountFromConfig,
  applyAccountNameToConfig,
  type ClawdbotConfig,
  type ResolvedDingTalkAccount,
} from "./schema.js";

// ============================================================================
// Plugin API Types
// ============================================================================

interface ClawdbotPluginApi {
  config: ClawdbotConfig;
  logger: Console;
  runtime: ClawdbotCoreRuntime;
  registerChannel(opts: { plugin: ChannelPlugin }): void;
  registerService?(service: unknown): void;
}

interface InboundContext {
  Body: string;
  RawBody: string;
  CommandBody: string;
  From: string;
  To: string;
  SessionKey: string;
  AccountId: string;
  ChatType: "direct" | "group";
  SenderName?: string;
  SenderId: string;
  SenderUsername?: string;
  Provider: string;
  Surface: string;
  MessageSid: string;
  Timestamp: number;
  GroupSubject?: string;
  ConversationLabel?: string;
  OriginatingChannel?: string;
  OriginatingTo?: string;
}

interface Dispatcher {
  sendFinalReply: (payload: { text?: string; content?: string }) => boolean;
  typing: () => Promise<void>;
  reaction: () => Promise<void>;
  isSynchronous: () => boolean;
  waitForIdle: () => Promise<void>;
  sendBlockReply: (block: { text?: string; delta?: string; content?: string }) => Promise<void>;
  getQueuedCounts: () => { active: number; queued: number; final: number };
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
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
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
  reload: { configPrefixes: string[] };
  configSchema: typeof DingTalkConfigSchema;
  config: {
    listAccountIds: (cfg: ClawdbotConfig) => string[];
    resolveAccount: (cfg: ClawdbotConfig, accountId?: string) => ResolvedDingTalkAccount;
    defaultAccountId: (cfg: ClawdbotConfig) => string;
    setAccountEnabled: (opts: { cfg: ClawdbotConfig; accountId: string; enabled: boolean }) => ClawdbotConfig;
    deleteAccount: (opts: { cfg: ClawdbotConfig; accountId: string }) => ClawdbotConfig;
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
    resolveRequireMention: (opts: { cfg: ClawdbotConfig; accountId?: string }) => boolean;
  };
  messaging?: {
    normalizeTarget: (target: string) => string;
    targetResolver?: {
      looksLikeId: (id: string) => boolean;
      hint: string;
    };
  };
  setup?: {
    resolveAccountId: (opts: { accountId?: string }) => string;
    applyAccountName: (opts: { cfg: ClawdbotConfig; accountId: string; name?: string }) => ClawdbotConfig;
    validateInput: (opts: { accountId: string; input: SetupInput }) => string | null;
    applyAccountConfig: (opts: { cfg: ClawdbotConfig; accountId: string; input: SetupInput }) => ClawdbotConfig;
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
    }) => Promise<{ channel: string; ok: boolean; error?: string }>;
    sendMedia?: (opts: {
      to: string;
      text: string;
      mediaUrl: string;
      accountId?: string;
    }) => Promise<{ channel: string; ok: boolean; error?: string }>;
  };
  status?: {
    defaultRuntime: {
      accountId: string;
      running: boolean;
      lastStartAt: null;
      lastStopAt: null;
      lastError: null;
    };
    probeAccount: (opts: { account: ResolvedDingTalkAccount; timeoutMs?: number }) => Promise<{
      ok: boolean;
      error?: string;
      bot?: { name?: string };
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

// ============================================================================
// Channel Meta
// ============================================================================

const meta = {
  id: CHANNEL_ID,
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

let pluginRuntime: ClawdbotPluginApi | null = null;

// ============================================================================
// DingTalk Channel Plugin
// ============================================================================

export const dingtalkPlugin: ChannelPlugin = {
  id: CHANNEL_ID,
  meta,

  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    threads: false,
  },

  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },

  configSchema: DingTalkConfigSchema,

  // ============================================================================
  // Config Management
  // ============================================================================
  config: {
    listAccountIds: (cfg) => listDingTalkAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveDingTalkAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultDingTalkAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfig({ cfg, accountId, enabled }),
    deleteAccount: ({ cfg, accountId }) => deleteAccountFromConfig({ cfg, accountId }),
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
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const channelConfig = cfg.channels?.[CHANNEL_ID];
      const useAccountPath = Boolean(channelConfig?.accounts?.[resolvedAccountId]);
      const allowFromPath = useAccountPath
        ? `channels.${CHANNEL_ID}.accounts.${resolvedAccountId}.dm.`
        : `channels.${CHANNEL_ID}.dm.`;

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
      const account = resolveDingTalkAccount({ cfg, accountId });
      return account.config.requireMention ?? true;
    },
  },

  // ============================================================================
  // Messaging
  // ============================================================================
  messaging: {
    normalizeTarget: (target) => {
      if (target.startsWith("dingtalk:")) return target;
      if (target.startsWith("group:")) return `dingtalk:${target}`;
      if (target.startsWith("user:")) return `dingtalk:${target}`;
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
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),

    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToConfig({ cfg, accountId, name }),

    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "Environment variables can only be used for the default account";
      }
      if (!input.useEnv && (!input.clientId || !input.clientSecret)) {
        return "DingTalk requires clientId and clientSecret";
      }
      return null;
    },

    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToConfig({
        cfg,
        accountId,
        name: input.name,
      });

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            [CHANNEL_ID]: {
              ...namedConfig.channels?.[CHANNEL_ID],
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
          [CHANNEL_ID]: {
            ...namedConfig.channels?.[CHANNEL_ID],
            enabled: true,
            accounts: {
              ...namedConfig.channels?.[CHANNEL_ID]?.accounts,
              [accountId]: {
                ...namedConfig.channels?.[CHANNEL_ID]?.accounts?.[accountId],
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
      const result = await getDingTalkRuntime().channel.dingtalk.sendMessage(to, text, {
        accountId,
      });
      return { channel: CHANNEL_ID, ...result };
    },

    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      const result = await getDingTalkRuntime().channel.dingtalk.sendMessage(to, text, {
        accountId,
        mediaUrl,
      });
      return { channel: CHANNEL_ID, ...result };
    },
  },

  // ============================================================================
  // Status (Probe & Monitoring)
  // ============================================================================
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    probeAccount: async ({ account, timeoutMs }) => {
      if (!account.clientId || !account.clientSecret) {
        return { ok: false, error: "Missing clientId or clientSecret" };
      }
      return getDingTalkRuntime().channel.dingtalk.probe(
        account.clientId,
        account.clientSecret,
        timeoutMs
      );
    },

    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      tokenSource: account.tokenSource,
      running: (runtime as Record<string, unknown>)?.running ?? false,
      lastStartAt: (runtime as Record<string, unknown>)?.lastStartAt ?? null,
      lastStopAt: (runtime as Record<string, unknown>)?.lastStopAt ?? null,
      lastError: (runtime as Record<string, unknown>)?.lastError ?? null,
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
        const probe = await getDingTalkRuntime().channel.dingtalk.probe(
          account.clientId,
          account.clientSecret,
          2500
        );
        if (probe.ok) {
          log?.info?.(`[${accountId}] Credentials verified successfully`);
          ctx.setStatus?.({ accountId, probe });
        } else {
          log?.warn?.(`[${accountId}] Credential verification failed: ${probe.error}`);
        }
      } catch (err) {
        log?.debug?.(`[${accountId}] Probe failed: ${String(err)}`);
      }

      const client = new DWClient({
        clientId: account.clientId,
        clientSecret: account.clientSecret,
      });

      const handleMessage = async (res: { data: string; headers?: { messageId?: string } }) => {
        try {
          const message = JSON.parse(res.data);
          const textContent = message.text?.content || "";
          const senderId = message.senderId;
          const convoId = message.conversationId;

          log?.info?.(`[${accountId}] Received message from ${message.senderNick || senderId}: ${textContent}`);

          statusSink?.({ lastInboundAt: Date.now() });

          if (!textContent) return;

          const rawBody = textContent;
          const cleanedText = textContent.replace(/@\S+\s*/g, "").trim();

          const chatType = String(message.conversationType) === "2" ? "group" : "direct";

          // Store session webhook with multiple keys for flexible lookup
          if (message.sessionWebhook) {
            getDingTalkRuntime().channel.dingtalk.setSessionWebhook(convoId, message.sessionWebhook);
            if (chatType === "direct" && senderId) {
              getDingTalkRuntime().channel.dingtalk.setSessionWebhook(senderId, message.sessionWebhook);
              getDingTalkRuntime().channel.dingtalk.setSessionWebhook(`dingtalk:user:${senderId}`, message.sessionWebhook);
            }
            if (chatType === "group" && convoId) {
              getDingTalkRuntime().channel.dingtalk.setSessionWebhook(`dingtalk:channel:${convoId}`, message.sessionWebhook);
            }
          }

          const route = core.channel.routing?.resolveAgentRoute?.({
            cfg,
            channel: CHANNEL_ID,
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

          const ctxPayload: InboundContext = {
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
            OriginatingChannel: CHANNEL_ID,
            OriginatingTo: chatType === "group" ? `dingtalk:channel:${convoId}` : `dingtalk:user:${senderId}`,
          };

          const finalizedCtx = core.channel.reply.finalizeInboundContext(ctxPayload);

          const storePath = core.channel.session?.resolveStorePath?.(
            (cfg as Record<string, unknown>).session,
            { agentId: route.agentId }
          ) ?? "";
          
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

          const deliverDingTalkReply = async (payload: { text?: string; content?: string; mediaUrls?: string[] }) => {
            const text = payload.text || payload.content || "";
            if (!text) {
              log?.warn?.(`[${accountId}] Received empty payload`);
              return;
            }

            log?.info?.(`[${accountId}] Sending reply: ${text.substring(0, 50)}...`);
            
            const chunkMode = core.channel.text?.resolveChunkMode?.(cfg, CHANNEL_ID, accountId) ?? "smart";
            const chunks = core.channel.text?.chunkMarkdownTextWithMode?.(text, DINGTALK_TEXT_LIMIT, chunkMode) ?? [text];
            
            for (const chunk of chunks.length > 0 ? chunks : [text]) {
              if (!chunk) continue;
              const result = await getDingTalkRuntime().channel.dingtalk.sendMessage(convoId, chunk, {
                accountId,
              });

              if (result.ok) {
                log?.info?.(`[${accountId}] Reply sent successfully`);
                statusSink?.({ lastOutboundAt: Date.now() });
              } else {
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
              onToolResult: async (payload: { text?: string; mediaUrls?: string[] }) => {
                const text = payload.text || "";
                if (!text) return;
                
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
                
                const result = await getDingTalkRuntime().channel.dingtalk.sendMessage(convoId, formattedText, {
                  accountId,
                  markdown: true,
                });

                if (result.ok) {
                  statusSink?.({ lastOutboundAt: Date.now() });
                } else {
                  log?.error?.(`[${accountId}] Failed to send tool result: ${result.error}`);
                }
              },
            },
          });

          log?.info?.(`[${accountId}] dispatchReplyWithBufferedBlockDispatcher completed`);
        } catch (error) {
          log?.error?.(
            `[${accountId}] Error processing message: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      };

      client.registerCallbackListener("/v1.0/im/bot/messages/get", handleMessage);

      await client.connect();
      getDingTalkRuntime().channel.dingtalk.setClient(accountId, client);
      log?.info?.(`[${accountId}] DingTalk Stream client connected`);

      abortSignal?.addEventListener("abort", () => {
        log?.info?.(`[${accountId}] Stopping DingTalk Stream client`);
        client.disconnect();
        getDingTalkRuntime().channel.dingtalk.removeClient(accountId);
      });
    },
  },
};

// ============================================================================
// Plugin Export
// ============================================================================

const plugin = {
  id: CHANNEL_ID,
  name: "DingTalk Channel",
  description: "DingTalk channel plugin (Stream mode)",

  register(api: ClawdbotPluginApi) {
    pluginRuntime = api;
    api.registerChannel({ plugin: dingtalkPlugin });
  },
};

export default plugin;
