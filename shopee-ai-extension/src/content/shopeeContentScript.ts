import type { ExtensionMessage, FillFieldResult, FillResponse, ImageFetchResponse, ProductDraft } from '../types/productDraft'

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLElement

const fieldKeywords = {
  productName: ['product name', 'global product name', '상품명', 'ชื่อสินค้า', 'nama produk'],
  category: ['category', '카테고리', 'หมวดหมู่', 'kategori'],
  productDescription: ['product description', 'description', '상세 설명', 'คำอธิบายสินค้า', 'deskripsi produk'],
  globalSkuPrice: ['global sku price', 'price', '판매가', '가격', 'harga'],
  weight: ['weight', '무게', 'น้ำหนัก', 'berat'],
  stock: ['stock', 'quantity', '재고', 'จำนวน', 'stok'],
  daysToShip: ['days to ship', 'days to shipment', 'ship', '배송', 'จัดส่ง'],
} satisfies Record<string, string[]>

function normalizeText(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
}

function scoreControl(control: FormControl, keywords: string[]): number {
  if (!isVisible(control)) return -1
  const input = control as HTMLInputElement
  const directText = [
    input.placeholder,
    input.getAttribute('aria-label'),
    input.getAttribute('name'),
    input.getAttribute('id'),
    input.getAttribute('data-placeholder'),
  ].map(normalizeText).join(' ')

  let score = 0
  for (const keyword of keywords.map(normalizeText)) {
    if (normalizeText(input.placeholder).includes(keyword)) score = Math.max(score, 100)
    if (normalizeText(input.getAttribute('aria-label')).includes(keyword)) score = Math.max(score, 95)
    if (directText.includes(keyword)) score = Math.max(score, 80)
  }

  const id = input.id
  if (id) {
    const explicitLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    const labelText = normalizeText(explicitLabel?.textContent)
    if (keywords.some((keyword) => labelText.includes(normalizeText(keyword)))) score = Math.max(score, 90)
  }

  const wrappingLabel = control.closest('label')
  const nearby = normalizeText(
    wrappingLabel?.textContent
    ?? control.parentElement?.parentElement?.textContent
    ?? control.parentElement?.textContent,
  )
  if (keywords.some((keyword) => nearby.includes(normalizeText(keyword)))) score = Math.max(score, 65)

  return score
}

function findControlNearLabel(keywords: string[], preferTextarea = false): FormControl | null {
  const normalizedKeywords = keywords.map(normalizeText)
  const textElements = Array.from(document.querySelectorAll<HTMLElement>('label, div, span, p'))
    .filter((element) => {
      const text = normalizeText(element.textContent)
      return text.length > 0 && text.length < 80 && normalizedKeywords.some((keyword) => text.includes(keyword))
    })

  for (const label of textElements) {
    let container: HTMLElement | null = label
    for (let depth = 0; depth < 5 && container; depth += 1, container = container.parentElement) {
      const controls = Array.from(container.querySelectorAll<FormControl>(
        'input:not([type="hidden"]):not([type="file"]), textarea, [contenteditable="true"]',
      )).filter(isVisible)
      const preferred = preferTextarea
        ? controls.find((control) => control instanceof HTMLTextAreaElement || control.getAttribute('contenteditable') === 'true')
        : controls[0]
      if (preferred) return preferred
    }
  }
  return null
}

