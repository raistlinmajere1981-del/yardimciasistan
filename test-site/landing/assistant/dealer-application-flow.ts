import { html, ui } from "./site-language";

const kinds = { tax_certificate: "Vergi levhası", activity_certificate: "Faaliyet belgesi", authorization: "Yetki belgesi", other: "Diğer belgeler" };
const backendErrors: Record<string, string> = {
  requests_disabled: "Talep alma özelliği bu işletmede etkin değil.",
  dealer_application_disabled: "Online bayi başvurusu kapalı.",
  request_type_disabled: "Bu talep türü işletmede etkin değil.",
  invalid_idempotency_key: "Tekrar deneme kimliği gerekli veya geçersiz.",
  idempotency_conflict: "Tekrar deneme kimliği farklı bir talep için kullanılmış."
};
// These responses predate error codes. Only known source copy enters the host's
// dynamic catalog; arbitrary server/provider text must use the safe UI fallback.
const backendMessages = new Set([
  ...Object.values(backendErrors),
  "Lütfen bilgileri kontrol edin.",
  "En fazla 5 belge ekleyin.",
  "Belge yüklenemedi. Dosyayı yeniden seçin.",
  "Her belge en fazla 10 MB olabilir.",
  "Yalnız PDF, JPG ve PNG belgeleri yüklenebilir.",
  "PDF belgesi okunamadı.",
  "Belge türü geçersiz.",
  "Bu talebe belge eklenemez.",
  "Talep kaydedilemedi. Lütfen biraz sonra tekrar deneyin.",
  "Gönderilen bilgiler okunamadı.",
  "Form bilgileri alınamadı."
]);
function backendErrorMessage(body: Record<string, unknown>): string {
  const codedSource = typeof body.code === "string" && Object.hasOwn(backendErrors, body.code) ? backendErrors[body.code] : undefined;
  if (codedSource) return ui(codedSource);
  if (typeof body.message === "string" && backendMessages.has(body.message)) return ui(body.message);
  return ui("Başvuru sonucu doğrulanamadı. Aynı başvuruyu yeniden deneyin.");
}
export function dealerApplicationForm(): string {
  return `<div class="ya-widget-subview"><button type="button" data-ya-view="home">${html("Geri")}</button>
    <h2 class="ya-widget-view-title" tabindex="-1">${html("Bayi Başvurusu")}</h2>
    <form class="ya-widget-form" data-dealer-application>
      ${([["company_name", "Firma / unvan", "text"], ["authorized_person", "Yetkili adı soyadı", "text"], ["customer_phone", "Telefon", "tel"], ["email", "E-posta", "email"], ["tax_office", "Vergi dairesi (isteğe bağlı)", "text"], ["tax_number", "Vergi numarası (isteğe bağlı)", "text"]] as const).map(([name,label,type]) => `<label class="ya-widget-field"><span>${html(label)}</span><input name="${name}" type="${type}" maxlength="${name === "tax_number" ? 32 : name === "authorized_person" ? 160 : name === "email" ? 254 : name === "tax_office" ? 120 : 180}" ${name.startsWith("tax_") ? "" : "required"} /></label>`).join("")}
      <label class="ya-widget-field"><span>${html("Başvuru notu (isteğe bağlı)")}</span><textarea name="message" maxlength="3000" rows="2"></textarea></label>
      <fieldset><legend>${html("Belgeler (isteğe bağlı)")}</legend>
        <label class="ya-widget-field"><span>${html("Belge türü")}</span><select name="document_kind">${Object.entries(kinds).map(([key,label]) => `<option value="${key}">${html(label)}</option>`).join("")}</select></label>
        <label class="ya-widget-field"><span>${html("Dosya seç · PDF, JPG, PNG · En fazla 5 dosya, dosya başına 10 MB")}</span><input data-document-picker type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" multiple /></label>
        <div data-document-list></div>
      </fieldset>
      <progress data-upload-progress max="100" value="0" hidden aria-label="${html("Belge yükleme ilerlemesi")}"></progress>
      <p data-application-status role="status"></p><button class="ya-widget-primary-action" type="submit">${html("Başvuruyu Gönder")}</button>
    </form></div>`;
}
export function mountDealerApplicationForm(root: HTMLElement, apiBaseUrl: string) {
  const foundForm = root.querySelector<HTMLFormElement>("[data-dealer-application]");
  if (!foundForm) return;
  const form = foundForm;
  const files: Array<{file: File; kind: keyof typeof kinds}> = [];
  const status = form.querySelector<HTMLElement>("[data-application-status]")!;
  const list = form.querySelector<HTMLElement>("[data-document-list]")!;
  const picker = form.querySelector<HTMLInputElement>("[data-document-picker]")!;
  const progress = form.querySelector<HTMLProgressElement>("[data-upload-progress]")!;
  let pending: { intent: string; key: string } | null = null;
  let busy = false;
  function draw() {
    list.replaceChildren();
    files.forEach((item, index) => {
      const row = document.createElement("div");
      const label = document.createElement("span"); label.textContent = `${ui(kinds[item.kind])} · ${item.file.name}`;
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = ui("Kaldır");
      remove.addEventListener("click", () => { if (busy) return; files.splice(index,1); draw(); });
      row.append(label, remove); list.append(row);
    });
  }
  picker.addEventListener("change", () => {
    status.textContent = "";
    const selected = Array.from(picker.files ?? []);
    if (files.length + selected.length > 5) status.textContent = ui("En fazla 5 dosya ekleyebilirsiniz.");
    else if (selected.some(file => !file.size || file.size > 10 * 1024 * 1024 || !/\.(pdf|jpe?g|png)$/i.test(file.name))) status.textContent = ui("PDF, JPG veya PNG seçin. Her dosya en fazla 10 MB olabilir.");
    else { const kind = (form.elements.namedItem("document_kind") as HTMLSelectElement).value as keyof typeof kinds; files.push(...selected.map(file => ({file,kind}))); draw(); }
    picker.value = "";
  });
  form.addEventListener("submit", event => { void submit(event); });
  async function submit(event: Event) {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    busy = true; status.textContent = ui("Başvuru ve belgeler gönderiliyor…"); progress.hidden = false;
    try {
      const payload = new FormData(form); payload.delete("document_kind");
      payload.set("request_type", "dealer_application"); payload.set("customer_name", String(payload.get("authorized_person"))); payload.set("guest_count", "1");
      const hashes = await Promise.all(files.map(async ({file,kind}) => ({name:file.name, kind, hash:Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), byte => byte.toString(16).padStart(2,"0")).join("")})));
      const intent = JSON.stringify({fields:Array.from(payload.entries()), files:hashes});
      if (!pending || pending.intent !== intent) pending = {intent, key:crypto.randomUUID()};
      payload.set("idempotency_key", pending.key);
      files.forEach(({file,kind}) => { payload.append("documents[]", file); payload.append("document_kinds[]", kind); });
      form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input,button,select,textarea").forEach(el => el.disabled = true);
      const result = await new Promise<{ok?:boolean;message?:string}>(resolve => {
        const xhr = new XMLHttpRequest(); xhr.open("POST", `${apiBaseUrl.replace(/\/$/, "")}/api/request.php`); xhr.timeout = 120000;
        xhr.upload.onprogress = event => { if (event.lengthComputable) progress.value = event.loaded / event.total * 100; };
        xhr.onload = () => {
          try {
            const decoded: unknown = JSON.parse(xhr.responseText);
            const body = decoded && typeof decoded === "object" ? decoded as Record<string, unknown> : {};
            const accepted = xhr.status >= 200 && xhr.status < 300 && body.ok === true
              && typeof body.request_id === "string" && /^[A-Za-z0-9_-]{1,180}$/.test(body.request_id);
            resolve(accepted ? {ok:true} : {ok:false,message:backendErrorMessage(body)});
          } catch { resolve({ok:false,message:ui("Sunucu yanıtı okunamadı. Aynı başvuruyu yeniden deneyin.")}); }
        };
        xhr.onerror = xhr.ontimeout = () => resolve({ok:false,message:ui("Yükleme tamamlanamadı. Aynı başvuruyu yeniden deneyin.")}); xhr.send(payload);
      });
      if (result.ok) { pending = null; form.reset(); files.length = 0; draw(); status.textContent = ui("Başvurunuz alındı. İşletmenin değerlendirmesi bekleniyor."); }
      else status.textContent = result.message || ui("Başvuru gönderilemedi.");
    } catch { status.textContent = ui("Başvuru gönderilemedi. Yeniden deneyin."); }
    finally { busy = false; progress.hidden = true; form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input,button,select,textarea").forEach(el => el.disabled = false); }
  }
}
