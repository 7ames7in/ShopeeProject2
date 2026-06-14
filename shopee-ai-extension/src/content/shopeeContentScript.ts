import type { ExtensionMessage, FillFieldResult, FillResponse, ImageFetchResponse, ProductDraft } from '../types/productDraft'

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLElement

const fieldKeywords = {
  productName: ['product name', 'global product name', '상품명', 'ชื่อสินค้า', 'nama produk'],
  category: ['category', '카테고리', 'หมวดหมู่', 'kategori'],
  brand: ['brand', '브랜드', 'ยี่ห้อ', 'merek'],
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

function dispatchEnter(control: FormControl) {
  const eventInit: KeyboardEventInit = {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  }
  control.dispatchEvent(new KeyboardEvent('keydown', eventInit))
  control.dispatchEvent(new KeyboardEvent('keypress', eventInit))
  control.dispatchEvent(new KeyboardEvent('keyup', eventInit))
}

function setControlValue(control: FormControl, value: string, commitWithEnter = false) {
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
  if (commitWithEnter) dispatchEnter(control)
  control.blur()
}

function fillField(field: string, value: string, keywords: string[], preferTextarea = false, stableIds: string[] = [], commitWithEnter = false): FillFieldResult {
  const control = findControl(keywords, preferTextarea, stableIds)
  if (!control) return { field, success: false, message: '입력칸을 찾지 못함' }
  try {
    setControlValue(control, value, commitWithEnter)
    control.dataset.shopeeAiDraftFilled = 'true'
    return { field, success: true, message: commitWithEnter ? '입력 후 Enter 완료' : '입력 완료' }
  } catch (error) {
    return { field, success: false, message: error instanceof Error ? error.message : '입력 실패' }
  }
}

function findSelectionTrigger(keywords: string[]): HTMLElement | null {
  // 1. User's specific Edit Row / Element Plus selector logic for Shopee Seller Center
  const editLabels = Array.from(document.querySelectorAll<HTMLElement>('.edit-label'))
  const matchingLabel = editLabels.find((el) => {
    const text = el.textContent ?? ''
    return keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()))
  })
  
  if (matchingLabel) {
    const editRow = matchingLabel.closest('.edit-row')
    if (editRow) {
      const clickableElement = editRow.querySelector<HTMLElement>(
        '.el-select, .el-cascader, .el-input__inner, [role="combobox"], .select-trigger, .eds-selector, .eds-selector__inner'
      )
      if (clickableElement && isVisible(clickableElement)) {
        return clickableElement
      }
    }
  }

  // 2. Fallback to existing label-parent traversal logic
  const normalizedKeywords = keywords.map(normalizeText)
  const labels = Array.from(document.querySelectorAll<HTMLElement>('label, div, span'))
    .filter((element) => {
      const text = normalizeText(element.textContent)
      return text.length > 0 && text.length < 40 && normalizedKeywords.some((keyword) => text === keyword || text === `* ${keyword}`)
    })

  for (const label of labels) {
    let container: HTMLElement | null = label.parentElement
    for (let depth = 0; depth < 4 && container; depth += 1, container = container.parentElement) {
      const explicit = Array.from(container.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]), button, [role="combobox"], [aria-haspopup="listbox"], [class*="select"], .eds-selector, .eds-selector__inner',
      )).filter((element) => element !== label && isVisible(element))
      const placeholder = explicit.find((element) => {
        const text = normalizeText((element as HTMLInputElement).placeholder ?? element.textContent)
        return text.includes('please select') || text.includes('no brand')
      })
      if (placeholder) return placeholder
      if (explicit.length === 1) return explicit[0]
    }
  }
  return null
}

function findVisibleOption(value: string): HTMLElement | null {
  const target = normalizeText(value)
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[role="option"], li, [class*="option"], [class*="menu-item"], [class*="select-item"]',
  )).find((element) => isVisible(element) && normalizeText(element.textContent) === target) ?? null
}

