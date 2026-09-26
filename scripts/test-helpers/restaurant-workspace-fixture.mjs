export function installRestaurantWorkspaceFixture({ dashboard, variant }) {
  const copy = value => structuredClone(value);
  const calls = []; let orders = []; let finance = 0; let transfers = 0;
  const now = new Date().toISOString();
  const table = (id, name, area) => ({ id, name, area, capacity: 4, status: 'available', isActive: true,
    currentCustomerId: '', currentReservationId: '', activeReservationTitle: '', notes: '', sortOrder: 0, updatedAt: now });
  dashboard.tables = [table('table-a', 'Bahçe 1', 'Bahçe'), table('table-b', 'Salon 1', 'Salon')];
  dashboard.customers = [{ ...dashboard.customers[0], id: 'customer-a', fullName: 'Pilot Misafir', phone: '05550000000' }];
  dashboard.reservations = [];
  dashboard.menu.categories = [{ id: 'category-a', name: 'İçecek', is_active: true, sort_order: 1 }];
  dashboard.menu.items = [{ id: 'menu-a', name: 'Çay', description: '', category_id: 'category-a', is_available: true,
    price: 25, currency: 'TRY', stock_quantity: 8, stock_unit: 'piece', stock_consumption_quantity: 1, sort_order: 1 },
    { id: 'menu-b', name: 'Tükenen', description: '', category_id: 'category-a', is_available: true,
      price: 10, currency: 'TRY', stock_quantity: 0, stock_unit: 'piece', stock_consumption_quantity: 1, sort_order: 2 }];
  const capabilities = { ordersEnabled: variant !== 'tables-only', menuEnabled: variant !== 'no-menu',
    reservationsEnabled: variant !== 'no-reservations', customersEnabled: variant !== 'no-customers',
    roomFolioTransferEnabled: !['no-transfer', 'tables-only'].includes(variant) };
  const snapshot = () => {
    dashboard.revision = (dashboard.revision ?? 0) + 1;
    dashboard.tableOperations = dashboard.tables.map(table => ({ tableId: table.id,
      order: capabilities.ordersEnabled ? orders.filter(item => item.tableId === table.id && !['paid', 'cancelled'].includes(item.status)).map(item => ({
        id: item.id, status: item.status, itemCount: item.itemCount, total: item.total, openedAt: item.openedAt, updatedAt: item.updatedAt, currency: 'TRY'
      }))[0] ?? null : null,
      reservations: capabilities.reservationsEnabled ? dashboard.reservations.filter(item => item.tableIds.includes(table.id) && ['pending', 'approved'].includes(item.status)) : []
    }));
    window.fixtureDashboard = copy(dashboard);
    return copy(dashboard);
  };
  snapshot();
  window.fixturePatch = patch => { Object.assign(dashboard, copy(patch)); window.fixturePublishDashboard?.(snapshot()); };
  window.fixtureSetOrders = next => { orders = copy(next); window.fixturePublishDashboard?.(snapshot()); };
  window.fixtureCapabilities = capabilities; window.fixtureDashboard = dashboard; window.fixtureCalls = calls;
  window.fixtureState = () => copy({ orders, dashboard, finance, transfers });
  const wait = kind => window[`fixtureDelay${kind}`] ? new Promise(resolve => { window[`fixtureResolve${kind}`] = resolve; }) : Promise.resolve();
  const orderFor = id => orders.find(order => order.id === id);
  const itemOrder = id => orders.find(order => order.items.some(item => item.id === id));
  const result = order => {
    order.total = order.subtotal = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    order.itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    order.items.forEach(item => { item.lineTotal = item.quantity * item.unitPrice; });
    order.updatedAt = new Date().toISOString();
    const resource = dashboard.tables.find(table => table.id === order.tableId);
    resource.status = ['paid', 'cancelled'].includes(order.status) ? 'available' : order.status === 'payment' ? 'bill_waiting' : 'occupied';
    return copy({ ok: true, message: 'İşlem kaydedildi.', order, dashboardData: snapshot() });
  };
  window.yardimciDesktop = {
    getDashboardData: async () => snapshot(),
    listTableOrders: async () => { calls.push({ kind: 'list' }); return copy(orders); },
    getActiveTableOrder: async id => {
      calls.push({ kind: 'inspect', id });
      const snapshot = copy(orders.find(order => order.tableId === id && !['paid', 'cancelled'].includes(order.status)) ?? null);
      await wait('Read');
      if (window.fixtureRejectRead) throw new Error('read failed');
      return snapshot;
    },
    openTableOrder: async id => {
      calls.push({ kind: 'start', id }); await wait('Start'); if (window.fixtureFailStart) return { ok: false, message: 'Adisyon açılamadı.' };
      let order = orders.find(order => order.tableId === id && !['paid', 'cancelled'].includes(order.status));
      if (!order) { order = { id: `order-${orders.length}`, tableId: id, tableName: dashboard.tables.find(table => table.id === id).name,
        status: 'open', openedAt: now, closedAt: '', subtotal: 0, discountTotal: 0, total: 0, note: '', items: [], itemCount: 0, createdAt: now, updatedAt: now }; orders.unshift(order); }
      return result(order);
    },
    addTableOrderItem: async (id, menuId) => {
      calls.push({ kind: 'add', id }); const order = orderFor(id), product = dashboard.menu.items.find(item => item.id === menuId);
      if (!capabilities.menuEnabled || product.stock_quantity < 1) return { ok: false, message: 'Stok yok.' };
      product.stock_quantity--;
      order.items.push({ id: `item-${order.id}-${order.items.length}`, orderId: id, menuItemId: menuId, productName: product.name,
        unitPrice: product.price, currency: 'TRY', quantity: 1, lineTotal: product.price, note: '', status: 'open' });
      return result(order);
    },
    updateTableOrderItemQuantity: async (id, quantity) => {
      calls.push({ kind: 'quantity', id, quantity }); const order = itemOrder(id), item = order.items.find(item => item.id === id);
      dashboard.menu.items[0].stock_quantity += item.quantity - quantity; item.quantity = quantity; return result(order);
    },
    updateTableOrderItemNote: async (id, note) => {
      calls.push({ kind: 'note', id, note }); await wait('Note');
      if (window.fixtureFailNote) return { ok: false, message: 'Not reddedildi.' };
      const order = itemOrder(id); order.items.find(item => item.id === id).note = note; return result(order);
    },
    removeTableOrderItem: async id => {
      calls.push({ kind: 'remove', id }); const order = itemOrder(id);
      dashboard.menu.items[0].stock_quantity += order.items.find(item => item.id === id).quantity;
      order.items = order.items.filter(item => item.id !== id); return result(order);
    },
    updateTableOrderStatus: async (id, status) => { calls.push({ kind: 'status', id, status }); const order = orderFor(id); order.status = status; return result(order); },
    closeTableOrder: async (id, status) => {
      calls.push({ kind: 'close', id, status }); await wait('Close');
      if (window.fixtureFailClose) return { ok: false, message: 'Kapatma reddedildi.' };
      const order = orderFor(id); if (['paid', 'cancelled'].includes(order.status)) return { ok: false, message: 'Kapalı.' };
      order.status = status; order.closedAt = new Date().toISOString(); if (status === 'paid') finance++;
      return result(order);
    },
    updateTableStatus: async ({ tableId, status }) => { calls.push({ kind: 'table-status' }); dashboard.tables.find(table => table.id === tableId).status = status; return copy({ ok: true, message: 'Masa durumu güncellendi.', dashboardData: snapshot() }); },
    getRoomFolioData: async () => { calls.push({ kind: 'folios' }); await wait('Folio'); return { folios: [{ id: 'folio-a', status: 'open', roomNumber: '101', customerName: 'Pilot Misafir' }] }; },
    addRoomFolioManualItem: async input => {
      calls.push({ kind: 'transfer', input }); await wait('Transfer');
      if (window.fixtureFailTransfer) return { ok: false, message: 'Aktarım reddedildi.' };
      const order = orderFor(input.sourceTableOrderId); order.status = 'paid'; order.closedAt = now; transfers++; result(order);
      return { ok: true, message: 'Oda hesabına aktarıldı.', data: { folios: [] } };
    },
    saveCustomer: async input => {
      const customer = { ...dashboard.customers[0], ...input, id: 'customer-new' }; dashboard.customers.push(customer);
      return copy({ ok: true, message: 'Müşteri kaydedildi.', savedId: customer.id, dashboardData: snapshot() });
    },
    saveManualRestaurantReservation: async input => {
      calls.push({ kind: 'reservation', input });
      dashboard.reservations.push({ id: 'reservation-a', reservationType: 'table', customerId: input.customerId,
        customerName: dashboard.customers.find(customer => customer.id === input.customerId).fullName,
        title: 'Pilot rezervasyon', status: 'approved', startDate: input.date, endDate: input.date, time: input.time,
        guestCount: input.guestCount, notes: input.notes, tableIds: input.tableId ? [input.tableId] : [], roomIds: [] });
      return copy({ ok: true, message: 'Rezervasyon kaydedildi.', dashboardData: snapshot() });
    }
  };
}
