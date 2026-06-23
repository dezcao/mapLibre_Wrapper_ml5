/**
 * MapLibre 래퍼(ml5) 전역 API 타입 선언.
 *
 * 이 라이브러리는 빌드 없이 `<script src>` 로 로드되며 모든 함수를 `window` 전역에 부착한다.
 * 따라서 본 파일은 ESM `export` 가 없는 **ambient(글로벌) 선언**으로, `interface Window` 를
 * 증강해 TypeScript 소비자가 strict 모드에서 `any` 없이 호출할 수 있게 한다.
 *
 * 이 파일은 컴파일 타임 전용 사이드카다 — 브라우저 런타임에는 전혀 로드되지 않으며,
 * nginx 가 함께 서빙해도 `ml5.js` 동작에 영향을 주지 않는다.
 *
 * 소비 방법(글로벌 라이브러리라 `import` 가 없으므로 둘 중 하나):
 *   1) 이 파일을 프로젝트에 포함(`tsconfig.json > include`)하거나 복사해 둔다.
 *   2) 타입 패키지로 배포할 경우 `tsconfig.json > compilerOptions.types` 또는
 *      `/// <reference types="..." />` 로 명시한다.
 */

/** MapLibre 표준 좌표 — `[경도, 위도]` */
type Ml5LngLat = [number, number];

// ── ml5.js · createMap ────────────────────────────────────────────

/** `createMap` 초기화 옵션 */
interface Ml5MapOptions {
  /** `"경도,위도,줌"` 형식 문자열 (기본 `"128,35,5"`) */
  center?: string;
  /** 타일 스타일 프리셋 키(`"dark"`/`"liberty"`) 또는 스타일 JSON URL (기본 `"liberty"`) */
  tile?: string;
}

/** ml5 가 반환하는 MapLibre 맵 인스턴스(사용 표면만 최소 선언) */
interface Ml5Map {
  getContainer(): HTMLElement;
  remove?(): void;
}

// ── ml5line.js · createLineLayer ──────────────────────────────────

/** 선(LineString) 스타일 */
interface Ml5LineStyle {
  /** 선 색상 (기본 `#3B82F6`) */
  color?: string;
  /** 선 두께 px (기본 2) */
  width?: number;
  /** 불투명도 0~1 (기본 1) */
  opacity?: number;
}

/** `createLineLayer` 가 반환하는 선 제어 메서드 묶음 */
interface Ml5LineLayer {
  /** 선 스타일을 등록한다. 좌표는 `lineUpdate` 로 따로 전달한다. */
  lineAdd(lineId: string, style?: Ml5LineStyle): void;
  /** 선의 좌표를 전체 교체한다. */
  lineUpdate(lineId: string, coords: Ml5LngLat[]): void;
  /** 선을 제거한다. */
  lineRemove(lineId: string): void;
  /** 레이어·소스를 맵에서 제거하고 내부 상태를 초기화한다. */
  destroy(): void;
}

// ── ml5icon.js · createIconLayer ──────────────────────────────────

/** 아이콘 이미지 등록 옵션 */
interface Ml5IconImgOptions {
  /** 아이콘 기준 크기 px (기본 32). DPR 자동 적용 */
  size?: number;
}

/** 아이콘 포인트 옵션 */
interface Ml5IconPointOptions {
  /** 회전 각도(도, 시계방향, 기본 0). 지도 북쪽 기준 */
  rotation?: number;
}

/** 배치 입력용 아이콘 엔트리 — `[포인트ID, 좌표, 옵션?]` */
type Ml5IconEntry = [string, Ml5LngLat, Ml5IconPointOptions?];

/** `createIconLayer` 가 반환하는 아이콘 제어 메서드 묶음 */
interface Ml5IconLayer {
  /** SVG 마크업(`<svg ...>`) 또는 이미지 URL 을 맵 스프라이트에 등록한다. */
  iconImgAdd(iconId: string, code: string, opts?: Ml5IconImgOptions): Promise<void>;
  /** 등록된 아이콘 이미지와 해당 포인트를 모두 제거한다. */
  iconImgRemove(iconId: string): void;
  /** 단건 등록 — `iconUpdate(iconId, pointId, [lng, lat], { rotation })` */
  iconUpdate(iconId: string, pointId: string, coords: Ml5LngLat, opts?: Ml5IconPointOptions): void;
  /** 배치 등록 — `iconUpdate(iconId, [[pointId, [lng, lat], { rotation }], ...])` */
  iconUpdate(iconId: string, entries: Ml5IconEntry[]): void;
  /** 아이콘 인스턴스를 제거한다. `pointIdOrIds` 생략 시 해당 `iconId` 전체 제거. */
  iconRemove(iconId: string, pointIdOrIds?: string | string[]): void;
  /** 이벤트 핸들러·레이어·소스를 모두 정리하고 레이어를 파기한다. */
  destroy(): void;
}

