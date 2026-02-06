import { DWClient } from "dingtalk-stream";
import axios from "axios";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ============================================================================
// Types for OpenClaw core runtime
// ============================================================================

export interface OpenClawCoreRuntime {
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

// ============================================================================
// Message Content Types
// ============================================================================

export type MediaType = "image" | "audio" | "video" | "file";

export interface MessageContent {
  text: string;
  messageType: string;
  mediaDownloadCode?: string;  // DingTalk downloadCode for media
  mediaType?: MediaType;
  fileName?: string;           // For file messages
}

export interface MediaFile {
  path: string;
  mimeType: string;
  fileName?: string;
}

// ============================================================================
// DingTalk Runtime Types
// ============================================================================

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
      getAccessToken: (clientId: string, clientSecret: string) => Promise<string>;
      downloadMedia: (
        clientId: string,
        clientSecret: string,
        robotCode: string,
        downloadCode: string,
        workspacePath?: string
      ) => Promise<MediaFile | null>;
    };
  };
  logging: {
    shouldLogVerbose: () => boolean;
  };
}

// ============================================================================
// Storage
// ============================================================================

const activeClients = new Map<string, DWClient>();
const sessionWebhooks = new Map<string, string>();

// Access Token cache
interface TokenCache {
  accessToken: string;
  expiry: number;
}
const accessTokenCache = new Map<string, TokenCache>();

// ============================================================================
// Token Management
// ============================================================================

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cacheKey = clientId;
  const now = Date.now();
  const cached = accessTokenCache.get(cacheKey);

  // Return cached token if still valid (with 60s buffer)
  if (cached && cached.expiry > now + 60000) {
    return cached.accessToken;
  }

  try {
    const response = await axios.post<{ accessToken: string; expireIn: number }>(
      "https://api.dingtalk.com/v1.0/oauth2/accessToken",
      { appKey: clientId, appSecret: clientSecret },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    const { accessToken, expireIn } = response.data;
    
    // Cache the token
    accessTokenCache.set(cacheKey, {
      accessToken,
      expiry: now + expireIn * 1000,
    });

    return accessToken;
  } catch (error) {
    console.error("[DingTalk] Failed to get access token:", error);
    throw error;
  }
}

// ============================================================================
// Media Download
// ============================================================================

async function downloadMedia(
  clientId: string,
  clientSecret: string,
  robotCode: string,
  downloadCode: string,
  workspacePath?: string
): Promise<MediaFile | null> {
  if (!downloadCode) {
    console.error("[DingTalk] downloadMedia requires downloadCode");
    return null;
  }
  if (!robotCode) {
    console.error("[DingTalk] downloadMedia requires robotCode");
    return null;
  }

  try {
    const token = await getAccessToken(clientId, clientSecret);
    
    // Step 1: Get download URL from DingTalk
    const response = await axios.post(
      "https://api.dingtalk.com/v1.0/robot/messageFiles/download",
      { downloadCode, robotCode },
      { headers: { "x-acs-dingtalk-access-token": token } }
    );

    const payload = response.data as Record<string, unknown>;
    const downloadUrl = (payload?.downloadUrl ?? (payload?.data as Record<string, unknown>)?.downloadUrl) as string | undefined;
    
    if (!downloadUrl) {
      console.error("[DingTalk] downloadMedia: missing downloadUrl in response");
      return null;
    }

    // Step 2: Download the actual media file
    const mediaResponse = await axios.get(downloadUrl, { responseType: "arraybuffer" });
    const contentType = (mediaResponse.headers["content-type"] as string) || "application/octet-stream";
    const buffer = Buffer.from(mediaResponse.data as ArrayBuffer);

    // Step 3: Save to workspace or temp directory
    const mediaDir = workspacePath 
      ? path.join(workspacePath, "media", "inbound")
      : path.join(os.tmpdir(), "dingtalk-media");
    
    fs.mkdirSync(mediaDir, { recursive: true });

    const ext = contentType.split("/")[1]?.split(";")[0] || "bin";
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const mediaPath = path.join(mediaDir, filename);

    fs.writeFileSync(mediaPath, buffer);
    console.log(`[DingTalk] Media saved: ${mediaPath}`);

    return { path: mediaPath, mimeType: contentType };
  } catch (err) {
    console.error("[DingTalk] Failed to download media:", err);
    return null;
  }
}

// ============================================================================
// Markdown Detection
// ============================================================================

/**
 * Detect if text contains markdown formatting and extract title
 */
