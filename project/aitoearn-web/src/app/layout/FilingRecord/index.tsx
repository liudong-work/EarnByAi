/**
 * FilingRecord - 中文环境底部备案号
 * 在主内容滚动区域末尾轻量展示 ICP 备案号
 */

'use client'

import { useNavigationLogic } from '@/app/layout/shared/hooks/useNavigationLogic'
import { isChineseLanguage } from '@/lib/i18n/languageConfig'
import { useParams } from 'next/navigation'

const ICP_RECORD_TEXT = '京ICP备2025149334号'
const HIDDEN_FILING_ROUTES = new Set(['draft-box', 'accounts', 'brand-promotion'])

export function FilingRecord() {
  const params = useParams<{ lng?: string }>()
  const { route } = useNavigationLogic()
  const lng = typeof params?.lng === 'string' ? params.lng : ''

  if (!isChineseLanguage(lng) || HIDDEN_FILING_ROUTES.has(route[0] ?? ''))
    return null

  return (
    <div className="relative z-10 mt-auto flex shrink-0 justify-center px-4 py-4 text-xs text-muted-foreground/60">
      <span>{ICP_RECORD_TEXT}</span>
    </div>
  )
}
