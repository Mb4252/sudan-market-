self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'تنبيه جديد';
  const options = {
    body: data.body || 'هناك منشور جديد يطابق الفلتر الحالي.',
    icon: data.icon || '/public/icons/notify.png',
    badge: data.badge || '/public/icons/notify.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window'}).then(clientList => {
    if (clientList.length > 0) {
      return clientList[0].focus();
    }
    return clients.openWindow('/');
  }));
});