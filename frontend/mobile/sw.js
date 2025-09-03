/**
 * CO-LAB CRM Mobile - Service Worker
 * Provides offline functionality and caching for PWA
 */

const CACHE_NAME = 'colab-crm-v1.0.0';
const OFFLINE_URL = './mobile-offline.html';

// Resources to cache on install
const STATIC_CACHE_URLS = [
    './',
    './mobile-dashboard.html',
    './mobile-login.html',
    './mobile-clients.html',
    './mobile-orders.html',
    './mobile-analytics.html',
    './mobile-styles.css',
    './mobile-app.js',
    './manifest.json'
];

// API responses to cache
const API_CACHE_PATTERNS = [
    /\/api\/clients/,
    /\/api\/orders/,
    /\/api\/products/,
    /\/api\/analytics/
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching static files');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('Service Worker: Installation complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Installation failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activation complete');
                return self.clients.claim();
            })
    );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-GET requests and chrome-extension requests
    if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Handle different types of requests
    if (isAPIRequest(request)) {
        event.respondWith(handleAPIRequest(request));
    } else if (isHTMLRequest(request)) {
        event.respondWith(handleHTMLRequest(request));
    } else if (isStaticAsset(request)) {
        event.respondWith(handleStaticAsset(request));
    }
});

// Check if request is for API
function isAPIRequest(request) {
    return request.url.includes('/api/');
}

// Check if request is for HTML page
function isHTMLRequest(request) {
    const url = new URL(request.url);
    return request.headers.get('accept')?.includes('text/html') ||
           url.pathname.endsWith('.html') ||
           url.pathname === '/';
}

// Check if request is for static asset
function isStaticAsset(request) {
    const url = new URL(request.url);
    const extension = url.pathname.split('.').pop();
    return ['css', 'js', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'woff', 'woff2'].includes(extension);
}

// Handle API requests - Network first, then cache
async function handleAPIRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        // If successful, cache the response (for GET requests)
        if (networkResponse.ok && request.method === 'GET') {
            // Check if this API should be cached
            const shouldCache = API_CACHE_PATTERNS.some(pattern => pattern.test(request.url));
            if (shouldCache) {
                cache.put(request, networkResponse.clone());
            }
        }
        
        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        console.log('Service Worker: Network failed, trying cache for', request.url);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            // Add offline indicator header
            const modifiedResponse = new Response(cachedResponse.body, {
                status: cachedResponse.status,
                statusText: cachedResponse.statusText,
                headers: {
                    ...cachedResponse.headers,
                    'X-Served-By': 'ServiceWorker-Cache'
                }
            });
            return modifiedResponse;
        }
        
        // Return offline data if available
        return createOfflineAPIResponse(request);
    }
}

// Handle HTML requests - Cache first, then network
async function handleHTMLRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    
    try {
        // Try cache first for faster loading
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            // Update cache in background
            fetch(request).then(response => {
                if (response.ok) {
                    cache.put(request, response.clone());
                }
            }).catch(() => {
                // Ignore network errors in background update
            });
            
            return cachedResponse;
        }
        
        // Not in cache, try network
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Both cache and network failed
        console.log('Service Worker: Both cache and network failed for HTML request');
        
        // Return cached offline page if available
        const offlineResponse = await cache.match(OFFLINE_URL);
        if (offlineResponse) {
            return offlineResponse;
        }
        
        // Return basic offline HTML
        return new Response(createOfflineHTML(), {
            status: 503,
            headers: { 'Content-Type': 'text/html' }
        });
    }
}

// Handle static assets - Cache first
async function handleStaticAsset(request) {
    const cache = await caches.open(CACHE_NAME);
    
    try {
        // Try cache first
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Not in cache, try network
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Service Worker: Failed to load static asset', request.url);
        
        // For images, return a placeholder
        if (request.url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
            return createPlaceholderImage();
        }
        
        throw error;
    }
}

// Create offline API response
function createOfflineAPIResponse(request) {
    const url = new URL(request.url);
    
    // Return appropriate offline data based on endpoint
    let offlineData = { error: 'Нет соединения с интернетом', offline: true };
    
    if (url.pathname.includes('/clients')) {
        offlineData = {
            data: {
                clients: getOfflineClients(),
                pagination: { total: getOfflineClients().length, page: 1 }
            },
            offline: true
        };
    } else if (url.pathname.includes('/orders')) {
        offlineData = {
            data: {
                orders: getOfflineOrders(),
                pagination: { total: getOfflineOrders().length, page: 1 }
            },
            offline: true
        };
    } else if (url.pathname.includes('/analytics')) {
        offlineData = {
            data: {
                message: 'Аналитика недоступна в офлайн режиме',
                cachedData: true
            },
            offline: true
        };
    }
    
    return new Response(JSON.stringify(offlineData), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'X-Served-By': 'ServiceWorker-Offline'
        }
    });
}

