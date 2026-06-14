import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Copy,
  Crop,
  FileText,
  ImagePlus,
  Images,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  RotateCw,
  Sparkles,
  Trash2,
  Weight,
  X,
} from 'lucide-react'
import { createDraft, deleteDraft, getDraft, listDrafts, markDraftUsed, updateDraft } from './api'
import type { CreateDraftInput, Currency, ProductDraft, WeightUnit } from './types'

type Screen = 'create' | 'loading' | 'result' | 'list'

const currencies: Currency[] = ['USD', 'KRW', 'SGD', 'MYR', 'PHP', 'THB', 'VND', 'IDR']
const recentBrandsStorageKey = 'shopee-draft-recent-brands'
const loadingSteps = [
  '이미지 업로드 중',
  '상품 Draft 생성 중',
  'AI가 상품을 분석 중',
  '상품 설명 생성 중',
  '결과 저장 중',
]

const initialForm = {
  brand: 'No brand',
  price: '',
  currency: 'USD' as Currency,
  weight: '',
  weightUnit: 'g' as WeightUnit,
}

async function compressImage(file: File, maxSizeBytes: number = 2 * 1024 * 1024): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // リサイズ: 最大幅1920px
        if (width > 1920) {
          const ratio = 1920 / width
          width *= ratio
          height *= ratio
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)

        // 품질 조정으로 2MB 이하 달성
        let quality = 0.85
        const compress = () => {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('이미지 압축 실패'))
              return
            }

            if (blob.size <= maxSizeBytes || quality <= 0.05) {
              const compressedFile = new File([blob], file.name, { type: 'image/jpeg' })
              resolve(compressedFile)
            } else {
              quality -= 0.1
              compress()
            }
          }, 'image/jpeg', quality)
        }

        compress()
      }
      img.onerror = () => reject(new Error('이미지를 로드할 수 없습니다.'))
      img.src = event.target?.result as string
    }
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.readAsDataURL(file)
  })
}

