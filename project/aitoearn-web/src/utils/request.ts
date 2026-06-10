import type { RequestParams } from '@/utils/FetchService/types'
import { PlatType } from '@/app/config/platConfig'
import { directTrans } from '@/app/i18n/client'
import { CONTACT } from '@/constant'
import { notification } from '@/lib/notification'
import type { AccountGroupItem, SocialAccount } from '@/api/types/account.type'
import type { UserInfo } from '@/store/user'
import { UserType, useUserStore } from '@/store/user'
import FetchService from '@/utils/FetchService/FetchService'

interface ResponseType<T> {
  code: string | number
  data: T
  message: string
  url: string
}

type RequestParamsWithSilent = RequestParams & {
  silent?: boolean // 是否静默处理错误，不显示提示
  authToken?: string // 临时指定本次请求使用的 token
  skipAuthLogout?: boolean // 401/用户不存在时不触发全局登出
}

export type RequestOptions = Pick<RequestParamsWithSilent, 'authToken' | 'skipAuthLogout'>

type MockResponseData
  = | UserInfo
    | SocialAccount[]
    | AccountGroupItem[]
    | { count: number }
    | { list: any[], total: number }
    | { page: number, pageSize: number, totalPages: number, total: number, list: any[] }
    | number

const DEV_FAKE_SPACE_ID = 'dev-space-default'

function isDevFakeLoginEnabled() {
  return process.env.NEXT_PUBLIC_DEV_FAKE_LOGIN === 'true'
}

function shouldUseDevMock() {
  return isDevFakeLoginEnabled()
}

function createMockResponse<T extends MockResponseData>(url: string, data: T): ResponseType<T> {
  return {
    code: 0,
    data,
    message: 'ok',
    url,
  }
}

function getMockUserInfo(): UserInfo {
  return {
    createdAt: '2026-06-09T00:00:00.000Z',
    id: 'dev-user-1',
    name: 'Local Dev User',
    password: '',
    mail: 'local-dev@aitoearn.ai',
    salt: '',
    status: 1,
    updateTime: '2026-06-09T00:00:00.000Z',
    _id: 'dev-user-1',
    avatar: '',
    score: 9999,
    income: 0,
    popularizeCode: 'LOCALDEV',
    placeId: 'local-dev-place',
    userType: UserType.CREATOR,
  }
}

function getMockAccountList(): SocialAccount[] {
  const now = '2026-06-09T00:00:00.000Z'
  return [
    {
      id: 'dev-account-1',
      type: PlatType.Xhs,
      loginTime: now,
      uid: 'xhs_local_dev_001',
      account: 'local_rednote_demo',
      avatar: '',
      nickname: 'Rednote Demo',
      fansCount: 1200,
      readCount: 3800,
      likeCount: 420,
      collectCount: 96,
      forwardCount: 18,
      commentCount: 44,
      lastStatsTime: now,
      workCount: 12,
      income: 0,
      status: 0,
      createTime: now,
      updateTime: now,
      rank: 1,
      groupId: DEV_FAKE_SPACE_ID,
    },
    {
      id: 'dev-account-2',
      type: PlatType.YouTube,
      loginTime: now,
      uid: 'yt_local_dev_001',
      account: 'local_youtube_demo',
      avatar: '',
      nickname: 'YouTube Demo',
      fansCount: 890,
      readCount: 5400,
      likeCount: 260,
      collectCount: 0,
      forwardCount: 12,
      commentCount: 31,
      lastStatsTime: now,
      workCount: 8,
      income: 0,
      status: 0,
      createTime: now,
      updateTime: now,
      rank: 2,
      groupId: DEV_FAKE_SPACE_ID,
    },
  ]
}

function getMockAccountGroups(): AccountGroupItem[] {
  return [
    {
      id: DEV_FAKE_SPACE_ID,
      name: 'Default Space',
      rank: 1,
      isDefault: true,
      location: 'LOCAL',
    },
  ]
}

