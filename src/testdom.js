/**
 * testdom.js — Minimal DOM harness for exercising src/main.js under Node.
 *
 * TEST-ONLY. No application module imports this, so it never reaches the bundle.
 *
 * main.js resolves all of its element references at module scope, which is why no
 * Node test could previously import it. Rather than inventing a convenient DOM,
 * this harness parses the real index.html and creates stubs for exactly the ids
 * and [data-i18n] nodes that file declares. getElementById returns null for
 * anything index.html does not contain, so a reference to a renamed or deleted id
 * fails here the same way it fails in a browser instead of being papered over.
 */

import { readFileSync } from 'node:fs';

const HTML_PATH = new URL('../index.html', import.meta.url);

function parseIndexHtml() {
  const html = readFileSync(HTML_PATH, 'utf8');
  const ids = new Set();
  const i18nNodes = [];
  const booleanAttrs = new Map(); // id -> { hidden, disabled }
  const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^>]*)?)>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[2] || '';
    const id = /\sid="([^"]+)"/.exec(attrs)?.[1] ?? null;
    const i18n = /\sdata-i18n="([^"]+)"/.exec(attrs)?.[1] ?? null;
    if (id) {
      ids.add(id);
      // Reflect the boolean attributes the app reads back, so an element that
      // ships hidden or disabled starts that way here too.
      booleanAttrs.set(id, {
        hidden: /\shidden(?=[\s>/=]|$)/.test(attrs),
        disabled: /\sdisabled(?=[\s>/=]|$)/.test(attrs),
      });
    }
    if (i18n) i18nNodes.push({ id, key: i18n });
  }
  return { ids: [...ids], i18nNodes, booleanAttrs };
}

function makeClassList(el) {
  return {
    _set: new Set(),
    _sync() { el._className = [...this._set].join(' '); },
    add(...c) { c.forEach((x) => x && this._set.add(x)); this._sync(); },
    remove(...c) { c.forEach((x) => this._set.delete(x)); this._sync(); },
    contains(c) { return this._set.has(c); },
    toggle(c, force) {
      const on = force === undefined ? !this._set.has(c) : Boolean(force);
      if (on) this._set.add(c); else this._set.delete(c);
      this._sync();
      return on;
    },
  };
}

function makeCanvasContext() {
  const calls = [];
  const noop = (name) => (...args) => { calls.push({ name, args }); };
  return {
    _calls: calls,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: (img) => { calls.push({ name: 'putImageData', args: [img.width, img.height] }); },
    save: noop('save'), restore: noop('restore'), beginPath: noop('beginPath'),
    moveTo: noop('moveTo'), lineTo: noop('lineTo'), arc: noop('arc'), stroke: noop('stroke'),
    set strokeStyle(v) { calls.push({ name: 'strokeStyle', args: [v] }); },
    set lineWidth(v) { calls.push({ name: 'lineWidth', args: [v] }); },
  };
}

