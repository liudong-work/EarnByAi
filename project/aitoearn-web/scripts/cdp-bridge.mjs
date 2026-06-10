#!/usr/bin/env node

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { tmpdir, homedir, platform as osPlatform } from 'node:os'
import { basename, extname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

const BRIDGE_PORT = Number(process.env.CDP_BRIDGE_PORT || 19083)
const CHROME_DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9222)
const CHROME_DEBUG_HOST = process.env.CHROME_DEBUG_HOST || '127.0.0.1'
const CHROME_USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || join(homedir(), '.aitoearn-cdp-chrome')
const DOWNLOAD_DIR = join(tmpdir(), 'aitoearn-cdp-bridge')

const PLATFORM_URLS = {
  douyin: {
    home: 'https://creator.douyin.com/creator-micro/home',
    publish: 'https://creator.douyin.com/creator-micro/content/upload?enter_from=dou_web',
  },
  xhs: {
    home: 'https://www.xiaohongshu.com/explore',
    creator: 'https://creator.xiaohongshu.com/',
    publish: 'https://creator.xiaohongshu.com/publish/publish',
  },
}

function log(...args) {
  console.log('[aitoearn-cdp-bridge]', ...args)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, access-control-request-private-network',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (chunks.length === 0)
    return {}

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function cdpFetch(path, init) {
  const response = await fetch(`http://${CHROME_DEBUG_HOST}:${CHROME_DEBUG_PORT}${path}`, init)
  if (!response.ok)
    throw new Error(`Chrome CDP HTTP ${response.status}`)

  return response.json()
}

function getChromeExecutable() {
  if (process.env.CHROME_PATH)
    return process.env.CHROME_PATH

  const currentPlatform = osPlatform()
  if (currentPlatform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  }

  if (currentPlatform === 'win32') {
    return 'chrome.exe'
  }

  return 'google-chrome'
}

async function ensureChrome() {
  try {
    await cdpFetch('/json/version')
    return
  }
  catch {
    // Start a dedicated Chrome profile so we do not disturb the user's normal browser session.
  }

  if (!existsSync(CHROME_USER_DATA_DIR)) {
    mkdirSync(CHROME_USER_DATA_DIR, { recursive: true })
  }

  const chromePath = getChromeExecutable()
  const args = [
    `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
    `--user-data-dir=${CHROME_USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    PLATFORM_URLS.douyin.publish,
  ]

  log('Chrome CDP 未启动，正在打开专用 Chrome：', chromePath)
  spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore',
  }).unref()

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await cdpFetch('/json/version')
      log('Chrome CDP 已连接')
      return
    }
    catch {
      await delay(500)
    }
  }

  throw new Error('无法连接 Chrome CDP，请确认 Chrome 能以 remote-debugging 模式启动')
}

async function getTargets() {
  await ensureChrome()
  return cdpFetch('/json/list')
}

async function createTarget(url) {
  await ensureChrome()
  const encodedUrl = encodeURIComponent(url)
  try {
    return await cdpFetch(`/json/new?${encodedUrl}`, { method: 'PUT' })
  }
  catch {
    return cdpFetch(`/json/new?${encodedUrl}`)
  }
}

async function getOrCreateTarget(url, matcher = url) {
  const targets = await getTargets()
  const matchedTarget = targets.find(target =>
    target.type === 'page'
    && target.webSocketDebuggerUrl
    && typeof target.url === 'string'
    && target.url.includes(matcher),
  )

  if (matchedTarget)
    return matchedTarget

  return createTarget(url)
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
  }

  async connect() {
    if (typeof WebSocket === 'undefined') {
      throw new Error('当前 Node.js 版本不支持全局 WebSocket，请升级 Node 或安装新版运行时')
    }

    this.ws = new WebSocket(this.wsUrl)
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (!message.id)
        return

      const pending = this.pending.get(message.id)
      if (!pending)
        return

      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message || 'CDP command failed'))
      }
      else {
        pending.resolve(message.result)
      }
    }

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve
      this.ws.onerror = () => reject(new Error('CDP WebSocket connection failed'))
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (!this.pending.has(id))
          return

        this.pending.delete(id)
        reject(new Error(`CDP command timeout: ${method}`))
      }, 30000)
    })
  }

  close() {
    this.ws?.close()
  }
}

async function withPage(url, matcher, callback) {
  const target = await getOrCreateTarget(url, matcher)
  const client = new CdpClient(target.webSocketDebuggerUrl)
  await client.connect()

  try {
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('DOM.enable')
    await client.send('Page.bringToFront')

    if (!target.url || !target.url.includes(matcher)) {
      await client.send('Page.navigate', { url })
      await delay(4000)
    }

    return await callback(client)
  }
  finally {
    client.close()
  }
}

async function evaluate(client, fn, args = []) {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || '页面脚本执行失败')
  }

  return result.result?.value
}

