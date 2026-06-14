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

export function getLocalUpdates(): Record<string, any> {
  try {
    const stored = localStorage.getItem('shopee-draft-local-updates')
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

export function saveLocalUpdate(draftId: string, updates: Partial<ProductDraft>) {
  try {
    const current = getLocalUpdates()
    const existing = current[draftId] || {}
    current[draftId] = {
      ...existing,
      ...updates,
      product: {
        ...(existing.product ?? {}),
        ...(updates.product ?? {})
      } as Partial<ProductDraft['product']>
    }
    localStorage.setItem('shopee-draft-local-updates', JSON.stringify(current))
  } catch (e) {
    console.error('Failed to save local update:', e)
  }
}

function mergeLocalUpdates(draft: ProductDraft): ProductDraft {
  try {
    const localUpdates = getLocalUpdates()
    const updates = localUpdates[draft.draftId]
    if (updates) {
      return {
        ...draft,
        ...updates,
        imageUrls: updates.imageUrls ?? draft.imageUrls,
        product: {
          ...draft.product,
          ...(updates.product ?? {})
        } as ProductDraft['product']
      }
    }
  } catch (e) {
    console.error('Failed to merge local updates:', e)
  }
  return draft
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
  
  const isManual = dataSource.manualEdit === true || dataSource.isManual === true || dataSource.skipAi === true
  const qualityWarnings: string[] = []
  if (!isManual) {
    if (!imageUrls.length) qualityWarnings.push('서버에 상품 이미지가 저장되지 않았습니다.')
    if (!productName || /AI Generated Shopee Product Draft/i.test(productName)) qualityWarnings.push('실제 AI 상품명이 생성되지 않았습니다.')
    if (!category || /Uncategorized/i.test(category)) qualityWarnings.push('카테고리가 분석되지 않았습니다.')
    if (!productDescription || /placeholder/i.test(productDescription)) qualityWarnings.push('실제 AI 상품 설명이 생성되지 않았습니다.')
  }

  const draft = {
    draftId,
    status: String(raw.status ?? dataSource.status ?? 'READY_FOR_EXTENSION'),
    createdAt: raw.createdAt ? String(raw.createdAt) : raw.created_at ? String(raw.created_at) : dataSource.createdAt ? String(dataSource.createdAt) : dataSource.created_at ? String(dataSource.created_at) : undefined,
    usedAt: raw.usedAt ? String(raw.usedAt) : raw.used_at ? String(raw.used_at) : dataSource.usedAt ? String(dataSource.usedAt) : dataSource.used_at ? String(dataSource.used_at) : undefined,
    imageUrls,
    qualityWarnings,
    manualEdit: isManual,
    isManual: isManual,
    skipAi: isManual,
    product: {
      productName,
      category,
      brand: String(dataSource.brand ?? 'No brand'),
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
  return mergeLocalUpdates(draft)
}

export async function createDraft(input: CreateDraftInput): Promise<ProductDraft> {
  const formData = new FormData()
  
  // 모바일 기기(iOS/안드로이드)에서 여러 장 업로드 시 파일명이 모두 "image.jpg" 등으로 동일하여
  // n8n이나 멀티파트 파서가 덮어쓰기하는 문제를 방지하기 위해 고유 파일명 부여
  if (input.images.length > 0) {
    const coverImage = input.images[0]
    const coverExt = coverImage.name.split('.').pop() || 'jpg'
    const uniqueCoverName = `cover-${Date.now()}.${coverExt}`
    formData.append('image', new File([coverImage], uniqueCoverName, { type: coverImage.type }))
  }

  input.images.forEach((image, index) => {
    const ext = image.name.split('.').pop() || 'jpg'
    const uniqueName = `image-${Date.now()}-${index + 1}.${ext}`
    formData.append('images', new File([image], uniqueName, { type: image.type }))
  })

  formData.append('imageCount', String(input.images.length))
  formData.append('brand', input.brand || 'No brand')
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

  let list: ProductDraft[] = []
  if (Array.isArray(data)) {
    list = data.map(normalizeDraft)
  } else if (data && typeof data === 'object') {
    const container = data as Record<string, unknown>
    const rawList = Array.isArray(container.drafts)
      ? container.drafts
      : Array.isArray(container.items)
        ? container.items
        : Array.isArray(container.data)
          ? container.data
          : undefined

    if (Array.isArray(rawList)) {
      list = rawList.map(normalizeDraft)
    } else {
      list = [normalizeDraft(container)]
    }
  }

  // 로컬에서 삭제 처리된 Draft 필터링
  try {
    const deletedIds = JSON.parse(localStorage.getItem('shopee-draft-deleted-ids') ?? '[]') as string[]
    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      list = list.filter((item) => !deletedIds.includes(item.draftId))
    }
  } catch {
    // localStorage 관련 예외 무시
  }

  return list
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

export async function deleteDraft(draftId: string): Promise<void> {
  // 1. 로컬 저장소 블랙리스트에 우선 등록하여 즉시 리스트에서 보이지 않게 처리
  try {
    const deletedIds = JSON.parse(localStorage.getItem('shopee-draft-deleted-ids') ?? '[]') as string[]
    if (Array.isArray(deletedIds)) {
      if (!deletedIds.includes(draftId)) {
        deletedIds.push(draftId)
        localStorage.setItem('shopee-draft-deleted-ids', JSON.stringify(deletedIds))
      }
    }
  } catch {
    // localStorage 관련 예외 무시
  }

  // 2. n8n 백엔드 웹훅으로 삭제 시도 (백엔드에 엔드포인트가 미구현 상태여서 CORS/Failed to fetch가 나더라도 오류를 삼키고 정상 종료)
  try {
    const response = await fetch(`${BASE_URL}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId }),
    })
    await parseResponse(response)
  } catch (error) {
    console.warn('Backend delete endpoint not available or failed to fetch, fallback to local deletion:', error)
  }
}

export async function updateDraft(draftId: string, updates: Partial<ProductDraft>): Promise<ProductDraft> {
  // 1. 로컬 저장소 갱신
  saveLocalUpdate(draftId, updates)

  const localUpdates = getLocalUpdates()
  const currentMerged = localUpdates[draftId]

  // 2. 백엔드 웹훅 갱신 시도
  try {
    const response = await fetch(`${BASE_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftId,
        skipAi: true,
        isManual: true,
        manualEdit: true,
        ...currentMerged,
      }),
    })
    const data = unwrap(await parseResponse(response))
    if (data) return normalizeDraft(data)
  } catch (error) {
    console.warn('Backend update endpoint failed, using local update:', error)
  }

  // 백엔드 실패 시 로컬 데이터를 머지한 가상 객체 반환
  const mockRaw = { draftId, ...currentMerged }
  return normalizeDraft(mockRaw)
}

