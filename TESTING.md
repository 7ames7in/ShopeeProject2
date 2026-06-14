# 테스트 설정 가이드

Vitest + React Testing Library를 사용한 테스트 설정입니다.

## 설치된 패키지

```
vitest: ^4.1.8              # 테스트 프레임워크
@testing-library/react: ^16.3.2  # React 컴포넌트 테스트
@testing-library/jest-dom: ^6.9.1 # DOM 매처 확장
@testing-library/user-event: ^14.5.2 # 사용자 상호작용 시뮬레이션
jsdom: ^29.1.1              # DOM 환경
@vitest/ui: ^4.1.8          # 테스트 UI 대시보드
```

## 테스트 스크립트

```bash
# 테스트 감시 모드 (변경 시 자동 재실행)
npm run test

# 테스트 UI 대시보드 (브라우저에서 실시간 확인)
npm run test:ui

# 테스트 한 번 실행
npm run test:run

# 커버리지 리포트 포함하여 실행
npm run test:coverage
```

## 설정 파일

### vitest.config.ts
```typescript
- 테스트 환경: jsdom (DOM 시뮬레이션)
- 전역 API 활성화: globals (describe, it, expect 자동 import)
- Setup 파일: src/test/setup.ts
- 커버리지 리포트: text, json, html
```

### src/test/setup.ts
```typescript
- React Testing Library 자동 정리
- window.matchMedia 모킹
- jest-dom 매처 등록
```

## 테스트 작성 예제

### 1. 단위 테스트 (Unit Test)

```typescript
// src/test/example.test.ts
import { describe, it, expect } from 'vitest'

describe('Math Functions', () => {
  it('should add numbers correctly', () => {
    const add = (a: number, b: number) => a + b
    expect(add(2, 3)).toBe(5)
  })

  it('should handle negative numbers', () => {
    const subtract = (a: number, b: number) => a - b
    expect(subtract(5, 3)).toBe(2)
  })
})
```

### 2. 컴포넌트 테스트 (Component Test)

```typescript
// src/test/components.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('Button Component', () => {
  it('should render button with text', () => {
    const TestButton = () => <button>Click me</button>
    render(<TestButton />)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('should handle click event', async () => {
    const handleClick = vi.fn()
    const TestButton = () => <button onClick={handleClick}>Click</button>
    
    render(<TestButton />)
    const user = userEvent.setup()
    
    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalled()
  })
})
```

### 3. 비동기 테스트 (Async Test)

```typescript
import { describe, it, expect, beforeEach } from 'vitest'

describe('API Functions', () => {
  it('should fetch data', async () => {
    const fetchData = async () => {
      const response = await fetch('/api/data')
      return response.json()
    }
    
    const data = await fetchData()
    expect(data).toBeDefined()
  })
})
```

## 일반적인 매처 (Matchers)

```typescript
// 기본
expect(value).toBe(expected)
expect(value).toEqual(expected)
expect(value).toStrictEqual(expected)

// 불린
expect(value).toBeTruthy()
expect(value).toBeFalsy()

// 숫자
expect(number).toBeGreaterThan(3)
expect(number).toBeLessThan(5)
expect(number).toBeCloseTo(0.1)

// 문자열
expect(string).toMatch(/pattern/)
expect(string).toContain('substring')

// 배열/객체
expect(array).toContain('item')
expect(object).toHaveProperty('key')

// DOM
expect(element).toBeInTheDocument()
expect(element).toBeVisible()
expect(element).toBeDisabled()
expect(element).toHaveClass('className')
expect(element).toHaveAttribute('attr', 'value')
```

## 테스트 작성 Best Practices

1. **Arrange-Act-Assert 패턴**
   ```typescript
   it('should update user name', () => {
     // Arrange: 준비
     const user = { name: 'John' }
     
     // Act: 실행
     user.name = 'Jane'
     
     // Assert: 검증
     expect(user.name).toBe('Jane')
   })
   ```

2. **테스트 격리 (Isolation)**
   - 각 테스트는 독립적으로 실행되어야 함
   - beforeEach/afterEach로 상태 초기화

3. **명확한 테스트 이름**
   - "should ~" 형식 사용
   - 테스트의 목적과 기대 결과를 명확하게

4. **한 가지만 테스트**
   - 각 테스트는 하나의 동작만 검증
   - 여러 검증 필요 시 여러 테스트로 분리

## 디렉토리 구조

```
src/
├── test/
│   ├── setup.ts                # 테스트 환경 설정
│   ├── example.test.ts         # 단위 테스트 예제
│   └── components.test.tsx     # 컴포넌트 테스트 예제
├── App.tsx
├── api.ts
└── ...
```

## 커버리지 리포트

```bash
npm run test:coverage
```

생성되는 결과물:
- `coverage/index.html` - HTML 리포트
- `coverage/coverage-final.json` - JSON 데이터

## 주의사항

- 테스트 파일명: `*.test.ts` 또는 `*.test.tsx`
- 테스트는 src/test 디렉토리에 위치하는 것을 권장
- Capacitor 네이티브 API 테스트는 별도 설정 필요

## 더 알아보기

- [Vitest 공식 문서](https://vitest.dev/)
- [React Testing Library 문서](https://testing-library.com/docs/react-testing-library/intro/)
- [Jest DOM 매처](https://github.com/testing-library/jest-dom)
