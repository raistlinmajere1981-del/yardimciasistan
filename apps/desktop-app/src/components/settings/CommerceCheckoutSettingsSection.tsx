import type { CommerceCheckoutSettings } from "@yardimci-asistan/shared";

/** Fields join the existing Online Delivery service draft, save and leave guard. */
export function CommerceCheckoutSettingsSection({value,onChange,disabled}:{value:CommerceCheckoutSettings;onChange:(value:CommerceCheckoutSettings)=>void;disabled:boolean}) {
  const bank=value.bank || {name:"",accountHolder:"",iban:""};
  const legal=value.legal || {version:"",preliminary:"",agreement:""};
  return <section className="form-stack" aria-label="Online ödeme ayarları">
    <h3>Online ödeme</h3>
    <label className="form-check"><input type="checkbox" checked={value.enabled} disabled={disabled} onChange={event=>onChange({...value,enabled:event.target.checked})}/> Havale / EFT ile ödeme</label>
    <div className="form-grid">
      <label className="form-field">Para birimi<select value={value.currency} disabled={disabled} onChange={event=>onChange({...value,currency:event.target.value as CommerceCheckoutSettings["currency"]})}>{["TRY","EUR","USD","GBP"].map(currency=><option key={currency}>{currency}</option>)}</select></label>
      <label className="form-field">Kargo bedeli (boşsa tanımsız)<input type="number" min="0" step="0.01" value={value.shippingFeeMinor===null?"":value.shippingFeeMinor/100} disabled={disabled} onChange={event=>onChange({...value,shippingFeeMinor:event.target.value===""?null:Math.round(Number(event.target.value)*100)})}/></label>
      {([['name','Banka adı'],['accountHolder','Hesap sahibi'],['iban','IBAN']] as const).map(([key,label])=><label className="form-field" key={key}>{label}<input value={bank[key]} disabled={disabled} maxLength={key==='iban'?80:160} onChange={event=>onChange({...value,bank:{...bank,[key]:event.target.value}})}/></label>)}
      <label className="form-field">Sözleşme sürümü<input value={legal.version} disabled={disabled} maxLength={80} onChange={event=>onChange({...value,legal:{...legal,version:event.target.value}})}/></label>
      <label className="form-field form-field--span">Ön bilgilendirme<textarea value={legal.preliminary} disabled={disabled} rows={4} maxLength={20000} onChange={event=>onChange({...value,legal:{...legal,preliminary:event.target.value}})}/></label>
      <label className="form-field form-field--span">Satış sözleşmesi<textarea value={legal.agreement} disabled={disabled} rows={4} maxLength={20000} onChange={event=>onChange({...value,legal:{...legal,agreement:event.target.value}})}/></label>
    </div>
  </section>;
}
