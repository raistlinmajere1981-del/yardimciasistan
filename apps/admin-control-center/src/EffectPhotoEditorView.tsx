import type { RefObject } from "react";
import "./effect-photo-editor.css";

/** React-owned, single-page editor surface; controls are mounted and disposed by the
 * versioned project-local photo editor. No iframe, window message bus or remote tree. */
export function EffectPhotoEditorView({ hostRef, hideLeft, hideRight }: {
  hostRef: RefObject<HTMLDivElement | null>;
  hideLeft: boolean;
  hideRight: boolean;
}) {
  return <div ref={hostRef} className="effects-editor" data-hide-left={hideLeft} data-hide-right={hideRight} data-inspector="effect">
    <main className="workspace">
      <aside className="panel library" aria-label="Alanlar ve efektler">
        <section className="zone-library" aria-labelledby="zones-heading">
          <div className="section-title"><h2 id="zones-heading">Alanlar</h2><span id="zone-count" className="count">0</span></div>
          <div id="zones" className="item-list" aria-label="Alanlar ve efektler ağacı"/>
          <button type="button" id="add-zone" className="full dashed">＋ Alan</button>
        </section>
        <section className="effect-library" aria-labelledby="effects-heading">
          <div className="section-title"><h2 id="effects-heading">Seçili alanın efektleri</h2><span id="effect-count" className="count">0</span></div>
          <div id="effects" className="item-list" aria-label="Seçili alanın efektleri"/>
          <div className="effect-add">
            <label className="field"><span>Efekt türü</span><select id="effect-type" aria-label="Eklenecek efekt"/></label>
            <button type="button" id="add-effect" className="full">＋ Efekt ekle</button>
          </div>
        </section>
      </aside>
      <section className="stage-column" aria-label="Canlı fotoğraf ve çokgen önizlemesi">
        <div className="preview-toolbar" role="toolbar" aria-label="Görsel araçları">
          <h2>Canlı görsel</h2>
          <div className="toolbar-group">
            <button type="button" id="play" aria-pressed="true">Ⅱ Duraklat</button>
            <button type="button" id="compare" aria-pressed="false">Önce / sonra</button>
          </div>
          <div className="history-actions">
            <button type="button" id="undo" aria-label="Geri al">↶</button>
            <button type="button" id="redo" aria-label="Yinele">↷</button>
          </div>
          <div className="toolbar-group">
            <label className="check"><input id="guides" type="checkbox" defaultChecked/> Alanlar</label>
            <label className="fit-control"><span className="visually-hidden">Fotoğraf yerleşimi</span>
              <select id="fit" defaultValue="contain"><option value="contain">Sığdır</option><option value="cover">Doldur</option></select>
            </label>
          </div>
        </div>
        <div id="preview-host" className="preview-host">
          <img id="photo" alt="Sahne fotoğrafı" draggable={false}/>
          <svg id="guides-svg" xmlns="http://www.w3.org/2000/svg" aria-label="Çokgen ve köşe tutamaçları"/>
          <span id="comparison-badge" className="comparison-badge" hidden>ÖNCE · Efektler kapalı</span>
          <div id="stats" className="stats" role="status">Önizleme hazırlanıyor…</div>
        </div>
        <p id="solo-status" className="help" role="status" hidden/>
        <div id="status" className="status" role="status" aria-live="polite">Sahne açılıyor…</div>
        <span className="visually-hidden" id="photo-name"/>
        <span className="visually-hidden" id="dimensions"/>
        <span className="visually-hidden" id="credit-text"/>
        <span id="gideros-license" hidden/>
      </section>
      <aside className="panel inspector" aria-label="Alan, efekt ve sahne özellikleri">
        <div className="panel-heading"><h2>Özellikler</h2></div>
        <div className="inspector-switch" aria-label="Özellik türü">
          <button id="inspect-effect" type="button" aria-pressed="true">Efekt</button>
          <button id="inspect-zone" type="button" aria-pressed="false">Alan</button>
          <button id="inspect-scene" type="button" aria-pressed="false">Sahne</button>
        </div>
        <section id="zone-inspector"/>
        <section id="effect-inspector"/>
        <details className="scene-settings" open>
          <summary>Sahne ayarları</summary>
          <label className="field">Sahne adı<input id="scene-name" maxLength={160}/></label>
          <label className="field">Sahne tohumu<input id="scene-seed" maxLength={120} spellCheck={false}/></label>
          <button type="button" id="restart" className="full">↺ Aynı tohumla yeniden oynat</button>
        </details>
      </aside>
    </main>
  </div>;
}
