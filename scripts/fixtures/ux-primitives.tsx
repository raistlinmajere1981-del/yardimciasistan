import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SearchSelect } from "../../apps/desktop-app/src/components/ui/SearchSelect";
import { FormDialog } from "../../apps/desktop-app/src/components/ui/FormDialog";
import { useDialogFocus } from "../../apps/desktop-app/src/components/ui/useDialogFocus";
import { PageViewStateProvider, usePageViewState, usePageViewScroll } from "../../apps/desktop-app/src/app/page-view-state";
import "../../apps/desktop-app/src/styles/index.css";
const options = Array.from({ length: 250 }, (_, index) => ({ id: String(index), label: `Kayıt ${index}`, description: `Kategori · +90 555 000 ${String(index).padStart(4, "0")}`, disabled: index === 1 }));
function View() {
  const [query, setQuery] = usePageViewState("fixture.search", "");
  const [rows, setRows] = useState(0);
  const scroll = usePageViewScroll("fixture.scroll", rows);
  useEffect(() => { const timer = setTimeout(() => setRows(100), 80); return () => clearTimeout(timer); }, []);
  return <><label>Sayfa araması<input value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div ref={scroll} data-testid="scroll-owner" style={{height:100,overflow:"auto"}}>{Array.from({length:rows},(_,i)=><p key={i}>Satır {i}</p>)}</div></>;
}
function LegacyForm({ onClose }: { onClose: () => void }) {
  const ref = useDialogFocus(true);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label="Mevcut işlem formu">
    <button data-dialog-close onClick={onClose}>İşlem formunu kapat</button>
    <SearchSelect ariaLabel="Kayıt" value="0" options={options} onChange={() => undefined} />
  </div>;
}
function App() {
  const [legacy, setLegacy] = useState(false);
  const [value, setValue] = useState("0"), [modal, setModal] = useState(false), [page, setPage] = useState(true), [business, setBusiness] = useState(0), [created, setCreated] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const picker = <SearchSelect ariaLabel="Kayıt" value={value} options={options} onChange={setValue} onCreate={() => setCreated(true)} />;
  return <><button onClick={() => setModal(true)}>Form aç</button><button onClick={() => setLegacy(true)}>Mevcut işlem formunu aç</button><button onClick={() => setPage(!page)}>Sayfa değiştir</button><button onClick={() => setBusiness(business + 1)}>İşletme değiştir</button>
    <PageViewStateProvider key={business}>{page && <View />}</PageViewStateProvider>
    <p role="status">{created ? "Yeni kayıt işlemi" : value}</p>
    {picker}<button>Sonraki kontrol</button>
    {modal && <FormDialog title="Kayıt formu" onClose={() => setModal(false)} initialFocusRef={ref} footer={<button type="submit">Kaydet</button>} onSubmit={event => event.preventDefault()}><input ref={ref} aria-label="Form adı" />{picker}</FormDialog>}
    {legacy && <LegacyForm onClose={() => setLegacy(false)} />}
  </>;
}
createRoot(document.getElementById("root")!).render(<App />);