// ── ml5circle.js · createCircleLayer ──────────────────────────────

/** 원형 점 스타일 */
interface Ml5CircleStyle {
  /** 원 색상 (기본 `#3B82F6`) */
  color?: string;
  /** 반지름 px (기본 4) */
  radius?: number;
  /** 불투명도 0~1 (기본 1) */
  opacity?: number;
}

/** 배치 입력용 원형 점 엔트리 — `[ID, 좌표, 스타일?]` */
type Ml5CircleEntry = [string, Ml5LngLat, Ml5CircleStyle?];

/** `createCircleLayer` 가 반환하는 원형 점 제어 메서드 묶음 */
interface Ml5CircleLayer {
  /** 단건 등록 — `circleUpdate(id, [lng, lat], { color, radius })` */
  circleUpdate(id: string, coords: Ml5LngLat, style?: Ml5CircleStyle): void;
  /** 배치 등록 — `circleUpdate([[id, [lng, lat], { color }], ...])` */
  circleUpdate(entries: Ml5CircleEntry[]): void;
  /** 원형 점을 제거한다. 생략 시 전체 제거. */
  circleRemove(idOrIds?: string | string[]): void;
  /** 이벤트 핸들러·레이어·소스를 모두 정리하고 레이어를 파기한다. */
  destroy(): void;
}

// ── ml5content.js · createPopupLayer ──────────────────────────────

/** `createPopupLayer` 가 반환하는 팝업 제어 메서드 묶음 */
interface Ml5PopupLayer {
  /** 팝업을 생성하거나 기존 팝업의 위치·콘텐츠를 갱신한다. */
  popupUpdate(id: string, content: HTMLElement | string, coords: Ml5LngLat): void;
  /** 지정한 팝업을 제거하고 `popup-close` 이벤트를 발신한다. */
  popupRemove(id: string): void;
  /** 모든 팝업을 제거하고 레이어를 파기한다. */
  destroy(): void;
}

// ── 커스텀 이벤트 detail (핸들러에서 캐스팅해 사용) ─────────────────
//   예: (e as CustomEvent<Ml5IconEventDetail>).detail

/** `icon-click` / `icon-enter` 이벤트의 `detail` */
interface Ml5IconEventDetail {
  icon: string;
  id: string;
  lngLat: Ml5LngLat;
}

/** `circle-click` / `circle-enter` 이벤트의 `detail` */
interface Ml5CircleEventDetail {
  id: string;
  color: string;
  lngLat: Ml5LngLat;
}

/** `popup-close` 이벤트의 `detail` */
interface Ml5PopupCloseDetail {
  id: string;
}

// ── 전역(window) 증강 ─────────────────────────────────────────────

interface Window {
  /** MapLibre 맵을 초기화하고 `load` 완료 후 인스턴스를 반환한다. (ml5.js) */
  createMap?(el: HTMLElement, opts?: Ml5MapOptions): Promise<Ml5Map>;
  /** 선(LineString) 레이어를 생성한다. (ml5line.js) */
  createLineLayer?(map: Ml5Map): Ml5LineLayer;
  /** 아이콘(심볼) 레이어를 생성한다. (ml5icon.js) */
  createIconLayer?(map: Ml5Map, host?: HTMLElement): Ml5IconLayer;
  /** 원형 점(circle) 레이어를 생성한다. (ml5circle.js) */
  createCircleLayer?(map: Ml5Map, host?: HTMLElement): Ml5CircleLayer;
  /** 팝업 레이어를 생성한다. (ml5content.js) */
  createPopupLayer?(map: Ml5Map, host?: HTMLElement): Ml5PopupLayer;
}
