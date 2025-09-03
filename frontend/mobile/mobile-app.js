/**
 * CO-LAB CRM Mobile Application Core
 * Provides common mobile functionality and utilities
 */

class MobileApp {
    constructor() {
        this.apiBaseUrl = 'http://localhost:5001/api';
        this.authToken = localStorage.getItem('authToken');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTouchHandlers();
        this.setupPWA();
        this.checkAuth();
    }

    // Authentication
    checkAuth() {
        if (!this.authToken && !window.location.pathname.includes('login')) {
            window.location.href = './mobile-login.html';
        }
    }

    async login(email, password) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            
            if (response.ok) {
                this.authToken = data.token;
                this.user = data.user;
                localStorage.setItem('authToken', this.authToken);
                localStorage.setItem('user', JSON.stringify(this.user));
                return { success: true, user: this.user };
            } else {
                return { success: false, error: data.error };
            }
        } catch (error) {
            return { success: false, error: 'Ошибка соединения с сервером' };
        }
    }

    logout() {
        this.authToken = null;
        this.user = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = './mobile-login.html';
    }

    // API methods
    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`,
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (response.status === 401) {
                this.logout();
                return null;
            }
            
            return { success: response.ok, data, status: response.status };
        } catch (error) {
            console.error('API Request Error:', error);
            return { success: false, error: error.message };
        }
    }

    // UI Methods
    setupEventListeners() {
        // Mobile sidebar toggle
        document.addEventListener('click', (e) => {
            if (e.target.matches('.menu-toggle')) {
                this.toggleSidebar();
            }
            
            if (e.target.matches('.mobile-sidebar-close') || 
                e.target.matches('.mobile-overlay')) {
                this.closeSidebar();
            }
            
            // Bottom navigation
            if (e.target.closest('.mobile-bottom-nav-item')) {
                e.preventDefault();
                const href = e.target.closest('.mobile-bottom-nav-item').getAttribute('href');
                if (href) {
                    this.navigateTo(href);
                }
            }
            
            // Modal handling
            if (e.target.matches('.mobile-modal-close') || 
                e.target.matches('.mobile-modal')) {
                this.closeModal();
            }
        });

        // Form submissions
        document.addEventListener('submit', (e) => {
            if (e.target.matches('.mobile-form')) {
                e.preventDefault();
                this.handleFormSubmit(e.target);
            }
        });

        // Search input debouncing
        document.addEventListener('input', (e) => {
            if (e.target.matches('.mobile-search-input')) {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 300);
            }
        });
    }

    setupTouchHandlers() {
        // Swipe navigation for mobile
        let startX, startY, endX, endY;
        
        document.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            endX = e.changedTouches[0].clientX;
            endY = e.changedTouches[0].clientY;
            
            const deltaX = endX - startX;
            const deltaY = endY - startY;
            
            // Horizontal swipe
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (deltaX > 50 && startX < 50) {
                    // Swipe right from edge - open sidebar
                    this.openSidebar();
                } else if (deltaX < -50) {
                    // Swipe left - close sidebar
                    this.closeSidebar();
                }
            }
        }, { passive: true });
    }

    setupPWA() {
        // Register service worker for PWA functionality
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('SW registered:', registration);
                })
                .catch(error => {
                    console.log('SW registration failed:', error);
                });
        }

        // Install prompt
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            this.showInstallButton();
        });
    }

    // Navigation
    navigateTo(url) {
        // Add loading state
        this.showLoading();
        
        // Update active navigation
        document.querySelectorAll('.mobile-bottom-nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('href') === url) {
                item.classList.add('active');
            }
        });
        
        // Navigate
        setTimeout(() => {
            window.location.href = url;
        }, 100);
    }

    // Sidebar
    toggleSidebar() {
        const sidebar = document.querySelector('.mobile-sidebar');
        const overlay = document.querySelector('.mobile-overlay');
        
        if (sidebar && overlay) {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        }
    }

    openSidebar() {
        const sidebar = document.querySelector('.mobile-sidebar');
        const overlay = document.querySelector('.mobile-overlay');
        
        if (sidebar && overlay) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        }
    }

    closeSidebar() {
        const sidebar = document.querySelector('.mobile-sidebar');
        const overlay = document.querySelector('.mobile-overlay');
        
        if (sidebar && overlay) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
    }

    // Modals
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal() {
        document.querySelectorAll('.mobile-modal').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }

    // Loading states
    showLoading(containerId = 'main-content') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="mobile-loading">
                    <div class="mobile-spinner"></div>
                </div>
            `;
        }
    }

    hideLoading() {
        document.querySelectorAll('.mobile-loading').forEach(loader => {
            loader.remove();
        });
    }

    // Notifications
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `mobile-alert mobile-alert-${type}`;
        notification.textContent = message;
        
        // Position at top of screen
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.left = '16px';
        notification.style.right = '16px';
        notification.style.zIndex = '1003';
        
        document.body.appendChild(notification);
        
        // Animate in
        notification.style.transform = 'translateY(-100%)';
        notification.style.transition = 'transform 0.3s ease';
        setTimeout(() => {
            notification.style.transform = 'translateY(0)';
        }, 10);
        
        // Auto remove
        setTimeout(() => {
            notification.style.transform = 'translateY(-100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    // Form handling
    async handleFormSubmit(form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const action = form.getAttribute('action');
        const method = form.getAttribute('method') || 'POST';
        
        this.showLoading();
        
        try {
            const result = await this.apiRequest(action, {
                method,
                body: JSON.stringify(data)
            });
            
            this.hideLoading();
            
            if (result.success) {
                this.showNotification('Операция выполнена успешно', 'success');
                
                // Handle specific form actions
                if (form.hasAttribute('data-redirect')) {
                    setTimeout(() => {
                        window.location.href = form.getAttribute('data-redirect');
                    }, 1000);
                } else if (form.hasAttribute('data-refresh')) {
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            } else {
                this.showNotification(result.data?.error || 'Произошла ошибка', 'danger');
            }
        } catch (error) {
            this.hideLoading();
            this.showNotification('Ошибка соединения', 'danger');
        }
    }

    // Search
    handleSearch(query) {
        // Emit custom search event that pages can listen to
        const searchEvent = new CustomEvent('mobile-search', {
            detail: { query }
        });
        document.dispatchEvent(searchEvent);
    }

    // Utility methods
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB'
        }).format(amount);
    }

    formatPhone(phone) {
        if (!phone) return '';
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 11 && cleaned.startsWith('7')) {
            return `+7 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9)}`;
        }
        return phone;
    }

    // Local storage helpers
    setLocal(key, value) {
        localStorage.setItem(`colab_${key}`, JSON.stringify(value));
    }

    getLocal(key, defaultValue = null) {
        const item = localStorage.getItem(`colab_${key}`);
        return item ? JSON.parse(item) : defaultValue;
    }

    removeLocal(key) {
        localStorage.removeItem(`colab_${key}`);
    }

    // Device detection
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }

    isAndroid() {
        return /Android/.test(navigator.userAgent);
    }

    // Network status
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.showNotification('Соединение восстановлено', 'success', 2000);
        });

        window.addEventListener('offline', () => {
            this.showNotification('Нет соединения с интернетом', 'warning', 5000);
        });
    }

    isOnline() {
        return navigator.onLine;
    }

    // Pull to refresh
    setupPullToRefresh(callback) {
        let startY = 0;
        let currentY = 0;
        let pulling = false;
        const threshold = 80;

        document.addEventListener('touchstart', (e) => {
            if (window.pageYOffset === 0) {
                startY = e.touches[0].clientY;
                pulling = true;
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (pulling) {
                currentY = e.touches[0].clientY;
                const pullDistance = currentY - startY;

                if (pullDistance > 0 && pullDistance < threshold) {
                    // Show visual feedback
                    this.showPullIndicator(pullDistance / threshold);
                }
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (pulling) {
                const pullDistance = currentY - startY;
                if (pullDistance > threshold) {
                    callback();
                }
                pulling = false;
                this.hidePullIndicator();
            }
        }, { passive: true });
    }

    showPullIndicator(progress) {
        // Implementation for pull-to-refresh visual indicator
        let indicator = document.querySelector('.pull-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'pull-indicator';
            indicator.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 60px;
                background: var(--primary-color);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                transform: translateY(-60px);
                transition: transform 0.2s ease;
                z-index: 1001;
            `;
            indicator.innerHTML = '🔄 Потяните для обновления';
            document.body.prepend(indicator);
        }
        
        indicator.style.transform = `translateY(${-60 + (60 * progress)}px)`;
    }

    hidePullIndicator() {
        const indicator = document.querySelector('.pull-indicator');
        if (indicator) {
            indicator.style.transform = 'translateY(-60px)';
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 200);
        }
    }
}

// Initialize mobile app
const mobileApp = new MobileApp();

// Export for use in other scripts
window.MobileApp = MobileApp;
window.mobileApp = mobileApp;