async function selectBrand(brand: string): Promise<FillFieldResult> {
  const value = brand.trim() || 'No Brand'
  const trigger = findSelectionTrigger(fieldKeywords.brand)
  if (!trigger) return { field: 'Brand', success: false, message: 'Brand 선택 영역을 찾지 못함' }

  try {
    trigger.scrollIntoView({ behavior: 'smooth', block: 'center' })
    trigger.click()
    
    // 드롭다운 패널 열릴 때까지 500ms 대기
    await new Promise((resolve) => window.setTimeout(resolve, 500))
    
    // 드롭다운 내부에 있는 검색 인풋 찾기 (Product Name 등 페이지 내 타 입력창과 섞이지 않도록 드롭다운 내부로 한정)
    const searchInput = Array.from(document.querySelectorAll<HTMLInputElement>(
      '.el-select-dropdown input, .el-popper input, [role="listbox"] input, [class*="dropdown"] input, [class*="popper"] input'
    )).find((el) => isVisible(el))
      
    if (searchInput) {
      // 검색창 포커싱 및 텍스트 타이핑
      searchInput.focus()
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(searchInput, value)
      else searchInput.value = value
      
      searchInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
      searchInput.dispatchEvent(new Event('change', { bubbles: true }))
      
      // 검색 필터링 렌더링을 위해 800ms 대기
      await new Promise((resolve) => window.setTimeout(resolve, 800))
    }
    
    const option = findVisibleOption(value)
    if (!option) {
      document.body.click() // 드롭다운 닫기
      return { field: 'Brand', success: false, message: `검색 후 ${value} 옵션을 찾지 못함` }
    }
    option.click()
    return { field: 'Brand', success: true, message: `${value} 선택 완료` }
  } catch (error) {
    return { field: 'Brand', success: false, message: error instanceof Error ? error.message : 'Brand 선택 실패' }
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

function findRecommendedCategories(): { text: string; element: HTMLElement }[] {
  const headers = Array.from(document.querySelectorAll<HTMLElement>('div, span, p, label'))
    .filter((el) => {
      const text = el.textContent?.trim().toLowerCase() ?? ''
      return text.includes('recommended categories') || text.includes('추천 카테고리')
    })

  if (headers.length === 0) return []

  const options: { text: string; element: HTMLElement }[] = []

  for (const header of headers) {
    let container: HTMLElement | null = header.parentElement
    for (let i = 0; i < 3 && container; i++) {
      const textNodes = Array.from(container.querySelectorAll<HTMLElement>('div, span, label, p'))
        .filter((el) => {
          const text = el.textContent?.trim() ?? ''
          return text.includes('>') && text.length > 5 && text.length < 150 && el.children.length === 0
        })

      if (textNodes.length > 0) {
        textNodes.forEach((node) => {
          const clickable = node.closest('div[role="radiogroup"] > div, label, li, [class*="option"], [class*="item"], [class*="radio"]') as HTMLElement ?? node
          options.push({
            text: node.textContent?.trim() ?? '',
            element: clickable
          })
        })
        break
      }
      container = container.parentElement
    }
  }

  const seen = new Set<string>()
  return options.filter((opt) => {
    const key = opt.text
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function selectRecommendedCategory(draft: ProductDraft): Promise<FillFieldResult> {
  const targetCategory = draft.categoryPath?.trim()

  // 최대 4.5초 대기 (500ms 간격으로 9번 확인)
  let attempts = 0
  while (attempts < 9) {
    await new Promise((resolve) => window.setTimeout(resolve, 500))
    attempts++

    const options = findRecommendedCategories()
    if (options.length > 0) {
      const normalizePath = (p: string) => p.toLowerCase().replace(/\s+/g, '')
      const normalizedTarget = normalizePath(targetCategory || '')

      // 1. AI 예측 카테고리와 정확히 일치하거나 하위 카테고리명이 일치하는 추천 카테고리 검색
      const matchedOption = options.find(
        (opt) => normalizePath(opt.text) === normalizedTarget
      ) ?? options.find(
        (opt) => opt.text.toLowerCase().includes(targetCategory?.toLowerCase() || 'nevermatch')
      )

      if (matchedOption) {
        matchedOption.element.click()
        return {
          field: 'Category',
          success: true,
          message: `추천 카테고리 매칭 선택: ${matchedOption.text}`
        }
      }

      // 2. 일치 항목이 없으면 첫 번째 추천 카테고리(Shopee의 탑 추천) 자동 선택
      const firstOption = options[0]
      firstOption.element.click()
      return {
        field: 'Category',
        success: true,
        message: `추천 카테고리 첫 번째 자동 선택: ${firstOption.text}`
      }
    }
  }

  // 추천 리스트가 끝내 올라오지 않는 경우, 기존 매뉴얼 팝업 트리거
  return promptCategorySelection(draft)
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
    fillField('Global SKU Price', draft.globalSkuPrice, fieldKeywords.globalSkuPrice, false, ['globalSkuPrice', 'global_sku_price', 'price'], true),
    fillField('Weight', String(draft.weight), fieldKeywords.weight, false, ['weight']),
    fillField('Stock', String(draft.stock || 1), fieldKeywords.stock, false, ['stock']),
    fillField('Days to ship', String(draft.daysToShip || 1), fieldKeywords.daysToShip, false, ['daysToShip', 'days_to_ship']),
  ]
}

function retryBrand(draft: ProductDraft) {
  let attempts = 0
  let selecting = false
  const timer = window.setInterval(async () => {
    if (selecting) return
    attempts += 1
    selecting = true
    const result = await selectBrand(draft.brand || 'No Brand')
    selecting = false
    if (result.success) {
      window.clearInterval(timer)
      showPageStatus(`${draft.brand || 'No Brand'} Brand 자동 선택을 완료했습니다.`, true)
    } else if (attempts >= 40) {
      window.clearInterval(timer)
      showPageStatus(`Brand에서 ${draft.brand || 'No Brand'}를 직접 선택해 주세요.`)
    }
  }, 1500)
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
  // 1. Product Name을 먼저 입력해야 쇼피에서 추천 카테고리를 로딩하기 시작합니다.
  const nameResult = fillField('Product Name', draft.productName, fieldKeywords.productName, false, ['name'])

  // 2. 이미지 및 상품 설명 입력
  const imageResult = await fillProductImage(draft)
  const descResult = fillField('Product Description', draft.productDescription, fieldKeywords.productDescription, true, ['description'])

  // 3. 추천 카테고리 대기 후 선택 (일치 항목 또는 첫 번째 추천 선택)
  const categoryResult = await selectRecommendedCategory(draft)

  // 카테고리가 입력되어 활성화되었을 브랜드 및 스펙/동적 필드 입력 시도
  const brandResult = await selectBrand(draft.brand || 'No Brand')
  const dynamicResults = fillDynamicFields(draft)

  const results = [
    imageResult,
    nameResult,
    descResult,
    brandResult,
    categoryResult,
    ...dynamicResults,
  ]

  // 실패한 항목(카테고리 로딩 지연 등으로 활성화가 늦어진 경우) 백그라운드 재시도
  if (dynamicResults.some((result) => !result.success)) retryDynamicFields(draft)
  if (!brandResult.success) retryBrand(draft)

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