function findControl(keywords: string[], preferTextarea = false, stableIds: string[] = []): FormControl | null {
  for (const stableId of stableIds) {
    const container = document.querySelector<HTMLElement>(`[data-product-edit-field-unique-id="${stableId}"]`)
    const control = container?.querySelector<FormControl>(
      'input:not([type="hidden"]):not([type="file"]), textarea, [contenteditable="true"]',
    )
    if (control && isVisible(control)) return control
  }
  const selector = 'input:not([type="hidden"]):not([type="file"]), textarea, [contenteditable="true"]'
  const controls = Array.from(document.querySelectorAll<FormControl>(selector))
  const ranked = controls
    .map((control) => ({
      control,
      score: scoreControl(control, keywords) + (preferTextarea && control instanceof HTMLTextAreaElement ? 12 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
  return ranked[0]?.control ?? findControlNearLabel(keywords, preferTextarea)
}

function setControlValue(control: FormControl, value: string) {
  control.scrollIntoView({ behavior: 'smooth', block: 'center' })
  control.focus()

  if (control instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(control, value)
    else control.value = value
  } else if (control instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    if (setter) setter.call(control, value)
    else control.value = value
  } else {
    control.textContent = value
  }

  control.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
  control.dispatchEvent(new Event('blur', { bubbles: true }))
}

function fillField(field: string, value: string, keywords: string[], preferTextarea = false, stableIds: string[] = []): FillFieldResult {
  const control = findControl(keywords, preferTextarea, stableIds)
  if (!control) return { field, success: false, message: '입력칸을 찾지 못함' }
  try {
    setControlValue(control, value)
    control.dataset.shopeeAiDraftFilled = 'true'
    return { field, success: true, message: '입력 완료' }
  } catch (error) {
    return { field, success: false, message: error instanceof Error ? error.message : '입력 실패' }
  }
}

function findCategoryTrigger() {
  const stableCategory = document.querySelector<HTMLElement>('[data-product-edit-field-unique-id="category"]')
  if (stableCategory && isVisible(stableCategory)) return stableCategory
  const categoryInput = findControl(fieldKeywords.category)
  if (categoryInput) return categoryInput
  return Array.from(document.querySelectorAll<HTMLElement>('div, button'))
    .find((element) => isVisible(element) && normalizeText(element.textContent).includes('please set category')) ?? null
}

function promptCategorySelection(draft: ProductDraft): FillFieldResult {
  const trigger = findCategoryTrigger()
  if (!trigger) return { field: 'Category', success: false, message: '카테고리 선택 영역을 찾지 못함' }
  trigger.scrollIntoView({ behavior: 'smooth', block: 'center' })
  trigger.dataset.shopeeAiDraftCategory = draft.categoryPath
  trigger.click()
  return {
    field: 'Category',
    success: false,
    message: draft.categoryPath && draft.categoryPath !== 'Uncategorized'
      ? `직접 선택 필요: ${draft.categoryPath}`
      : '카테고리를 직접 선택해 주세요',
  }
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], fileName, { type: blob.type || 'image/jpeg' })
}

async function fillProductImage(draft: ProductDraft): Promise<FillFieldResult> {
  const imageUrl = draft.imageUrls[0]
  if (!imageUrl) {
    return { field: 'Product Image', success: false, message: 'Draft에 imageUrl이 없음' }
  }

  const fileInput = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    .find((input) => input.closest('[data-product-edit-field-unique-id="images"]'))
    ?? Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
      .find((input) => !input.accept || input.accept.includes('image'))
  if (!fileInput) {
    return { field: 'Product Image', success: false, message: '이미지 업로드 입력칸을 찾지 못함' }
  }

  try {
    let dataUrl = imageUrl
    let fileName = 'shopee-product.jpg'
    if (!imageUrl.startsWith('data:')) {
      const response = await chrome.runtime.sendMessage<ExtensionMessage, ImageFetchResponse>({
        type: 'FETCH_DRAFT_IMAGE',
        url: imageUrl,
      })
      if (!response?.success || !response.dataUrl) throw new Error(response?.message || '이미지 다운로드 실패')
      dataUrl = response.dataUrl
      fileName = response.fileName || fileName
    }

    const file = await dataUrlToFile(dataUrl, fileName)
    const transfer = new DataTransfer()
    transfer.items.add(file)
    fileInput.files = transfer.files
    fileInput.dispatchEvent(new Event('input', { bubbles: true }))
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    return { field: 'Product Image', success: true, message: '이미지 업로드 완료' }
  } catch (error) {
    return { field: 'Product Image', success: false, message: error instanceof Error ? error.message : '이미지 업로드 실패' }
  }
}

function fillDynamicFields(draft: ProductDraft): FillFieldResult[] {
  return [
    fillField('Global SKU Price', draft.globalSkuPrice, fieldKeywords.globalSkuPrice, false, ['globalSkuPrice', 'global_sku_price', 'price']),
    fillField('Weight', String(draft.weight), fieldKeywords.weight, false, ['weight']),
    fillField('Stock', String(draft.stock || 1), fieldKeywords.stock, false, ['stock']),
    fillField('Days to ship', String(draft.daysToShip || 1), fieldKeywords.daysToShip, false, ['daysToShip', 'days_to_ship']),
  ]
}

function showPageStatus(message: string, complete = false) {
  const id = 'shopee-ai-draft-status'
  let status = document.getElementById(id)
  if (!status) {
    status = document.createElement('div')
    status.id = id
    Object.assign(status.style, {
      position: 'fixed',
      right: '24px',
      bottom: '24px',
      zIndex: '2147483647',
      maxWidth: '360px',
      padding: '13px 16px',
      borderRadius: '12px',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      fontSize: '12px',
      fontWeight: '600',
      lineHeight: '1.5',
      boxShadow: '0 10px 30px rgba(0,0,0,.2)',
    })
    document.body.appendChild(status)
  }
  status.style.background = complete ? '#39825f' : '#ee4d2d'
  status.textContent = message
  if (complete) window.setTimeout(() => status?.remove(), 7000)
}

function retryDynamicFields(draft: ProductDraft) {
  let attempts = 0
  const timer = window.setInterval(() => {
    attempts += 1
    const results = fillDynamicFields(draft)
    const successes = results.filter((result) => result.success).length
    if (successes === results.length) {
      window.clearInterval(timer)
      showPageStatus('카테고리 선택 후 생성된 가격, 무게, 재고, 배송일 입력을 완료했습니다.', true)
    } else if (attempts >= 80) {
      window.clearInterval(timer)
      showPageStatus('일부 필드를 찾지 못했습니다. 카테고리 선택 후 Extension의 입력 버튼을 다시 눌러 주세요.')
    } else {
      showPageStatus(`카테고리 선택을 기다리는 중입니다. 선택 후 나머지 필드를 자동 입력합니다. (${successes}/4)`)
    }
  }, 1500)
}

async function fillShopeeProduct(draft: ProductDraft): Promise<FillResponse> {
  const dynamicResults = fillDynamicFields(draft)
  const results = [
    await fillProductImage(draft),
    fillField('Product Name', draft.productName, fieldKeywords.productName, false, ['name']),
    fillField('Product Description', draft.productDescription, fieldKeywords.productDescription, true, ['description']),
    promptCategorySelection(draft),
    ...dynamicResults,
  ]
  if (dynamicResults.some((result) => !result.success)) retryDynamicFields(draft)
  const successCount = results.filter((result) => result.success).length
  return {
    success: successCount > 0,
    isShopeePage: true,
    results,
    message: successCount > 0
      ? `${successCount}/${results.length}개 필드를 입력했습니다.`
      : '입력 가능한 Shopee 필드를 찾지 못했습니다.',
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'PING_SHOPEE_PAGE') {
    sendResponse({ success: true, isShopeePage: true, results: [], message: 'Shopee page detected' } satisfies FillResponse)
    return
  }
  if (message.type === 'FILL_SHOPEE_PRODUCT') {
    void fillShopeeProduct(message.payload).then(sendResponse)
    return true
  }
})
