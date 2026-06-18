// @ts-check

(() => {
  /**
   * @typedef {object} PopupLayer
   * @property {(id: string, content: HTMLElement|string, coords: [number,number]) => void} popupUpdate
   *   팝업을 생성하거나 기존 팝업을 갱신한다.
   * @property {(id: string) => void} popupRemove
   *   지정한 팝업을 제거하고 `popup-close` 이벤트를 발신한다.
   * @property {() => void} destroy
   *   모든 팝업을 제거하고 레이어를 파기한다.
   */

  /**
   * 팝업 레이어를 생성한다. 외부 콘텐츠를 좌표에 앵커된 팝업으로 띄운다.
   * 닫기 버튼·디자인은 호출자가 콘텐츠에 직접 넣고, 그 버튼에서 `popupRemove(id)`를 호출한다.
   *
   * @param {maplibregl.Map} map  load 완료된 MapLibre 맵 인스턴스
   * @param {HTMLElement} [host]  커스텀 이벤트 발신 대상 요소 (기본: 맵 컨테이너)
   * @returns {PopupLayer}  팝업 제어 메서드 묶음
   * @fires popup-close  팝업이 닫힐 때 `host`에서 발생. `detail: { id: string }`
   *
   * @example
   * const popupLayer = createPopupLayer(map);
   * popupLayer.popupUpdate('info', '<p>서울</p>', [126.978, 37.566]);
   * // 나중에 제거
   * popupLayer.popupRemove('info');
   */
  const createPopupLayer = (map, host = map.getContainer()) => {
    /** @type {Map<string, maplibregl.Popup>} id → Popup 인스턴스 */
    const _active = new Map();

    /**
     * 팝업을 생성하거나 기존 팝업의 위치·콘텐츠를 갱신한다.
     * 이미 같은 `id`의 팝업이 존재하면 내용과 좌표만 업데이트하고 재생성하지 않는다.
     *
     * @param {string} id  팝업 식별자
     * @param {HTMLElement | string} content  표시할 DOM 요소 또는 HTML 문자열
     * @param {[number, number]} coords  위치 좌표 [lng, lat]
     * @returns {void}
     */
    const popupUpdate = (id, content, coords) => {
      const existing = _active.get(id);
      if (existing) {
        if (coords) existing.setLngLat(coords);
        content instanceof Element
            ? existing.setDOMContent(content)
            : existing.setHTML(content ?? "");
        return;
      }

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
      }).setLngLat(coords);
      content instanceof Element
          ? popup.setDOMContent(content)
          : popup.setHTML(content ?? "");
      popup.addTo(map);

      popup.on("close", () => {
        _active.delete(id);
        host.dispatchEvent(
            new CustomEvent("popup-close", { detail: { id }, bubbles: true }),
        );
      });

      _active.set(id, popup);
    };

    /**
     * 지정한 팝업을 닫는다.
     * 내부적으로 MapLibre Popup의 `close` 이벤트가 발생하며, 그에 따라
     * 내부 장부 정리와 `popup-close` 커스텀 이벤트 발신이 자동으로 이뤄진다.
     *
     * @param {string} id  제거할 팝업의 식별자
     * @returns {void}
     */
    const popupRemove = (id) => {
      _active.get(id)?.remove(); // close가 뒤따라 장부 정리 + popup-close 발신
    };

    /**
     * 현재 표시 중인 모든 팝업을 제거하고 내부 상태를 초기화한다.
     * 레이어를 완전히 폐기할 때 호출한다.
     *
     * @returns {void}
     */
    const destroy = () => {
      _active.forEach((p) => p.remove());
      _active.clear();
    };

    return { popupUpdate, popupRemove, destroy };
  };

  window.createPopupLayer = createPopupLayer;
})();