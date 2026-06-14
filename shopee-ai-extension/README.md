# Shopee AI Draft Helper Chrome Extension

n8n에 저장된 상품 Draft를 Shopee Seller Center 상품 등록 화면에 입력하는 Manifest V3 확장 프로그램입니다.

확장 프로그램은 Shopee의 Save 또는 Publish 버튼을 누르지 않습니다. 자동 입력 후 반드시 사용자가 내용을 확인하고 직접 저장해야 합니다.

## 빌드

```bash
cd "/Users/7ames7in/Documents/Shopee Project 2/shopee-ai-extension"
npm install
npm run build
```

## Chrome에 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위의 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 누릅니다.
4. 아래 폴더를 선택합니다.

```text
/Users/7ames7in/Documents/Shopee Project 2/shopee-ai-extension/dist
```

5. Shopee Seller Center 상품 등록 화면을 새로고침합니다.
6. 확장 프로그램 아이콘을 클릭하고 Draft를 선택합니다.

## 자동 입력 대상

- Product Name
- Product Description
- Global SKU Price
- Weight
- Stock
- Days to ship
- Product Image: Draft 상세 응답에 `imageUrl`, `imageUrls`, `image_url`, `images`, 또는 `storagePath`가 있을 때

Category와 Brand는 팝업에 표시되며 사용자가 Shopee 화면에서 직접 선택합니다.

Shopee는 Category를 선택하기 전까지 Sales Information, Shipping, Others 입력 필드를 만들지 않습니다. Extension은 첫 입력 후 카테고리 선택을 기다리고, 사용자가 카테고리를 선택하면 가격, 무게, 재고, 배송일 입력을 자동으로 재시도합니다.

이미지를 자동 반영하려면 n8n의 Draft 생성 워크플로가 업로드된 이미지를 영구 저장하고, 상세 조회 응답에서 브라우저가 접근 가능한 이미지 URL을 반환해야 합니다. 현재 상세 응답이 `imageUrl: null`, `storagePath: null`이면 Extension은 원본 사진을 가져올 수 없습니다.
