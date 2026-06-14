import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Copy,
  FileText,
  ImagePlus,
  Images,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
  Weight,
  X,
} from 'lucide-react'
import { createDraft, getDraft, listDrafts, markDraftUsed } from './api'
import type { CreateDraftInput, Currency, ProductDraft, WeightUnit } from './types'

type Screen = 'create' | 'loading' | 'result' | 'list'

const currencies: Currency[] = ['USD', 'KRW', 'SGD', 'MYR', 'PHP', 'THB', 'VND', 'IDR']
const loadingSteps = [
  '이미지 업로드 중',
  '상품 Draft 생성 중',
  'AI가 상품을 분석 중',
  '상품 설명 생성 중',
  '결과 저장 중',
]

const initialForm = {
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
      const result = await createDraft({ ...form, images: images.map((item) => item.file) } as CreateDraftInput)
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

        {screen === 'loading' && <LoadingScreen step={loadingStep} previewUrl={images[0]?.url ?? ''} imageCount={images.length} />}

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

function LoadingScreen({ step, previewUrl, imageCount }: { step: number; previewUrl: string; imageCount: number }) {
  return (
    <section className="screen loading-screen">
      <div className="loading-visual">
        {previewUrl && <img src={previewUrl} alt="" />}
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
}

function ResultScreen({ draft, copied, error, markingUsed, localImageUrls, onBack, onCopy, onMarkUsed, onReset }: ResultProps) {
  const { product } = draft
  const isUsed = draft.status.toUpperCase().includes('USED')
  const hasQualityIssue = draft.qualityWarnings.length > 0
  const reviewImages = draft.imageUrls.length > 0 ? draft.imageUrls : localImageUrls
  return (
    <section className="screen result-screen">
      <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Draft 목록</button>
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
            {reviewImages.map((url, index) => <img key={url} src={url} alt={`상품 이미지 ${index + 1}`} />)}
          </div>
        ) : (
          <div className="missing-images"><ImagePlus size={24} /><span>서버에 저장된 이미지가 없습니다.</span></div>
        )}
        {!draft.imageUrls.length && reviewImages.length > 0 && <p className="local-image-note">화면에서는 리뷰할 수 있지만 n8n 서버에는 아직 저장되지 않았습니다.</p>}
      </div>

      <div className="result-card">
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
      </div>
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

function ListScreen({ drafts, loading, error, onBack, onOpen, onRefresh }: {
  drafts: ProductDraft[]
  loading: boolean
  error: string
  onBack: () => void
  onOpen: (id: string) => void
  onRefresh: () => void
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
            <button key={item.draftId} className="draft-list-item" onClick={() => onOpen(item.draftId)}>
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
          ))}
        </div>
      )}
    </section>
  )
}

export default App
