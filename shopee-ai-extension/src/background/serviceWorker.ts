import type { ExtensionMessage, ImageFetchResponse } from '../types/productDraft'

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('n8nBaseUrl').then((stored) => {
    if (!stored.n8nBaseUrl) {
      return chrome.storage.local.set({
        n8nBaseUrl: 'https://n8n-6txh.srv1651644.hstgr.cloud/webhook/shopee/product-draft',
      })
    }
  })
})

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== 'FETCH_DRAFT_IMAGE') return

  void fetch(message.url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`이미지 다운로드 실패 (${response.status})`)
      const blob = await response.blob()
      const buffer = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (const byte of buffer) binary += String.fromCharCode(byte)
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
      sendResponse({
        success: true,
        dataUrl: `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`,
        fileName: `shopee-product.${extension}`,
      } satisfies ImageFetchResponse)
    })
    .catch((error: unknown) => {
      sendResponse({
        success: false,
        message: error instanceof Error ? error.message : '이미지 다운로드 실패',
      } satisfies ImageFetchResponse)
    })

  return true
})
