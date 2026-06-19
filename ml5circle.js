// @ts-check

(() => {
  /**
   * @typedef {object} CircleStyle
   * @property {string} [color]    원 색상 (기본 '#3B82F6')
   * @property {number} [radius]   반지름 px (기본 4)
   * @property {number} [opacity]  불투명도 0~1 (기본 1)
   */

  /**
   * @typedef {object} CircleLayer
   * @property {(idOrEntries: string | Array<[string,[number,number],CircleStyle?]>, coords?: [number,number], style?: CircleStyle) => void} circleUpdate
   *   원형 점을 추가하거나 좌표·스타일을 갱신한다(단건/배치).
   * @property {(idOrIds?: string|string[]) => void} circleRemove
   *   원형 점을 제거한다. 생략 시 전체 제거.
   * @property {() => void} destroy
   *   이벤트 핸들러·레이어·소스를 모두 정리하고 레이어를 파기한다.
   */

  /**
   * 원형 점(circle) 레이어를 생성한다.
   *
   * GeoJSON 소스 1개 + circle 레이어 1개로 다수의 점을 표시한다. 색·반지름·투명도는
   * paint에 고정하지 않고 feature properties로 넘겨 data-driven 표현식(`["get", ...]`)으로
   * 읽으므로, 점마다 색을 달리해도 이미지 등록이 필요 없다. 수천~수만 개의 단순 점을
   * 가볍게 그릴 때 적합하다(symbol 아이콘 대비 CPU 전처리가 적다).
   *
   * 클릭·호버 판정을 키우기 위해 표시용 레이어 위에 투명한 hit 레이어(반지름 + 6px)를
   * 깔고, 거기서 인터랙션을 받아 커스텀 이벤트로 호스트 요소에 위임한다.
   *
   * @param {maplibregl.Map} map  load 완료된 MapLibre 맵 인스턴스
   * @param {HTMLElement} [host]  커스텀 이벤트 발신 대상 요소 (기본: 맵 컨테이너)
   * @returns {CircleLayer}  원형 점 제어 메서드 묶음
   * @fires circle-click  점 클릭 시 `host`에서 발생.
   *   `detail: { id: string, color: string, lngLat: [number,number] }`
   * @fires circle-enter  마우스가 점 위로 진입할 때 발생.
   *   `detail: { id: string, color: string, lngLat: [number,number] }`
   * @fires circle-leave  마우스가 점 밖으로 벗어날 때 발생.
   *
   * @example
   * const circleLayer = createCircleLayer(map);
   * circleLayer.circleUpdate([
   *   ['v-1', [129.0, 35.1], { color: '#22c55e', radius: 3 }],
   *   ['v-2', [130.2, 34.7], { color: '#ef4444', radius: 3 }],
   * ]);
   * map.getContainer().addEventListener('circle-click', (e) => console.log(e.detail));
   */
  const createCircleLayer = (map, host = map.getContainer()) => {
    const _uid = Math.random().toString(36).slice(2, 8);
    const CIRCLE_SOURCE = `ml-circles-${_uid}`;
    const CIRCLE_LAYER = `ml-circles-layer-${_uid}`;
    const CIRCLE_HIT = `ml-circles-hit-${_uid}`;

    /** @type {Required<CircleStyle>} */
    const DEFAULT_STYLE = { color: "#3B82F6", radius: 4, opacity: 1 };

    // id → { coords: [lon, lat], color, radius, opacity }
    const _renderState = new Map();

    /**
     * 좌표가 유효한 `[lng, lat]` 쌍인지 검사한다.
     * @private
     * @param {unknown} c
     * @returns {boolean}
     */
    const _isValidCoord = (c) =>
        Array.isArray(c) &&
        c.length === 2 &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]);

    // teardown 위해 저장
    let _onClick, _onEnter, _onLeave;

    /**
     * GeoJSON 소스와 circle 레이어(표시용 + 투명 hit용)를 최초 1회 생성하고
     * click·mouseenter·mouseleave 핸들러를 hit 레이어에 등록한다.
     *
     * @private
     * @returns {void}
     */
    const _ensureLayer = () => {
      if (map.getSource(CIRCLE_SOURCE)) return;
      map.addSource(CIRCLE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: CIRCLE_LAYER,
        type: "circle",
        source: CIRCLE_SOURCE,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["get", "radius"],
          "circle-opacity": ["get", "opacity"],
          "circle-stroke-color": "#353535",
          "circle-stroke-width": 0.5,
          "circle-stroke-opacity": 0.6,
        },
      });
      // 클릭·호버 판정을 키우는 투명 레이어 (반지름 + 6px)
      map.addLayer({
        id: CIRCLE_HIT,
        type: "circle",
        source: CIRCLE_SOURCE,
        paint: {
          "circle-radius": ["+", ["get", "radius"], 6],
          "circle-color": "rgba(0,0,0,0)",
        },
      });

      _onClick = (e) => {
        const f = e.features?.[0];
        if (!f) return;
        host.dispatchEvent(new CustomEvent("circle-click", {
          detail: { id: f.properties.id, color: f.properties.color, lngLat: [e.lngLat.lng, e.lngLat.lat] },
          bubbles: true,
        }));
      };
      _onEnter = (e) => {
        const canvas = map.getCanvas();
        if (canvas) canvas.style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        host.dispatchEvent(new CustomEvent("circle-enter", {
          detail: { id: f.properties.id, color: f.properties.color, lngLat: [e.lngLat.lng, e.lngLat.lat] },
          bubbles: true,
        }));
      };
      _onLeave = () => {
        const canvas = map.getCanvas();
        if (canvas) canvas.style.cursor = "";
        host.dispatchEvent(new CustomEvent("circle-leave", { bubbles: true }));
      };

      map.on("click",      CIRCLE_HIT, _onClick);
      map.on("mouseenter", CIRCLE_HIT, _onEnter);
      map.on("mouseleave", CIRCLE_HIT, _onLeave);
    };

    /**
     * `_renderState`의 현재 내용을 GeoJSON FeatureCollection으로 변환해
     * 맵 소스에 반영한다. 각 점은 `id`·`color`·`radius`·`opacity` 프로퍼티를 가진다.
     *
     * @private
     * @returns {void}
     */
    const _syncSource = () => {
      const source = map.getSource(CIRCLE_SOURCE);
      const features = [];
      for (const [id, pt] of _renderState.entries()) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: pt.coords },
          properties: { id, color: pt.color, radius: pt.radius, opacity: pt.opacity },
        });
      }
      source?.setData({ type: "FeatureCollection", features });
    };

    /**
     * 점 하나를 `_renderState`에 등록(또는 갱신)한다.
     * @private
     * @param {string} id
     * @param {[number,number]} coords
     * @param {CircleStyle} [style]
     * @returns {boolean}  좌표가 유효해 등록됐으면 true
     */
    const _set = (id, coords, style = {}) => {
      if (!_isValidCoord(coords)) {
        console.warn(`[map-circle] circleUpdate: "${id}" 좌표 형식 오류 — 건너뜀 (기대: [lng, lat])`);
        return false;
      }
      const merged = { ...DEFAULT_STYLE, ..._renderState.get(id), ...style };
      _renderState.set(id, { coords, color: merged.color, radius: merged.radius, opacity: merged.opacity });
      return true;
    };

    /**
     * 원형 점을 추가하거나 좌표·스타일을 갱신한다. 단건/배치 두 가지 시그니처를 지원한다.
     *
     * - 단건: `circleUpdate('id', [lng, lat], { color, radius, opacity })`
     * - 배치: `circleUpdate([ ['id', [lng, lat], { color }], ... ])`
     *
     * 같은 `id`로 다시 호출하면 갱신(upsert)된다.
     *
     * @param {string | Array<[string, [number,number], CircleStyle?]>} idOrEntries
     * @param {[number, number]} [coords]  단건 입력 시 좌표 [lng, lat]
     * @param {CircleStyle} [style]  단건 입력 시 스타일
     * @returns {void}
     */
    const circleUpdate = (idOrEntries, coords, style) => {
      _ensureLayer();
      if (Array.isArray(idOrEntries)) {
        for (const [id, coord, entryStyle] of idOrEntries) {
          _set(id, coord, entryStyle);
        }
      } else {
        if (!_set(idOrEntries, /** @type {[number,number]} */ (coords), style)) return;
      }
      _syncSource();
    };

    /**
     * 원형 점을 제거한다.
     *
     * - 전체 제거: `circleRemove()`
     * - 단건 제거: `circleRemove('id')`
     * - 복수 제거: `circleRemove(['id1', 'id2'])`
     *
     * @param {string | string[]} [idOrIds]
     * @returns {void}
     */
    const circleRemove = (idOrIds) => {
      if (idOrIds === undefined) {
        _renderState.clear();
        _syncSource();
        return;
      }
      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      for (const id of ids) _renderState.delete(id);
      _syncSource();
    };

    /**
     * 레이어를 완전히 파기한다.
     * 이벤트 핸들러를 해제하고, 표시·hit 레이어와 GeoJSON 소스를 제거한 뒤 상태를 초기화한다.
     *
     * @returns {void}
     */
    const destroy = () => {
      if (_onClick) map.off("click",      CIRCLE_HIT, _onClick);
      if (_onEnter) map.off("mouseenter", CIRCLE_HIT, _onEnter);
      if (_onLeave) map.off("mouseleave", CIRCLE_HIT, _onLeave);
      if (map.getLayer(CIRCLE_HIT)) map.removeLayer(CIRCLE_HIT);
      if (map.getLayer(CIRCLE_LAYER)) map.removeLayer(CIRCLE_LAYER);
      if (map.getSource(CIRCLE_SOURCE)) map.removeSource(CIRCLE_SOURCE);
      _renderState.clear();
    };

    return { circleUpdate, circleRemove, destroy };
  };

  window.createCircleLayer = createCircleLayer;
})();
