// API Client for CO_LAB CRM
class APIClient {
    constructor() {
        this.baseURL = '/api'; // Use relative URL for same-origin
        this.token = localStorage.getItem('token');
    }

    // Helper method to make HTTP requests
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        // Add authorization header if token exists
        if (this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Add body for POST/PUT requests
        if (options.body && config.headers['Content-Type'] === 'application/json') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);
            
            // Handle different response types
            let data;
            const contentType = response.headers.get('Content-Type');
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                // Попытка распарсить как JSON если это похоже на JSON
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    data = text;
                }
            }

            if (!response.ok) {
                const error = new Error(data.message || data.error || `HTTP error! status: ${response.status}`);
                error.status = response.status;
                error.data = data;
                throw error;
            }

            return data;
        } catch (error) {
            if (error.status === 401) {
                // Token expired or invalid
                this.logout();
                throw new Error('Сессия истекла. Необходимо войти заново.');
            }
            throw error;
        }
    }

    // Update token
    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }

    // Clear token
    logout() {
        this.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }

    // Auth endpoints
    async register(email, name, password) {
        const response = await this.request('/auth/register', {
            method: 'POST',
            body: { email, name, password }
        });
        
        if (response.token) {
            this.setToken(response.token);
        }
        
        return response;
    }

    async login(email, password) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: { email, password }
        });
        
        if (response.token) {
            this.setToken(response.token);
        }
        
        return response;
    }

    async verifyToken() {
        return this.request('/auth/verify');
    }

    // Client endpoints
    async getClients(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/clients${query ? '?' + query : ''}`);
    }

    // Enhanced pagination methods for clients
    async getClientsPaginated(page = 1, limit = 20, sort = 'createdAt', order = 'DESC', search = '') {
        const params = { page, limit, sort, order };
        if (search) params.search = search;
        return this.getClients(params);
    }

    async searchClients(searchTerm, page = 1, limit = 20) {
        return this.getClientsPaginated(page, limit, 'createdAt', 'DESC', searchTerm);
    }

    async getClientsSorted(sortField, sortOrder = 'ASC', page = 1, limit = 20) {
        return this.getClientsPaginated(page, limit, sortField, sortOrder);
    }

    async getClient(id) {
        return this.request(`/clients/${id}`);
    }

    async createClient(clientData) {
        return this.request('/clients', {
            method: 'POST',
            body: clientData
        });
    }

    async updateClient(id, clientData) {
        return this.request(`/clients/${id}`, {
            method: 'PUT',
            body: clientData
        });
    }

    async deleteClient(id) {
        return this.request(`/clients/${id}`, {
            method: 'DELETE'
        });
    }

    async getClientHistory(id) {
        return this.request(`/clients/${id}/history`);
    }

    async getContractHistory(id) {
        return this.request(`/contracts/${id}/history`);
    }

    async getClientStats(id) {
        return this.request(`/clients/${id}/stats`);
    }

    // Product endpoints
    async getProducts(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/products${query ? '?' + query : ''}`);
    }

    // Enhanced pagination methods for products
    async getProductsPaginated(page = 1, limit = 20, sort = 'createdAt', order = 'DESC', search = '', filters = {}) {
        const params = { page, limit, sort, order, ...filters };
        if (search) params.search = search;
        return this.getProducts(params);
    }

    async searchProducts(searchTerm, page = 1, limit = 20) {
        return this.getProductsPaginated(page, limit, 'createdAt', 'DESC', searchTerm);
    }

    async getProductsSorted(sortField, sortOrder = 'ASC', page = 1, limit = 20) {
        return this.getProductsPaginated(page, limit, sortField, sortOrder);
    }

    async getProductsFiltered(filters = {}, page = 1, limit = 20) {
        return this.getProductsPaginated(page, limit, 'createdAt', 'DESC', '', filters);
    }

    async getLowStockProductsPaginated(page = 1, limit = 20) {
        return this.getProductsPaginated(page, limit, 'createdAt', 'DESC', '', { lowStock: 'true' });
    }

    async getProductsBySupplier(supplier, page = 1, limit = 20) {
        return this.getProductsPaginated(page, limit, 'name', 'ASC', '', { supplier });
    }

    async getProductsByPriceRange(minPrice, maxPrice, page = 1, limit = 20) {
        const priceRange = JSON.stringify({ min: minPrice, max: maxPrice });
        return this.getProductsPaginated(page, limit, 'purchasePrice', 'ASC', '', { priceRange });
    }

    async getProduct(id) {
        return this.request(`/products/${id}`);
    }

    async getProductStats(id) {
        return this.request(`/products/${id}/stats`);
    }

    async createProduct(productData) {
        return this.request('/products', {
            method: 'POST',
            body: productData
        });
    }

    async updateProduct(id, productData) {
        return this.request(`/products/${id}`, {
            method: 'PUT',
            body: productData
        });
    }

    async deleteProduct(id) {
        return this.request(`/products/${id}`, {
            method: 'DELETE'
        });
    }

    async getLowStockProducts() {
        return this.request('/products/alerts/low-stock');
    }

    // Warehouse endpoints
    async getWarehouseItems(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/warehouse${query ? '?' + query : ''}`);
    }

    async getWarehouseStats() {
        return this.request('/warehouse/stats');
    }

    async createTransaction(transactionData) {
        return this.request('/transactions', {
            method: 'POST',
            body: transactionData
        });
    }

    async getTransactions(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/transactions${query ? '?' + query : ''}`);
    }

    async getProductTransactions(productId, params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = `/products/${productId}/transactions${query ? '?' + query : ''}`;
        console.log('Requesting product transactions:', url);
        const result = await this.request(url);
        console.log('Product transactions response:', result);
        return result;
    }

    async getWarehouseProduct(productId) {
        return this.request(`/warehouse/products/${productId}`);
    }

    async updateProductQuantity(productId, quantity) {
        return this.request(`/warehouse/products/${productId}/quantity`, {
            method: 'PUT',
            body: { quantity }
        });
    }

    // Calculation endpoints
    async getCalculations(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/calculations${query ? '?' + query : ''}`);
    }

    async getCalculation(id) {
        return this.request(`/calculations/${id}`);
    }

    async createCalculation(calculationData) {
        return this.request('/calculations', {
            method: 'POST',
            body: calculationData
        });
    }

    async updateCalculation(id, calculationData) {
        return this.request(`/calculations/${id}`, {
            method: 'PUT',
            body: calculationData
        });
    }

    async deleteCalculation(id) {
        return this.request(`/calculations/${id}`, {
            method: 'DELETE'
        });
    }

    async duplicateCalculation(id) {
        return this.request(`/calculations/${id}/duplicate`, {
            method: 'POST'
        });
    }

    async getCalculationStats() {
        return this.request('/calculations/stats/overview');
    }

    async exportCalculation(id) {
        return this.request(`/calculations/${id}/export`);
    }

    // Profitability Analysis endpoint
    async calculateProfitabilityAnalysis(data) {
        return this.request('/calculations/profitability-analysis', {
            method: 'POST',
            body: data
        });
    }

    // Manager endpoints
    async getManagers(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/managers${query ? '?' + query : ''}`);
    }

    async getManager(id) {
        return this.request(`/managers/${id}`);
    }

    // File endpoints
    async uploadFiles(files, relatedId = null, relatedType = null) {
        const formData = new FormData();
        
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        if (relatedId) formData.append('relatedId', relatedId);
        if (relatedType) formData.append('relatedType', relatedType);

        return this.request('/files/upload', {
            method: 'POST',
            headers: {}, // Let browser set Content-Type for FormData
            body: formData
        });
    }

    async getFiles(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/files${query ? '?' + query : ''}`);
    }

    async getFile(id) {
        return this.request(`/files/${id}`);
    }

    async downloadFile(id) {
        const url = `${this.baseURL}/files/${id}/download`;
        const a = document.createElement('a');
        a.href = url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async deleteFile(id) {
        return this.request(`/files/${id}`, {
            method: 'DELETE'
        });
    }

    async updateFile(id, fileData) {
        return this.request(`/files/${id}`, {
            method: 'PUT',
            body: fileData
        });
    }

    async getFileStats() {
        return this.request('/files/stats/overview');
    }

    async bulkDeleteFiles(fileIds) {
        return this.request('/files/bulk', {
            method: 'DELETE',
            body: { fileIds }
        });
    }
}

// Create global API instance
const API = new APIClient();

// Extend API with serial numbers methods
Object.assign(API, {
    // Serial Numbers methods
    async getSerialNumbers(productId) {
        return this.request(`/serial-numbers/product/${productId}`);
    },

    async updateSerialNumbersStatus(serialNumbers, status) {
        return this.request('/serial-numbers/status', {
            method: 'PUT',
            body: { 
                serialNumbers: serialNumbers,
                status: status 
            }
        });
    },

    async getGroupedSerialNumbers(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/serial-numbers/grouped${queryString ? '?' + queryString : ''}`);
    },

    async createSerialNumbers(data) {
        return this.request('/serial-numbers', {
            method: 'POST',
            body: data
        });
    },

    async updateSerialNumber(id, data) {
        return this.request(`/serial-numbers/${id}`, {
            method: 'PUT',
            body: data
        });
    },

    async deleteSerialNumber(id) {
        return this.request(`/serial-numbers/${id}`, {
            method: 'DELETE'
        });
    },

    async searchSerialNumbers(query) {
        return this.request(`/serial-numbers/search?query=${encodeURIComponent(query)}`);
    },

    async getSerialNumberHistory(id) {
        return this.request(`/serial-numbers/${id}/history`);
    },

    // Orders methods
    async getOrders(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/orders${queryString ? '?' + queryString : ''}`);
    },

    async getOrder(id) {
        return this.request(`/orders/${id}`);
    },

    async createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: orderData
        });
    },

    async updateOrder(id, orderData) {
        return this.request(`/orders/${id}`, {
            method: 'PUT',
            body: orderData
        });
    },

    async deleteOrder(id) {
        return this.request(`/orders/${id}`, {
            method: 'DELETE'
        });
    },

    async getOrderStats() {
        return this.request('/orders/stats/overview');
    },

    async updateOrderStatus(id, status) {
        return this.request(`/orders/${id}/status`, {
            method: 'PATCH',
            body: { status }
        });
    },

    async createShipment(orderId, shipmentData) {
        return this.request(`/orders/${orderId}/shipment`, {
            method: 'POST',
            body: shipmentData
        });
    },

    async getOrderStats() {
        return this.request('/orders/stats/overview');
    },

    async getWarehousePendingOrders() {
        return this.request('/orders/warehouse/pending');
    },

    // Dialogue methods
    async getDialogues(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/dialogues${queryString ? '?' + queryString : ''}`);
    },

    async getDialogue(id) {
        return this.request(`/dialogues/${id}`);
    },

    async createDialogue(dialogueData) {
        return this.request('/dialogues', {
            method: 'POST',
            body: dialogueData
        });
    },

    async updateDialogue(id, dialogueData) {
        return this.request(`/dialogues/${id}`, {
            method: 'PUT',
            body: dialogueData
        });
    },

    async deleteDialogue(id) {
        return this.request(`/dialogues/${id}`, {
            method: 'DELETE'
        });
    },

    async getDialogueMessages(dialogueId, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/dialogues/${dialogueId}/messages${queryString ? '?' + queryString : ''}`);
    },

    async sendMessage(dialogueId, messageData) {
        return this.request(`/dialogues/${dialogueId}/messages`, {
            method: 'POST',
            body: messageData
        });
    },

    async updateMessage(messageId, messageData) {
        return this.request(`/messages/${messageId}`, {
            method: 'PUT',
            body: messageData
        });
    },

    // Dialogue pagination helper methods
    async getDialoguesPaginated(page = 1, limit = 20, sort = 'lastMessageAt', order = 'DESC', search = '', filters = {}) {
        const params = { page, limit, sort, order, ...filters };
        if (search) params.search = search;
        return this.getDialogues(params);
    },

    async searchDialogues(searchTerm, page = 1, limit = 20) {
        return this.getDialoguesPaginated(page, limit, 'lastMessageAt', 'DESC', searchTerm);
    },

    async getDialoguesByStatus(status, page = 1, limit = 20) {
        return this.getDialoguesPaginated(page, limit, 'lastMessageAt', 'DESC', '', { status });
    },

    async getDialoguesByPriority(priority, page = 1, limit = 20) {
        return this.getDialoguesPaginated(page, limit, 'lastMessageAt', 'DESC', '', { priority });
    },

    async getDialoguesByClient(clientId, page = 1, limit = 20) {
        return this.getDialoguesPaginated(page, limit, 'lastMessageAt', 'DESC', '', { clientId });
    },

    // Notification methods
    async getNotifications(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/notifications${queryString ? '?' + queryString : ''}`);
    },

    async getNotification(id) {
        return this.request(`/notifications/${id}`);
    },

    async createNotification(notificationData) {
        return this.request('/notifications', {
            method: 'POST',
            body: notificationData
        });
    },

    async updateNotification(id, notificationData) {
        return this.request(`/notifications/${id}`, {
            method: 'PUT',
            body: notificationData
        });
    },

    async deleteNotification(id) {
        return this.request(`/notifications/${id}`, {
            method: 'DELETE'
        });
    },

    async markNotificationAsRead(id) {
        return this.request(`/notifications/${id}/read`, {
            method: 'PATCH'
        });
    },

    async markNotificationAsUnread(id) {
        return this.request(`/notifications/${id}/unread`, {
            method: 'PATCH'
        });
    },

    async markAllNotificationsAsRead() {
        return this.request('/notifications/mark-all-read', {
            method: 'PATCH'
        });
    },

    async clearAllNotifications() {
        return this.request('/notifications/clear-all', {
            method: 'DELETE'
        });
    },

    async getUnreadNotificationsCount() {
        return this.request('/notifications/unread-count');
    },

    async getNotificationsByType(type, params = {}) {
        const queryString = new URLSearchParams({ ...params, type }).toString();
        return this.request(`/notifications?${queryString}`);
    },

    async getNotificationsPaginated(page = 1, limit = 20, sort = 'createdAt', order = 'DESC', filters = {}) {
        const params = { page, limit, sort, order, ...filters };
        return this.getNotifications(params);
    },

    async getRecentNotifications(limit = 5) {
        return this.getNotifications({ limit, sort: 'createdAt', order: 'DESC' });
    },

    async getNotificationSettings() {
        return this.request('/notifications/settings');
    },

    async updateNotificationSettings(settings) {
        return this.request('/notifications/settings', {
            method: 'PUT',
            body: settings
        });
    }
});

