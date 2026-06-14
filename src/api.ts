import type { CreateDraftInput, ProductDraft } from './types'

const BASE_URL = 'https://n8n-6txh.srv1651644.hstgr.cloud/webhook/shopee/product-draft'

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!response.ok) {
    const message = text.trim().startsWith('{')
      ? String((JSON.parse(text) as Record<string, unknown>).errorMessage ?? '')
      : ''
    throw new Error(message || `요청에 실패했습니다. (${response.status})`)
  }
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('서버 응답 형식이 올바르지 않습니다.')
  }
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

function normalizeDraft(value: unknown): ProductDraft {
  const raw = unwrap(value) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') throw new Error('Draft 정보를 찾을 수 없습니다.')

  const dataSource = {
    ...(raw as Record<string, unknown>),
    ...((raw.draft ?? {}) as Record<string, unknown>),
    ...((raw.product ?? raw.productData ?? {}) as Record<string, unknown>),
    ...((raw.fields ?? {}) as Record<string, unknown>),
  }
  const draftId = String(raw.draftId ?? raw.id ?? raw.draft_id ?? dataSource.draftId ?? dataSource.id ?? dataSource.draft_id ?? '')
  if (!draftId) throw new Error('서버 응답에 Draft ID가 없습니다.')
  const imageValue = dataSource.imageUrls ?? dataSource.image_urls ?? dataSource.images ?? dataSource.imageUrl ?? dataSource.image_url ?? dataSource.storagePath ?? dataSource.storage_path
  const imageUrls = Array.isArray(imageValue)
    ? imageValue.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : typeof imageValue === 'string' && imageValue.length > 0
      ? [imageValue]
      : []
  const productName = String(dataSource.productName ?? dataSource.product_name ?? '')
  const category = String(dataSource.categoryPath ?? dataSource.category_path ?? dataSource.category ?? '')
  const productDescription = String(dataSource.productDescription ?? dataSource.product_description ?? '')
  const qualityWarnings: string[] = []
  if (!imageUrls.length) qualityWarnings.push('서버에 상품 이미지가 저장되지 않았습니다.')
  if (!productName || /AI Generated Shopee Product Draft/i.test(productName)) qualityWarnings.push('실제 AI 상품명이 생성되지 않았습니다.')
  if (!category || /Uncategorized/i.test(category)) qualityWarnings.push('카테고리가 분석되지 않았습니다.')
  if (!productDescription || /placeholder/i.test(productDescription)) qualityWarnings.push('실제 AI 상품 설명이 생성되지 않았습니다.')

  return {
    draftId,
    status: String(raw.status ?? dataSource.status ?? 'READY_FOR_EXTENSION'),
    createdAt: raw.createdAt ? String(raw.createdAt) : raw.created_at ? String(raw.created_at) : dataSource.createdAt ? String(dataSource.createdAt) : dataSource.created_at ? String(dataSource.created_at) : undefined,
    usedAt: raw.usedAt ? String(raw.usedAt) : raw.used_at ? String(raw.used_at) : dataSource.usedAt ? String(dataSource.usedAt) : dataSource.used_at ? String(dataSource.used_at) : undefined,
    imageUrls,
    qualityWarnings,
    product: {
      productName,
      category,
      brand: String(dataSource.brand ?? 'No Brand'),
      productDescription,
      shortDescription: String(dataSource.shortDescription ?? dataSource.short_description ?? ''),
      globalSkuPrice: String(dataSource.globalSkuPrice ?? dataSource.global_sku_price ?? dataSource.price ?? ''),
      currency: String(dataSource.currency ?? 'USD'),
      weight: Number(dataSource.weight ?? 0),
      weightUnit: String(dataSource.weightUnit ?? dataSource.weight_unit ?? 'g'),
      stock: Number(dataSource.stock ?? 1),
      daysToShip: Number(dataSource.daysToShip ?? dataSource.days_to_ship ?? 1),
      condition: String(dataSource.condition ?? 'New'),
      specifications: (dataSource.specifications ?? {}) as Record<string, string>,
    },
  }
}

export async function createDraft(input: CreateDraftInput): Promise<ProductDraft> {
  const formData = new FormData()
  formData.append('image', input.images[0])
  input.images.forEach((image) => formData.append('images', image))
  formData.append('imageCount', String(input.images.length))
  formData.append('brand', input.brand || 'No Brand')
  formData.append('price', input.price)
  formData.append('currency', input.currency)
  formData.append('weight', input.weight)
  formData.append('weightUnit', input.weightUnit)

  const response = await fetch(`${BASE_URL}/create`, { method: 'POST', body: formData })
  const data = unwrap(await parseResponse(response)) as Record<string, unknown> | null
  if (data && data.success === false) throw new Error(String(data.errorMessage ?? 'AI 상품 정보 생성에 실패했습니다.'))
  return normalizeDraft(data)
}

export async function listDrafts(): Promise<ProductDraft[]> {
  const response = await fetch(`${BASE_URL}/list`)
  const data = unwrap(await parseResponse(response))
  if (data === null) return []

  if (Array.isArray(data)) {
    return data.map(normalizeDraft)
  }

  if (data && typeof data === 'object') {
    const container = data as Record<string, unknown>
    const rawList = Array.isArray(container.drafts)
      ? container.drafts
      : Array.isArray(container.items)
        ? container.items
        : Array.isArray(container.data)
          ? container.data
          : undefined

    if (Array.isArray(rawList)) {
      return rawList.map(normalizeDraft)
    }

    // If the API returns a single draft object instead of a list,
    // normalize that draft and return it as an array.
    return [normalizeDraft(container)]
  }

  return []
}

export async function getDraft(draftId: string): Promise<ProductDraft> {
  const response = await fetch(`${BASE_URL}/detail?draftId=${encodeURIComponent(draftId)}`)
  return normalizeDraft(await parseResponse(response))
}

export async function markDraftUsed(draftId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/mark-used`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId }),
  })
  await parseResponse(response)
}
