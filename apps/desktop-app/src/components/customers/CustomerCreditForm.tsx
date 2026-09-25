import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CustomerCreditAccountDetail, CustomerCreditPaymentMethod } from "@yardimci-asistan/shared";
import { customerCreditError, customerCreditPaymentLabels, formatCreditMoney, notifyCustomerCreditChanged, parseCreditAmount } from "../../app/customer-credit-ui";
import { reportAppStatus } from "../../app/runtime-state";
import { ActionButton } from "../ui/ActionButton";
import { MoneyInput } from "../ui/MoneyInput";

export function CustomerCreditForm({ account, mode, loading, onClose, onSaved, onSavingChange }: {
  account: CustomerCreditAccountDetail;
  mode: "payment" | "adjustment";
  loading: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(() => account.balances.find((balance) => balance.currency === "TRY" && balance.amountMinor > 0)?.currency
    ?? account.balances.find((balance) => balance.amountMinor > 0)?.currency ?? "TRY");
  const [paymentMethod, setPaymentMethod] = useState<CustomerCreditPaymentMethod>("cash");
  const [adjustmentType, setAdjustmentType] = useState<"adjustment_debit" | "adjustment_credit">("adjustment_debit");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [runtimeNoticeActive, setRuntimeNoticeActive] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    amountInput.current?.focus();
    return () => { mounted.current = false; };
  }, []);

  const amountMinor = parseCreditAmount(amount);
  const availableDebt = account.balances.find((balance) => balance.currency === currency)?.amountMinor ?? 0;
  const reducingDebt = mode === "payment" || adjustmentType === "adjustment_credit";
  const validation = amount && amountMinor === null ? "Sıfırdan büyük, en fazla iki ondalıklı bir tutar girin."
    : reducingDebt && availableDebt <= 0 ? "Bu para biriminde açık borç yok."
      : reducingDebt && amountMinor !== null && amountMinor > availableDebt ? "Bu tutar mevcut borçtan büyük."
        : "";
  const valid = amountMinor !== null && /^[A-Z]{3}$/.test(currency) && !validation
    && (mode === "payment" || Boolean(note.trim()));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || loading || inFlight.current || account.customer.deletedAt) return;
    const bridge = window.yardimciDesktop?.commerce;
    if (!bridge) {
      setRuntimeNoticeActive(true);
      reportAppStatus("error", "Hesap kaydı kullanılamıyor. Uygulamayı yeniden başlatın.");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setRuntimeNoticeActive(false);
    onSavingChange(true);
    try {
      const input = { customerId: account.customer.id, amountMinor: amountMinor!, currency, note: note.trim(), source: "desktop-customer-credit" };
      const entry = mode === "payment"
        ? await bridge.recordCustomerCreditPayment({ ...input, paymentMethod })
        : await bridge.addCustomerCreditAdjustment({ ...input, entryType: adjustmentType });
      // The runtime already wrote finance atomically. Refresh the account from its API.
      notifyCustomerCreditChanged(account.customer.id);
      if (mounted.current) onSaved(mode === "payment"
        ? `${formatCreditMoney(entry.amountMinor, entry.currency)} tahsilat kaydedildi.`
        : "Düzeltme kaydedildi.");
    } catch (cause) {
      if (mounted.current) {
        setRuntimeNoticeActive(true);
        reportAppStatus("error", customerCreditError(cause, "Hareket kaydedilemedi. Yeniden deneyin."));
        notifyCustomerCreditChanged(account.customer.id);
      }
    } finally {
      inFlight.current = false;
      onSavingChange(false);
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <form className="form-stack customer-credit-form" aria-label={mode === "payment" ? "Tahsilat" : "Hesap düzeltmesi"} onSubmit={(event) => void submit(event)} noValidate
      onKeyDown={(event) => { if (event.key === "Escape" && !saving) { event.preventDefault(); onClose(); } }}>
      <h4>{mode === "payment" ? "Tahsilat al" : "Düzeltme"}</h4>
      {mode === "adjustment" && <p>Bu işlem mevcut kaydı silmez; yeni bir düzeltme hareketi oluşturur.</p>}
      <fieldset className="form-stack" disabled={saving || loading}>
        <legend>{mode === "payment" ? "Tahsilat bilgileri" : "Düzeltme bilgileri"}</legend>
        {mode === "adjustment" && <label className="form-field form-field--medium">Tür
          <select aria-label="Tür" value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value as typeof adjustmentType)}>
            <option value="adjustment_debit">Borcu artır</option><option value="adjustment_credit">Borcu azalt</option>
          </select>
        </label>}
        <div className="form-row">
          <label className="form-field form-field--short">Tutar
            <MoneyInput ref={amountInput} value={amount} onChange={setAmount} required autoFocus />
          </label>
          <label className="form-field form-field--medium">Para birimi
            {reducingDebt ? <select aria-label="Para birimi" value={currency} onChange={(event) => setCurrency(event.target.value)} required>
              {!account.balances.some((balance) => balance.currency === currency && balance.amountMinor > 0) && <option value={currency}>{currency}</option>}
              {account.balances.filter((balance) => balance.amountMinor > 0).map((balance) => <option key={balance.currency} value={balance.currency}>{balance.currency}</option>)}
            </select> : <input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required />}
          </label>
        </div>
        <p>Güncel borç: {formatCreditMoney(availableDebt, /^[A-Z]{3}$/.test(currency) ? currency : "TRY")}</p>
        {mode === "payment" && <label className="form-field form-field--medium">Ödeme yöntemi
          <select aria-label="Ödeme yöntemi" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as CustomerCreditPaymentMethod)}>
            {Object.entries(customerCreditPaymentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>}
        <label className="form-field form-field--fluid">{mode === "payment" ? "Not (isteğe bağlı)" : "Açıklama / neden (zorunlu)"}
          <textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} required={mode === "adjustment"} rows={2} />
        </label>
        {validation && !runtimeNoticeActive && <p role="alert" className="customer-credit-error">{validation}</p>}
        <div className="action-row">
          <ActionButton type="submit" disabled={!valid || saving || loading}>{saving ? "Kaydediliyor…" : mode === "payment" ? "Tahsilatı Kaydet" : "Düzeltmeyi Kaydet"}</ActionButton>
          <ActionButton variant="secondary" onClick={onClose}>Vazgeç</ActionButton>
        </div>
      </fieldset>
    </form>
  );
}
