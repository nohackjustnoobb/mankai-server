class AuthService {
  isAuthenticated: boolean = false;
  refreshToken: string | null = null;
  accessToken: string | null = null;
  updateCallback: (() => void) | null = null;

  checkExpired(token: string | null): boolean {
    if (!token) return true;
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiration = payload.exp * 1000;
    return Date.now() >= expiration;
  }

  constructor() {
    this.refreshToken = localStorage.getItem("refreshToken");
    this.accessToken = localStorage.getItem("accessToken");

    if (this.refreshToken && this.checkExpired(this.refreshToken)) {
      this.refreshToken = null;
      localStorage.removeItem("refreshToken");
    }

    if (this.accessToken && this.checkExpired(this.accessToken)) {
      this.accessToken = null;
      localStorage.removeItem("accessToken");
    }

    this.isAuthenticated = !!this.refreshToken;
  }

  async refresh() {
    if (!this.refreshToken) throw new Error("No refresh token available");
    const resp = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });

    if (!resp.ok) throw new Error("Failed to refresh token");

    const data = await resp.json();
    const { accessToken } = data;

    this.accessToken = accessToken;
    localStorage.setItem("accessToken", accessToken);
  }

  async login(email: string, password: string) {
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: email, password }),
    });

    if (!resp.ok) throw new Error("Login failed");

    const data = await resp.json();
    const { accessToken, refreshToken, user } = data;
    if (!user.isAdmin) {
      throw new Error("You do not have permission to access this application.");
    }

    this.refreshToken = refreshToken;
    this.accessToken = accessToken;

    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("accessToken", accessToken);

    this.isAuthenticated = true;
    if (this.updateCallback) this.updateCallback();
  }

  logout() {
    this.refreshToken = null;
    this.accessToken = null;

    localStorage.removeItem("refreshToken");
    localStorage.removeItem("accessToken");

    this.isAuthenticated = false;
    if (this.updateCallback) this.updateCallback();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get(url: string, options: RequestInit = {}): Promise<any> {
    if (!this.isAuthenticated) throw new Error("Not authenticated");
    if (this.checkExpired(this.accessToken)) await this.refresh();

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${this.accessToken}`,
    };

    const resp = await fetch(url, { ...options, headers });
    if (!resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data?.error) throw new Error(data.error);
      throw new Error("Failed to fetch data");
    }

    return await resp.json().catch(() => null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async post(url: string, body: any, options: RequestInit = {}): Promise<any> {
    if (!this.isAuthenticated) throw new Error("Not authenticated");
    if (this.checkExpired(this.accessToken)) await this.refresh();

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
      Authorization: `Bearer ${this.accessToken}`,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...options,
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data?.error) throw new Error(data.error);
      throw new Error("Failed to post data");
    }

    return await resp.json().catch(() => null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async patch(url: string, body: any, options: RequestInit = {}): Promise<any> {
    if (!this.isAuthenticated) throw new Error("Not authenticated");
    if (this.checkExpired(this.accessToken)) await this.refresh();

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
      Authorization: `Bearer ${this.accessToken}`,
    };

    const resp = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
      ...options,
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data?.error) throw new Error(data.error);
      throw new Error("Failed to patch data");
    }

    return await resp.json().catch(() => null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async delete(url: string, options: RequestInit = {}): Promise<any> {
    if (!this.isAuthenticated) throw new Error("Not authenticated");
    if (this.checkExpired(this.accessToken)) await this.refresh();

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${this.accessToken}`,
    };

    const resp = await fetch(url, {
      method: "DELETE",
      headers,
      ...options,
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data?.error) throw new Error(data.error);
      throw new Error("Failed to delete data");
    }

    return await resp.json().catch(() => null);
  }

  async fetchBlob(url: string, options: RequestInit = {}): Promise<Blob> {
    if (!this.isAuthenticated) throw new Error("Not authenticated");
    if (this.checkExpired(this.accessToken)) await this.refresh();

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${this.accessToken}`,
    };

    const resp = await fetch(url, { ...options, headers });

    if (!resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data?.error) throw new Error(data.error);
      throw new Error("Failed to fetch blob");
    }

    return resp.blob();
  }
}

const authService = new AuthService();
export default authService;
