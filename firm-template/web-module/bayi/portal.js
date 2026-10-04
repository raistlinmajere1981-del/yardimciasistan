(() => {
  "use strict";
  // Remove the fragment immediately. It never travels to HTTP/access logs or referrers.
  let invite = "";
  function captureInvite() {
    const fragment = window.location.hash;
    if (!fragment) return;
    invite = new URLSearchParams(fragment.slice(1)).get("invite") || "";
    window.history.replaceState(null, "", window.location.pathname);
  }
  captureInvite();
  const title = document.getElementById("portal-title");
  const name = document.getElementById("dealer-name");
  const message = document.getElementById("portal-message");
  const claim = document.getElementById("claim");
  const logout = document.getElementById("logout");
  const endpoint = (file) => new URL(`../api/dealer/${file}.php`, window.location.href);
  async function session() {
    try {
      const response = await fetch(endpoint("session"), { cache: "no-store", credentials: "same-origin" });
      if (response.status !== 401 && !response.ok) throw new Error("unavailable");
      const data = await response.json();
      const authenticated = data.authenticated === true && data.dealer;
      title.textContent = authenticated ? "Bayi paneli" : "Bayi erişimi gerekli";
      name.textContent = authenticated ? data.dealer.display_name : "";
      name.hidden = !authenticated; logout.hidden = !authenticated;
      claim.hidden = authenticated || !invite;
      message.textContent = authenticated ? "Bayi panelinize hoş geldiniz." : invite ? "Tek kullanımlık davetinizi kullanarak giriş yapın." : "İşletmeden bayi davet bağlantısı isteyin.";
    } catch { message.textContent = "Erişim durumu alınamadı. Lütfen yeniden deneyin."; }
  }
  claim.addEventListener("click", async () => {
    claim.disabled = true;
    try {
      const response = await fetch(endpoint("claim"), { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-YA-Dealer": "1" }, body: JSON.stringify({ invite_token: invite }) });
      invite = ""; claim.hidden = true;
      if (!response.ok) { message.textContent = "Bağlantı geçersiz veya süresi dolmuş."; return; }
      await session();
    } catch { message.textContent = "İşlem tamamlanamadı. Lütfen yeniden deneyin."; }
    finally { claim.disabled = false; }
  });
  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      const response = await fetch(endpoint("logout"), { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-YA-Dealer": "1" }, body: "{}" });
      if (!response.ok) throw new Error("unavailable");
      invite = ""; await session();
    } catch { message.textContent = "Oturum kapatılamadı. Lütfen yeniden deneyin."; }
    finally { logout.disabled = false; }
  });
  window.addEventListener("hashchange", () => { captureInvite(); void session(); });
  void session();
})();
