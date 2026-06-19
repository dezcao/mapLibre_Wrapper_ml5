// @ts-check

(() => {
  // ── SVG → ImageData ──────────────────────────────────────────
  /**
   * SVG 마크업 문자열을 캔버스로 래스터라이즈해 `ImageData`로 변환한다.
   * DPR(devicePixelRatio)을 적용하므로 고해상도 디스플레이에서도 선명하게 렌더링된다.
   *
   * @param {string} svgCode  렌더링할 SVG 마크업 문자열 (`<svg ...>...</svg>`)
   * @param {number} size     논리적 아이콘 크기(px). 실제 픽셀은 `size * dpr`
   * @param {number} dpr      기기 픽셀 밀도 (`window.devicePixelRatio`)
   * @param {number} [ms]      디코드 타임아웃 ms (기본 5000). blob URL이라 거의 발생하지 않지만 안전장치로 둔다
   * @returns {Promise<ImageData>}  MapLibre `addImage`에 전달할 `ImageData`
   */
  const svgToImageData = (svgCode, size, dpr, ms = 5000) => {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgCode], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      const cleanup = () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      };
      const timer = setTimeout(() => {
        cleanup();
        img.src = ""; // in-flight 디코드 중단
        reject(new Error("svg 래스터라이즈 타임아웃"));
      }, ms);

      img.onload = () => {
        cleanup();
        const px = size * dpr;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = px;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("2d 컨텍스트를 가져오지 못함"));
          return;
        }
        ctx.drawImage(img, 0, 0, px, px);
        resolve(ctx.getImageData(0, 0, px, px));
      };
      img.onerror = (e) => {
        cleanup();
        reject(e);
      };
      img.src = url;
    });
  };

  /**
   * 이미지 URL을 fetch로 받아 `ImageBitmap`으로 디코드한다.
   * `AbortController` + 타임아웃으로, TCP 연결은 맺되 응답을 내보내지 않는
   * hanging 서버(Electron·WebView·기업 프록시 환경에서 발생)에 대비해
   * in-flight 요청을 명시적으로 취소한다. `Image.src`와 달리 소켓까지 끊어진다.
   *
   * @param {string} url  이미지 URL (http(s)/data/blob)
   * @param {number} [ms]  타임아웃 ms (기본 5000)
   * @param {number} [px]  목표 픽셀 크기(정사각형). 주어지면 해당 크기로 리사이즈한다.
   *   SVG 경로와 동일하게 `size * dpr`을 넘기면 `addImage`의 `pixelRatio: dpr`과 맞물려
   *   논리 크기가 `size`로 수렴한다. 생략 시 원본 해상도 그대로 디코드한다.
   * @returns {Promise<ImageBitmap>}  MapLibre `addImage`에 전달할 비트맵
   */
  const loadImageBitmapFromUrl = async (url, ms = 5000, px) => {
    const ctrl = new AbortController();
    const timer = setTimeout(
        () => ctrl.abort(new DOMException("이미지 로드 타임아웃", "TimeoutError")),
        ms,
    );
    try {
      // mode 'cors'(기본): 교차 출처 이미지는 CORS 헤더가 있어야 디코드된다(taint 방지)
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) {
        throw new Error(`이미지 로드 실패: HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      return Number.isFinite(px) && px > 0
          ? await createImageBitmap(blob, {
            resizeWidth: px,
            resizeHeight: px,
            resizeQuality: "high",
          })
          : await createImageBitmap(blob);
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * @typedef {object} IconImgOptions
   * @property {number} [size]  아이콘 기준 크기 px (기본 32). DPR이 자동 적용됨
   */

  /**
   * @typedef {object} IconLayer
   * @property {(iconId: string, code: string, opts?: IconImgOptions) => Promise<void>} iconImgAdd
   *   SVG 또는 이미지 URL을 맵 스프라이트에 등록한다.
   * @property {(iconId: string) => void} iconImgRemove
   *   등록된 아이콘 이미지와 해당 포인트를 모두 제거한다.
   * @property {(iconId: string, entriesOrId: Array<[string,[number,number]]>|string, coords?: [number,number]) => void} iconUpdate
   *   맵 위에 아이콘 인스턴스를 추가하거나 좌표를 갱신한다.
   * @property {(iconId: string, pointIdOrIds?: string|string[]) => void} iconRemove
   *   아이콘 인스턴스를 제거한다. `pointIdOrIds` 생략 시 해당 `iconId` 전체 제거.
   * @property {() => void} destroy
   *   이벤트 핸들러·레이어·소스를 모두 정리하고 레이어를 파기한다.
   */

  /**
   * 아이콘(심볼) 레이어를 생성한다.
   * GeoJSON 소스 1개 + symbol 레이어 1개로 여러 종류의 아이콘을 표시하며,
   * 클릭·호버 인터랙션을 커스텀 이벤트로 호스트 요소에 위임한다.
   *
   * @param {maplibregl.Map} map  load 완료된 MapLibre 맵 인스턴스
   * @param {HTMLElement} [host]  커스텀 이벤트 발신 대상 요소 (기본: 맵 컨테이너)
   * @returns {IconLayer}  아이콘 제어 메서드 묶음
   * @fires icon-click   아이콘 클릭 시 `host`에서 발생.
   *   `detail: { icon: string, id: string, lngLat: [number,number] }`
   * @fires icon-enter   마우스가 아이콘 위로 진입할 때 발생.
   *   `detail: { icon: string, id: string, lngLat: [number,number] }`
   * @fires icon-leave   마우스가 아이콘 밖으로 벗어날 때 발생.
   *
   * @example
   * const iconLayer = createIconLayer(map);
   * await iconLayer.iconImgAdd('pin', '<svg>...</svg>', { size: 40 });
   * iconLayer.iconUpdate('pin', 'seoul', [126.978, 37.566]);
   * map.getContainer().addEventListener('icon-click', (e) => console.log(e.detail));
   */
  const createIconLayer = (map, host = map.getContainer()) => {
    const _uid = Math.random().toString(36).slice(2, 8);
    const ICON_SOURCE = `ml-icons-${_uid}`;
    const ICON_LAYER = `ml-icons-layer-${_uid}`;

    // iconId → Map<pointId, [lon, lat]>
    const _renderState = new Map();

    /**
     * 좌표가 유효한 `[lng, lat]` 쌍인지 검사한다.
     * `lineUpdate`(ml5line.js)의 검증과 동일한 규칙을 사용한다.
     *
     * @private
     * @param {unknown} c  검사할 값
     * @returns {boolean}  길이 2의 유한수 배열이면 true
     */
    const _isValidCoord = (c) =>
        Array.isArray(c) &&
        c.length === 2 &&
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]);

    // teardown 위해 저장
    let _onClick, _onEnter, _onLeave;

    /**
     * GeoJSON 소스와 symbol 레이어가 없을 때 최초 1회 생성하고
     * click·mouseenter·mouseleave 이벤트 핸들러를 등록한다.
     *
     * @private
     * @returns {void}
     */
    const _ensureLayer = () => {
      if (map.getSource(ICON_SOURCE)) return;
      map.addSource(ICON_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: ICON_LAYER, type: "symbol", source: ICON_SOURCE,
        layout: { "icon-image": ["get", "icon"], "icon-size": 1, "icon-allow-overlap": true },
      });

      _onClick = (e) => {
        const f = e.features?.[0];
        if (!f) return;
        host.dispatchEvent(new CustomEvent("icon-click", {
          detail: { icon: f.properties.icon, id: f.properties.id, lngLat: [e.lngLat.lng, e.lngLat.lat] },
          bubbles: true,
        }));
      };
      _onEnter = (e) => {
        const canvas = map.getCanvas();
        if (canvas) canvas.style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        host.dispatchEvent(new CustomEvent("icon-enter", {
          detail: { icon: f.properties.icon, id: f.properties.id, lngLat: [e.lngLat.lng, e.lngLat.lat] },
          bubbles: true,
        }));
      };
      _onLeave = () => {
        const canvas = map.getCanvas();
        if (canvas) canvas.style.cursor = "";
        host.dispatchEvent(new CustomEvent("icon-leave", { bubbles: true }));
      };

      map.on("click",      ICON_LAYER, _onClick);
      map.on("mouseenter", ICON_LAYER, _onEnter);
      map.on("mouseleave", ICON_LAYER, _onLeave);
    };


    /**
     * `_renderState`의 현재 내용을 GeoJSON FeatureCollection으로 변환해
     * 맵 소스에 반영한다. 각 포인트는 `icon`·`id` 프로퍼티를 가진 Point Feature가 된다.
     *
     * @private
     * @returns {void}
     */
    const _syncSource = () => {
      const source = map.getSource(ICON_SOURCE);
      const features = [];
      for (const [iconId, points] of _renderState.entries()) {
        for (const [pointId, coords] of points.entries()) {
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: coords },
            properties: { icon: iconId, id: pointId },
          });
        }
      }
      source?.setData({ type: "FeatureCollection", features });
    };

    // ── 아이콘 이미지 등록 / 제거 ────────────────────────────

    /**
     * 아이콘 이미지를 맵 스프라이트에 등록한다.
     * `code`에 `<svg` 태그가 있으면 SVG 마크업으로 간주해 캔버스로 래스터라이즈하고,
     * 그 외에는 이미지 URL로 처리한다(fetch+AbortController로 타임아웃·취소 지원).
     * 이미 등록된 `iconId`면 교체한다.
     *
     * @param {string} iconId  맵 스프라이트에서 사용할 아이콘 식별자
     * @param {string} code    SVG 마크업(`<svg ...>`) 또는 이미지 URL
     * @param {IconImgOptions} [opts]  크기 옵션
     * @returns {Promise<void>}  이미지 로드 및 등록 완료 시 이행
     */
    const iconImgAdd = async (iconId, code, opts = {}) => {
      const dpr = window.devicePixelRatio || 1;
      const size = opts.size ?? 32;

      const imageData = /<svg[\s>]/i.test(code.trimStart())
          ? await svgToImageData(code, size, dpr)
          : await loadImageBitmapFromUrl(code, 5000, size * dpr);

      if (map.hasImage(iconId)) {
        map.removeImage(iconId);
      }
      map.addImage(iconId, imageData, { pixelRatio: dpr });

      // ImageBitmap은 addImage가 데이터를 복사한 뒤 즉시 해제해 메모리 점유를 줄인다
      if (typeof imageData.close === "function") {
        imageData.close();
      }
    };

    /**
     * 등록된 아이콘 이미지와 해당 `iconId`의 모든 포인트를 제거한다.
     * 맵 스프라이트에서도 이미지를 삭제하므로 이후 동일 `iconId`로 표시하려면
     * `iconImgAdd`를 다시 호출해야 한다.
     *
     * @param {string} iconId  제거할 아이콘의 식별자
     * @returns {void}
     */
    const iconImgRemove = (iconId) => {
      _renderState.delete(iconId);
      if (map.hasImage(iconId)) {
        map.removeImage(iconId);
      }
      _syncSource();
    };

    // ── 맵 위에 아이콘 표시 / 제거 ──────────────────────────

    /**
     * 맵 위에 아이콘 인스턴스를 추가하거나 좌표를 갱신한다.
     * 단건과 배치 두 가지 시그니처를 지원한다.
     *
     * - 단건: `iconUpdate(iconId, 'pointId', [lon, lat])`
     * - 배치: `iconUpdate(iconId, [ ['pointId', [lon, lat]], ... ])`
     *
     * 같은 `pointId`가 이미 존재하면 경고 없이 덮어쓴다(`lineUpdate`와 동일한 동작).
     *
     * @param {string} iconId  사용할 아이콘 식별자 (`iconImgAdd`로 등록된 값)
     * @param {Array<[string, [number,number]]> | string} entriesOrId
     *   배치 입력 시 `[pointId, [lng, lat]]` 쌍의 배열, 단건 입력 시 `pointId` 문자열
     * @param {[number, number]} [coords]  단건 입력 시 포인트 좌표 [lng, lat]
     * @returns {void}
     */
    const iconUpdate = (iconId, entriesOrId, coords) => {
      _ensureLayer();

      const points = _renderState.get(iconId) ?? new Map();

      if (typeof entriesOrId === "string") {
        if (!_isValidCoord(coords)) {
          console.warn(
              `[map-icon] iconUpdate: "${iconId}/${entriesOrId}" 좌표 형식 오류 — 무시 (기대: [lng, lat])`,
          );
          return;
        }
        points.set(entriesOrId, coords);
      } else {
        for (const [pointId, coord] of entriesOrId) {
          if (!_isValidCoord(coord)) {
            console.warn(
                `[map-icon] iconUpdate: "${iconId}/${pointId}" 좌표 형식 오류 — 건너뜀 (기대: [lng, lat])`,
            );
            continue;
          }
          if (points.has(pointId)) {
            console.warn(
                `[map-icon] iconUpdate: pointId "${pointId}" 중복 — 덮어씀`,
            );
          }
          points.set(pointId, coord);
        }
      }

      _renderState.set(iconId, points);
      _syncSource();
    };

    /**
     * 맵 위의 아이콘 인스턴스를 제거한다. 세 가지 시그니처를 지원한다.
     *
     * - 전체 제거: `iconRemove(iconId)`
     * - 단건 제거: `iconRemove(iconId, 'pointId')`
     * - 복수 제거: `iconRemove(iconId, ['pointId1', 'pointId2'])`
     *
     * 아이콘 이미지 자체는 맵 스프라이트에 남는다. 이미지까지 삭제하려면 `iconImgRemove`를 사용한다.
     *
     * @param {string} iconId  대상 아이콘의 식별자
     * @param {string | string[]} [pointIdOrIds]
     *   제거할 포인트 ID 또는 ID 배열. 생략하면 해당 `iconId`의 모든 포인트 제거
     * @returns {void}
     */
    const iconRemove = (iconId, pointIdOrIds) => {
      if (pointIdOrIds === undefined) {
        _renderState.delete(iconId);
        _syncSource();
        return;
      }

      const points = _renderState.get(iconId);
      if (!points) {
        return;
      }

      const ids = Array.isArray(pointIdOrIds) ? pointIdOrIds : [pointIdOrIds];
      for (const id of ids) {
        points.delete(id);
      }
      if (points.size === 0) {
        _renderState.delete(iconId);
      }
      _syncSource();
    };

    /**
     * 레이어를 완전히 파기한다.
     * click·mouseenter·mouseleave 이벤트 핸들러를 해제하고,
     * 맵에서 symbol 레이어와 GeoJSON 소스를 제거한 뒤 내부 상태를 초기화한다.
     *
     * @returns {void}
     */
    const destroy = () => {
      if (_onClick) map.off("click",      ICON_LAYER, _onClick);
      if (_onEnter) map.off("mouseenter", ICON_LAYER, _onEnter);
      if (_onLeave) map.off("mouseleave", ICON_LAYER, _onLeave);
      if (map.getLayer(ICON_LAYER))  map.removeLayer(ICON_LAYER);
      if (map.getSource(ICON_SOURCE)) map.removeSource(ICON_SOURCE);
      _renderState.clear();
    };


    return { iconImgAdd, iconImgRemove, iconUpdate, iconRemove, destroy  };
  };

  window.createIconLayer = createIconLayer;
})();