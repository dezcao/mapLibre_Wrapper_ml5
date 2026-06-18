// @ts-check

(() => {
  /**
   * @typedef {object} LineLayer
   * @property {(lineId: string, style?: LineStyle) => void} lineAdd
   *   선 스타일을 등록한다. 좌표는 `lineUpdate`로 따로 전달한다.
   * @property {(lineId: string, coords: [number,number][]) => void} lineUpdate
   *   선의 좌표를 전체 교체한다.
   * @property {(lineId: string) => void} lineRemove
   *   선을 제거한다.
   * @property {() => void} destroy
   *   레이어·소스를 맵에서 제거하고 내부 상태를 초기화한다.
   */

  /**
   * 선(LineString) 레이어를 생성한다.
   *
   * 스타일은 paint에 고정하지 않고 feature properties로 넘겨 data-driven
   * 표현식(`["get", ...]`)으로 읽는다. GeoJSON 소스 1개 + 레이어 1개로
   * `lineId`마다 색·두께·투명도를 개별 제어한다.
   *
   * @param {maplibregl.Map} map  load 완료된 MapLibre 맵 인스턴스
   * @returns {LineLayer}  선 제어 메서드 묶음
   *
   * @example
   * const lineLayer = createLineLayer(map);
   * lineLayer.lineAdd('route', { color: '#ef4444', width: 3 });
   * lineLayer.lineUpdate('route', [[126.978, 37.566], [129.075, 35.179]]);
   * // 나중에 제거
   * lineLayer.lineRemove('route');
   */
  const createLineLayer = (map) => {
    const _uid = Math.random().toString(36).slice(2, 8);
    const LINE_SOURCE = `ml-lines-${_uid}`;
    const LINE_LAYER = `ml-lines-layer-${_uid}`;

    /**
     * @typedef {object} LineStyle
     * @property {string} [color]   선 색상 (기본 '#3B82F6')
     * @property {number} [width]   선 두께 px (기본 2)
     * @property {number} [opacity] 불투명도 0~1 (기본 1)
     */

    /** @type {Required<LineStyle>} */
    const DEFAULT_STYLE = { color: "#3B82F6", width: 2, opacity: 1 };

    // lineId → { style: Required<LineStyle>, coords: [number,number][] | null }
    const _renderState = new Map();

    // ── 소스/레이어 보장 (최초 1회) ──────────────────────────
    /**
     * GeoJSON 소스와 line 레이어가 없을 때 최초 1회 생성한다.
     * 이미 존재하면 아무 작업도 하지 않는다.
     *
     * @private
     * @returns {void}
     */
    const _ensureLayer = () => {
      if (map.getSource(LINE_SOURCE)) {
        return;
      }
      map.addSource(LINE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: LINE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["get", "width"],
          "line-opacity": ["get", "opacity"],
        },
      });
    };

    /**
     * `_renderState`의 현재 내용을 GeoJSON FeatureCollection으로 변환해
     * 맵 소스에 반영한다. 좌표가 2개 미만인 선은 렌더링에서 제외한다.
     *
     * @private
     * @returns {void}
     */
    const _syncSource = () => {
      const features = [];
      for (const [lineId, { style, coords }] of _renderState.entries()) {
        if (!coords || coords.length < 2) {
          continue; // 점 2개 미만이면 선이 그려지지 않으므로 건너뜀
        }
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { id: lineId, ...style },
        });
      }
      const source = map.getSource(LINE_SOURCE);
      source?.setData({ type: "FeatureCollection", features });
    };

    // ── 선 스타일 등록 ───────────────────────────────────────

    /**
     * 선 스타일을 등록한다. 좌표는 `lineUpdate`로 따로 전달한다.
     * 이미 등록된 `lineId`면 스타일만 덮어쓰고 기존 좌표는 유지한다.
     *
     * @param {string} lineId  선 식별자
     * @param {LineStyle} [style]  스타일 옵션. 생략 시 기본값 적용
     * @returns {void}
     */
    const lineAdd = (lineId, style = {}) => {
      const prev = _renderState.get(lineId);
      _renderState.set(lineId, {
        style: { ...DEFAULT_STYLE, ...style },
        coords: prev?.coords ?? null,
      });
      _ensureLayer();
      _syncSource();
    };

    // ── 선 좌표 갱신 ─────────────────────────────────────────

    /**
     * 선의 좌표를 전체 교체한다.
     * `lineAdd`를 먼저 호출하지 않아도 동작하며, 그 경우 기본 스타일이 적용된다.
     *
     * @param {string} lineId  선 식별자
     * @param {[number, number][]} coords  좌표 배열. 각 원소는 [lng, lat]
     * @returns {void}
     */
    const lineUpdate = (lineId, coords) => {
      if (
          !Array.isArray(coords) ||
          coords.some(
              (c) =>
                  !Array.isArray(c) ||
                  c.length !== 2 ||
                  !Number.isFinite(c[0]) ||
                  !Number.isFinite(c[1]),
          )
      ) {
        console.warn(
            `[map-line] lineUpdate: "${lineId}" 좌표 형식 오류 — 무시 (기대: [[lng, lat], ...])`,
        );
        return;
      }

      const prev = _renderState.get(lineId);
      _renderState.set(lineId, {
        style: prev?.style ?? { ...DEFAULT_STYLE },
        coords,
      });
      _ensureLayer();
      _syncSource();
    };

    // ── 선 제거 ──────────────────────────────────────────────

    /**
     * 지정한 선을 제거하고 맵 소스를 즉시 갱신한다.
     * 존재하지 않는 `lineId`를 전달하면 아무 작업도 하지 않는다.
     *
     * @param {string} lineId  제거할 선의 식별자
     * @returns {void}
     */
    const lineRemove = (lineId) => {
      _renderState.delete(lineId);
      _syncSource();
    };

    // ── 레이어 파기 ──────────────────────────────────────────

    /**
     * 레이어를 완전히 파기한다.
     * 맵에서 line 레이어와 GeoJSON 소스를 제거한 뒤 내부 상태를 초기화한다.
     * `_renderState.clear()`만으로는 맵에 남은 레이어·소스가 정리되지 않으므로
     * 반드시 removeLayer·removeSource까지 수행한다.
     *
     * @returns {void}
     */
    const destroy = () => {
      if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
      if (map.getSource(LINE_SOURCE)) map.removeSource(LINE_SOURCE);
      _renderState.clear();
    };

    return { lineAdd, lineUpdate, lineRemove, destroy };
  };

  window.createLineLayer = createLineLayer;
})();