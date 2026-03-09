// public/main.js
document.addEventListener("DOMContentLoaded", () => {
  const PREFIX = "/M00997995"; // server prefix
  let currentUser = null;

  let activePostForComment = null;

  // ---------- UI helpers ----------
  function openModal(id) { new bootstrap.Modal(document.getElementById(id)).show(); }
  function closeModal(id) { const m = bootstrap.Modal.getInstance(document.getElementById(id)); if(m) m.hide(); }
  function toast(msg, kind="info", t=3500) {
    const el = document.createElement("div");
    el.className = `alert alert-${kind} position-fixed`;
    el.style.top = "20px"; el.style.right = "20px"; el.style.zIndex = 9999;
    el.innerText = msg; document.body.appendChild(el);
    setTimeout(()=>el.remove(), t);
  }

  // ---------- API helpers ----------
  async function apiGet(path) { return fetch(PREFIX + path, { credentials: "include" }); }
  async function apiPost(path, body) { 
    return fetch(PREFIX + path, { method: "POST", credentials: "include", headers: { "Content-Type":"application/json" }, body: JSON.stringify(body) });
  }
  async function apiDelete(path, body) {
    const opts = { method: "DELETE", credentials: "include" };
    if(body) { opts.headers = { "Content-Type":"application/json" }; opts.body = JSON.stringify(body); }
    return fetch(PREFIX + path, opts);
  }

  // ---------- AUTH ----------
  async function signup(name,email,password) {
    const res = await apiPost("/users", { name, email, password });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Signup failed");
    return data;
  }
  async function login(email,password) {
    const res = await apiPost("/login", { email, password });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Login failed");
    return data;
  }
  async function logout() {
    await apiDelete("/login");
    currentUser = null;
    document.getElementById("mainPage").style.display = "none";
    document.getElementById("landingPage").style.display = "block";
    document.getElementById("btnLogout").classList.add("d-none");
    document.getElementById("btnMessages").classList.add("d-none");
  }

  // ---------- POSTS & UPLOAD ----------
  async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(PREFIX + "/upload", { 
    method: "POST", 
    credentials: "include", 
    body: form 
  });

  const data = await res.json();
  if(!res.ok) throw new Error(data.error || "Upload failed");

  // Remove PREFIX for the returned URL
  if (data.url.startsWith(PREFIX)) {
    data.url = data.url.slice(PREFIX.length);
  }

  return data; // { ok:true, url:"/uploads/..." }
}



  async function createPost(text, mediaUrl=null) {
    const body = { text, media: mediaUrl };
    const res = await apiPost("/contents", body);
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Create post failed");
    return data;
  }

  // ---------- LIKE / COMMENT ----------
  async function likePost(postId) {
    const res = await apiPost("/like", { postId });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Like failed");
    toast("Liked", "success");
  }
  async function commentPost(postId, comment) {
    const res = await apiPost("/comment", { postId, comment });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Comment failed");
    toast("Comment posted", "success");
  }

  // ---------- FOLLOW ----------
  async function followUser(emailToFollow) {
    const res = await apiPost("/follow", { emailToFollow });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Follow failed");
    toast("Now following " + emailToFollow, "success");
    await loadFeed();
  }
  async function unfollowUser(emailToUnfollow) {
    const res = await apiDelete("/follow", { emailToUnfollow });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Unfollow failed");
    toast("Unfollowed " + emailToUnfollow, "info");
    await loadFeed();
  }

  // ---------- MESSAGING ----------
  async function sendMessage(toEmail, text) {
    const res = await apiPost("/message", { toEmail, text });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Message failed");
    toast("Message sent", "success");
  }
  async function loadMessages(withEmail) {
    const res = await apiGet("/messages?with=" + encodeURIComponent(withEmail));
    if(!res.ok) throw new Error("Failed to load messages");
    return res.json();
  }

  // ---------- WEATHER ----------
  async function loadWeather() {
    try {
      const res = await apiGet("/weather");
      if(!res.ok) return;
      const data = await res.json();
      if(data && data.temp) {
        document.getElementById("weatherInfo").innerText =
  `${data.temp}°C — ${data.desc} — 🌧 ${data.rainChance}% chance of rain`;

      }
    } catch (err) { console.error("weather", err); }
  }

  // ---------- SEARCH ----------
  async function searchUsers(q) {
    const res = await apiGet("/users?q=" + encodeURIComponent(q));
    if(!res.ok) throw new Error("Search users failed");
    return res.json();
  }
  async function searchContents(q) {
    const res = await apiGet("/contents?q=" + encodeURIComponent(q));
    if(!res.ok) throw new Error("Search contents failed");
    return res.json();
  }

  async function loadConversations() {
    const res = await fetch("/M00997995/users");
    const users = await res.json();

    const list = document.getElementById("conversationList");
    list.innerHTML = "";

    users.forEach(u => {
        const li = document.createElement("li");
        li.textContent = u.email;
        li.style.cursor = "pointer";

        li.addEventListener("click", () => loadChat(u.email));

        list.appendChild(li);
    });
}

let currentChat = null; // put this near top-level (before loadChat), or inside main scope

async function loadChat(otherEmail) {
  // Set the current chat target
  currentChat = otherEmail;

  // Update title
  document.getElementById("chatWith").textContent = "Chat with " + otherEmail;

  // Fetch messages
  const res = await fetch(`${PREFIX}/messages?with=${encodeURIComponent(otherEmail)}`, { credentials: "include" });
  if (!res.ok) {
    console.error("Failed to load messages");
    return;
  }
  const msgs = await res.json();

  // Render messages (clear first to avoid duplicates)
  const box = document.getElementById("chatMessages");
  box.innerHTML = "";

  msgs.forEach(m => {
    const div = document.createElement("div");
    div.textContent = `${m.from}: ${m.text}`;
    box.appendChild(div);
  });

  // keep scroll at bottom
  box.scrollTop = box.scrollHeight;
}



  // ---------- FEED ----------
  async function loadFeed() {
    try {
      const res = await apiGet("/feed");
      if(res.status === 401) {
        document.getElementById("content").innerHTML = `<div class="feed-card">Please login to view feed.</div>`;
        return;
      }
      const posts = await res.json();
      renderFeed(posts);
    } catch (err) {
      console.error(err);
      document.getElementById("content").innerHTML = `<div class="feed-card">Error loading feed.</div>`;
    }
  }

  // ---------- UI Render ----------
  function renderFeed(posts) {
    if(!posts || posts.length === 0) {
      document.getElementById("content").innerHTML = `<div class="feed-card">No posts to show.</div>`;
      return;
    }
    const html = posts.map(p => {
  const time = p.createdAt ? new Date(p.createdAt).toLocaleString() : "";
  const mediaHtml = p.media ? `
  <div class="mt-2">
    <img src="${p.media.startsWith(PREFIX) ? p.media.slice(PREFIX.length) : p.media}" class="post-image" />
  </div>` 
: "";


  const txt = escapeHtml(p.text || "");
  return `
    <div class="feed-card" data-id="${p._id}">
      <div class="d-flex justify-content-between">
        <div><strong>${escapeHtml(p.email)}</strong><div style="font-size:0.85rem;color:#666">${time}</div></div>
      </div>
      <p class="mt-2">${txt}</p>
      ${mediaHtml}
      <div class="mt-2 d-flex gap-2">
        <button class="btn btn-sm btn-outline-success like-btn" data-id="${p._id}">Like</button>
        <button class="btn btn-sm btn-outline-secondary comment-btn" data-id="${p._id}">Comment</button>
        <button class="btn btn-sm btn-outline-info follow-btn" data-email="${escapeHtml(p.email)}">Follow</button>
      </div>
    </div>
  `;
}).join("");
    document.getElementById("content").innerHTML = html;

    // events
    document.querySelectorAll(".message-btn").forEach(b => b.addEventListener("click", async (ev) => {
      const to = ev.currentTarget.dataset.email;
      document.getElementById("messageTo").value = to;
      openModal("messagesModal");
    }));
    document.querySelectorAll(".like-btn").forEach(b => b.addEventListener("click", async (ev) => {
      const id = ev.currentTarget.dataset.id;
      try { await likePost(id); await loadFeed(); } catch(e){ toast(e.message,"danger"); }
    }));
    document.querySelectorAll(".comment-btn").forEach(b =>
  b.addEventListener("click", (ev) => {
    activePostForComment = ev.currentTarget.dataset.id;
    document.getElementById("commentInput").value = "";
    openModal("commentModal");
  })
);

    document.querySelectorAll(".follow-btn").forEach(b => b.addEventListener("click", async (ev) => {
      const email = ev.currentTarget.dataset.email;
      try { await followUser(email); } catch(e){ toast(e.message,"danger"); }
    }));
  }

  // ---------- small helpers ----------
  function escapeHtml(s) {
    if(!s) return "";
    return s.replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
  }

  // ---------- UI wiring ----------
  document.getElementById("btnLogin").addEventListener("click", ()=>{ 
    document.getElementById("authTitle").innerText="Login"; 
    document.getElementById("authBtn").innerText="Login"; 
    document.getElementById("loginFields").style.display="block"; 
    document.getElementById("signupFields").style.display="none"; 
    openModal("authModal"); 
  });
  document.getElementById("btnSignup").addEventListener("click", ()=>{ 
    document.getElementById("authTitle").innerText="Sign Up"; 
    document.getElementById("authBtn").innerText="Sign Up"; 
    document.getElementById("loginFields").style.display="none"; 
    document.getElementById("signupFields").style.display="block"; 
    openModal("authModal"); 
  });
  document.getElementById("heroSignup")?.addEventListener("click",()=>{ 
    document.getElementById("authTitle").innerText="Sign Up"; 
    document.getElementById("authBtn").innerText="Sign Up"; 
    document.getElementById("loginFields").style.display="none"; 
    document.getElementById("signupFields").style.display="block"; 
    openModal("authModal"); 
  });

  document.getElementById("authBtn").addEventListener("click", async ()=>{
    const mode = document.getElementById("authBtn").innerText.toLowerCase();
    if(mode==="login") {
      const e = document.getElementById("loginEmail").value.trim();
      const p = document.getElementById("loginPassword").value.trim();
      if(!e||!p){ toast("Fill fields","warning"); return; }
      try {
        const data = await login(e,p);
        currentUser = { email: data.email || e, name: data.name || e.split("@")[0] };
        document.getElementById("btnLogout").classList.remove("d-none");
        document.getElementById("btnMessages").classList.remove("d-none");
        document.getElementById("btnLogin").classList.add("d-none");
        document.getElementById("btnSignup").classList.add("d-none");
        closeModal("authModal");
        document.getElementById("landingPage").style.display="none";
        document.getElementById("mainPage").style.display="flex";
        document.getElementById("profileName").innerText = currentUser.name;
        document.getElementById("profileEmail").innerText = currentUser.email;
        await loadWeather();
        await loadFeed();
      } catch(e) { toast(e.message,"danger"); }
    } else {
      const name = document.getElementById("signupName").value.trim();
      const email = document.getElementById("signupEmail").value.trim();
      const pass = document.getElementById("signupPassword").value.trim();
      if(!name||!email||!pass){ toast("Fill fields","warning"); return;}
      try {
        const data = await signup(name,email,pass);
        currentUser = { name: data.name || name, email: data.email || email };
        document.getElementById("btnLogout").classList.remove("d-none");
        document.getElementById("btnLogin").classList.add("d-none");
        document.getElementById("btnSignup").classList.add("d-none");
        closeModal("authModal");
        document.getElementById("landingPage").style.display="none";
        document.getElementById("mainPage").style.display="flex";
        document.getElementById("profileName").innerText = currentUser.name;
        document.getElementById("profileEmail").innerText = currentUser.email;
        await loadWeather();
        await loadFeed();
      } catch(e){ toast(e.message,"danger"); }
    }
  });

  document.getElementById("btnLogout").addEventListener("click", async ()=> { 
    try { await logout(); document.getElementById("btnLogout").classList.add("d-none"); document.getElementById("btnLogin").classList.remove("d-none"); document.getElementById("btnSignup").classList.remove("d-none"); } 
    catch(e){ toast("Logout error","danger"); } 
  });

  // ---------- post handlers ----------
  document.getElementById("btnPost").addEventListener("click", async ()=> {
    const text = document.getElementById("postText").value.trim();
    if(!text){ toast("Write something","warning"); return; }
    try { await createPost(text,null); document.getElementById("postText").value=""; await loadFeed(); } catch(e){ toast(e.message,"danger"); }
  });
  document.getElementById("btnPostWithFile").addEventListener("click", async () => {
  const text = document.getElementById("postText").value.trim();
  const file = document.getElementById("postFile").files[0];

  if (!text && !file) { 
    toast("Add text or file", "warning"); 
    return; 
  }

  try {
    let url = null;
    if (file) {
      const up = await uploadFile(file);
      url = up.url;
    }

    await createPost(text, url);

    // Clear inputs
    document.getElementById("postText").value = "";
    document.getElementById("postFile").value = "";

    await loadFeed();
    toast("Post created", "success");
  } catch (e) {
    toast(e.message, "danger");
  }
});

document.getElementById("submitComment").addEventListener("click", async () => {
  const text = document.getElementById("commentInput").value.trim();
  if (!text) return;

  try {
    await commentPost(activePostForComment, text);
    closeModal("commentModal");
    await loadFeed();
  } catch (e) {
    toast(e.message, "danger");
  }
});


  // ---------- search ----------
  let tmr = null;
  document.getElementById("searchInput").addEventListener("input", (e)=> {
    const q = e.target.value.trim();
    if(tmr) clearTimeout(tmr);
    tmr = setTimeout(async ()=> {
      const sr = document.getElementById("searchResults");
      if(!q) { sr.innerHTML=""; await loadFeed(); return; }
      try {
        const users = await searchUsers(q);
        const contents = await searchContents(q);
        let html = "<div><strong>Users</strong></div>";
        if(users.length===0) html += "<div class='search-results-item'>No users</div>";
        users.forEach(u => {
          html += `<div class='search-results-item d-flex justify-content-between align-items-center'>
            <div>${u.name} <small class='text-muted'>${u.email}</small></div>
            <div><button class='btn btn-sm btn-primary follow-search-btn' data-email='${u.email}'>Follow</button></div>
          </div>`;
        });
        html += "<hr/><div><strong>Contents</strong></div>";
        if(contents.length===0) html += "<div class='search-results-item'>No contents</div>";
        contents.forEach(c => {
          html += `<div class='search-results-item'>${escapeHtml(c.text||"")} <div style='font-size:0.8rem;color:#666'>by ${escapeHtml(c.email)}</div></div>`;
        });
        sr.innerHTML = html;

        document.querySelectorAll(".follow-search-btn").forEach(b => b.addEventListener("click", async (ev)=>{
          const email = ev.currentTarget.dataset.email;
          try { await followUser(email); await loadFeed(); } catch(err){ toast(err.message,"danger"); }
        }));
      } catch(err){ sr.innerHTML = "<div class='search-results-item'>Search error</div>"; }
    }, 300);
  });


  // ---------- profile edit ----------
  document.getElementById("editProfileBtn").addEventListener("click", ()=> {
    document.getElementById("editName").value = document.getElementById("profileName").innerText;
    openModal("profileEditModal");
  });
  document.getElementById("saveProfileBtn").addEventListener("click", async ()=> {
    const newName = document.getElementById("editName").value.trim();
    const newPass = document.getElementById("editPassword").value.trim();
    try {
      const res = await apiPost("/profile/edit", { name: newName, password: newPass });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || "Profile update failed");
      document.getElementById("profileName").innerText = newName;
      closeModal("profileEditModal");
      toast("Profile updated","success");
    } catch(e){ toast(e.message,"danger"); }
  });

  // ---------- on load: session check ----------
  (async ()=> {
    try {
      const r = await apiGet("/login");
      const d = await r.json();
      if(d && d.login) {
        currentUser = { email: d.email, name: d.email.split("@")[0] };
        document.getElementById("btnLogout").classList.remove("d-none");
        document.getElementById("btnLogin").classList.add("d-none");
        document.getElementById("btnSignup").classList.add("d-none");
        document.getElementById("landingPage").style.display="none";
        document.getElementById("mainPage").style.display="flex";
        document.getElementById("profileName").innerText = currentUser.name;
        document.getElementById("profileEmail").innerText = currentUser.email;
        await loadWeather();
        await loadFeed();
      }
    } catch (e) { console.warn("session check failed",e); }
  })();

  document.getElementById("btnMyPosts").addEventListener("click", async () => {
  try {
    const res = await fetch(PREFIX + "/my-posts", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load your posts");
    const posts = await res.json();

    const container = document.getElementById("content");
    container.innerHTML = "";

    if (posts.length === 0) {
      container.innerHTML = `<p>You haven't posted anything yet.</p>`;
      return;
    }

    posts.forEach(p => {
      const card = document.createElement("div");
      card.className = "feed-card";

      card.innerHTML = `
        <p><strong>You</strong> — ${new Date(p.createdAt).toLocaleString()}</p>
        <p>${p.text || ""}</p>
        ${p.media ? `<img src="${p.media.startsWith(PREFIX) ? p.media.slice(PREFIX.length) : p.media}" class="post-image">` : ""}

      `;

      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    toast("Error loading your posts", "danger");
  }
});

document.getElementById("logoBtn").addEventListener("click", async (e) => {
  e.preventDefault(); // stop the link from reloading the page

  // show the SPA feed page
  document.getElementById("landingPage").style.display = "none";
  document.getElementById("mainPage").style.display = "flex";

  // load general feed (users you follow)
  try {
    await loadFeed();
  } catch (err) {
    console.error(err);
    toast("Failed to load feed", "danger");
  }
});

document.getElementById("btnMessages").addEventListener("click", async () => {
    // Hide feed
    document.getElementById("mainFeed").style.display = "none";

    // Show messages
    document.getElementById("messagesPage").style.display = "block";

    loadConversations();
});
// One-time chat send handler that always sends to `currentChat`
document.getElementById("chatSendBtn").addEventListener("click", async () => {
  if (!currentChat) { toast("Select a conversation first", "warning"); return; }

  const text = document.getElementById("chatInput").value.trim();
  if (!text) return;

  try {
    // use your existing apiPost helper
    await apiPost("/message", { toEmail: currentChat, text });
    document.getElementById("chatInput").value = "";
    await loadChat(currentChat); // refresh messages
  } catch (err) {
    toast(err.message || "Message failed", "danger");
  }
});


const tennisGPTModal = new bootstrap.Modal(document.getElementById("tennisGPTModal"));

document.getElementById("btnTennisGPT").addEventListener("click", () => {
  document.getElementById("tennisGPTQuestion").value = "";
  document.getElementById("tennisGPTAnswer").innerText = "";
  tennisGPTModal.show();
});

document.getElementById("tennisGPTAskBtn").addEventListener("click", async () => {
  const question = document.getElementById("tennisGPTQuestion").value.trim();
  if (!question) return;

  try {
    const res = await fetch(PREFIX + "/tennis-gpt", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");

    document.getElementById("tennisGPTAnswer").innerText = data.answer;

  } catch (err) {
    document.getElementById("tennisGPTAnswer").innerText = "Error: " + err.message;
  }
});



}); // DOMContentLoaded

document.getElementById("backToFeed").addEventListener("click", () => {
  document.getElementById("messagesPage").style.display = "none";
  document.getElementById("mainFeed").style.display = "block";
});


