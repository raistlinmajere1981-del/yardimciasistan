import { useEffect, useMemo, useState } from "react";
import {
  BUSINESS_PUBLIC_FEATURE_CATALOG,
  BUSINESS_PUBLIC_PROFILE_LIMITS,
  type BusinessPublicFeatureId,
  type BusinessPublicProfile,
  type SaveBusinessPublicProfileInput
} from "@yardimci-asistan/shared";
import type { BusinessLocationGeocodeCandidate } from "../../../electron/business-location-geocode";
import { reportAppStatus } from "../../app/runtime-state";
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

export function BusinessPublicProfileSection({ businessAddress }: BusinessPublicProfileSectionProps) {
  const [draft, setDraft] = useState<BusinessPublicProfileDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coordinateError, setCoordinateError] = useState("");
  const [addressLookupState, setAddressLookupState] = useState<AddressLookupState>("idle");
  const [addressLookupMessage, setAddressLookupMessage] = useState("");
  const [addressCandidates, setAddressCandidates] = useState<BusinessLocationGeocodeCandidate[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const bridge = window.yardimciDesktop;
      if (!bridge?.getBusinessPublicProfile) {
        if (active) {
          setLoading(false);
          reportAppStatus("error", "Müşteriye açık işletme bilgileri bu sürümde kullanılamıyor.");
        }
        return;
      }
      try {
        const profile = await bridge.getBusinessPublicProfile();
        if (!active) return;
        setDraft(toDraft(profile));
      } catch {
        if (active) {
          reportAppStatus("error", "Müşteriye açık işletme bilgileri yüklenemedi.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

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
    setAddressLookupMessage("Seçilen adres haritada işaretlendi. Gerekirse pini elle düzeltip Bilgileri Kaydet'e basın.");
  };

  const save = async () => {
    const bridge = window.yardimciDesktop;
    if (!bridge?.saveBusinessPublicProfile) {
      reportAppStatus("error", "Müşteriye açık işletme bilgileri kaydedilemiyor. Uygulamayı yeniden başlatın.");
      return;
    }

    const coordinates = parseCoordinates(draft.latitude, draft.longitude);
    if (!coordinates.ok) {
      setCoordinateError(coordinates.message);
      return;
    }

    const input: SaveBusinessPublicProfileInput = {
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
    };

    setSaving(true);
    try {
      const result = await bridge.saveBusinessPublicProfile(input);
      if (!result.ok) {
        reportAppStatus("error", result.message);
        return;
      }
      setDraft(toDraft(result.profile));
      setCoordinateError("");
      reportAppStatus("success", result.message);
    } catch {
      reportAppStatus("error", "Müşteriye açık işletme bilgileri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="setup-section business-public-profile-section" aria-busy={loading || saving}>
      <div className="setup-section-title business-public-profile-heading">
        <div>
          <h2>Müşteriye Gösterilen Bilgiler</h2>
        </div>
        <button className="setup-primary action-button action-button-primary" type="button" disabled={loading || saving} onClick={() => void save()}>
          {saving ? "Kaydediliyor" : "Bilgileri Kaydet"}
        </button>
      </div>
      <p className="setup-section-description">Müşterilerin işletmeniz hakkında görmesini istediğiniz bilgileri düzenleyin.</p>

      {loading ? (
        <div className="business-public-profile-loading">İşletme bilgileri yükleniyor...</div>
      ) : (
        <div className="business-public-profile-body">
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

          <fieldset className="business-public-profile-features">
            <legend>Sunulan özellikler</legend>
            <div className="business-public-profile-feature-grid">
              {BUSINESS_PUBLIC_FEATURE_CATALOG.map((feature) => (
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

          <div className="form-row business-public-profile-times">
            <label className="form-field form-field--short">
              Giriş saati
              <input type="time" value={draft.checkInTime} onChange={(event) => update("checkInTime", event.target.value)} />
            </label>
            <label className="form-field form-field--short">
              Çıkış saati
              <input type="time" value={draft.checkOutTime} onChange={(event) => update("checkOutTime", event.target.value)} />
            </label>
            <label className="form-field form-field--short">
              Kahvaltı başlangıcı
              <input type="time" value={draft.breakfastStartTime} onChange={(event) => update("breakfastStartTime", event.target.value)} />
            </label>
            <label className="form-field form-field--short">
              Kahvaltı bitişi
              <input type="time" value={draft.breakfastEndTime} onChange={(event) => update("breakfastEndTime", event.target.value)} />
            </label>
          </div>

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

          <div className="business-public-profile-map-point">
            <div className="business-public-profile-address-lookup">
              <div>
                <strong>Adrese göre haritada bul</strong>
                <span>{normalizedBusinessAddress || "İşletmem bölümünde henüz adres girilmedi."}</span>
                <small>
                  Arama yalnız siz butona bastığınızda yapılır ve Türkiye ile sınırlandırılır. Sonuç kesin konum sayılmaz; pini haritada düzeltebilirsiniz.
                </small>
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
              <small className={`business-public-profile-address-status is-${addressLookupState}`} role="status">
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
            <small>Adres temel kaynak olmaya devam eder. Haritada seçtiğiniz nokta bu koordinat alanlarını doldurur; gerekirse elle de düzeltebilirsiniz.</small>
            {coordinateError && <small className="business-public-profile-field-error" role="status">{coordinateError}</small>}
          </div>

          <div className="form-grid business-public-profile-notes">
            <label className="form-field form-field--fluid">
              Genel politika notu
              <textarea
                value={draft.policyNote}
                maxLength={BUSINESS_PUBLIC_PROFILE_LIMITS.policyNote}
                onChange={(event) => update("policyNote", event.target.value)}
                placeholder="Evcil hayvan, çocuk, sigara, sessizlik saatleri gibi bilgiler."
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
