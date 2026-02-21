self.addEventListener('push', (event) => {
    if (!event.data) {
        return;
    }

    let payload = {};
    try {
        payload = event.data.json();
    } catch (e) {
        payload = { title: 'PharmaConnect', body: event.data.text() };
    }

    const title = payload.title || 'PharmaConnect';
    const options = {
        body: payload.body || 'لديك إشعار جديد',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: {
            notificationId: payload.notificationId || null,
            type: payload.type || null,
            relatedId: payload.relatedId || null,
            url: '/'
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification?.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if ('focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
            return null;
        })
    );
});
