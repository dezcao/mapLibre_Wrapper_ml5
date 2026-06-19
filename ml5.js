// @ts-check

(() => {
  if (typeof window === "undefined") {
    return;
  }

  const MAPLIBRE_VERSION = "5.13.0";
  const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
  const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

  /**
   * 내장 타일 스타일 프리셋.
   * @type {{ dark: string, liberty: string }}
   */
  const TILE_STYLES = {
    dark: "https://tiles.openfreemap.org/styles/dark",
    liberty: "https://tiles.openfreemap.org/styles/liberty",
  };

  /**
   * @typedef {object} CreateMapOptions
   * @property {string} [center]  중심 좌표 및 줌. 'lng,lat,zoom' 형식 (기본 '128,35,5')
   * @property {string} [tile]    타일 스타일. TILE_STYLES 키('dark'|'liberty') 또는 스타일 JSON URL (기본 'liberty')
   */

  // ── MapLibre 로드 (전역 싱글턴) ───────────────────────────────
  /** @type {Promise<typeof maplibregl> | null} */
  let _maplibre = null;

  /**
   * MapLibre GL JS 라이브러리를 CDN에서 동적으로 로드한다.
   * 최초 호출 시 `<script>`·`<link>`를 삽입하며, 이후 호출은 동일 Promise를 반환한다.
   *
   * @returns {Promise<typeof maplibregl>} 로드 완료된 maplibregl 네임스페이스
   */
  const loadMaplibre = () => {
    if (_maplibre) {
      return _maplibre;
    }
    _maplibre = new Promise((resolve, reject) => {
      if (window.maplibregl) {
        return resolve(window.maplibregl);
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPLIBRE_CSS;
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = MAPLIBRE_JS;
      script.onerror = (e) => {
        // 실패한 태그를 제거해 재시도 시 <link>·<script>가 누적되지 않게 한다.
        link.remove();
        script.remove();
        _maplibre = null;
        reject(e);
      };
      script.onload = () => {
        // HTTP 200이어도 전역이 설정되지 않을 수 있다(엉뚱한 응답·CSP 차단 등).
        // 그대로 resolve(undefined)하면 이후 new maplibregl.Map(...)에서 모호하게 터지고
        // 싱글턴이 영구 오염되므로, 전역 부재 시 태그를 정리하고 명확히 reject한다.
        if (window.maplibregl) {
          resolve(window.maplibregl);
        } else {
          link.remove();
          script.remove();
          _maplibre = null;
          reject(new Error("maplibregl 전역이 로드되지 않음"));
        }
      };
      document.head.appendChild(script);
    });
    return _maplibre;
  };

  /**
   * MapLibre 맵을 초기화하고 `load` 이벤트 완료 후 맵 인스턴스를 반환한다.
   * MapLibre GL JS 라이브러리가 없으면 자동으로 CDN에서 로드한다.
   *
   * @param {HTMLElement} container  맵을 렌더링할 DOM 요소
   * @param {CreateMapOptions} [opts]  초기화 옵션
   * @returns {Promise<maplibregl.Map>}  load 완료된 맵 인스턴스
   * @throws {Error}  타일 스타일 로드 실패 또는 WebGL 초기화 오류 시
   *
   * @example
   * const map = await createMap(document.getElementById('map'), {
   *   center: '126.978,37.566,12',
   *   tile: 'liberty',
   * });
   */
  const createMap = async (container, opts = {}) => {
    const maplibregl = await loadMaplibre();
    // 'lng,lat,zoom' 파싱. 잘못된/누락된 값은 각 기본값으로 흡수한다(부분 입력에도 안전).
    const parts = (opts.center ?? "128,35,5").split(",").map(Number);
    const lng = Number.isFinite(parts[0]) ? parts[0] : 128;
    const lat = Number.isFinite(parts[1]) ? parts[1] : 35;
    const zoom = Number.isFinite(parts[2]) ? parts[2] : 5;
    const map = new maplibregl.Map({
      container,
      style: TILE_STYLES[opts.tile] ?? opts.tile ?? TILE_STYLES.liberty,
      center: [lng, lat],
      zoom,
      attributionControl: false,
    });
    return new Promise((resolve, reject) => {
      const onLoad = () => {
        map.off("error", onError);
        resolve(map);
      };
      // 타일·소스·글리프·스프라이트 실패 같은 비치명적 error는 load를 막지 않으므로
      // 경고만 남기고 맵을 유지한다. 스타일 문서 자체가 로드되지 못한 상태(스타일 미로드
      // + 소스 무관)의 error만 치명으로 보고 맵을 파기·reject한다.
      const onError = (e) => {
        if (e?.sourceId || map.isStyleLoaded()) {
          console.warn("[mapLibre] 비치명적 맵 오류 — 무시", e?.error ?? e);
          return;
        }
        map.off("load", onLoad);
        map.off("error", onError);
        map.remove();
        reject(e?.error ?? e);
      };
      map.once("load", onLoad);
      map.on("error", onError);
    });
  };

  window.createMap = createMap;
})();