function createElement(tag = 'div', id = null) {
  const el = {
    tagName: String(tag).toUpperCase(),
    id: id ?? '',
    value: '',
    textContent: '',
    title: '',
    type: '',
    disabled: false,
    hidden: false,
    checked: false,
    lang: '',
    style: {},
    dataset: {},
    children: [],
    parent: null,
    _className: '',
    _innerHTML: '',
    _attrs: Object.create(null),
    _handlers: Object.create(null),
    _ctx: null,
  };
  el.classList = makeClassList(el);
  Object.defineProperty(el, 'className', {
    get() { return this._className; },
    set(v) {
      this._className = String(v);
      this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
    },
    enumerable: true,
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._innerHTML; },
    set(v) { this._innerHTML = String(v); if (v === '') this.children = []; },
    enumerable: true,
  });
  el.appendChild = function (child) { child.parent = this; this.children.push(child); return child; };
  el.remove = function () {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  };
  el.setAttribute = function (k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); };
  el.getAttribute = function (k) { return k in this._attrs ? this._attrs[k] : null; };
  el.hasAttribute = function (k) { return k in this._attrs; };
  el.addEventListener = function (ev, fn) { (this._handlers[ev] ||= []).push(fn); };
  el.removeEventListener = function (ev, fn) {
    if (this._handlers[ev]) this._handlers[ev] = this._handlers[ev].filter((f) => f !== fn);
  };
  el.dispatch = function (ev) { (this._handlers[ev] || []).forEach((fn) => fn({ type: ev, target: this })); };
  el.click = function () { this.dispatch('click'); };
  el.setCustomValidity = function (msg) { this._validity = msg; };
  el.reportValidity = function () { return !this._validity; };
  el.getContext = function () { this._ctx ||= makeCanvasContext(); return this._ctx; };
  el.descendants = function () {
    const out = [];
    const walk = (n) => { for (const c of n.children || []) { out.push(c); walk(c); } };
    walk(this);
    return out;
  };
  el.querySelectorAll = function (sel) {
    const want = String(sel).trim();
    return this.descendants().filter((n) => {
      if (want.startsWith('.')) return n.classList.contains(want.slice(1));
      if (want.startsWith('#')) return n.id === want.slice(1);
      return n.tagName === want.toUpperCase();
    });
  };
  el.querySelector = function (sel) { return this.querySelectorAll(sel)[0] ?? null; };
  return el;
}

/**
 * Install a document/window pair backed by the ids index.html actually declares.
 * @returns {{ byId: (id: string) => object|null, i18nKeys: string[], reset: () => void }}
 */
export function installDom() {
  const { ids, i18nNodes, booleanAttrs } = parseIndexHtml();
  const registry = new Map();
  for (const id of ids) {
    const el = createElement('div', id);
    const flags = booleanAttrs.get(id);
    if (flags?.hidden) el.hidden = true;
    if (flags?.disabled) el.disabled = true;
    registry.set(id, el);
  }

  // Nodes carrying data-i18n, so applyLanguage's querySelectorAll finds real targets.
  const i18nElements = i18nNodes.map(({ id, key }) => {
    const el = id && registry.has(id) ? registry.get(id) : createElement('span', id);
    el.setAttribute('data-i18n', key);
    return el;
  });

  const documentElement = createElement('html', null);
  const body = createElement('body', null);

  globalThis.document = {
    documentElement,
    body,
    getElementById: (id) => registry.get(id) ?? null,
    createElement: (tag) => createElement(tag),
    querySelectorAll: (sel) => (String(sel).trim() === '[data-i18n]' ? i18nElements : []),
    querySelector: (sel) => (String(sel).trim() === '[data-i18n]' ? i18nElements[0] ?? null : null),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getComputedStyle: (el) => el.style,
  };
  if (typeof globalThis.navigator === 'undefined') globalThis.navigator = {};

  return {
    byId: (id) => registry.get(id) ?? null,
    declaredIds: ids,
    i18nKeys: i18nNodes.map((n) => n.key),
    /** Every element currently rendered under a container id, depth-first. */
    within: (containerId) => (registry.get(containerId)?.descendants() ?? []),
    /** First rendered descendant of `containerId` whose className contains `cls`. */
    find: (containerId, cls) =>
      (registry.get(containerId)?.descendants() ?? []).find((n) => n.classList.contains(cls)) ?? null,
  };
}

/** Install a fake native WebMCP host before importing main.js. */
export function installModelContext(target = 'document') {
  const registered = new Map();
  const host = {
    registerTool: (tool) => { registered.set(tool.name, tool); },
    unregisterTool: (name) => { registered.delete(name); },
    listTools: () => [...registered.keys()],
    getTool: (name) => registered.get(name),
    _registered: registered,
  };
  if (target === 'navigator') globalThis.navigator.modelContext = host;
  else globalThis.document.modelContext = host;
  return host;
}
