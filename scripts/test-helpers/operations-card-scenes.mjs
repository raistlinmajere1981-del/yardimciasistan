// Synthetic guests and accounts for actual React render checks; no application persistence.
export function seedOperationsCardScene({ kind, dense = false }) {
  const dashboard = window.fixtureState().dashboard;
  const date = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('sv-SE'); };
  const today = date(0);
  if (kind === 'pension') {
    const rooms = Array.from({ length: dense ? 18 : 6 }, (_, index) => ({ ...dashboard.rooms[0],
      id: `room-${101 + index}`, number: String(101 + index), name: `Oda ${101 + index}`, floor: index < 6 ? '1. kat' : '2. kat',
      status: ['cleaning', 'reserved', 'occupied', 'available', 'maintenance', 'available'][index % 6], sortOrder: index, capacity: 2, description: 'Bahçe manzaralı oda', bedInfo: '1 çift kişilik yatak' }));
    const stay = (index, status, name, start = -1, end = 2) => ({ id: `stay-${index}`, roomId: rooms[index].id,
      customerId: dashboard.customers[0].id, customerName: name, customerPhone: '', roomName: rooms[index].name,
      roomNumber: rooms[index].number, reservationId: '', checkInDate: date(start), checkOutDate: date(end),
      status, guestCount: 2, notes: '', createdAt: today, updatedAt: today, checkedInAt: '', checkedOutAt: '' });
    const stays = [stay(1, 'planned', 'Deniz Kaya', 0, 2), stay(2, 'checked_in', 'Ece Yılmaz'), stay(3, 'checked_out', 'Ali Demir', -5, -2),
      { ...stay(2, 'checked_out', 'Selin Aras', -8, -6), id: 'old-stay-2' }];
    const reservations = [0, 2, 4].map(index => ({ ...dashboard.reservations[0], id: `booking-${index}`, title: 'Konaklama rezervasyonu',
      customerName: ['Aylin Aksoy', 'Bora Deniz', 'Zeynep Eren'][index / 2], guestCount: 2,
      startDate: date(3), endDate: date(5), status: 'approved', roomIds: [rooms[index].id], tableIds: [], time: '' }));
    const tasks = Array.from({ length: dense ? 16 : 4 }, (_, index) => ({ ...dashboard.dailyTasks[0], id: `task-${index}`,
      title: ['Oda 101 temizliği', 'Giriş hazırlığı · 102', 'Havlu kontrolü', 'Bakım takibi · 105'][index % 4], priority: index === 0 ? 'high' : 'normal',
      relatedId: rooms[index % rooms.length].id, status: 'pending', notes: 'Giriş öncesi kontrol'  }));
    window.fixturePatch({ rooms, customerRoomStays: stays, reservations, dailyTasks: tasks });
    window.fixtureSetFolios(stays.filter(item => item.status !== 'planned').map((item, index) => ({
      id: `folio-${item.id}`, stayId: item.id, roomId: item.roomId, roomNumber: item.roomNumber, roomName: item.roomName,
      customerId: item.customerId, customerName: item.customerName, reservationId: '', status: 'open', guestCount: 2,
      checkInDate: item.checkInDate, plannedCheckOutDate: item.checkOutDate, nights: 2, nightlyPriceMinor: 180000,
      currency: 'TRY', lodgingTotalMinor: [360000, 85000, 125000][index], chargeTotalMinor: [360000, 85000, 125000][index],
      remainingMinor: [360000, 85000, 125000][index], paidTotalMinor: 0, lodgingManualOverride: false, items: [], payments: [], openedAt: `${today}T09:00:00Z`
    })).reverse()); // Old open account deliberately precedes current account.
  } else {
    const tables = Array.from({ length: dense ? 18 : 6 }, (_, index) => ({ ...dashboard.tables[0], id: `table-${index}`, name: `Masa ${index + 1}`,
      area: 'Salon', sortOrder: index, status: ['available', 'occupied', 'bill_waiting', 'cleaning', 'reserved', 'occupied'][index % 6] }));
    const reservations = [{ id: 'booking-table', reservationType: 'table', customerId: dashboard.customers[0].id,
      customerName: 'Derya Öz', title: 'Akşam yemeği', status: 'approved', startDate: today, endDate: today, time: '19:30', guestCount: 4,
      tableIds: ['table-4'], roomIds: [], notes: '' }];
    window.fixturePatch({ tables, reservations, dailyTasks: Array.from({ length: dense ? 16 : 4 }, (_, index) => ({ ...dashboard.dailyTasks[0], id: `task-${index}`, title: ["Servis hazırlığı", "Salon masa kontrolü", "Mutfak hazırlığı", "Kapanış kontrolü"][index % 4], taskType: "manual_restaurant", relatedType: "table", relatedId: tables[index % tables.length].id, status: "pending" })) });
    const orders = tables.flatMap((table, index) => [1, 2, 5].includes(index % 6) ? [{
      id: `order-${index}`, tableId: table.id, tableName: table.name, status: index % 6 === 2 ? 'payment' : index % 6 === 1 ? 'preparing' : 'open',
      openedAt: `${today}T09:15:00Z`, updatedAt: today, createdAt: today, closedAt: '', subtotal: 450, total: 450,
      discountTotal: 0, note: '', itemCount: 3, items: [{ id: `item-${index}`, orderId: `order-${index}`, menuItemId: 'menu-a', productName: 'Çay',
        quantity: 3, unitPrice: 150, lineTotal: 450, currency: 'TRY', note: '', status: 'open' }]
    }] : []);
    window.fixtureSetOrders(orders);
  }
}
