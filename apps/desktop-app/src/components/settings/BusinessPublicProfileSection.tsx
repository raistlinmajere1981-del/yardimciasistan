import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  BUSINESS_CAPABILITIES,
  BUSINESS_PUBLIC_PROFILE_LIMITS,
  BUSINESS_SOCIAL_PLATFORM_CATALOG,
  getBusinessPublicFeatureCatalogForCapabilities,
  hasBusinessCapability,
  normalizeBusinessSocialLinkUrl,
  normalizeGoogleMapsEmbedUrl,
  type BusinessMapDisplayMode,
  type BusinessCapability,
  type BusinessPublicFeatureId,
  type BusinessPublicProfile,
  type BusinessSocialLink,
  type BusinessSocialPlatformId,
  type SaveBusinessPublicProfileInput
} from "@yardimci-asistan/shared";
import type { BusinessLocationGeocodeCandidate } from "../../../electron/business-location-geocode";
import type { SettingsOperationResult } from "../../app/settings-save";
import { BusinessLocationMapPicker } from "./BusinessLocationMapPicker";
import { TimePicker } from "../ui/DateTimePicker";
import { ActionButton } from "../ui/ActionButton";
import { SegmentedControl } from "../ui/SegmentedControl";

interface BusinessPublicProfileDraft {
  mapDisplayMode: BusinessMapDisplayMode;
  googleMapsEmbedUrl: string;
  description: string;
  aboutText: string;
  latitude: string;
  longitude: string;
  directionsNote: string;
  checkInTime: string;
  checkOutTime: string;
  breakfastStartTime: string;
  breakfastEndTime: string;
  features: BusinessPublicFeatureId[];
  policyNote: string;
  paymentNote: string;
  languages: string;
  socialLinks: BusinessSocialLink[];
}

interface BusinessPublicProfileSectionProps {
  businessAddress: string;
  enabledCapabilities: BusinessCapability[];
  enabled: boolean;
}

type AddressLookupState = "idle" | "loading" | "success" | "error";

const EMPTY_DRAFT: BusinessPublicProfileDraft = {
  mapDisplayMode: "manual",
  googleMapsEmbedUrl: "",
  description: "",
  aboutText: "",
  latitude: "",
  longitude: "",
  directionsNote: "",
  checkInTime: "",
  checkOutTime: "",
  breakfastStartTime: "",
  breakfastEndTime: "",
  features: [],
  policyNote: "",
  paymentNote: "",
  languages: "",
  socialLinks: []
};

