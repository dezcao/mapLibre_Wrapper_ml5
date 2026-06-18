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
        _maplibre = null;
        reject(e);
      };
      script.onload = () => resolve(window.maplibregl);
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
    const [lng, lat, zoom] = (opts.center ?? "128,35,5").split(",").map(Number);
    const map = new maplibregl.Map({
      container,
      style: TILE_STYLES[opts.tile] ?? opts.tile ?? TILE_STYLES.liberty,
      center: [lng, lat],
      zoom: Number.isFinite(zoom) ? zoom : 5,
      attributionControl: false,
    });
    return new Promise((resolve, reject) => {
      const onLoad = () => {
        map.off("error", onError);
        resolve(map);
      };
      const onError = (e) => {
        map.off("load", onLoad);
        map.remove();
        reject(e.error ?? e);
      };
      map.once("load", onLoad);
      map.once("error", onError);
    });
  };

  window.createMap = createMap;
})();