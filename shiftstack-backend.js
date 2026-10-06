(() => {
  const SESSION_KEY = "shiftstack_backend_session_v1";
  let config = null;
  let initialized = false;

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  async function loadConfig() {
    if (initialized) return config;
    initialized = true;
    try {
      const response = await fetch("/api/shiftstack-backend-config", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ready && data.url && data.publishableKey) {
        config = { url: data.url, key: data.publishableKey };
      }
    } catch {}
    return config;
  }

  async function authFetch(path, options = {}, accessToken = "") {
    await loadConfig();
    if (!config) throw new Error("ShiftStack backend is not configured yet.");
    const headers = {
      "apikey": config.key,
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (accessToken) headers.Authorization = "Bearer " + accessToken;
    return fetch(config.url + path, { ...options, headers });
  }

  async function refreshSessionIfNeeded() {
    let session = readSession();
    if (!session?.refresh_token) return session;

    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && Number(session.expires_at) - now > 60) return session;

    const response = await authFetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      writeSession(null);
      return null;
    }
    session = {
      ...data,
      expires_at: now + Number(data.expires_in || 3600)
    };
    writeSession(session);
    return session;
  }

  async function signup({ email, password, displayName, role }) {
    const response = await authFetch("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        data: { display_name: displayName || "", role: role || "worker" }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.msg || data?.error_description || data?.message || "Could not create account.");
    if (data.access_token) {
      data.expires_at = Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
      writeSession(data);
    }
    return data;
  }

  async function signin({ email, password }) {
    const response = await authFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new Error(data?.error_description || data?.msg || data?.message || "Could not sign in.");
    }
    data.expires_at = Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
    writeSession(data);
    return data;
  }

  async function signout() {
    const session = await refreshSessionIfNeeded();
    if (session?.access_token) {
      try {
        await authFetch("/auth/v1/logout", { method: "POST", body: "{}" }, session.access_token);
      } catch {}
    }
    writeSession(null);
  }

  async function rest(resource, options = {}) {
    const session = await refreshSessionIfNeeded();
    if (!session?.access_token) throw new Error("Sign in to use the live ShiftStack marketplace.");
    const headers = {
      "Prefer": options.prefer || "",
      ...(options.headers || {})
    };
    const response = await authFetch("/rest/v1/" + resource, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }, session.access_token);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.message || data?.hint || data?.details || "ShiftStack backend request failed.";
      throw new Error(message);
    }
    return data;
  }

  async function getMyProfile() {
    const session = await refreshSessionIfNeeded();
    const id = session?.user?.id;
    if (!id) return null;
    const rows = await rest("profiles?id=eq." + encodeURIComponent(id) + "&select=*");
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function upsertProfile(profile) {
    const session = await refreshSessionIfNeeded();
    const id = session?.user?.id;
    if (!id) throw new Error("Sign in first.");
    const rows = await rest("profiles?on_conflict=id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [{ id, ...profile }]
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function listPosts() {
    return rest("work_posts?select=*&status=neq.cancelled&order=created_at.desc&limit=100");
  }

  async function createPost(post) {
    const session = await refreshSessionIfNeeded();
    const ownerId = session?.user?.id;
    if (!ownerId) throw new Error("Sign in first.");
    const rows = await rest("work_posts", {
      method: "POST",
      prefer: "return=representation",
      body: [{ owner_id: ownerId, ...post }]
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function applyToPost({ postId, message, estimateAmount, kind }) {
    const session = await refreshSessionIfNeeded();
    const workerId = session?.user?.id;
    if (!workerId) throw new Error("Sign in first.");
    const rows = await rest("work_applications", {
      method: "POST",
      prefer: "return=representation",
      body: [{
        post_id: postId,
        worker_id: workerId,
        message,
        estimate_amount: estimateAmount ?? null,
        kind: kind || "application"
      }]
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function listMyApplications() {
    const session = await refreshSessionIfNeeded();
    const id = session?.user?.id;
    if (!id) return [];
    return rest(
      "work_applications?worker_id=eq." + encodeURIComponent(id) +
      "&select=*,work_posts(id,title,category,location,budget,pay_type,status,work_date)&order=created_at.desc"
    );
  }

  async function listMyPosts() {
    const session = await refreshSessionIfNeeded();
    const id = session?.user?.id;
    if (!id) return [];
    return rest("work_posts?owner_id=eq." + encodeURIComponent(id) + "&select=*&order=created_at.desc");
  }

  async function listApplicationsForPost(postId) {
    return rest(
      "work_applications?post_id=eq." + encodeURIComponent(postId) +
      "&select=*,profiles!work_applications_worker_id_fkey(id,display_name,role,rating,review_count,base_location)&order=created_at.desc"
    );
  }

  window.ShiftStackBackend = {
    init: loadConfig,
    isConfigured: () => !!config,
    session: readSession,
    currentUser: () => readSession()?.user || null,
    signup,
    signin,
    signout,
    getMyProfile,
    upsertProfile,
    listPosts,
    createPost,
    applyToPost,
    listMyApplications,
    listMyPosts,
    listApplicationsForPost
  };

  loadConfig().then(() => {
    window.dispatchEvent(new CustomEvent("shiftstack-backend-ready", { detail: { configured: !!config } }));
  });
})();
