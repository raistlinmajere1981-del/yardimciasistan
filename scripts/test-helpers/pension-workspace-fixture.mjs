// Renderer fixture only. SQLite domain smokes independently verify the mutation semantics.
export function installPensionWorkspaceFixture({ dashboard, variant = 'all' }) {
  const clone = value => structuredClone(value);
  const capabilities = { staysEnabled: variant !== 'rooms-only', reservationsEnabled: variant !== 'rooms-only',
    folioEnabled: !['no-folio', 'rooms-only'].includes(variant),
    menuEnabled: ['all', 'no-inventory'].includes(variant),
    inventoryEnabled: variant !== 'no-inventory' };
  const room = dashboard.rooms[0];
  dashboard.rooms = ['101', '102', '103'].map((number, index) => ({ ...room, id: `room-${number}`, number, name: `Pilot ${number}`, status: index === 2 ? 'maintenance' : index === 0 ? 'cleaning' : 'available', isActive: true }));
  dashboard.customers = dashboard.customers.slice(0, 1).map(customer => ({ identityType: '', identityNumber: '', nationality: '', birthDate: '', gender: '', documentSerialNumber: '', documentExpiryDate: '', birthPlace: '', motherName: '', fatherName: '', issuingAuthority: '', address: '', stayCount: 0, ...customer }));
  const customer = dashboard.customers[0];
  const reservation = dashboard.reservations[0];
  dashboard.reservations = [0, 1].map((index) => ({ ...reservation, id: `booking-${index}`, customerId: customer.id, customerName: customer.fullName, title: `Pilot rezervasyon ${index}`, reservationType: 'room', status: 'approved', startDate: '2030-10-01', endDate: '2030-10-03', guestCount: 1, roomIds: [index === 0 ? 'room-101' : 'room-103'], notes: 'Bağlantı korunur' }));
  dashboard.customerRoomStays = [];
  dashboard.dailyTasks = [{ ...dashboard.dailyTasks[0], id: 'task-1', title: 'Pilot temizlik', taskType: 'manual_pension', status: 'pending', relatedType: 'room', relatedId: 'room-101' }];
  let sequence = 0;
  const folios = [];
  const menu = [{ id: 'tea', name: 'Çay', categoryId: 'drinks', categoryName: 'İçecekler', description: '', priceMinor: 5000, currency: 'TRY',
    stockQuantity: capabilities.inventoryEnabled ? 10 : 0, stockConsumptionQuantity: 1 }];
  if (!capabilities.inventoryEnabled) {
    dashboard.menu.items = dashboard.menu.items.map(item => ({ ...item, stock_quantity: 0 }));
  }
  const snapshot = () => {
    dashboard.revision = (dashboard.revision ?? 0) + 1;
    dashboard.roomOperations = dashboard.rooms.map(room => ({ roomId: room.id,
      stays: capabilities.staysEnabled ? dashboard.customerRoomStays.filter(stay => stay.roomId === room.id && ['planned', 'checked_in'].includes(stay.status)) : [],
      reservations: capabilities.reservationsEnabled ? dashboard.reservations.filter(item => item.roomIds.includes(room.id) && ['pending', 'approved'].includes(item.status)) : [],
      accounts: capabilities.folioEnabled ? folios.filter(item => item.roomId === room.id && item.status === 'open').map(item => ({
        folioId: item.id, stayId: item.stayId, stayStatus: dashboard.customerRoomStays.find(stay => stay.id === item.stayId)?.status ?? 'checked_out',
        customerName: item.customerName, remainingMinor: item.remainingMinor, currency: item.currency
      })) : []
    }));
    window.fixtureDashboard = clone(dashboard);
    return clone(dashboard);
  };
  snapshot();
  window.fixturePublish = () => window.fixturePublishDashboard?.(snapshot());
  window.fixturePatch = patch => { Object.assign(dashboard, clone(patch)); window.fixturePublish(); };
  window.fixtureSetFolios = next => { folios.splice(0, folios.length, ...clone(next)); window.fixturePublish(); };
  window.fixtureCapabilities = capabilities;
  window.fixtureCalls = [];
  window.fixtureReads = [];
  window.fixtureDelayReads = false;
  window.fixtureDelayPayment = false;
  window.fixtureFailPayment = false;
  const record = (kind, input) => window.fixtureCalls.push({ kind, input: clone(input) });
  const stamp = () => String(++sequence);
  const data = () => ({ generatedAt: stamp(), rooms: dashboard.rooms.map(item => ({ ...item, nightlyPriceMinor: 10000, currency: 'TRY' })),
    activeStays: dashboard.customerRoomStays.filter(stay => ['planned', 'checked_in'].includes(stay.status)), folios, menuCategories: [{ id: 'drinks', name: 'İçecekler' }], menuItems: menu });
  const success = (savedId = '', message = 'Kaydedildi.') => ({ ok: true, message, dashboardData: snapshot(), savedId });
  const financial = folio => { window.fixturePublish(); return { ok: true, message: 'Hesap güncellendi.', data: clone(data()), folioId: folio.id }; };
  const totals = folio => { folio.chargeTotalMinor = folio.lodgingTotalMinor + folio.items.reduce((sum, item) => sum + item.lineTotalMinor, 0); folio.paidTotalMinor = folio.payments.reduce((sum, payment) => sum + payment.amountMinor, 0); folio.remainingMinor = folio.chargeTotalMinor - folio.paidTotalMinor; };
  const openFolioFor = stay => {
    let folio = folios.find(item => item.stayId === stay.id);
    if (!folio) { folio = { id: `folio-${stay.id}`, stayId: stay.id, roomId: stay.roomId, roomName: stay.roomName, roomNumber: stay.roomNumber, customerId: stay.customerId, customerName: stay.customerName,
      reservationId: stay.reservationId, status: 'open', guestCount: stay.guestCount, checkInDate: stay.checkInDate, plannedCheckOutDate: stay.checkOutDate,
      nights: 2, nightlyPriceMinor: 10000, currency: 'TRY', lodgingTotalMinor: 20000, lodgingManualOverride: false, chargeTotalMinor: 20000, paidTotalMinor: 0, remainingMinor: 20000, items: [], payments: [], openedAt: '2030-10-01T10:00:00Z' }; folios.push(folio); }
    return folio;
  };
  const makeStay = (input, reservationId = '') => {
    const selectedRoom = dashboard.rooms.find(item => item.id === input.roomId);
    const status = input.status === 'checked_in' ? 'checked_in' : 'planned';
    if (status === 'checked_in' && capabilities.folioEnabled && window.fixtureFailOpening) {
      return { ok: false, message: 'Giriş tamamlanamadı; konaklama, misafir ve hesap değişiklikleri geri alındı.' };
    }
    const now = stamp();
    const guestIds = Array.isArray(input.guestCustomerIds) && input.guestCustomerIds.length ? input.guestCustomerIds : [input.customerId];
    const stay = { ...input, guestCount: guestIds.length || Number(input.guestCount ?? 1), id: `stay-${stamp()}`, reservationId, customerId: guestIds[0] ?? input.customerId, customerName: customer.fullName, customerPhone: customer.phone, roomName: selectedRoom.name, roomNumber: selectedRoom.number, status, createdAt: now, updatedAt: now, checkedInAt: status === 'checked_in' ? now : '', checkedOutAt: '',
      guests: guestIds.map((customerId, index) => ({ id: `guest-${now}-${index}`, customerId, customerName: customer.fullName, status, checkedInAt: status === 'checked_in' ? now : '', checkedOutAt: '', identityReady: true })),
      pendingNotificationCount: 0 };
    dashboard.customerRoomStays.push(stay); selectedRoom.status = status === 'checked_in' ? 'occupied' : 'reserved'; selectedRoom.updatedAt = stamp();
    // Desktop arrival coordinates the enabled Folio in the same entry transaction.
    if (status === 'checked_in' && capabilities.folioEnabled && !window.fixtureFailOpening) {
      openFolioFor(stay);
      return success(stay.id, 'Misafir girişi tamamlandı · Oda hesabı açıldı.');
    }
    return success(stay.id, 'Misafir girişi tamamlandı.');
  };
  window.fixtureState = () => clone({ dashboard, folios, menu });
  window.yardimciDesktop = {
    listRoomMediaCoverPreviews: async () => dashboard.rooms.slice(0, 1).map(room => ({
      resourceId: room.id,
      previewDataUrl: "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22640%22%20height=%22400%22%3E%3Crect%20width=%22640%22%20height=%22400%22%20fill=%22%23888%22/%3E%3C/svg%3E"
    })),
    getRoomFolioData: async roomId => {
      record('read', { roomId });
      const snapshot = clone(data());
      if (window.fixtureDelayReads) return new Promise((resolve, reject) => window.fixtureReads.push({ resolve: (patch = {}) => resolve({ ...snapshot, ...patch }), reject }));
      return snapshot;
    },
    saveManualReservation: async input => { record('assignment', input); const booking = dashboard.reservations.find(item => item.id === input.reservationId); booking.roomIds = input.roomId ? [input.roomId] : []; return success(booking.id); },
    createStayFromReservation: async input => { record('linked', input); const booking = dashboard.reservations.find(item => item.id === input.reservationId); return makeStay({ roomId: input.roomId, customerId: input.primaryCustomerId ?? booking.customerId, guestCustomerIds: input.guestCustomerIds ?? [input.primaryCustomerId ?? booking.customerId], checkInDate: booking.startDate, checkOutDate: booking.endDate, guestCount: booking.guestCount, notes: booking.notes, status: input.status === 'checked_in' ? 'checked_in' : 'planned' }, booking.id); },
    assignCustomerRoom: async input => { record('manual', input); return makeStay(input); },
    updateRoomStatus: async input => { record('room-status', input); if (window.fixtureDelayRoom) await new Promise(resolve => { window.fixtureReleaseRoom = resolve; }); if (window.fixtureFailRoom) return { ok: false, message: 'Oda durumu kaydedilemedi.' }; const selectedRoom = dashboard.rooms.find(item => item.id === input.roomId); selectedRoom.status = input.status; selectedRoom.updatedAt = stamp(); return success(); },
    checkInStay: async stayId => { record('check-in', stayId); const stay = dashboard.customerRoomStays.find(item => item.id === stayId); stay.status = 'checked_in'; stay.checkedInAt = stamp(); stay.updatedAt = stamp(); dashboard.rooms.find(item => item.id === stay.roomId).status = 'occupied'; return success(stayId); },
    openRoomFolio: async stayId => {
      record('open-account', stayId);
      if (window.fixtureFailOpening) return { ok: false, message: 'Hesap açılamadı.' };
      const stay = dashboard.customerRoomStays.find(item => item.id === stayId);
      if (stay.status !== 'checked_in') throw Error('Explicit check-in required');
      return financial(openFolioFor(stay));
    },
    updateRoomFolioDetails: async input => {
      record('folio-details', input);
      const folio = folios.find(item => item.id === input.folioId);
      if (!folio) return { ok: false, message: 'Hesap bulunamadı.' };
      folio.guestCount = input.guestCount;
      folio.checkInDate = input.checkInDate;
      folio.plannedCheckOutDate = input.plannedCheckOutDate;
      folio.nightlyPriceMinor = input.nightlyPriceMinor;
      folio.lodgingManualOverride = Boolean(input.lodgingManualOverride);
      const start = Date.parse(`${input.checkInDate}T00:00:00Z`);
      const end = input.plannedCheckOutDate ? Date.parse(`${input.plannedCheckOutDate}T00:00:00Z`) : start;
      folio.nights = Math.max(1, Math.round((end - start) / 86400000));
      folio.lodgingTotalMinor = folio.lodgingManualOverride
        ? Number(input.lodgingTotalMinor ?? folio.lodgingTotalMinor)
        : folio.nightlyPriceMinor * folio.nights;
      const stay = dashboard.customerRoomStays.find(item => item.id === folio.stayId);
      if (stay) {
        stay.checkInDate = input.checkInDate;
        stay.checkOutDate = input.plannedCheckOutDate;
        stay.guestCount = input.guestCount;
      }
      totals(folio);
      return financial(folio);
    },
    updateCustomerRoomStayStatus: async ({ stayId, status }) => { record('stay-status', { stayId, status }); const stay = dashboard.customerRoomStays.find(item => item.id === stayId); stay.status = status; stay.updatedAt = stamp(); return success(stayId); },
    addStayGuest: async ({ stayId, customerId }) => {
      record('add-guest', { stayId, customerId });
      const stay = dashboard.customerRoomStays.find(item => item.id === stayId);
      const selectedCustomer = dashboard.customers.find(item => item.id === customerId);
      if (!stay || !selectedCustomer) return { ok: false, message: 'Misafir eklenemedi.' };
      if (stay.guests.some(guest => guest.customerId === customerId && ['planned', 'checked_in'].includes(guest.status))) {
        return success(stay.id, 'Misafir zaten bu konaklamada.');
      }
      if (stay.guests.filter(guest => ['planned', 'checked_in'].includes(guest.status)).length >= 50) {
        return { ok: false, message: 'Bir konaklamaya en fazla 50 misafir eklenebilir.' };
      }
      stay.guests.push({
        id: `guest-${stamp()}`,
        customerId,
        customerName: selectedCustomer.fullName,
        status: stay.status,
        checkedInAt: stay.status === 'checked_in' ? stamp() : '',
        checkedOutAt: '',
        identityReady: true
      });
      stay.guestCount = stay.guests.filter(guest => ['planned', 'checked_in'].includes(guest.status)).length;
      const folio = folios.find(item => item.stayId === stay.id && item.status === 'open');
      if (folio) folio.guestCount = stay.guestCount;
      return success(stay.id, 'Misafir konaklamaya eklendi.');
    },
    checkoutStay: async stayId => { record('checkout', stayId); const stay = dashboard.customerRoomStays.find(item => item.id === stayId); stay.status = 'checked_out'; stay.checkedOutAt = stamp(); stay.updatedAt = stamp(); dashboard.rooms.find(item => item.id === stay.roomId).status = 'cleaning'; const folio = folios.find(item => item.stayId === stayId); if (folio?.remainingMinor === 0) folio.status = 'closed'; return success(stayId, 'Misafir çıkışı tamamlandı. Oda temizlik bekliyor.'); },
    addRoomFolioPayment: async input => {
      record('payment', input);
      if (window.fixtureDelayPayment) await new Promise(resolve => { window.fixtureReleasePayment = resolve; });
      if (window.fixtureFailPayment) return { ok: false, message: 'Ödeme reddedildi.' };
      const folio = folios.find(item => item.id === input.folioId);
      folio.payments.push({ id: `payment-${stamp()}`, origin: 'direct', paidAt: '2030-10-01T11:00:00Z', ...input }); totals(folio); return financial(folio);
    },
    voidRoomFolioPayment: async id => { record('void-payment', id); const folio = folios.find(item => item.payments.some(payment => payment.id === id)); folio.payments = folio.payments.filter(payment => payment.id !== id); totals(folio); return financial(folio); },
    checkoutRoomFolio: async input => { record('close-account', input); const folio = folios.find(item => item.id === input.folioId); if (folio.remainingMinor > 0) return { ok: false, message: 'Borç var.' }; folio.status = 'closed'; return financial(folio); },
    addRoomFolioMenuItem: async input => { record('menu', input); const folio = folios.find(item => item.id === input.folioId); const item = menu[0]; if (capabilities.inventoryEnabled) item.stockQuantity--; folio.items.push({ id: `item-${stamp()}`, menuItemId: item.id, kind: 'menu', label: item.name, quantity: 1, unitPriceMinor: item.priceMinor, lineTotalMinor: item.priceMinor, note: '' }); totals(folio); return financial(folio); },
    updateRoomFolioItemQuantity: async input => { record('quantity', input); const folio = folios.find(item => item.items.some(line => line.id === input.itemId)); const item = folio.items.find(line => line.id === input.itemId); if (capabilities.inventoryEnabled) menu[0].stockQuantity -= input.quantity - item.quantity; item.quantity = input.quantity; item.lineTotalMinor = item.unitPriceMinor * item.quantity; totals(folio); return financial(folio); },
    removeRoomFolioItem: async id => { record('remove', id); const folio = folios.find(item => item.items.some(line => line.id === id)); const item = folio.items.find(line => line.id === id); if (capabilities.inventoryEnabled && item.kind === 'menu') menu[0].stockQuantity += item.quantity; folio.items = folio.items.filter(line => line.id !== id); totals(folio); return financial(folio); },
    addRoomFolioManualItem: async input => { record('charge', input); const folio = folios.find(item => item.id === input.folioId); folio.items.push({ ...input, id: `item-${stamp()}`, lineTotalMinor: input.kind === 'discount' ? -input.amountMinor : input.amountMinor }); totals(folio); return financial(folio); },
    setRoomFolioDiscount: async input => {
      record('discount', input);
      const folio = folios.find(item => item.id === input.folioId);
      if (!folio) return { ok: false, message: 'Hesap bulunamadı.' };
      folio.items = folio.items.filter(item => item.kind !== 'discount');
      if (input.amountMinor > 0) {
        folio.items.push({
          id: `item-${stamp()}`,
          folioId: input.folioId,
          kind: 'discount',
          menuItemId: '',
          label: 'İndirim',
          unitPriceMinor: input.amountMinor,
          quantity: 1,
          lineTotalMinor: -input.amountMinor,
          note: ''
        });
      }
      totals(folio);
      return financial(folio);
    }
  };
}
