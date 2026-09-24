import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUSINESS_CAPABILITIES,
  BUSINESS_PUBLIC_PROFILE_LIMITS,
  getBusinessPublicFeatureCatalogForCapabilities,
  hasBusinessCapability,
  type BusinessCapability,
  type BusinessPublicFeatureId,
  type BusinessPublicProfile,
  type SaveBusinessPublicProfileInput
} from "@yardimci-asistan/shared";
import type { BusinessLocationGeocodeCandidate } from "../../../electron/business-location-geocode";
import type { SettingsOperationResult } from "../../app/settings-save";
import { BusinessLocationMapPicker } from "./BusinessLocationMapPicker";

interface BusinessPublicProfileDraft {
  description: string;
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
}

interface BusinessPublicProfileSectionProps {
  businessAddress: string;
  enabledCapabilities: BusinessCapability[];
  enabled: boolean;
}

type AddressLookupState = "idle" | "loading" | "success" | "error";

const EMPTY_DRAFT: BusinessPublicProfileDraft = {
  description: "",
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
  languages: ""
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

  useEffect(() => {
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
    setAddressLookupMessage("");
    setAddressCandidates([]);
  }, [businessAddress]);

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

  const lookupBusinessAddress = async () => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.geocodeBusinessAddress) {
      setAddressLookupState("error");
      setAddressLookupMessage("Adres araması bu sürümde kullanılamıyor. Uygulamayı yeniden başlatın.");
      return;
    }
    if (!normalizedBusinessAddress) {
      setAddressLookupState("error");
      setAddressLookupMessage("Önce İşletmem bölümündeki Adres alanını doldurun.");
      return;
    }

    setAddressLookupState("loading");
    setAddressLookupMessage("Adres Türkiye içinde aranıyor...");
    setAddressCandidates([]);
    try {
      const result = await bridge.geocodeBusinessAddress(normalizedBusinessAddress);
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
      setAddressLookupState("error");
      setAddressLookupMessage("Adres araması tamamlanamadı. İnternet bağlantısını kontrol edin veya noktayı elle seçin.");
    }
  };

  const selectAddressCandidate = (candidate: BusinessLocationGeocodeCandidate) => {
    selectMapPoint(candidate.latitude, candidate.longitude);
    setAddressLookupState("success");
    setAddressLookupMessage("Seçilen adres haritada işaretlendi. Gerekirse pini elle düzeltip Müşteri Bilgilerini Kaydet düğmesine basın.");
  };

  const buildInput = useCallback((): { ok: true; input: SaveBusinessPublicProfileInput } | { ok: false; message: string } => {
    const coordinates = parseCoordinates(draft.latitude, draft.longitude);
    if (!coordinates.ok) return coordinates;

    return {
      ok: true,
      input: {
        description: draft.description,
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
        languages: splitLanguages(draft.languages)
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
      reportProfileStatus("error", message);
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
        reportProfileStatus("error", result.message);
        return { ok: false, message: result.message };
      }
      const nextDraft = toDraft(result.profile);
      setDraft(nextDraft);
      initialDraftRef.current = nextDraft;
      setCoordinateError("");
      reportProfileStatus("success", result.message);
      return { ok: true, changed: true, message: result.message };
    } catch {
      const message = "Müşteriye açık işletme bilgileri kaydedilemedi.";
      reportProfileStatus("error", message);
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
    setFeedback({ error: false, message: "Müşteriye açık bilgiler geri alındı." });
  }
  return { draft, loading, saving, coordinateError, addressLookupState, addressLookupMessage, addressCandidates, sectionRef, latitudeInputRef, selectedFeatures, mapLatitude, mapLongitude, hasCompleteMapPoint, normalizedBusinessAddress, accommodationDetailsEnabled, foodDetailsEnabled, publicFeatureCatalog, showPublicFeatures, showBreakfastTimes, policyPlaceholder, update, selectMapPoint, toggleFeature, lookupBusinessAddress, selectAddressCandidate, save, feedback, dirty, discard };
}

export function BusinessPublicProfileSection({
  controller,
  disabled = false
}: {
  controller: ReturnType<typeof useBusinessPublicProfileSettings>;
  disabled?: boolean;
}) {
  const { draft, loading, saving, coordinateError, addressLookupState, addressLookupMessage, addressCandidates, sectionRef, latitudeInputRef, selectedFeatures, mapLatitude, mapLongitude, hasCompleteMapPoint, normalizedBusinessAddress, accommodationDetailsEnabled, foodDetailsEnabled, publicFeatureCatalog, showPublicFeatures, showBreakfastTimes, policyPlaceholder, update, selectMapPoint, toggleFeature, lookupBusinessAddress, selectAddressCandidate, feedback } = controller;

  return (
    <section ref={sectionRef} id="settings-public-profile" tabIndex={-1} className="business-public-profile-section settings-business-subsection" aria-busy={loading || saving}>
      {feedback.message && <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
      <fieldset className="settings-resource-fields" disabled={loading || saving || disabled}>
      {loading ? (
        <div className="business-public-profile-loading loading-state loading-state--panel" role="status">İşletme bilgileri yükleniyor...</div>
      ) : (
        <div className="business-public-profile-body">
          <div className="business-public-profile-map-point">
            <div className="business-public-profile-address-lookup">
              <div>
                <strong>Adrese göre haritada bul</strong>
                <span>{normalizedBusinessAddress || "İşletmem bölümünde henüz adres girilmedi."}</span>
              </div>
              <button
                className="setup-secondary action-button action-button-secondary"
                type="button"
                disabled={addressLookupState === "loading" || !normalizedBusinessAddress}
                onClick={() => void lookupBusinessAddress()}
              >
                {addressLookupState === "loading" ? "Adres aranıyor" : "Adresi Haritada Bul"}
              </button>
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
          </div>

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
                  <label className="form-field form-field--short">
                    Giriş saati
                    <input lang="tr-TR" type="time" value={draft.checkInTime} onChange={(event) => update("checkInTime", event.target.value)} />
                  </label>
                  <label className="form-field form-field--short">
                    Çıkış saati
                    <input lang="tr-TR" type="time" value={draft.checkOutTime} onChange={(event) => update("checkOutTime", event.target.value)} />
                  </label>
                </>
              )}
              {showBreakfastTimes && (
                <>
                  <label className="form-field form-field--short">
                    Kahvaltı başlangıcı
                    <input lang="tr-TR" type="time" value={draft.breakfastStartTime} onChange={(event) => update("breakfastStartTime", event.target.value)} />
                  </label>
                  <label className="form-field form-field--short">
                    Kahvaltı bitişi
                    <input lang="tr-TR" type="time" value={draft.breakfastEndTime} onChange={(event) => update("breakfastEndTime", event.target.value)} />
                  </label>
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

function toDraft(profile: BusinessPublicProfile): BusinessPublicProfileDraft {
  return {
    description: profile.description,
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
    languages: profile.languages.join(", ")
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
