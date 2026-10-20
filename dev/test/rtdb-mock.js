/* Minimal in-memory Firebase compat mock (app/auth/database) with Realtime Database rules evaluation.
   Usage: set window.__RULES = <rules json> before loading; exposes window.firebase and window.__store. */
(function (G) {
  const RULES = G.__RULES;
  const store = { root: {} };
  G.__store = store;
  const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
  const segs = p => String(p || '').split('/').filter(Boolean);
  function getAt(obj, path) { let o = obj; for (const s of segs(path)) { if (o == null || typeof o !== 'object') return null; o = o[s]; } return o === undefined ? null : o; }
  function setAt(obj, path, val) {
    const ss = segs(path); if (!ss.length) return val;
    obj = obj && typeof obj === 'object' ? obj : {};
    let o = obj;
    for (let i = 0; i < ss.length - 1; i++) { if (o[ss[i]] == null || typeof o[ss[i]] !== 'object') o[ss[i]] = {}; o = o[ss[i]]; }
    if (val == null) delete o[ss[ss.length - 1]]; else o[ss[ss.length - 1]] = val;
    return obj;
  }
  function prune(o) { if (o && typeof o === 'object') { for (const k of Object.keys(o)) { o[k] = prune(o[k]); if (o[k] == null) delete o[k]; } if (!Object.keys(o).length) return null; } return o; }
  // ---- rule snapshots
  function Snap(rootObj, path) { this._r = rootObj; this._p = segs(path).join('/'); }
  Snap.prototype.val = function () { const v = getAt(this._r, this._p); return v == null ? null : v; };
  Snap.prototype.child = function (p) { return new Snap(this._r, this._p + '/' + p); };
  Snap.prototype.parent = function () { const s = segs(this._p); s.pop(); return new Snap(this._r, s.join('/')); };
  Snap.prototype.exists = function () { return this.val() != null; };
  Snap.prototype.isString = function () { return typeof this.val() === 'string'; };
  Snap.prototype.isNumber = function () { return typeof this.val() === 'number'; };
  Snap.prototype.isBoolean = function () { return typeof this.val() === 'boolean'; };
  Snap.prototype.hasChildren = function (a) { const v = this.val(); if (!v || typeof v !== 'object') return false; return (a || Object.keys(v)).every(k => v[k] != null); };
  Snap.prototype.hasChild = function (k) { return this.child(k).exists(); };
  if (!String.prototype.matches) Object.defineProperty(String.prototype, 'matches', { value: function (re) { return re.test(this); } });
  function evalRule(expr, ctx) {
    const names = Object.keys(ctx);
    try { return !!Function.apply(null, names.concat('return (' + expr + ');')).apply(null, names.map(n => ctx[n])); }
    catch (e) { return false; }  // errors in rules -> false (like RTDB)
  }
  function ruleNodeFor(ss) { // walk rules, return list of [node, vars] for each depth 0..ss.length
    const out = []; let node = RULES.rules, vars = {};
    out.push([node, Object.assign({}, vars)]);
    for (const s of ss) {
      if (!node) { out.push([null, vars]); continue; }
      let next = node[s];
      if (next === undefined) { const wk = Object.keys(node).find(k => k[0] === '$'); if (wk) { next = node[wk]; vars = Object.assign({}, vars, { [wk]: s }); } }
      node = next && typeof next === 'object' ? next : null;
      out.push([node, Object.assign({}, vars)]);
    }
    return out;
  }
  function canWrite(path, oldRoot, newRoot, auth) {
    const ss = segs(path); const chain = ruleNodeFor(ss);
    for (let i = 0; i < chain.length; i++) {
      const [node, vars] = chain[i]; if (!node || node['.write'] === undefined) continue;
      const p = ss.slice(0, i).join('/');
      const ctx = Object.assign({ auth: auth, root: new Snap(oldRoot, ''), data: new Snap(oldRoot, p), newData: new Snap(newRoot, p), now: Date.now() }, vars);
      const r = node['.write']; if (r === true || (typeof r === 'string' && evalRule(r, ctx))) return true;
    }
    return false;
  }
  function validateTree(path, oldRoot, newRoot, auth) {
    // validate every node from root to path and all descendants of path in newRoot (non-null only)
    const ss = segs(path); const chain = ruleNodeFor(ss);
    const check = (node, p, vars) => {
      if (!node || node['.validate'] === undefined) return true;
      if (getAt(newRoot, p) == null) return true;
      const v = node['.validate']; if (v === false) return false; if (v === true) return true;
      return evalRule(v, Object.assign({ auth: auth, root: new Snap(oldRoot, ''), data: new Snap(oldRoot, p), newData: new Snap(newRoot, p), now: Date.now() }, vars));
    };
    for (let i = 0; i < chain.length; i++) if (!check(chain[i][0], ss.slice(0, i).join('/'), chain[i][1])) return false;
    const walk = (node, p, vars, val) => {
      if (val == null || typeof val !== 'object') return true;
      for (const k of Object.keys(val)) {
        let next = node ? node[k] : undefined, nv = vars;
        if (next === undefined && node) { const wk = Object.keys(node).find(x => x[0] === '$'); if (wk) { next = node[wk]; nv = Object.assign({}, vars, { [wk]: k }); } }
        const cp = p ? p + '/' + k : k;
        if (node && next === undefined) { /* no rule */ }
        if (!check(next && typeof next === 'object' ? next : null, cp, nv)) return false;
        if (!walk(next && typeof next === 'object' ? next : null, cp, nv, val[k])) return false;
      }
      return true;
    };
    const last = chain[chain.length - 1];
    return walk(last[0], ss.join('/'), last[1], getAt(newRoot, path));
  }
  function resolveSV(v) { if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return Date.now(); for (const k of Object.keys(v)) v[k] = resolveSV(v[k]); } return v; }
  // ---- listeners
  const listeners = [];
  function notify() { for (const l of listeners.slice()) { const v = clone(getAt(store.root, l.path)); const s = JSON.stringify(v); if (s !== l.last) { l.last = s; setTimeout(() => l.cb({ val: () => clone(v) }), 0); } } }
  const LAT = G.__LATENCY || 0;
  let pushN = 0;
  function makeApp(name) {
    let user = null; const authCbs = [];
    const setUser = u => { user = u; authCbs.forEach(cb => setTimeout(() => cb(u), 0)); };
    const auth = {
      get currentUser() { return user; },
      onAuthStateChanged(cb) { authCbs.push(cb); setTimeout(() => cb(user), 0); return () => {}; },
      signInAnonymously() { return new Promise(r => setTimeout(() => { setUser({ uid: (G.__ANON_UID || 'anon-' + Math.random().toString(36).slice(2, 8)), isAnonymous: true }); r({ user }); }, LAT)); },
      signInWithEmailAndPassword(email, pw) { return new Promise((res, rej) => setTimeout(() => { const ok = (G.__USERS || {})[email]; if (ok && ok.pw === pw) { setUser({ uid: ok.uid, email: email }); res({ user }); } else { const e = new Error('wrong'); e.code = 'auth/invalid-credential'; rej(e); } }, LAT)); },
      signOut() { setUser(null); return Promise.resolve(); }
    };
    const tok = () => user ? { uid: user.uid, token: user.email ? { email: user.email } : {} } : null;
    function Ref(path) { this.path = segs(path).join('/'); this.key = segs(path).slice(-1)[0] || null; }
    Ref.prototype.child = function (p) { return new Ref(this.path + '/' + p); };
    Ref.prototype.push = function () { return new Ref(this.path + '/-K' + Date.now().toString(36) + (++pushN) + Math.random().toString(36).slice(2, 6)); };
    Ref.prototype.on = function (ev, cb, err) { const l = { path: this.path, cb: cb, last: undefined, ref: this }; listeners.push(l); this._l = l; const v = clone(getAt(store.root, this.path)); l.last = JSON.stringify(v); setTimeout(() => cb({ val: () => clone(v) }), LAT); return cb; };
    Ref.prototype.off = function () { const i = listeners.indexOf(this._l); if (i >= 0) listeners.splice(i, 1); };
    Ref.prototype.update = function (obj) {
      const base = this.path;
      return new Promise((res, rej) => setTimeout(() => {
        const oldRoot = clone(store.root) || {};
        let newRoot = clone(store.root) || {};
        const entries = Object.keys(obj).map(k => [base ? base + '/' + k : k, resolveSV(clone(obj[k]))]);
        for (const [p, v] of entries) newRoot = setAt(newRoot, p, v);
        newRoot = prune(newRoot) || {};
        const a = tok();
        for (const [p] of entries) { if (!canWrite(p, oldRoot, newRoot, a) || !validateTree(p, oldRoot, newRoot, a)) { const e = new Error('PERMISSION_DENIED: Permission denied'); e.code = 'PERMISSION_DENIED'; G.__denied = (G.__denied || 0) + 1; return rej(e); } }
        store.root = newRoot; notify(); res();
      }, LAT));
    };
    Ref.prototype.set = function (v) { const parts = segs(this.path); const k = parts.pop(); return new Ref(parts.join('/')).update({ [k]: v }); };
    const database = { ref: p => new Ref(p), goOffline() {}, goOnline() {} };
    return { name, auth: () => auth, database: () => database };
  }
  const apps = {};
  G.firebase = {
    initializeApp(cfg, name) { name = name || '[DEFAULT]'; apps[name] = makeApp(name); return apps[name]; },
    auth() { return apps['[DEFAULT]'].auth(); },
    database: Object.assign(function () { return apps['[DEFAULT]'].database(); }, { ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } } })
  };
  G.__mkApp = makeApp;
})(typeof window !== 'undefined' ? window : globalThis);
