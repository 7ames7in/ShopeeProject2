import type { ExtensionSettings, ProductDraft } from '../types/productDraft'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  n8nBaseUrl: 'https://n8n-6txh.srv1651644.hstgr.cloud/webhook/shopee/product-draft',
  apiKey: '',
}

function unwrap(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 1) return unwrap(value[0])
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.data) return unwrap(record.data)
    if (record.body) return unwrap(record.body)
  }
  return value
}

async function request(path: string, settings: ExtensionSettings, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers)
  if (settings.apiKey) headers.set('X-Shopee-Draft-Key', settings.apiKey)
  const response = await fetch(`${settings.n8nBaseUrl.replace(/\/$/, '')}/${path}`, { ...init, headers })
  const text = await response.text()
  if (!response.ok) throw new Error(`n8n 요청 실패 (${response.status})`)
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('n8n 응답 형식이 올바르지 않습니다.')
  }
}

export function normalizeDraft(value: unknown): ProductDraft {
  const raw = unwrap(value) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') throw new Error('Draft 정보를 찾을 수 없습니다.')
  const source = {
    ...(raw as Record<string, unknown>),
    ...((raw.draft ?? {}) as Record<string, unknown>),
    ...((raw.product ?? raw.productData ?? {}) as Record<string, unknown>),
    ...((raw.fields ?? {}) as Record<string, unknown>),
  }
  const draftId = String(raw.draftId ?? raw.draft_id ?? raw.id ?? source.draftId ?? source.draft_id ?? source.id ?? '')
  if (!draftId) throw new Error('Draft ID가 없습니다.')
  const imageValue = source.imageUrls ?? source.image_urls ?? source.images ?? source.imageUrl ?? source.image_url ?? source.storagePath ?? source.storage_path
  const imageUrls = Array.isArray(imageValue)
    ? imageValue.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : typeof imageValue === 'string' && imageValue.length > 0
      ? [imageValue]
      : []
  const productName = String(source.productName ?? source.product_name ?? '')
  const categoryPath = String(source.categoryPath ?? source.category_path ?? source.category ?? '')
  const productDescription = String(source.productDescription ?? source.product_description ?? '')
  const qualityWarnings: string[] = []
  if (!imageUrls.length) qualityWarnings.push('서버에 저장된 상품 이미지가 없습니다.')
  if (!productName || /AI Generated Shopee Product Draft/i.test(productName)) qualityWarnings.push('실제 AI 상품명이 생성되지 않았습니다.')
  if (!categoryPath || /Uncategorized/i.test(categoryPath)) qualityWarnings.push('카테고리가 분석되지 않았습니다.')
  if (!productDescription || /placeholder/i.test(productDescription)) qualityWarnings.push('실제 AI 상품 설명이 생성되지 않았습니다.')

  return {
    draftId,
    status: String(raw.status ?? source.status ?? 'READY_FOR_EXTENSION'),
    createdAt: String(raw.createdAt ?? raw.created_at ?? source.createdAt ?? source.created_at ?? ''),
    productName,
    categoryPath,
    brand: String(source.brand ?? 'No Brand'),
    productDescription,
    shortDescription: String(source.shortDescription ?? source.short_description ?? ''),
    globalSkuPrice: String(source.globalSkuPrice ?? source.global_sku_price ?? source.price ?? ''),
    currency: String(source.currency ?? 'USD'),
    weight: Number(source.weight ?? 0),
    weightUnit: String(source.weightUnit ?? source.weight_unit ?? 'g'),
    stock: Number(source.stock ?? 1),
    daysToShip: Number(source.daysToShip ?? source.days_to_ship ?? 1),
    condition: String(source.condition ?? 'New'),
    specifications: (source.specifications ?? source.specifications_json ?? {}) as Record<string, string>,
    imageUrls,
    qualityWarnings,
  }
}

export async function fetchDraftList(settings: ExtensionSettings): Promise<ProductDraft[]> {
  const response = await request('list', settings)
  if (response === null) return []
  if (Array.isArray(response)) return response.map(normalizeDraft)
  const unwrapped = unwrap(response)
  if (Array.isArray(unwrapped)) return unwrapped.map(normalizeDraft)
  const container = unwrapped as Record<string, unknown>
  const list = container.drafts ?? container.items
  if (Array.isArray(list)) return list.map(normalizeDraft)
  return [normalizeDraft(container)]
}

export async function fetchDraftDetail(draftId: string, settings: ExtensionSettings): Promise<ProductDraft> {
  return normalizeDraft(await request(`detail?draftId=${encodeURIComponent(draftId)}`, settings))
}

export async function markDraftUsed(draftId: string, settings: ExtensionSettings): Promise<void> {
  await request('mark-used', settings, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId, status: 'USED' }),
  })
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS)
  return {
    n8nBaseUrl: String(stored.n8nBaseUrl || DEFAULT_SETTINGS.n8nBaseUrl),
    apiKey: String(stored.apiKey || ''),
  }
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set(settings)
}
