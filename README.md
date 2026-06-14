# Shopee AI Draft Creator

모바일에서 상품 사진, 브랜드, 가격, 무게를 입력해 n8n으로 전송하고 AI가 생성한 Shopee 상품 Draft를 확인하는 웹앱입니다.

## 실행 방법

Node.js 18 이상이 필요합니다.

```bash
cd "/Users/7ames7in/Documents/Shopee Project 2"
npm install
npm run dev
```

터미널에 표시되는 주소를 브라우저에서 엽니다. 같은 Wi-Fi에 연결된 스마트폰에서 접속하려면 아래처럼 실행합니다.

```bash
npm run dev -- --host 0.0.0.0
```

그 다음 스마트폰에서 `http://컴퓨터의-로컬-IP:5173`으로 접속합니다.

## 프로덕션 빌드

```bash
npm run build
npm run preview -- --host 0.0.0.0
```

## 연결된 Webhook

- `POST /webhook/shopee/product-draft/create`
- `GET /webhook/shopee/product-draft/list`
- `GET /webhook/shopee/product-draft/detail?draftId=...`
- `POST /webhook/shopee/product-draft/mark-used`

Create 요청에는 사용자가 선택한 `brand`가 포함됩니다. n8n 생성 워크플로는 이 값을 Draft의 Brand로 PostgreSQL에 저장해야 Chrome Extension에서 자동 선택할 수 있습니다.

## Chrome Extension

PC Shopee Seller Center 자동 입력 도우미는 `shopee-ai-extension` 폴더에 있습니다.

```bash
cd "/Users/7ames7in/Documents/Shopee Project 2/shopee-ai-extension"
npm install
npm run build
```

빌드 후 Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 `shopee-ai-extension/dist` 폴더를 압축 해제된 확장 프로그램으로 로드합니다.