async function loginDouyin() {
  return withPage(PLATFORM_URLS.douyin.home, 'creator.douyin.com', async (client) => {
    const data = await evaluate(client, async () => {
      const response = await fetch('https://creator.douyin.com/web/api/media/user/info/', {
        credentials: 'include',
      })
      const json = await response.json()
      if (json.status_code !== 0) {
        throw new Error(json.status_msg || '抖音创作者中心未登录')
      }

      const user = json.user || {}
      return {
        type: 'douyin',
        loginCookie: 'cdp-bridge-local-session',
        uid: user.sec_uid || user.uid || user.unique_id || '',
        account: user.unique_id || user.uid || user.sec_uid || '',
        avatar: user.avatar_thumb?.url_list?.[0] || '',
        nickname: user.nickname || '',
        fansCount: user.follower_count || 0,
      }
    })

    if (!data.uid && !data.account)
      throw new Error('未读取到抖音账号信息，请先在打开的 Chrome 中登录抖音创作者中心')

    return data
  })
}

async function loginXhs() {
  let homeAccount = null
  let creatorAccount = null

  try {
    homeAccount = await withPage(PLATFORM_URLS.xhs.home, 'xiaohongshu.com', client =>
      evaluate(client, async () => {
        const response = await fetch('https://edith.xiaohongshu.com/api/sns/web/v2/user/me', {
          credentials: 'include',
        })
        const json = await response.json()
        const user = json.data || json.user || {}
        if (!user.user_id && !user.red_id && !user.nickname)
          throw new Error('小红书主页未登录')

        return {
          uid: user.user_id || user.red_id || user.userid || '',
          account: user.red_id || user.user_id || '',
          avatar: user.images || user.image || user.avatar || '',
          nickname: user.nickname || user.nick_name || '',
        }
      }),
    )
  }
  catch {
    homeAccount = null
  }

  try {
    creatorAccount = await withPage(PLATFORM_URLS.xhs.creator, 'creator.xiaohongshu.com', client =>
      evaluate(client, async () => {
        const response = await fetch('https://creator.xiaohongshu.com/api/galaxy/creator/home/personal_info', {
          credentials: 'include',
        })
        const json = await response.json()
        const user = json.data || {}
        if (!user.user_id && !user.nickname)
          throw new Error('小红书创作者中心未登录')

        return {
          uid: user.user_id || user.red_id || '',
          account: user.red_id || user.user_id || '',
          avatar: user.imageb || user.image || '',
          nickname: user.nickname || '',
          fansCount: user.fans_count || 0,
        }
      }),
    )
  }
  catch {
    creatorAccount = null
  }

  const account = creatorAccount || homeAccount
  if (!account) {
    throw new Error('未读取到小红书账号信息，请先在打开的 Chrome 中登录小红书主页和创作者中心')
  }

  return {
    type: 'xhs',
    loginCookie: 'cdp-bridge-local-session',
    uid: account.uid || account.account,
    account: account.account || account.uid,
    avatar: account.avatar || '',
    nickname: account.nickname || '',
    fansCount: account.fansCount || 0,
    xhsLoginStatus: {
      home: !!homeAccount,
      creator: !!creatorAccount,
    },
  }
}

async function downloadAsset(url, fallbackName) {
  if (!url || typeof url !== 'string' || !url.startsWith('http'))
    return null

  if (!existsSync(DOWNLOAD_DIR)) {
    mkdirSync(DOWNLOAD_DIR, { recursive: true })
  }

  const response = await fetch(url)
  if (!response.ok || !response.body)
    throw new Error(`素材下载失败：${response.status}`)

  const contentType = response.headers.get('content-type') || ''
  const urlName = basename(new URL(url).pathname)
  const extension = extname(urlName)
    || (contentType.includes('video') ? '.mp4' : '')
    || (contentType.includes('png') ? '.png' : '')
    || (contentType.includes('webp') ? '.webp' : '.jpg')
  const filename = `${Date.now()}-${fallbackName}${extension}`
  const filePath = join(DOWNLOAD_DIR, filename)

  await pipeline(response.body, createWriteStream(filePath))
  return filePath
}

async function attachFiles(client, files) {
  const validFiles = files.filter(Boolean)
  if (validFiles.length === 0)
    return false

  const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true })
  const { nodeIds } = await client.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'input[type="file"]',
  })

  if (!nodeIds?.length)
    return false

  await client.send('DOM.setFileInputFiles', {
    nodeId: nodeIds[0],
    files: validFiles,
  })

  return true
}

async function preparePublishPayload(params) {
  const files = []

  if (typeof params.video === 'string') {
    const video = await downloadAsset(params.video, 'video')
    if (video)
      files.push(video)
  }

  if (Array.isArray(params.images)) {
    for (let index = 0; index < params.images.length; index += 1) {
      const image = await downloadAsset(params.images[index], `image-${index + 1}`)
      if (image)
        files.push(image)
    }
  }

  return {
    files,
    text: [params.title, params.desc].filter(Boolean).join('\n\n'),
  }
}

