export type Currency = 'USD' | 'KRW' | 'SGD' | 'MYR' | 'PHP' | 'THB' | 'VND' | 'IDR'
export type WeightUnit = 'g' | 'kg'

export type ProductDraft = {
  draftId: string
  status: string
  createdAt?: string
  usedAt?: string
  imageUrls: string[]
  qualityWarnings: string[]
  product: {
    productName: string
    category: string
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
  }
}

export type CreateDraftInput = {
  images: File[]
  price: string
  currency: Currency
  weight: string
  weightUnit: WeightUnit
}
