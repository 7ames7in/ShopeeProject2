export type ProductDraft = {
  draftId: string
  status: string
  createdAt?: string
  productName: string
  categoryPath: string
  brand: string
  productDescription: string
  shortDescription: string
  globalSkuPrice: string
  currency: string
  weight: number
  weightUnit: string
  stock: number
  daysToShip: number
  condition: string
  specifications: Record<string, string>
  imageUrls: string[]
  qualityWarnings: string[]
}

export type ExtensionSettings = {
  n8nBaseUrl: string
  apiKey: string
}

export type FillFieldResult = {
  field: string
  success: boolean
  message: string
}

export type FillResponse = {
  success: boolean
  isShopeePage: boolean
  results: FillFieldResult[]
  message: string
}

export type ExtensionMessage =
  | { type: 'PING_SHOPEE_PAGE' }
  | { type: 'FILL_SHOPEE_PRODUCT'; payload: ProductDraft }
  | { type: 'FETCH_DRAFT_IMAGE'; url: string }

export type ImageFetchResponse = {
  success: boolean
  dataUrl?: string
  fileName?: string
  message?: string
}