// Helper functions for common tasks
const APIHelpers = {
    // Check if user is authenticated
    isAuthenticated() {
        return !!localStorage.getItem('token');
    },

    // Get current user from localStorage
    getCurrentUser() {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },

    // Format error message for display
    formatError(error) {
        if (error.data && error.data.message) {
            return error.data.message;
        }
        return error.message || 'Произошла ошибка';
    },

    // Format currency
    formatCurrency(amount, currency = 'сум') {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }
        return amount.toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }) + ' ' + currency;
    },

    // Format date
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU');
    },

    // Format datetime
    formatDateTime(dateString) {
        if (!dateString) return 'Не указана';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Неверная дата';
        return date.toLocaleString('ru-RU');
    },

    // Show loading state
    showLoading(element, text = 'Загрузка...') {
        if (element) {
            element.innerHTML = `<div style="text-align: center; padding: 20px; color: #666;"><div class="loading"></div>${text}</div>`;
        }
    },

    // Show error state
    showError(element, message = 'Произошла ошибка') {
        if (element) {
            element.innerHTML = `<div style="text-align: center; padding: 20px; color: #dc3545;">${message}</div>`;
        }
    },

    // Show empty state
    showEmpty(element, message = 'Нет данных') {
        if (element) {
            element.innerHTML = `<div style="text-align: center; padding: 40px; color: #6c757d; font-style: italic;">${message}</div>`;
        }
    },

    // Debounce function for search
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Pagination helper methods
    buildPaginationParams(page, limit, sort, order, search, filters = {}) {
        const params = { page, limit, sort, order, ...filters };
        if (search && search.trim()) {
            params.search = search.trim();
        }
        return params;
    },

    getPaginationInfo(pagination) {
        const start = (pagination.page - 1) * pagination.limit + 1;
        const end = Math.min(pagination.page * pagination.limit, pagination.total);
        return {
            start,
            end,
            total: pagination.total,
            text: `Показано ${start}-${end} из ${pagination.total}`
        };
    },

    validateSortField(field, validFields = []) {
        return validFields.includes(field) ? field : validFields[0] || 'id';
    },

    validateSortOrder(order) {
        return ['ASC', 'DESC'].includes(order.toUpperCase()) ? order.toUpperCase() : 'ASC';
    },

    validatePageSize(size, min = 1, max = 100) {
        const num = parseInt(size);
        return Math.min(Math.max(num || min, min), max);
    },

    validatePage(page, totalPages = 1) {
        const num = parseInt(page);
        return Math.min(Math.max(num || 1, 1), totalPages);
    },

    // Format table data helper
    formatTableData(data, columns) {
        if (!Array.isArray(data)) return [];
        
        return data.map(item => {
            const row = {};
            columns.forEach(col => {
                if (typeof col === 'string') {
                    row[col] = item[col];
                } else if (col.field && col.format) {
                    row[col.field] = col.format(item[col.field], item);
                }
            });
            return row;
        });
    }
};

// Auth check for protected pages
function requireAuth() {
    if (!APIHelpers.isAuthenticated()) {
        window.location.href = 'simple-login.html';
        return false;
    }
    return true;
}

// Initialize auth check on page load
document.addEventListener('DOMContentLoaded', function() {
    // Skip auth check for login pages and test pages
    if (window.location.pathname.includes('login.html') || 
        window.location.pathname.includes('simple-login.html') ||
        window.location.pathname.includes('test-')) {
        return;
    }

    // Мягкая проверка авторизации - только проверяем наличие токена
    // Не делаем запрос к серверу, чтобы избежать проблем с CORS и двойной проверкой
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (!token || !user) {
        // Если нет токена или данных пользователя - перенаправляем на логин
        console.log('No auth data found, redirecting to login');
        window.location.href = 'simple-login.html';
        return;
    }
    
    // Если токен есть - продолжаем работу
    // Проверка токена на сервере будет выполняться при API запросах
});