// Get offline clients data
function getOfflineClients() {
    return [
        {
            id: 'offline-1',
            name: 'Офлайн данные',
            email: 'offline@example.com',
            phone: '+7 (999) 999-99-99',
            createdAt: new Date().toISOString(),
            status: 'offline'
        }
    ];
}

// Get offline orders data  
function getOfflineOrders() {
    return [
        {
            id: 'offline-order-1',
            clientName: 'Офлайн заказ',
            status: 'PENDING',
            totalAmount: 0,
            createdAt: new Date().toISOString()
        }
    ];
}

// Create offline HTML page
function createOfflineHTML() {
    return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Офлайн - CO-LAB CRM</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    text-align: center;
                    padding: 40px 20px;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    margin: 0;
                }
                .offline-container {
                    max-width: 400px;
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 16px;
                    padding: 40px;
                }
                .offline-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                .offline-title {
                    font-size: 24px;
                    font-weight: 700;
                    margin: 0 0 16px;
                }
                .offline-message {
                    font-size: 16px;
                    opacity: 0.9;
                    margin: 0 0 24px;
                    line-height: 1.5;
                }
                .retry-btn {
                    background: rgba(255, 255, 255, 0.2);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    color: white;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .retry-btn:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
            </style>
        </head>
        <body>
            <div class="offline-container">
                <div class="offline-icon">📡</div>
                <h1 class="offline-title">Нет соединения</h1>
                <p class="offline-message">
                    Проверьте подключение к интернету и попробуйте снова.
                    Некоторые данные могут быть доступны из кеша.
                </p>
                <button class="retry-btn" onclick="window.location.reload()">
                    Попробовать снова
                </button>
            </div>
        </body>
        </html>
    `;
}

// Create placeholder image
function createPlaceholderImage() {
    // Simple 1x1 transparent PNG
    const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const buffer = Uint8Array.from(atob(transparentPng), c => c.charCodeAt(0));
    
    return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
    });
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync triggered', event.tag);
    
    if (event.tag === 'sync-offline-actions') {
        event.waitUntil(syncOfflineActions());
    }
});

// Sync offline actions when connection is restored
async function syncOfflineActions() {
    try {
        // Get offline actions from IndexedDB or localStorage
        const offlineActions = await getOfflineActions();
        
        for (const action of offlineActions) {
            try {
                // Retry the action
                const response = await fetch(action.url, {
                    method: action.method,
                    headers: action.headers,
                    body: action.body
                });
                
                if (response.ok) {
                    // Remove from offline queue
                    await removeOfflineAction(action.id);
                    
                    // Notify clients of successful sync
                    self.clients.matchAll().then(clients => {
                        clients.forEach(client => {
                            client.postMessage({
                                type: 'SYNC_SUCCESS',
                                action: action
                            });
                        });
                    });
                }
            } catch (error) {
                console.error('Service Worker: Failed to sync action', action, error);
            }
        }
    } catch (error) {
        console.error('Service Worker: Background sync failed', error);
    }
}

// Get offline actions (placeholder implementation)
async function getOfflineActions() {
    // In a real implementation, this would read from IndexedDB
    return [];
}

// Remove offline action (placeholder implementation)
async function removeOfflineAction(actionId) {
    // In a real implementation, this would remove from IndexedDB
    console.log('Removing offline action:', actionId);
}

// Push notification handling
self.addEventListener('push', (event) => {
    console.log('Service Worker: Push notification received');
    
    if (event.data) {
        const data = event.data.json();
        
        const options = {
            body: data.body || 'У вас есть новые уведомления',
            icon: './icons/icon-192x192.png',
            badge: './icons/badge-72x72.png',
            tag: data.tag || 'colab-notification',
            data: data.data || {},
            actions: [
                {
                    action: 'open',
                    title: 'Открыть',
                    icon: './icons/action-open.png'
                },
                {
                    action: 'close',
                    title: 'Закрыть',
                    icon: './icons/action-close.png'
                }
            ],
            requireInteraction: data.requireInteraction || false,
            silent: data.silent || false
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'CO-LAB CRM', options)
        );
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification clicked', event.action);
    
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        // Open the app
        event.waitUntil(
            clients.openWindow('./mobile-dashboard.html')
        );
    }
    
    // Handle other notification actions
    if (event.notification.data) {
        // Process notification data
        console.log('Notification data:', event.notification.data);
    }
});

// Message handling from clients
self.addEventListener('message', (event) => {
    console.log('Service Worker: Message received', event.data);
    
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'GET_CACHE_STATUS') {
        // Return cache status to client
        event.ports[0].postMessage({
            type: 'CACHE_STATUS',
            cacheName: CACHE_NAME,
            isOnline: navigator.onLine
        });
    } else if (event.data.type === 'CLEAR_CACHE') {
        // Clear specific cache
        caches.delete(event.data.cacheName || CACHE_NAME)
            .then(() => {
                event.ports[0].postMessage({
                    type: 'CACHE_CLEARED',
                    success: true
                });
            });
    }
});