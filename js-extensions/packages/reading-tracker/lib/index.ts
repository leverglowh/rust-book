// Reading position tracker for The Rust Book
// Automatically tracks and syncs reading progress with the server

interface ReadingPosition {
  page: string;
  scroll_position: number;
  progress_percent: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

interface ServerConfig {
  enabled: boolean;
  ssoEnabled: boolean;
  singleUserMode: boolean;
  user: User | null;
}

class ReadingTracker {
  private debounceTimer: number | null = null;
  private readonly DEBOUNCE_DELAY = 2000; // 2 seconds
  private readonly API_URL = '/api';
  private user: User | null = null;
  private ssoEnabled: boolean = false;
  private singleUserMode: boolean = false;

  constructor() {
    this.init();
  }

  private async init() {
    // Fetch config from API instead of window object
    const config = await this.fetchConfig();
    if (!config || !config.enabled) {
      console.log('ReadingTracker: Server mode not enabled.');
      return; // Server mode not enabled
    }

    this.ssoEnabled = config.ssoEnabled || false;
    this.singleUserMode = config.singleUserMode || false;
    this.user = config.user || null;

    // Load and restore last reading position
    if (!sessionStorage.getItem('reading-tracker-initialized')) {
      await this.loadLastPosition();
      sessionStorage.setItem('reading-tracker-initialized', 'true');
    }

    // Show user info if logged in
    this.displayUserInfo();

    // Set up tracking
    this.setupTracking();
  }

  private async fetchConfig(): Promise<ServerConfig | null> {
    try {
      const response = await fetch(`${this.API_URL}/config`, {
        credentials: 'include'
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch server config:', error);
      return null;
    }
  }

  private async loadLastPosition() {
    try {
      const response = await fetch(`${this.API_URL}/reading-position`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const position: ReadingPosition | null = await response.json();
        
        if (position && position.page !== window.location.pathname) {
          // User was reading a different page
          window.location.href = position.page;
        } else if (position && position.scroll_position > 0) {
          // Same page, restore scroll position
          window.scrollTo(0, position.scroll_position);
        }
      }
    } catch (error) {
      console.error('Failed to load reading position:', error);
    }
  }

  private getPageTitle(path: string): string {
    // Extract page title from path (simplified)
    const parts = path.split('/');
    const filename = parts[parts.length - 1] || 'index.html';
    return filename.replace('.html', '').replace(/-/g, ' ');
  }

  private setupTracking() {
    // Track scroll position
    window.addEventListener('scroll', () => {
      this.debouncedSavePosition();
    });

    // Save on page unload
    window.addEventListener('beforeunload', () => {
      this.savePositionNow();
    });

    // Save periodically (every 30 seconds if scrolling has stopped)
    setInterval(() => {
      this.savePositionNow();
    }, 30000);
  }

  private debouncedSavePosition() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      this.savePositionNow();
    }, this.DEBOUNCE_DELAY);
  }

  private savePositionNow() {
    const position = this.getCurrentPosition();
    
    // Use sendBeacon for reliable delivery on page unload
    const data = JSON.stringify(position);
    const blob = new Blob([data], { type: 'application/json' });
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${this.API_URL}/reading-position`, blob);
      this.showSaveIndicator();
    } else {
      // Fallback to fetch
      fetch(`${this.API_URL}/reading-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        credentials: 'include',
        keepalive: true
      }).then(() => {
        // Successfully saved
        this.showSaveIndicator();
      }).catch(err => console.error('Failed to save position:', err));
    }
  }

  private getCurrentPosition(): ReadingPosition {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // Calculate reading progress percentage
    const scrollableHeight = documentHeight - windowHeight;
    const progressPercent = scrollableHeight > 0 
      ? (scrollPosition / scrollableHeight) * 100 
      : 0;

    return {
      page: window.location.pathname,
      scroll_position: scrollPosition,
      progress_percent: Math.min(100, progressPercent)
    };
  }

  private displayUserInfo() {
    if (this.singleUserMode) {
      const style = document.createElement('style');
      style.textContent = `
        .rust-book-save-indicator {
          position: fixed;
          top: 5rem;
          right: 1rem;
          z-index: 1000;
        }
        
        .save-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(76, 175, 80, 0.1);
          color: #4caf50;
          padding: 0.5rem 1rem;
          border-radius: 2rem;
          font-size: 0.875rem;
          font-weight: 500;
          border: 1px solid rgba(76, 175, 80, 0.3);
        }
        
        .save-info svg {
          flex-shrink: 0;
        }
      `;
      document.head.appendChild(style);
      // In single-user mode, show a subtle indicator that data is being saved
      // this.showSaveIndicator();
      return;
    }
    
    if (!this.user) {
      this.showLoginButton();
      return;
    }

    // Create user menu in the UI
    const userMenu = document.createElement('div');
    userMenu.className = 'rust-book-user-menu';
    userMenu.innerHTML = `
      <div class="user-info">
        ${this.user.picture ? `<img src="${this.user.picture}" alt="${this.user.name}">` : ''}
        <span>${this.user.name}</span>
        <button class="logout-btn">Logout</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .rust-book-user-menu {
        position: fixed;
        top: 5rem;
        right: 1rem;
        z-index: 1000;
      }
      
      .user-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: white;
        padding: 0.5rem 1rem;
        border-radius: 2rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      
      .user-info img {
        width: 32px;
        height: 32px;
        border-radius: 50%;
      }
      
      .user-info span {
        font-weight: 500;
        color: #333;
      }
      
      .logout-btn {
        background: #f0f0f0;
        border: none;
        padding: 0.25rem 0.75rem;
        border-radius: 1rem;
        cursor: pointer;
        font-size: 0.875rem;
      }
      
      .logout-btn:hover {
        background: #e0e0e0;
      }
    `;
    document.head.appendChild(style);

    const logoutBtn = userMenu.querySelector('.logout-btn');
    logoutBtn?.addEventListener('click', () => {
      window.location.href = '/auth/logout';
    });

    document.body.appendChild(userMenu);
  }

  private showSaveIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'rust-book-save-indicator';
    indicator.innerHTML = `
      <div class="save-info">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.5 2.5L5.5 10.5L2.5 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Progress saved</span>
      </div>
    `;

    document.body.appendChild(indicator);
    setTimeout(() => {
      indicator.remove();
    }, 3000); // Remove after 3 seconds
  }

  private showLoginButton() {
    if (!this.ssoEnabled) return;

    const loginBtn = document.createElement('div');
    loginBtn.className = 'rust-book-login';
    loginBtn.innerHTML = `
      <a href="/auth/login" class="login-link">
        <button class="login-btn">Sign In</button>
      </a>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .rust-book-login {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 1000;
      }
      
      .login-link {
        text-decoration: none;
      }
      
      .login-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 2rem;
        cursor: pointer;
        font-weight: 500;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
        transition: transform 0.2s;
      }
      
      .login-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.6);
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(loginBtn);
  }
}

// Initialize tracker when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ReadingTracker();
  });
} else {
  new ReadingTracker();
}

export default ReadingTracker;
