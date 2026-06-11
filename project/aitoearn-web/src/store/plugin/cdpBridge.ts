import type {
  AIToEarnPluginAPI,
  PermissionCheckResult,
  PlatformRequestParams,
  PlatAccountInfo,
  ProgressCallback,
  PublishParams,
  PublishResult,
} from './types/baseTypes'

const DEFAULT_CDP_BRIDGE_URL = 'http://127.0.0.1:19083'
const CDP_BRIDGE_URL_STORAGE_KEY = 'aitoearn_cdp_bridge_url'

interface BridgeResponse<T = unknown> {
  code?: number
  success?: boolean
  message?: string
  error?: string
  data?: T
}

type BridgeRequestInit = Omit<RequestInit, 'body'> & {
  body?: unknown
  timeoutMs?: number
}

function getConfiguredBridgeUrl() {
  const envUrl = process.env.NEXT_PUBLIC_CDP_BRIDGE_URL

  if (typeof window !== 'undefined') {
    const storedUrl = window.localStorage.getItem(CDP_BRIDGE_URL_STORAGE_KEY)
    if (storedUrl?.trim())
      return storedUrl.trim().replace(/\/+$/, '')
  }

  return (envUrl || DEFAULT_CDP_BRIDGE_URL).replace(/\/+$/, '')
}

async function bridgeRequest<T>(
  path: string,
  init: BridgeRequestInit = {},
): Promise<T> {
  const baseUrl = getConfiguredBridgeUrl()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), init.timeoutMs ?? 8000)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })

    if (!response.ok) {
      throw new Error(`CDP Bridge HTTP ${response.status}`)
    }

    const payload = (await response.json()) as BridgeResponse<T>
    const ok = payload.code === 0 || payload.success === true
    if (!ok) {
      throw new Error(payload.message || payload.error || 'CDP Bridge request failed')
    }

    return payload.data as T
  }
  finally {
    window.clearTimeout(timeout)
  }
}

function progress(
  onProgress: ProgressCallback | undefined,
  stage: Parameters<ProgressCallback>[0]['stage'],
  progressValue: number,
  message: string,
  data?: unknown,
) {
  onProgress?.({
    stage,
    progress: progressValue,
    message,
    timestamp: Date.now(),
    data,
  })
}

function createCdpBridgePlugin(): AIToEarnPluginAPI {
  return {
    async checkPermission(): Promise<PermissionCheckResult> {
      return bridgeRequest<PermissionCheckResult>('/permission', { method: 'GET' })
    },

    async login(platform): Promise<PlatAccountInfo> {
      return bridgeRequest<PlatAccountInfo>('/login', {
        method: 'POST',
        body: { platform },
        timeoutMs: 15000,
      })
    },

    async publish(params: PublishParams, onProgress?: ProgressCallback): Promise<PublishResult> {
      progress(onProgress, 'download', 5, '正在连接本地 CDP Bridge...')
      progress(onProgress, 'upload', 35, '正在把内容交给本地浏览器...')

      const result = await bridgeRequest<PublishResult>('/publish', {
        method: 'POST',
        body: params,
        timeoutMs: 30000,
      })

      progress(onProgress, 'publish', 80, '已打开平台发布页，请在浏览器中确认')
      return result
    },

    async proxyRequest(params) {
      return bridgeRequest('/proxy-request', {
        method: 'POST',
        body: params,
        timeoutMs: 30000,
      })
    },

    async xhsRequest<T = any>(params: PlatformRequestParams): Promise<T> {
      return bridgeRequest<T>('/platform-request', {
        method: 'POST',
        body: { platform: 'xhs', ...params },
        timeoutMs: 30000,
      })
    },

    async douyinRequest<T = any>(params: PlatformRequestParams): Promise<T> {
      return bridgeRequest<T>('/platform-request', {
        method: 'POST',
        body: { platform: 'douyin', ...params },
        timeoutMs: 30000,
      })
    },

    async douyinInteraction(params) {
      return bridgeRequest('/douyin-interaction', {
        method: 'POST',
        body: params,
        timeoutMs: 30000,
      })
    },

    async douyinDirectMessage(params) {
      return bridgeRequest('/douyin-direct-message', {
        method: 'POST',
        body: params,
        timeoutMs: 30000,
      })
    },

    async getVersion() {
      return { version: '99.0.0-cdp' }
    },

    async unifiedInteraction(params) {
      return bridgeRequest('/unified-interaction', {
        method: 'POST',
        body: params,
        timeoutMs: 30000,
      })
    },

    async remoteAutomationRun(params) {
      return bridgeRequest('/remote-automation-run', {
        method: 'POST',
        body: params,
        timeoutMs: params.timeout ?? 30000,
      })
    },
  }
}

export function hasInjectedPluginApi() {
  return typeof window !== 'undefined' && !!window.AIToEarnPlugin
}

export async function ensurePluginApi(): Promise<AIToEarnPluginAPI | null> {
  if (typeof window === 'undefined') {
    return null
  }

  if (window.AIToEarnPlugin) {
    return window.AIToEarnPlugin
  }

  try {
    await bridgeRequest('/health', {
      method: 'GET',
      timeoutMs: 1200,
    })

    const bridgePlugin = createCdpBridgePlugin()
    window.AIToEarnPlugin = bridgePlugin
    return bridgePlugin
  }
  catch {
    return null
  }
}
