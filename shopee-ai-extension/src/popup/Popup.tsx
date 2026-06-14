import { useEffect, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDot,
  FileInput,
  LoaderCircle,
  Package,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  XCircle,
} from 'lucide-react'
import {
  fetchDraftDetail,
  fetchDraftList,
  loadSettings,
  markDraftUsed,
  saveSettings,
} from '../api/n8nClient'
import type { ExtensionMessage, ExtensionSettings, FillResponse, ProductDraft } from '../types/productDraft'

type View = 'list' | 'detail' | 'settings'

function Popup() {
  const [view, setView] = useState<View>('list')
  const [settings, setSettings] = useState<ExtensionSettings>({ n8nBaseUrl: '', apiKey: '' })
  const [drafts, setDrafts] = useState<ProductDraft[]>([])
  const [selected, setSelected] = useState<ProductDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isShopeePage, setIsShopeePage] = useState(false)
  const [isShopeeTab, setIsShopeeTab] = useState(false)
  const [fillResult, setFillResult] = useState<FillResponse | null>(null)

  useEffect(() => {
    void initialize()
    // Initialization intentionally runs only when the popup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function initialize() {
    try {
      const loaded = await loadSettings()
      setSettings(loaded)
      await Promise.all([refreshDrafts(loaded), detectShopeePage()])
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setLoading(false)
    }
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('현재 탭을 찾을 수 없습니다.')
    return tab
  }

  async function detectShopeePage() {
    try {
      const tab = await getActiveTab()
      setIsShopeeTab(Boolean(tab.url && /^https:\/\/seller\.shopee\./.test(tab.url)))
      const response = await chrome.tabs.sendMessage<ExtensionMessage, FillResponse>(tab.id!, { type: 'PING_SHOPEE_PAGE' })
      setIsShopeePage(Boolean(response?.isShopeePage))
    } catch {
      setIsShopeePage(false)
    }
  }

  async function refreshDrafts(override = settings) {
    setLoading(true)
    setError('')
    try {
      const list = await fetchDraftList(override)
      setDrafts(list.filter((draft) => !draft.status.toUpperCase().includes('USED')))
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setLoading(false)
    }
  }

  async function openDraft(draftId: string) {
    setActionLoading(true)
    setError('')
    setFillResult(null)
    try {
      setSelected(await fetchDraftDetail(draftId, settings))
      setView('detail')
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setActionLoading(false)
    }
  }

  async function fillShopee() {
    if (!selected) return
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      await ensureImagePermission(selected)
      const tab = await getActiveTab()
      const response = await chrome.tabs.sendMessage<ExtensionMessage, FillResponse>(tab.id!, {
        type: 'FILL_SHOPEE_PRODUCT',
        payload: selected,
      })
      setFillResult(response)
      if (!response.success) setError(response.message)
      else setNotice('먼저 카테고리를 직접 선택하세요. Brand와 하단 필드가 열리면 자동 입력을 다시 시도합니다.')
    } catch {
      setError('Shopee Seller Center 탭을 열고 페이지를 새로고침한 후 다시 시도해 주세요.')
    } finally {
      setActionLoading(false)
    }
  }

  async function ensureImagePermission(draft: ProductDraft) {
    const remoteImage = draft.imageUrls.find((url) => /^https?:\/\//.test(url))
    if (!remoteImage) return
    const origin = `${new URL(remoteImage).origin}/*`
    const hasPermission = await chrome.permissions.contains({ origins: [origin] })
    if (!hasPermission) {
      const granted = await chrome.permissions.request({ origins: [origin] })
      if (!granted) throw new Error('이미지 다운로드 권한이 허용되지 않았습니다.')
    }
  }

  async function markUsed() {
    if (!selected) return
    setActionLoading(true)
    setError('')
    try {
      await markDraftUsed(selected.draftId, settings)
      setNotice('Draft를 USED 상태로 변경했습니다.')
      setDrafts((current) => current.filter((draft) => draft.draftId !== selected.draftId))
      setSelected({ ...selected, status: 'USED' })
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setActionLoading(false)
    }
  }

  async function saveConfiguration() {
    setActionLoading(true)
    setError('')
    try {
      await saveSettings(settings)
      setNotice('설정을 저장했습니다.')
      await refreshDrafts(settings)
      setView('list')
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="popup">
      <header>
        <button className="brand" onClick={() => setView('list')}>
          <span><Package size={18} /></span>
          <div><strong>Shopee AI Draft</strong><small>Field Helper</small></div>
        </button>
        <button className="icon-button" onClick={() => setView('settings')} aria-label="설정"><Settings size={17} /></button>
      </header>

      <div className={`connection ${isShopeePage ? 'connected' : ''}`}>
        <CircleDot size={13} />
        {isShopeePage
          ? 'Shopee Seller Center 감지됨'
          : isShopeeTab
            ? 'Shopee 탭 감지됨 · Extension과 페이지를 새로고침해 주세요'
            : 'Shopee 상품 등록 화면을 열어 주세요'}
      </div>

      {error && <div className="message error"><CircleAlert size={15} /><span>{error}</span></div>}
      {notice && <div className="message notice"><CheckCircle2 size={15} /><span>{notice}</span></div>}

      {view === 'list' && (
        <main>
          <div className="section-title">
            <div><span>Ready Drafts</span><h1>상품 Draft</h1></div>
            <button className="icon-button" disabled={loading} onClick={() => refreshDrafts()}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
          {loading ? (
            <Empty icon={<LoaderCircle className="spin" />} title="Draft 불러오는 중" text="n8n 서버에 연결하고 있습니다." />
          ) : drafts.length === 0 ? (
            <Empty icon={<Sparkles />} title="준비된 Draft가 없습니다" text="모바일에서 새 상품 Draft를 생성해 주세요." />
          ) : (
            <div className="draft-list">
              {drafts.map((draft) => (
                <button key={draft.draftId} onClick={() => openDraft(draft.draftId)}>
                  <span className="draft-icon"><Package size={18} /></span>
                  <span className="draft-text">
                    <strong>{draft.productName || '이름 없는 상품'}</strong>
                    <small>{draft.currency} {draft.globalSkuPrice} · {draft.weight} {draft.weightUnit}</small>
                    <em>{draft.status}</em>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          )}
        </main>
      )}

      {view === 'detail' && selected && (
        <main>
          <button className="back" onClick={() => setView('list')}><ChevronLeft size={16} /> Draft 목록</button>
          <div className="detail-heading">
            <span className="draft-icon large"><Package size={22} /></span>
            <div><span>Selected Draft</span><h1>{selected.productName || '이름 없는 상품'}</h1></div>
          </div>
          <div className="detail-card">
            <div className="detail">
              <span>Product Image {selected.imageUrls.length === 0 && <CircleAlert size={10} />}</span>
              {selected.imageUrls.length > 0 ? (
                <div className="extension-image-grid">
                  {selected.imageUrls.map((url, index) => (
                    <img key={url} src={url} alt={`상품 이미지 ${index + 1}`} />
                  ))}
                </div>
              ) : (
                <p>이미지 URL 없음 · n8n 저장 설정 필요</p>
              )}
            </div>
            <Detail label="Category (직접 선택)" value={selected.categoryPath} warning />
            <div className="detail-grid">
              <Detail label="Brand (자동 선택)" value={selected.brand || 'No Brand'} />
              <Detail label="Condition" value={selected.condition} />
              <Detail label="Price" value={`${selected.currency} ${selected.globalSkuPrice}`} />
              <Detail label="Weight" value={`${selected.weight} ${selected.weightUnit}`} />
              <Detail label="Stock" value={String(selected.stock)} />
              <Detail label="Days to ship" value={String(selected.daysToShip)} />
            </div>
            <Detail label="Description" value={selected.productDescription} long />
          </div>
          {selected.qualityWarnings.length > 0 && (
            <div className="draft-warning">
              <strong><CircleAlert size={14} /> 이 Draft는 실제 AI 생성 결과가 아닙니다</strong>
              {selected.qualityWarnings.map((warning) => <span key={warning}>· {warning}</span>)}
            </div>
          )}

          {fillResult && (
            <div className="fill-report">
              <strong>자동 입력 결과</strong>
              {fillResult.results.map((result) => (
                <div key={result.field} className={result.success ? 'ok' : 'fail'}>
                  {result.success ? <Check size={13} /> : <XCircle size={13} />}
                  <span>{result.field}</span>
                  <small>{result.message}</small>
                </div>
              ))}
            </div>
          )}

          <div className="actions">
            <button
              className="primary"
              onClick={fillShopee}
              disabled={actionLoading || !isShopeePage || selected.qualityWarnings.length > 0}
              title={!isShopeePage ? 'Extension을 다시 로드하고 Shopee 페이지를 새로고침해 주세요.' : undefined}
            >
              {actionLoading ? <LoaderCircle className="spin" size={17} /> : <FileInput size={17} />}
              Shopee 화면에 입력
            </button>
            <button className="secondary" onClick={markUsed} disabled={actionLoading || selected.status.includes('USED')}>
              <CheckCircle2 size={16} /> {selected.status.includes('USED') ? '사용 완료됨' : 'Mark as Used'}
            </button>
          </div>
        </main>
      )}

      {view === 'settings' && (
        <main>
          <button className="back" onClick={() => setView('list')}><ChevronLeft size={16} /> 돌아가기</button>
          <div className="section-title"><div><span>Configuration</span><h1>연결 설정</h1></div></div>
          <div className="settings-form">
            <label>
              <span>n8n Product Draft Base URL</span>
              <input value={settings.n8nBaseUrl} onChange={(event) => setSettings({ ...settings, n8nBaseUrl: event.target.value })} />
            </label>
            <label>
              <span>API Key <em>선택 사항</em></span>
              <input type="password" placeholder="X-Shopee-Draft-Key" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })} />
            </label>
            <button className="primary" onClick={saveConfiguration} disabled={actionLoading || !settings.n8nBaseUrl}>
              <Save size={17} /> 설정 저장
            </button>
          </div>
        </main>
      )}
    </div>
  )
}

function Detail({ label, value, long, warning }: { label: string; value: string; long?: boolean; warning?: boolean }) {
  return <div className={`detail ${long ? 'long' : ''}`}><span>{label}{warning && <CircleAlert size={10} />}</span><p>{value || '-'}</p></div>
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="empty"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>
}

function messageFrom(value: unknown) {
  return value instanceof Error ? value.message : '알 수 없는 오류가 발생했습니다.'
}

export default Popup
