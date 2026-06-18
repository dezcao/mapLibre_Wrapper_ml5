# mapLibre Wrapper (ml5)

[MapLibre GL JS](https://maplibre.org)를 얇게 감싼 **바닐라 JavaScript 래퍼**입니다.
빌드 도구나 npm 설치 없이 `<script>` 태그만으로 지도를 띄우고, 그 위에
**선(line) · 아이콘(icon) · 팝업(popup)** 을 ID 기반으로 추가·갱신·제거할 수 있습니다.

- 의존성 설치 없음 — `index.html`을 브라우저로 열기만 하면 됩니다(인터넷 연결 필요).
- 모든 좌표는 `[경도(lng), 위도(lat)]` 순서입니다(MapLibre 규칙).
- 각 레이어는 같은 ID로 다시 호출하면 갱신(upsert)되고, `destroy()`로 정리합니다.

---

## 빠른 시작

```html
<script src="ml5.js"></script>
<script src="ml5line.js"></script>
<script src="ml5icon.js"></script>
<script src="ml5content.js"></script>

<div id="map" style="width: 100%; height: 100vh"></div>

<script>
  (async () => {
    // 1) 지도 생성 (MapLibre는 ml5.js가 CDN에서 자동 로드)
    const map = await createMap(document.getElementById("map"), {
      tile: "https://tiles.openfreemap.org/styles/bright",
    });

    // 2) 선 그리기
    const { lineAdd, lineUpdate } = createLineLayer(map);
    lineAdd("track-001", { color: "#F97316", width: 3 });
    lineUpdate("track-001", [
      [130.2, 36.5],
      [130.6, 35.3],
      [131.0, 35.8],
    ]);

    // 3) 아이콘 표시
    const { iconImgAdd, iconUpdate } = createIconLayer(map);
    await iconImgAdd("pin", "<svg ...>...</svg>", { size: 16 });
    iconUpdate("pin", [["mmsi-001", [130.2, 36.5]]]);

    // 4) 팝업 띄우기
    const { popupUpdate, popupRemove } = createPopupLayer(map);
    popupUpdate("popup-01", "<b>안녕하세요</b>", [131.3, 36.8]);
  })().catch((err) => console.error("[mapLibre]", err));
</script>
```

> 인터넷 연결이 필요합니다. MapLibre 라이브러리(CDN)와 지도 타일(OpenFreeMap)을
> 모두 네트워크에서 내려받기 때문입니다.

---

## 사용 중인 오픈소스 / 출처

| 구분 | 사용 항목 | 버전 | 출처 / 라이선스 |
| --- | --- | --- | --- |
| 지도 렌더러 | **MapLibre GL JS** | 5.13.0 | [maplibre.org](https://maplibre.org) · [GitHub](https://github.com/maplibre/maplibre-gl-js) · BSD 3-Clause |
| 지도 타일 | **OpenFreeMap** | — | [openfreemap.org](https://openfreemap.org) · 무료/오픈 |
| 타일 데이터 | **OpenStreetMap** | — | [openstreetmap.org](https://www.openstreetmap.org) · ODbL |

- **MapLibre GL JS**는 `ml5.js`가 실행 시점에 unpkg CDN에서 동적으로 불러옵니다.
  - JS: `https://unpkg.com/maplibre-gl@5.13.0/dist/maplibre-gl.js`
  - CSS: `https://unpkg.com/maplibre-gl@5.13.0/dist/maplibre-gl.css`
- **타일 스타일**은 `opts.tile`로 지정합니다. 코드에 **내장된 프리셋은 두 개**이며,
  그 외에는 **원하는 스타일 JSON URL을 직접 넣으면 됩니다**(자기 타일 서버 포함).
  - `dark` — 내장 프리셋. `https://tiles.openfreemap.org/styles/dark`
  - `liberty` — 내장 프리셋(**기본값**). `https://tiles.openfreemap.org/styles/liberty`
  - 그 외 → 넘긴 문자열을 그대로 스타일 URL로 사용. 예: `index.html`은 프리셋이 아닌
    `https://tiles.openfreemap.org/styles/bright`(OpenFreeMap의 bright 스타일) URL을 직접 넣어 씁니다.

---

## 파일 구성과 역할

| 파일 | 전역 함수 | 역할 |
| --- | --- | --- |
| `ml5.js` | `createMap(container, opts)` | MapLibre를 CDN에서 동적 로드(싱글턴)하고 지도를 초기화한다. 타일 프리셋(`dark`/`liberty`)·커스텀 스타일 URL 지원, 기본 중심 좌표 `128,35,5`(경도,위도,줌). |
| `ml5line.js` | `createLineLayer(map)` | 선(LineString) 레이어. 색·두께·투명도는 data-driven 스타일로 처리하며, GeoJSON 소스 1개 + 레이어 1개로 여러 선을 관리한다. |
| `ml5icon.js` | `createIconLayer(map, host?)` | 아이콘(symbol) 레이어. SVG 또는 이미지 URL을 등록해 표시하고, 클릭·호버를 커스텀 이벤트로 알린다. |
| `ml5content.js` | `createPopupLayer(map, host?)` | 좌표에 앵커된 팝업 레이어. DOM 요소나 HTML 문자열을 띄우고 닫기 동작을 호출자에게 위임한다. |
| `index.html` | — | 위 네 스크립트를 로드하고 전체 기능을 시연하는 예제 페이지. |

> 네 레이어 모두 `destroy()`를 제공해, 등록한 이벤트·레이어·소스를 한 번에 정리할 수 있습니다.

---

## index.html에서 사용하는 각 JS 설명

`index.html`의 `<head>`는 아래 네 스크립트를 **순서대로** 불러옵니다.
(`ml5.js`가 가장 먼저 와서 지도와 MapLibre 로더를 준비합니다.)

1. **`ml5.js`** — 가장 먼저 로드. `createMap()`을 전역에 등록한다. 호출되면 MapLibre GL JS
   라이브러리를 CDN에서 자동으로 내려받은 뒤 지도를 만들고, 지도의 `load`가 끝나면
   지도 인스턴스를 돌려준다. 나머지 레이어 함수들은 이 지도 인스턴스를 인자로 받는다.
2. **`ml5line.js`** — `createLineLayer()`를 전역에 등록. 지도 위에 경로/궤적 같은 선을 그린다.
3. **`ml5icon.js`** — `createIconLayer()`를 전역에 등록. 지도 위에 마커/심볼 아이콘을 찍고
   클릭·마우스오버 이벤트를 받을 수 있게 한다.
4. **`ml5content.js`** — `createPopupLayer()`를 전역에 등록. 특정 좌표에 정보 팝업을 띄운다.

페이지 하단 `<script>`는 이 함수들을 실제로 쓰는 흐름을 보여줍니다.

1. `createMap(...)` 으로 `bright` 스타일 지도를 생성한다.
2. `createLineLayer(map)` → `lineAdd` + `lineUpdate` 로 주황색 선을 그린다.
3. `createIconLayer(map)` → `iconImgAdd` 로 SVG 아이콘 2종을 등록하고, `iconUpdate` 로
   각 좌표에 선박 아이콘을 찍는다.
4. `createPopupLayer(map)` → `popupUpdate` 로 닫기 버튼이 포함된 팝업을 띄운다.
5. 지도 컨테이너에서 `icon-click` 이벤트를 수신해, 클릭된 아이콘 위치에 팝업을 띄운다.

---

## API 요약

### `createMap(container, opts?) → Promise<Map>`

지도를 초기화하고 `load` 완료 후 MapLibre `Map` 인스턴스를 반환한다.

- `container` — 지도를 렌더링할 DOM 요소
- `opts.center` — `'경도,위도,줌'` 문자열 (기본 `'128,35,5'`)
- `opts.tile` — 프리셋 키(`'dark'` | `'liberty'`) 또는 스타일 JSON URL (기본 `'liberty'`)

### `createLineLayer(map) → { lineAdd, lineUpdate, lineRemove, destroy }`

| 메서드 | 설명 |
| --- | --- |
| `lineAdd(lineId, style?)` | 선 스타일 등록. `style = { color?, width?, opacity? }` (기본 `#3B82F6` / `2` / `1`). |
| `lineUpdate(lineId, coords)` | 좌표 전체 교체. `coords = [[lng, lat], ...]`. 형식이 잘못되면 경고 후 무시한다. |
| `lineRemove(lineId)` | 해당 선 제거. |
| `destroy()` | 레이어·소스를 지도에서 제거하고 내부 상태 초기화. |

### `createIconLayer(map, host?) → { iconImgAdd, iconImgRemove, iconUpdate, iconRemove, destroy }`

`host`는 커스텀 이벤트를 발신할 요소(기본: 지도 컨테이너).

| 메서드 | 설명 |
| --- | --- |
| `iconImgAdd(iconId, code, opts?)` | 아이콘 이미지를 등록(async). `code`에 `<svg`가 있으면 SVG를 캔버스로 래스터라이즈하고, 그 외에는 이미지 URL로 간주해 `fetch`로 받는다. `opts.size` 기본 `32`(DPR 자동 적용). |
| `iconImgRemove(iconId)` | 등록한 이미지와 해당 아이콘의 모든 포인트 제거. |
| `iconUpdate(iconId, entriesOrId, coords?)` | 아이콘 인스턴스 추가/갱신. 단건 `iconUpdate(id, 'pointId', [lng, lat])` 또는 배치 `iconUpdate(id, [['pointId', [lng, lat]], ...])`. |
| `iconRemove(iconId, pointIdOrIds?)` | 인스턴스 제거. ID 생략 시 해당 아이콘 전체 제거. |
| `destroy()` | 이벤트 핸들러·레이어·소스 정리. |

발신 이벤트 (`host`에서 발생):

- `icon-click` — `detail: { icon, id, lngLat: [lng, lat] }`
- `icon-enter` — `detail: { icon, id, lngLat: [lng, lat] }`
- `icon-leave` — (detail 없음)

### `createPopupLayer(map, host?) → { popupUpdate, popupRemove, destroy }`

| 메서드 | 설명 |
| --- | --- |
| `popupUpdate(id, content, coords)` | 팝업 생성 또는 갱신. `content`는 `HTMLElement` 또는 HTML 문자열, `coords = [lng, lat]`. 같은 `id`면 위치·내용만 갱신. |
| `popupRemove(id)` | 팝업 닫기. `popup-close` 이벤트가 뒤따른다. |
| `destroy()` | 모든 팝업 제거 및 상태 초기화. |

발신 이벤트: `popup-close` — `detail: { id }`

> 팝업은 기본 닫기 버튼이 없습니다. 닫기 UI는 콘텐츠에 직접 넣고, 그 버튼에서
> `popupRemove(id)`를 호출하세요(예제 참고).

---

## 참고 / 주의

- **인터넷 연결 필요** — MapLibre 라이브러리(CDN)와 지도 타일(OpenFreeMap)을 네트워크에서 받습니다.
- **좌표 순서** — 모든 좌표는 `[경도(lng), 위도(lat)]` 입니다.
- **ID 기반 동작** — `*Add` / `*Update` 는 같은 ID로 다시 호출하면 덮어씁니다(upsert).
- **정리** — 레이어를 더 이상 쓰지 않을 때는 각 레이어의 `destroy()`를 호출하세요.