function App() {
  const [screen, setScreen] = useState<Screen>('create')
  const [form, setForm] = useState(initialForm)
  const [recentBrands, setRecentBrands] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(recentBrandsStorageKey) ?? '[]') as unknown
      return Array.isArray(stored)
        ? ['No brand', ...stored.filter((brand): brand is string => typeof brand === 'string' && brand !== 'No brand')].slice(0, 8)
        : ['No brand']
    } catch {
      return ['No brand']
    }
  })
  const [images, setImages] = useState<Array<{ file: File; url: string }>>([])
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<ProductDraft | null>(null)
  const [drafts, setDrafts] = useState<ProductDraft[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [markingUsed, setMarkingUsed] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [copied, setCopied] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (screen !== 'loading') return
    const timer = window.setInterval(() => {
      setLoadingStep((current) => Math.min(current + 1, loadingSteps.length - 1))
    }, 2300)
    return () => window.clearInterval(timer)
  }, [screen])

  function selectImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    if (!selected.length) return
    const valid = selected.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024)
    if (valid.length !== selected.length) setError('JPG, PNG, WEBP 형식의 5MB 이하 이미지만 추가됩니다.')
    const available = Math.max(0, 9 - images.length)
    const additions = valid.slice(0, available)

    // 이미지 압축 및 미리보기 추가
    Promise.all(additions.map((file) => compressImage(file)))
      .then((compressedFiles) => {
        const newImages = compressedFiles.map((file) => ({ file, url: URL.createObjectURL(file) }))
        setImages((current) => [...current, ...newImages])
        if (selected.length > available) setError('상품 이미지는 최대 9장까지 등록할 수 있습니다.')
        else if (valid.length === selected.length) setError('')
      })
      .catch(() => {
        setError('이미지 압축 중 오류가 발생했습니다.')
      })

    event.target.value = ''
  }

  function removeImage(index: number) {
    setImages((current) => {
      URL.revokeObjectURL(current[index].url)
      return current.filter((_, itemIndex) => itemIndex !== index)
    })
    setError('')
  }

  function validate() {
    if (!images.length) return '상품 사진을 먼저 등록해 주세요.'
    if (!form.price || Number(form.price) <= 0) return '0보다 큰 판매 가격을 입력해 주세요.'
    if (!form.weight || Number(form.weight) <= 0) return '0보다 큰 상품 무게를 입력해 주세요.'
    return ''
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setLoadingStep(0)
    setScreen('loading')
    try {
      const selectedBrand = form.brand.trim() || 'No brand'
      const nextRecentBrands = [selectedBrand, ...recentBrands.filter((brand) => brand !== selectedBrand)].slice(0, 8)
      setRecentBrands(nextRecentBrands)
      try {
        localStorage.setItem(recentBrandsStorageKey, JSON.stringify(nextRecentBrands))
      } catch {
        // Draft creation should still work when browser storage is unavailable.
      }
      const result = await createDraft({ ...form, brand: selectedBrand, images: images.map((item) => item.file) } as CreateDraftInput)
      setDraft(result)
      setScreen('result')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '상품 정보를 생성하지 못했습니다. 다시 시도해 주세요.')
      setScreen('create')
    }
  }

  function reset() {
    images.forEach((item) => URL.revokeObjectURL(item.url))
    setImages([])
    setForm(initialForm)
    setDraft(null)
    setError('')
    setScreen('create')
    if (fileInput.current) fileInput.current.value = ''
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1600)
  }

  async function loadDrafts() {
    setScreen('list')
    setListLoading(true)
    setError('')
    try {
      setDrafts(await listDrafts())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Draft 목록을 불러오지 못했습니다.')
    } finally {
      setListLoading(false)
    }
  }

  async function openDraft(draftId: string) {
    setListLoading(true)
    setError('')
    try {
      setDraft(await getDraft(draftId))
      setScreen('result')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Draft 상세 정보를 불러오지 못했습니다.')
    } finally {
      setListLoading(false)
    }
  }

  async function markUsed() {
    if (!draft) return
    setMarkingUsed(true)
    setError('')
    try {
      await markDraftUsed(draft.draftId)
      setDraft({ ...draft, status: 'USED', usedAt: new Date().toISOString() })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '사용 완료 처리에 실패했습니다.')
    } finally {
      setMarkingUsed(false)
    }
  }

  async function handleDeleteDraft(draftId: string, event?: React.MouseEvent) {
    if (event) {
      event.stopPropagation()
    }
    if (!window.confirm('정말 이 Draft를 삭제하시겠습니까?')) return

    setError('')
    try {
      await deleteDraft(draftId)
      setDrafts((current) => current.filter((d) => d.draftId !== draftId))
      if (draft?.draftId === draftId) {
        reset()
      }
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof Error ? caught.message : '삭제에 실패했습니다. 다시 시도해 주세요.')
      // UI 즉시 반영을 위한 폴백 처리
      setDrafts((current) => current.filter((d) => d.draftId !== draftId))
      if (draft?.draftId === draftId) {
        reset()
      }
    }
  }

  async function handleRemoveDraftImage(url: string) {
    if (!draft) return
    const updatedUrls = draft.imageUrls.filter((item) => item !== url)
    setDraft({
      ...draft,
      imageUrls: updatedUrls
    })

    try {
      await updateDraft(draft.draftId, { imageUrls: updatedUrls })
    } catch (e) {
      console.error('Failed to save image deletion:', e)
    }

    setImages((current) => {
      const targetIndex = current.findIndex((item) => item.url === url)
      if (targetIndex !== -1) {
        URL.revokeObjectURL(current[targetIndex].url)
        return current.filter((_, idx) => idx !== targetIndex)
      }
      return current
    })
  }

  async function handleCropImage(oldUrl: string, croppedDataUrl: string) {
    if (!draft) return
    setError('')
    try {
      const res = await fetch(croppedDataUrl)
      const blob = await res.blob()
      const file = new File([blob], `cropped-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const newUrl = URL.createObjectURL(file)

      setImages((current) => {
        const targetIndex = current.findIndex((item) => item.url === oldUrl)
        if (targetIndex !== -1) {
          URL.revokeObjectURL(current[targetIndex].url)
          const updated = [...current]
          updated[targetIndex] = { file, url: newUrl }
          return updated
        }
        return current
      })

      const updatedUrls = draft.imageUrls.map((u) => u === oldUrl ? croppedDataUrl : u)
      setDraft({
        ...draft,
        imageUrls: updatedUrls
      })

      try {
        await updateDraft(draft.draftId, { imageUrls: updatedUrls })
      } catch (e) {
        console.error('Failed to update draft imageUrls after crop:', e)
      }
    } catch (e) {
      console.error('Error handling cropped image:', e)
      setError('이미지 편집 결과 저장 중 오류가 발생했습니다.')
    }
  }

  async function handleUpdateDraft(updates: Partial<ProductDraft>) {
    if (!draft) return
    setError('')
    try {
      const result = await updateDraft(draft.draftId, updates)
      setDraft(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '수정에 실패했습니다. 다시 시도해 주세요.')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={reset}
          aria-label="등록 화면으로 이동"
        >
          <span className="brand-mark"><Package size={20} /></span>
          <span>
            <strong>Shopee Draft</strong>
            <small>AI Product Creator</small>
          </span>
        </button>
        <button className="icon-button" onClick={loadDrafts} aria-label="Draft 목록">
          <FileText size={20} />
        </button>
      </header>

      <main>
        {screen === 'create' && (
          <section className="screen create-screen">
            <div className="hero">
              <span className="eyebrow"><Sparkles size={14} /> AI 상품 등록</span>
              <h1>상품 사진을 모아<br />Draft를 만드세요</h1>
              <p>여러 각도의 사진을 최대 9장까지 등록할 수 있습니다.</p>
            </div>

            <form onSubmit={submit} className="create-form">
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={selectImages}
              />

              {images.length === 0 ? (
                <button type="button" className="upload-card" onClick={() => fileInput.current?.click()}>
                  <span className="upload-content">
                    <span className="camera-bubble"><ImagePlus size={28} /></span>
                    <strong>상품 사진 여러 장 추가</strong>
                    <small>최대 9장 · 이미지별 최대 5MB</small>
                  </span>
                </button>
              ) : (
                <div className="image-review">
                  <div className="review-heading">
                    <div><Images size={17} /><strong>이미지 리뷰</strong><span>{images.length}/9</span></div>
                    <button type="button" onClick={() => fileInput.current?.click()} disabled={images.length >= 9}><Plus size={15} /> 추가</button>
                  </div>
                  <div className="main-preview">
                    <img src={images[0].url} alt="대표 상품 이미지" />
                    <span>대표 이미지</span>
                  </div>
                  <div className="thumbnail-grid">
                    {images.map((item, index) => (
                      <div key={item.url} className={index === 0 ? 'cover' : ''}>
                        <img src={item.url} alt={`상품 이미지 ${index + 1}`} />
                        <button type="button" onClick={() => removeImage(index)} aria-label={`이미지 ${index + 1} 삭제`}><X size={13} /></button>
                        <span>{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="input-section">
                <label>
                  <span>Brand</span>
                  <input
                    className="brand-input"
                    type="text"
                    placeholder="No brand 또는 자주 쓰는 브랜드"
                    value={form.brand}
                    onChange={(event) => setForm({ ...form, brand: event.target.value })}
                  />
                  <span className="field-help">Shopee Brand에서 자동 선택을 시도합니다.</span>
                  <span className="brand-choices">
                    {recentBrands.map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        className={form.brand === brand ? 'selected' : ''}
                        onClick={() => setForm({ ...form, brand })}
                      >
                        {brand}
                      </button>
                    ))}
                  </span>
                </label>

                <label>
                  <span>Global SKU Price</span>
                  <div className="input-row">
                    <span className="input-icon">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="10.00"
                      value={form.price}
                      onChange={(event) => setForm({ ...form, price: event.target.value })}
                    />
                    <select
                      aria-label="통화"
                      value={form.currency}
                      onChange={(event) => setForm({ ...form, currency: event.target.value as Currency })}
                    >
                      {currencies.map((currency) => <option key={currency}>{currency}</option>)}
                    </select>
                  </div>
                </label>

                <label>
                  <span>Weight</span>
                  <div className="input-row">
                    <span className="input-icon"><Weight size={18} /></span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="120"
                      value={form.weight}
                      onChange={(event) => setForm({ ...form, weight: event.target.value })}
                    />
                    <select
                      aria-label="무게 단위"
                      value={form.weightUnit}
                      onChange={(event) => setForm({ ...form, weightUnit: event.target.value as WeightUnit })}
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                </label>
              </div>

              {error && <ErrorBanner message={error} onClose={() => setError('')} />}

              <button className="primary-button" type="submit">
                <Sparkles size={19} />
                Generate Product Details
              </button>
            </form>
          </section>
        )}

        {screen === 'loading' && (
          <LoadingScreen
            step={loadingStep}
            previewUrls={images.map((item) => item.url)}
            imageCount={images.length}
          />
        )}

        {screen === 'result' && draft && (
          <ResultScreen
            draft={draft}
            copied={copied}
            error={error}
            markingUsed={markingUsed}
            localImageUrls={images.map((item) => item.url)}
            onBack={loadDrafts}
            onCopy={copyText}
            onMarkUsed={markUsed}
            onReset={reset}
            onDelete={handleDeleteDraft}
            onRemoveImage={handleRemoveDraftImage}
            onUpdate={handleUpdateDraft}
            onCropImage={handleCropImage}
          />
        )}

        {screen === 'list' && (
          <ListScreen
            drafts={drafts}
            loading={listLoading}
            error={error}
            onBack={reset}
            onOpen={openDraft}
            onRefresh={loadDrafts}
            onDelete={handleDeleteDraft}
          />
        )}
      </main>
    </div>
  )
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onClose}><X size={16} /></button>
    </div>
  )
}

function LoadingScreen({ step, previewUrls, imageCount }: { step: number; previewUrls: string[]; imageCount: number }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (previewUrls.length <= 1) return
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % previewUrls.length)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [previewUrls])

  const activeUrl = previewUrls[currentIndex] || ''

  return (
    <section className="screen loading-screen">
      <div className="loading-visual">
        {activeUrl && <img src={activeUrl} alt="" />}
        <span className="scan-line" />
        <span className="loading-spark"><Sparkles size={23} /></span>
      </div>
      <span className="eyebrow"><LoaderCircle size={14} className="spin" /> AI 분석 중</span>
      <h2>{loadingSteps[step]}<span className="dots">...</span></h2>
      <p>{imageCount}장의 상품 이미지를 분석하고 있어요.<br />잠시만 기다려 주세요.</p>
      <div className="progress-track"><span style={{ width: `${(step + 1) * 20}%` }} /></div>
      <div className="step-list">
        {loadingSteps.map((label, index) => (
          <div key={label} className={index <= step ? 'active' : ''}>
            {index < step ? <Check size={14} /> : <span />}
            {label}
          </div>
        ))}
      </div>
    </section>
  )
}

type ResultProps = {
  draft: ProductDraft
  copied: string
  error: string
  markingUsed: boolean
  localImageUrls: string[]
  onBack: () => void
  onCopy: (text: string, label: string) => void
  onMarkUsed: () => void
  onReset: () => void
  onDelete: (id: string) => void
  onRemoveImage: (url: string) => void
  onUpdate: (updates: Partial<ProductDraft>) => Promise<void>
  onCropImage: (url: string, croppedDataUrl: string) => void
}

function ResultScreen({ draft, copied, error, markingUsed, localImageUrls, onBack, onCopy, onMarkUsed, onReset, onDelete, onRemoveImage, onUpdate, onCropImage }: ResultProps) {
  const { product } = draft
  const isUsed = draft.status.toUpperCase().includes('USED')
  const hasQualityIssue = draft.qualityWarnings.length > 0
  const reviewImages = draft.imageUrls.length > 0 ? draft.imageUrls : localImageUrls

  const [isEditing, setIsEditing] = useState(false)
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    productName: product.productName,
    category: product.category,
    brand: product.brand,
    price: product.globalSkuPrice,
    weight: String(product.weight),
    stock: String(product.stock),
    daysToShip: String(product.daysToShip),
    productDescription: product.productDescription,
  })

  useEffect(() => {
    setEditForm({
      productName: product.productName,
      category: product.category,
      brand: product.brand,
      price: product.globalSkuPrice,
      weight: String(product.weight),
      stock: String(product.stock),
      daysToShip: String(product.daysToShip),
      productDescription: product.productDescription,
    })
  }, [draft])

  return (
    <section className="screen result-screen">
      <div className="detail-header">
        <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Draft 목록</button>
        <div className="detail-header-actions">
          <button
            className={`detail-edit-button ${isEditing ? 'saving' : ''}`}
            onClick={async () => {
              if (isEditing) {
                const updates = {
                  product: {
                    ...product,
                    productName: editForm.productName,
                    category: editForm.category,
                    brand: editForm.brand,
                    globalSkuPrice: editForm.price,
                    weight: Number(editForm.weight),
                    stock: Number(editForm.stock),
                    daysToShip: Number(editForm.daysToShip),
                    productDescription: editForm.productDescription,
                  }
                }
                await onUpdate(updates)
              }
              setIsEditing(!isEditing)
            }}
          >
            {isEditing ? '저장 완료' : '정보 수정'}
          </button>
          <button className="detail-delete-button" onClick={() => onDelete(draft.draftId)} aria-label="Draft 삭제">
            <Trash2 size={16} />
            삭제
          </button>
        </div>
      </div>
      <div className="success-heading">
        <span className={`success-icon ${hasQualityIssue ? 'warning' : ''}`}>{hasQualityIssue ? <AlertTriangle size={29} /> : <CheckCircle2 size={29} />}</span>
        <div>
          <span className="eyebrow">{hasQualityIssue ? 'Draft Needs Review' : 'Draft Created'}</span>
          <h1>{hasQualityIssue ? <>AI 생성 결과를<br />확인해 주세요</> : <>상품 Draft가<br />준비되었습니다</>}</h1>
        </div>
      </div>

      <div className="draft-id-card">
        <span>Draft ID</span>
        <strong>{draft.draftId}</strong>
        <button onClick={() => onCopy(draft.draftId, 'id')} aria-label="Draft ID 복사">
          {copied === 'id' ? <Check size={17} /> : <Copy size={17} />}
        </button>
      </div>

      {error && <ErrorBanner message={error} onClose={() => undefined} />}
      {hasQualityIssue && (
        <div className="quality-warning">
          <strong><AlertTriangle size={17} /> 정상적인 AI 결과가 아닙니다</strong>
          {draft.qualityWarnings.map((warning) => <p key={warning}>· {warning}</p>)}
          <span>현재 n8n 워크플로의 이미지 저장 및 Vision AI 설정을 확인해야 합니다.</span>
        </div>
      )}

      <div className="result-images">
        <div className="review-heading">
          <div>
            <Images size={17} />
            <strong>{draft.imageUrls.length > 0 ? '서버에 저장된 상품 이미지' : '이번 등록에 사용한 이미지'}</strong>
            <span>{reviewImages.length}</span>
          </div>
        </div>
        {reviewImages.length > 0 ? (
          <div className="result-image-grid">
            {reviewImages.map((url, index) => (
              <div key={url} className="result-image-item">
                <img src={url} alt={`상품 이미지 ${index + 1}`} />
                <button
                  type="button"
                  onClick={() => setEditingImageUrl(url)}
                  aria-label={`이미지 ${index + 1} 자르기`}
                  className="result-image-crop"
                >
                  <Crop size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveImage(url)}
                  aria-label={`이미지 ${index + 1} 삭제`}
                  className="result-image-delete"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="missing-images"><ImagePlus size={24} /><span>서버에 저장된 이미지가 없습니다.</span></div>
        )}
        {!draft.imageUrls.length && reviewImages.length > 0 && <p className="local-image-note">화면에서는 리뷰할 수 있지만 n8n 서버에는 아직 저장되지 않았습니다.</p>}
      </div>

      <div className="result-card">
        {isEditing ? (
          <>
            <div className="result-field">
              <span className="field-label">Product Name</span>
              <input
                className="edit-input-field"
                type="text"
                value={editForm.productName}
                onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
              />
            </div>
            <div className="result-field">
              <span className="field-label">Category</span>
              <input
                className="edit-input-field"
                type="text"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
              />
            </div>
            <div className="result-grid">
              <div className="result-field">
                <span className="field-label">Brand</span>
                <input
                  className="edit-input-field"
                  type="text"
                  value={editForm.brand}
                  onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                />
              </div>
              <div className="result-field">
                <span className="field-label">Condition</span>
                <span className="field-value-readonly">{product.condition}</span>
              </div>
              <div className="result-field">
                <span className="field-label">Price ({product.currency})</span>
                <input
                  className="edit-input-field"
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                />
              </div>
              <div className="result-field">
                <span className="field-label">Weight ({product.weightUnit})</span>
                <input
                  className="edit-input-field"
                  type="number"
                  value={editForm.weight}
                  onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                />
              </div>
              <div className="result-field">
                <span className="field-label">Stock</span>
                <input
                  className="edit-input-field"
                  type="number"
                  value={editForm.stock}
                  onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                />
              </div>
              <div className="result-field">
                <span className="field-label">Days to ship</span>
                <input
                  className="edit-input-field"
                  type="number"
                  value={editForm.daysToShip}
                  onChange={(e) => setEditForm({ ...editForm, daysToShip: e.target.value })}
                />
              </div>
            </div>
            <div className="result-field long">
              <span className="field-label">Product Description</span>
              <textarea
                className="edit-textarea-field"
                rows={5}
                value={editForm.productDescription}
                onChange={(e) => setEditForm({ ...editForm, productDescription: e.target.value })}
              />
            </div>
          </>
        ) : (
          <>
            <ResultField label="Product Name" value={product.productName} onCopy={() => onCopy(product.productName, 'name')} copied={copied === 'name'} />
            <ResultField label="Category" value={product.category} />
            <div className="result-grid">
              <ResultField label="Brand" value={product.brand} />
              <ResultField label="Condition" value={product.condition} />
              <ResultField label="Price" value={`${product.currency} ${product.globalSkuPrice}`} />
              <ResultField label="Weight" value={`${product.weight} ${product.weightUnit}`} />
              <ResultField label="Stock" value={String(product.stock)} />
              <ResultField label="Days to ship" value={`${product.daysToShip} day${product.daysToShip === 1 ? '' : 's'}`} />
            </div>
            <ResultField
              label="Product Description"
              value={product.productDescription}
              long
              onCopy={() => onCopy(product.productDescription, 'description')}
              copied={copied === 'description'}
            />
          </>
        )}
        {product.shortDescription && <ResultField label="Short Description" value={product.shortDescription} long />}
        {Object.keys(product.specifications).length > 0 && (
          <div className="specifications">
            <span className="field-label">Specifications</span>
            {Object.entries(product.specifications).map(([key, value]) => (
              <div key={key}><span>{key}</span><strong>{value}</strong></div>
            ))}
          </div>
        )}
      </div>

      <div className="result-actions">
        <button className="secondary-button" onClick={onReset}><Plus size={18} /> 새 상품 등록</button>
        <button className={`primary-button ${isUsed ? 'used' : ''}`} onClick={onMarkUsed} disabled={markingUsed || isUsed || hasQualityIssue}>
          {markingUsed ? <LoaderCircle size={18} className="spin" /> : <CheckCircle2 size={18} />}
          {isUsed ? '사용 완료됨' : hasQualityIssue ? 'AI 결과 확인 필요' : '사용 완료 표시'}
        </button>
        <button className="danger-button" onClick={() => onDelete(draft.draftId)} aria-label="Draft 삭제">
          <Trash2 size={18} />
          Draft 삭제
        </button>
      </div>

      {editingImageUrl && (
        <ImageCropModal
          url={editingImageUrl}
          onClose={() => setEditingImageUrl(null)}
          onSave={(croppedDataUrl) => {
            onCropImage(editingImageUrl, croppedDataUrl)
            setEditingImageUrl(null)
          }}
        />
      )}
    </section>
  )
}

function ResultField({ label, value, long, onCopy, copied }: { label: string; value: string; long?: boolean; onCopy?: () => void; copied?: boolean }) {
  return (
    <div className={`result-field ${long ? 'long' : ''}`}>
      <span className="field-label">{label}</span>
      <p>{value || '-'}</p>
      {onCopy && <button onClick={onCopy}>{copied ? <Check size={16} /> : <Clipboard size={16} />}</button>}
    </div>
  )
}

function ListScreen({ drafts, loading, error, onBack, onOpen, onRefresh, onDelete }: {
  drafts: ProductDraft[]
  loading: boolean
  error: string
  onBack: () => void
  onOpen: (id: string) => void
  onRefresh: () => void
  onDelete: (id: string, event: React.MouseEvent) => void
}) {
  return (
    <section className="screen list-screen">
      <div className="list-heading">
        <button className="icon-button" onClick={onBack}><ArrowLeft size={20} /></button>
        <div>
          <span className="eyebrow">Product Drafts</span>
          <h1>Draft 목록</h1>
        </div>
        <button className="icon-button" onClick={onRefresh} disabled={loading}><RefreshCw size={19} className={loading ? 'spin' : ''} /></button>
      </div>

      {error && <ErrorBanner message={error} onClose={() => undefined} />}

      {loading && drafts.length === 0 ? (
        <div className="empty-state"><LoaderCircle className="spin" /><p>Draft를 불러오고 있습니다.</p></div>
      ) : drafts.length === 0 ? (
        <div className="empty-state">
          <span><FileText size={27} /></span>
          <h2>아직 Draft가 없습니다</h2>
          <p>상품 사진을 등록해 첫 Draft를 만들어 보세요.</p>
          <button className="primary-button" onClick={onBack}><Plus size={18} /> 새 상품 등록</button>
        </div>
      ) : (
        <div className="draft-list">
          {drafts.map((item) => (
            <div key={item.draftId} className="draft-list-wrapper">
              <button className="draft-list-item" onClick={() => onOpen(item.draftId)}>
                <span className="draft-thumb"><Package size={22} /></span>
                <span className="draft-summary">
                  <strong>{item.product.productName || '이름 없는 상품'}</strong>
                  <small>{item.product.currency} {item.product.globalSkuPrice} · {item.product.weight} {item.product.weightUnit}</small>
                  <em className={item.qualityWarnings.length ? 'warning' : item.status.toUpperCase().includes('USED') ? 'used' : ''}>
                    {item.qualityWarnings.length ? 'AI 결과 확인 필요' : item.status}
                  </em>
                </span>
                <ChevronRight size={19} />
              </button>
              <button
                className="list-delete-button"
                onClick={(e) => onDelete(item.draftId, e)}
                aria-label="Draft 삭제"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

interface ImageCropModalProps {
  url: string
  onClose: () => void
  onSave: (croppedDataUrl: string) => void
}

function ImageCropModal({ url, onClose, onSave }: ImageCropModalProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number } | null>(null)

  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    if (img.complete) {
      if (img.naturalWidth && img.naturalHeight) {
        setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      }
    }
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      }
    }
    img.onerror = () => {
      // Fallback to avoid infinite loading if image fails to load
      setNaturalDimensions({ width: 300, height: 300 })
    }
  }, [url])

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return
    setIsDragging(true)
    const touch = e.touches[0]
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y })
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1) return
    const touch = e.touches[0]
    setOffset({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y })
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  const handleReset = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setRotation(0)
  }

  const viewportSize = 300
  const previewSize = 120

  let W_fit = viewportSize
  let H_fit = viewportSize
  let W_fit_prev = previewSize
  let H_fit_prev = previewSize

  if (naturalDimensions) {
    const { width: W_nat, height: H_nat } = naturalDimensions
    const s = Math.min(viewportSize / W_nat, viewportSize / H_nat)
    W_fit = W_nat * s
    H_fit = H_nat * s

    const s_prev = Math.min(previewSize / W_nat, previewSize / H_nat)
    W_fit_prev = W_nat * s_prev
    H_fit_prev = H_nat * s_prev
  }

  const handleSave = () => {
    if (!imageRef.current || !naturalDimensions) return

    const W_nat = naturalDimensions.width
    const H_nat = naturalDimensions.height

    const canvas = document.createElement('canvas')
    const cropSize = 600
    canvas.width = cropSize
    canvas.height = cropSize

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, cropSize, cropSize)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cropSize, cropSize)

    // Center coordinates
    ctx.translate(cropSize / 2, cropSize / 2)

    const scaleRatio = cropSize / viewportSize

    ctx.translate(offset.x * scaleRatio, offset.y * scaleRatio)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(zoom, zoom)

    const s = Math.min(viewportSize / W_nat, viewportSize / H_nat)
    const W_canvas = (W_nat * s) * scaleRatio
    const H_canvas = (H_nat * s) * scaleRatio

    try {
      ctx.drawImage(imageRef.current, -W_canvas / 2, -H_canvas / 2, W_canvas, H_canvas)
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9)
      onSave(croppedDataUrl)
    } catch (e) {
      console.error('Error drawing image to canvas:', e)
      alert('이미지를 편집하는 중 오류가 발생했습니다. CORS 제한으로 인해 발생할 수 있습니다.')
    }
  }

  return (
    <div className="crop-modal-overlay">
      <div className="crop-modal-content">
        <div className="crop-modal-header">
          <h3>이미지 편집 / Crop</h3>
          <button className="crop-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {!naturalDimensions ? (
          <div className="crop-modal-body" style={{ minHeight: '348px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <LoaderCircle className="spin" size={24} style={{ color: 'var(--orange)' }} />
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>이미지를 불러오는 중...</p>
            </div>
          </div>
        ) : (
          <div className="crop-modal-body">
            <div className="crop-workspace-container">
              <div
                className="crop-workspace"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div className="crop-viewport">
                  <img
                    ref={imageRef}
                    src={url}
                    crossOrigin="anonymous"
                    alt="Cropping workspace"
                    draggable={false}
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                      transformOrigin: 'center center',
                      width: `${W_fit}px`,
                      height: `${H_fit}px`,
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>
              <div className="crop-workspace-hint">마우스나 터치로 이미지를 드래그하여 위치를 조정하세요</div>
            </div>

            <div className="crop-right-panel">
              <div className="crop-preview-label">미리보기 (1:1)</div>
              <div className="crop-preview-box">
                <div className="crop-preview-viewport">
                  <img
                    src={url}
                    crossOrigin="anonymous"
                    alt="Cropped Preview"
                    draggable={false}
                    style={{
                      transform: `translate(${offset.x * (previewSize / viewportSize)}px, ${offset.y * (previewSize / viewportSize)}px) rotate(${rotation}deg) scale(${zoom})`,
                      transformOrigin: 'center center',
                      width: `${W_fit_prev}px`,
                      height: `${H_fit_prev}px`,
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>

              <div className="crop-controls-title">확대 및 회전</div>
              <div className="crop-controls-buttons">
                <button
                  type="button"
                  className="crop-ctrl-btn"
                  onClick={() => setZoom((prev) => Math.max(1, prev - 0.1))}
                  title="Zoom Out"
                >
                  <Minus size={15} />
                </button>

                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  className="crop-zoom-slider"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                />

                <button
                  type="button"
                  className="crop-ctrl-btn"
                  onClick={() => setZoom((prev) => Math.min(3, prev + 0.1))}
                  title="Zoom In"
                >
                  <Plus size={15} />
                </button>

                <button
                  type="button"
                  className="crop-ctrl-btn"
                  onClick={handleRotate}
                  title="Rotate 90°"
                >
                  <RotateCw size={15} />
                </button>

                <button
                  type="button"
                  className="crop-ctrl-btn reset"
                  onClick={handleReset}
                  title="Reset"
                >
                  리셋
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="crop-modal-footer">
          <button className="secondary-button" onClick={onClose}>취소</button>
          <button className="primary-button" onClick={handleSave} disabled={!naturalDimensions}>자르기 완료</button>
        </div>
      </div>
    </div>
  )
}

export default App