function getDevMockResponse<T>(url: string): ResponseType<T> | null {
  if (!shouldUseDevMock())
    return null

  if (url === 'user/mine')
    return createMockResponse(url, getMockUserInfo()) as ResponseType<T>

  if (url === 'account/list/all')
    return createMockResponse(url, getMockAccountList()) as ResponseType<T>

  if (url === 'accountGroup/getList')
    return createMockResponse(url, getMockAccountGroups()) as ResponseType<T>

  if (url === 'cfg/money/stamp')
    return createMockResponse(url, Date.now()) as ResponseType<T>

  if (url === 'notification/unread-count')
    return createMockResponse(url, { count: 0 }) as ResponseType<T>

  if (url.startsWith('material/group/list/'))
    return createMockResponse(url, { list: [], total: 0 }) as ResponseType<T>

  if (url === 'ai/assets')
    return createMockResponse(url, {
      page: 1,
      pageSize: 20,
      total: 0,
      list: [],
    }) as ResponseType<T>

  if (url === 'agent/tasks')
    return createMockResponse(url, {
      page: 1,
      pageSize: 20,
      totalPages: 0,
      total: 0,
      list: [],
    }) as ResponseType<T>

  if (url === 'plat/publish/posts')
    return createMockResponse(url, []) as ResponseType<T>

  return null
}

const fetchService = new FetchService({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || '/api'}/`,
  requestInterceptor(requestParams) {
    const { authToken } = requestParams as RequestParamsWithSilent
    const token = authToken ?? useUserStore.getState().token
    requestParams.headers = {
      ...(requestParams.headers || {}),
      Authorization: token ? `Bearer ${token}` : '',
    }

    // 添加语言头
    if (typeof window !== 'undefined') {
      const lng = useUserStore.getState().lang
      requestParams.headers = {
        ...requestParams.headers,
        'Accept-Language': lng,
      }
    }

    return requestParams
  },
  responseInterceptor(response) {
    return response
  },
})

function createApiErrorContent(message: string) {
  const contactLabel = directTrans('common', 'contact')
  const contactTip = directTrans('common', 'apiErrorContactTip')
  return `${message} ${contactTip} ${contactLabel} ${CONTACT}`
}

export async function request<T>(params: RequestParamsWithSilent) {
  try {
    const mockResponse = getDevMockResponse<T>(params.url)
    if (mockResponse)
      return mockResponse

    const res = await fetchService.request(params)
    const data: ResponseType<T> = await res.json()

    // 使用项目的静态翻译方法（只使用国际化字段，不再使用硬编码回退）
    const networkBusy = directTrans('common', 'networkBusy')

    // 未登录拦截
    if (data.code === 401 && (!useUserStore.getState().token || params.skipAuthLogout)) {
      return data
    }

    // 已登录、但是登录过期
    if (data.code === 401) {
      useUserStore.getState().logout()
      return data
    }

    // 用户未找到，登出
    if (data.code === 12000) {
      if (!params.skipAuthLogout) {
        useUserStore.getState().logout()
      }
      return data
    }

    if (data.code !== 0) {
      if (!params.silent && typeof window !== 'undefined') {
        notification.warning({
          content: createApiErrorContent(data.message || networkBusy),
          key: 'apiErrorMessage',
          duration: 3,
        })
      }
      return data
    }

    return data
  }
  catch (e) {
    if (
      (useUserStore.getState().token || params.url.includes('login/'))
      && !params.silent
      && typeof window !== 'undefined'
    ) {
      const errText = directTrans('common', 'networkError')
      notification.error({
        content: createApiErrorContent(errText),
        key: 'apiErrorMessage',
        duration: 3,
      })
    }
    return null
  }
}

export default {
  get<T>(url: string, data?: any, silent?: boolean, options?: RequestOptions) {
    return request<T>({
      ...options,
      url,
      params: data,
      method: 'GET',
      silent,
    })
  },
  post<T>(url: string, data?: any, silent?: boolean, options?: RequestOptions) {
    return request<T>({
      ...options,
      url,
      data,
      method: 'POST',
      silent,
    })
  },
  put<T>(url: string, data?: any, silent?: boolean, options?: RequestOptions) {
    return request<T>({
      ...options,
      url,
      data,
      method: 'PUT',
      silent,
    })
  },
  delete<T>(url: string, data?: any, silent?: boolean, options?: RequestOptions) {
    return request<T>({
      ...options,
      url,
      data,
      method: 'DELETE',
      silent,
    })
  },
  patch<T>(url: string, data?: any, silent?: boolean, options?: RequestOptions) {
    return request<T>({
      ...options,
      url,
      data,
      method: 'PATCH',
      silent,
    })
  },
}