export function useBusinessPublicProfileSettings({ businessAddress, enabledCapabilities, enabled }: BusinessPublicProfileSectionProps) {
  const [draft, setDraft] = useState<BusinessPublicProfileDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [feedback, setFeedback] = useState({ error: false, message: "" });
  const reportProfileStatus = useCallback((state: string, message: string) => setFeedback({ error: state === "error", message }), []);
  const [coordinateError, setCoordinateError] = useState("");
  const [addressLookupState, setAddressLookupState] = useState<AddressLookupState>("idle");
  const [addressLookupMessage, setAddressLookupMessage] = useState("");
  const [addressCandidates, setAddressCandidates] = useState<BusinessLocationGeocodeCandidate[]>([]);
  const initialDraftRef = useRef<BusinessPublicProfileDraft | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const latitudeInputRef = useRef<HTMLInputElement>(null);
  const lookupGeneration = useRef(0);

  useEffect(() => {
    ++lookupGeneration.current;
    if (!enabled) return;
    let active = true;
    const load = async () => {
      const bridge = window.yardimciDesktop;
      if (!bridge?.getBusinessPublicProfile) {
        if (active) {
          setLoading(false);
          reportProfileStatus("error", "Müşteriye açık işletme bilgileri bu sürümde kullanılamıyor.");
        }
        return;
      }
      try {
        const profile = await bridge.getBusinessPublicProfile();
        if (!active) return;
        const nextDraft = toDraft(profile);
        setDraft(nextDraft);
        initialDraftRef.current = nextDraft;
      } catch {
        if (active) {
          reportProfileStatus("error", "Müşteriye açık işletme bilgileri yüklenemedi.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [enabled, reportProfileStatus]);

  useEffect(() => {
    setAddressLookupState("idle");
    ++lookupGeneration.current;
    setAddressLookupMessage("");
    setAddressCandidates([]);
  }, [businessAddress, draft.mapDisplayMode]);

  const selectedFeatures = useMemo(() => new Set(draft.features), [draft.features]);
  const mapLatitude = parseMapCoordinate(draft.latitude, -90, 90);
  const mapLongitude = parseMapCoordinate(draft.longitude, -180, 180);
  const hasCompleteMapPoint = mapLatitude !== null && mapLongitude !== null;
  const normalizedBusinessAddress = businessAddress.trim();
  const accommodationDetailsEnabled = hasBusinessCapability(
    enabledCapabilities,
    BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS
  );
  const foodDetailsEnabled = hasBusinessCapability(
    enabledCapabilities,
    BUSINESS_CAPABILITIES.FOOD_MENU
  ) || hasBusinessCapability(
    enabledCapabilities,
    BUSINESS_CAPABILITIES.FOOD_TABLES
  );
  const publicFeatureCatalog = getBusinessPublicFeatureCatalogForCapabilities(enabledCapabilities);
  const showPublicFeatures = publicFeatureCatalog.length > 0;
  const showBreakfastTimes = accommodationDetailsEnabled;
  const policyPlaceholder = accommodationDetailsEnabled
    ? "Evcil hayvan, çocuk, sigara, sessizlik saatleri veya diğer konaklama kuralları."
    : foodDetailsEnabled
      ? "Rezervasyon, paket servis, evcil hayvan, sigara veya servisle ilgili kurallar."
      : "İade/değişim, teslimat, sipariş veya müşterinin bilmesi gereken diğer kurallar.";

  const update = <Key extends keyof BusinessPublicProfileDraft>(
    key: Key,
    value: BusinessPublicProfileDraft[Key]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === "latitude" || key === "longitude") setCoordinateError("");
  };

  const selectMapPoint = (latitude: number, longitude: number) => {
    setDraft((current) => ({
      ...current,
      latitude: String(latitude),
      longitude: String(longitude)
    }));
    setCoordinateError("");
  };

  const toggleFeature = (feature: BusinessPublicFeatureId, checked: boolean) => {
    update(
      "features",
      checked
        ? [...draft.features, feature]
        : draft.features.filter((candidate) => candidate !== feature)
    );
  };

  const addSocialLink = () => {
    const used = new Set(draft.socialLinks.map((link) => link.platform));
    const nextPlatform = BUSINESS_SOCIAL_PLATFORM_CATALOG.find((platform) => !used.has(platform.id));
    if (!nextPlatform) return;
    update("socialLinks", [...draft.socialLinks, { platform: nextPlatform.id, url: "" }]);
  };

  const setSocialLinkPlatform = (index: number, platform: BusinessSocialPlatformId) => {
    update("socialLinks", draft.socialLinks.map((link, currentIndex) =>
      currentIndex === index ? { platform, url: "" } : link
    ));
  };

  const setSocialLinkUrl = (index: number, url: string) => {
    update("socialLinks", draft.socialLinks.map((link, currentIndex) =>
      currentIndex === index ? { ...link, url } : link
    ));
  };

  const removeSocialLink = (index: number) => {
    update("socialLinks", draft.socialLinks.filter((_, currentIndex) => currentIndex !== index));
  };

  const lookupBusinessAddress = async () => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.geocodeBusinessAddress) {
      setAddressLookupState("error");
      setAddressLookupMessage("Adres araması bu sürümde kullanılamıyor. Uygulamayı yeniden başlatın.");
      return;
    }
    if (!normalizedBusinessAddress) {
      setAddressLookupState("error");
      setAddressLookupMessage("Önce işletme adresini girin.");
      return;
    }

    const request = ++lookupGeneration.current;
    setAddressLookupState("loading");
    setAddressLookupMessage("Adres Türkiye içinde aranıyor...");
    setAddressCandidates([]);
    try {
      const result = await bridge.geocodeBusinessAddress(normalizedBusinessAddress);
      if (request !== lookupGeneration.current) return;
      if (!result.ok) {
        setAddressLookupState("error");
        setAddressLookupMessage(result.message);
        return;
      }
      setAddressCandidates(result.results);
      if (result.results.length === 0) {
        setAddressLookupState("error");
        setAddressLookupMessage("Bu adres için eşleşme bulunamadı. Adresi biraz daha açık yazın veya haritada noktayı elle seçin.");
        return;
      }
      setAddressLookupState("success");
      setAddressLookupMessage("En uygun sonucu seçin; seçim koordinatları doldurur fakat siz kaydedene kadar kalıcı olmaz.");
    } catch {
      if (request !== lookupGeneration.current) return;
      setAddressLookupState("error");
      setAddressLookupMessage("Adres araması tamamlanamadı. İnternet bağlantısını kontrol edin veya noktayı elle seçin.");
    }
  };

  const selectAddressCandidate = (candidate: BusinessLocationGeocodeCandidate) => {
    selectMapPoint(candidate.latitude, candidate.longitude);
    setAddressLookupState("success");
    setAddressLookupMessage("Seçilen adres haritada işaretlendi. Gerekirse pini elle düzeltip Kaydet düğmesine basın.");
  };

  const buildInput = useCallback((): { ok: true; input: SaveBusinessPublicProfileInput } | { ok: false; message: string } => {
    const coordinates = draft.mapDisplayMode === "manual"
      ? parseCoordinates(draft.latitude, draft.longitude)
      : parseCoordinates(initialDraftRef.current?.latitude ?? "", initialDraftRef.current?.longitude ?? "");
    if (!coordinates.ok) return coordinates;

    const googleMapsEmbedUrl = draft.mapDisplayMode === "google_maps_embed" ? draft.googleMapsEmbedUrl.trim() : initialDraftRef.current?.googleMapsEmbedUrl ?? "";
    if (draft.mapDisplayMode === "google_maps_embed" && !normalizeGoogleMapsEmbedUrl(googleMapsEmbedUrl)) {
      return { ok: false, message: "Google Maps embed bağlantısı geçerli bir HTTPS yerleştirme URL'si olmalı." };
    }
    const socialLinks: BusinessSocialLink[] = [];
    for (const link of draft.socialLinks) {
      const rawUrl = link.url.trim();
      if (!rawUrl) continue;
      const normalizedUrl = normalizeBusinessSocialLinkUrl(link.platform, rawUrl);
      if (!normalizedUrl) {
        const platform = BUSINESS_SOCIAL_PLATFORM_CATALOG.find((item) => item.id === link.platform);
        return {
          ok: false,
          message: `${platform?.label ?? "Sosyal medya"} bağlantısı geçerli bir profil adresi olmalı.`
        };
      }
      socialLinks.push({ platform: link.platform, url: normalizedUrl });
    }

    return {
      ok: true,
      input: {
        mapDisplayMode: draft.mapDisplayMode,
        googleMapsEmbedUrl,
        description: draft.description,
        aboutText: draft.aboutText,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        directionsNote: draft.directionsNote,
        checkInTime: draft.checkInTime,
        checkOutTime: draft.checkOutTime,
        breakfastStartTime: draft.breakfastStartTime,
        breakfastEndTime: draft.breakfastEndTime,
        features: draft.features,
        policyNote: draft.policyNote,
        paymentNote: draft.paymentNote,
        languages: splitLanguages(draft.languages),
        socialLinks
      }
    };
  }, [draft]);

  const validateDraft = useCallback(() => {
    if (loading) return "Müşteriye açık işletme bilgileri yükleniyor.";
    if (!initialDraftRef.current) return "Müşteriye açık işletme bilgileri henüz yüklenmedi.";

    const result = buildInput();
    if (!result.ok) {
      setCoordinateError(result.message);
      return result.message;
    }
    setCoordinateError("");
    return null;
  }, [buildInput, loading]);

  const hasDraftChanges = useCallback(() => (
    initialDraftRef.current !== null
      && JSON.stringify(initialDraftRef.current) !== JSON.stringify(draft)
  ), [draft]);

  const save = useCallback(async (): Promise<SettingsOperationResult> => {
    const validationMessage = validateDraft();
    if (validationMessage) { reportProfileStatus("error", validationMessage); return { ok: false, message: validationMessage }; }
    if (!hasDraftChanges()) return { ok: true, changed: false };

    const bridge = window.yardimciDesktop;
    if (!bridge?.saveBusinessPublicProfile) {
      const message = "Müşteriye açık işletme bilgileri kaydedilemiyor. Uygulamayı yeniden başlatın.";
      setFeedback({ error: false, message: "" });
      return { ok: false, message };
    }

    const inputResult = buildInput();
    if (!inputResult.ok) return { ok: false, message: inputResult.message };

    if (saveInFlight.current) return { ok: false, message: "Müşteriye açık bilgiler kaydediliyor." };
    saveInFlight.current = true;
    setSaving(true);
    try {
      const result = await bridge.saveBusinessPublicProfile(inputResult.input);
      if (!result.ok) {
        setFeedback({ error: false, message: "" });
        return { ok: false, message: result.message };
      }
      const nextDraft = toDraft(result.profile);
      setDraft(nextDraft);
      initialDraftRef.current = nextDraft;
      setCoordinateError("");
      setFeedback({ error: false, message: "" });
      return { ok: true, changed: true, message: result.message };
    } catch {
      const message = "Müşteriye açık işletme bilgileri kaydedilemedi.";
      setFeedback({ error: false, message: "" });
      return { ok: false, message };
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [buildInput, hasDraftChanges, validateDraft, reportProfileStatus]);

  const dirty = hasDraftChanges();
  function discard() {
    if (saving || !initialDraftRef.current) return;
    setDraft(initialDraftRef.current);
    setCoordinateError("");
    setFeedback({ error: false, message: "" });
  }
  return { draft, loading, saving, coordinateError, addressLookupState, addressLookupMessage, addressCandidates, sectionRef, latitudeInputRef, selectedFeatures, mapLatitude, mapLongitude, hasCompleteMapPoint, normalizedBusinessAddress, accommodationDetailsEnabled, foodDetailsEnabled, publicFeatureCatalog, showPublicFeatures, showBreakfastTimes, policyPlaceholder, update, selectMapPoint, toggleFeature, addSocialLink, setSocialLinkPlatform, setSocialLinkUrl, removeSocialLink, lookupBusinessAddress, selectAddressCandidate, save, feedback, dirty, discard };
}

export function BusinessPublicProfileSection({
  controller,
  disabled = false
}: {
  controller: ReturnType<typeof useBusinessPublicProfileSettings>;
  disabled?: boolean;
}) {
  const { draft, loading, saving, coordinateError, addressLookupState, addressLookupMessage, addressCandidates, sectionRef, latitudeInputRef, selectedFeatures, mapLatitude, mapLongitude, hasCompleteMapPoint, normalizedBusinessAddress, accommodationDetailsEnabled, publicFeatureCatalog, showPublicFeatures, showBreakfastTimes, policyPlaceholder, update, selectMapPoint, toggleFeature, lookupBusinessAddress, selectAddressCandidate, feedback } = controller;

  return (
    <section ref={sectionRef} id="settings-public-details" tabIndex={-1} className="business-public-profile-section" aria-busy={loading || saving}>
      <fieldset className="settings-resource-fields" disabled={loading || saving || disabled}>
      {feedback.message && <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
      {loading ? (
        <div className="business-public-profile-loading loading-state loading-state--panel" role="status">İşletme bilgileri yükleniyor...</div>
      ) : (
        <div className="business-public-profile-body">
          <div className="business-public-profile-map-point">
            <SegmentedControl<BusinessMapDisplayMode> ariaLabel="Harita yöntemi" value={draft.mapDisplayMode}
              options={[{ id: "google_maps_embed", label: "Google Maps" }, { id: "manual", label: "Manuel harita" }]}
              onChange={(value) => update("mapDisplayMode", value)} />
            {draft.mapDisplayMode === "google_maps_embed" && <label className="form-field form-field--long">
              <span>Google Maps embed bağlantısı</span>
              <input aria-label="Google Maps embed bağlantısı" type="url" maxLength={4096} value={draft.googleMapsEmbedUrl} disabled={loading || saving} onChange={(event) => update("googleMapsEmbedUrl", event.target.value)} />
            </label>}
          </div>
          {draft.mapDisplayMode === "manual" && <div className="business-public-profile-map-point">
            <div className="business-public-profile-address-lookup">
              <ActionButton
                variant="secondary"
                type="button"
                disabled={addressLookupState === "loading" || !normalizedBusinessAddress}
                onClick={() => void lookupBusinessAddress()}
              >
                {addressLookupState === "loading" ? "Adres aranıyor" : "Adresten bul"}
              </ActionButton>
            </div>

            {addressLookupMessage && (
              <small className={`business-public-profile-address-status is-${addressLookupState}`} role={addressLookupState === "error" ? "alert" : "status"}>
                {addressLookupMessage}
              </small>
            )}

            {addressCandidates.length > 0 && (
              <div className="business-public-profile-address-results" aria-label="Adres arama sonuçları">
                {addressCandidates.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.id}
                    onClick={() => selectAddressCandidate(candidate)}
                  >
                    <span>{candidate.label}</span>
                    <small>{candidate.latitude}, {candidate.longitude}</small>
                  </button>
                ))}
              </div>
            )}

            <BusinessLocationMapPicker
              latitude={hasCompleteMapPoint ? mapLatitude : null}
              longitude={hasCompleteMapPoint ? mapLongitude : null}
              onSelect={selectMapPoint}
            />

            <div className="form-grid">
              <label className="form-field form-field--short">
                Enlem
                <input
                  ref={latitudeInputRef}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="-90"
                  max="90"
                  value={draft.latitude}
                  onChange={(event) => update("latitude", event.target.value)}
                  placeholder="36.8123"
                />
              </label>
              <label className="form-field form-field--short">
                Boylam
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="-180"
                  max="180"
                  value={draft.longitude}
                  onChange={(event) => update("longitude", event.target.value)}
                  placeholder="28.6321"
                />
              </label>
            </div>
            {coordinateError && <small className="business-public-profile-field-error" role="status">{coordinateError}</small>}
          </div>}

          <label className="form-field form-field--fluid form-field--span">
            İşletme açıklaması
            <textarea
              value={draft.description}
              maxLength={BUSINESS_PUBLIC_PROFILE_LIMITS.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="İşletmenizi müşteriye kısa ve net biçimde anlatın."
              rows={4}
            />
          </label>

          <label className="form-field form-field--fluid form-field--span">
            Hakkımızda
            <textarea
              value={draft.aboutText}
              maxLength={BUSINESS_PUBLIC_PROFILE_LIMITS.aboutText}
              onChange={(event) => update("aboutText", event.target.value)}
              placeholder="İşletmenizin hikâyesini ve yaklaşımını anlatın."
              rows={6}
            />
          </label>

          {showPublicFeatures && (
            <fieldset className="business-public-profile-features">
              <legend>Sunulan özellikler</legend>
              <div className="business-public-profile-feature-grid">
                {publicFeatureCatalog.map((feature) => (
                  <label className="form-check setup-checkline" key={feature.id}>
                    <input
                      type="checkbox"
                      checked={selectedFeatures.has(feature.id)}
                      onChange={(event) => toggleFeature(feature.id, event.target.checked)}
                    />
                    {feature.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {(accommodationDetailsEnabled || showBreakfastTimes) && (
            <div className="form-row business-public-profile-times">
              {accommodationDetailsEnabled && (
                <>
                  <div className="form-field form-field--short">
                    <span>Giriş saati</span>
                    <TimePicker ariaLabel="Giriş saati" value={draft.checkInTime} onChange={(value) => update("checkInTime", value)} />
                  </div>
                  <div className="form-field form-field--short">
                    <span>Çıkış saati</span>
                    <TimePicker ariaLabel="Çıkış saati" value={draft.checkOutTime} onChange={(value) => update("checkOutTime", value)} />
                  </div>
                </>
              )}
              {showBreakfastTimes && (
                <>
                  <div className="form-field form-field--short">
                    <span>Kahvaltı başlangıcı</span>
                    <TimePicker ariaLabel="Kahvaltı başlangıcı" value={draft.breakfastStartTime} onChange={(value) => update("breakfastStartTime", value)} />
                  </div>
                  <div className="form-field form-field--short">
                    <span>Kahvaltı bitişi</span>
                    <TimePicker ariaLabel="Kahvaltı bitişi" value={draft.breakfastEndTime} onChange={(value) => update("breakfastEndTime", value)} />
                  </div>
                </>
              )}
            </div>
          )}

          <label className="form-field form-field--fluid form-field--span">
            Ulaşım tarifi
            <textarea
              value={draft.directionsNote}
              maxLength={BUSINESS_PUBLIC_PROFILE_LIMITS.directionsNote}
              onChange={(event) => update("directionsNote", event.target.value)}
              placeholder="Örn. merkezden sahil yolunu takip edin; son 300 metre stabilize yoldur."
              rows={3}
            />
          </label>

          <div className="form-grid business-public-profile-notes">
            <label className="form-field form-field--fluid">
              Genel politika notu
              <textarea
                value={draft.policyNote}
                maxLength={BUSINESS_PUBLIC_PROFILE_LIMITS.policyNote}
                onChange={(event) => update("policyNote", event.target.value)}
                placeholder={policyPlaceholder}
                rows={4}
              />
            </label>
            <label className="form-field form-field--fluid">
              Ödeme notu
              <textarea
                value={draft.paymentNote}
                maxLength={BUSINESS_PUBLIC_PROFILE_LIMITS.paymentNote}
                onChange={(event) => update("paymentNote", event.target.value)}
                placeholder="Kabul edilen ödeme yöntemleri veya müşterinin bilmesi gereken koşullar."
                rows={4}
              />
            </label>
          </div>

          <label className="form-field form-field--medium form-field--span">
            Konuşulan diller
            <input
              value={draft.languages}
              onChange={(event) => update("languages", event.target.value)}
              placeholder="Türkçe, English, Deutsch"
            />
            <small>Virgülle ayırın. En fazla {BUSINESS_PUBLIC_PROFILE_LIMITS.languages} dil kaydedilir.</small>
          </label>
        </div>
      )}
      </fieldset>
    </section>
  );
}

export function BusinessSocialLinksSection({
  controller,
  disabled = false
}: {
  controller: ReturnType<typeof useBusinessPublicProfileSettings>;
  disabled?: boolean;
}) {
  const {
    draft,
    loading,
    saving,
    addSocialLink,
    setSocialLinkPlatform,
    setSocialLinkUrl,
    removeSocialLink
  } = controller;
  const usedPlatforms = new Set(draft.socialLinks.map((link) => link.platform));
  const canAdd = draft.socialLinks.length < BUSINESS_PUBLIC_PROFILE_LIMITS.socialLinks;

  return (
    <section id="settings-social-links" tabIndex={-1} className="business-social-links-section form-stack" aria-busy={loading || saving}>
      <div className="setup-section-title setup-section-title--subsection">
        <div>
          <h3>Sosyal Medya</h3>
          <p>Web sitesinin üst ve alt alanında gösterilecek profil bağlantıları.</p>
        </div>
        <ActionButton
          variant="secondary"
          size="sm"
          type="button"
          disabled={loading || saving || disabled || !canAdd}
          onClick={addSocialLink}
        >
          <Plus size={15} aria-hidden="true" />
          Bağlantı ekle
        </ActionButton>
      </div>

      <fieldset className="settings-resource-fields" disabled={loading || saving || disabled}>
        {draft.socialLinks.length === 0 ? (
          <div className="business-social-links-empty">
            Henüz sosyal medya bağlantısı eklenmedi.
          </div>
        ) : (
          <div className="business-social-links-list">
            {draft.socialLinks.map((link, index) => {
              const definition = BUSINESS_SOCIAL_PLATFORM_CATALOG.find((item) => item.id === link.platform);
              return (
                <div className="business-social-link-row" key={`${link.platform}-${index}`}>
                  <label className="form-field business-social-link-platform">
                    Platform
                    <select
                      value={link.platform}
                      onChange={(event) => setSocialLinkPlatform(index, event.target.value as BusinessSocialPlatformId)}
                    >
                      {BUSINESS_SOCIAL_PLATFORM_CATALOG.map((platform) => (
                        <option
                          key={platform.id}
                          value={platform.id}
                          disabled={platform.id !== link.platform && usedPlatforms.has(platform.id)}
                        >
                          {platform.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field business-social-link-url">
                    Profil bağlantısı
                    <input
                      type="url"
                      value={link.url}
                      maxLength={BUSINESS_PUBLIC_PROFILE_LIMITS.socialUrl}
                      onChange={(event) => setSocialLinkUrl(index, event.target.value)}
                      placeholder={socialLinkPlaceholder(link.platform)}
                      aria-label={`${definition?.label ?? "Sosyal medya"} profil bağlantısı`}
                    />
                  </label>
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="business-social-link-remove"
                    onClick={() => removeSocialLink(index)}
                    aria-label={`${definition?.label ?? "Sosyal medya"} bağlantısını kaldır`}
                    title="Bağlantıyı kaldır"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </ActionButton>
                </div>
              );
            })}
          </div>
        )}
      </fieldset>
    </section>
  );
}

function socialLinkPlaceholder(platform: BusinessSocialPlatformId): string {
  return {
    facebook: "https://facebook.com/isletme",
    instagram: "https://instagram.com/isletme",
    youtube: "https://youtube.com/@isletme",
    tiktok: "https://tiktok.com/@isletme",
    x: "https://x.com/isletme"
  }[platform];
}

function toDraft(profile: BusinessPublicProfile): BusinessPublicProfileDraft {
  return {
    mapDisplayMode: profile.mapDisplayMode ?? "manual",
    googleMapsEmbedUrl: profile.googleMapsEmbedUrl ?? "",
    description: profile.description,
    aboutText: profile.aboutText ?? "",
    latitude: profile.latitude === null ? "" : String(profile.latitude),
    longitude: profile.longitude === null ? "" : String(profile.longitude),
    directionsNote: profile.directionsNote,
    checkInTime: profile.checkInTime,
    checkOutTime: profile.checkOutTime,
    breakfastStartTime: profile.breakfastStartTime,
    breakfastEndTime: profile.breakfastEndTime,
    features: [...profile.features],
    policyNote: profile.policyNote,
    paymentNote: profile.paymentNote,
    languages: profile.languages.join(", "),
    socialLinks: profile.socialLinks.map((link) => ({ ...link }))
  };
}

function splitLanguages(value: string): string[] {
  return value.split(/[,;\n]/).map((language) => language.trim()).filter(Boolean);
}

function parseMapCoordinate(value: string, minimum: number, maximum: number): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function parseCoordinates(
  latitudeText: string,
  longitudeText: string
): { ok: true; latitude: number | null; longitude: number | null } | { ok: false; message: string } {
  const latitudeValue = latitudeText.trim();
  const longitudeValue = longitudeText.trim();
  if (!latitudeValue && !longitudeValue) {
    return { ok: true, latitude: null, longitude: null };
  }
  if (!latitudeValue || !longitudeValue) {
    return { ok: false, message: "Harita konumu için enlem ve boylam birlikte girilmeli." };
  }

  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { ok: false, message: "Enlem -90 ile 90 arasında geçerli bir sayı olmalı." };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, message: "Boylam -180 ile 180 arasında geçerli bir sayı olmalı." };
  }
  return { ok: true, latitude, longitude };
}