async function openPublishPage(params) {
  const platform = params.platform
  const publishUrl = platform === 'douyin'
    ? PLATFORM_URLS.douyin.publish
    : PLATFORM_URLS.xhs.publish
  const matcher = platform === 'douyin'
    ? 'creator.douyin.com'
    : 'creator.xiaohongshu.com'
  const payload = await preparePublishPayload(params)

  return withPage(publishUrl, matcher, async (client) => {
    await client.send('Page.navigate', { url: publishUrl })
    await delay(5000)

    let filesAttached = false
    try {
      filesAttached = await attachFiles(client, payload.files)
    }
    catch (error) {
      log('自动挂载素材失败：', error.message)
    }

    const fillResult = await evaluate(client, async ({ title, desc, text }) => {
      const emit = (element) => {
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const setElementText = (element, value) => {
        if (!element || !value)
          return false

        element.focus()
        if ('value' in element) {
          element.value = value
          emit(element)
          return true
        }

        element.textContent = value
        emit(element)
        return true
      }

      const inputs = Array.from(document.querySelectorAll('input:not([type="file"]), textarea, [contenteditable="true"]'))
        .filter(element => !element.disabled && element.offsetParent !== null)

      const titleFilled = setElementText(inputs[0], title)
      const descFilled = setElementText(inputs[1] || inputs[0], desc || text)
      let copied = false

      try {
        await navigator.clipboard.writeText(text)
        copied = true
      }
      catch {
        copied = false
      }

      return {
        titleFilled,
        descFilled,
        copied,
        editableCount: inputs.length,
        url: location.href,
      }
    }, [{
      title: params.title || '',
      desc: params.desc || '',
      text: payload.text,
    }])

    return {
      success: true,
      workId: `cdp-manual-${Date.now()}`,
      shareLink: fillResult.url || publishUrl,
      publishTime: Date.now(),
      platformData: {
        mode: 'cdp-manual-handoff',
        filesAttached,
        files: payload.files,
        ...fillResult,
        message: '已打开平台发布页。若页面未自动填充，请从剪贴板粘贴标题和正文后手动确认发布。',
      },
    }
  })
}

async function platformRequest(params) {
  const platform = params.platform
  const url = platform === 'douyin' ? PLATFORM_URLS.douyin.home : PLATFORM_URLS.xhs.home
  const matcher = platform === 'douyin' ? 'creator.douyin.com' : 'xiaohongshu.com'

  return withPage(url, matcher, client =>
    evaluate(client, async (requestParams) => {
      const response = await fetch(requestParams.path, {
        method: requestParams.method || 'POST',
        credentials: 'include',
        headers: requestParams.headers || {},
        body: requestParams.data === undefined ? undefined : JSON.stringify(requestParams.data),
      })

      const text = await response.text()
      try {
        return JSON.parse(text)
      }
      catch {
        return text
      }
    }, [params]),
  )
}

async function remoteAutomationRun(params) {
  return withPage(params.url, new URL(params.url).host, async (client) => {
    const result = await evaluate(client, async (code) => {
      // eslint-disable-next-line no-new-func
      return new Function(`return (async () => { ${code} })()`)()
    }, [params.code || ''])

    return {
      success: true,
      result,
      executionTime: Date.now(),
    }
  })
}

async function handleRoute(req, res) {
  if (req.method === 'OPTIONS') {
    json(res, 200, { code: 0 })
    return
  }

  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${BRIDGE_PORT}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      await ensureChrome()
      json(res, 200, { code: 0, success: true, data: { status: 'ok' } })
      return
    }

    if (req.method === 'GET' && url.pathname === '/permission') {
      await ensureChrome()
      json(res, 200, { code: 0, success: true, data: { granted: true, permissions: ['cdp'] } })
      return
    }

    if (req.method === 'POST' && url.pathname === '/login') {
      const body = await readJsonBody(req)
      const account = body.platform === 'douyin'
        ? await loginDouyin()
        : body.platform === 'xhs'
          ? await loginXhs()
          : null

      if (!account)
        throw new Error(`CDP Bridge 暂不支持 ${body.platform}`)

      json(res, 200, { code: 0, success: true, data: account })
      return
    }

    if (req.method === 'POST' && url.pathname === '/publish') {
      const body = await readJsonBody(req)
      const result = await openPublishPage(body)
      json(res, 200, { code: 0, success: true, data: result })
      return
    }

    if (req.method === 'POST' && url.pathname === '/platform-request') {
      const body = await readJsonBody(req)
      const result = await platformRequest(body)
      json(res, 200, { code: 0, success: true, data: result })
      return
    }

    if (req.method === 'POST' && url.pathname === '/remote-automation-run') {
      const body = await readJsonBody(req)
      const result = await remoteAutomationRun(body)
      json(res, 200, { code: 0, success: true, data: result })
      return
    }

    json(res, 404, { code: 404, success: false, message: 'Not found' })
  }
  catch (error) {
    json(res, 500, {
      code: 500,
      success: false,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

const server = createServer(handleRoute)
server.listen(BRIDGE_PORT, '127.0.0.1', () => {
  log(`本地 CDP Bridge 已启动：http://127.0.0.1:${BRIDGE_PORT}`)
  log(`Chrome CDP 端口：http://${CHROME_DEBUG_HOST}:${CHROME_DEBUG_PORT}`)
  log('如果自动打开的是新 Chrome，请先在该窗口登录抖音/小红书账号。')
})
