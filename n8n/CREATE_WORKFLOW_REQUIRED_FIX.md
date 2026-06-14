# n8n Create Product Draft Workflow Required Fix

현재 운영 중인 `Shopee - Create Product Draft from Mobile` 워크플로는 다음 구조입니다.

```text
Webhook - Create Draft
  -> Code - Build Draft SQL + AI Placeholder
  -> PostgreSQL - Insert Draft
  -> Respond - Created Draft
```

이 구조에는 Vision AI와 이미지 저장 단계가 없습니다. 따라서 `AI Generated Shopee Product Draft`, `Uncategorized`, placeholder 설명, `imageUrl: null`이 생성됩니다.

## 필요한 구조

```text
Webhook - Create Draft
  -> Validate Images / Form Fields
  -> Store All Images
  -> Vision AI Product Analysis
  -> Build Draft SQL
  -> PostgreSQL - Insert Draft
  -> Respond - Created Draft
```

## 모바일 요청 형식

- `image`: 첫 번째 대표 이미지. 기존 워크플로 호환용
- `images`: 선택한 모든 이미지. 같은 필드 이름으로 최대 9개 전송
- `imageCount`
- `price`
- `currency`
- `weight`
- `weightUnit`

## 이미지 저장 요구사항

업로드 이미지는 S3, Supabase Storage, Cloudflare R2 등의 영구 저장소에 저장해야 합니다.

PostgreSQL에는 최소한 아래 중 하나를 저장해야 합니다.

```json
{
  "imageUrl": "https://...",
  "imageUrls": ["https://...", "https://..."],
  "storagePath": "products/draft-id/cover.jpg"
}
```

## Vision AI 출력 요구사항

Placeholder Code 노드를 실제 Vision AI 노드로 교체하고 아래 JSON을 반환해야 합니다.

```json
{
  "productName": "Actual product name",
  "categoryPath": "Actual > Category",
  "brand": "No Brand",
  "productDescription": "Actual generated description",
  "shortDescription": "Actual short description",
  "specifications": {}
}
```

## 완료 판정

다음 값이 남아 있으면 실패 Draft로 처리해야 합니다.

- `AI Generated Shopee Product Draft`
- `Uncategorized`
- `placeholder`
- `imageUrl: null` 또는 빈 `imageUrls`