export function detectMarkdownAndExtractTitle(
  text: string,
  defaultTitle: string = "Message"
): { useMarkdown: boolean; title: string } {
  // Check for markdown patterns: headers, bold, italic, code, links, lists, etc.
  const hasMarkdown = /^[#*>-]|[*_`#[\]]/.test(text) || text.includes("\n");
  
  // Extract title from first line (removing markdown prefix)
  // split("\n") always returns at least one element, so [0] is safe
  const firstLine = text.split("\n")[0] ?? "";
  const title = hasMarkdown
    ? firstLine.replace(/^[#*\s\->]+/, "").slice(0, 30) || defaultTitle
    : defaultTitle;

  return { useMarkdown: hasMarkdown, title };
}

// ============================================================================
// Message Content Extraction
// ============================================================================

/**
 * Extract message content from DingTalk inbound message
 * Supports: text, picture, audio, video, file, richText
 */
export function extractMessageContent(data: Record<string, unknown>): MessageContent {
  const msgtype = (data.msgtype as string) || "text";
  const content = data.content as Record<string, unknown> | undefined;
  const textData = data.text as Record<string, string> | undefined;

  // Text message
  if (msgtype === "text") {
    return { 
      text: textData?.content?.trim() || "", 
      messageType: "text" 
    };
  }

  // Rich text message (may contain text + images)
  if (msgtype === "richText") {
    const richTextParts = (content?.richText as Array<Record<string, unknown>>) || [];
    let text = "";
    let pictureDownloadCode: string | undefined;
    
    for (const part of richTextParts) {
      // Handle text content
      if (part.text && (part.type === "text" || part.type === undefined)) {
        text += part.text as string;
      }
      // Handle @mentions
      if (part.type === "at" && part.atName) {
        text += `@${part.atName} `;
      }
      // Extract first picture's downloadCode
      if (part.type === "picture" && part.downloadCode && !pictureDownloadCode) {
        pictureDownloadCode = part.downloadCode as string;
      }
    }

    return {
      text: text.trim() || (pictureDownloadCode ? "[图片]" : "[富文本消息]"),
      mediaDownloadCode: pictureDownloadCode,
      mediaType: pictureDownloadCode ? "image" : undefined,
      messageType: "richText",
    };
  }

  // Picture message
  if (msgtype === "picture") {
    return {
      text: "[图片]",
      mediaDownloadCode: content?.downloadCode as string | undefined,
      mediaType: "image",
      messageType: "picture",
    };
  }

  // Audio message (with speech recognition)
  if (msgtype === "audio") {
    return {
      text: (content?.recognition as string) || "[语音消息]",
      mediaDownloadCode: content?.downloadCode as string | undefined,
      mediaType: "audio",
      messageType: "audio",
    };
  }

  // Video message
  if (msgtype === "video") {
    return {
      text: "[视频]",
      mediaDownloadCode: content?.downloadCode as string | undefined,
      mediaType: "video",
      messageType: "video",
    };
  }

  // File message
  if (msgtype === "file") {
    const fileName = (content?.fileName as string) || "文件";
    return {
      text: `[文件: ${fileName}]`,
      mediaDownloadCode: content?.downloadCode as string | undefined,
      mediaType: "file",
      fileName,
      messageType: "file",
    };
  }

  // Fallback for unknown types
  return { 
    text: textData?.content?.trim() || `[${msgtype}消息]`, 
    messageType: msgtype 
  };
}

// ============================================================================
// Runtime Implementation
// ============================================================================

const dingtalkRuntime: DingTalkRuntime = {
  channel: {
    dingtalk: {
      sendMessage: async (target, text, opts = {}) => {
        // Try multiple formats to find webhook
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
          console.error(`[DingTalk] No webhook for target: ${target}`);
          return { ok: false, error: `No webhook available for target: ${target}` };
        }

        try {
          // Detect markdown formatting
          const { useMarkdown, title } = detectMarkdownAndExtractTitle(text);
          const shouldUseMarkdown = opts.markdown || opts.mediaUrl || useMarkdown;

          const payload: Record<string, unknown> = shouldUseMarkdown
            ? {
                msgtype: "markdown",
                markdown: {
                  title,
                  text: opts.mediaUrl ? `${text}\n\n![image](${opts.mediaUrl})` : text,
                },
              }
            : {
                msgtype: "text",
                text: { content: text },
              };

          await axios.post(webhook, payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
          });
          return { ok: true };
        } catch (error) {
          console.error("[DingTalk] Send failed:", error);
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },

      probe: async (clientId, clientSecret, timeoutMs = 5000) => {
        try {
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
      getAccessToken,
      downloadMedia,
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
