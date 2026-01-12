// API client for self-hosted mode
export interface ServerConfig {
  enabled: boolean;
  apiUrl: string;
  ssoEnabled?: boolean;
  singleUserMode?: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    picture?: string;
  } | null;
}

export interface QuizResponse {
  quiz_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
}

export interface HighlightData {
  id: string;
  page: string;
  start_meta: any;
  end_meta: any;
  text: string;
  extra?: any;
}

class ServerAPI {
  private config: ServerConfig | null = null;
  private configPromise: Promise<ServerConfig | null> | null = null;

  constructor() {
    // Config will be fetched on first use
  }

  private async fetchConfig(): Promise<ServerConfig | null> {
    try {
      const response = await fetch('/api/config', {
        credentials: 'include'
      });
      if (!response.ok) {
        return { enabled: false, apiUrl: '/api' };
      }
      const config = await response.json();
      return { ...config, apiUrl: '/api' };
    } catch (error) {
      console.error('Failed to fetch server config:', error);
      return { enabled: false, apiUrl: '/api' };
    }
  }

  private async getConfig(): Promise<ServerConfig> {
    if (this.config) {
      return this.config;
    }

    if (!this.configPromise) {
      this.configPromise = this.fetchConfig();
    }

    this.config = await this.configPromise;
    return this.config || { enabled: false, apiUrl: '/api' };
  }

  async isEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabled;
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json'
    };
  }

  // Quiz API
  async saveQuizResponse(response: QuizResponse): Promise<void> {
    if (!(await this.isEnabled())) return;

    try {
      const config = await this.getConfig();
      await fetch(`${config.apiUrl}/quiz-responses`, {
        method: 'POST',
        headers: this.getHeaders(),
        credentials: 'include',
        body: JSON.stringify(response)
      });
    } catch (error) {
      console.error('Failed to save quiz response to server:', error);
    }
  }

  async getQuizResponse(questionId: string): Promise<QuizResponse | null> {
    if (!(await this.isEnabled())) return null;

    try {
      const config = await this.getConfig();
      const response = await fetch(
        `${config.apiUrl}/quiz-responses/${questionId}`,
        { 
          headers: this.getHeaders(),
          credentials: 'include'
        }
      );
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch quiz response from server:', error);
      return null;
    }
  }

  async getAllQuizResponses(): Promise<QuizResponse[]> {
    if (!(await this.isEnabled())) return [];

    try {
      const config = await this.getConfig();
      const response = await fetch(
        `${config.apiUrl}/quiz-responses`,
        { 
          headers: this.getHeaders(),
          credentials: 'include'
        }
      );
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch quiz responses from server:', error);
      return [];
    }
  }

  // Highlights API
  async saveHighlight(highlight: HighlightData): Promise<void> {
    if (!(await this.isEnabled())) return;

    try {
      const config = await this.getConfig();
      await fetch(`${config.apiUrl}/highlights`, {
        method: 'POST',
        headers: this.getHeaders(),
        credentials: 'include',
        body: JSON.stringify(highlight)
      });
    } catch (error) {
      console.error('Failed to save highlight to server:', error);
    }
  }

  async getHighlights(page?: string): Promise<HighlightData[]> {
    if (!(await this.isEnabled())) return [];

    try {
      const config = await this.getConfig();
      const url = page 
        ? `${config.apiUrl}/highlights?page=${encodeURIComponent(page)}`
        : `${config.apiUrl}/highlights`;
      
      const response = await fetch(url, { 
        headers: this.getHeaders(),
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch highlights from server:', error);
      return [];
    }
  }

  async deleteHighlight(id: string): Promise<void> {
    if (!(await this.isEnabled())) return;

    try {
      const config = await this.getConfig();
      await fetch(`${config.apiUrl}/highlights/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        credentials: 'include'
      });
    } catch (error) {
      console.error('Failed to delete highlight from server:', error);
    }
  }
}

export const serverAPI = new ServerAPI();
