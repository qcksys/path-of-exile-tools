// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/util.js
function e(e) {
	let t = Object.values(e).filter((e) => typeof e == "number");
	return Object.entries(e).filter(([e, n]) => t.indexOf(+e) === -1).map(([e, t]) => t);
}
function t(e, t = "|") {
	return e.map((e) => ue(e)).join(t);
}
function n(e, t) {
	return typeof t == "bigint" ? t.toString() : t;
}
var r = class {
	constructor(e) {
		this._getter = e, this._value = void 0;
	}
	get value() {
		let e = this._getter;
		return e !== void 0 && (this._value = e(), this._getter = void 0), this._value;
	}
};
function i(e) {
	return new r(e);
}
function a(e) {
	return e == null;
}
function o(e) {
	let t = +!!e.startsWith("^"), n = e.endsWith("$") ? e.length - 1 : e.length;
	return e.slice(t, n);
}
function s(e, t) {
	let n = e / t, r = Math.round(n), i = 4 * 2 ** -52 * Math.max(Math.abs(n), 1);
	return Math.abs(n - r) < i ? 0 : n - r;
}
var c = /* @__PURE__*/ Symbol("evaluating");
function l(e, t, n) {
	let r;
	Object.defineProperty(e, t, {
		get() {
			if (r !== c) return r === void 0 && (r = c, r = n()), r;
		},
		set(n) {
			Object.defineProperty(e, t, { value: n });
		},
		configurable: !0
	});
}
function u(e, t, n) {
	Object.defineProperty(e, t, {
		value: n,
		writable: !0,
		enumerable: !0,
		configurable: !0
	});
}
function d(e) {
	let t = Object.getOwnPropertyDescriptor(e, "shape");
	return t?.get ? t.get.raw : t?.value;
}
function f(e) {
	return d(e._zod.def) ?? e._zod.def.shape;
}
function p(e, t, n) {
	Object.defineProperty(e, t, {
		get() {
			let e = n();
			return u(this, t, e), e;
		},
		enumerable: !0,
		configurable: !0
	});
}
function m(e, t, n) {
	t in e ? u(e, t, n) : e[t] = n;
}
function h(e, t, n, r) {
	let i = f(t);
	for (let a of n) {
		let n = Object.getOwnPropertyDescriptor(i, a);
		n.enumerable && (n.get ? p(e, a, () => {
			let e = t._zod.def.shape[a];
			return r ? r(e, a) : e;
		}) : m(e, a, r ? r(n.value, a) : n.value));
	}
}
function g(e, t) {
	for (let n of Reflect.ownKeys(t)) {
		let r = Object.getOwnPropertyDescriptor(t, n);
		r.enumerable && (r.get ? p(e, n, () => t[n]) : m(e, n, r.value));
	}
}
function _(...e) {
	let t = {};
	for (let n of e) {
		let e = Object.getOwnPropertyDescriptors(n);
		Object.assign(t, e);
	}
	return Object.defineProperties({}, t);
}
function ee(e) {
	return JSON.stringify(e);
}
function te(e) {
	return e.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var ne = "captureStackTrace" in Error ? Error.captureStackTrace : (...e) => {};
function re(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
var ie = /* @__PURE__*/ i(() => {
	if (x.jitless || typeof navigator < "u" && navigator?.userAgent?.includes("Cloudflare")) return !1;
	try {
		return Function(""), !0;
	} catch {
		return !1;
	}
});
function ae(e) {
	if (re(e) === !1) return !1;
	let t = e.constructor;
	if (t === void 0 || typeof t != "function") return !0;
	let n = t.prototype;
	return re(n) !== !1 && Object.prototype.hasOwnProperty.call(n, "isPrototypeOf") !== !1;
}
function oe(e) {
	return ae(e) ? { ...e } : Array.isArray(e) ? [...e] : e instanceof Map ? new Map(e) : e instanceof Set ? new Set(e) : e;
}
var se = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function ce(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function le(e, t, n) {
	let r = new e._zod.constr(t ?? e._zod.def);
	return (!t || n?.parent) && (r._zod.parent = e), r;
}
function v(e) {
	let t = e;
	if (!t) return {};
	if (typeof t == "string") return { error: () => t };
	if (t?.message !== void 0) {
		if (t?.error !== void 0) throw Error("Cannot specify both `message` and `error` params");
		t.error = t.message;
	}
	return delete t.message, typeof t.error == "string" ? {
		...t,
		error: () => t.error
	} : t;
}
function ue(e) {
	return typeof e == "bigint" ? e.toString() + "n" : typeof e == "string" ? `"${e}"` : `${e}`;
}
function de(e) {
	return Object.keys(e).filter((t) => e[t]._zod.optin !== void 0 && e[t]._zod.optout === "optional");
}
var fe = {
	safeint: [-(2 ** 53 - 1), 2 ** 53 - 1],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}, pe = {
	int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
	uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")]
};
function me(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".pick() cannot be used on object schemas containing refinements");
	let i = {};
	return h(i, e, he(e, t)), le(e, _(n, {
		shape: i,
		checks: []
	}));
}
function he(e, t) {
	let n = f(e), r = [];
	for (let e of Reflect.ownKeys(t)) {
		if (!Object.getOwnPropertyDescriptor(n, e)?.enumerable) throw Error(`Unrecognized key: "${String(e)}"`);
		t[e] && r.push(e);
	}
	return r;
}
function ge(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".omit() cannot be used on object schemas containing refinements");
	let i = new Set(he(e, t)), a = {};
	return h(a, e, Reflect.ownKeys(f(e)).filter((e) => !i.has(e))), le(e, _(n, {
		shape: a,
		checks: []
	}));
}
function _e(e, t) {
	if (!ae(t)) throw Error("Invalid input to extend: expected a plain object");
	let n = e._zod.def.checks;
	if (n && n.length > 0) {
		let n = f(e);
		for (let e of Reflect.ownKeys(t)) if (Object.getOwnPropertyDescriptor(n, e) !== void 0) throw Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return le(e, _(e._zod.def, { shape: ve(e, t) }));
}
function ve(e, t) {
	let n = {};
	return h(n, e, Reflect.ownKeys(f(e))), g(n, t), n;
}
function ye(e, t) {
	if (!ae(t)) throw Error("Invalid input to safeExtend: expected a plain object");
	return le(e, _(e._zod.def, { shape: ve(e, t) }));
}
function be(e, t) {
	if (!t?._zod?.def) throw Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
	if (e._zod.def.checks?.length) throw Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	let n = {};
	return h(n, e, Reflect.ownKeys(f(e))), h(n, t, Reflect.ownKeys(f(t))), le(e, _(e._zod.def, {
		shape: n,
		get catchall() {
			return t._zod.def.catchall;
		},
		checks: t._zod.def.checks ?? []
	}));
}
function xe(e, t, n, r = "partial") {
	let i = t._zod.def.checks;
	if (i && i.length > 0) throw Error(`.${r}() cannot be used on object schemas containing refinements`);
	let a = n ? new Set(he(t, n)) : void 0, o = {};
	return h(o, t, Reflect.ownKeys(f(t)), e && ((t, n) => a && !a.has(n) ? t : new e({
		type: "optional",
		innerType: t
	}))), le(t, _(t._zod.def, {
		shape: o,
		checks: []
	}));
}
function Se(e, t, n) {
	let r = n ? new Set(he(t, n)) : void 0, i = {};
	return h(i, t, Reflect.ownKeys(f(t)), (t, n) => r && !r.has(n) ? t : new e({
		type: "nonoptional",
		innerType: t
	})), le(t, _(t._zod.def, { shape: i }));
}
function Ce(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue !== !0) return !0;
	return !1;
}
function we(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue === !1) return !0;
	return !1;
}
function Te(e, t) {
	return t.map((t) => {
		var n;
		return (n = t).path ?? (n.path = []), t.path.unshift(e), t;
	});
}
function Ee(e) {
	return typeof e == "string" ? e : e?.message;
}
function De(e) {
	let t = [];
	for (let n of e ?? []) {
		let e = n._zod.def;
		if (!/_(length|size)$|_equals$/.test(e.check)) break;
		let r = e.maximum ?? e.length ?? e.size;
		r >= 0 && t.push([r, n]);
	}
	return t;
}
function Oe(e, t, n) {
	var r;
	for (let i = t; i < e.length; i++) (r = e[i]).schema ?? (r.schema = n);
}
function ke(e, t, n) {
	var r;
	let i = e.inst?._zod?.traits;
	i?.has("$ZodType") && (i.has("$ZodCheck") ? (r = e).schema ?? (r.schema = e.inst) : e.schema = e.inst);
	let a = e.schema === e.inst ? void 0 : e.schema?._zod.def?.error, o = e.message ? e.message : Ee(e.inst?._zod.def?.error?.(e)) ?? Ee(a?.(e)) ?? Ee(t?.error?.(e)) ?? Ee(n.customError?.(e)) ?? Ee(n.localeError?.(e)) ?? "Invalid input", s = {};
	for (let t of Object.keys(e)) t !== "inst" && t !== "schema" && t !== "continue" && t !== "input" && t !== "__proto__" && (s[t] = e[t]);
	return s.path ??= [], s.message = o, t?.reportInput && (s.input = e.input), s;
}
var Ae = /[\uD800-\uDBFF]/;
function je(e) {
	let t = e.length;
	if (!Ae.test(e)) return t;
	let n = t;
	for (let r = 0; r < t - 1; r++) (e.charCodeAt(r) & 64512) == 55296 && (e.charCodeAt(r + 1) & 64512) == 56320 && (n--, r++);
	return n;
}
function Me(e) {
	return Array.isArray(e) ? "array" : typeof e == "string" ? "string" : "unknown";
}
function Ne(e) {
	let t = typeof e;
	switch (t) {
		case "number": return Number.isNaN(e) ? "nan" : "number";
		case "object": {
			if (e === null) return "null";
			if (Array.isArray(e)) return "array";
			let t = e;
			if (t && Object.getPrototypeOf(t) !== Object.prototype && "constructor" in t && t.constructor) return t.constructor.name;
		}
	}
	return t;
}
function Pe(...e) {
	let [t, n, r] = e;
	return typeof t == "string" ? {
		message: t,
		code: "custom",
		input: n,
		inst: r
	} : { ...t };
}
function Fe(e, t) {
	for (let n in t) {
		let r = Object.getOwnPropertyDescriptor(t, n);
		r.get ? Object.defineProperty(e, n, {
			...r,
			enumerable: !1
		}) : ze(e, n, r.value);
	}
}
function Ie(e, t, n, r = !0) {
	return Object.defineProperty(e, t, {
		configurable: !0,
		writable: !0,
		enumerable: r,
		value: n
	}), n;
}
function Le(e, t, n) {
	return Ie(e, t, n, !1);
}
/* @__NO_SIDE_EFFECTS__ */
function Re(e, t) {
	for (let n in e) {
		let r = e[n];
		Object.defineProperty(t, n, {
			configurable: !0,
			enumerable: !0,
			get() {
				return Ie(this, n, r(this));
			},
			set(e) {
				Ie(this, n, e);
			}
		});
	}
	return t;
}
function ze(e, t, n) {
	Object.defineProperty(e, t, {
		configurable: !0,
		get() {
			return this == null ? n : Ie(this, t, n.bind(this));
		},
		set(e) {
			Ie(this, t, e);
		}
	});
}
function Be(e, t) {
	let n = Object.getPrototypeOf(e);
	return t in n ? void 0 : n;
}
var Ve, He = !1, Ue = {
	configurable: !0,
	get() {
		He = !0;
	}
};
function y(e, t, n) {
	let r = Object.getPrototypeOf(e._zod);
	t in r && Ve !== e._zod ? Ve = void 0 : (Ve = e._zod, Object.defineProperty(r, t, {
		configurable: !0,
		get() {
			Object.defineProperty(this, t, Ue);
			let e = He;
			He = !1;
			try {
				let r = n(this);
				return He ? delete this[t] : Object.defineProperty(this, t, {
					configurable: !0,
					writable: !0,
					value: r
				}), He ||= e, r;
			} catch (n) {
				throw delete this[t], He ||= e, n;
			}
		},
		set(e) {
			Object.defineProperty(this, t, {
				configurable: !0,
				writable: !0,
				value: e
			});
		}
	}));
}
function We(e, t, n, r) {
	let i = Be(e, t);
	i && Object.defineProperty(i, t, {
		configurable: !0,
		get() {
			let e = {
				configurable: !0,
				writable: !0,
				enumerable: r,
				value: void 0
			};
			return Object.defineProperty(this, t, e), e.value = n(this), Object.defineProperty(this, t, e), e.value;
		},
		set(e) {
			Object.defineProperty(this, t, {
				configurable: !0,
				writable: !0,
				enumerable: r,
				value: e
			});
		}
	});
}
var Ge = "~constantCatch";
function Ke(e) {
	let t = () => e;
	return t[Ge] = !0, t;
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/core.js
var qe, Je = /*@__PURE__*/ Object.freeze({ status: "aborted" }), Ye = {
	value: void 0,
	enumerable: !1
}, Xe = "captureStackTrace" in Error ? Error : null;
function Ze(e) {
	let t = Xe;
	if (t) {
		let n = t.stackTraceLimit;
		if (typeof n == "number") {
			try {
				t.stackTraceLimit = 0;
			} catch {
				return Xe = null, new e();
			}
			try {
				return new e();
			} finally {
				t.stackTraceLimit = n;
			}
		}
	}
	return new e();
}
/* @__NO_SIDE_EFFECTS__ */
function b(e, t, n, r) {
	let i = {};
	function a(e) {
		this.def = e, this.constr = d, this.traits = /* @__PURE__ */ new Set();
	}
	a.prototype = i;
	let o = n, s = o && /* @__PURE__ */ new WeakSet();
	function c(n, r) {
		if (!n._zod) {
			Ye.value = new a(r);
			try {
				Object.defineProperty(n, "_zod", Ye);
			} finally {
				Ye.value = void 0;
			}
		} else if (n._zod.traits.has(e)) return;
		if (n._zod.traits.add(e), t(n, r), s) {
			let e = Object.getPrototypeOf(n), t = n._zod.constr.prototype, r = e;
			for (; r && r !== t;) r = Object.getPrototypeOf(r);
			let i = r ?? e;
			s.has(i) || (s.add(i), Fe(i, o));
		}
		let i = d.prototype;
		for (let e in i) Object.prototype.hasOwnProperty.call(i, e) && (e in n || (n[e] = i[e].bind(n)));
	}
	let l = r?.Parent ?? Object;
	class u extends l {}
	Object.defineProperty(u, "name", { value: e });
	function d(e) {
		let t = r?.Parent ? Ze(u) : this;
		c(t, e);
		let n = t._zod.deferred;
		if (n) {
			for (let e of n) e();
			t._zod.deferred = void 0;
		}
		let i = globalThis.__zod_globalConfig?.postProcessor;
		return i && i(t), t;
	}
	return Object.defineProperty(d, "init", { value: c }), Object.defineProperty(d, Symbol.hasInstance, { value: (t) => r?.Parent && t instanceof r.Parent ? !0 : t?._zod?.traits?.has(e) }), Object.defineProperty(d, "name", { value: e }), d;
}
var Qe = class extends Error {
	constructor() {
		super("Encountered Promise during synchronous parse. Use .parseAsync() instead.");
	}
}, $e = class extends Error {
	constructor(e) {
		super(`Encountered unidirectional transform during encode: ${e}`), this.name = "ZodEncodeError";
	}
};
(qe = globalThis).__zod_globalConfig ?? (qe.__zod_globalConfig = {});
var x = globalThis.__zod_globalConfig;
function et(e) {
	return e && Object.assign(x, e), x;
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/errors.js
function tt() {
	let e = this._zod;
	return e.message ??= JSON.stringify(e.def, n, 2), e.message;
}
function nt(e) {
	this._zod.message = e;
}
var rt = {
	get: tt,
	set: nt,
	enumerable: !0,
	configurable: !0
}, it = {
	value: void 0,
	enumerable: !1
}, at = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]), ot = /* @__PURE__ */ b("$ZodError", (e, t) => {
	e.name = "$ZodError", it.value = t, Object.defineProperty(e, "issues", it), it.value = void 0, Object.defineProperty(e, "message", rt);
	let n = Object.getPrototypeOf(e);
	at.has(n) || (at.add(n), Object.defineProperty(n, "toString", {
		configurable: !0,
		enumerable: !1,
		get() {
			let e = () => this.message;
			return Object.defineProperty(this, "toString", {
				value: e,
				configurable: !0,
				writable: !0
			}), e;
		},
		set(e) {
			Object.defineProperty(this, "toString", {
				value: e,
				configurable: !0,
				writable: !0
			});
		}
	}));
});
function st(e, t, n) {
	return Object.prototype.hasOwnProperty.call(e, t) || (t === "__proto__" ? Object.defineProperty(e, t, {
		value: n(),
		writable: !0,
		enumerable: !0,
		configurable: !0
	}) : e[t] = n()), e[t];
}
function ct(e, t = (e) => e.message) {
	let n = {}, r = [];
	for (let i of e.issues) i.path.length > 0 ? st(n, i.path[0], () => []).push(t(i)) : r.push(t(i));
	return {
		formErrors: r,
		fieldErrors: n
	};
}
function lt(e, t = (e) => e.message) {
	let n = { _errors: [] }, r = (e, i = []) => {
		for (let a of e.issues) if (a.code === "invalid_union" && a.errors.length) a.errors.map((e) => r({ issues: e }, [...i, ...a.path]));
		else if (a.code === "invalid_key") r({ issues: a.issues }, [...i, ...a.path]);
		else if (a.code === "invalid_element") r({ issues: a.issues }, [...i, ...a.path]);
		else {
			let e = [...i, ...a.path];
			if (e.length === 0) n._errors.push(t(a));
			else {
				let r = n, i = 0;
				for (; i < e.length;) {
					let n = e[i], o = i === e.length - 1;
					if (n === "_errors") {
						o && r._errors.push(t(a)), i++;
						continue;
					}
					Object.prototype.hasOwnProperty.call(r, n) || Object.defineProperty(r, n, {
						value: { _errors: [] },
						enumerable: !0,
						writable: !0,
						configurable: !0
					});
					let s = r[n];
					o && s._errors.push(t(a)), r = s, i++;
				}
			}
		}
	};
	return r(e), n;
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/parse.js
function ut(e, t) {
	return {
		callee: t?.callee ?? e,
		Err: t?.Err
	};
}
var dt = (e) => {
	let t = (n, r, i, a) => {
		let o = i ? {
			...i,
			async: !1
		} : { async: !1 }, s = n._zod.run({
			value: r,
			issues: []
		}, o);
		if (s instanceof Promise) throw new Qe();
		if (s.issues.length) {
			let n = new ((a?.Err) ?? e)(s.issues.map((e) => ke(e, o, et())));
			throw ne(n, a?.callee ?? t), n;
		}
		return s.value;
	};
	return t;
}, ft = (e) => {
	let t = async (n, r, i, a) => {
		let o = i ? {
			...i,
			async: !0
		} : { async: !0 }, s = n._zod.run({
			value: r,
			issues: []
		}, o);
		if (s instanceof Promise && (s = await s), s.issues.length) {
			let n = new ((a?.Err) ?? e)(s.issues.map((e) => ke(e, o, et())));
			throw ne(n, a?.callee ?? t), n;
		}
		return s.value;
	};
	return t;
}, pt = (e) => (t, n, r) => {
	let i = r ? {
		...r,
		async: !1
	} : { async: !1 }, a = t._zod.run({
		value: n,
		issues: []
	}, i);
	if (a instanceof Promise) throw new Qe();
	return a.issues.length ? mt(e, a.issues, i) : {
		success: !0,
		data: a.value
	};
};
function mt(e, t, n) {
	let r;
	return {
		success: !1,
		get error() {
			return r || (r = new e(t.map((e) => ke(e, n, et()))), t = void 0, n = void 0), r;
		},
		set error(e) {
			r = e, t = void 0, n = void 0;
		}
	};
}
var ht = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		async: !0
	} : { async: !0 }, a = t._zod.run({
		value: n,
		issues: []
	}, i);
	return a instanceof Promise && (a = await a), a.issues.length ? mt(e, a.issues, i) : {
		success: !0,
		data: a.value
	};
}, gt = /* @__PURE__ */ Symbol.for("zod.compile.invalid"), _t = /* @__PURE__ */ Symbol.for("zod.compile.fallback"), vt = ((e, t, n) => {
	let r = e._zod.bag.validator;
	if (r !== void 0) {
		if (r(t) !== gt) return !0;
		if (r.definite === !0 && n === void 0) return !1;
	}
	return yt(e, t, n);
});
function yt(e, t, n) {
	let r = n ? {
		...n,
		async: !1,
		abortEarly: !0
	} : {
		async: !1,
		abortEarly: !0
	}, i = e._zod.bag.fallbackRun, a;
	if (i ? (r[_t] = !0, a = i({
		value: t,
		issues: []
	}, r)) : a = e._zod.run({
		value: t,
		issues: []
	}, r), a instanceof Promise) throw new Qe();
	return a.issues.length === 0;
}
var bt = async (e, t, n) => {
	let r = n ? {
		...n,
		async: !0,
		abortEarly: !0
	} : {
		async: !0,
		abortEarly: !0
	}, i = e._zod.run({
		value: t,
		issues: []
	}, r);
	return i instanceof Promise && (i = await i), i.issues.length === 0;
}, xt = (e) => {
	let t = dt(e), n = (e, r, i, a) => {
		let o = i ? {
			...i,
			direction: "backward"
		} : { direction: "backward" };
		return t(e, r, o, ut(n, a));
	};
	return n;
}, St = (e) => {
	let t = dt(e), n = (e, r, i, a) => t(e, r, i, ut(n, a));
	return n;
}, Ct = (e) => {
	let t = ft(e), n = async (e, r, i, a) => {
		let o = i ? {
			...i,
			direction: "backward"
		} : { direction: "backward" };
		return await t(e, r, o, ut(n, a));
	};
	return n;
}, wt = (e) => {
	let t = ft(e), n = async (e, r, i, a) => await t(e, r, i, ut(n, a));
	return n;
}, Tt = (e) => (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return pt(e)(t, n, i);
}, Et = (e) => (t, n, r) => pt(e)(t, n, r), Dt = (e) => async (t, n, r) => {
	let i = r ? {
		...r,
		direction: "backward"
	} : { direction: "backward" };
	return ht(e)(t, n, i);
}, Ot = (e) => async (t, n, r) => ht(e)(t, n, r), kt = /^[cC][0-9a-z]{6,}$/, At = /^[0-9a-z]+$/, jt = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/, Mt = /^[0-9a-vA-V]{20}$/, Nt = /^[A-Za-z0-9]{27}$/, Pt = /^[a-zA-Z0-9_-]{21}$/;
function Ft(e) {
	return RegExp(`^[a-zA-Z0-9_-]{${e}}$`);
}
var It = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/, Lt = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/, Rt = (e) => e ? RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`) : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/, zt = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/, Bt = "^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$";
function Vt() {
	return new RegExp(Bt, "u");
}
var Ht = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, Ut = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/, Wt = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/, Gt = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, Kt = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/, qt = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/, Jt = /^https?$/, Yt = /^\+[1-9]\d{6,14}$/, Xt = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))";
function Zt(e) {
	return RegExp(`^${e}$`);
}
var Qt = /*@__PURE__*/ Zt(Xt);
function $t(e) {
	let t = "(?:[01]\\d|2[0-3]):[0-5]\\d";
	return typeof e.precision == "number" ? e.precision === -1 ? `${t}` : e.precision === 0 ? `${t}:[0-5]\\d` : `${t}:[0-5]\\d\\.\\d{${e.precision}}` : e.seconds ? `${t}:[0-5]\\d(?:\\.\\d+)?` : `${t}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function en(e) {
	return RegExp(`^${$t(e)}$`);
}
function tn(e) {
	let t = ["Z"];
	e.offset && t.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");
	let n = `${$t({
		precision: e.precision,
		seconds: !0
	})}(?:${t.join("|")})`, r = e.local ? `${n}|${$t({ precision: e.precision })}` : n;
	return RegExp(`^${Xt}T(?:${r})$`);
}
var nn = /^[\s\S]{0,}$/, rn = /^-?\d+$/, an = /^-?\d+(?:\.\d+)?$/, on = /^(?:true|false)$/i, sn = /^null$/i, cn = /^[^A-Z]*$/, ln = /^[^a-z]*$/, S = /*@__PURE__*/ b("$ZodCheck", (e, t) => {
	var n;
	e._zod ??= {}, e._zod.def = t, (n = e._zod).onattach ?? (n.onattach = []);
}), un = (e) => {
	let t = e.value;
	return !a(t) && t.length !== void 0;
}, dn = {
	number: "number",
	bigint: "bigint",
	object: "date"
}, fn = /*@__PURE__*/ b("$ZodCheckLessThan", (e, t) => {
	S.init(e, t);
	let n = dn[typeof t.value];
	e._zod.check = (r) => {
		(t.inclusive ? r.value <= t.value : r.value < t.value) || r.issues.push({
			origin: dn[typeof r.value] ?? n,
			code: "too_big",
			maximum: typeof t.value == "object" ? t.value.getTime() : t.value,
			input: r.value,
			inclusive: t.inclusive,
			inst: e,
			continue: !t.abort
		});
	};
}), pn = /*@__PURE__*/ b("$ZodCheckGreaterThan", (e, t) => {
	S.init(e, t);
	let n = dn[typeof t.value];
	e._zod.check = (r) => {
		(t.inclusive ? r.value >= t.value : r.value > t.value) || r.issues.push({
			origin: dn[typeof r.value] ?? n,
			code: "too_small",
			minimum: typeof t.value == "object" ? t.value.getTime() : t.value,
			input: r.value,
			inclusive: t.inclusive,
			inst: e,
			continue: !t.abort
		});
	};
}), mn = /*@__PURE__*/ b("$ZodCheckMultipleOf", (e, t) => {
	S.init(e, t), e._zod.check = (n) => {
		if (typeof n.value != typeof t.value) throw Error("Cannot mix number and bigint in multiple_of check.");
		(typeof n.value == "bigint" ? t.value !== BigInt(0) && n.value % t.value === BigInt(0) : s(n.value, t.value) === 0) || n.issues.push({
			origin: typeof n.value,
			code: "not_multiple_of",
			divisor: t.value,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), hn = /*@__PURE__*/ b("$ZodCheckNumberFormat", (e, t) => {
	S.init(e, t), t.format = t.format || "float64";
	let n = t.format?.includes("int"), r = n ? "int" : "number", [i, a] = fe[t.format];
	e._zod.check = (o) => {
		let s = o.value;
		if (n) {
			if (!Number.isInteger(s)) {
				o.issues.push({
					expected: r,
					format: t.format,
					code: "invalid_type",
					continue: !1,
					input: s,
					inst: e
				});
				return;
			}
			if (!Number.isSafeInteger(s)) {
				s > 0 ? o.issues.push({
					input: s,
					code: "too_big",
					maximum: 2 ** 53 - 1,
					note: "Integers must be within the safe integer range.",
					inst: e,
					origin: r,
					inclusive: !0,
					continue: !t.abort
				}) : o.issues.push({
					input: s,
					code: "too_small",
					minimum: -(2 ** 53 - 1),
					note: "Integers must be within the safe integer range.",
					inst: e,
					origin: r,
					inclusive: !0,
					continue: !t.abort
				});
				return;
			}
		}
		s < i && o.issues.push({
			origin: "number",
			input: s,
			code: "too_small",
			minimum: i,
			inclusive: !0,
			inst: e,
			continue: !t.abort
		}), s > a && o.issues.push({
			origin: "number",
			input: s,
			code: "too_big",
			maximum: a,
			inclusive: !0,
			inst: e,
			continue: !t.abort
		});
	};
}), gn = /*@__PURE__*/ b("$ZodCheckMaxLength", (e, t) => {
	var n;
	S.init(e, t), (n = e._zod.def).when ?? (n.when = un), e._zod.check = (n) => {
		let r = n.value, i = r.length;
		if ((typeof r == "string" && i > t.maximum ? je(r) : i) <= t.maximum) return;
		let a = Me(r);
		n.issues.push({
			origin: a,
			code: "too_big",
			maximum: t.maximum,
			inclusive: !0,
			input: r,
			inst: e,
			continue: !t.abort
		});
	};
}), _n = /*@__PURE__*/ b("$ZodCheckMinLength", (e, t) => {
	var n;
	S.init(e, t), (n = e._zod.def).when ?? (n.when = un), e._zod.check = (n) => {
		let r = n.value, i = r.length;
		if ((typeof r == "string" && i >= t.minimum && i < t.minimum * 2 ? je(r) : i) >= t.minimum) return;
		let a = Me(r);
		n.issues.push({
			origin: a,
			code: "too_small",
			minimum: t.minimum,
			inclusive: !0,
			input: r,
			inst: e,
			continue: !t.abort
		});
	};
}), vn = /*@__PURE__*/ b("$ZodCheckLengthEquals", (e, t) => {
	var n;
	S.init(e, t), (n = e._zod.def).when ?? (n.when = un), e._zod.check = (n) => {
		let r = n.value, i = r.length, a = typeof r == "string" && i >= t.length && i <= t.length * 2 ? je(r) : i;
		if (a === t.length) return;
		let o = Me(r), s = a > t.length;
		n.issues.push({
			origin: o,
			...s ? {
				code: "too_big",
				maximum: t.length
			} : {
				code: "too_small",
				minimum: t.length
			},
			inclusive: !0,
			exact: !0,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), yn = /*@__PURE__*/ b("$ZodCheckStringFormat", (e, t) => {
	var n, r;
	S.init(e, t), t.pattern ? (n = e._zod).check ?? (n.check = (n) => {
		t.pattern.lastIndex = 0, t.pattern.test(n.value) || n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: t.format,
			input: n.value,
			...t.pattern ? { pattern: t.pattern.toString() } : {},
			inst: e,
			continue: !t.abort
		});
	}) : (r = e._zod).check ?? (r.check = () => {});
}), bn = /*@__PURE__*/ b("$ZodCheckRegex", (e, t) => {
	yn.init(e, t), e._zod.check = (n) => {
		t.pattern.lastIndex = 0, t.pattern.test(n.value) || n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: n.value,
			pattern: t.pattern.toString(),
			inst: e,
			continue: !t.abort
		});
	};
}), xn = /*@__PURE__*/ b("$ZodCheckLowerCase", (e, t) => {
	t.pattern ??= cn, yn.init(e, t);
}), Sn = /*@__PURE__*/ b("$ZodCheckUpperCase", (e, t) => {
	t.pattern ??= ln, yn.init(e, t);
}), Cn = /*@__PURE__*/ b("$ZodCheckIncludes", (e, t) => {
	S.init(e, t);
	let n = ce(t.includes);
	t.pattern = new RegExp(typeof t.position == "number" ? `^.{${t.position},}${n}` : n), e._zod.check = (n) => {
		n.value.includes(t.includes, t.position) || n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: t.includes,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), wn = /*@__PURE__*/ b("$ZodCheckStartsWith", (e, t) => {
	S.init(e, t);
	let n = RegExp(`^${ce(t.prefix)}.*`);
	t.pattern ??= n, e._zod.check = (n) => {
		n.value.startsWith(t.prefix) || n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: t.prefix,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), Tn = /*@__PURE__*/ b("$ZodCheckEndsWith", (e, t) => {
	S.init(e, t);
	let n = RegExp(`.*${ce(t.suffix)}$`);
	t.pattern ??= n, e._zod.check = (n) => {
		n.value.endsWith(t.suffix) || n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: t.suffix,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), En = /*@__PURE__*/ b("$ZodCheckOverwrite", (e, t) => {
	S.init(e, t), e._zod.check = (e) => {
		e.value = t.tx(e.value);
	};
}), Dn = class {
	constructor(e = [], t = {}) {
		this.content = [], this.indent = 0, this.args = e, this.closed = t;
	}
	indented(e) {
		this.indent += 1;
		try {
			e(this);
		} finally {
			--this.indent;
		}
	}
	write(e) {
		if (typeof e == "function") {
			e(this, { execution: "sync" }), e(this, { execution: "async" });
			return;
		}
		let t = e.split("\n").filter((e) => e), n = Math.min(...t.map((e) => e.length - e.trimStart().length)), r = t.map((e) => e.slice(n)).map((e) => " ".repeat(this.indent * 2) + e);
		for (let e of r) this.content.push(e);
	}
	compile() {
		let e = Function, t = this?.content ?? [""];
		return new e(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {\n${t.join("\n")}\n};`)(...Object.values(this.closed));
	}
}, On = {
	major: 4,
	minor: 6,
	patch: 7
}, C = /*@__PURE__*/ b("$ZodType", (e, t) => {
	var n;
	e ??= {}, e._zod.def = t, e._zod.bag = e._zod.bag || {}, e._zod.version = On;
	let r = e._zod.def.checks, i = e._zod.traits.has("$ZodCheck") ? [e, ...r ?? []] : r?.length ? [...r] : [];
	for (let t of i) for (let n of t._zod.onattach) n(e);
	if (i.length === 0) (n = e._zod).deferred ?? (n.deferred = []), e._zod.deferred?.push(() => {
		e._zod.run = e._zod.parse;
	});
	else {
		let t = (t, n, r) => {
			if (t.memo) return t;
			let i = Ce(t), a;
			for (let o of n) {
				if (o._zod.def.when) {
					if (we(t) || !o._zod.def.when(t)) continue;
				} else if (i) continue;
				let n = t.issues.length, s = o._zod.check(t);
				if (s instanceof Promise && r?.async === !1) throw new Qe();
				if (a || s instanceof Promise) a = (a ?? Promise.resolve()).then(async () => {
					await s, t.issues.length !== n && (Oe(t.issues, n, e), i ||= Ce(t, n));
				});
				else {
					if (t.issues.length === n) continue;
					Oe(t.issues, n, e), i ||= Ce(t, n);
				}
			}
			return a ? a.then(() => t) : t;
		}, n = (n, r, a) => {
			if (Ce(n)) return n.aborted = !0, n;
			let o = t(r, i, a);
			if (o instanceof Promise) {
				if (a.async === !1) throw new Qe();
				return o.then((t) => e._zod.parse(t, a));
			}
			return e._zod.parse(o, a);
		};
		e._zod.run = (r, a) => {
			if (a.skipChecks) return e._zod.parse(r, a);
			if (a.direction === "backward") {
				let t = e._zod.parse({
					value: r.value,
					issues: []
				}, {
					...a,
					skipChecks: !0
				});
				return t instanceof Promise ? t.then((e) => n(e, r, a)) : n(t, r, a);
			}
			let o = e._zod.parse(r, a);
			if (o instanceof Promise) {
				if (a.async === !1) throw new Qe();
				return o.then((e) => t(e, i, a));
			}
			return t(o, i, a);
		};
	}
}, {
	get "~standard"() {
		return Le(this, "~standard", jn(this));
	},
	set "~standard"(e) {
		Ie(this, "~standard", e);
	}
}), kn = (e, t) => e.issues.length ? { issues: e.issues.map((e) => ke(e, t, et())) } : { value: e.value };
async function An(e, t) {
	let n = { async: !0 };
	return kn(await e._zod.run({
		value: t,
		issues: []
	}, n), n);
}
function jn(e) {
	return {
		validate: (t) => {
			let n = { async: !1 };
			try {
				let r = e._zod.run({
					value: t,
					issues: []
				}, n);
				if (!(r instanceof Promise)) return kn(r, n);
			} catch {}
			return An(e, t);
		},
		vendor: "zod",
		version: 1
	};
}
var Mn = /*@__PURE__*/ b("$ZodString", (e, t) => {
	C.init(e, t), e._zod.pattern = t.pattern ?? nn, e._zod.parse = (n, r) => {
		if (t.coerce) try {
			n.value = String(n.value);
		} catch {}
		return typeof n.value == "string" || n.issues.push({
			expected: "string",
			code: "invalid_type",
			input: n.value,
			inst: e
		}), n;
	};
}), w = /*@__PURE__*/ b("$ZodStringFormat", (e, t) => {
	yn.init(e, t), Mn.init(e, t);
}), Nn = /*@__PURE__*/ b("$ZodGUID", (e, t) => {
	t.pattern ??= Lt, w.init(e, t);
}), Pn = /*@__PURE__*/ b("$ZodUUID", (e, t) => {
	if (t.version) {
		let e = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[t.version];
		if (e === void 0) throw Error(`Invalid UUID version: "${t.version}"`);
		t.pattern ??= Rt(e);
	} else t.pattern ??= Rt();
	w.init(e, t);
}), Fn = /*@__PURE__*/ b("$ZodEmail", (e, t) => {
	t.pattern ??= zt, w.init(e, t);
});
function In(e) {
	try {
		return typeof URL < "u" && typeof URL.canParse == "function" ? URL.canParse(e) : (new URL(e), !0);
	} catch {
		return !1;
	}
}
function Ln(e, t) {
	return !("normalize" in t) && !("hostname" in t) && !("protocol" in t) ? In(e) || 2 : Rn(e, t);
}
function Rn(e, t) {
	if (!t.normalize && t.protocol?.source === Jt.source && !/^https?:\/\//i.test(e)) return 1;
	try {
		if (typeof URL < "u") {
			let t = URL;
			if (typeof t.parse == "function") return t.parse(e) ?? 2;
		}
		return new URL(e);
	} catch {
		return 2;
	}
}
var zn = /[\t\n\r]/g;
function Bn(e) {
	return e.replace(zn, "");
}
function Vn(e, t) {
	return t.lastIndex = 0, t.test(e.hostname);
}
function Hn(e, t) {
	return t.lastIndex = 0, t.test(e.protocol.endsWith(":") ? e.protocol.slice(0, -1) : e.protocol);
}
var Un = /*@__PURE__*/ b("$ZodURL", (e, t) => {
	w.init(e, t), e._zod.check = (n) => {
		try {
			let r = n.value.trim(), i = Ln(r, t);
			if (i === 1) {
				n.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid URL format",
					input: n.value,
					inst: e,
					continue: !t.abort
				});
				return;
			}
			if (i === 2) {
				n.issues.push({
					code: "invalid_format",
					format: "url",
					input: n.value,
					inst: e,
					continue: !t.abort
				});
				return;
			}
			if (i === !0) {
				n.value = Bn(r);
				return;
			}
			t.hostname && !Vn(i, t.hostname) && n.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid hostname",
				pattern: t.hostname.source,
				input: n.value,
				inst: e,
				continue: !t.abort
			}), t.protocol && !Hn(i, t.protocol) && n.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid protocol",
				pattern: t.protocol.source,
				input: n.value,
				inst: e,
				continue: !t.abort
			}), n.value = t.normalize ? i.href : Bn(r);
			return;
		} catch {
			n.issues.push({
				code: "invalid_format",
				format: "url",
				input: n.value,
				inst: e,
				continue: !t.abort
			});
		}
	};
}), Wn = /*@__PURE__*/ b("$ZodEmoji", (e, t) => {
	t.pattern ??= Vt(), w.init(e, t);
}), Gn = /*@__PURE__*/ b("$ZodNanoID", (e, t) => {
	if (t.length !== void 0 && (!Number.isInteger(t.length) || t.length < 1)) throw Error(`Invalid nanoid length: ${t.length}`);
	t.pattern ??= t.length === void 0 ? Pt : Ft(t.length), w.init(e, t);
}), Kn = /*@__PURE__*/ b("$ZodCUID", (e, t) => {
	t.pattern ??= kt, w.init(e, t);
}), qn = /*@__PURE__*/ b("$ZodCUID2", (e, t) => {
	t.pattern ??= At, w.init(e, t);
}), Jn = /*@__PURE__*/ b("$ZodULID", (e, t) => {
	t.pattern ??= jt, w.init(e, t);
}), Yn = /*@__PURE__*/ b("$ZodXID", (e, t) => {
	t.pattern ??= Mt, w.init(e, t);
}), Xn = /*@__PURE__*/ b("$ZodKSUID", (e, t) => {
	t.pattern ??= Nt, w.init(e, t);
}), Zn = /*@__PURE__*/ b("$ZodISODateTime", (e, t) => {
	t.pattern ??= tn(t), w.init(e, t);
}), Qn = /*@__PURE__*/ b("$ZodISODate", (e, t) => {
	t.pattern ??= Qt, w.init(e, t);
}), $n = /*@__PURE__*/ b("$ZodISOTime", (e, t) => {
	t.pattern ??= en(t), w.init(e, t);
}), er = /*@__PURE__*/ b("$ZodISODuration", (e, t) => {
	t.pattern ??= It, w.init(e, t);
}), tr = /*@__PURE__*/ b("$ZodIPv4", (e, t) => {
	t.pattern ??= Ht, w.init(e, t);
}), nr = /^[0-9a-fA-F:.]+$/;
function rr(e) {
	return nr.test(e) ? In(`http://[${e}]`) : !1;
}
var ir = /*@__PURE__*/ b("$ZodIPv6", (e, t) => {
	t.pattern ??= Ut, w.init(e, t), e._zod.check = (n) => {
		rr(n.value) || n.issues.push({
			code: "invalid_format",
			format: "ipv6",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), ar = /*@__PURE__*/ b("$ZodCIDRv4", (e, t) => {
	t.pattern ??= Wt, w.init(e, t);
});
function or(e) {
	let t = e.split("/");
	if (t.length !== 2) return !1;
	let [n, r] = t;
	if (!r) return !1;
	let i = Number(r);
	return `${i}` !== r || i < 0 || i > 128 ? !1 : rr(n);
}
var sr = /*@__PURE__*/ b("$ZodCIDRv6", (e, t) => {
	t.pattern ??= Gt, w.init(e, t), e._zod.check = (n) => {
		or(n.value) || n.issues.push({
			code: "invalid_format",
			format: "cidrv6",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
});
function cr(e) {
	if (e === "") return !0;
	if (/\s/.test(e) || e.length % 4 != 0) return !1;
	try {
		return atob(e), !0;
	} catch {
		return !1;
	}
}
var lr = /^[0-9a-zA-Z+/]*={0,2}$/, ur = /*@__PURE__*/ b("$ZodBase64", (e, t) => {
	t.pattern ??= lr, w.init(e, t), e._zod.check = (n) => {
		cr(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), dr = /^[A-Za-z0-9_-]*$/;
function fr(e) {
	if (!dr.test(e)) return !1;
	let t = e.replace(/[-_]/g, (e) => e === "-" ? "+" : "/");
	return cr(t.padEnd(Math.ceil(t.length / 4) * 4, "="));
}
var pr = /*@__PURE__*/ b("$ZodBase64URL", (e, t) => {
	t.pattern ??= dr, w.init(e, t), e._zod.check = (n) => {
		fr(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), mr = /*@__PURE__*/ b("$ZodE164", (e, t) => {
	t.pattern ??= Yt, w.init(e, t);
});
function hr(e, t = null) {
	try {
		let n = e.split(".");
		if (n.length !== 3) return !1;
		let [r] = n;
		if (!r) return !1;
		let i = JSON.parse(atob(r));
		return !("typ" in i && i?.typ !== "JWT" || !i.alg || t && (!("alg" in i) || i.alg !== t));
	} catch {
		return !1;
	}
}
var gr = /*@__PURE__*/ b("$ZodJWT", (e, t) => {
	w.init(e, t), e._zod.check = (n) => {
		hr(n.value, t.alg) || n.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), _r = /*@__PURE__*/ b("$ZodNumber", (e, t) => {
	C.init(e, t), e._zod.pattern = an, e._zod.parse = (n, r) => {
		if (t.coerce) try {
			n.value = Number(n.value);
		} catch {}
		let i = n.value;
		if (typeof i == "number" && !Number.isNaN(i) && Number.isFinite(i)) return n;
		let a = typeof i == "number" ? Number.isNaN(i) ? "NaN" : Number.isFinite(i) ? void 0 : String(i) : void 0;
		return n.issues.push({
			expected: "number",
			code: "invalid_type",
			input: i,
			inst: e,
			...a ? { received: a } : {}
		}), n;
	};
}), vr = /*@__PURE__*/ b("$ZodNumberFormat", (e, t) => {
	hn.init(e, t), _r.init(e, t);
}), yr = /*@__PURE__*/ b("$ZodBoolean", (e, t) => {
	C.init(e, t), e._zod.pattern = on, e._zod.parse = (n, r) => {
		if (t.coerce) try {
			n.value = !!n.value;
		} catch {}
		let i = n.value;
		return typeof i == "boolean" || n.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input: i,
			inst: e
		}), n;
	};
}), br = /*@__PURE__*/ b("$ZodNull", (e, t) => {
	C.init(e, t), e._zod.pattern = sn, e._zod.values = /* @__PURE__ */ new Set([null]), e._zod.parse = (t, n) => {
		let r = t.value;
		return r === null || t.issues.push({
			expected: "null",
			code: "invalid_type",
			input: r,
			inst: e
		}), t;
	};
}), xr = /*@__PURE__*/ b("$ZodUnknown", (e, t) => {
	C.init(e, t), e._zod.parse = (e) => e;
}), Sr = /*@__PURE__*/ b("$ZodNever", (e, t) => {
	C.init(e, t), e._zod.parse = (t, n) => (t.issues.push({
		expected: "never",
		code: "invalid_type",
		input: t.value,
		inst: e
	}), t);
});
function Cr(e, t) {
	let n = De(e._zod.def.checks);
	if (!n.length) return;
	let r = Math.min(...n.map((e) => e[0])), i = e._zod.parse;
	e._zod.parse = (n, a) => {
		let o = t(n.value);
		if (o > r && !a?.skipChecks && a?.direction !== "backward") {
			for (let [t, r] of De(e._zod.def.checks)) if (o > t && r._zod.def.when(n)) {
				let t = n.issues.length;
				return r._zod.check(n), n.issues[t].continue = !1, Oe(n.issues, t, e), n;
			}
		}
		return i(n, a);
	};
}
var wr = (e) => Array.isArray(e) ? e.length : -1;
function Tr(e, t, n) {
	e.issues.length && t.issues.push(...Te(n, e.issues)), t.value[n] = e.value;
}
var Er = /*@__PURE__*/ b("$ZodArray", (e, t) => {
	C.init(e, t);
	let n = x.memoizer;
	n?.attach(e), e._zod.parse = (r, i) => {
		let a = r.value;
		if (!Array.isArray(a)) return r.issues.push({
			expected: "array",
			code: "invalid_type",
			input: a,
			inst: e
		}), r;
		r.value = n ? n.alloc(e, r, Array(a.length), i) : Array(a.length);
		let o = [], s = i?.abortEarly;
		for (let e = 0; e < a.length; e++) {
			let n = a[e], c = t.element._zod.run({
				value: n,
				issues: []
			}, i);
			if (c instanceof Promise) o.push(c.then((t) => Tr(t, r, e)));
			else if (Tr(c, r, e), s && c.issues.length !== 0 && Ce(c)) break;
		}
		return o.length ? Promise.all(o).then(() => r) : r;
	}, Cr(e, wr);
});
function Dr(e, t, n, r, i, a) {
	let o = n in r, s = a === "optional";
	if (o || !s || i !== "optional") {
		if (e.issues.length) {
			if (i !== void 0 && s && !o) return;
			t.issues.push(...Te(n, e.issues));
		}
		!o && i === void 0 ? e.issues.length || t.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: void 0,
			path: [n]
		}) : e.value === void 0 ? (o || i === "defaulted" && !s) && (t.value[n] = void 0) : t.value[n] = e.value;
	}
}
var Or = [];
function kr(e) {
	let t = Object.keys(e.shape), n = Object.getOwnPropertySymbols(e.shape), r = n.length ? n : Or, i = r.length ? [...t, ...r] : t;
	for (let t of i) if (!e.shape?.[t]?._zod?.traits?.has("$ZodType")) throw Error(`Invalid element at key "${String(t)}": expected a Zod schema`);
	let a = de(e.shape);
	return {
		...e,
		allKeys: i,
		symbolKeys: r,
		keySet: new Set(t),
		numKeys: t.length,
		optionalKeys: new Set(a)
	};
}
function Ar(e, t, n, r, i, a, o) {
	let s = [], c = i.keySet, l = i.catchall._zod, u = l.def.type, d = l.optin, f = l.optout, p = 0;
	for (let i in t) {
		if (o && n.issues.length !== p) {
			if (Ce(n, p)) break;
			p = n.issues.length;
		}
		if (c.has(i)) continue;
		if (i === "__proto__") {
			u === "never" && s.push(i);
			continue;
		}
		if (u === "never") {
			s.push(i);
			continue;
		}
		let a = l.run({
			value: t[i],
			issues: []
		}, r);
		a instanceof Promise ? e.push(a.then((e) => Dr(e, n, i, t, d, f))) : Dr(a, n, i, t, d, f);
	}
	return s.length && n.issues.push({
		code: "unrecognized_keys",
		keys: s,
		input: t,
		inst: a,
		continue: !0
	}), e.length ? Promise.all(e).then(() => n) : n;
}
var jr = /*@__PURE__*/ b("$ZodObject", (e, t) => {
	C.init(e, t);
	let n = Object.getOwnPropertyDescriptor(t, "shape"), r = n?.get ? n.get.raw : t.shape ?? {};
	if (r) {
		let e = () => {
			let n = { ...r };
			return Object.defineProperty(t, "shape", { value: n }), e.raw = n, n;
		};
		e.raw = r, Object.defineProperty(t, "shape", { get: e });
	}
	let a = i(() => kr(t));
	y(e, "propValues", (e) => {
		let t = e.def.shape, n = {};
		for (let e in t) {
			let r = t[e]._zod;
			if (r.values) {
				Object.prototype.hasOwnProperty.call(n, e) || u(n, e, /* @__PURE__ */ new Set());
				for (let t of r.values) n[e].add(t);
				r.optin !== void 0 && n[e].add(void 0);
			}
		}
		return n;
	});
	let o = re, s = t.catchall, c, l = x.memoizer;
	l?.attach(e), e._zod.parse = (t, n) => {
		c ??= a.value;
		let r = t.value;
		if (!o(r)) return t.issues.push({
			expected: "object",
			code: "invalid_type",
			input: r,
			inst: e
		}), t;
		t.value = l ? l.alloc(e, t, {}, n) : {};
		let i = [], u = c.shape, d = n?.abortEarly, f = t.issues.length;
		for (let e of c.allKeys) {
			if (d && t.issues.length !== f) {
				if (Ce(t, f)) break;
				f = t.issues.length;
			}
			if (e === "__proto__") continue;
			let a = u[e], o = a._zod.optin, s = a._zod.optout, c = a._zod.run({
				value: r[e],
				issues: []
			}, n);
			c instanceof Promise ? i.push(c.then((n) => Dr(n, t, e, r, o, s))) : Dr(c, t, e, r, o, s);
		}
		return s ? Ar(i, r, t, n, a.value, e, d === !0) : i.length ? Promise.all(i).then(() => t) : t;
	};
}), Mr = /*@__PURE__*/ b("$ZodObjectJIT", (e, t) => {
	jr.init(e, t);
	let n = e._zod.parse, r = i(() => kr(t)), a = x.memoizer, o = (t) => {
		let n = r.value, i = n.symbolKeys, o = new Dn(["payload", "ctx"], {
			shape: t,
			inst: e,
			memo: a,
			syms: i
		}), s = (e) => `shape[${e}]._zod.run({ value: input[${e}], issues: [] }, ctx)`, c = (e, t) => `
          let ${e}_ab = false;
          for (let i = 0; i < ${e}.issues.length; i++) {
            const iss = ${e}.issues[i];
            iss.path = iss.path ? [${t}, ...iss.path] : [${t}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${e}_ab = true;
          }
          if (${e}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
		o.write("const input = payload.value;");
		let l = Object.create(null), u = 0;
		for (let e of n.allKeys) l[e] = `key_${u++}`;
		o.write(a ? "const newResult = memo.alloc(inst, payload, {}, ctx);" : "const newResult = {};");
		for (let e of n.allKeys) {
			if (e === "__proto__") continue;
			let n = l[e], r = typeof e == "symbol" ? `syms[${i.indexOf(e)}]` : ee(e), a = `${r} in input`, u = t[e], d = u?._zod?.optin, f = d !== void 0, p = u?._zod?.optout === "optional";
			if (o.write(`const ${n} = ${s(r)};`), f && p) {
				let e = d === "optional" ? `${n}_present` : `${n}.value !== undefined || ${n}_present`;
				o.write(`
        const ${n}_present = ${a};
        if (!${n}.issues.length || ${n}_present) {
          if (${n}.issues.length) {${c(n, r)}
          }

          if (${e}) {
            newResult[${r}] = ${n}.value;
          }
        }

      `);
			} else f ? (o.write(`
        if (${n}.issues.length) {${c(n, r)}
        }
      `), d === "defaulted" ? o.write(`newResult[${r}] = ${n}.value;`) : o.write(`
        if (${n}.value !== undefined || ${a}) {
          newResult[${r}] = ${n}.value;
        }
      `)) : o.write(`
        const ${n}_present = ${a};
        if (${n}.issues.length) {${c(n, r)}
        }
        if (!${n}_present && !${n}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${r}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${n}_present) {
          newResult[${r}] = ${n}.value;
        }

      `);
		}
		return o.write("payload.value = newResult;"), o.write("return payload;"), o.compile();
	}, s, c = re, l = !x.jitless, u = l && ie.value, d = t.catchall, f;
	e._zod.parse = (i, a) => {
		f ??= r.value;
		let p = i.value;
		return c(p) ? l && u && a?.async === !1 && a.jitless !== !0 ? (s ||= o(t.shape), i = s(i, a), d ? Ar([], p, i, a, f, e, a?.abortEarly === !0) : i) : n(i, a) : (i.issues.push({
			expected: "object",
			code: "invalid_type",
			input: p,
			inst: e
		}), i);
	};
});
function Nr(e, t, n, r) {
	for (let n of e) if (n.issues.length === 0) return t.value = n.value, t;
	let i = e.filter((e) => !Ce(e));
	return i.length === 1 ? (t.value = i[0].value, i[0]) : (t.issues.push({
		code: "invalid_union",
		input: t.value,
		inst: n,
		errors: e.map((e) => e.issues.map((e) => ke(e, r, et())))
	}), t);
}
var Pr = /*@__PURE__*/ b("$ZodUnion", (e, t) => {
	C.init(e, t), y(e, "optin", (e) => e.def.options.some((e) => e._zod.optin === "defaulted") ? "defaulted" : e.def.options.some((e) => e._zod.optin !== void 0) ? "optional" : void 0), y(e, "optout", (e) => e.def.options.some((e) => e._zod.optout === "optional") ? "optional" : void 0), y(e, "values", (e) => {
		if (e.def.options.every((e) => e._zod.values)) return new Set(e.def.options.flatMap((e) => Array.from(e._zod.values)));
	}), y(e, "pattern", (e) => {
		if (e.def.options.every((e) => e._zod.pattern)) {
			let t = e.def.options.map((e) => e._zod.pattern);
			return RegExp(`^(${t.map((e) => o(e.source)).join("|")})$`);
		}
	});
	let n = t.options.length === 1 ? t.options[0]._zod.run : null;
	e._zod.parse = (r, i) => {
		if (n) return n(r, i);
		let a = !1, o = [];
		for (let e of t.options) {
			let t = e._zod.run({
				value: r.value,
				issues: []
			}, i);
			if (t instanceof Promise) o.push(t), a = !0;
			else {
				if (t.issues.length === 0) return t;
				o.push(t);
			}
		}
		return a ? Promise.all(o).then((t) => Nr(t, r, e, i)) : Nr(o, r, e, i);
	};
});
function Fr(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.options) {
		let r = n._zod.propValues?.[e.discriminator];
		if (!r || r.size === 0) throw Error(`Invalid discriminated union option at index "${e.options.indexOf(n)}"`);
		for (let e of r) if (t.has(e)) {
			if (e !== void 0) throw Error(`Duplicate discriminator value "${String(e)}"`);
			t.set(e, null);
		} else t.set(e, n);
	}
	return t;
}
var Ir = /*@__PURE__*/ b("$ZodDiscriminatedUnion", (e, t) => {
	t.inclusive = !1, Pr.init(e, t);
	let n = e._zod.parse;
	y(e, "propValues", (e) => {
		let t = {}, n = 0;
		for (let r of e.def.options) {
			let i = r._zod.propValues;
			if (!i || Object.keys(i).length === 0) throw Error(`Invalid discriminated union option at index "${e.def.options.indexOf(r)}"`);
			i[e.def.discriminator]?.has(void 0) && n++;
			for (let [e, n] of Object.entries(i)) {
				Object.prototype.hasOwnProperty.call(t, e) || u(t, e, /* @__PURE__ */ new Set());
				for (let r of n) t[e].add(r);
			}
		}
		return !e.def.unionFallback && n > 1 && t[e.def.discriminator]?.delete(void 0), t;
	}), t.options.forEach((e, n) => {
		let r = d(e._zod.def);
		if (r && !Object.prototype.hasOwnProperty.call(r, t.discriminator)) throw Error(`Invalid discriminated union option at index "${n}"`);
	});
	let r = i(() => Fr(t));
	e._zod.parse = (i, a) => {
		let o = i.value;
		if (!re(o)) return i.issues.push({
			code: "invalid_type",
			expected: "object",
			input: o,
			inst: e
		}), i;
		let s = o?.[t.discriminator], c = r.value.get(s);
		return c && (s !== void 0 || a.direction !== "backward") ? c._zod.run(i, a) : t.unionFallback || a.direction === "backward" ? n(i, a) : (i.issues.push({
			code: "invalid_union",
			errors: [],
			note: "No matching discriminator",
			discriminator: t.discriminator,
			options: Array.from(r.value.keys()).filter((e) => r.value.get(e) !== null),
			input: o,
			path: [t.discriminator],
			inst: e
		}), i);
	};
}), Lr = /*@__PURE__*/ b("$ZodIntersection", (e, t) => {
	C.init(e, t), e._zod.parse = (e, n) => {
		let r = e.value, i = t.left._zod.run({
			value: r,
			issues: []
		}, n), a = t.right._zod.run({
			value: r,
			issues: []
		}, n);
		return i instanceof Promise || a instanceof Promise ? Promise.all([i, a]).then(([t, n]) => zr(e, t, n)) : zr(e, i, a);
	};
});
function Rr(e, t) {
	if (e === t || e instanceof Date && t instanceof Date && +e == +t) return {
		valid: !0,
		data: e
	};
	if (ae(e) && ae(t)) {
		let n = Object.keys(t), r = Object.keys(e).filter((e) => n.indexOf(e) !== -1), i = {
			...e,
			...t
		};
		Object.prototype.hasOwnProperty.call(i, "__proto__") && delete i.__proto__;
		for (let n of r) {
			if (n === "__proto__") continue;
			let r = Rr(e[n], t[n]);
			if (!r.valid) return {
				valid: !1,
				mergeErrorPath: [n, ...r.mergeErrorPath]
			};
			i[n] = r.data;
		}
		return {
			valid: !0,
			data: i
		};
	}
	if (Array.isArray(e) && Array.isArray(t)) {
		if (e.length !== t.length) return {
			valid: !1,
			mergeErrorPath: []
		};
		let n = [];
		for (let r = 0; r < e.length; r++) {
			let i = e[r], a = t[r], o = Rr(i, a);
			if (!o.valid) return {
				valid: !1,
				mergeErrorPath: [r, ...o.mergeErrorPath]
			};
			n.push(o.data);
		}
		return {
			valid: !0,
			data: n
		};
	}
	return {
		valid: !1,
		mergeErrorPath: []
	};
}
function zr(e, t, n) {
	let r = /* @__PURE__ */ new Map(), i, a = /* @__PURE__ */ new Map(), o = (e, t) => {
		let n;
		if (e.code === "unrecognized_keys" && !e.path?.length) i ??= e, n = e.keys;
		else if (e.code === "invalid_key" && e.origin === "record" && e.path?.length === 1) {
			let t = String(e.path[0]);
			a.has(t) || a.set(t, e), n = [t];
		} else return !1;
		for (let e of n) r.has(e) || r.set(e, {}), r.get(e)[t] = !0;
		return !0;
	};
	for (let n of t.issues) o(n, "l") || e.issues.push(n);
	for (let t of n.issues) o(t, "r") || e.issues.push(t);
	let s = [...r].filter(([, e]) => e.l && e.r).map(([e]) => e);
	if (s.length) {
		let t = i ? s.filter((e) => i.keys.includes(e)) : [];
		t.length && e.issues.push({
			...i,
			keys: t
		});
		for (let n of s) !t.includes(n) && a.has(n) && e.issues.push(a.get(n));
	}
	let c = Rr(t.value, n.value);
	if (!c.valid) {
		if (Ce(e)) return e;
		throw Error(`Unmergable intersection. Error path: ${JSON.stringify(c.mergeErrorPath)}`);
	}
	return e.value = c.data, e;
}
var Br = /*@__PURE__*/ b("$ZodTuple", (e, t) => {
	C.init(e, t);
	let n = t.items, r = x.memoizer;
	r?.attach(e), e._zod.parse = (i, a) => {
		let o = i.value;
		if (!Array.isArray(o)) return i.issues.push({
			input: o,
			inst: e,
			expected: "tuple",
			code: "invalid_type"
		}), i;
		i.value = r ? r.alloc(e, i, [], a) : [];
		let s = [], c = Vr(n, "optin"), l = Vr(n, "optout");
		if (!t.rest) {
			if (o.length < c) return i.issues.push({
				code: "too_small",
				minimum: c,
				inclusive: !0,
				input: o,
				inst: e,
				origin: "array"
			}), i;
			o.length > n.length && i.issues.push({
				code: "too_big",
				maximum: n.length,
				inclusive: !0,
				input: o,
				inst: e,
				origin: "array"
			});
		}
		let u = Array(n.length), d = t.rest ? a?.abortEarly : void 0, f = !1;
		for (let e = 0; e < n.length; e++) {
			let t = n[e]._zod.run({
				value: o[e],
				issues: []
			}, a);
			t instanceof Promise ? s.push(t.then((t) => {
				u[e] = t;
			})) : (u[e] = t, d && !f && t.issues.length && (f = Ce(t)));
		}
		if (t.rest && !f) {
			let e = n.length - 1, r = o.slice(n.length), c = i.issues.length;
			for (let n of r) {
				if (d && i.issues.length !== c) {
					if (Ce(i, c)) break;
					c = i.issues.length;
				}
				e++;
				let r = t.rest._zod.run({
					value: n,
					issues: []
				}, a);
				r instanceof Promise ? s.push(r.then((t) => Hr(t, i, e))) : Hr(r, i, e);
			}
		}
		return s.length ? Promise.all(s).then(() => Ur(u, i, n, o, l)) : Ur(u, i, n, o, l);
	};
});
function Vr(e, t) {
	for (let n = e.length - 1; n >= 0; n--) if (!(t === "optin" ? e[n]._zod.optin !== void 0 : e[n]._zod.optout === "optional")) return n + 1;
	return 0;
}
function Hr(e, t, n) {
	e.issues.length && t.issues.push(...Te(n, e.issues)), t.value[n] = e.value;
}
function Ur(e, t, n, r, i) {
	for (let a = 0; a < n.length; a++) {
		let o = e[a], s = a < r.length;
		if (!s && a >= i && n[a]._zod.optin === "optional") {
			t.value.length = a;
			break;
		}
		if (o.issues.length) {
			if (!s && a >= i) {
				t.value.length = a;
				break;
			}
			t.issues.push(...Te(a, o.issues));
		}
		t.value[a] = o.value;
	}
	for (let e = t.value.length - 1; e >= r.length && n[e]._zod.optout === "optional" && t.value[e] === void 0; e--) t.value.length = e;
	return t;
}
var Wr = /*@__PURE__*/ b("$ZodRecord", (e, t) => {
	C.init(e, t);
	let n = x.memoizer;
	n?.attach(e), e._zod.parse = (r, i) => {
		let a = r.value;
		if (!ae(a)) return r.issues.push({
			expected: "record",
			code: "invalid_type",
			input: a,
			inst: e
		}), r;
		let o = [], s = t.keyType._zod.values;
		if (s && !t.partial) {
			r.value = n ? n.alloc(e, r, {}, i) : {};
			let c = /* @__PURE__ */ new Set();
			for (let n of s) if (typeof n == "string" || typeof n == "number" || typeof n == "symbol") {
				if (c.add(typeof n == "number" ? n.toString() : n), n === "__proto__") continue;
				let s = t.keyType._zod.run({
					value: n,
					issues: []
				}, i);
				if (s instanceof Promise) throw Error("Async schemas not supported in object keys currently");
				if (s.issues.length) {
					r.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: s.issues.map((e) => ke(e, i, et())),
						input: n,
						path: [n],
						inst: e
					});
					continue;
				}
				let l = s.value;
				if (l === "__proto__") continue;
				let u = t.valueType._zod.run({
					value: a[n],
					issues: []
				}, i);
				u instanceof Promise ? o.push(u.then((e) => {
					e.issues.length && r.issues.push(...Te(n, e.issues)), r.value[l] = e.value;
				})) : (u.issues.length && r.issues.push(...Te(n, u.issues)), r.value[l] = u.value);
			}
			let l;
			for (let e in a) if (!c.has(e)) {
				if (t.mode === "loose") {
					if (e === "__proto__") continue;
					r.value[e] = a[e];
				} else l ??= [], l.push(e);
			}
			l && l.length > 0 && r.issues.push({
				code: "unrecognized_keys",
				input: a,
				inst: e,
				keys: l,
				continue: !0
			});
		} else {
			r.value = n ? n.alloc(e, r, {}, i) : {};
			let c;
			for (let n of Reflect.ownKeys(a)) {
				if (n === "__proto__" || !Object.prototype.propertyIsEnumerable.call(a, n)) continue;
				let l = t.keyType._zod.run({
					value: n,
					issues: []
				}, i);
				if (l instanceof Promise) throw Error("Async schemas not supported in object keys currently");
				if (typeof n == "string" && an.test(n) && l.issues.length) {
					let e = t.keyType._zod.run({
						value: Number(n),
						issues: []
					}, i);
					if (e instanceof Promise) throw Error("Async schemas not supported in object keys currently");
					e.issues.length === 0 && (l = e);
				}
				if (l.issues.length) {
					t.mode === "loose" ? r.value[n] = a[n] : s ? (c ??= [], c.push(n)) : r.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: l.issues.map((e) => ke(e, i, et())),
						input: n,
						path: [n],
						inst: e
					});
					continue;
				}
				let u = l.value;
				if (u === "__proto__") continue;
				let d = t.valueType._zod.run({
					value: a[n],
					issues: []
				}, i);
				d instanceof Promise ? o.push(d.then((e) => {
					e.issues.length && r.issues.push(...Te(n, e.issues)), r.value[u] = e.value;
				})) : (d.issues.length && r.issues.push(...Te(n, d.issues)), r.value[u] = d.value);
			}
			c && c.length > 0 && r.issues.push({
				code: "unrecognized_keys",
				input: a,
				inst: e,
				keys: c,
				continue: !0
			});
		}
		return o.length ? Promise.all(o).then(() => r) : r;
	};
}), Gr = /*@__PURE__*/ b("$ZodEnum", (t, n) => {
	C.init(t, n);
	let r = e(n.entries), i = new Set(r);
	t._zod.values = i, y(t, "pattern", (t) => {
		let n = e(t.def.entries).filter((e) => se.has(typeof e));
		return RegExp(n.length ? `^(${n.map((e) => ce(e.toString())).join("|")})$` : "^[^\\s\\S]$");
	}), t._zod.parse = (e, n) => {
		let a = e.value;
		return i.has(a) || e.issues.push({
			code: "invalid_value",
			values: r,
			input: a,
			inst: t
		}), e;
	};
}), Kr = /*@__PURE__*/ b("$ZodLiteral", (e, t) => {
	C.init(e, t);
	let n = new Set(t.values);
	e._zod.values = n, y(e, "pattern", (e) => {
		let t = e.def.values;
		return RegExp(t.length ? `^(${t.map((e) => typeof e == "string" ? ce(e) : e ? ce(e.toString()) : String(e)).join("|")})$` : "^[^\\s\\S]$");
	}), e._zod.parse = (r, i) => {
		let a = r.value;
		return n.has(a) || r.issues.push({
			code: "invalid_value",
			values: t.values,
			input: a,
			inst: e
		}), r;
	};
}), qr = /*@__PURE__*/ b("$ZodTransform", (e, t) => {
	C.init(e, t), e._zod.optin = "optional", x.memoizer?.guard(e), e._zod.parse = (n, r) => {
		if (r.direction === "backward") throw new $e(e.constructor.name);
		let i = t.transform(n.value, n);
		if (r.async) return (i instanceof Promise ? i : Promise.resolve(i)).then((e) => (n.value = e, n));
		if (i instanceof Promise) throw new Qe();
		return n.value = i, n;
	};
});
function Jr(e, t) {
	return e.value = t.issues.length ? void 0 : t.value, e;
}
var Yr = /*@__PURE__*/ b("$ZodOptional", (e, t) => {
	C.init(e, t), y(e, "optin", (e) => e.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional"), e._zod.optout = "optional", y(e, "values", (e) => {
		let t = e.def.innerType._zod.values;
		return t ? /* @__PURE__ */ new Set([...t, void 0]) : void 0;
	}), y(e, "pattern", (e) => {
		let t = e.def.innerType._zod.pattern;
		return t ? RegExp(`^(${o(t.source)})?$`) : void 0;
	}), e._zod.parse = (e, n) => {
		if (e.value === void 0) {
			if (t.innerType._zod.optin !== "defaulted") return e;
			let r = t.innerType._zod.run({
				value: e.value,
				issues: []
			}, n);
			return r instanceof Promise ? r.then((t) => Jr(e, t)) : Jr(e, r);
		}
		return t.innerType._zod.run(e, n);
	};
}), Xr = /*@__PURE__*/ b("$ZodExactOptional", (e, t) => {
	Yr.init(e, t), y(e, "values", (e) => e.def.innerType._zod.values), y(e, "pattern", (e) => e.def.innerType._zod.pattern), e._zod.parse = (e, n) => t.innerType._zod.run(e, n);
}), Zr = /*@__PURE__*/ b("$ZodNullable", (e, t) => {
	C.init(e, t), y(e, "optin", (e) => e.def.innerType._zod.optin), y(e, "optout", (e) => e.def.innerType._zod.optout), y(e, "pattern", (e) => {
		let t = e.def.innerType._zod.pattern;
		return t ? RegExp(`^(${o(t.source)}|null)$`) : void 0;
	}), y(e, "values", (e) => e.def.innerType._zod.values ? /* @__PURE__ */ new Set([...e.def.innerType._zod.values, null]) : void 0), e._zod.parse = (e, n) => e.value === null ? e : t.innerType._zod.run(e, n);
}), Qr = /*@__PURE__*/ b("$ZodDefault", (e, t) => {
	C.init(e, t), e._zod.optin = "defaulted", y(e, "values", (e) => e.def.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		if (e.value === void 0) return e.value = t.defaultValue, e;
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => $r(e, t)) : $r(r, t);
	};
});
function $r(e, t) {
	return e.value === void 0 && (e.value = t.defaultValue), e;
}
var ei = /*@__PURE__*/ b("$ZodPrefault", (e, t) => {
	C.init(e, t), e._zod.optin = "defaulted", y(e, "values", (e) => e.def.innerType._zod.values), e._zod.parse = (e, n) => (n.direction === "backward" || e.value === void 0 && (e.value = t.defaultValue), t.innerType._zod.run(e, n));
}), ti = /*@__PURE__*/ b("$ZodNonOptional", (e, t) => {
	C.init(e, t), y(e, "values", (e) => {
		let t = e.def.innerType._zod.values;
		return t ? new Set([...t].filter((e) => e !== void 0)) : void 0;
	}), e._zod.parse = (n, r) => {
		let i = t.innerType._zod.run(n, r);
		return i instanceof Promise ? i.then((t) => ni(t, e)) : ni(i, e);
	};
});
function ni(e, t) {
	return !e.issues.length && e.value === void 0 && e.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: e.value,
		inst: t
	}), e;
}
function ri(e, t, n, r) {
	return t.issues.length ? (e.value = n.catchValue({
		...t,
		value: e.value,
		error: { issues: t.issues.map((e) => ke(e, r, et())) },
		input: e.value
	}), e) : (e.value = t.value, t.memo && (e.memo = !0), e);
}
var ii = /*@__PURE__*/ b("$ZodCatch", (e, t) => {
	C.init(e, t), y(e, "optin", (e) => e.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional"), y(e, "optout", (e) => e.def.innerType._zod.optout), y(e, "values", (e) => e.def.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run({
			value: e.value,
			issues: []
		}, n);
		return r instanceof Promise ? r.then((r) => ri(e, r, t, n)) : ri(e, r, t, n);
	};
}), ai = /*@__PURE__*/ b("$ZodPipe", (e, t) => {
	C.init(e, t), y(e, "values", (e) => e.def.in._zod.values), y(e, "optin", (e) => e.def.in._zod.optin), y(e, "optout", (e) => e.def.out._zod.optout), y(e, "propValues", (e) => e.def.in._zod.propValues), e._zod.parse = (e, n) => {
		if (n.direction === "backward") {
			let r = t.out._zod.run(e, n);
			return r instanceof Promise ? r.then((e) => oi(e, t.in, n)) : oi(r, t.in, n);
		}
		let r = t.in._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => oi(e, t.out, n)) : oi(r, t.out, n);
	};
});
function oi(e, t, n) {
	return e.issues.some((e) => e.code !== "unrecognized_keys") ? (e.aborted = !0, e) : t._zod.run({
		value: e.value,
		issues: e.issues
	}, n);
}
var si = /*@__PURE__*/ b("$ZodPreprocess", (e, t) => {
	ai.init(e, t);
}), ci = /*@__PURE__*/ b("$ZodReadonly", (e, t) => {
	C.init(e, t), y(e, "propValues", (e) => e.def.innerType._zod.propValues), y(e, "values", (e) => e.def.innerType._zod.values), y(e, "optin", (e) => e.def.innerType?._zod?.optin), y(e, "optout", (e) => e.def.innerType?._zod?.optout), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then(li) : li(r);
	};
});
function li(e) {
	return e.memo || (e.value = Object.freeze(e.value)), e;
}
var ui = /*@__PURE__*/ b("$ZodLazy", (e, t) => {
	C.init(e, t), l(e._zod, "innerType", () => {
		let e = t;
		return e._cachedInner ||= t.getter(), e._cachedInner;
	}), y(e, "pattern", (e) => e.innerType?._zod?.pattern), y(e, "propValues", (e) => e.innerType?._zod?.propValues), y(e, "optin", (e) => e.innerType?._zod?.optin ?? void 0), y(e, "optout", (e) => e.innerType?._zod?.optout ?? void 0), e._zod.parse = (t, n) => e._zod.innerType._zod.run(t, n);
}), di = /*@__PURE__*/ b("$ZodCustom", (e, t) => {
	S.init(e, t), C.init(e, t), e._zod.parse = (e, t) => e, e._zod.check = (n) => {
		let r = n.value, i = t.fn(r);
		if (i instanceof Promise) return i.then((t) => fi(t, n, r, e));
		fi(i, n, r, e);
	};
});
function fi(e, t, n, r) {
	if (!e) {
		let e = {
			code: "custom",
			input: n,
			inst: r,
			path: [...r._zod.def.path ?? []],
			continue: !r._zod.def.abort
		};
		r._zod.def.params && (e.params = r._zod.def.params), t.issues.push(Pe(e));
	}
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/memoizer.js
var pi = class extends Error {
	constructor() {
		super("Cannot parse a reference cycle that closes through a transform"), this.name = "ZodCyclicError";
	}
}, mi = "~memo", hi = [];
function gi(e) {
	return typeof e == "object" && !!e;
}
function _i(e) {
	return e.map((e) => e.path ? {
		...e,
		path: e.path.slice()
	} : { ...e });
}
var vi = /*@__PURE__*/ new WeakMap(), yi = 0, bi = 1, xi = 2;
function Si(e, t, n) {
	let r = vi.get(e);
	if (r !== void 0) return r ? xi : yi;
	if (t.has(e)) return xi;
	t.add(e);
	let i = yi, a = (e) => {
		if (i !== xi && e?._zod) {
			let r = Si(e, t, n);
			r > i && (i = r);
		}
	}, o = (e, r) => {
		let i = yi;
		for (let a of Reflect.ownKeys(e)) {
			let o = Object.getOwnPropertyDescriptor(e, a);
			if (r && !o.enumerable) continue;
			let s = o.get ? bi : o.value?._zod ? Si(o.value, t, n) : yi;
			s > i && (i = s);
		}
		return i;
	}, s = (e) => {
		e > i && (i = e);
	}, c = e._zod.def;
	switch (c.type) {
		case "object": {
			let e = d(c);
			s(e ? o(e, !0) : bi), a(c.catchall);
			break;
		}
		case "array":
			a(c.element);
			break;
		case "tuple":
			for (let e of c.items) a(e);
			a(c.rest);
			break;
		case "record":
		case "map":
			a(c.keyType), a(c.valueType);
			break;
		case "set":
			a(c.valueType);
			break;
		case "union":
			for (let e of c.options) a(e);
			break;
		case "intersection":
			a(c.left), a(c.right);
			break;
		case "optional":
		case "nullable":
		case "default":
		case "prefault":
		case "catch":
		case "readonly":
		case "nonoptional":
		case "promise":
		case "success":
			a(c.innerType);
			break;
		case "pipe":
			a(c.in), a(c.out);
			break;
		case "function":
			a(c.input), a(c.output);
			break;
		case "lazy": {
			let r = c._cachedInner ?? (n ? e._zod.innerType : void 0);
			s(r ? Si(r, t, !1) : bi);
			break;
		}
		case "template_literal":
		case "string":
		case "number":
		case "int":
		case "boolean":
		case "bigint":
		case "symbol":
		case "undefined":
		case "null":
		case "void":
		case "never":
		case "any":
		case "unknown":
		case "date":
		case "nan":
		case "enum":
		case "literal":
		case "file":
		case "transform":
		case "custom": break;
		default: for (let e in c) {
			let t = Object.getOwnPropertyDescriptor(c, e);
			if (!t || t.get) continue;
			let n = t.value;
			if (n && typeof n == "object") {
				if (n._zod) a(n);
				else if (Array.isArray(n)) for (let e of n) a(e);
			}
		}
	}
	return t.delete(e), Ci(e, i);
}
function Ci(e, t) {
	return t !== bi && vi.set(e, t === xi), t;
}
function wi(e, t) {
	let n = e.buckets.get(t);
	return n || (n = /* @__PURE__ */ new WeakMap(), e.buckets.set(t, n)), n;
}
var Ti, Ei = [], Di = {
	alloc(e, t, n) {
		let r = Ti;
		if (!r) return n;
		Ti = void 0;
		let i = {
			value: n,
			issues: null
		};
		return r.set(t.value, i), Ei.push(i), n;
	},
	guard(e) {
		var t;
		(t = e._zod).deferred ?? (t.deferred = []), e._zod.deferred.push(() => {
			let t = e._zod.parse, n = (e, n) => {
				if (n.direction !== "backward" && ki(n, e.value)) throw new pi();
				return t(e, n);
			};
			e._zod.parse = n, e._zod.run === t && (e._zod.run = n);
		});
	},
	attach(e) {
		var t;
		let n, r = !1, i, a;
		(t = e._zod).deferred ?? (t.deferred = []), e._zod.deferred.push(() => {
			let t = e._zod.parse, o = (s, c) => {
				if (n === void 0) {
					let i = Si(e, /* @__PURE__ */ new Set(), !1);
					if (i === yi) return e._zod.parse = t, e._zod.run === o && (e._zod.run = t), t(s, c);
					i === xi || r ? n = !0 : r = !0;
				}
				let l = s.value;
				if (!gi(l)) return t(s, c);
				let u = c[mi];
				u || (u = {
					buckets: /* @__PURE__ */ new WeakMap(),
					backEdges: void 0
				}, c[mi] = u);
				let d;
				i === c ? d = a : (d = wi(u, e), i = c, a = d);
				let f = d.get(l);
				if (f) return s.value = f.value, f.issues ? f.issues.length && s.issues.push(..._i(f.issues)) : (s.memo = !0, u.backEdges ?? (u.backEdges = /* @__PURE__ */ new WeakSet()), u.backEdges.add(f.value)), s;
				Ti = d;
				let p = Ei.length, m = t(s, c);
				Ti = void 0;
				let h = Ei.length > p ? Ei.pop() : void 0;
				return m instanceof Promise ? m.then((e) => (h && (h.issues = e.issues.length ? _i(e.issues) : hi), e)) : (h && (h.issues = m.issues.length ? _i(m.issues) : hi), m);
			};
			e._zod.parse = o, e._zod.run === t && (e._zod.run = o);
		});
	}
};
function Oi() {
	return Di;
}
function ki(e, t) {
	let n = e[mi]?.backEdges;
	return n !== void 0 && gi(t) && n.has(t);
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/locales/en.js
var Ai = () => {
	let e = {
		string: {
			unit: "characters",
			verb: "to have"
		},
		file: {
			unit: "bytes",
			verb: "to have"
		},
		array: {
			unit: "items",
			verb: "to have"
		},
		set: {
			unit: "items",
			verb: "to have"
		},
		map: {
			unit: "entries",
			verb: "to have"
		}
	};
	function n(t) {
		return e[t] ?? null;
	}
	let r = {
		regex: "input",
		email: "email address",
		url: "URL",
		emoji: "emoji",
		uuid: "UUID",
		uuidv4: "UUIDv4",
		uuidv6: "UUIDv6",
		nanoid: "nanoid",
		guid: "GUID",
		cuid: "cuid",
		cuid2: "cuid2",
		ulid: "ULID",
		xid: "XID",
		ksuid: "KSUID",
		datetime: "ISO datetime",
		date: "ISO date",
		time: "ISO time",
		duration: "ISO duration",
		ipv4: "IPv4 address",
		ipv6: "IPv6 address",
		mac: "MAC address",
		cidrv4: "IPv4 range",
		cidrv6: "IPv6 range",
		base64: "base64-encoded string",
		base64url: "base64url-encoded string",
		json_string: "JSON string",
		e164: "E.164 number",
		currency_code: "currency code",
		credit_card: "credit card number",
		iban: "IBAN",
		jwt: "JWT",
		template_literal: "input"
	}, i = { nan: "NaN" };
	function a(e, t) {
		return e === "number" && typeof t == "number" && !Number.isFinite(t) ? String(t) : i[e] ?? e;
	}
	return (e) => {
		switch (e.code) {
			case "invalid_type": return `Invalid input: expected ${a(e.expected)}, received ${a(Ne(e.input), e.input)}`;
			case "invalid_value": return e.values.length === 1 ? `Invalid input: expected ${ue(e.values[0])}` : `Invalid option: expected one of ${t(e.values, "|")}`;
			case "too_big": {
				let t = e.exact ? "exactly " : e.inclusive ? "<=" : "<", r = n(e.origin);
				return r ? `Too big: expected ${e.origin ?? "value"} to have ${t}${e.maximum.toString()} ${r.unit ?? "elements"}` : `Too big: expected ${e.origin ?? "value"} to be ${t}${e.maximum.toString()}`;
			}
			case "too_small": {
				let t = e.exact ? "exactly " : e.inclusive ? ">=" : ">", r = n(e.origin);
				return r ? `Too small: expected ${e.origin} to have ${t}${e.minimum.toString()} ${r.unit}` : `Too small: expected ${e.origin} to be ${t}${e.minimum.toString()}`;
			}
			case "invalid_format": {
				let t = e;
				return t.format === "starts_with" ? `Invalid string: must start with "${t.prefix}"` : t.format === "ends_with" ? `Invalid string: must end with "${t.suffix}"` : t.format === "includes" ? `Invalid string: must include "${t.includes}"` : t.format === "regex" ? `Invalid string: must match pattern ${t.pattern}` : `Invalid ${r[t.format] ?? e.format}`;
			}
			case "not_multiple_of": return `Invalid number: must be a multiple of ${e.divisor}`;
			case "unrecognized_keys": return `Unrecognized key${e.keys.length > 1 ? "s" : ""}: ${t(e.keys, ", ")}`;
			case "invalid_key": return `Invalid key in ${e.origin}`;
			case "invalid_union": return e.options && Array.isArray(e.options) && e.options.length > 0 ? `Invalid discriminator value. Expected ${e.options.map((e) => `'${e}'`).join(" | ")}` : e.inclusive === !1 ? "Invalid input: more than one option matched" : "Invalid input";
			case "invalid_element": return `Invalid value in ${e.origin}`;
			default: return "Invalid input";
		}
	};
};
function ji() {
	return { localeError: Ai() };
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/registries.js
var Mi, Ni = class {
	constructor() {
		this._map = /* @__PURE__ */ new WeakMap(), this._idmap = /* @__PURE__ */ new Map();
	}
	add(e, ...t) {
		let n = t[0];
		return this._map.set(e, n), n && typeof n == "object" && "id" in n && this._idmap.set(n.id, e), this;
	}
	clear() {
		return this._map = /* @__PURE__ */ new WeakMap(), this._idmap = /* @__PURE__ */ new Map(), this;
	}
	remove(e) {
		let t = this._map.get(e);
		return t && typeof t == "object" && "id" in t && this._idmap.delete(t.id), this._map.delete(e), this;
	}
	get(e) {
		let t = e._zod.parent;
		if (t) {
			let n = { ...this.get(t) ?? {} };
			delete n.id;
			let r = {
				...n,
				...this._map.get(e)
			};
			return Object.keys(r).length ? r : void 0;
		}
		return this._map.get(e);
	}
	has(e) {
		return this._map.has(e);
	}
};
function Pi() {
	return new Ni();
}
(Mi = globalThis).__zod_globalRegistry ?? (Mi.__zod_globalRegistry = Pi());
var Fi = globalThis.__zod_globalRegistry;
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/api.js
function Ii(e) {
	return e.checks &&= [...e.checks], e;
}
// @__NO_SIDE_EFFECTS__
function Li(e, t) {
	return new e(Ii({
		type: "string",
		...v(t)
	}));
}
// @__NO_SIDE_EFFECTS__
function Ri(e, t) {
	return new e({
		type: "string",
		format: "email",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function zi(e, t) {
	return new e({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Bi(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Vi(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v4",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Hi(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v6",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Ui(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v7",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Wi(e, t) {
	return new e({
		type: "string",
		format: "url",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Gi(e, t) {
	return new e({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Ki(e, t) {
	return new e({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function qi(e, t) {
	return new e({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Ji(e, t) {
	return new e({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Yi(e, t) {
	return new e({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Xi(e, t) {
	return new e({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Zi(e, t) {
	return new e({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Qi(e, t) {
	return new e({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function $i(e, t) {
	return new e({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ea(e, t) {
	return new e({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ta(e, t) {
	return new e({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function na(e, t) {
	return new e({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ra(e, t) {
	return new e({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ia(e, t) {
	return new e({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function aa(e, t) {
	return new e({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: !1,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function oa(e, t) {
	return new e({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: !1,
		local: !1,
		precision: null,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function sa(e, t) {
	return new e({
		type: "string",
		format: "date",
		check: "string_format",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ca(e, t) {
	return new e({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function la(e, t) {
	return new e({
		type: "string",
		format: "duration",
		check: "string_format",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ua(e, t) {
	return new e(Ii({
		type: "number",
		checks: [],
		...v(t)
	}));
}
// @__NO_SIDE_EFFECTS__
function da(e, t) {
	return new e(Ii({
		type: "number",
		coerce: !0,
		checks: [],
		...v(t)
	}));
}
// @__NO_SIDE_EFFECTS__
function fa(e, t) {
	return new e({
		type: "number",
		check: "number_format",
		abort: !1,
		format: "safeint",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function pa(e, t) {
	return new e({
		type: "boolean",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ma(e, t) {
	return new e({
		type: "null",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ha(e) {
	return new e({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function ga(e, t) {
	return new e({
		type: "never",
		...v(t)
	});
}
// @__NO_SIDE_EFFECTS__
function _a(e, t) {
	return new fn({
		check: "less_than",
		...v(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function va(e, t) {
	return new fn({
		check: "less_than",
		...v(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function ya(e, t) {
	return new pn({
		check: "greater_than",
		...v(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function ba(e, t) {
	return new pn({
		check: "greater_than",
		...v(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function xa(e, t) {
	return new mn({
		check: "multiple_of",
		...v(t),
		value: e
	});
}
// @__NO_SIDE_EFFECTS__
function Sa(e, t) {
	return new gn({
		check: "max_length",
		...v(t),
		maximum: e
	});
}
// @__NO_SIDE_EFFECTS__
function Ca(e, t) {
	return new _n({
		check: "min_length",
		...v(t),
		minimum: e
	});
}
// @__NO_SIDE_EFFECTS__
function wa(e, t) {
	return new vn({
		check: "length_equals",
		...v(t),
		length: e
	});
}
// @__NO_SIDE_EFFECTS__
function Ta(e, t) {
	return new bn({
		check: "string_format",
		format: "regex",
		...v(t),
		pattern: e
	});
}
// @__NO_SIDE_EFFECTS__
function Ea(e) {
	return new xn({
		check: "string_format",
		format: "lowercase",
		...v(e)
	});
}
// @__NO_SIDE_EFFECTS__
function Da(e) {
	return new Sn({
		check: "string_format",
		format: "uppercase",
		...v(e)
	});
}
// @__NO_SIDE_EFFECTS__
function Oa(e, t) {
	return new Cn({
		check: "string_format",
		format: "includes",
		...v(t),
		includes: e
	});
}
// @__NO_SIDE_EFFECTS__
function ka(e, t) {
	return new wn({
		check: "string_format",
		format: "starts_with",
		...v(t),
		prefix: e
	});
}
// @__NO_SIDE_EFFECTS__
function Aa(e, t) {
	return new Tn({
		check: "string_format",
		format: "ends_with",
		...v(t),
		suffix: e
	});
}
// @__NO_SIDE_EFFECTS__
function ja(e) {
	return new En({
		check: "overwrite",
		tx: e
	});
}
// @__NO_SIDE_EFFECTS__
function Ma(e) {
	return /* @__PURE__ */ ja((t) => t.normalize(e));
}
// @__NO_SIDE_EFFECTS__
function Na() {
	return /* @__PURE__ */ ja((e) => e.trim());
}
// @__NO_SIDE_EFFECTS__
function Pa() {
	return /* @__PURE__ */ ja((e) => e.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function Fa() {
	return /* @__PURE__ */ ja((e) => e.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function Ia() {
	return /* @__PURE__ */ ja((e) => te(e));
}
// @__NO_SIDE_EFFECTS__
function La(e, t, n) {
	return new e({
		type: "array",
		element: t,
		...v(n)
	});
}
// @__NO_SIDE_EFFECTS__
function Ra(e, t, n) {
	return new e({
		type: "custom",
		check: "custom",
		fn: t,
		...v(n)
	});
}
// @__NO_SIDE_EFFECTS__
function za(e, t) {
	let n = /* @__PURE__ */ Ba((t) => (t.addIssue = (e) => {
		if (typeof e == "string") t.issues.push(Pe(e, t.value, n._zod.def));
		else {
			let r = e;
			r.fatal && (r.continue = !1), r.code ??= "custom", "input" in r || (r.input = t.value), r.inst ??= n, r.continue ??= !n._zod.def.abort, t.issues.push(Pe(r));
		}
	}, e(t.value, t)), t);
	return n;
}
// @__NO_SIDE_EFFECTS__
function Ba(e, t) {
	let n = new S({
		check: "custom",
		...v(t)
	});
	return n._zod.check = e, n;
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/to-json-schema.js
function Va(e, ...t) {
	for (let n of t) for (let t of Reflect.ownKeys(n)) Object.prototype.propertyIsEnumerable.call(n, t) && u(e, t, n[t]);
	return e;
}
function Ha(e) {
	let t = e?.target ?? "draft-2020-12";
	return t === "draft-4" && (t = "draft-04"), t === "draft-7" && (t = "draft-07"), {
		processors: e.processors ?? {},
		metadataRegistry: e?.metadata ?? Fi,
		target: t,
		unrepresentable: e?.unrepresentable ?? "throw",
		override: e?.override ?? (() => {}),
		io: e?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		sharedDefsExtractedFor: void 0,
		sharedEmitDoneFor: void 0,
		cycles: e?.cycles ?? "ref",
		reused: e?.reused ?? "inline",
		intersections: [],
		deferred: [],
		external: e?.external ?? void 0
	};
}
function Ua(e, t, n, r, i) {
	let a = typeof t.unrepresentable == "function" ? t.unrepresentable({
		zodSchema: e,
		path: r.path,
		message: i
	}) : t.unrepresentable;
	if (a === "any") return !1;
	if (a === void 0 || a === "throw") throw Error(i);
	return Object.assign(n, a), !0;
}
function T(e, t, n = {
	path: [],
	schemaPath: []
}) {
	var r;
	let i = e._zod.def, a = t.seen.get(e);
	if (a) return a.count++, n.schemaPath.includes(e) && (a.cycle = n.path), a.schema;
	let o = {
		schema: {},
		count: 1,
		cycle: void 0,
		path: n.path
	};
	t.seen.set(e, o), t.sharedDefsExtractedFor = void 0, t.sharedEmitDoneFor = void 0;
	let s = e._zod.toJSONSchema?.();
	if (s) o.schema = s;
	else {
		let r = {
			...n,
			schemaPath: [...n.schemaPath, e],
			path: n.path
		};
		if (e._zod.processJSONSchema) e._zod.processJSONSchema(t, o.schema, r);
		else {
			let n = o.schema, a = t.processors[i.type];
			if (!a) throw Error(`[toJSONSchema]: Non-representable type encountered: ${i.type}`);
			a(e, t, n, r);
		}
		let a = e._zod.parent;
		a && (o.ref ||= a, T(a, t, r), t.seen.get(a).isParent = !0);
	}
	let c = t.metadataRegistry.get(e);
	return c && Va(o.schema, c), t.io === "input" && E(e) && (delete o.schema.examples, delete o.schema.default), t.io === "input" && "_prefault" in o.schema && ((r = o.schema).default ?? (r.default = o.schema._prefault)), delete o.schema._prefault, t.seen.get(e).schema;
}
function Wa(e) {
	return e.replace(/~/g, "~0").replace(/\//g, "~1");
}
function Ga(e, t) {
	let n = e.seen.get(t);
	if (!n) throw Error("Unprocessed schema. This is a bug in Zod.");
	if (e.external && e.sharedDefsExtractedFor === e.external) return;
	let r = /* @__PURE__ */ new Map();
	for (let t of e.seen.entries()) {
		let n = e.metadataRegistry.get(t[0])?.id;
		if (n) {
			let e = r.get(n);
			if (e && e !== t[0]) throw Error(`Duplicate schema id "${n}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
			r.set(n, t[0]);
		}
	}
	let i = (t) => {
		let r = e.target === "draft-2020-12" ? "$defs" : "definitions";
		if (e.external) {
			let n = e.external.registry.get(t[0])?.id, i = e.external.uri ?? ((e) => e);
			if (n) return { ref: i(n) };
			let a = t[1].defId ?? t[1].schema.id ?? `schema${e.counter++}`;
			return t[1].defId = a, {
				defId: a,
				ref: `${i("__shared")}#/${r}/${Wa(a)}`
			};
		}
		let i = `#/${r}/`;
		if (t[1] === n && !t[1].schema.id) return { ref: "#" };
		let a = t[1].schema.id ?? `__schema${e.counter++}`;
		return {
			defId: a,
			ref: i + Wa(a)
		};
	}, a = (e) => {
		if (e[1].schema.$ref) return;
		let t = e[1], { ref: n, defId: r } = i(e);
		t.def = { ...t.schema }, r && (t.defId = r);
		let a = t.schema;
		for (let e in a) delete a[e];
		a.$ref = n;
	};
	if (e.cycles === "throw") for (let t of e.seen.entries()) {
		let e = t[1];
		if (e.cycle) throw Error(`Cycle detected: #/${e.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
	}
	for (let n of e.seen.entries()) {
		let r = n[1];
		if (t === n[0]) a(n);
		else {
			if (e.external) {
				let r = e.external.registry.get(n[0])?.id;
				if (t !== n[0] && r) {
					a(n);
					continue;
				}
			}
			(e.metadataRegistry.get(n[0])?.id || r.cycle || r.count > 1 && e.reused === "ref") && a(n);
		}
	}
	e.external && (e.sharedDefsExtractedFor = e.external);
}
function Ka(e) {
	let t = e.anyOf;
	if (!Array.isArray(t) || t.length === 0 || e.type !== void 0) return;
	let n = [];
	for (let e of t) {
		if (!e || typeof e != "object") return;
		Ka(e);
		let t = Object.keys(e);
		if (t.length !== 1 || t[0] !== "type") return;
		let r = e.type;
		for (let e of Array.isArray(r) ? r : [r]) {
			if (typeof e != "string") return;
			n.includes(e) || n.push(e);
		}
	}
	delete e.anyOf, e.type = n.length === 1 ? n[0] : n;
}
var qa = /* @__PURE__ */ new Set([
	"type",
	"properties",
	"required",
	"additionalProperties"
]), Ja = ["oneOf", "anyOf"];
function Ya(e) {
	let t = e.additionalProperties;
	return t === void 0 || t === !1 || typeof t != "object" || !t ? null : Object.keys(t).length ? t : null;
}
function Xa(e) {
	let t = [];
	for (let n of e) {
		if (typeof n != "object" || n.type !== "object") return null;
		for (let e in n) if (!qa.has(e)) return null;
		t.push(n);
	}
	let n = {}, r = /* @__PURE__ */ new Set();
	for (let e of t) {
		for (let r in e.properties) {
			if (Object.prototype.hasOwnProperty.call(n, r)) continue;
			let e = [];
			for (let n of t) {
				let t = n.properties?.[r] ?? Ya(n);
				t != null && (e.some((e) => JSON.stringify(e) === JSON.stringify(t)) || e.push(t));
			}
			u(n, r, e.length === 1 ? e[0] : Xa(e) ?? { allOf: e });
		}
		for (let t of e.required ?? []) r.add(t);
	}
	let i = {
		type: "object",
		properties: n
	};
	if (r.size && (i.required = [...r]), t.every((e) => e.additionalProperties === !1)) i.additionalProperties = !1;
	else {
		let e = [];
		for (let n of t) {
			let t = Ya(n);
			t && !e.some((e) => JSON.stringify(e) === JSON.stringify(t)) && e.push(t);
		}
		e.length === 1 ? i.additionalProperties = e[0] : e.length > 1 && (i.additionalProperties = { allOf: e });
	}
	return i;
}
function Za(e) {
	let t = e.allOf;
	if (!Array.isArray(t) || t.length < 2) return;
	for (let t of qa) if (t in e) return;
	let n = t.filter((e) => Ja.some((t) => Array.isArray(e[t]))), r = null;
	if (!n.length) r = Xa(t);
	else {
		let e = n[0], i = Ja.find((t) => Array.isArray(e[t]));
		if (Object.keys(e).length !== 1) return;
		let a = t.filter((t) => t !== e), o = e[i].map((e) => Xa([...a, e]));
		if (o.some((e) => !e)) return;
		r = { [i]: o };
	}
	r && (delete e.allOf, Va(e, r));
}
function Qa(e, t) {
	let n = e.seen.get(t);
	if (!n) throw Error("Unprocessed schema. This is a bug in Zod.");
	let r = (t) => {
		let n = e.seen.get(t);
		if (n.ref === null) return;
		let i = n.def ?? n.schema, a = { ...i }, o = n.ref;
		if (n.ref = null, o) {
			r(o);
			let n = e.seen.get(o), s = n.schema;
			if (s.$ref && (e.target === "draft-07" || e.target === "draft-04" || e.target === "openapi-3.0") ? (i.allOf = i.allOf ?? [], i.allOf.push(s)) : Va(i, s), Va(i, a), t._zod.parent === o) for (let e in i) e !== "$ref" && e !== "allOf" && (e in a || delete i[e]);
			if (s.$ref && n.def) for (let e in i) e !== "$ref" && e !== "allOf" && e in n.def && JSON.stringify(i[e]) === JSON.stringify(n.def[e]) && delete i[e];
		}
		let s = t._zod.parent;
		if (s && s !== o) {
			r(s);
			let t = e.seen.get(s);
			if (t?.schema.$ref && (i.$ref = t.schema.$ref, t.def)) for (let e in i) e !== "$ref" && e !== "allOf" && e in t.def && JSON.stringify(i[e]) === JSON.stringify(t.def[e]) && delete i[e];
		}
		e.override({
			zodSchema: t,
			jsonSchema: i,
			path: n.path ?? []
		});
	};
	if (!e.external || e.sharedEmitDoneFor !== e.external) {
		for (let t of [...e.seen.entries()].reverse()) r(t[0]);
		if (e.target !== "openapi-3.0") for (let t of e.seen.entries()) Ka(t[1].def ?? t[1].schema);
		for (let t of e.deferred) t();
		if (e.intersections.length) {
			let t = /* @__PURE__ */ new Map();
			for (let n of e.seen.values()) for (let e of [n.schema, n.def]) {
				let n = e?.allOf;
				if (!Array.isArray(n)) continue;
				let r = t.get(n);
				r ? r.push(e) : t.set(n, [e]);
			}
			for (let n of e.intersections) for (let e of t.get(n) ?? []) Za(e);
		}
	}
	let i = {};
	if (e.target === "draft-2020-12" ? i.$schema = "https://json-schema.org/draft/2020-12/schema" : e.target === "draft-07" ? i.$schema = "http://json-schema.org/draft-07/schema#" : e.target === "draft-04" ? i.$schema = "http://json-schema.org/draft-04/schema#" : e.target, e.external?.uri) {
		let n = e.external.registry.get(t)?.id;
		if (!n) throw Error("Schema is missing an `id` property");
		i.$id = e.external.uri(n);
	}
	Va(i, n.defId ? n.schema : n.def ?? n.schema);
	let a = e.metadataRegistry.get(t)?.id;
	a !== void 0 && i.id === a && delete i.id;
	let o = e.external?.defs ?? {};
	if (!e.external || e.sharedEmitDoneFor !== e.external) for (let t of e.seen.entries()) {
		let e = t[1];
		e.def && e.defId && (e.def.id === e.defId && delete e.def.id, u(o, e.defId, e.def));
	}
	e.external && (e.sharedEmitDoneFor = e.external), e.external || Object.keys(o).length > 0 && (e.target === "draft-2020-12" ? i.$defs = o : i.definitions = o);
	try {
		let n = JSON.parse(JSON.stringify(i));
		return Object.defineProperty(n, "~standard", {
			value: {
				...t["~standard"],
				jsonSchema: {
					input: eo(t, "input", e.processors),
					output: eo(t, "output", e.processors)
				}
			},
			enumerable: !1,
			writable: !1
		}), n;
	} catch {
		throw Error("Error converting schema to JSON.");
	}
}
function E(e, t) {
	let n = t ?? { seen: /* @__PURE__ */ new Set() };
	if (n.seen.has(e)) return !1;
	n.seen.add(e);
	let r = e._zod.def;
	if (r.type === "transform") return !0;
	if (r.type === "array") return E(r.element, n);
	if (r.type === "set") return E(r.valueType, n);
	if (r.type === "lazy") return E(r.getter(), n);
	if (r.type === "promise" || r.type === "optional" || r.type === "nonoptional" || r.type === "nullable" || r.type === "readonly" || r.type === "default" || r.type === "prefault" || r.type === "catch") return E(r.innerType, n);
	if (r.type === "intersection") return E(r.left, n) || E(r.right, n);
	if (r.type === "record" || r.type === "map") return E(r.keyType, n) || E(r.valueType, n);
	if (r.type === "pipe") return e._zod.traits.has("$ZodCodec") ? !0 : E(r.in, n) || E(r.out, n);
	if (r.type === "object") {
		for (let e in r.shape) if (E(r.shape[e], n)) return !0;
		return !1;
	}
	if (r.type === "union") {
		for (let e of r.options) if (E(e, n)) return !0;
		return !1;
	}
	if (r.type === "tuple") {
		for (let e of r.items) if (E(e, n)) return !0;
		return !!(r.rest && E(r.rest, n));
	}
	return !1;
}
var $a = (e, t = {}) => (n) => {
	let r = Ha({
		...n,
		processors: t
	});
	return T(e, r), Ga(r, e), Qa(r, e);
}, eo = (e, t, n = {}) => (r) => {
	let { libraryOptions: i, target: a } = r ?? {}, o = Ha({
		...i ?? {},
		target: a,
		io: t,
		processors: n
	});
	return T(e, o), Ga(o, e), Qa(o, e);
}, to = (e, t, n) => {
	(e[t] === void 0 || n > e[t]) && (e[t] = n);
}, no = (e, t, n) => {
	(e[t] === void 0 || n < e[t]) && (e[t] = n);
}, ro = (e, t) => {
	to(e, "minimum", t), no(e, "maximum", t);
}, io = (e, t) => {
	e.multipleOf ??= [], e.multipleOf.includes(t) || e.multipleOf.push(t);
}, ao = (e, t) => {
	e.patterns ??= /* @__PURE__ */ new Set(), e.patterns.add(t);
}, oo = (e, t) => {
	e.mime = e.mime ? e.mime.filter((e) => t.includes(e)) : [...t];
}, so = (e, t) => {
	e.format = t, t.includes("int") && (e.isInt = !0);
}, co = (e, t) => to(e, "minimum", t.minimum), lo = (e, t) => no(e, "maximum", t.maximum), uo = (e) => (t, n) => {
	so(t, n.format);
	let [r, i] = e[n.format];
	to(t, "minimum", r), no(t, "maximum", i);
}, fo = {
	greater_than: (e, t) => to(e, t.inclusive ? "minimum" : "exclusiveMinimum", t.value),
	less_than: (e, t) => no(e, t.inclusive ? "maximum" : "exclusiveMaximum", t.value),
	multiple_of: (e, t) => io(e, t.value),
	number_format: uo(fe),
	bigint_format: uo(pe),
	min_length: co,
	max_length: lo,
	length_equals: (e, t) => ro(e, t.length),
	min_size: co,
	max_size: lo,
	size_equals: (e, t) => ro(e, t.size),
	string_format: (e, t) => {
		so(e, t.format), t.pattern && ao(e, t.pattern), (t.format === "base64" || t.format === "base64url") && (e.contentEncoding = t.format), (t.local || t.precision === -1) && (e.laxFormat = !0);
	},
	mime_type: (e, t) => oo(e, t.mime)
};
function D(e) {
	let t = {}, n = e._zod.def, r = e._zod.traits.has("$ZodCheck") ? [e, ...n.checks ?? []] : n.checks ?? [];
	for (let e of r) fo[e._zod.def.check]?.(t, e._zod.def);
	let i = e._zod.bag;
	i.minimum !== void 0 && to(t, "minimum", i.minimum), i.exclusiveMinimum !== void 0 && to(t, "exclusiveMinimum", i.exclusiveMinimum), i.maximum !== void 0 && no(t, "maximum", i.maximum), i.exclusiveMaximum !== void 0 && no(t, "exclusiveMaximum", i.exclusiveMaximum), i.multipleOf !== void 0 && io(t, i.multipleOf), i.format !== void 0 && (t.format ??= i.format, i.format.includes("int") && (t.isInt = !0)), i.mime && oo(t, i.mime);
	for (let e of i.patterns ?? []) ao(t, e);
	return t;
}
var po = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
}, mo = /* @__PURE__ */ new Map([[lr, Kt], [dr, qt]]), ho = (e) => mo.get(e) ?? e, go = (e, t, n, r) => {
	let i = n;
	i.type = "string";
	let { minimum: a, maximum: o, format: s, patterns: c, contentEncoding: l, laxFormat: u } = D(e);
	if (typeof a == "number" && (i.minLength = a), typeof o == "number" && (i.maxLength = o), s && (i.format = po[s] ?? s, i.format === "" && delete i.format, (s === "time" || u) && delete i.format), l && (i.contentEncoding = l), c && c.size > 0) {
		let e = [...c].map(ho);
		e.length === 1 ? i.pattern = e[0].source : e.length > 1 && (i.allOf = [...e.map((e) => ({
			...t.target === "draft-07" || t.target === "draft-04" || t.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: e.source
		}))]);
	}
}, _o = (e, t, n, r) => {
	let i = n, { minimum: a, maximum: o, multipleOf: s, exclusiveMaximum: c, exclusiveMinimum: l, isInt: u } = D(e);
	i.type = u ? "integer" : "number";
	let d = typeof l == "number" && l >= (a ?? -Infinity), f = typeof c == "number" && c <= (o ?? Infinity), p = t.target === "draft-04" || t.target === "openapi-3.0";
	if (d ? p ? (i.minimum = l, i.exclusiveMinimum = !0) : i.exclusiveMinimum = l : typeof a == "number" && (i.minimum = a), f ? p ? (i.maximum = c, i.exclusiveMaximum = !0) : i.exclusiveMaximum = c : typeof o == "number" && (i.maximum = o), s) {
		let n = /* @__PURE__ */ new Set();
		for (let a of s) Number.isFinite(a) && a !== 0 ? n.add(Math.abs(a)) : Ua(e, t, i, r, `A multipleOf divisor of ${a} cannot be represented in JSON Schema`);
		let [a, ...o] = n;
		a !== void 0 && (i.multipleOf = a), o.length && (i.allOf = [...i.allOf ?? [], ...o.map((e) => ({ multipleOf: e }))]);
	}
}, vo = (e, t, n, r) => {
	n.type = "boolean";
}, yo = (e, t, n, r) => {
	t.target === "openapi-3.0" ? (n.type = "string", n.nullable = !0, n.enum = [null]) : n.type = "null";
}, bo = (e, t, n, r) => {
	n.not = {};
}, xo = (t, n, r, i) => {
	let a = t._zod.def, o = e(a.entries);
	o.length === 0 ? r.not = {} : (o.every((e) => typeof e == "number") && (r.type = "number"), o.every((e) => typeof e == "string") && (r.type = "string"), r.enum = o);
}, So = (e, t, n, r) => {
	let i = e._zod.def;
	if (i.values.length === 0) {
		n.not = {};
		return;
	}
	let a = [];
	for (let o of i.values) if (o === void 0) {
		if (Ua(e, t, n, r, "Literal `undefined` cannot be represented in JSON Schema")) return;
	} else if (typeof o == "bigint") {
		if (Ua(e, t, n, r, "BigInt literals cannot be represented in JSON Schema")) return;
		a.push(Number(o));
	} else a.push(o);
	if (a.length !== 0) {
		if (a.length === 1) {
			let e = a[0];
			n.type = e === null ? "null" : typeof e, t.target === "draft-04" || t.target === "openapi-3.0" ? n.enum = [e] : n.const = e;
		} else a.every((e) => typeof e == "number") && (n.type = "number"), a.every((e) => typeof e == "string") && (n.type = "string"), a.every((e) => typeof e == "boolean") && (n.type = "boolean"), a.every((e) => e === null) && (n.type = "null"), n.enum = a;
	}
}, Co = (e, t, n, r) => {
	Ua(e, t, n, r, "Custom types cannot be represented in JSON Schema");
}, wo = (e, t, n, r) => {
	Ua(e, t, n, r, "Transforms cannot be represented in JSON Schema");
}, To = (e, t, n, r) => {
	let i = n, a = e._zod.def, { minimum: o, maximum: s } = D(e);
	typeof o == "number" && (i.minItems = o), typeof s == "number" && (i.maxItems = s), i.type = "array", i.items = T(a.element, t, {
		...r,
		path: [...r.path, "items"]
	});
};
function Eo(e) {
	let t = e._zod.def;
	return t.type === "pipe" && t.in._zod.traits.has("$ZodTransform") ? Eo(t.out) : t.type === "catch" ? Eo(t.innerType) : e._zod.optin;
}
var Do = (e, t, n, r) => {
	let i = n, a = e._zod.def, o = a.shape;
	if (Object.getOwnPropertySymbols(o).length && Ua(e, t, i, r, "Symbol keys cannot be represented in JSON Schema")) return;
	i.type = "object", i.properties = {};
	for (let e in o) u(i.properties, e, T(o[e], t, {
		...r,
		path: [
			...r.path,
			"properties",
			e
		]
	}));
	let s = [];
	for (let e of Object.keys(o)) {
		let n = a.shape[e];
		(t.io === "input" ? Eo(n) === void 0 : n._zod.optout === void 0) && s.push(e);
	}
	s.length > 0 && (i.required = s), a.catchall?._zod.def.type === "never" ? i.additionalProperties = !1 : a.catchall ? a.catchall && (i.additionalProperties = T(a.catchall, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	})) : t.io === "output" && (i.additionalProperties = !1);
}, Oo = (e, t, n, r) => {
	let i = e._zod.def, a = i.inclusive === !1, o = i.options.map((e, n) => T(e, t, {
		...r,
		path: [
			...r.path,
			a ? "oneOf" : "anyOf",
			n
		]
	}));
	a ? n.oneOf = o : n.anyOf = o;
}, ko = (e, t, n, r) => {
	let i = e._zod.def, a = T(i.left, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			0
		]
	}), o = T(i.right, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			1
		]
	}), s = (e) => "allOf" in e && Object.keys(e).length === 1, c = [...s(a) ? a.allOf : [a], ...s(o) ? o.allOf : [o]];
	n.allOf = c, t.intersections.push(c);
}, Ao = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "array";
	let o = t.target === "draft-2020-12" ? "prefixItems" : "items", s = t.target === "draft-2020-12" || t.target === "openapi-3.0" ? "items" : "additionalItems", c = a.items.map((e, n) => T(e, t, {
		...r,
		path: [
			...r.path,
			o,
			n
		]
	})), l = a.rest ? T(a.rest, t, {
		...r,
		path: [
			...r.path,
			s,
			...t.target === "openapi-3.0" ? [a.items.length] : []
		]
	}) : null, u = a.items.length;
	for (; u > 0;) {
		let e = a.items[u - 1];
		if (!(t.io === "input" ? Eo(e) !== void 0 : e._zod.optout === "optional")) break;
		u--;
	}
	let d = a.items.length, f = !a.rest;
	t.target === "draft-2020-12" ? (i.prefixItems = c, f ? i.items = !1 : l && (i.items = l), u > 0 && (i.minItems = u), f && (i.maxItems = d)) : t.target === "openapi-3.0" ? (i.items = { anyOf: c }, l && i.items.anyOf.push(l), u > 0 && (i.minItems = u), f && (i.maxItems = d)) : (i.items = c, f ? i.additionalItems = !1 : l && (i.additionalItems = l), u > 0 && (i.minItems = u), f && (i.maxItems = d));
	let { minimum: p, maximum: m } = D(e);
	typeof p == "number" && (i.minItems = p), typeof m == "number" && (i.maxItems = m);
};
function jo(e, t, n) {
	if (t.$ref) {
		if (n.has(t)) return t;
		n.add(t);
		let r = e.get(t)?.def;
		if (!r) return t;
		let i = jo(e, r, n);
		return i === r ? t : i;
	}
	for (let r of ["anyOf", "oneOf"]) {
		let i = t[r];
		if (!Array.isArray(i)) continue;
		let a = i.map((t) => jo(e, t, n));
		a.some((e, t) => e !== i[t]) && (t = {
			...t,
			[r]: a
		});
	}
	let r = Array.isArray(t.type) ? t.type : [t.type], i = !r.includes("string") && r.some((e) => e === "number" || e === "integer"), a = t.enum ?? (t.const === void 0 ? void 0 : [t.const]);
	if (!i && !a?.some((e) => typeof e == "number")) return t;
	let { minimum: o, maximum: s, exclusiveMinimum: c, exclusiveMaximum: l, multipleOf: u, format: d, id: f, ...p } = t;
	return p.enum ? p.enum = p.enum.map((e) => typeof e == "number" ? String(e) : e) : typeof p.const == "number" && (p.const = String(p.const)), i && (p.type = "string", a || (p.pattern = (r.includes("number") ? an : rn).source)), p;
}
var Mo = /* @__PURE__ */ new WeakMap();
function No(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.seen.values()) n.def && !t.has(n.schema) && t.set(n.schema, n);
	let n = /* @__PURE__ */ new Map();
	for (let r of Mo.get(e) ?? []) {
		let i = e.seen.get(r), a = (i?.def ?? i?.schema)?.propertyNames;
		if (!a || a === !0 || n.has(a)) continue;
		let o = jo(t, a, /* @__PURE__ */ new Set());
		o !== a && n.set(a, o);
	}
	if (n.size) for (let t of e.seen.values()) for (let e of [t.schema, t.def]) {
		let t = e && n.get(e.propertyNames);
		t && (e.propertyNames = t);
	}
}
var Po = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object";
	let o = a.keyType, s = D(o).patterns;
	if (a.mode === "loose" && s && s.size > 0) {
		let e = T(a.valueType, t, {
			...r,
			path: [
				...r.path,
				"patternProperties",
				"*"
			]
		});
		i.patternProperties = {};
		for (let t of s) u(i.patternProperties, ho(t).source, e);
	} else {
		if (t.target === "draft-07" || t.target === "draft-2020-12") {
			i.propertyNames = T(a.keyType, t, {
				...r,
				path: [...r.path, "propertyNames"]
			});
			let n = Mo.get(t);
			n || (n = [], Mo.set(t, n), t.deferred.push(() => No(t))), n.push(e);
		}
		i.additionalProperties = T(a.valueType, t, {
			...r,
			path: [...r.path, "additionalProperties"]
		});
	}
	let c = o._zod.values, l = t.io === "input" && Eo(a.valueType) !== void 0;
	if (c && !a.partial && !l) {
		let e = [...c].filter((e) => typeof e == "string" || typeof e == "number");
		e.length > 0 && (i.required = e.map(String));
	}
}, Fo = (e, t, n, r) => {
	let i = e._zod.def, a = T(i.innerType, t, r), o = t.seen.get(e);
	t.target === "openapi-3.0" ? (o.ref = i.innerType, n.nullable = !0) : n.anyOf = [a, { type: "null" }];
}, Io = (e, t, n, r) => {
	let i = e._zod.def;
	T(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, Lo = Symbol();
function Ro(e, t, n, r, i) {
	let a = !1, o = JSON.stringify(e, (e, t) => typeof t == "bigint" ? (a = !0, null) : t);
	return a ? (Ua(t, n, r, i, "BigInt defaults cannot be represented in JSON Schema"), Lo) : JSON.parse(o);
}
var zo = (e, t, n, r) => {
	let i = e._zod.def;
	T(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
	let o = Ro(i.defaultValue, e, t, n, r);
	o !== Lo && (n.default = o);
}, Bo = (e, t, n, r) => {
	let i = e._zod.def;
	T(i.innerType, t, r);
	let a = t.seen.get(e);
	if (a.ref = i.innerType, t.io !== "input") return;
	let o = Ro(i.defaultValue, e, t, n, r);
	o !== Lo && (n._prefault = o);
}, Vo = (e, t, n, r) => {
	let i = e._zod.def;
	T(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
	let o;
	try {
		o = i.catchValue(void 0);
	} catch {
		Ua(e, t, n, r, "Dynamic catch values are not supported in JSON Schema");
		return;
	}
	n.default = o;
}, Ho = (e, t, n, r) => {
	let i = e._zod.def, a = i.in._zod.traits.has("$ZodTransform"), o = t.io === "input" ? a ? i.out : i.in : i.out;
	T(o, t, r);
	let s = t.seen.get(e);
	s.ref = o;
}, Uo = (e, t, n, r) => {
	let i = e._zod.def;
	T(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.readOnly = !0;
}, Wo = (e, t, n, r) => {
	let i = e._zod.def;
	T(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, Go = (e, t, n, r) => {
	let i = e._zod.innerType;
	T(i, t, r);
	let a = t.seen.get(e);
	a.ref = i;
}, Ko = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
function qo(e, t, n) {
	Object.defineProperty(e, t, {
		configurable: !0,
		enumerable: !1,
		get() {
			let e = n(this);
			return Object.defineProperty(this, t, {
				value: e,
				configurable: !0,
				writable: !0
			}), e;
		},
		set(e) {
			Object.defineProperty(this, t, {
				value: e,
				configurable: !0,
				writable: !0
			});
		}
	});
}
var O = /*@__PURE__*/ b("ZodError", (e, t) => {
	ot.init(e, t), e.name = "ZodError";
	let r = Object.getPrototypeOf(e);
	Ko.has(r) || (Ko.add(r), qo(r, "format", (e) => (t) => lt(e, t)), qo(r, "flatten", (e) => (t) => ct(e, t)), qo(r, "addIssue", (e) => (t) => {
		e.issues.push(t), e.message = JSON.stringify(e.issues, n, 2);
	}), qo(r, "addIssues", (e) => (t) => {
		e.issues.push(...t), e.message = JSON.stringify(e.issues, n, 2);
	}), Object.defineProperty(r, "isEmpty", {
		configurable: !0,
		enumerable: !1,
		get() {
			return this.issues.length === 0;
		}
	}));
}, void 0, { Parent: Error }), Jo = /* @__PURE__ */ dt(O), Yo = /* @__PURE__ */ ft(O), Xo = /* @__PURE__ */ pt(O), Zo = /* @__PURE__ */ ht(O), Qo = /* @__PURE__ */ xt(O), $o = /* @__PURE__ */ St(O), es = /* @__PURE__ */ Ct(O), ts = /* @__PURE__ */ wt(O), ns = /* @__PURE__ */ Tt(O), rs = /* @__PURE__ */ Et(O), is = /* @__PURE__ */ Dt(O), as = /* @__PURE__ */ Ot(O);
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/classic/schemas.js
function os() {
	x.localeError || et(ji());
}
function ss() {
	x.memoizer || et({ memoizer: Oi() });
}
var k = /*@__PURE__*/ b("ZodType", (e, t) => (os(), C.init(e, t), e.def = t, e.type = t.type, e), {
	check(...e) {
		let t = this.def;
		return this.clone(_(t, { checks: [...t.checks ?? [], ...e.map((e) => typeof e == "function" ? { _zod: {
			check: e,
			def: { check: "custom" },
			onattach: []
		} } : e)] }), { parent: !0 });
	},
	with(...e) {
		return this.check(...e);
	},
	clone(e, t) {
		return le(this, e, t);
	},
	brand() {
		return this;
	},
	register(e, t) {
		return e.add(this, t), this;
	},
	refine(e, t) {
		return this.check(Dc(e, t));
	},
	superRefine(e, t) {
		return this.check(Oc(e, t));
	},
	overwrite(e) {
		return this.check(/* @__PURE__ */ ja(e));
	},
	optional() {
		return oc(this);
	},
	exactOptional() {
		return cc(this);
	},
	nullable() {
		return uc(this);
	},
	nullish() {
		return oc(uc(this));
	},
	nonoptional(e) {
		return gc(this, e);
	},
	array() {
		return P(this);
	},
	or(e) {
		return qs([this, e]);
	},
	and(e) {
		return Xs(this, e);
	},
	transform(e) {
		return bc(this, ic(e));
	},
	default(e) {
		return fc(this, e);
	},
	prefault(e) {
		return mc(this, e);
	},
	catch(e) {
		return vc(this, e);
	},
	pipe(e) {
		return bc(this, e);
	},
	readonly() {
		return Cc(this);
	},
	describe(e) {
		let t = this.clone();
		return Fi.add(t, { description: e }), t;
	},
	meta(...e) {
		if (e.length === 0) return Fi.get(this);
		let t = this.clone();
		return Fi.add(t, e[0]), t;
	},
	isOptional() {
		return this.safeParse(void 0).success;
	},
	isNullable() {
		return this.safeParse(null).success;
	},
	apply(e, ...t) {
		return t.length === 0 ? e(this) : e(this, ...t);
	},
	get "~standard"() {
		return Le(this, "~standard", {
			...jn(this),
			jsonSchema: {
				input: eo(this, "input"),
				output: eo(this, "output")
			}
		});
	},
	set "~standard"(e) {
		Ie(this, "~standard", e);
	},
	parse: function e(t, n) {
		return Jo(this, t, n, { callee: e });
	},
	parseAsync: async function e(t, n) {
		return await Yo(this, t, n, { callee: e });
	},
	safeParse(e, t) {
		return Xo(this, e, t);
	},
	async safeParseAsync(e, t) {
		return Zo(this, e, t);
	},
	get spa() {
		return this?.safeParseAsync;
	},
	set spa(e) {
		Ie(this, "spa", e);
	},
	validate(e, t) {
		return vt(this, e, t);
	},
	validateAsync(e, t) {
		return bt(this, e, t);
	},
	encode: function e(t, n) {
		return Qo(this, t, n, { callee: e });
	},
	decode: function e(t, n) {
		return $o(this, t, n, { callee: e });
	},
	encodeAsync: async function e(t, n) {
		return await es(this, t, n, { callee: e });
	},
	decodeAsync: async function e(t, n) {
		return await ts(this, t, n, { callee: e });
	},
	safeEncode(e, t) {
		return ns(this, e, t);
	},
	safeDecode(e, t) {
		return rs(this, e, t);
	},
	async safeEncodeAsync(e, t) {
		return is(this, e, t);
	},
	async safeDecodeAsync(e, t) {
		return as(this, e, t);
	},
	toJSONSchema(e) {
		return $a(this, {})(e);
	},
	get description() {
		return Fi.get(this)?.description;
	},
	get _def() {
		return this._zod.def;
	}
}), cs = /*@__PURE__*/ b("_ZodString", (e, t) => {
	Mn.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => go(e, t, n, r);
}, /*@__PURE__*/ Re({
	format: (e) => D(e).format ?? null,
	minLength: (e) => D(e).minimum ?? null,
	maxLength: (e) => D(e).maximum ?? null
}, {
	regex(...e) {
		return this.check(/* @__PURE__ */ Ta(...e));
	},
	includes(...e) {
		return this.check(/* @__PURE__ */ Oa(...e));
	},
	startsWith(...e) {
		return this.check(/* @__PURE__ */ ka(...e));
	},
	endsWith(...e) {
		return this.check(/* @__PURE__ */ Aa(...e));
	},
	min(...e) {
		return this.check(/* @__PURE__ */ Ca(...e));
	},
	max(...e) {
		return this.check(/* @__PURE__ */ Sa(...e));
	},
	length(...e) {
		return this.check(/* @__PURE__ */ wa(...e));
	},
	nonempty(...e) {
		return this.check(/* @__PURE__ */ Ca(1, ...e));
	},
	lowercase(e) {
		return this.check(/* @__PURE__ */ Ea(e));
	},
	uppercase(e) {
		return this.check(/* @__PURE__ */ Da(e));
	},
	trim() {
		return this.check(/* @__PURE__ */ Na());
	},
	normalize(...e) {
		return this.check(/* @__PURE__ */ Ma(...e));
	},
	toLowerCase() {
		return this.check(/* @__PURE__ */ Pa());
	},
	toUpperCase() {
		return this.check(/* @__PURE__ */ Fa());
	},
	slugify() {
		return this.check(/* @__PURE__ */ Ia());
	}
})), ls = /*@__PURE__*/ b("ZodString", (e, t) => {
	Mn.init(e, t), cs.init(e, t);
}, {
	email(e) {
		return this.check(/* @__PURE__ */ Ri(ms, e));
	},
	url(e) {
		return this.check(/* @__PURE__ */ Wi(_s, e));
	},
	jwt(e) {
		return this.check(/* @__PURE__ */ aa(Ms, e));
	},
	emoji(e) {
		return this.check(/* @__PURE__ */ Gi(vs, e));
	},
	guid(e) {
		return this.check(/* @__PURE__ */ zi(hs, e));
	},
	uuid(e) {
		return this.check(/* @__PURE__ */ Bi(gs, e));
	},
	uuidv4(e) {
		return this.check(/* @__PURE__ */ Vi(gs, e));
	},
	uuidv6(e) {
		return this.check(/* @__PURE__ */ Hi(gs, e));
	},
	uuidv7(e) {
		return this.check(/* @__PURE__ */ Ui(gs, e));
	},
	nanoid(e) {
		return this.check(/* @__PURE__ */ Ki(ys, e));
	},
	cuid(e) {
		return this.check(/* @__PURE__ */ qi(bs, e));
	},
	cuid2(e) {
		return this.check(/* @__PURE__ */ Ji(xs, e));
	},
	ulid(e) {
		return this.check(/* @__PURE__ */ Yi(Ss, e));
	},
	base64(e) {
		return this.check(/* @__PURE__ */ na(ks, e));
	},
	base64url(e) {
		return this.check(/* @__PURE__ */ ra(As, e));
	},
	xid(e) {
		return this.check(/* @__PURE__ */ Xi(Cs, e));
	},
	ksuid(e) {
		return this.check(/* @__PURE__ */ Zi(ws, e));
	},
	ipv4(e) {
		return this.check(/* @__PURE__ */ Qi(Ts, e));
	},
	ipv6(e) {
		return this.check(/* @__PURE__ */ $i(Es, e));
	},
	cidrv4(e) {
		return this.check(/* @__PURE__ */ ea(Ds, e));
	},
	cidrv6(e) {
		return this.check(/* @__PURE__ */ ta(Os, e));
	},
	e164(e) {
		return this.check(/* @__PURE__ */ ia(js, e));
	},
	datetime(e) {
		return this.check(/* @__PURE__ */ oa(us, e));
	},
	date(e) {
		return this.check(/* @__PURE__ */ sa(ds, e));
	},
	time(e) {
		return this.check(/* @__PURE__ */ ca(fs, e));
	},
	duration(e) {
		return this.check(/* @__PURE__ */ la(ps, e));
	}
});
function A(e) {
	return /* @__PURE__ */ Li(ls, e);
}
var j = /*@__PURE__*/ b("ZodStringFormat", (e, t) => {
	w.init(e, t), cs.init(e, t);
}), us = /*@__PURE__*/ b("ZodISODateTime", (e, t) => {
	Zn.init(e, t), j.init(e, t);
}), ds = /*@__PURE__*/ b("ZodISODate", (e, t) => {
	Qn.init(e, t), j.init(e, t);
}), fs = /*@__PURE__*/ b("ZodISOTime", (e, t) => {
	$n.init(e, t), j.init(e, t);
}), ps = /*@__PURE__*/ b("ZodISODuration", (e, t) => {
	er.init(e, t), j.init(e, t);
}), ms = /*@__PURE__*/ b("ZodEmail", (e, t) => {
	Fn.init(e, t), j.init(e, t);
}), hs = /*@__PURE__*/ b("ZodGUID", (e, t) => {
	Nn.init(e, t), j.init(e, t);
}), gs = /*@__PURE__*/ b("ZodUUID", (e, t) => {
	Pn.init(e, t), j.init(e, t);
}), _s = /*@__PURE__*/ b("ZodURL", (e, t) => {
	Un.init(e, t), j.init(e, t);
}), vs = /*@__PURE__*/ b("ZodEmoji", (e, t) => {
	Wn.init(e, t), j.init(e, t);
}), ys = /*@__PURE__*/ b("ZodNanoID", (e, t) => {
	Gn.init(e, t), j.init(e, t);
}), bs = /*@__PURE__*/ b("ZodCUID", (e, t) => {
	Kn.init(e, t), j.init(e, t);
}), xs = /*@__PURE__*/ b("ZodCUID2", (e, t) => {
	qn.init(e, t), j.init(e, t);
}), Ss = /*@__PURE__*/ b("ZodULID", (e, t) => {
	Jn.init(e, t), j.init(e, t);
}), Cs = /*@__PURE__*/ b("ZodXID", (e, t) => {
	Yn.init(e, t), j.init(e, t);
}), ws = /*@__PURE__*/ b("ZodKSUID", (e, t) => {
	Xn.init(e, t), j.init(e, t);
}), Ts = /*@__PURE__*/ b("ZodIPv4", (e, t) => {
	tr.init(e, t), j.init(e, t);
}), Es = /*@__PURE__*/ b("ZodIPv6", (e, t) => {
	ir.init(e, t), j.init(e, t);
}), Ds = /*@__PURE__*/ b("ZodCIDRv4", (e, t) => {
	ar.init(e, t), j.init(e, t);
}), Os = /*@__PURE__*/ b("ZodCIDRv6", (e, t) => {
	sr.init(e, t), j.init(e, t);
}), ks = /*@__PURE__*/ b("ZodBase64", (e, t) => {
	ur.init(e, t), j.init(e, t);
}), As = /*@__PURE__*/ b("ZodBase64URL", (e, t) => {
	pr.init(e, t), j.init(e, t);
}), js = /*@__PURE__*/ b("ZodE164", (e, t) => {
	mr.init(e, t), j.init(e, t);
}), Ms = /*@__PURE__*/ b("ZodJWT", (e, t) => {
	gr.init(e, t), j.init(e, t);
}), Ns = /*@__PURE__*/ b("ZodNumber", (e, t) => {
	_r.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => _o(e, t, n, r), e.isFinite = !0;
}, /*@__PURE__*/ Re({
	minValue: (e) => {
		let { minimum: t, exclusiveMinimum: n } = D(e);
		return Math.max(t ?? -Infinity, n ?? -Infinity);
	},
	maxValue: (e) => {
		let { maximum: t, exclusiveMaximum: n } = D(e);
		return Math.min(t ?? Infinity, n ?? Infinity);
	},
	isInt: (e) => {
		let { isInt: t, multipleOf: n } = D(e);
		return !!t || !!n?.some(Number.isSafeInteger);
	},
	format: (e) => D(e).format ?? null
}, {
	gt(e, t) {
		return this.check(/* @__PURE__ */ ya(e, t));
	},
	gte(e, t) {
		return this.check(/* @__PURE__ */ ba(e, t));
	},
	min(e, t) {
		return this.check(/* @__PURE__ */ ba(e, t));
	},
	lt(e, t) {
		return this.check(/* @__PURE__ */ _a(e, t));
	},
	lte(e, t) {
		return this.check(/* @__PURE__ */ va(e, t));
	},
	max(e, t) {
		return this.check(/* @__PURE__ */ va(e, t));
	},
	int(e) {
		return this.check(Fs(e));
	},
	safe(e) {
		return this.check(Fs(e));
	},
	positive(e) {
		return this.check(/* @__PURE__ */ ya(0, e));
	},
	nonnegative(e) {
		return this.check(/* @__PURE__ */ ba(0, e));
	},
	negative(e) {
		return this.check(/* @__PURE__ */ _a(0, e));
	},
	nonpositive(e) {
		return this.check(/* @__PURE__ */ va(0, e));
	},
	multipleOf(e, t) {
		return this.check(/* @__PURE__ */ xa(e, t));
	},
	step(e, t) {
		return this.check(/* @__PURE__ */ xa(e, t));
	},
	finite() {
		return this;
	}
}));
function M(e) {
	return /* @__PURE__ */ ua(Ns, e);
}
var Ps = /*@__PURE__*/ b("ZodNumberFormat", (e, t) => {
	vr.init(e, t), Ns.init(e, t);
});
function Fs(e) {
	return /* @__PURE__ */ fa(Ps, e);
}
var Is = /*@__PURE__*/ b("ZodBoolean", (e, t) => {
	yr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => vo(e, t, n, r);
});
function N(e) {
	return /* @__PURE__ */ pa(Is, e);
}
var Ls = /*@__PURE__*/ b("ZodNull", (e, t) => {
	br.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => yo(e, t, n, r);
});
function Rs(e) {
	return /* @__PURE__ */ ma(Ls, e);
}
var zs = /*@__PURE__*/ b("ZodUnknown", (e, t) => {
	xr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (e, t, n) => void 0;
});
function Bs() {
	return /* @__PURE__ */ ha(zs);
}
var Vs = /*@__PURE__*/ b("ZodNever", (e, t) => {
	Sr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => bo(e, t, n, r);
});
function Hs(e) {
	return /* @__PURE__ */ ga(Vs, e);
}
var Us = /*@__PURE__*/ b("ZodArray", (e, t) => {
	ss(), Er.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => To(e, t, n, r), e.element = t.element;
}, {
	min(e, t) {
		return this.check(/* @__PURE__ */ Ca(e, t));
	},
	nonempty(e) {
		return this.check(/* @__PURE__ */ Ca(1, e));
	},
	max(e, t) {
		return this.check(/* @__PURE__ */ Sa(e, t));
	},
	length(e, t) {
		return this.check(/* @__PURE__ */ wa(e, t));
	},
	unwrap() {
		return this.element;
	}
});
function P(e, t) {
	return /* @__PURE__ */ La(Us, e, t);
}
var Ws = /*@__PURE__*/ b("ZodObject", (e, t) => {
	ss(), Mr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Do(e, t, n, r), We(e, "shape", (e) => e._zod.def.shape, !1);
}, {
	keyof() {
		return z(Object.keys(this._zod.def.shape));
	},
	catchall(e) {
		return this.clone(_(this._zod.def, { catchall: e }));
	},
	passthrough() {
		return this.clone(_(this._zod.def, { catchall: Bs() }));
	},
	loose() {
		return this.clone(_(this._zod.def, { catchall: Bs() }));
	},
	strict() {
		return this.clone(_(this._zod.def, { catchall: Hs() }));
	},
	strip() {
		return this.clone(_(this._zod.def, { catchall: void 0 }));
	},
	extend(e) {
		return _e(this, e);
	},
	safeExtend(e) {
		return ye(this, e);
	},
	merge(e) {
		return be(this, e);
	},
	pick(e) {
		return me(this, e);
	},
	omit(e) {
		return ge(this, e);
	},
	partial(...e) {
		return xe(ac, this, e[0]);
	},
	exactPartial(...e) {
		return xe(sc, this, e[0], "exactPartial");
	},
	required(...e) {
		return Se(hc, this, e[0]);
	}
});
function F(e, t) {
	return new Ws({
		type: "object",
		shape: e ?? {},
		...v(t)
	});
}
function I(e, t) {
	return new Ws({
		type: "object",
		shape: e,
		catchall: Hs(),
		...v(t)
	});
}
function Gs(e, t) {
	return new Ws({
		type: "object",
		shape: e,
		catchall: Bs(),
		...v(t)
	});
}
var Ks = /*@__PURE__*/ b("ZodUnion", (e, t) => {
	Pr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Oo(e, t, n, r), e.options = t.options;
});
function qs(e, t) {
	return new Ks({
		type: "union",
		options: e,
		...v(t)
	});
}
var Js = /*@__PURE__*/ b("ZodDiscriminatedUnion", (e, t) => {
	Ks.init(e, t), Ir.init(e, t);
});
function L(e, t, n) {
	return new Js({
		type: "union",
		options: t,
		discriminator: e,
		...v(n)
	});
}
var Ys = /*@__PURE__*/ b("ZodIntersection", (e, t) => {
	Lr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => ko(e, t, n, r);
});
function Xs(e, t) {
	return new Ys({
		type: "intersection",
		left: e,
		right: t
	});
}
var Zs = /*@__PURE__*/ b("ZodTuple", (e, t) => {
	ss(), Br.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Ao(e, t, n, r);
}, {
	rest(e) {
		return this.clone({
			...this._zod.def,
			rest: e
		});
	},
	partial() {
		let e = this._zod.def;
		if (e.checks?.length) throw Error(".partial() cannot be used on tuple schemas containing refinements");
		return this.clone({
			...e,
			items: e.items.map((e) => new ac({
				type: "optional",
				innerType: e
			}))
		});
	}
});
function Qs(e, t, n) {
	let r = t instanceof C;
	return new Zs({
		type: "tuple",
		items: e,
		rest: r ? t : null,
		...v(r ? n : t)
	});
}
var $s = /*@__PURE__*/ b("ZodRecord", (e, t) => {
	ss(), Wr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Po(e, t, n, r), e.keyType = t.keyType, e.valueType = t.valueType;
});
function R(e, t, n) {
	return !t || !t._zod ? new $s({
		type: "record",
		keyType: A(),
		valueType: e,
		...v(t)
	}) : new $s({
		type: "record",
		keyType: e,
		valueType: t,
		...v(n)
	});
}
function ec(e, t, n) {
	return new $s({
		type: "record",
		keyType: e,
		valueType: t,
		...v(n),
		partial: !0
	});
}
var tc = /*@__PURE__*/ b("ZodEnum", (e, t) => {
	Gr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => xo(e, t, n, r), e.enum = t.entries, e.options = [...e._zod.values];
	let n = new Set(Object.keys(t.entries));
	e.extract = (e, r) => {
		let i = {};
		for (let r of e) if (n.has(r)) i[r] = t.entries[r];
		else throw Error(`Key ${r} not found in enum`);
		return new tc({
			...t,
			checks: [],
			...v(r),
			entries: i
		});
	}, e.exclude = (e, r) => {
		let i = { ...t.entries };
		for (let t of e) if (n.has(t)) delete i[t];
		else throw Error(`Key ${t} not found in enum`);
		return new tc({
			...t,
			checks: [],
			...v(r),
			entries: i
		});
	};
});
function z(e, t) {
	return new tc({
		type: "enum",
		entries: Array.isArray(e) ? Object.fromEntries(e.map((e) => [e, e])) : e,
		...v(t)
	});
}
var nc = /*@__PURE__*/ b("ZodLiteral", (e, t) => {
	Kr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => So(e, t, n, r), e.values = new Set(t.values), Object.defineProperty(e, "value", { get() {
		if (t.values.length > 1) throw Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return t.values[0];
	} });
});
function B(e, t) {
	return new nc({
		type: "literal",
		values: Array.isArray(e) ? e : [e],
		...v(t)
	});
}
var rc = /*@__PURE__*/ b("ZodTransform", (e, t) => {
	ss(), qr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => wo(e, t, n, r), e._zod.parse = (n, r) => {
		if (r.direction === "backward") throw new $e(e.constructor.name);
		n.addIssue = (r) => {
			if (typeof r == "string") n.issues.push(Pe(r, n.value, t));
			else {
				let t = r;
				t.fatal && (t.continue = !1), t.code ??= "custom", "input" in t || (t.input = n.value), t.inst ??= e, n.issues.push(Pe(t));
			}
		};
		let i = t.transform(n.value, n);
		return i instanceof Promise ? i.then((e) => (n.value = e, n)) : (n.value = i, n);
	};
});
function ic(e) {
	return new rc({
		type: "transform",
		transform: e
	});
}
var ac = /*@__PURE__*/ b("ZodOptional", (e, t) => {
	Yr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Wo(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function oc(e) {
	return new ac({
		type: "optional",
		innerType: e
	});
}
var sc = /*@__PURE__*/ b("ZodExactOptional", (e, t) => {
	Xr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Wo(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function cc(e) {
	return new sc({
		type: "optional",
		innerType: e
	});
}
var lc = /*@__PURE__*/ b("ZodNullable", (e, t) => {
	Zr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Fo(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function uc(e) {
	return new lc({
		type: "nullable",
		innerType: e
	});
}
var dc = /*@__PURE__*/ b("ZodDefault", (e, t) => {
	Qr.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => zo(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeDefault = e.unwrap;
});
function fc(e, t) {
	return new dc({
		type: "default",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : oe(t);
		}
	});
}
var pc = /*@__PURE__*/ b("ZodPrefault", (e, t) => {
	ei.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Bo(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function mc(e, t) {
	return new pc({
		type: "prefault",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : oe(t);
		}
	});
}
var hc = /*@__PURE__*/ b("ZodNonOptional", (e, t) => {
	ti.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Io(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function gc(e, t) {
	return new hc({
		type: "nonoptional",
		innerType: e,
		...v(t)
	});
}
var _c = /*@__PURE__*/ b("ZodCatch", (e, t) => {
	ii.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Vo(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeCatch = e.unwrap;
});
function vc(e, t) {
	return new _c({
		type: "catch",
		innerType: e,
		catchValue: typeof t == "function" ? t : Ke(t)
	});
}
var yc = /*@__PURE__*/ b("ZodPipe", (e, t) => {
	ai.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Ho(e, t, n, r), e.in = t.in, e.out = t.out;
});
function bc(e, t) {
	return new yc({
		type: "pipe",
		in: e,
		out: t
	});
}
var xc = /*@__PURE__*/ b("ZodPreprocess", (e, t) => {
	yc.init(e, t), si.init(e, t);
}), Sc = /*@__PURE__*/ b("ZodReadonly", (e, t) => {
	ci.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Uo(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Cc(e) {
	return new Sc({
		type: "readonly",
		innerType: e
	});
}
var wc = /*@__PURE__*/ b("ZodLazy", (e, t) => {
	ui.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Go(e, t, n, r), e.unwrap = () => e._zod.def.getter();
});
function Tc(e) {
	return new wc({
		type: "lazy",
		getter: e
	});
}
var Ec = /*@__PURE__*/ b("ZodCustom", (e, t) => {
	di.init(e, t), k.init(e, t), e._zod.processJSONSchema = (t, n, r) => Co(e, t, n, r);
});
function Dc(e, t = {}) {
	return /* @__PURE__ */ Ra(Ec, e, t);
}
function Oc(e, t) {
	return /* @__PURE__ */ za(e, t);
}
function kc(e) {
	let t = Tc(() => qs([
		A(e),
		M(),
		N(),
		Rs(),
		P(t),
		R(A(), t)
	]));
	return t;
}
function Ac(e, t) {
	return new xc({
		type: "pipe",
		in: ic(e),
		out: t
	});
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/classic/iso.js
function jc(e) {
	return /* @__PURE__ */ oa(us, e);
}
// ../../node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/classic/coerce.js
function Mc(e) {
	return /* @__PURE__ */ da(Ns, e);
}
// ../../packages/poe-item-query/src/schema.ts
var Nc = z(["poe1", "poe2"]), Pc = z([
	"Normal",
	"Magic",
	"Rare",
	"Unique",
	"Currency",
	"Gem",
	"Relic"
]), V = A().min(1).max(500), H = M().int().nonnegative(), Fc = kc().meta({ type: [
	"string",
	"number",
	"boolean",
	"null",
	"array",
	"object"
] }), Ic = I({
	min: M().optional(),
	max: M().optional()
}).refine((e) => e.min === void 0 || e.max === void 0 || e.min <= e.max, "Minimum must not exceed maximum."), Lc = F({
	fractured: N().optional(),
	crafted: N().optional(),
	desecrated: N().optional(),
	mutated: N().optional(),
	vestigial: N().optional()
}).catchall(Fc), Rc = qs([A(), F({
	description: A(),
	flags: Lc.optional(),
	mods: P(F({
		name: A(),
		tier: A(),
		level: H.optional()
	}).catchall(Fc)).optional()
}).catchall(Fc)]), zc = F({
	id: A().optional(),
	name: A().optional(),
	typeLine: A().optional(),
	baseType: V,
	ilvl: H.optional(),
	itemLevel: H.optional(),
	rarity: Pc.optional(),
	frameType: H.optional(),
	frameTypeId: A().optional(),
	identified: N().optional(),
	corrupted: N().optional(),
	duplicated: N().optional(),
	fractured: N().optional(),
	split: N().optional(),
	synthesised: N().optional(),
	sanctified: N().optional(),
	influences: R(A(), N()).optional(),
	sockets: P(F({
		group: H,
		attr: A().optional(),
		sColour: A().optional(),
		type: A().optional(),
		item: A().optional()
	}).catchall(Fc)).optional(),
	explicitMods: P(Rc).optional(),
	implicitMods: P(Rc).optional(),
	craftedMods: P(A()).optional(),
	fracturedMods: P(A()).optional(),
	extended: F({
		prefixes: H.optional(),
		suffixes: H.optional()
	}).catchall(Fc).optional()
}).catchall(Fc), Bc = I({
	id: V.optional(),
	possibleIds: P(V).min(2).max(100).refine((e) => new Set(e).size === e.length, "Possible identities must be distinct.").optional(),
	name: A().optional(),
	side: z([
		"prefix",
		"suffix",
		"implicit"
	]).optional(),
	tier: H.optional(),
	fractured: N().optional(),
	crafted: N().optional()
}).refine((e) => e.id === void 0 || e.possibleIds === void 0, "Use an exact identity or possible identities, not both."), Vc = I({
	baseId: V.optional(),
	baseTypeAmbiguous: N().optional(),
	itemClass: V.optional(),
	qualityType: V.optional(),
	catalystId: V.optional(),
	quality: H.optional(),
	catalystQuality: H.optional(),
	modifiers: P(Bc).max(100).default([]),
	modifiersComplete: N().default(!1),
	prefixes: H.optional(),
	suffixes: H.optional(),
	prefixLimit: H.optional(),
	memoryStrands: H.optional(),
	memoryStrandsSpent: H.optional(),
	suffixLimit: H.optional(),
	socketCount: H.optional(),
	linkedSockets: I({
		min: H,
		max: H
	}).refine((e) => e.min <= e.max).optional(),
	stats: F({
		explicit: R(A(), M()).default({}),
		implicit: R(A(), M()).default({}),
		total: R(A(), M()).default({})
	}).prefault({}),
	statsComplete: N().default(!1),
	destroyed: N().default(!1)
});
I({
	game: Nc,
	source: z([
		"stash",
		"trade",
		"paste",
		"craft"
	]),
	item: zc,
	facts: Vc.prefault({})
});
var Hc = L("kind", [
	I({
		kind: B("base"),
		field: z([
			"baseType",
			"baseId",
			"itemClass",
			"qualityType",
			"catalystId"
		]),
		values: P(V).min(1).max(100)
	}),
	I({
		kind: B("rarity"),
		values: P(Pc).min(1).max(7)
	}),
	I({
		kind: B("range"),
		field: z([
			"ilvl",
			"sockets",
			"links",
			"prefixes",
			"suffixes",
			"openPrefixes",
			"openSuffixes",
			"memoryStrands",
			"memoryStrandsSpent",
			"quality",
			"catalystQuality"
		]),
		value: Ic
	}),
	I({
		kind: B("flag"),
		field: z([
			"identified",
			"corrupted",
			"mirrored",
			"fractured",
			"split",
			"synthesised",
			"sanctified",
			"influenced",
			"destroyed",
			"intangible"
		]),
		value: N()
	}),
	I({
		kind: B("influence"),
		values: P(V).min(1).max(10)
	}),
	I({
		kind: B("enchant"),
		values: P(A().min(1).max(500)).min(1).max(100)
	}),
	I({
		kind: B("mod"),
		ids: P(V).min(1).max(100).optional(),
		names: P(V).min(1).max(100).optional(),
		tier: Ic.optional(),
		side: Bc.shape.side,
		fractured: N().optional(),
		crafted: N().optional(),
		count: Ic.default({ min: 1 })
	}),
	I({
		kind: B("stat"),
		id: V,
		scope: z([
			"explicit",
			"implicit",
			"total"
		]).default("total"),
		value: Ic
	})
]), Uc = I({
	type: z([
		"and",
		"or",
		"not",
		"count"
	]),
	filters: P(Hc).min(1).max(64),
	value: Ic.optional()
}).refine((e) => e.type !== "count" || e.value !== void 0, "Count groups need a count range."), Wc = I({
	kind: B("fractured-fossil-v1"),
	fractureId: V,
	crafted: N(),
	enchanted: N()
}), Gc = I({
	kind: B("scour-v1"),
	crafted: N(),
	enchanted: N()
}), Kc = I({ kind: B("influence-ready-v1") }), qc = L("kind", [
	Wc,
	Gc,
	Kc
]), Jc = I({
	format: B(1).default(1),
	game: Nc,
	groups: P(Uc).max(16).default([]),
	sourcePreparation: qc.optional()
}).refine((e) => e.groups.reduce((e, t) => e + t.filters.length, 0) <= 128, "A query may contain at most 128 conditions.");
// ../../packages/poe-item-query/src/normalize.ts
function Yc(e) {
	return e.rarity ?? {
		0: "Normal",
		1: "Magic",
		2: "Rare",
		3: "Unique",
		4: "Gem",
		5: "Currency",
		9: "Relic"
	}[e.frameType];
}
// ../../packages/poe-item-query/src/base-identity.ts
var Xc = I({
	id: A().min(1).max(500),
	baseType: A().min(1).max(500),
	implicits: P(P(A().min(1).max(5e3)).max(32)).min(1).max(256).optional()
}), Zc = I({
	stats: P(I({
		id: A(),
		min: M().int(),
		max: M().int(),
		scalable: N()
	})).max(32),
	descriptions: P(M().int().nonnegative()).max(32)
}), Qc = I({
	statDescriptions: P(I({
		ids: P(A()).max(32),
		rules: P(I({
			conditions: P(A()),
			text: A(),
			handlers: P(A())
		})).max(500)
	})).max(2e4),
	statLookups: R(A(), R(A(), A()))
}), $c = A().min(1).max(500), el = z([
	"shaper",
	"elder",
	"crusader",
	"redeemer",
	"hunter",
	"warlord"
]), tl = I({
	format: qs([
		B(1),
		B(2),
		B(3),
		B(4),
		B(5)
	]),
	identityFamilies: P(P($c).min(2).max(100)).max(1e3).optional(),
	unsupportedImplicitTexts: P(A().max(5e3)).max(1e3).optional(),
	translations: Qc.optional(),
	catalysts: P(I({
		name: A(),
		maximum: M().int().min(0).max(100)
	})).max(100).optional(),
	modifiers: P(I({
		id: $c,
		name: A(),
		side: z(["prefix", "suffix"]),
		groups: P($c),
		crafted: N(),
		requiredInfluence: el.optional(),
		text: A().max(5e3).nullable(),
		unsupported: N().optional(),
		scaling: Zc.nullable().optional(),
		catalysts: P(A()).max(100).optional()
	})).max(2e4),
	bases: P(I({
		baseType: $c,
		modifiers: P(I({
			id: $c,
			tier: M().int().nonnegative().optional()
		})).max(2e4).optional(),
		tiers: R($c, M().int().nonnegative()).optional(),
		catalystProperties: P(A()).max(100).optional(),
		fixedInfluences: I({
			values: P(el).min(1).max(6),
			texts: P(A().min(1).max(5e3)).min(1).max(32)
		}).optional(),
		unsupported: N().optional(),
		magnitude: I({
			prefix: M().int().min(0).max(1e3),
			suffix: M().int().min(0).max(1e3),
			texts: P(A()).max(32)
		}).optional()
	})).max(2e3)
}), nl = I({
	format: qs([
		B(1),
		B(2),
		B(3),
		B(4),
		B(5),
		B(6)
	]),
	bases: P(I({
		id: A().min(1).max(500),
		baseType: A().min(1).max(500),
		itemClass: z([
			"Body Armour",
			"Helmet",
			"Gloves",
			"Boots",
			"Shield"
		]),
		scourImplicits: I({
			ids: P(A().min(1).max(500)).max(8),
			texts: P(P(A().min(1).max(5e3)).max(32)).min(1).max(256)
		}).optional()
	})).max(2e3)
});
function rl(e) {
	return e.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1").trim().replace(/\s+/g, " ");
}
function il(e) {
	let t = e.intangibility;
	if (t !== void 0 && (typeof t != "number" || !Number.isInteger(t) || t < 0 || t > 100) || e.properties !== void 0 && !Array.isArray(e.properties)) return null;
	let n;
	for (let t of e.properties ?? []) {
		if (typeof t != "object" || !t || Array.isArray(t) || typeof t.name != "string" || t.type !== void 0 && !Number.isInteger(t.type)) return null;
		let e = rl(t.name) === "Intangibility";
		if (!e && t.type !== 110) continue;
		if (!e || t.type !== void 0 && t.type !== 110 || n !== void 0 || !Array.isArray(t.values) || t.values.length !== 1 || !Array.isArray(t.values[0]) || t.values[0].length !== 2 || typeof t.values[0][0] != "string" || !Number.isInteger(t.values[0][1])) return null;
		let r = /^(0|[1-9]\d?|100)%$/.exec(t.values[0][0].trim());
		if (!r) return null;
		n = Number(r[1]);
	}
	return t !== void 0 && n !== void 0 && t !== n ? null : n ?? t ?? 0;
}
// ../../packages/poe-item-query/src/match.ts
function al(e) {
	return e.includes("no-match") ? "no-match" : e.includes("unknown") ? "unknown" : "match";
}
function ol(e, t) {
	return e === void 0 ? "unknown" : e >= (t.min ?? -Infinity) && e <= (t.max ?? Infinity) ? "match" : "no-match";
}
function sl(e, t) {
	return e === void 0 ? "unknown" : t.includes(e) ? "match" : "no-match";
}
function cl(e, t, n = !1) {
	let r = e.filter((e) => e === "match").length, i = n ? Infinity : r + e.filter((e) => e === "unknown").length;
	return i < (t.min ?? 0) || r > (t.max ?? Infinity) ? "no-match" : r >= (t.min ?? 0) && i <= (t.max ?? Infinity) ? "match" : "unknown";
}
function ll(e, t) {
	let n = [];
	if (t.ids) {
		if (e.id !== void 0 || !e.possibleIds) n.push(sl(e.id, t.ids));
		else {
			let r = e.possibleIds.filter((e) => t.ids.includes(e)).length;
			n.push(r === e.possibleIds.length ? "match" : r === 0 ? "no-match" : "unknown");
		}
	}
	return t.names && n.push(sl(e.name, t.names)), t.tier && n.push(ol(e.tier, t.tier)), t.side && n.push(sl(e.side, [t.side])), t.fractured !== void 0 && n.push(sl(e.fractured, [t.fractured])), t.crafted !== void 0 && n.push(sl(e.crafted, [t.crafted])), al(n);
}
function ul(e, t) {
	if (e.item.identified !== !0 || t !== "prefix" && t !== "suffix") return !1;
	let n = t === "prefix" ? "prefixes" : "suffixes", r = e.facts[n], i = e.item.extended?.[n];
	if (r === void 0 || i !== void 0 && i !== r) return !1;
	let a = /* @__PURE__ */ new Set(), o = 0;
	for (let n of e.facts.modifiers) {
		if (n.side === void 0) return !1;
		if (n.id !== void 0) {
			if (a.has(n.id)) return !1;
			a.add(n.id);
		}
		if (n.side === t) {
			if (n.id === void 0 || n.possibleIds !== void 0) return !1;
			o++;
		}
	}
	return o === r;
}
function dl(e) {
	if (e === void 0) return [];
	if (!Array.isArray(e)) return null;
	let t = [];
	for (let n of e) {
		let e = typeof n == "string" ? n : typeof n == "object" && n && typeof n.description == "string" ? n.description : void 0;
		if (e === void 0) return null;
		t.push(...e.split("\n"));
	}
	return t;
}
function fl(e, t) {
	let { item: n, facts: r } = e;
	switch (t.kind) {
		case "base": return sl(t.field === "baseType" ? n.baseType : r[t.field], t.values);
		case "rarity": return sl(Yc(n), t.values);
		case "influence": return t.values.some((e) => n.influences?.[e] === !0) ? "match" : "no-match";
		case "enchant": {
			let e = dl(n.enchantMods);
			return e ? e.some((e) => t.values.includes(e)) ? "match" : "no-match" : "unknown";
		}
		case "flag": {
			let e;
			if (t.field === "destroyed") e = r.destroyed;
			else if (t.field === "mirrored") e = n.duplicated ?? !1;
			else if (t.field === "influenced") e = Object.values(n.influences ?? {}).some(Boolean);
			else if (t.field === "intangible") {
				let t = il(n);
				if (t === null) return "unknown";
				e = t > 0;
			} else e = t.field === "fractured" ? n.fractured === !0 || !!n.fracturedMods?.length || r.modifiers.some((e) => e.fractured) || (n.explicitMods ?? []).some((e) => typeof e != "string" && e.flags?.fractured === !0) : n[t.field] ?? (t.field === "identified" && void 0);
			return sl(e, [t.value]);
		}
		case "range": {
			let i;
			if (t.field === "ilvl") i = n.ilvl ?? n.itemLevel;
			else if (t.field === "sockets") i = r.socketCount ?? n.sockets?.length;
			else if (t.field === "links") {
				if (e.game === "poe2") return "unknown";
				if (r.linkedSockets) {
					let { min: e, max: n } = r.linkedSockets;
					return e > (t.value.max ?? Infinity) || n < (t.value.min ?? 0) ? "no-match" : e >= (t.value.min ?? 0) && n <= (t.value.max ?? Infinity) ? "match" : "unknown";
				}
				if (n.sockets) {
					let e = /* @__PURE__ */ new Map();
					for (let t of n.sockets) e.set(t.group, (e.get(t.group) ?? 0) + 1);
					i = Math.max(0, ...e.values());
				}
			} else t.field === "openPrefixes" ? r.prefixLimit !== void 0 && r.prefixes !== void 0 && (i = Math.max(0, r.prefixLimit - r.prefixes)) : t.field === "openSuffixes" ? r.suffixLimit !== void 0 && r.suffixes !== void 0 && (i = Math.max(0, r.suffixLimit - r.suffixes)) : i = r[t.field];
			return ol(i, t.value);
		}
		case "mod": return cl(r.modifiers.map((e) => ll(e, t)), t.count, !r.modifiersComplete && !ul(e, t.side));
		case "stat": return ol(r.stats[t.scope][t.id] ?? (r.statsComplete ? 0 : void 0), t.value);
	}
}
function pl(e, t) {
	let n = !1;
	for (let r of e) {
		let e = t(r);
		if (e === "no-match") return "no-match";
		e === "unknown" && (n = !0);
	}
	return n ? "unknown" : "match";
}
function ml(e, t) {
	if (t.type === "and") return pl(t.filters, (t) => fl(e, t));
	let n = t.filters.map((t) => fl(e, t));
	return t.type === "or" ? cl(n, { min: 1 }) : t.type === "not" ? cl(n, { max: 0 }) : cl(n, t.value);
}
function hl(e, t) {
	return e.game === t.game ? t.sourcePreparation ? "unknown" : pl(t.groups, (t) => ml(e, t)) : "no-match";
}
function gl(e) {
	return e.groups.reduce((e, t) => e + t.filters.length, 0);
}
I({
	minimumLevel: N().default(!0),
	rarity: N().default(!0),
	flags: N().default(!0),
	modifiers: N().default(!0),
	implicitModifiers: N().default(!1),
	openAffixes: N().default(!1),
	sockets: N().default(!1)
});
// ../../packages/poe-item-query/src/modifier-identity.ts
var _l = I({
	id: A().min(1).max(500),
	name: A().min(1).max(300),
	side: z(["prefix", "suffix"]),
	level: M().int().nonnegative(),
	text: A().max(5e3).nullable()
});
// app/lib/crafting-acquisition.ts
function vl(e, t) {
	if (new Set(e.map((e) => e.id)).size !== e.length) throw Error("Acquisition alternatives must have unique IDs.");
	if (new Set(e.map((e) => e.currency)).size > 1) throw Error("Convert acquisition estimates to the project's currency before comparing them.");
	let n;
	if (t.mode === "pinned") {
		if (n = e.find((e) => e.id === t.alternativeId), !n) throw Error("The pinned acquisition alternative no longer exists.");
	} else for (let t of e) t.expectedCost === null || t.missingPrices.length || (!n || t.expectedCost < n.expectedCost) && (n = t);
	return {
		choice: t,
		selectedId: n?.id ?? null,
		alternatives: [...e],
		incomplete: e.some((e) => e.expectedCost === null || e.missingPrices.length > 0)
	};
}
// app/lib/crafting-allflame.ts
var yl = /* @__PURE__ */ new Set([
	"reset_ghostliness_or_delete",
	"split_to_single_explicit",
	"reroll_rare_infamous",
	"add_deepwater_hazard_belt_mod",
	"add_pantheon_aspect",
	"reroll_single_attribute_modifier",
	"add_mod_and_corrupt_rare_abyss_jewel",
	"add_eldritch_implicit_amulet"
]);
function bl(e) {
	if (e.game !== "poe1") return [];
	let t = [
		"additional_strength",
		"additional_dexterity",
		"additional_intelligence"
	];
	return e.crafting.modEquivalencies.filter((n) => {
		let r = n.mods.map((t) => e.mods[t]);
		return r.length === t.length && t.every((e) => r.some((t) => t?.stats.length === 1 && t.stats[0].id === e)) && r.every((e) => e && ["prefix", "suffix"].includes(e.generation_type) && e.domain === r[0].domain && e.generation_type === r[0].generation_type);
	});
}
function xl(e, t, n) {
	if (e.game !== "poe1") return;
	let r = e.bases[t.baseId]?.item_class;
	if (r) {
		if (n === "reroll_rare_infamous") return { domain: "mercenary" };
		if (n === "add_deepwater_hazard_belt_mod" && r === "Belt") return {
			domain: "ducat_crafted",
			extraTags: ["deepwater_hazard_belt"]
		};
		if (n === "add_pantheon_aspect" && e.crafting.classes[r]?.aspects) return {
			domain: "ducat_crafted",
			extraTags: ["deepwater_pantheon_aspect"]
		};
	}
}
function Sl(e) {
	return "allflame" in e && e.allflame === !0;
}
function Cl(e, t) {
	let n = t.kind === "fossils" ? t.resonator : t.kind === "currency" || t.kind === "essence" ? t.id : void 0;
	return e.crafting.allflame?.currencies.filter((e) => e.currency === n).sort((e, t) => t.tier - e.tier)[0];
}
function wl(e, t, n) {
	let r = e.crafting.allflame, i = Cl(e, n), a = e.bases[t.baseId]?.item_class, o = r?.classes.find((e) => e.itemClass === a), s = r?.levels.find((e) => e.level === t.level);
	if (!r || !i || !o || !s) return null;
	let c = Math.round(i.sulphurCost * o.costPercent / 100 * (o.levelScaling ? 1 + s.costIncreasePercent / 100 : 1));
	return {
		bracket: i,
		sulphur: r.sulphur,
		amount: c
	};
}
// app/lib/crafting-base-identity.ts
var Tl = /* @__PURE__ */ new WeakMap();
function El(e, t) {
	let n = Tl.get(e) ?? /* @__PURE__ */ new Map();
	Tl.set(e, n);
	let r = `${t.baseId}:${t.rarity}`, i = n.get(r);
	if (i !== void 0) return i;
	let a = e.base(t), o = Object.entries(e.catalog.bases).some(([e, n]) => !e.includes("Royale") && n.corrupted === a.corrupted && n.rarities.includes(t.rarity) && n.name === a.name && JSON.stringify(n) !== JSON.stringify(a));
	return n.set(r, o), o;
}
// app/lib/crafting-heist.ts
var Dl = /* @__PURE__ */ new WeakMap();
function Ol(e, t) {
	if (!t.stats.some((e) => [
		"local_has_X_white_sockets",
		"local_all_sockets_are_red",
		"local_all_sockets_are_green",
		"local_all_sockets_are_blue"
	].includes(e.id))) {
		if (e.startsWith("WeaponEnchantmentHeist")) return "weapon";
		if (e.startsWith("ArmourEnchantmentHeist")) return "armour";
	}
}
function kl(e, t) {
	if (e.game !== "poe1") return [];
	let n = Dl.get(e);
	if (!n) {
		let t = [...new Set(Object.values(e.bases).filter((e) => e.tags.includes("weapon")).map((e) => e.item_class))];
		n = Object.entries(e.mods).flatMap(([e, n]) => {
			let r = Ol(e, n);
			return r ? [{
				mod: e,
				itemClasses: r === "weapon" ? t : ["Body Armour"],
				recipe: r === "weapon" ? "Tempering Orb" : "Tailoring Orb"
			}] : [];
		}), Dl.set(e, n);
	}
	return t ? n.filter((n) => n.itemClasses.includes(e.bases[t.baseId].item_class) && e.mods[n.mod].required_level <= t.level) : n;
}
function Al(e, t, n) {
	return (t.enchantments ?? []).reduce((t, r) => t + (e.mods[r.id]?.stats ?? []).reduce((e, t, i) => e + (t.id === n ? r.values[i] : 0), 0), 0);
}
function jl(e, t, n) {
	return e.game !== "poe1" || !["prefix", "suffix"].includes(n.generation_type) ? 0 : n.implicit_tags.reduce((n, r) => n + Al(e, t, `heist_enchantment_${r === "defences" ? "defence" : r === "caster_damage" ? "casterdamage" : r}_mod_effect_+%`), 0);
}
var Ml = /* @__PURE__ */ new WeakMap();
function Nl(e) {
	let t = Ml.get(e);
	if (t) return t;
	let n = e.game === "poe2" ? Object.fromEntries([...Object.entries(e.crafting.anointing.passives).filter(([, e]) => e.notable), ...Object.entries(e.crafting.passiveTree?.notables ?? {}).filter(([, e]) => !e.ascendancy && !e.visibleForAscendancy)]) : {};
	return Ml.set(e, n), n;
}
function Pl(e, t) {
	let n = Nl(e)[t];
	if (!n) throw Error("Unknown allocated notable passive in this build.");
	return n;
}
function Fl(e, t) {
	if (e.game !== "poe2") return;
	let n = e.bases[t.baseId]?.item_class;
	return e.crafting.poe2Essences.flatMap((e) => e.rules).find((t) => t.itemClasses.includes(n) && t.mod && e.mods[t.mod]?.stats.some((e) => e.id === "mod_granted_passive_hash_essence"))?.mod ?? void 0;
}
// app/lib/crafting-sockets.ts
var Il = /* @__PURE__ */ new Map([
	["local_item_benefit_socketable_as_if_helmet", "Helmet"],
	["local_item_benefit_socketable_as_if_body_armour", "Body Armour"],
	["local_item_benefit_socketable_as_if_gloves", "Gloves"],
	["local_item_benefit_socketable_as_if_boots", "Boots"],
	["local_item_benefit_socketable_as_if_shield", "Shield"]
]);
function Ll(e, t) {
	if (e.game !== "poe2" || t.jewelSocket) return 0;
	let n = e.bases[t.baseId];
	return Math.max(n.initialSockets, ...n.implicits.flatMap((t) => e.mods[t].stats.filter((e) => e.id === "local_has_X_sockets").map((e) => e.min)));
}
function Rl(e, t) {
	let n = e.bases[t.baseId], r = n.item_class, i = [
		...n.initialSockets ? n.implicits.map((t) => ({
			id: t,
			values: e.mods[t].stats.map((e) => e.min)
		})) : [],
		...t.implicits,
		...t.mods
	];
	for (let t of i) for (let [n, i] of (e.mods[t.id]?.stats ?? []).entries()) t.values[n] && Il.has(i.id) && (r = Il.get(i.id));
	return r;
}
function zl(e, t) {
	return e.game === "poe1" && [...t.implicits, ...t.mods].some((t) => e.mods[t.id].stats.some((e, n) => e.id === "local_has_X_abyss_sockets" && t.values[n] > 0));
}
function Bl(e, t, n = 100) {
	if (t.jewelSocket) return 0;
	let r = e.bases[t.baseId].socketInfo.filter((e) => e.weight > 0), i = Ll(e, t), a = Math.max(i, ...r.map((e) => e.count)), o = Math.max(i, ...r.filter((e) => e.level <= n).map((e) => e.count));
	return Math.max(0, Math.min(o, a + Al(e, t, "local_maximum_sockets_+")));
}
function Vl(e, t) {
	let n = Bl(e, t);
	if (e.game !== "poe2") return n;
	let r = e.bases[t.baseId];
	return Math.min(r.inventory_width * r.inventory_height, n + (n > 0 && t.corrupted ? 1 : 0));
}
function Hl(e, t, n) {
	return !!(e.game === "poe1" && !zl(e, t) && (n.socketCount || n.linkCount) && n.itemClasses.includes(e.bases[t.baseId].item_class) && (n.socketCount ? n.socketCount <= Bl(e, t) : n.linkCount <= (t.sockets ?? 0)));
}
function Ul(e, t) {
	if (t.socketLinks && (e.game !== "poe1" || zl(e, t) || t.socketLinks.length !== (t.sockets ?? 0) - 1)) throw Error("Socket links require one connection per adjacent pair of ordinary PoE 1 gem sockets.");
}
function Wl(e) {
	let t = (t) => {
		let n = +((e.sockets ?? 0) > 0), r = n;
		for (let i = 0; i < (e.sockets ?? 0) - 1; i++) n = e.socketLinks?.[i] ?? t ? n + 1 : 1, r = Math.max(r, n);
		return r;
	};
	return {
		min: t(!1),
		max: t(!0)
	};
}
function Gl(e, t) {
	if (!t.linkedSockets) return !0;
	let n = Wl(e), r = t.linkedSockets;
	if (n.min >= r.min && n.max <= r.max) return !0;
	if (n.max < r.min || n.min > r.max) return !1;
	throw Error("Socket links are not fully known. Set the starting links or use a craft that guarantees this requirement; remaining-link probabilities are unavailable.");
}
function Kl(e, t) {
	e.sockets = t, delete e.socketLinks;
}
function ql(e, t) {
	e.socketLinks = Array.from({ length: e.sockets - 1 }, (e, n) => n < t - 1 || n !== t - 1 && null);
}
// app/lib/crafting-augments.ts
function U(e, t) {
	let n = e.crafting.augments.find((e) => e.id === t);
	if (!n || e.game !== "poe2") throw Error("Unknown socketable augment.");
	return n;
}
function Jl(e) {
	return e.rules.some((e) => e.stats.length > 0) && !e.rules.some((e) => e.stats.some((e) => /^dummy_display_stat_rune_(?!(?:(?:fire|cold|lightning|chaos)_convert|create_jewel_socket)$)/.test(e.id)));
}
function Yl(e, t, n) {
	let r = e.bases[t.baseId];
	if (!r || e.game !== "poe2" || [
		"Ring",
		"Amulet",
		"Belt"
	].includes(r.item_class) && !n.jewellery) return;
	let i = Rl(e, t), a = {
		classes: 0,
		martial: 1,
		armour: 2,
		all: 3
	};
	return n.rules.filter((e) => e.stats.length && e.itemClasses.includes(i)).sort((e, t) => a[e.scope] - a[t.scope])[0];
}
function Xl(e, t) {
	return Bl(e, t) ? e.crafting.augments.filter((n) => Jl(n) && Yl(e, t, n)?.stats.length) : [];
}
function Zl(e) {
	return e.rules.some((e) => e.stats.some((e) => e.id === "dummy_display_stat_rune_upgrade" && e.min > 0));
}
function Ql(e) {
	return e.rules.some((e) => e.stats.some((e) => e.id === "dummy_display_stat_rune_create_jewel_socket" && e.min > 0));
}
function $l(e, t, n, r) {
	let i = U(e, n);
	if (!Zl(i) || !Yl(e, t, i)) throw Error("This augment cannot upgrade Runes on this item.");
	if ((t.corrupted || t.sanctified) && !i.corruptedSanctified) throw Error("This augment cannot be used on a corrupted or Sanctified item.");
	let a = t.augments?.[r];
	if (!a) throw Error("Choose an occupied Rune socket to upgrade.");
	let o = U(e, a);
	if (o.type.socketedStat !== "num_socketed_runes" || !o.higherTier) throw Error("This socketed augment has no higher Rune tier in this build.");
	return tu(e, t, o.higherTier, r);
}
function eu(e, t) {
	if (t.jewelSocket) {
		let n = U(e, t.jewelSocket);
		if (!Ql(n) || !Yl(e, t, n)) throw Error("This item has no valid extracted Jewel socket conversion.");
		if (t.sockets || t.augments?.length) throw Error("A converted Jewel socket cannot coexist with augment sockets.");
	}
	if ((t.augments?.length ?? 0) > (t.sockets ?? 0)) throw Error("Socketed augments exceed the item's socket count.");
	for (let n of t.augments ?? []) {
		let r = U(e, n);
		if (!Jl(r)) throw Error("This augment has a special crafting effect that is not supported yet.");
		if (Ql(r)) throw Error("This augment creates a Jewel socket and cannot remain socketed.");
		if (!Yl(e, t, r)?.stats.length) throw Error("This augment has no effect for this item class.");
		if (r.limit && t.augments.filter((t) => r.limit.text ? U(e, t).limit?.id === r.limit.id : t === r.id).length > r.limit.amount) throw Error(`${r.name} exceeds its extracted augment limit of ${r.limit.amount}.`);
	}
}
function tu(e, t, n, r) {
	let i = U(e, n);
	if ((t.corrupted || t.sanctified) && !i.corruptedSanctified) throw Error("This augment cannot be socketed into a corrupted or Sanctified item.");
	if (t.jewelSocket) throw Error("A converted Jewel socket cannot receive augments or become augment sockets.");
	if (!Yl(e, t, i)?.stats.length) throw Error("This augment has no effect for this item class.");
	if (Ql(i) && t.augments?.some((t) => U(e, t).socketBound)) throw Error("A Jewel socket conversion cannot destroy socket-bound augments.");
	let a = [...t.augments ?? []];
	if (r !== void 0) {
		let t = a[r];
		if (!t) throw Error("Choose an occupied augment socket to replace.");
		if (U(e, t).socketBound) throw Error("A socket-bound augment cannot be replaced.");
		a[r] = n;
	} else {
		if (a.length >= (t.sockets ?? 0)) throw Error("Add an empty augment socket or choose an augment to replace.");
		a.push(n);
	}
	let o = Ql(i) ? {
		...t,
		sockets: 0,
		augments: [],
		jewelSocket: i.id
	} : {
		...t,
		augments: a
	};
	return eu(e, o), o;
}
function nu(e, t, n) {
	return n.type.socketedStat === "num_socketed_idols" && (t.augments ?? []).some((n) => Yl(e, t, U(e, n))?.stats.some((e) => e.id === "local_idols_gain_additional_socketable_mods" && e.min > 0));
}
function ru(e, t, n, r) {
	let i = [...t.mods, ...t.implicits].reduce((t, r) => t + (e.mods[r.id]?.stats ?? []).reduce((e, t, i) => e + (t.id === n.type.effectStat || t.id === "local_socketed_items_effect_+%" ? Math.round(r.values[i] * (r.sanctification ?? r.corruptionScale ?? 100) / 100) : 0), 0), 0), a = (t.augments ?? []).reduce((r, i) => r + (Yl(e, t, U(e, i))?.stats ?? []).reduce((e, t) => e + (t.id === n.type.effectStat || t.id === "local_socketed_items_effect_+%" ? t.min : 0), 0), 0);
	return new Map(r.map((t) => [t.id, e.crafting.scalableStats.includes(t.id) ? Math.trunc(t.min * (100 + i + a) / 100) : t.min]));
}
function iu(e, t, n) {
	let r = U(e, n), i = Yl(e, t, r);
	if (!i) return /* @__PURE__ */ new Map();
	let a = ru(e, t, r, i.stats);
	if (nu(e, t, r)) for (let [n, o] of ru(e, t, r, i.bondedStats)) a.set(n, (a.get(n) ?? 0) + o);
	return a;
}
function au(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of t.augments ?? []) {
		for (let [i, a] of iu(e, t, r)) n.set(i, (n.get(i) ?? 0) + a);
		let i = U(e, r).type.socketedStat;
		n.set(i, (n.get(i) ?? 0) + 1);
	}
	return n;
}
function ou(e, t) {
	return [...au(e, t)].flatMap(([t, n]) => n > 0 && e.crafting.augmentTags[t] ? [e.crafting.augmentTags[t]] : []);
}
// app/lib/crafting-quality.ts
function su(e, t) {
	let n = e.bases[t.baseId].item_class;
	return e.crafting.catalysts.filter((e) => e.itemClasses.includes(n));
}
function cu(e, t) {
	let n = e.bases[t.baseId].item_class;
	return e.crafting.baseQuality.filter((t) => t.itemClasses.includes(n) && (e.game === "poe1" || !t.corrupted));
}
function lu(e, t) {
	if (e.game !== "poe1") return [];
	let n = e.bases[t.baseId].item_class;
	return e.crafting.mapQuality.filter((e) => e.itemClasses.includes(n));
}
function uu(e, t) {
	return lu(e, t).find((e) => t.mapQuality ? e.id === t.mapQuality : e.stats.includes("map_item_drop_quantity_+%"));
}
function du(e) {
	return e.rarity === "normal" ? 5 : e.rarity === "magic" ? 2 : 1;
}
function fu(e, t, n) {
	let r = e.crafting.baseQuality.find((e) => e.id === n);
	return r.corrupted ? Array.from({ length: r.maximumQuality + 1 }, (e, t) => ({
		value: t,
		weight: 1
	})) : xu(e, t, r.maximumQuality);
}
function pu(e, t) {
	let n = cu(e, t).find((e) => !e.corrupted)?.maximumQuality ?? 0;
	if (e.game !== "poe2") return n;
	let r = 0;
	for (let i of t.augments ?? []) {
		let a = iu(e, t, i);
		n = a.get("local_maximum_quality_is_%") ?? n, r += a.get("local_maximum_quality_+") ?? 0;
	}
	return n + r;
}
function mu(e, t) {
	if (e.game === "poe1") return t.corrupted && e.bases[t.baseId].domain === "flask" ? 40 : 30;
	let n = hu(e, t).find((e) => e.qualityType === "base")?.extraMaximumQuality ?? 0, r = Math.max(30, pu(e, t) + n), i = e.bases[t.baseId].item_class;
	for (let a of e.crafting.augments) {
		if (!Yl(e, t, a)?.stats.some((e) => e.id === "local_maximum_quality_is_%")) continue;
		let o = {
			...t,
			augments: [a.id]
		};
		r = Math.max(r, pu(e, o) + n);
		for (let s of e.crafting.poe2Essences) for (let c of s.rules) {
			if (!c.mod || !c.itemClasses.includes(i)) continue;
			let s = e.mods[c.mod];
			s.stats.some((e) => e.id === a.type.effectStat || e.id === "local_socketed_items_effect_+%") && (r = Math.max(r, pu(e, {
				...o,
				mods: [...t.mods.filter((t) => !e.mods[t.id].groups.some((e) => s.groups.includes(e))), {
					id: c.mod,
					values: s.stats.map((e) => e.max),
					crafted: !0,
					fractured: !1
				}]
			}) + n));
		}
	}
	return r;
}
function hu(e, t) {
	if (e.game !== "poe2") return [];
	let n = e.bases[t.baseId].item_class;
	return e.crafting.qualityInfusers.filter((e) => e.itemClasses.includes(n));
}
function gu(e, t, n) {
	let r = hu(e, t).find((e) => e.id === n);
	if (!r) return;
	let i = r.qualityType === "catalyst" ? su(e, t)[0].maximumQuality : cu(e, t).find((e) => !e.corrupted).maximumQuality, a = r.qualityType === "catalyst" ? _u(e, t) : pu(e, t), o = r.qualityType === "catalyst" ? t.catalyst?.quality ?? 0 : t.quality;
	return {
		recipe: r,
		quality: o,
		maximum: a,
		limit: a + r.extraMaximumQuality,
		increments: xu(e, t, i),
		corruptionChance: Math.min(100, Math.max(0, 5 * (o - a)))
	};
}
function _u(e, t) {
	let n = su(e, t)[0]?.maximumQuality ?? 0, r = 0;
	for (let i of [...t.implicits, ...t.mods]) for (let [t, a] of e.mods[i.id].stats.entries()) {
		let e = Math.round(i.values[t] * (i.sanctification ?? i.corruptionScale ?? 100) / 100);
		a.id === "local_maximum_quality_is_%" && (n = e), a.id === "local_maximum_quality_+" && (r += e);
	}
	return n + r;
}
function vu(e, t) {
	return xu(e, t, e.crafting.catalysts[0]?.maximumQuality ?? 0);
}
function yu(e, t, n) {
	if (e.game !== "poe1") return [];
	let r = e.crafting.taintedCatalysts.find((e) => e.id === n);
	return r?.itemClasses.includes(e.bases[t.baseId].item_class) ? su(e, t).flatMap((e) => Array.from({ length: r.maximumQuality }, (t, n) => ({
		value: {
			id: e.id,
			quality: n + 1
		},
		weight: 1
	}))) : [];
}
function bu(e, t) {
	if (e.game !== "poe2" || !t.catalyst?.quality) return 1;
	let n = e.crafting.catalysts.find((e) => e.id === t.catalyst.id).maximumQuality, r = t.catalyst.quality;
	return 1 + (20 * Math.min(r, n) + 12 * Math.max(0, r - n)) / 100;
}
function xu(e, t, n) {
	let r = Math.round(Math.max(1, Math.min(30 * Math.exp(-t.level / 30) - .3, n)));
	return e.game === "poe2" && r === 1 ? [{
		value: 1,
		weight: 4
	}, {
		value: 2,
		weight: 1
	}] : [{
		value: r,
		weight: 1
	}];
}
function Su(e, t) {
	if (e.game !== "poe2") return _u(e, t);
	let n = {
		...t,
		implicits: [...t.implicits, ...e.bases[t.baseId].implicits.filter((n) => !t.implicits.some((e) => e.id === n) && e.mods[n].stats.some((e) => ["local_maximum_quality_+", "local_maximum_quality_is_%"].includes(e.id))).map((t) => ({
			id: t,
			values: e.mods[t].stats.map((e) => e.max),
			crafted: !1,
			fractured: !1
		}))]
	}, r = _u(e, n), i = e.bases[t.baseId].item_class, a = e.crafting.poe2Essences.flatMap((r) => r.rules.flatMap((r) => {
		if (!r.mod || !r.itemClasses.includes(i)) return [];
		let a = e.mods[r.mod];
		return a.stats.some((e) => e.id === "local_maximum_quality_+") ? _u(e, {
			...n,
			mods: [...t.mods.filter((t) => !e.mods[t.id].groups.some((e) => a.groups.includes(e))), {
				id: r.mod,
				values: a.stats.map((e) => e.max),
				crafted: !0,
				fractured: !1
			}]
		}) : [];
	})), o = hu(e, t).find((e) => e.qualityType === "catalyst");
	return Math.max(r, ...a) + (o?.extraMaximumQuality ?? 0);
}
function Cu(e, t, n) {
	if (!t.catalyst) return 0;
	let r = e.crafting.catalysts.find((e) => e.id === t.catalyst.id), i = e.mods[n];
	return !r || (["prefix", "suffix"].includes(i.generation_type) ? !r.explicit : !r.implicit) || (r.prefix || r.suffix) && (i.generation_type === "prefix" ? !r.prefix : !r.suffix) || r.tags.length && !r.tags.some((e) => i.implicit_tags.includes(e)) ? 0 : t.catalyst.quality;
}
// app/lib/crafting-text.ts
function wu(e) {
	return e.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
}
var Tu = {
	prefix: [
		"local_explicit_mod_effect_+%",
		"local_prefix_mod_effect_+%",
		"local_non_unique_item_explicit_prefix_mod_magnitudes_+%"
	],
	suffix: [
		"local_explicit_mod_effect_+%",
		"local_suffix_mod_effect_+%",
		"local_non_unique_item_explicit_suffix_mod_magnitudes_+%"
	]
};
function Eu(e, t, n) {
	let r = e.mods[n], i = Cu(e, t, n), a = r.generation_type, o = a === "prefix" || a === "suffix", s = /* @__PURE__ */ new Set([...o ? Tu[a] : [], ...e.crafting.taggedModifierEffects.filter((e) => (o ? e.explicit : e.implicit) && (!(e.prefix || e.suffix) || (a === "prefix" ? e.prefix : e.suffix)) && e.tags.some((e) => r.implicit_tags.includes(e))).map((e) => e.stat)]);
	return i + jl(e, t, r) + [...t.implicits, ...t.mods].reduce((t, n) => t + e.mods[n.id].stats.reduce((e, t, r) => e + (s.has(t.id) ? Math.round(n.values[r] * (n.sanctification ?? n.corruptionScale ?? 100) / 100) : 0), 0), 0);
}
function Du(e, t, n) {
	let r = n ? Eu(e, n, t.id) : 0;
	return e.mods[t.id].stats.map((n, i) => {
		let a = Math.round(t.values[i] * (t.sanctification ?? t.corruptionScale ?? 100) / 100);
		return r && e.crafting.scalableStats.includes(n.id) ? Math.trunc(a * (100 + r) / 100) : a;
	});
}
// app/lib/crafting-clusters.ts
function Ou(e, t) {
	return e.game === "poe1" ? e.crafting.clusterJewels?.bases[t.baseId] : void 0;
}
function ku(e, t) {
	let n = Ou(e, t);
	return Object.entries(e.crafting.clusterJewels?.skills ?? {}).filter(([, e]) => n && e.size === n.size).map(([e, t]) => ({
		id: e,
		...t
	}));
}
function Au(e, t) {
	return t.cluster ? e.crafting.clusterJewels?.skills[t.cluster.passive] : void 0;
}
function ju(e, t) {
	let n = Au(e, t);
	return n ? [n.tag] : [];
}
function Mu(e, t) {
	let n = Ou(e, t);
	if (!n) {
		if (t.cluster) throw Error("Cluster passive state requires a PoE 1 Cluster Jewel.");
		return;
	}
	let r = Au(e, t);
	if (!r || r.size !== n.size) throw Error("Choose an extracted passive type for this Cluster Jewel size.");
	let i = t.cluster.nodes;
	if (i !== void 0 && (i < n.minNodes || i > n.maxNodes)) throw Error(`This Cluster Jewel requires ${n.minNodes}–${n.maxNodes} passive skills.`);
	if ((t.cluster.jewelSockets ?? 0) > Math.min(i ?? n.maxNodes, n.socketIndices.length)) throw Error("The Cluster Jewel socket count exceeds its extracted layout capacity.");
	for (let [n, i] of t.mods.entries()) {
		let a = e.mods[i.id], o = /* @__PURE__ */ new Set([
			...e.bases[t.baseId].tags,
			r.tag,
			...t.mods.flatMap((t, r) => r === n ? [] : e.mods[t.id]?.adds_tags ?? [])
		]);
		if (a?.generation_weights.find((e) => o.has(e.tag))?.weight === 0) throw Error("Cluster Jewel modifiers conflict with the extracted generation restrictions.");
	}
}
// app/lib/crafting-memory.ts
function Nu(e, t) {
	let n = e.bases[t.baseId];
	return !!(e.game === "poe1" && e.crafting.memoryMaps && n?.domain === "area" && n.item_class === "Map");
}
var Pu = [
	135,
	170,
	196,
	203,
	218,
	208,
	202,
	177,
	176,
	141,
	116,
	100,
	78,
	43,
	40,
	25,
	19,
	5,
	3
].flatMap((e, t) => {
	let n = 10 + t * 5, r = Math.min(5, 101 - n);
	return Array.from({ length: r }, (t, i) => ({
		value: n + i,
		weight: e / r
	}));
});
function Fu(e, t, n) {
	if (e.game !== "poe1" || n.kind !== "currency" && n.kind !== "essence") return;
	let r = e.crafting.currencies.find((e) => e.id === n.id)?.action, i = r && e.crafting.memoryStrandCosts[r];
	if (!i) return;
	let a = 2 * i, o = [
		"add_mod_to_rare",
		"add_mod_to_rare_eldritch",
		"add_influence_mod_to_rare",
		"mutated_add_mod_to_rare"
	].includes(r);
	return o && (a += (r === "mutated_add_mod_to_rare" ? [
		18,
		18,
		24,
		28,
		32,
		34
	] : [
		0,
		0,
		6,
		10,
		16,
		18
	])[Math.min(t.mods.length, 5)]), {
		maximum: a,
		exalt: o
	};
}
function Iu(e, t) {
	let n = Array.from({ length: Math.min(e, t + 1) }, (t, n) => ({
		value: e - n,
		weight: 1
	}));
	return t >= e && n.push({
		value: 0,
		weight: t - e + 1
	}), n;
}
function Lu(e, t) {
	let n = e.bases[t.baseId];
	return e.game === "poe1" && n?.domain === "item" && n.tags.some((e) => [
		"weapon",
		"armour",
		"ring",
		"amulet",
		"belt",
		"quiver"
	].includes(e));
}
function Ru(e, t, n = !1) {
	if (!t && !n) return e;
	let r = t > 0 ? 5 * t + 295 + (n ? 150 : 0) : 350;
	return Math.floor(200 * (e - 1) / r) + 1;
}
function zu(e) {
	return JSON.stringify([
		e.domain,
		e.generation_type,
		e.type,
		[...e.groups].sort()
	]);
}
function Bu(e, t, n = !1) {
	if (!t && !n) return e;
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = zu(t.mod), n = r.get(e) ?? /* @__PURE__ */ new Set();
		n.add(t.mod.required_level), r.set(e, n);
	}
	let i = new Map([...r].map(([e, r]) => {
		let i = [...r].sort((e, t) => t - e);
		return [e, i[Ru(i.length, t, n) - 1]];
	}));
	return e.filter((e) => e.mod.required_level >= i.get(zu(e.mod)));
}
function Vu(e, t, n) {
	let r = zu(e.mod), i = t.filter((t) => zu(t.mod) === r && t.mod.required_level > e.mod.required_level).sort((e, t) => t.mod.required_level - e.mod.required_level), a = t.reduce((t, n) => t + (n.mod.generation_type === e.mod.generation_type ? n.weight : 0), 0), o = i.reduce((e, t) => e + t.weight, 0);
	if (!o || !a || !n) return [{
		value: e.id,
		weight: 1
	}];
	let s = Math.min(1, n * o / (2 * a)), c = i.map((e) => ({
		value: e.id,
		weight: i.reduce((t, n) => t + (n.mod.required_level >= e.mod.required_level ? n.weight : 0), 0)
	})), l = c.reduce((e, t) => e + t.weight, 0), u = c.map((e) => ({
		value: e.value,
		weight: s * e.weight / l
	}));
	return s < 1 && u.push({
		value: e.id,
		weight: 1 - s
	}), u;
}
// app/lib/crafting-modifier-details.ts
function Hu(e, t, n = "ordinary", r) {
	let i = e.createItem(t), a = e.base(i), o = e.catalog, s = new Set((n === "essence" ? ["essence"] : [
		"bench",
		"aspect",
		"emotion"
	]).flatMap((t) => e.recipePool(i, t).map((e) => e.id))), c = /* @__PURE__ */ new Set([
		...a.tags,
		...ju(o, { cluster: r ?? i.cluster }),
		...a.implicits.flatMap((t) => e.mod(t).adds_tags)
	]), l = /* @__PURE__ */ new Map();
	for (let [e, t] of Object.entries(o.mods)) {
		let r = o.crafting.modRules[e];
		if (!["prefix", "suffix"].includes(t.generation_type) || t.domain === "veiled" || n === "essence" && !s.has(e) || r?.gameMode === 2 || o.game === "poe1" && e.includes("Royale") || r?.itemClasses.length && !r.itemClasses.includes(a.item_class)) continue;
		if (!s.has(e)) {
			if (t.is_essence_only || ![
				a.domain,
				"delve",
				"unveiled",
				"desecrated",
				"mercenary",
				"ducat_crafted"
			].includes(t.domain)) continue;
			let e = /* @__PURE__ */ new Set([...c, ...o.crafting.influences.filter((e) => e.itemClass === a.item_class && e.influence === r?.influence).map((e) => e.tag)]);
			if ((t.spawn_weights.find((t) => e.has(t.tag))?.weight ?? 0) <= 0) continue;
		}
		let i = JSON.stringify([
			zu(t),
			r?.influence ?? null,
			t.stats.map((e) => e.id)
		]), u = l.get(i) ?? [], d = t.stats.reduce((e, t) => e + Math.abs(t.min) + Math.abs(t.max), 0) + (o.crafting.grantedEffects?.[e] ?? []).reduce((e, t) => e + t.level, 0);
		u.push({
			id: e,
			mod: t,
			power: d
		}), l.set(i, u);
	}
	let u = /* @__PURE__ */ new Map();
	for (let e of l.values()) {
		e.sort((e, t) => t.mod.required_level - e.mod.required_level || t.power - e.power);
		let t = 0, n;
		for (let r of e) n && r.mod.required_level === n.mod.required_level && r.power === n.power || t++, u.set(r.id, t), n = r;
	}
	return u;
}
// app/lib/crafting-item-query.ts
var Uu = [
	"shaper",
	"elder",
	"crusader",
	"redeemer",
	"hunter",
	"warlord"
], Wu = {
	normal: "Normal",
	magic: "Magic",
	rare: "Rare"
};
function Gu(e) {
	let t = /* @__PURE__ */ new Map();
	function n(n) {
		let r = e.base(n), i = e.limits(n), a = e.counts(n), o = JSON.stringify([n.baseId, n.cluster]), s = t.get(o);
		s || (s = {
			ordinary: Hu(e, n.baseId, "ordinary", n.cluster),
			essence: Hu(e, n.baseId, "essence", n.cluster)
		}, t.set(o, s));
		let c = (t, n = !1) => {
			let r = e.mod(t.id);
			return {
				id: t.id,
				name: r.name,
				side: n ? "implicit" : r.generation_type === "prefix" ? "prefix" : "suffix",
				tier: n ? void 0 : s[t.essence ? "essence" : "ordinary"].get(t.id),
				fractured: t.fractured,
				crafted: t.crafted
			};
		}, l = !n.unidentified;
		return {
			game: e.catalog.game,
			source: "craft",
			item: {
				baseType: r.name,
				typeLine: r.name,
				ilvl: n.level,
				rarity: Wu[n.rarity],
				identified: l,
				corrupted: n.corrupted,
				duplicated: n.mirrored,
				fractured: n.mods.some((e) => e.fractured),
				synthesised: n.implicits.some((t) => e.mod(t.id).generation_type.startsWith("synthesis")),
				split: !!n.split,
				sanctified: !!n.sanctified,
				influences: Object.fromEntries(e.effectiveInfluences(n).map((e) => [Uu[e], !0]))
			},
			facts: {
				baseId: n.baseId,
				...El(e, n) ? { baseTypeAmbiguous: !0 } : {},
				itemClass: r.item_class,
				quality: n.quality,
				qualityType: uu(e.catalog, n)?.id ?? "base",
				catalystId: n.catalyst?.id ?? "none",
				catalystQuality: n.catalyst?.quality ?? 0,
				modifiers: l ? [...n.mods.map((e) => c(e)), ...n.implicits.map((e) => c(e, !0))] : [],
				modifiersComplete: l && !n.reveal,
				prefixes: a.prefixes,
				suffixes: a.suffixes,
				memoryStrands: n.memoryStrands ?? 0,
				memoryStrandsSpent: n.imprint ? Math.max(0, (n.imprint.memoryStrands ?? 0) - (n.memoryStrands ?? 0)) : void 0,
				prefixLimit: i.prefixes,
				suffixLimit: i.suffixes,
				socketCount: n.sockets ?? 0,
				linkedSockets: e.catalog.game === "poe1" ? Wl(n) : void 0,
				stats: l ? {
					explicit: Object.fromEntries(e.statTotals(n, "explicit")),
					implicit: Object.fromEntries(e.statTotals(n, "implicit")),
					total: Object.fromEntries(e.statTotals(n, "all"))
				} : {
					explicit: {},
					implicit: {},
					total: {}
				},
				statsComplete: l && !n.reveal,
				destroyed: !!n.destroyed
			}
		};
	}
	return {
		record: n,
		matches: (e, t) => hl(n(e), t)
	};
}
// app/lib/crafting-node-prices.ts
function Ku(e, t) {
	return `node:${encodeURIComponent(e)}:${encodeURIComponent(t)}`;
}
function qu(e, t, n) {
	return e[Ku(t, n)] ?? e[n] ?? null;
}
// app/lib/crafting-source-preparation.ts
var Ju = /* @__PURE__ */ new Set([
	"Metadata/Items/Armours/Boots/BootsAtlas1",
	"Metadata/Items/Armours/BodyArmours/BodyDex16",
	"Metadata/Items/Armours/BodyArmours/BodyInt17"
]), Yu = /* @__PURE__ */ new Set([
	"Metadata/Items/Armours/Shields/ShieldStr17",
	"Metadata/Items/Armours/Shields/ShieldInt16",
	"Metadata/Items/Armours/Shields/ShieldStrE3"
]);
function Xu(e) {
	if (!e.sourcePreparation) return;
	if (e.sourcePreparation.kind !== "fractured-fossil-v1") return qc.parse(e.sourcePreparation);
	let { fossils: t, ...n } = e.sourcePreparation;
	return qc.parse(n);
}
function Zu(e, t, n) {
	if (t) {
		if (t.kind === "influence-ready-v1") {
			if (![
				"crafting-graph-15",
				"crafting-graph-16",
				"crafting-graph-17",
				"crafting-graph-18",
				"crafting-graph-19",
				"crafting-graph-20"
			].includes(e) || !Yu.has(n) || n === "Metadata/Items/Armours/Shields/ShieldStrE3" && ![
				"crafting-graph-16",
				"crafting-graph-17",
				"crafting-graph-18",
				"crafting-graph-19",
				"crafting-graph-20"
			].includes(e)) throw Error("Influence-ready shield sources require crafting engine 15, 16 or 17; Heat-attuned sources require engine 16 or 17.");
		} else if (t.kind === "scour-v1") {
			if (n === "Metadata/Items/Armours/BodyArmours/BodyInt17" && ![
				"crafting-graph-16",
				"crafting-graph-17",
				"crafting-graph-18",
				"crafting-graph-19",
				"crafting-graph-20"
			].includes(e)) throw Error("Scouring Vaal Regalia sources requires crafting engine 16 or 17.");
			if (![
				"crafting-graph-12",
				"crafting-graph-13",
				"crafting-graph-14",
				"crafting-graph-15",
				"crafting-graph-16",
				"crafting-graph-17",
				"crafting-graph-18",
				"crafting-graph-19",
				"crafting-graph-20"
			].includes(e)) throw Error("Scouring source preparation requires crafting engine 12, 13, 14, 15, 16 or 17.");
			if (Ju.has(n) && ![
				"crafting-graph-13",
				"crafting-graph-14",
				"crafting-graph-15",
				"crafting-graph-16",
				"crafting-graph-17",
				"crafting-graph-18",
				"crafting-graph-19",
				"crafting-graph-20"
			].includes(e)) throw Error("Scouring these boots or body armour requires crafting engine 13, 14, 15, 16 or 17.");
		} else if (![
			"crafting-graph-11",
			"crafting-graph-12",
			"crafting-graph-13",
			"crafting-graph-14",
			"crafting-graph-15",
			"crafting-graph-16",
			"crafting-graph-17",
			"crafting-graph-18",
			"crafting-graph-19",
			"crafting-graph-20"
		].includes(e)) throw Error("Source preparation requires crafting engine 11, 12, 13, 14, 15, 16 or 17.");
	}
}
var Qu = 1;
function $u(e, t) {
	let n = e.catalog.crafting.bench.find((e) => e.action === t && !e.mod && !e.enchantment);
	if (!n) throw Error(`This catalog has no bench recipe for action ${t}.`);
	return n.id;
}
function ed(e, t) {
	return e.kind === "influence-ready-v1" ? [] : [
		...e.crafted ? [{
			kind: "bench",
			id: t(0)
		}] : [],
		...e.enchanted ? [{
			kind: "bench",
			id: t(Qu)
		}] : [],
		...e.kind === "scour-v1" ? [{
			kind: "currency",
			id: "Metadata/Items/Currency/CurrencyConvertToNormal"
		}] : [
			e.fossils,
			{
				kind: "currency",
				id: "Metadata/Items/Currency/CurrencyEldritchIchor1"
			},
			{
				kind: "currency",
				id: "Metadata/Items/Currency/CurrencyEldritchEmber2"
			}
		]
	];
}
function td(e, t) {
	return ed(t, (t) => $u(e, t)).map((t) => e.validateMethod(t));
}
function nd(e, t, n) {
	return td(e, t).flatMap((t) => e.costs(t, t.kind === "fossils" ? n : void 0));
}
function rd(e, t) {
	let n = t.sourcePreparation;
	if (!n) return;
	let r = e.validateItem(t.item);
	if (n.kind === "scour-v1" || n.kind === "influence-ready-v1") {
		let t = {
			...e.createItem(r.baseId, r.level),
			influences: n.kind === "scour-v1" ? r.influences : []
		};
		if (e.catalog.game !== "poe1" || n.kind === "influence-ready-v1" && !Yu.has(r.baseId) || !["Shield", "Helmet"].includes(e.base(r).item_class) && !Ju.has(r.baseId) || Object.keys(r).some((e) => JSON.stringify(r[e]) !== JSON.stringify(t[e]))) throw Error(n.kind === "influence-ready-v1" ? "An influence-ready source requires a clean uninfluenced Normal Pinnacle, Titanium or Heat-attuned shield template with only native implicits." : "A Scouring source requires a baseline Normal shield or helmet, Cold/Lightning Two-Toned Boots, Zodiac Leather or Vaal Regalia template with only its preserved influences and native implicits.");
		td(e, n);
		return;
	}
	let i = r.mods[0];
	if (e.catalog.game !== "poe1" || e.base(r).item_class !== "Body Armour" || r.rarity !== "rare" || r.mods.length !== 1 || i?.id !== n.fractureId || !i.fractured || i.crafted || !["prefix", "suffix"].includes(e.mod(i.id).generation_type)) throw Error("A fractured fossil source requires a Rare body armour template with only its known natural fracture.");
	let a = {
		...e.createItem(r.baseId, r.level),
		rarity: "rare",
		mods: r.mods
	};
	if (Object.keys(r).some((e) => JSON.stringify(r[e]) !== JSON.stringify(a[e]))) throw Error("A fractured fossil source template cannot contain additional prepared state.");
	for (let t of td(e, n)) e.validateMethod(t);
	let o = e.catalog.crafting.currencies.find((e) => e.id === n.fossils.resonator), s = e.availableFossils(r);
	if (o?.action !== "delve_currency_reroll" || Number(o.id.at(-1)) !== n.fossils.ids.length || new Set(n.fossils.ids).size !== n.fossils.ids.length || n.fossils.ids.some((e) => !s.some((t) => t.id === e)) || [...n.fossils.ids, ...n.fossils.tangled ? [n.fossils.tangled] : []].some((t) => e.catalog.crafting.fossils.find((e) => e.id === t)?.effects.some((e) => e === "CorruptedImplicit" || e === "Fracture" || e === "BetterSellPrice"))) throw Error("Source preparation requires compatible reroll fossils without persistent implicit or fracture effects.");
	e.costs(n.fossils, r);
}
function id(e, t) {
	let n = e.sourcePreparation;
	if (n) {
		if (n.kind === "scour-v1" || n.kind === "influence-ready-v1") {
			if (t.sourcePreparation || t.groups.some((e) => e.type !== "and" || e.filters.some((e) => !(e.kind === "base" && [
				"baseId",
				"baseType",
				"itemClass"
			].includes(e.field)) && e.kind !== "rarity" && e.kind !== "influence" && (e.kind !== "flag" || e.field === "split") && !(e.kind === "range" && [
				"ilvl",
				"prefixes",
				"suffixes"
			].includes(e.field))))) throw Error(n.kind === "influence-ready-v1" ? "An influence-ready source can guarantee only its clean Normal base, level, affix counts, influences and supported flags." : "A Scouring source can guarantee only its Normal base, level, affix counts, influences and supported flags.");
		} else if (t.sourcePreparation || t.groups.some((e) => e.type !== "and" || e.filters.some((e) => e.kind !== "base" && (e.kind !== "range" || e.field !== "ilvl") && (e.kind !== "mod" || e.ids?.length !== 1 || e.ids[0] !== n.fractureId)))) throw Error("A prepared source acquisition can guarantee only its base, level and retained fracture.");
	}
}
function ad(e, t, n, r) {
	let i = `purchase:${n.id}:${r.id}`, a = t.prices[i] ?? r.price, o = new Set(a ? [] : [i]), s = a?.amount ?? 0, c = r.sourcePreparation ? td(e, r.sourcePreparation) : [], l = r.sourcePreparation ? nd(e, r.sourcePreparation, r.item) : [];
	for (let e of l) {
		let r = qu(t.prices, n.id, e.id);
		r ? s += r.amount * e.amount : o.add(e.id);
	}
	return {
		expectedCost: o.size ? null : s,
		expectedActions: c.length,
		missingPrices: [...o],
		confidence: a?.confidence ?? null
	};
}
function od(e, t, n, r = [], i) {
	rd(e, t);
	let a = t.sourcePreparation;
	if (!a) return {
		item: structuredClone(t.item),
		costs: [],
		actions: 0
	};
	let o = structuredClone(t.item), s = [], c = td(e, a);
	for (let t of c) {
		if (t.kind === "bench" || a.kind === "scour-v1") {
			let n = e.costs(t);
			s.push(...n), i?.(n);
			continue;
		}
		let c = Sl(t) ? e.prepareAllflame(o, t, n) : e.apply(o, t, n);
		if (s.push(...c.cost), i?.(c.cost), o = c.item, o.allflameCopies) {
			let t = Gu(e), n = o.allflameCopies, i = 0;
			for (let e of r) {
				let r = n.findIndex((n) => t.matches(n, e) === "match");
				if (!(r < 0)) {
					i = r;
					break;
				}
			}
			o = e.chooseAllflame(o, i);
		}
	}
	return {
		item: o,
		costs: s,
		actions: c.length
	};
}
// app/lib/crafting-cost-inputs.ts
function sd(e, t, n = []) {
	let r = /* @__PURE__ */ new Map();
	for (let n of t) if (n) try {
		for (let t of e.costs(n)) r.set(t.id, t);
		let t = n.kind === "bench" && e.catalog.crafting.bench.find((e) => e.id === n.id);
		if (t && (t.mod || t.enchantment)) for (let n of e.catalog.crafting.bench.filter((e) => e.action === +!!t.enchantment && !e.mod && !e.enchantment && e.itemClasses.some((e) => t.itemClasses.includes(e)))) for (let e of n.cost) r.set(e.id, e);
	} catch {}
	for (let t of n) r.has(t) || r.set(t, {
		id: t,
		name: e.costName(t),
		amount: 1
	});
	return [...r.values()];
}
// ../../packages/poe-game-data/src/crafting-genesis.ts
function cd(e) {
	if (e.id === "brequel_equipment_fruit_mod_tier_rating_+") return {
		kind: "tier",
		value: e.min
	};
	let t = /^brequel_equipment_fruit_(\w+)_modifier_chance_\+%$/.exec(e.id);
	if (t) return {
		kind: "weight",
		tag: t[1] === "defence" ? "defences" : t[1],
		value: e.min
	};
}
// ../../packages/poe-game-data/src/model.ts
var W = M().int(), G = W.nullable().default(null), ld = A().nullable().default(null), ud = I({
	min: W,
	max: W
}).refine((e) => e.min <= e.max, "Invalid range"), dd = ud.safeExtend({ id: A() }), fd = I({
	tag: A(),
	weight: W.nonnegative()
}), pd = I({
	adds_tags: P(A()),
	domain: A(),
	generation_type: A(),
	generation_weights: P(fd),
	grants_effects: P(I({
		granted_effect_id: A(),
		level: W
	})),
	groups: P(A()),
	implicit_tags: P(A()),
	is_essence_only: N(),
	name: A(),
	required_level: W,
	maximum_level: W,
	spawn_weights: P(fd),
	stats: P(dd),
	text: A().nullable(),
	type: A(),
	gold_value: G
}), md = I({
	armour: ud.nullable().default(null),
	energy_shield: ud.nullable().default(null),
	evasion: ud.nullable().default(null),
	ward: ud.nullable().default(null),
	movement_speed: G,
	block: G,
	description: ld,
	directions: ld,
	stack_size: G,
	stack_size_currency_tab: G,
	full_stack_turns_into: ld,
	charges_max: G,
	charges_per_use: G,
	duration: G,
	life_per_use: G,
	mana_per_use: G,
	attack_time: G,
	reload_time: W.nonnegative().nullable().default(null),
	critical_strike_chance: G,
	physical_damage_max: G,
	physical_damage_min: G,
	range: G,
	mana_burn_ms: G,
	cooldown_ms: G,
	monster_id: ld,
	monster_ability_text: ld,
	monster_category: ld
}), hd = I({
	domain: A(),
	drop_level: W,
	implicits: P(A()),
	inventory_height: W,
	inventory_width: W,
	inherits_from: ld,
	item_class: A(),
	name: A(),
	properties: md,
	release_state: z([
		"released",
		"unique_only",
		"unreleased",
		"legacy"
	]),
	tags: P(A()),
	visual_identity: I({
		dds_file: A(),
		id: A()
	}),
	requirements: I({
		strength: W,
		dexterity: W,
		intelligence: W,
		level: W
	}).nullable().default(null),
	grants_buff: I({
		id: A(),
		stats: R(A(), W)
	}).nullable().default(null),
	skills_granted: P(A()).nullable().default(null)
}), gd = I({
	alias: I({
		when_in_main_hand: ld,
		when_in_off_hand: ld
	}),
	is_aliased: N(),
	is_local: N()
}), _d = I({
	name: A(),
	category: ld,
	category_id: ld,
	influence_tags: P(A()).nullable().default(null)
}), vd = (e) => R(A(), e).refine((e) => Object.keys(e).length > 0, "Empty dataset").meta({ minProperties: 1 }), yd = vd(hd), bd = vd(pd), xd = vd(gd), Sd = P(A()).min(1), Cd = vd(_d);
R(A(), I({
	name: A(),
	used_in_crafting: N().optional()
})), R(A(), R(A(), qs([
	A(),
	M().finite(),
	N(),
	P(A())
])));
var wd = A().regex(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)){2,5}$/);
function Td(e) {
	wd.parse(e);
	let t = e.split(".");
	return t.slice(0, 3).join(".") + (t.length > 3 ? `-build.${t.slice(3).join(".")}` : "");
}
var Ed = A().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-build\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))*)?$/), Dd = A().regex(/^[a-f0-9]{64}$/);
I({
	format: B(1),
	game: z(["poe1", "poe2"]),
	version: Ed,
	client_build: wd,
	source_manifest_sha256: Dd,
	dat_schema_sha256: Dd,
	extractor_sha256: Dd,
	zod_schema_sha256: Dd,
	crafting_data_sha256: Dd.optional(),
	weight_provenance: B("client-extracted; PoE 2 values are not Craft of Exile empirical weights"),
	files: R(A(), I({
		sha256: Dd,
		bytes: M().int().positive(),
		schema: A().regex(/^json-schema\/[a-z_]+\.schema\.json$/)
	})).refine((e) => Object.keys(e).length > 0).meta({ minProperties: 1 })
}).superRefine((e, t) => {
	wd.safeParse(e.client_build).success && e.version !== Td(e.client_build) && t.addIssue({
		code: "custom",
		path: ["version"],
		message: "Package version must match the client build"
	}), (e.game === "poe1" ? /^3\./ : /^[04]\./).test(e.client_build) || t.addIssue({
		code: "custom",
		path: ["client_build"],
		message: "Client build does not match the game"
	});
}), I({
	base_items: yd,
	mods: bd,
	stats: xd,
	tags: Sd,
	item_classes: Cd
});
// ../../packages/poe-game-data/src/crafting-data-model.ts
var K = A().min(1), q = M().int(), Od = A().regex(/^[a-f0-9]{64}$/), kd = F({
	id: K,
	itemClasses: P(K).min(1),
	maximumQuality: q.positive().max(200)
}), Ad = F({
	id: K,
	name: K,
	amount: q.positive()
}), jd = F({
	id: K,
	name: A(),
	action: A(),
	description: A(),
	directions: A()
}), Md = F({
	id: K,
	name: K,
	inheritsFrom: K,
	baseItem: K.nullable(),
	tags: P(K),
	mods: P(K),
	minimumLevel: q.nonnegative(),
	maximumLevel: q.nonnegative(),
	spawnWeight: q.nonnegative(),
	spawnWeightIncreaseStat: K.nullable(),
	spawnWeightHardmode: q.nonnegative(),
	basicSpawnChanceStat: K.nullable(),
	requiredSpawnStats: P(K),
	blockingSpawnStats: P(K)
}), Nd = F({
	name: K,
	hash: q.nonnegative(),
	notable: N(),
	stats: P(dd),
	text: A().nullable()
}), Pd = F({
	sulphur: K,
	description: K,
	intangibilityDescription: K,
	ghostlyCopyDescription: K,
	classes: P(F({
		itemClass: K,
		costPercent: q.positive(),
		levelScaling: N()
	})).min(1),
	levels: P(F({
		level: q.min(1).max(100),
		costIncreasePercent: q.min(-99)
	})).min(1),
	currencies: P(F({
		id: K,
		currency: K,
		tier: q.nonnegative(),
		outcomes: F({
			min: q.positive(),
			max: q.positive()
		}),
		sulphurCost: q.nonnegative(),
		intangibility: F({
			min: q.min(0).max(100),
			max: q.min(0).max(100)
		})
	})).min(1)
}), Fd = F({
	format: B(1),
	game: z(["poe1", "poe2"]),
	patch: K,
	source: F({
		basesSha256: Od,
		modsSha256: Od,
		schemaSha256: Od,
		tables: R(K, Od)
	}),
	currencies: P(jd),
	allflame: Pd.nullable(),
	genesis: F({
		name: K,
		fruit: K,
		asset: K,
		itemClasses: P(K).min(1),
		passives: R(K, Nd)
	}).nullable(),
	strongboxes: P(Md),
	clusterJewels: F({
		bases: R(K, F({
			size: K,
			minNodes: q.positive(),
			maxNodes: q.positive(),
			socketIndices: P(q.nonnegative())
		})),
		skills: R(K, Nd.extend({
			size: K,
			tag: K
		})),
		passives: R(K, Nd.extend({ id: K }))
	}).nullable(),
	augmentTags: R(K, K),
	taggedModifierEffects: P(F({
		stat: K,
		tags: P(K).min(1),
		explicit: N(),
		implicit: N(),
		prefix: N(),
		suffix: N()
	})),
	augments: P(F({
		id: K,
		name: K,
		requiredLevel: q.nonnegative(),
		type: F({
			id: K,
			name: K,
			effectStat: K.nullable(),
			socketedStat: K
		}),
		limit: F({
			id: K,
			amount: q.positive(),
			text: A()
		}).nullable(),
		higherTier: K.nullable(),
		socketBound: N(),
		martialArtist: N(),
		unique: N(),
		jewellery: N(),
		corruptedSanctified: N(),
		description: A().nullable(),
		extraDescription: A().nullable(),
		rules: P(F({
			category: K,
			display: A(),
			itemClasses: P(K).min(1),
			scope: z([
				"classes",
				"martial",
				"armour",
				"all"
			]),
			stats: P(dd),
			bondedStats: P(dd),
			text: A().nullable(),
			bondedText: A().nullable(),
			statDescriptions: P(q.nonnegative()),
			bondedDescriptions: P(q.nonnegative())
		}))
	})),
	locus: F({
		id: K,
		name: K,
		tier: q.positive(),
		description: K
	}).nullable(),
	templeCorruption: F({
		currencies: P(F({
			id: K,
			itemClasses: P(K).min(1)
		})).min(1),
		twiceCorruptedText: K,
		alreadyTwiceCorruptedText: K
	}).nullable(),
	maps: P(F({
		id: K,
		tier: q.nonnegative(),
		generation: q.nonnegative(),
		upgrade: K.nullable(),
		areaLevel: q.positive()
	})),
	waystones: P(F({
		id: K,
		tier: q.positive(),
		series: q.nonnegative(),
		areaLevel: q.positive()
	})),
	baseQuality: P(kd.extend({ corrupted: N() })),
	taintedCatalysts: P(kd),
	mapQuality: P(kd.extend({
		qualityType: K,
		description: K,
		stats: P(K).min(1)
	})),
	qualityInfusers: P(F({
		id: K,
		itemClasses: P(K).min(1),
		qualityType: z(["base", "catalyst"]),
		extraMaximumQuality: q.positive().max(200)
	})),
	memoryStrandCosts: R(K, q.positive()),
	memoryMaps: F({
		currency: K,
		maximumUses: q.positive(),
		influenceMod: K,
		enchantmentMod: K
	}).nullable(),
	keywords: R(K, F({
		term: K,
		definition: K
	})),
	sanctification: F({
		min: q.positive(),
		max: q.positive()
	}).nullable(),
	recombinableClasses: P(K).refine((e) => new Set(e).size === e.length, "Duplicate recombinable item class."),
	craftableModTypes: P(K),
	passiveTree: F({
		asset: K,
		notables: R(K, Nd.extend({
			ascendancy: K.nullable(),
			visibleForAscendancy: K.nullable()
		}))
	}).nullable(),
	anointing: F({
		maps: P(F({
			mod: K,
			maximumAnointments: q.positive().max(9),
			ravaged: N()
		})),
		items: P(F({
			id: K,
			useType: q.nonnegative(),
			tier: q.nonnegative()
		})),
		recipes: P(F({
			id: K,
			type: K.nullable(),
			items: P(K).min(1),
			mod: K.nullable(),
			passive: K.nullable()
		})),
		passives: R(K, Nd)
	}),
	liquidEmotions: P(F({
		id: K,
		rules: P(F({
			base: K,
			mods: P(K).min(1)
		})).min(1)
	})),
	scalableStats: P(K),
	catalysts: P(F({
		id: K,
		qualityType: K,
		description: K,
		maximumQuality: q.positive().max(200),
		itemClasses: P(K).min(1),
		tags: P(K),
		explicit: N(),
		implicit: N(),
		prefix: N(),
		suffix: N()
	})),
	modEquivalencies: P(F({
		id: K,
		mods: P(K)
	})),
	elementalConversions: P(F({
		id: K,
		resistance: N(),
		mods: F({
			fire: K.nullable(),
			cold: K.nullable(),
			lightning: K.nullable(),
			chaos: K.nullable()
		})
	})),
	desecration: P(F({
		id: K,
		itemClasses: P(K),
		maximumItemLevel: q.nonnegative(),
		minimumModLevel: q.nonnegative(),
		tag: K.nullable()
	})),
	baseRules: R(K, F({
		corrupted: N(),
		unmodifiable: N(),
		initialSockets: q.min(0).max(6)
	})),
	tieredCurrency: P(F({
		id: K,
		tier: q,
		minimumModLevel: q.nonnegative()
	})),
	poe2Essences: P(F({
		id: K,
		name: A(),
		tier: q,
		perfect: N(),
		replacement: P(K),
		rules: P(F({
			itemClasses: P(K),
			mod: K.nullable(),
			text: A(),
			outcomes: P(F({
				mod: K,
				weight: q.nonnegative().nullable()
			}))
		}))
	})),
	rarities: R(K, F({
		min: q.nonnegative(),
		max: q.nonnegative(),
		prefixes: q.nonnegative(),
		suffixes: q.nonnegative()
	})),
	classes: R(K, F({
		influence: N(),
		fracture: N(),
		veiled: N(),
		corrupt: N(),
		doubleCorrupt: N(),
		aspects: N(),
		upgrade: N(),
		unmodifiable: N()
	})),
	influences: P(F({
		itemClass: K,
		influence: q.min(0).max(5),
		tag: K,
		name: K
	})),
	influenceUpgrades: P(F({
		mod: K,
		upgraded: K,
		highestTier: N()
	})),
	modRules: R(K, F({
		itemClasses: P(K),
		influence: q.min(0).max(5).nullable(),
		spawnLevel: q.nullable(),
		gameMode: q.nullable()
	})),
	statDescriptions: P(F({
		ids: P(K),
		rules: P(F({
			conditions: P(A()),
			text: A(),
			handlers: P(A())
		}))
	})),
	modDescriptions: R(K, P(q.nonnegative())),
	modTexts: R(K, K),
	grantedEffects: R(K, P(F({
		text: K,
		level: q.nonnegative()
	})).min(1)).optional(),
	statLookups: R(K, R(A(), A())),
	essences: P(F({
		id: K,
		name: A(),
		level: q,
		itemLevelLimit: q.nonnegative(),
		corrupted: N(),
		mods: R(K, K)
	})),
	flaskEnchantments: P(F({
		id: K,
		itemClasses: P(K).min(1),
		mods: P(K).min(1)
	})),
	bench: P(F({
		id: K,
		name: A(),
		mod: K.nullable(),
		itemClasses: P(K),
		cost: P(Ad),
		level: q.nonnegative(),
		action: q.nullable(),
		socketCount: q.min(1).max(6).nullable(),
		linkCount: q.min(2).max(6).nullable(),
		enchantment: F({
			mod: K,
			itemClasses: P(K).min(1)
		}).nullable()
	})),
	fossils: P(F({
		id: K,
		name: A(),
		positive: P(F({
			tag: K,
			weight: q.nonnegative()
		})),
		negative: P(F({
			tag: K,
			weight: q.nonnegative()
		})),
		added: P(K),
		forced: P(K),
		allowed: P(F({
			tag: K.nullable(),
			itemClass: A()
		})),
		forbidden: P(F({
			tag: K.nullable(),
			itemClass: A()
		})),
		descriptions: P(A()),
		effects: P(K),
		randomOutcomes: P(K),
		lucky: N(),
		quality: N(),
		mirrored: N(),
		whiteSockets: N(),
		corruptedEssenceChance: q.min(0).max(100)
	})),
	harvest: P(F({
		id: K,
		name: A(),
		command: A(),
		parameters: A(),
		enchantment: F({
			mod: K,
			itemClasses: P(K).min(1)
		}).nullable(),
		affinityMultiplier: M().finite().positive().nullable(),
		influenceRerollClasses: P(K).min(1).nullable(),
		cost: P(Ad).min(1),
		gameMode: q.nullable()
	})),
	beasts: P(F({
		id: K,
		category: A(),
		description: A(),
		notes: A(),
		components: P(F({
			id: K,
			level: q
		})),
		mod: K.nullable(),
		aspectMod: K.nullable(),
		metamods: P(K),
		augmentation: qs([F({ influence: q.min(0).max(5) }), F({ itemClass: K })]).nullable(),
		mapCorruption: z(["implicit", "twice"]).nullable(),
		maximumSockets: N(),
		maximumLinks: N(),
		talismanCraft: qs([B("imprint"), F({
			fractures: q.min(1).max(2),
			minimumMods: q.positive()
		})]).nullable(),
		gameMode: q.nullable()
	}))
}), Id = {
	min: 78,
	max: 122
};
function Ld(e, t) {
	return !!(e.game === "poe1" && e.crafting.locus && e.crafting.classes[e.bases[t.baseId].item_class]?.doubleCorrupt);
}
function Rd(e, t, n) {
	let r = e.crafting.currencies.find((e) => e.action === n);
	return !!(r && e.crafting.templeCorruption?.currencies.find((e) => e.id === r.id)?.itemClasses.includes(e.bases[t.baseId].item_class));
}
function zd(e, t) {
	return Rd(e, t, "incursion_corrupt_tablet");
}
function Bd(e, t, n, r) {
	let i = e.mods[n].stats[r], a = t.corrupted && zd(e, t) && e.bases[t.baseId].implicits[0] === n && r === 0;
	return {
		min: i.min,
		max: i.max + (a ? 10 : 0)
	};
}
function Vd(e, t) {
	let n = e.bases[t.baseId];
	return e.game === "poe2" && n.item_class === "Jewel" && e.crafting.classes[n.item_class]?.corrupt;
}
// app/schemas/crafting.ts
var Hd = md.pick({
	armour: !0,
	evasion: !0,
	energy_shield: !0,
	ward: !0
}).strip(), Ud = Hd.keyof(), Wd = ec(Ud, ud.shape.min.nonnegative()), Gd = md.pick({
	attack_time: !0,
	reload_time: !0,
	critical_strike_chance: !0,
	physical_damage_min: !0,
	physical_damage_max: !0,
	block: !0
}).strip(), Kd = md.pick({
	charges_max: !0,
	charges_per_use: !0,
	duration: !0,
	life_per_use: !0,
	mana_per_use: !0
}).strip(), qd = z([
	"elementalResistance",
	"totalResistance",
	"flatLife"
]), Jd = z([
	"armour",
	"evasion",
	"energy_shield",
	"ward",
	"physicalDps",
	"elementalDps",
	"chaosDps",
	"totalDps",
	"attacksPerSecond",
	"reloadTime",
	"criticalStrikeChance",
	"blockChance",
	"requiredLevel",
	"strengthRequirement",
	"dexterityRequirement",
	"intelligenceRequirement",
	"lifeRecovery",
	"manaRecovery",
	"flaskDuration",
	"maximumCharges",
	"chargesPerUse",
	...qd.options
]), Yd = hd.pick({
	name: !0,
	domain: !0,
	item_class: !0,
	tags: !0,
	implicits: !0,
	drop_level: !0,
	inventory_width: !0,
	inventory_height: !0,
	requirements: !0
}).strip().extend({
	strongbox: B(!0).optional(),
	levelRules: F({
		inventory_type: A().nullable().default(null),
		no_level_requirement: z(["true", "false"]).default("false")
	}).prefault({}),
	defences: Hd,
	combat: Gd.prefault({}),
	flask: Kd.prefault({}),
	rarities: P(z([
		"normal",
		"magic",
		"rare"
	])),
	corrupted: N(),
	initialSockets: Fd.shape.baseRules.valueType.shape.initialSockets,
	socketInfo: P(F({
		count: M().int().min(0).max(6),
		level: M().int().nonnegative(),
		weight: M().int().nonnegative()
	})).default([])
}), Xd = pd.omit({
	grants_effects: !0,
	gold_value: !0
}).strip(), Zd = Gs({
	lifeforceType: M().int().min(1).max(3),
	lifeforce: M().int().nonnegative(),
	sacred: M().int().nonnegative()
}), Qd = Gs({
	id: A(),
	name: A()
}), $d = (e) => typeof e == "object" && !!e && "lifeforceType" in e;
function ef(e) {
	let t = e?.harvest;
	if (!Array.isArray(t) || !t.some($d)) return e;
	let n = Gs({
		harvest: P(Bs()),
		currencies: P(Qd)
	}).safeParse(e);
	if (!n.success) return e;
	let r = (e) => {
		let t = n.data.currencies.find((t) => t.id.endsWith(`HarvestSeed${e}`));
		if (!t) throw Error("Lifeforce currency is missing from the build.");
		return {
			id: t.id,
			name: t.name
		};
	};
	return {
		...n.data,
		harvest: n.data.harvest.map((e) => {
			let t = Zd.safeParse(e);
			if (!t.success) return e;
			let { lifeforceType: n, lifeforce: i, sacred: a, ...o } = t.data;
			return {
				...o,
				cost: [{
					...r([
						"Red",
						"Green",
						"Blue"
					][n - 1]),
					amount: i
				}, ...a ? [{
					...r("Boss"),
					amount: a
				}] : []]
			};
		})
	};
}
var tf = F({
	format: B(1),
	game: z(["poe1", "poe2"]),
	patch: A(),
	manifestSha256: A().regex(/^[a-f0-9]{64}$/),
	craftingSha256: A().regex(/^[a-f0-9]{64}$/),
	bases: R(A(), Yd),
	mods: R(A(), Xd),
	crafting: Ac(ef, Fd)
}), J = A().min(1), nf = M().int().min(1).max(100), rf = M().int().min(0).max(200), af = M().int().min(0).max(100), of = F({ intentions: M().int().nonnegative() }), sf = M().int().min(0).max(200), cf = F({
	id: J,
	quality: rf
}), lf = P(M().int().min(0).max(5)).max(6).refine((e) => new Set(e).size === e.length, "Influences must be unique."), uf = F({
	id: J,
	essence: B(!0).optional(),
	values: P(M().int()),
	fractured: N().default(!1),
	crafted: N().default(!1),
	desecrated: B(!0).optional(),
	sanctification: M().int().positive().optional(),
	corruptionScale: M().int().min(Id.min).max(Id.max).optional(),
	grantedPassive: J.optional(),
	attributeSource: J.optional(),
	conversion: F({
		source: J,
		steps: P(F({
			socket: M().int().min(0).max(6),
			order: M().int().min(0).max(6)
		})).min(1).max(7)
	}).optional(),
	origin: L("kind", [
		F({
			kind: B("awakener"),
			level: nf
		}),
		F({
			kind: B("recombine"),
			level: nf
		}),
		F({
			kind: B("beast"),
			level: nf,
			recipe: J
		})
	]).optional()
}).meta({ id: "CraftingRolledModifier" }), df = F({
	baseId: J,
	level: nf,
	rarity: z([
		"normal",
		"magic",
		"rare"
	]),
	unidentified: B(!0).optional(),
	influences: lf.max(2).default([]),
	mods: P(uf).max(9),
	implicits: P(uf).max(6),
	implicitCraft: F({
		currency: J,
		level: nf,
		removed: P(J).max(6)
	}).optional(),
	anointments: P(J).max(9).optional(),
	blight: J.optional(),
	cluster: F({
		passive: J,
		nodes: M().int().positive().optional(),
		jewelSockets: M().int().nonnegative().optional()
	}).optional(),
	enchantments: P(uf).max(1).optional(),
	corrupted: N().default(!1),
	corruptedBy: J.optional(),
	destroyed: B(!0).optional(),
	destroyedBy: J.optional(),
	twiceCorrupted: B(!0).optional(),
	mirrored: N().default(!1),
	split: N().optional(),
	sanctified: N().optional(),
	putrefied: B(!0).optional(),
	quality: sf.default(0),
	baseDefences: Wd.optional(),
	mapQuality: J.optional(),
	sockets: M().int().min(0).max(7).optional(),
	socketLinks: P(N().nullable()).min(1).max(5).optional(),
	augments: P(J).max(7).optional(),
	jewelSocket: J.optional(),
	catalyst: cf.optional(),
	memoryStrands: af.optional(),
	intangibility: Fd.shape.allflame.unwrap().shape.currencies.element.shape.intangibility.shape.max.optional(),
	allflameCrafted: B(!0).optional(),
	memoryMap: of.optional()
}), ff = df.extend({ socketedJewel: df.strict().optional() }), pf = df.extend({ reveal: F({
	mod: J,
	source: J,
	mark: J.optional(),
	index: M().int().min(0).max(5).optional(),
	choices: P(J).max(3),
	offeredOn: ff.optional(),
	omens: P(J).max(4).optional(),
	echoes: F({
		omen: J,
		remaining: qs([B(0), B(1)])
	}).optional()
}).optional() }).meta({ id: "CraftingItemCore" }), Y = pf.extend({ socketedJewel: pf.strict().optional() }).meta({ id: "CraftingItemState" });
pf.pick({
	corrupted: !0,
	mirrored: !0,
	split: !0,
	sanctified: !0
}).keyof();
var mf = Y.extend({
	imprint: Y.optional(),
	allflameCopies: P(Y).min(1).max(4).optional(),
	allflameCost: Fd.shape.bench.element.shape.cost.min(1).optional()
}).meta({ id: "CraftingItem" }), hf = A().trim().min(1).max(60).refine((e) => e !== "Unfiled", "Unfiled is reserved for items without a tab."), gf = F({
	id: J,
	name: A().min(1).max(100),
	item: mf,
	tab: hf.optional()
}), _f = F({
	kind: B("fossils"),
	allflame: B(!0).optional(),
	tangled: J.optional(),
	ids: P(J).min(1).max(4),
	resonator: J,
	logic: z(["additive", "multiplicative"]).default("additive")
}), vf = Ac((e, t) => e && typeof e == "object" && "allflame" in e && e.allflame !== void 0 && (!("kind" in e) || ![
	"currency",
	"essence",
	"fossils"
].includes(String(e.kind))) ? (t.issues.push({
	code: "custom",
	message: "Allflame requires an eligible itemized currency, essence or resonator.",
	input: e
}), Je) : e, L("kind", [
	F({
		kind: B("genesis"),
		id: B("genesis"),
		nodes: P(J).max(100).default([])
	}),
	F({
		kind: B("generate"),
		id: Y.shape.rarity,
		breachRings: qs([B("legacy"), R(z([
			"Xoph",
			"Tul",
			"Esh",
			"Uul-Netol",
			"Chayula"
		]), M().int().min(0).max(60))]).optional()
	}),
	F({
		kind: B("socket_jewel"),
		id: B("socket_jewel"),
		jewel: gf.optional()
	}),
	F({
		kind: B("remove_jewel"),
		id: B("remove_jewel")
	}),
	F({
		kind: B("recombine"),
		id: B("recombine"),
		donor: gf.optional()
	}),
	F({
		kind: B("currency"),
		id: J,
		allflame: B(!0).optional(),
		omens: P(J).max(4).optional(),
		donor: gf.optional()
	}),
	F({
		kind: B("essence"),
		id: J,
		omens: P(J).max(4).optional(),
		allflame: B(!0).optional()
	}),
	F({
		kind: B("bench"),
		id: J,
		skipOnConflict: N().optional()
	}),
	F({
		kind: B("augment"),
		id: J,
		replace: M().int().min(0).max(6).optional()
	}),
	F({
		kind: B("upgrade_augment"),
		id: J,
		socket: M().int().min(0).max(6).default(0)
	}),
	F({
		kind: B("locus"),
		id: J
	}),
	F({
		kind: B("anoint"),
		id: J,
		additional: P(J).max(8).optional(),
		oils: P(J).max(2).optional()
	}),
	_f,
	F({
		kind: B("harvest"),
		id: J
	}),
	F({
		kind: B("beast"),
		id: J,
		level: nf.optional()
	}),
	F({
		kind: B("reveal"),
		preferred: P(J).max(100).default([]),
		skipOnMiss: N().optional(),
		omens: P(J).max(4).optional()
	})
])).meta({ id: "CraftingMethod" }), yf = F({
	min: M().int().min(0).max(9),
	max: M().int().min(0).max(9)
}).refine((e) => e.min <= e.max, "Minimum affix count exceeds maximum."), bf = yf.refine((e) => e.max <= 6, "Maximum affix count exceeds six."), xf = F({
	id: J,
	scope: z([
		"all",
		"explicit",
		"implicit"
	]).default("all"),
	min: M().int().optional(),
	max: M().int().optional()
}).refine((e) => e.min !== void 0 || e.max !== void 0, "Choose a minimum or maximum stat value.").refine((e) => e.min === void 0 || e.max === void 0 || e.min <= e.max, "Minimum stat value exceeds maximum."), Sf = F({
	groups: P(F({
		mods: P(J).min(1).max(100),
		minimum: M().int().min(1).max(9).default(1),
		fractured: N().optional(),
		negated: N().optional()
	})).max(12),
	minimumGroups: M().int().min(0).max(12).default(0),
	openPrefixes: M().int().min(0).max(6).default(0),
	openSuffixes: M().int().min(0).max(6).default(0),
	openAffixes: M().int().min(0).max(9).optional(),
	rarity: Y.shape.rarity.optional(),
	corrupted: Y.shape.corrupted.unwrap().optional(),
	mirrored: Y.shape.mirrored.unwrap().optional(),
	split: Y.shape.split,
	sanctified: Y.shape.sanctified,
	jewelSocket: N().optional(),
	socketedJewel: N().optional(),
	baseDefences: ec(Ud, ud.refine((e) => e.min >= 0, "Base defence requirements cannot be negative.")).optional(),
	properties: ec(Jd, F({
		min: M().finite().optional(),
		max: M().finite().optional()
	}).refine((e) => e.min !== void 0 || e.max !== void 0, "Choose a minimum or maximum item property value.").refine((e) => e.min === void 0 || e.max === void 0 || e.min <= e.max, "Minimum item property value exceeds maximum.")).refine((e) => Object.entries(e).every(([e, t]) => qd.options.some((t) => t === e) || (t.min === void 0 || t.min >= 0) && (t.max === void 0 || t.max >= 0)), "Only resistance and flat-life requirements can be negative.").optional(),
	mapTier: F({
		min: Fd.shape.maps.element.shape.tier.positive(),
		max: Fd.shape.maps.element.shape.tier.positive()
	}).refine((e) => e.min <= e.max, "Minimum map tier exceeds maximum.").optional(),
	waystoneTier: F({
		min: Fd.shape.waystones.element.shape.tier,
		max: Fd.shape.waystones.element.shape.tier
	}).refine((e) => e.min <= e.max, "Minimum Waystone tier exceeds maximum.").optional(),
	sockets: F({
		min: Y.shape.sockets.unwrap(),
		max: Y.shape.sockets.unwrap()
	}).refine((e) => e.min <= e.max, "Minimum socket count exceeds maximum.").optional(),
	linkedSockets: F({
		min: Y.shape.sockets.unwrap().max(6),
		max: Y.shape.sockets.unwrap().max(6)
	}).refine((e) => e.min <= e.max, "Minimum linked sockets exceeds maximum.").optional(),
	quality: F({
		min: sf,
		max: sf,
		mapType: Y.shape.mapQuality
	}).refine((e) => e.min <= e.max, "Minimum base quality exceeds maximum.").optional(),
	memoryStrands: F({
		min: af,
		max: af
	}).refine((e) => e.min <= e.max, "Minimum memory strands exceeds maximum.").optional(),
	intangibility: F({
		min: Y.shape.intangibility.unwrap(),
		max: Y.shape.intangibility.unwrap()
	}).refine((e) => e.min <= e.max, "Minimum intangibility exceeds maximum.").optional(),
	intentions: F({
		min: of.shape.intentions,
		max: of.shape.intentions
	}).refine((e) => e.min <= e.max, "Minimum Intention uses exceeds maximum.").optional(),
	catalyst: cf.pick({ id: !0 }).partial().extend({
		min: rf,
		max: rf
	}).refine((e) => e.min <= e.max, "Minimum catalyst quality exceeds maximum.").optional(),
	influences: lf.optional(),
	affixCount: yf.optional(),
	prefixCount: bf.optional(),
	suffixCount: bf.optional(),
	unrevealedCount: bf.optional(),
	anointments: P(J).max(9).optional(),
	enchantments: P(J).max(1).optional(),
	grantedPassives: P(J).max(1).optional(),
	stats: P(xf).max(12).refine((e) => new Set(e.map((e) => e.id)).size === e.length, "Choose each target stat only once.").optional()
});
function Cf(e) {
	return Sf.extend({ expression: e ? F({
		operator: z(["and", "or"]),
		negated: N().optional(),
		operands: P(Cf(e - 1)).min(1).max(12)
	}).optional() : Hs({ error: "Requirements exceed the maximum nesting depth." }).meta({
		type: "object",
		not: {}
	}).optional() });
}
var wf = Cf(8).refine((e) => {
	let t = [e];
	for (let e = 0; e < t.length; e++) {
		if (t.length > 64) return !1;
		t.push(...t[e].expression?.operands ?? []);
	}
	return !0;
}, "Requirements cannot exceed 64 condition nodes."), Tf = F({
	id: J.refine((e) => e !== "fail", "The fallback route ID is reserved."),
	condition: wf,
	destination: J
}), Ef = F({
	id: J,
	name: A().max(120).optional(),
	description: A().max(1e3).optional(),
	position: F({
		x: M().finite(),
		y: M().finite()
	}).optional(),
	method: vf.optional(),
	condition: wf,
	onSuccess: A().default("success"),
	onFailure: A().default("failure"),
	branches: P(Tf).max(12).refine((e) => new Set(e.map((e) => e.id)).size === e.length, "Route IDs must be unique within a step.").optional()
});
F({
	format: B(1),
	game: z(["poe1", "poe2"]),
	patch: A(),
	item: mf,
	inventory: P(gf).max(100).default([]),
	inventoryTabs: P(hf).max(20).refine((e) => new Set(e).size === e.length, "Inventory tab names must be unique.").optional(),
	target: wf,
	method: vf,
	steps: P(Ef).max(50),
	useProcess: N().default(!1),
	baseCost: M().finite().nonnegative().optional(),
	prices: R(A(), M().finite().nonnegative()),
	seed: M().int().min(0).max(4294967295),
	iterations: M().int().min(1).max(1e6),
	simulationLimit: L("kind", [F({
		kind: z(["successes", "actions"]),
		count: M().int().min(1).max(1e6)
	}), F({ kind: B("manual") })]).optional(),
	sampleStorage: F({
		mode: z([
			"all",
			"successes",
			"none"
		]),
		limit: M().int().min(1).max(1e3)
	}).optional(),
	successDistribution: N().optional(),
	maxActions: M().int().min(1).max(1e4)
}).pick({
	format: !0,
	game: !0,
	patch: !0,
	inventory: !0,
	inventoryTabs: !0
});
// app/lib/crafting-anointing.ts
function Df(e, t) {
	return e.crafting.anointing.maps.find((e) => e.mod === t.blight);
}
function Of(e) {
	return [e.id, ...e.additional ?? []];
}
function kf(e) {
	return e.crafting.anointing.maps.find((e) => !e.ravaged)?.maximumAnointments ?? 0;
}
function Af(e, t) {
	let n = Df(e, t);
	if (t.blight && (!n || e.game !== "poe1" || e.bases[t.baseId]?.item_class !== "Map")) throw Error("Blight requires an extracted PoE 1 Blighted Map modifier on a map.");
	if ((t.anointments?.length ?? 0) > (n?.maximumAnointments ?? 1)) throw Error("Anointment count exceeds this item's supported limit.");
	if (!t.anointments?.length) return;
	let r = new Set(Pf(e, t).map((e) => e.id));
	for (let i of t.anointments ?? []) {
		if (!r.has(i)) throw Error("This anointment is not available on this item base.");
		if (n && (t.anointments?.filter((e) => e === i).length ?? 0) > kf(e)) throw Error(`A Blighted Map cannot use more than ${kf(e)} of the same oil.`);
	}
}
function jf(e, t) {
	let n = e.crafting.anointing.recipes.find((e) => e.id === t);
	if (!n || !n.passive && !n.mod) throw Error("This anointing recipe has no resolved outcome in the extracted build.");
	return n;
}
function Mf(e, t) {
	let n = jf(e, t);
	return n.passive ? `Allocates ${e.crafting.anointing.passives[n.passive].name}` : wu(e.mods[n.mod].text ?? n.mod);
}
function Nf(e, t) {
	let n = jf(e, t);
	return n.passive ? `passive:${n.passive}` : `mod:${n.mod}`;
}
function Pf(e, t) {
	let n = e.bases[t.baseId];
	if (n?.item_class === "Map" && Df(e, t)) return e.crafting.anointing.recipes.filter((e) => e.type === "InfectedMap" && !!e.mod);
	let r = (au(e, t).get("local_item_can_be_instilled") ?? 0) > 0 || [...t.mods, ...t.implicits].some((t) => e.mods[t.id].stats.some((e, n) => ["local_can_be_anointed", "local_item_can_be_instilled"].includes(e.id) && (t.values[n] ?? 0) > 0));
	return e.crafting.anointing.recipes.filter((t) => t.passive ? (e.game === "poe2" || t.type === "UniqueOrAmulet") && (n?.item_class === "Amulet" || r) : e.game === "poe1" && t.mod && t.type === "Ring" && n?.item_class === "Ring");
}
function Ff(e, t) {
	return e.game === "poe1" ? e.crafting.anointing.items.filter((e) => e.useType === 1 && t.corrupted || e.useType === 2 && t.mirrored).map((e) => e.id) : [];
}
// app/lib/crafting-conversions.ts
function If(e, t, n) {
	let r = Yl(e, t, U(e, n));
	for (let e of [
		"fire",
		"cold",
		"lightning",
		"chaos"
	]) if (r?.stats.some((t) => t.id === `dummy_display_stat_rune_${e}_convert` && t.min > 0)) return e;
}
function Lf(e, t, n) {
	return e.crafting.elementalConversions.find((e) => !e.resistance && [
		"fire",
		"cold",
		"lightning"
	].some((r) => r !== n && e.mods[r] === t))?.mods[n] ?? t;
}
function Rf(e, t) {
	let n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map();
	for (let a of t.mods) {
		let o = a.conversion, s = [{
			id: o?.source ?? a.id,
			order: -1
		}];
		if (i.set(a, s), o) {
			if (e.game !== "poe2" || a.origin || !e.mods[o.source]) throw Error("Invalid elemental conversion source.");
			for (let i of o.steps) {
				let a = s.at(-1), o = t.augments?.[i.socket], c = o && If(e, t, o);
				if (i.order <= a.order || !c || !U(e, o).socketBound || n.has(i.order) && n.get(i.order) !== i.socket || r.has(i.socket) && r.get(i.socket) !== i.order) throw Error("Invalid elemental conversion socket history.");
				let l = Lf(e, a.id, c);
				if (l === a.id || !e.mods[l] || e.mods[l].generation_type !== e.mods[a.id].generation_type) throw Error("The modifier has no matching extracted elemental conversion.");
				n.set(i.order, i.socket), r.set(i.socket, i.order), s.push({
					id: l,
					order: i.order
				});
			}
			if (s.at(-1).id !== a.id) throw Error("The modifier does not match its elemental conversion history.");
		}
	}
	for (let [r, a] of i) if (r.conversion && !r.fractured) for (let [r, i] of n) {
		if (r < a[1].order) continue;
		let n = Lf(e, a.findLast((e) => e.order < r).id, If(e, t, t.augments[i]));
		if (a.findLast((e) => e.order <= r).id !== n) throw Error("The modifier is missing an elemental conversion step.");
	}
	return i;
}
function zf(e, t, n, r) {
	if (!n.conversion && !r.conversion) return !1;
	let i = t.get(n), a = t.get(r);
	return [...new Set([...i, ...a].map((e) => e.order))].some((t) => {
		let n = i.findLast((e) => e.order <= t).id, r = a.findLast((e) => e.order <= t).id;
		return n !== r && !e.mods[n].groups.some((t) => e.mods[r].groups.includes(t));
	});
}
// app/lib/crafting-defences.ts
var Bf = {
	armour: "Armour",
	evasion: "Evasion Rating",
	energy_shield: "Energy Shield",
	ward: "Ward"
};
function Vf(e, t) {
	let n = e.bases[t.baseId].defences;
	return Ud.options.flatMap((e) => n[e] ? [{
		key: e,
		range: n[e],
		name: Bf[e]
	}] : []);
}
function Hf(e, t, n) {
	let r = e.bases[t.baseId].defences[n];
	return r ? t.baseDefences?.[n] ?? (r.min === r.max ? r.min : void 0) : 0;
}
function Uf(e, t) {
	for (let n of Ud.options) {
		let r = t.baseDefences?.[n];
		if (r === void 0) continue;
		let i = e.bases[t.baseId].defences[n];
		if (!i || r < i.min || r > i.max) throw Error(`Base ${Bf[n]} must be within this base's extracted range.`);
	}
}
function Wf(e, t, n) {
	return Ud.options.every((r) => {
		let i = n.baseDefences?.[r];
		if (!i) return !0;
		let a = Hf(e, t, r);
		if (a === void 0) throw Error(`Set the starting Base ${Bf[r]} roll before checking this requirement.`);
		return a >= i.min && a <= i.max;
	});
}
function Gf(e, t) {
	let n = e.crafting.currencies.find((e) => e.action === "add_armour_quality");
	return e.game === "poe1" && Vf(e, t).length > 0 && e.crafting.baseQuality.some((r) => r.id === n?.id && r.itemClasses.includes(e.bases[t.baseId].item_class));
}
function Kf(e, t, n) {
	let r = e.mods[n];
	return e.game === "poe1" && n === "LocalIncreaseSocketedMinionGemLevelDelve" && e.bases[t.baseId]?.item_class === "Boots" && r != null && t.level >= r.required_level;
}
// app/lib/crafting-eldritch.ts
function X(e) {
	let t = e.spawn_weights.map((e) => /^no_tier_(\d)_eldritch_implicit$/.exec(e.tag)?.[1]).find(Boolean);
	return t ? 7 - Number(t) : 0;
}
function qf(e) {
	return JSON.stringify([
		e.generation_type,
		e.type,
		[...e.groups].sort(),
		e.stats.map((e) => e.id),
		e.spawn_weights.filter((e) => !e.tag.startsWith("no_tier_")).map((e) => e.tag)
	]);
}
// app/lib/crafting-enchantments.ts
function Jf(e, t, n) {
	let r = e.bases[t.baseId], i = e.crafting.flaskEnchantments.find((e) => e.id === n);
	return e.game !== "poe1" || !i?.itemClasses.includes(r.item_class) ? [] : i.mods.flatMap((n) => {
		let i = e.mods[n], a = e.crafting.modRules[n];
		if ((a?.spawnLevel ?? i.required_level) > t.level || i.maximum_level > 0 && i.maximum_level < t.level || a?.gameMode === 2 || a?.itemClasses.length && !a.itemClasses.includes(r.item_class)) return [];
		let o = (i.spawn_weights.find((e) => r.tags.includes(e.tag))?.weight ?? 0) * (i.generation_weights.find((e) => r.tags.includes(e.tag))?.weight ?? 100) / 100;
		return o > 0 ? [{
			id: n,
			mod: i,
			weight: o
		}] : [];
	});
}
function Yf(e, t) {
	let n = t ? e.bases[t.baseId].item_class : void 0, r = e.crafting.harvest.flatMap((e) => e.gameMode !== 2 && e.enchantment && (!n || e.enchantment.itemClasses.includes(n)) ? [{
		...e.enchantment,
		recipe: e.id
	}] : []), i = e.crafting.flaskEnchantments.flatMap((n) => (t ? Jf(e, t, n.id).map((e) => e.id) : n.mods).map((e) => ({
		mod: e,
		itemClasses: n.itemClasses,
		recipe: n.id
	})));
	return [
		...r,
		...i,
		...kl(e, t)
	];
}
// app/lib/crafting-fossils.ts
var Xf = "DoubleModSellPrice1";
// app/lib/crafting-genesis.ts
function Zf(e, t) {
	let n = e.bases[t.baseId];
	return !!(e.game === "poe1" && e.crafting.genesis?.itemClasses.includes(n?.item_class ?? "") && n?.rarities.includes("rare") && !n.corrupted);
}
function Qf(e, t) {
	let n = e.crafting.genesis;
	if (e.game !== "poe1" || !n) throw Error("Genesis crafting is unavailable in this build.");
	if (new Set(t).size !== t.length) throw Error("Choose each Genesis passive only once.");
	return t.flatMap((e) => {
		let t = n.passives[e];
		if (!t?.stats.length || t.stats.some((e) => !cd(e))) throw Error("Choose an extracted Genesis modifier-weight or tier-rating passive.");
		return t.stats.map((e) => cd(e));
	});
}
function $f(e, t) {
	let n = t.reduce((e, t) => e + (t.kind === "tier" ? t.value : 0), 0), r = /* @__PURE__ */ new Map();
	for (let { mod: t } of e) {
		let e = zu(t), n = r.get(e) ?? /* @__PURE__ */ new Set();
		n.add(t.required_level), r.set(e, n);
	}
	let i = new Map([...r].map(([e, t]) => {
		let r = [...t].sort((e, t) => e - t);
		return [e, r[Math.floor(r.length * n / (100 + n))]];
	}));
	return e.flatMap((e) => {
		if (e.mod.required_level < i.get(zu(e.mod))) return [];
		let n = t.reduce((t, n) => t + (n.kind === "weight" && e.mod.implicit_tags.includes(n.tag) ? n.value : 0), 100), r = Math.max(0, Math.round(e.weight * n / 100));
		return r ? [{
			...e,
			weight: r
		}] : [];
	});
}
var ep = {
	Xoph: 12,
	Tul: 12,
	Esh: 12,
	"Uul-Netol": 12,
	Chayula: 12
}, tp = [
	[
		"Xoph",
		"BreachBodyArmourIncreasedByUncappedFireResistance1____",
		250
	],
	[
		"Xoph",
		"BreachBodyCoverInAshWhenHit1__",
		1e3
	],
	[
		"Xoph",
		"BreachBodyLifeGainedOnHittingIgnitedEnemies1",
		1e3
	],
	[
		"Tul",
		"BreachBodyEvasionIncreasedByUncappedColdResistance1",
		250
	],
	[
		"Tul",
		"BreachBodyAddedColdDamagePerPowerCharge1",
		1e3
	],
	[
		"Tul",
		"BreachBodyOnHitBlindChilledEnemies1",
		250
	],
	[
		"Tul",
		"BreachBodyArcticArmourReservationEfficiency1",
		250
	],
	[
		"Tul",
		"BreachBodyChillEnemiesWhenHit1",
		1e3
	],
	[
		"Tul",
		"BreachBodyGainPowerChargeOnKillingFrozenEnemy1",
		1e3
	],
	[
		"Esh",
		"BreachBodyAddedLightningDamagePerShockedEnemyKilled1",
		250
	],
	[
		"Esh",
		"BreachBodyChaosDamageDoesNotBypassESNotLowLifeOrMana1_",
		1e3
	],
	[
		"Esh",
		"BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1",
		250
	],
	[
		"Esh",
		"BreachBodyIncreasedAttackSpeedPerDexterity1",
		250
	],
	[
		"Esh",
		"BreachBodyReflectsShocks1",
		1e3
	],
	[
		"Uul-Netol",
		"BreachBodyEnemiesBlockedAreIntimidated1",
		1e3
	],
	[
		"Uul-Netol",
		"BreachBodyVulnerabilityOnHit1",
		250
	],
	[
		"Uul-Netol",
		"BreachBodyNoExtraBleedDamageWhileMoving1_",
		1e3
	],
	[
		"Uul-Netol",
		"BreachBodyPhysicalDamageReductionWhileNotMoving1",
		1e3
	],
	[
		"Chayula",
		"BreachBodyChaosDamageAsPortionOfFireDamage1_",
		333
	],
	[
		"Chayula",
		"BreachBodyChaosDamageAsPortionOfColdDamage1",
		333
	],
	[
		"Chayula",
		"BreachBodyChaosDamageAsPortionOfLightningDamage1",
		333
	],
	[
		"Chayula",
		"BreachBodyMaximumLifeConvertedToEnergyShield1___",
		1e3
	],
	[
		"Chayula",
		"BreachBodyAllDefences1",
		1e3
	],
	[
		"Chayula",
		"BreachBodyGrantsEnvy1",
		1e3
	],
	[
		"Chayula",
		"BreachBodyMinionsPoisonEnemiesOnHit1_",
		1e3
	]
], np = new Set(tp.map(([, e]) => e));
function rp(e, t, n) {
	return e.game === "poe1" && e.bases[t.baseId]?.item_class === "Body Armour" && np.has(n);
}
function ip(e, t, n = ep) {
	if (e.game !== "poe1" || t.baseId !== "Metadata/Items/Armours/BodyArmours/BodyStrDexInt2") return [];
	let r = t.mods.map((t) => e.mods[t.id]), i = tp.flatMap(([t, n, i]) => {
		let a = e.mods[n];
		if (!a) throw Error(`Missing build modifier required by the wiki pool: ${n}`);
		return r.some((e) => e.groups.some((e) => a.groups.includes(e))) || r.filter((e) => e.generation_type === a.generation_type).length >= 3 ? [] : [{
			lord: t,
			id: n,
			mod: a,
			weight: i
		}];
	});
	return n === "legacy" ? i : i.flatMap((e) => n[e.lord] > 0 ? [{
		...e,
		weight: e.weight * n[e.lord] / i.filter((t) => t.lord === e.lord).reduce((e, t) => e + t.weight, 0)
	}] : []);
}
// app/lib/crafting-patch.ts
function ap({ game: e, patch: t }) {
	let [n = 0, r = 0] = t.split(".").map(Number);
	return e === "poe1" && (n > 3 || n === 3 && r >= 30);
}
// app/lib/crafting-incursion.ts
var op = [
	"FireResistEnhancedModAilments",
	"ColdResistEnhancedModAilments__",
	"LightningResistEnhancedModAilments"
];
function sp(e, t) {
	return e.game === "poe1" && !ap(e) && e.bases[t.baseId]?.item_class === "Gloves";
}
function cp(e, t, n) {
	return sp(e, t) && op.some((e) => e === n);
}
// app/lib/crafting-janus.ts
var lp = "JunMasterVeiledItemRarityFromRareAndUniqueEnemies_";
function up(e, t, n) {
	let r = e.mods[n];
	return e.game === "poe1" && n === "JunMasterVeiledItemRarityFromRareAndUniqueEnemies_" && e.bases[t.baseId]?.item_class === "Helmet" && r?.domain === "unveiled" && t.level >= r.required_level;
}
// app/lib/crafting-omens.ts
var dp = {
	OmenOnVaalRemoveDoNothingOutcome: {
		action: "corrupt_item",
		corruption: !0
	},
	OmenOnChaosLowestLevelMod: {
		action: "reroll",
		lowestLevel: !0
	},
	OmenOnChaosPrefix: {
		action: "reroll",
		removeSide: "prefix"
	},
	OmenOnChaosSuffix: {
		action: "reroll",
		removeSide: "suffix"
	},
	OmenOnAlchemyMaximumPrefixes: {
		action: "transmute_to_rare",
		maximumSide: "prefix"
	},
	OmenOnAlchemyMaximumSuffixes: {
		action: "transmute_to_rare",
		maximumSide: "suffix"
	},
	OmenOnRegalPrefix: {
		action: "upgrade_magic_to_rare",
		addSide: "prefix"
	},
	OmenOnRegalSuffix: {
		action: "upgrade_magic_to_rare",
		addSide: "suffix"
	},
	OmenOnExaltAddPrefixes: {
		action: "add_mod_to_rare",
		addSide: "prefix"
	},
	OmenOnExaltAddSuffixes: {
		action: "add_mod_to_rare",
		addSide: "suffix"
	},
	OmenOnExaltAddTwoMods: {
		action: "add_mod_to_rare",
		addCount: 2
	},
	OmenOnAnnulRemovePrefixes: {
		action: "remove_random_mod",
		removeSide: "prefix"
	},
	OmenOnAnnulRemoveSuffixes: {
		action: "remove_random_mod",
		removeSide: "suffix"
	},
	OmenOnAnnulRemoveTwoMods: {
		action: "remove_random_mod",
		removeCount: 2
	},
	OmenOnPerfectEssencePrefix: {
		action: "perfect_essence",
		removeSide: "prefix"
	},
	OmenOnPerfectEssenceSuffix: {
		action: "perfect_essence",
		removeSide: "suffix"
	},
	OmenOnAbyssAddPrefixes: {
		action: "desecrate",
		addSide: "prefix"
	},
	OmenOnAbyssAddSuffixes: {
		action: "desecrate",
		addSide: "suffix"
	},
	OmenOnAbyssVeilAllAndCorrupt: {
		action: "desecrate",
		putrefy: !0
	},
	OmenOnAnnulRemoveAbyssMod: {
		action: "remove_random_mod",
		removeDesecrated: !0
	},
	OmenOnRegalAddExistingModType: {
		action: "upgrade_magic_to_rare",
		existingTags: !0
	},
	OmenOnExaltAddExistingModType: {
		action: "add_mod_to_rare",
		existingTags: !0
	},
	OmenOnExaltConsumeQuality: {
		action: "add_mod_to_rare",
		catalysing: !0
	},
	OmenOnDivineRerollImplicits: {
		action: "reroll_mod_values",
		implicitsOnly: !0
	},
	OmenOnDivineSanctify: {
		action: "reroll_mod_values",
		sanctify: !0
	},
	OmenOnAbyssRerollOptions: {
		action: "reveal",
		revealReroll: !0
	},
	OmenOnAbyssGuarenteeLichTypeMod1: {
		action: "desecrate",
		revealTag: "ulaman_mod"
	},
	OmenOnAbyssGuarenteeLichTypeMod2: {
		action: "desecrate",
		revealTag: "amanamu_mod"
	},
	OmenOnAbyssGuarenteeLichTypeMod3: {
		action: "desecrate",
		revealTag: "kurgal_mod"
	},
	OmenOnChaosMapItemRarity: {
		action: "reroll",
		waystoneTag: "map_item_rarity"
	},
	OmenOnChaosMapPackSize: {
		action: "reroll",
		waystoneTag: "map_pack_size"
	},
	OmenOnChaosMapMonsterRarity: {
		action: "reroll",
		waystoneTag: "map_monster_rarity"
	},
	OmenOnChaosMapMonsterEffectiveness: {
		action: "reroll",
		waystoneTag: "map_monster_potency"
	}
}, fp = /* @__PURE__ */ new WeakMap();
function pp(e, t) {
	if (e.game === "poe2") {
		if (t.kind === "reveal") return "reveal";
		if (t.kind === "currency") {
			let n = e.crafting.currencies.find((e) => e.id === t.id)?.action;
			return n?.startsWith("abyssal_bench_ticket_") ? "desecrate" : n;
		}
		if (t.kind === "essence" && e.crafting.poe2Essences.some((e) => e.id === t.id && (e.perfect || e.id.includes("/CurrencyCorruptedEssence")))) return "perfect_essence";
	}
}
function mp(e, t, n) {
	let r = pp(e, t);
	if (!r) return [];
	let i = fp.get(e);
	i || (i = e.crafting.currencies.filter((e) => dp[e.id.split("/").at(-1)]), fp.set(e, i));
	let a = t.kind === "currency" ? e.crafting.currencies.find((e) => e.id === t.id)?.action : void 0;
	return i.filter((t) => {
		let i = dp[t.id.split("/").at(-1)];
		return i && i.action === r && (!i.sanctify || e.crafting.sanctification !== null) && (!i.waystoneTag || !n || n === "Map") && (!i.catalysing || !n || e.crafting.catalysts.some((e) => e.itemClasses.includes(n))) && (!i.revealTag || /^abyssal_bench_ticket_(weapon|jewellery|breach)(_|$)/.test(a ?? ""));
	});
}
function hp(e, t) {
	let n = "omens" in t ? t.omens ?? [] : [], r = {};
	if (!n.length) return r;
	if (new Set(n).size !== n.length) throw Error("An omen can only be used once per craft.");
	let i = mp(e, t);
	for (let e of n) {
		if (!i.some((t) => t.id === e)) throw Error("This omen does not apply to the selected craft.");
		let { action: t, waystoneTag: n, ...a } = dp[e.split("/").at(-1)];
		n && (r.excludedWaystoneTags ??= [], r.excludedWaystoneTags.push(n));
		for (let [e, t] of Object.entries(a)) {
			if (Object.hasOwn(r, e)) throw Error("The selected omens have conflicting effects.");
			Object.assign(r, { [e]: t });
		}
	}
	if (r.sanctify && r.implicitsOnly) throw Error("Sanctification and Blessed Divine omens cannot be combined in this model.");
	if (r.putrefy && Object.keys(r).length > 1) throw Error("Putrefaction cannot be combined with directional or Lich omens.");
	if (r.excludedWaystoneTags) {
		if (r.excludedWaystoneTags.length > 3) throw Error("At most three Waystone reroll omens can be combined.");
		if (Object.keys(r).some((e) => e !== "excludedWaystoneTags")) throw Error("Combining Waystone reroll omens with other Chaos omens is not supported.");
	}
	return r;
}
// app/lib/crafting-properties.ts
var gp = {
	armour: "Armour",
	evasion: "Evasion Rating",
	energy_shield: "Energy Shield",
	ward: "Ward",
	physicalDps: "Physical DPS",
	elementalDps: "Elemental DPS",
	chaosDps: "Chaos DPS",
	totalDps: "Total DPS",
	attacksPerSecond: "Attacks per Second",
	reloadTime: "Reload Time (s)",
	criticalStrikeChance: "Critical Strike Chance (%)",
	blockChance: "Block Chance (%)",
	requiredLevel: "Required Character Level",
	strengthRequirement: "Strength Requirement",
	dexterityRequirement: "Dexterity Requirement",
	intelligenceRequirement: "Intelligence Requirement",
	lifeRecovery: "Life Recovery",
	manaRecovery: "Mana Recovery",
	flaskDuration: "Flask / Charm Duration (s)",
	maximumCharges: "Maximum Charges",
	chargesPerUse: "Charges per Use",
	elementalResistance: "Elemental Resistance (%)",
	totalResistance: "Total Resistance (%)",
	flatLife: "Flat Life"
}, _p = {
	armour: [
		"local_base_physical_damage_reduction_rating",
		"local_physical_damage_reduction_rating_+%",
		"local_armour_and_evasion_+%",
		"local_armour_and_energy_shield_+%"
	],
	evasion: [
		"local_base_evasion_rating",
		"local_evasion_rating_+%",
		"local_armour_and_evasion_+%",
		"local_evasion_and_energy_shield_+%"
	],
	energy_shield: [
		"local_energy_shield",
		"local_energy_shield_+%",
		"local_armour_and_energy_shield_+%",
		"local_evasion_and_energy_shield_+%"
	],
	ward: ["local_ward", "local_ward_+%"]
}, vp = (e) => Math.round((e + 2 ** -52 * Math.max(1, e)) * 100) / 100;
function yp(e, t) {
	let n = e.base(t), r = n.levelRules.inventory_type;
	if (n.levelRules.no_level_requirement === "true") return 0;
	if (!r || ["HeistNpcEquipment", "Leaguestone"].includes(r)) return;
	let i = [
		"Weapon",
		"Helm",
		"BodyArmour",
		"Boots",
		"Gloves"
	].includes(r) || r === "Offhand" && n.item_class !== "Quiver", a = r === "Flask" ? 2 : 4, o = (i || r === "Flask") && n.drop_level > a ? n.drop_level : 0, s = [
		...n.implicits,
		...t.implicits.map((e) => e.id),
		...t.mods.map((e) => e.id),
		...(t.enchantments ?? []).map((e) => e.id)
	], c = Math.max(o, ...s.map((t) => Math.floor(e.mod(t).required_level * 4 / 5)), ...(t.augments ?? []).map((t) => e.catalog.crafting.augments.find((e) => e.id === t).requiredLevel), t.socketedJewel ? yp(e, t.socketedJewel) ?? 0 : 0);
	return c > 1 ? c : 0;
}
function bp(e, t) {
	let n = {};
	if (t.destroyed) return n;
	let r = yp(e, t);
	r !== void 0 && (n.requiredLevel = r);
	let i = e.statTotals(t);
	for (let n of t.enchantments ?? []) {
		let r = e.mod(n.id);
		if (r.generation_type.startsWith("flask_enchantment_")) continue;
		let a = Du(e.catalog, n, t);
		for (let [e, t] of r.stats.entries()) i.set(t.id, (i.get(t.id) ?? 0) + a[e]);
	}
	let a = (e) => i.get(e) ?? 0, o = Math.max(0, t.quality + a("local_item_quality_+")), s = e.base(t).flask, c = (e) => Math.floor(Math.max(0, e) + 1e-9), l = e.base(t).requirements, u = [
		"strength",
		"dexterity",
		"intelligence"
	];
	if (l || u.some((e) => a(`local_${e}_requirement_+`)) || a("local_strength_and_intelligence_requirement_+")) {
		let e = {
			strength: 0,
			dexterity: 0,
			intelligence: 0
		};
		for (let t of u) {
			let n = u.filter((e) => e !== t), r = n.reduce((e, t) => e + a(`local_requirements_%_to_convert_to_${t}`), 0), i = l?.[t] ?? 0;
			e[t] += i * (1 - Math.min(100, r) / 100);
			for (let t of n) e[t] += i * a(`local_requirements_%_to_convert_to_${t}`) / Math.max(100, r);
		}
		for (let t of u) {
			let r = a(`local_${t}_requirement_+`) + (t === "dexterity" ? 0 : a("local_strength_and_intelligence_requirement_+"));
			n[`${t}Requirement`] = a("local_no_attribute_requirements") ? 0 : c((e[t] + r) * (1 + (a("local_attribute_requirements_+%") + a(`local_${t}_requirement_+%`)) / 100));
		}
	}
	s.charges_max !== null && (n.maximumCharges = c((s.charges_max + a("local_extra_max_charges")) * (1 + a("local_max_charges_+%") / 100))), s.charges_per_use !== null && (n.chargesPerUse = c(s.charges_per_use * (1 + a("local_charges_used_+%") / 100)));
	for (let e of ["life", "mana"]) {
		let t = s[`${e}_per_use`];
		t !== null && (n[e === "life" ? "lifeRecovery" : "manaRecovery"] = Math.round(Math.max(0, t * (1 + o / 100) * (1 + (a("local_flask_amount_to_recover_+%") + a(`local_flask_${e}_to_recover_+%`)) / 100))));
	}
	if (s.duration !== null) {
		let e = (s.life_per_use ?? 0) > 0 || (s.mana_per_use ?? 0) > 0, t = s.duration / 10 * (1 + (a("local_flask_duration_+%") + a("local_charm_duration_+%")) / 100) * (1 + a("local_flask_duration_+%_final") / 100) * (e ? 1 / (1 + a("local_flask_recovery_speed_+%") / 100) : 1 + o / 100);
		n.flaskDuration = Math.round(Math.max(0, t) * 10) / 10;
	}
	let d = (e, t) => Math.floor(o * a(e) / t), f = a("base_cold_damage_resistance_%") + a("base_fire_damage_resistance_%") + a("base_lightning_damage_resistance_%") + 2 * (a("fire_and_lightning_damage_resistance_%") + a("fire_and_cold_damage_resistance_%") + a("cold_and_lightning_damage_resistance_%")) + a("cold_and_chaos_damage_resistance_%") + a("fire_and_chaos_damage_resistance_%") + a("lightning_and_chaos_damage_resistance_%") + 3 * (a("base_resist_all_elements_%") + a("resist_all_%")) + d("local_fire_resistance_%_per_2%_quality", 2) + d("local_cold_resistance_%_per_2%_quality", 2) + d("local_lightning_resistance_%_per_2%_quality", 2);
	n.elementalResistance = f, n.totalResistance = f + a("base_chaos_damage_resistance_%") + a("cold_and_chaos_damage_resistance_%") + a("fire_and_chaos_damage_resistance_%") + a("lightning_and_chaos_damage_resistance_%") + a("resist_all_%"), n.flatLife = a("base_maximum_life") + d("local_maximum_life_per_2%_quality", 2);
	let p = (e) => a(`local_quality_does_not_increase_${e}`) ? 1 : 1 + o / 100;
	for (let r of Ud.options) {
		let [i, ...o] = _p[r];
		if (!e.base(t).defences[r] && !a(i)) continue;
		let s = Hf(e.catalog, t, r), c = o.reduce((e, t) => e + a(t), 0) + (r === "ward" ? 0 : a("local_armour_and_evasion_and_energy_shield_+%"));
		n[r] = s === void 0 ? void 0 : Math.max(0, Math.round((s + a(i)) * (1 + c / 100) * p("defences")));
	}
	let m = e.base(t).combat;
	if (m.block !== null && (m.block > 0 || a("local_additional_block_chance_%") > 0) && (n.blockChance = Math.floor(Math.max(0, (m.block + a("local_additional_block_chance_%")) * (1 + a("local_block_chance_+%") / 100)))), m.attack_time && m.attack_time > 0) {
		let e = a("local_attack_speed_+%") + d("local_attack_speed_+%_per_8%_quality", 8), t = vp(Math.max(0, 1e3 / m.attack_time * (1 + e / 100)));
		n.attacksPerSecond = t, m.reload_time && m.reload_time > 0 && (n.reloadTime = vp(m.reload_time / 1e3 / (1 + (e + a("local_reload_speed_+%")) / 100))), m.critical_strike_chance !== null && (n.criticalStrikeChance = vp(Math.max(0, (m.critical_strike_chance + a("local_critical_strike_chance")) / 100 * (1 + (a("local_critical_strike_chance_+%") + d("local_critical_strike_chance_+%_per_4%_quality", 4)) / 100))));
		let r = (e) => {
			let n = e === "physical", r = e !== "physical" && e !== "chaos", i = (1 + (a(`local_${e}_damage_+%`) + (r ? a("local_elemental_damage_+%") + d("local_elemental_damage_+%_per_2%_quality", 2) : 0)) / 100) * (n ? p("physical_damage") : 1);
			return (Math.max(0, Math.round(((n ? m.physical_damage_min ?? 0 : 0) + a(`local_minimum_added_${e}_damage`)) * i)) + Math.max(0, Math.round(((n ? m.physical_damage_max ?? 0 : 0) + a(`local_maximum_added_${e}_damage`)) * i))) / 2 * t;
		}, i = r("physical"), o = r("fire") + r("cold") + r("lightning"), s = r("chaos");
		n.physicalDps = vp(i), n.elementalDps = vp(o), n.chaosDps = vp(s), n.totalDps = vp(i + o + s);
	}
	return n;
}
function xp(e, t, n) {
	if (!Object.keys(n.properties ?? {}).length) return !0;
	let r = bp(e, t);
	return Jd.options.every((e) => {
		let t = n.properties?.[e];
		if (!t) return !0;
		if (Object.hasOwn(r, e) && r[e] === void 0) throw Error(`Set the starting Base ${gp[e]} roll before checking final item properties.`);
		let i = r[e] ?? 0;
		return (t.min === void 0 || i >= t.min) && (t.max === void 0 || i <= t.max);
	});
}
// app/schemas/recombinator-catalog.ts
var Sp = Qs([A(), M().nonnegative()]), Cp = F({
	id: A().min(1),
	name: A().min(1),
	itemClass: A().min(1),
	tags: P(A())
}), wp = F({
	id: A().min(1),
	name: A(),
	text: A().min(1),
	side: z(["prefixes", "suffixes"]),
	level: M().int().nonnegative(),
	maxLevel: M().int().nonnegative(),
	groups: P(A().min(1)).min(1),
	addsTags: P(A()),
	spawn: P(Sp),
	generation: P(Sp),
	crafted: N().optional(),
	exclusive: N().optional()
}), Tp = F({
	id: A(),
	name: A(),
	kind: z(["essence", "bench"]),
	mod: A(),
	itemClasses: P(A()),
	cost: P(F({
		name: A(),
		amount: M().int().positive()
	}))
});
F({
	format: B(1),
	game: B("poe1"),
	patch: A().min(1),
	source: F({
		manifestSha256: A().regex(/^[a-f0-9]{64}$/),
		basesSha256: A().regex(/^[a-f0-9]{64}$/),
		modsSha256: A().regex(/^[a-f0-9]{64}$/),
		craftingSha256: A().regex(/^[a-f0-9]{64}$/).optional(),
		craftingDataSha256: A().regex(/^[a-f0-9]{64}$/).optional()
	}),
	bases: P(Cp).min(1),
	mods: P(wp).min(1),
	recipes: P(Tp).optional()
});
// app/schemas/recombinator.ts
var Ep = A().trim().min(1).max(80), Dp = F({
	id: A().trim().min(1).max(256),
	label: A().min(1).max(2e3).optional(),
	group: A().trim().min(1).max(256),
	groups: P(A().min(1).max(256)).min(1).optional(),
	exclusive: N(),
	nonNative: N().default(!1),
	spawn: P(Qs([A(), M().nonnegative()])).optional(),
	crafted: N().optional()
}), Op = P(Dp).max(3), kp = F({
	kind: z(["essence", "bench"]),
	side: z(["prefixes", "suffixes"]),
	affix: Dp,
	itemClasses: P(A()).min(1),
	keepInputMods: N().optional()
}), Ap = F({
	prefixes: Op,
	suffixes: Op,
	base: Cp.optional()
}).superRefine((e, t) => {
	for (let n of ["prefixes", "suffixes"]) {
		let r = e[n].flatMap(jp);
		new Set(r).size !== r.length && t.addIssue({
			code: "custom",
			path: [n],
			message: "An item cannot have two modifiers in the same mod group."
		});
	}
	[...e.prefixes, ...e.suffixes].filter((e) => e.exclusive).length > 1 && t.addIssue({
		code: "custom",
		message: "The guide supports at most one exclusive modifier per item."
	});
});
F({
	patch: A().trim().min(1).max(32).optional(),
	items: P(F({
		id: Ep,
		name: Ep,
		item: Ap
	})).min(2).max(12),
	steps: P(F({
		id: Ep,
		name: Ep,
		left: Ep,
		right: Ep,
		leftPreparation: kp.optional(),
		rightPreparation: kp.optional(),
		removeCrafted: N().optional()
	})).min(1).max(8)
}).superRefine((e, t) => {
	let n = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Map();
	for (let r of [...e.items, ...e.steps]) n.has(r.id) && t.addIssue({
		code: "custom",
		message: "Items and steps need unique IDs."
	}), "left" in r && (!n.has(r.left) || !n.has(r.right)) && t.addIssue({
		code: "custom",
		message: `${r.name}: choose an item or an earlier step for both inputs.`
	}), n.add(r.id);
	let i = e.steps.flatMap((e) => [e.leftPreparation, e.rightPreparation]).flatMap((e) => e ? [{
		prefixes: e.side === "prefixes" ? [e.affix] : [],
		suffixes: e.side === "suffixes" ? [e.affix] : []
	}] : []);
	for (let n of [...e.items.map((e) => e.item), ...i]) for (let e of ["prefixes", "suffixes"]) for (let i of n[e]) {
		let n = JSON.stringify([
			e,
			i.group,
			jp(i).toSorted(),
			i.exclusive,
			i.nonNative,
			i.spawn,
			i.crafted ?? !1
		]), a = r.get(i.id);
		a && a !== n && t.addIssue({
			code: "custom",
			message: `“${i.id}” must use the same affix type, group and modifier flags on every item.`
		}), r.set(i.id, n);
	}
});
function jp(e) {
	return [.../* @__PURE__ */ new Set([e.group, ...e.groups ?? []])];
}
function Mp(e, t) {
	let n = new Set(jp(e));
	return jp(t).some((e) => n.has(e));
}
// app/lib/recombinator.ts
var Np = [
	[
		100,
		0,
		0,
		0
	],
	[
		41,
		59,
		0,
		0
	],
	[
		0,
		67,
		33,
		0
	],
	[
		0,
		39,
		52,
		10
	],
	[
		0,
		11,
		59,
		31
	],
	[
		0,
		0,
		43,
		57
	],
	[
		0,
		0,
		28,
		72
	]
];
function Pp(e) {
	return JSON.stringify([
		e.prefixes.map((e) => e.id).sort(),
		e.suffixes.map((e) => e.id).sort(),
		e.base?.id
	]);
}
function Fp(e, t) {
	return e.nonNative ? 0 : e.exclusive || !e.spawn || !t ? 1e3 : e.spawn.find(([e]) => t.tags.includes(e))?.[1] ?? 0;
}
function Ip(e, t, n) {
	let r = /* @__PURE__ */ new Map();
	function i(e, a, o) {
		if (a.length === t || e.length === 0) {
			let e = a.toSorted((e, t) => e.id.localeCompare(t.id)), t = JSON.stringify(e.map((e) => e.id)), n = r.get(t);
			n ? n.probability += o : r.set(t, {
				affixes: e,
				probability: o
			});
			return;
		}
		let s = e.reduce((e, t) => e + n(t), 0);
		for (let t of e) i(e.filter((e) => !Mp(e, t) && !(t.exclusive && e.exclusive)), [...a, t], o * n(t) / s);
	}
	return i(e, [], 1), [...r.values()];
}
function Lp(e, t, n = !1, r = !1, i = !1) {
	let a = Np[(i ? e.filter((e) => Fp({
		...e,
		nonNative: !1
	}, t) > 0) : e).length], o = a.reduce((e, t) => e + t, 0);
	return a.flatMap((i, a) => i === 0 ? [] : Ip(e.filter((e) => Fp(e, t) > 0 && !(n && e.exclusive)), a, (e) => r ? Fp(e, t) : 1).map((e) => ({
		...e,
		probability: e.probability * i / o
	})));
}
function Rp(e, t, n) {
	let r = Pp(t), i = e.get(r);
	i ? i.probability += n : e.set(r, {
		item: t,
		probability: n
	});
}
function zp(e, t, n, r = !1) {
	let i = [...e.prefixes, ...t.prefixes], a = [...e.suffixes, ...t.suffixes];
	if (i.some((e) => a.some((t) => Mp(e, t)))) throw Error("A mod group appears in both prefixes and suffixes. This model does not support that combination; use compatible bases and modifier groups.");
	if (![e, t].every((e) => e.prefixes.length === 1 && e.suffixes.length === 1 && [...e.prefixes, ...e.suffixes].some((e) => e.exclusive && e.crafted)) && [i, a].some((e) => e.filter((e) => e.exclusive).length > 1)) throw Error("This step can combine more than one exclusive modifier on the same affix side. Only two one-mod magic items with an exclusive bench craft each support this setup.");
	if ([...i, ...a].filter((e) => e.exclusive).length === 2 && (i.length !== 2 || a.length !== 2 || [e, t].some((e) => e.prefixes.length !== 1 || e.suffixes.length !== 1))) throw Error("More than one exclusive modifier is supported only for two one-mod magic items with opposite-side bench crafts.");
	if (i.length === 1 && a.length === 1 && e.prefixes.length + e.suffixes.length === 1 && t.prefixes.length + t.suffixes.length === 1 && [...i, ...a].every((e) => !e.exclusive)) {
		let e = i.filter((e) => Fp(e, n) > 0), t = a.filter((e) => Fp(e, n) > 0), r = /* @__PURE__ */ new Map();
		for (let i of [
			{
				prefixes: e,
				suffixes: t
			},
			{
				prefixes: e,
				suffixes: []
			},
			{
				prefixes: [],
				suffixes: t
			}
		]) Rp(r, {
			...i,
			...n ? { base: n } : {}
		}, 1 / 3);
		return [...r.values()];
	}
	let o = /* @__PURE__ */ new Map(), s = [...i, ...a].some((e) => e.exclusive), c = s ? ["prefixes", "suffixes"] : ["prefixes"];
	for (let e of c) {
		let t = e === "prefixes" ? "suffixes" : "prefixes", l = {
			prefixes: i,
			suffixes: a
		};
		for (let i of Lp(l[e], n, !1, s, r)) for (let a of Lp(l[t], n, i.affixes.some((e) => e.exclusive), s, r)) {
			let r = {
				prefixes: [],
				suffixes: [],
				...n ? { base: n } : {}
			};
			r[e] = i.affixes, r[t] = a.affixes, Rp(o, r, i.probability * a.probability / c.length);
		}
	}
	return [...o.values()];
}
// app/lib/crafting-recombination.ts
function Bp(e, t) {
	let n = e.catalog.bases[t.baseId];
	return e.catalog.game === "poe1" && n.domain === "item" && e.catalog.crafting.recombinableClasses.includes(n.item_class);
}
function Vp(e, t) {
	let n = e.base(t), r = e.effectiveInfluences(t);
	return [...n.tags, ...e.catalog.crafting.influences.filter((e) => e.itemClass === n.item_class && r.includes(e.influence)).map((e) => e.tag)];
}
function Hp(e, t, n) {
	let r = e.base(t).item_class;
	return e.catalog.game === "poe1" && e.catalog.crafting.essences.some((e) => e.mods[r] === n);
}
function Up(e, t, n) {
	for (let r of [t, n]) {
		if (e.validateItem(r), !Bp(e, r)) throw Error("Recombination requires an extracted PoE 1 equipment class.");
		if (r.corrupted || r.mirrored || r.destroyed || r.reveal) throw Error("Corrupted, mirrored, destroyed and unrevealed recombination inputs are not supported.");
		let t = e.limits({
			...r,
			rarity: "rare"
		});
		if (t.prefixes !== 3 || t.suffixes !== 3 || t.max !== 6) throw Error("Recombination with altered affix limits is not supported yet.");
		if (r.imprint) throw Error("Recombination of imprint checkpoints is not modeled yet.");
		let n = Vp(e, r);
		for (let t of r.mods) {
			let i = e.mod(t.id);
			if (!(i.domain === "item" && (i.spawn_weights.find((e) => n.includes(e.tag))?.weight ?? 0) > 0 && (i.generation_weights.find((e) => n.includes(e.tag))?.weight ?? 100) > 0 || Hp(e, r, t.id) || rp(e.catalog, r, t.id) || cp(e.catalog, r, t.id) || i.domain === "ducat_crafted" && i.spawn_weights.some((e) => e.tag === "deepwater_pantheon_aspect" && e.weight > 0) || Kf(e.catalog, {
				...r,
				level: t.origin?.level ?? r.level
			}, t.id) || up(e.catalog, {
				...r,
				level: t.origin?.level ?? r.level
			}, t.id) || i.domain === "crafted" && i.implicit_tags.includes("unveiled_mod"))) throw Error("This recombination model supports natural and extracted essence modifiers, Breach modifiers, the three Incursion glove suffixes, Delve minion boots, Janus helmet rarity and unveiled bench crafts.");
		}
	}
	if (e.base(t).item_class !== e.base(n).item_class) throw Error("Recombination inputs must have the same item class.");
	let r = ap(e.catalog), i = Math.min(Math.max(t.level, n.level), Math.floor((t.level + n.level) / 2) + 2), a = [];
	for (let [o, s] of [t, n].entries()) {
		let c = r ? s.level : i, l = e.base(s), u = Vp(e, s), d = /* @__PURE__ */ new Map(), f = (t, n) => {
			let r = {
				prefixes: [],
				suffixes: []
			};
			for (let [i, a] of t.mods.entries()) {
				let s = e.mod(a.id), l = `${n}:${i}`;
				d.set(l, {
					...a,
					...a.attributeSource ? { attributeSource: void 0 } : {},
					...!a.crafted && (a.origin || t.level > c) ? { origin: {
						kind: "recombine",
						level: Math.max(a.origin?.level ?? 0, t.level)
					} } : {}
				});
				let f = (s.generation_weights.find((e) => u.includes(e.tag))?.weight ?? 100) / 100;
				r[s.generation_type === "prefix" ? "prefixes" : "suffixes"].push({
					id: l,
					group: s.groups[0],
					groups: s.groups,
					exclusive: a.crafted || s.is_essence_only || rp(e.catalog, t, a.id) || cp(e.catalog, t, a.id) || Kf(e.catalog, {
						...t,
						level: a.origin?.level ?? t.level
					}, a.id) || up(e.catalog, {
						...t,
						level: a.origin?.level ?? t.level
					}, a.id),
					nonNative: a.fractured && n !== o,
					crafted: a.crafted,
					spawn: s.spawn_weights.map((e) => [e.tag, e.weight * f])
				});
			}
			return r;
		}, p = f(t, 0), m = f(n, 1);
		for (let t of zp(p, m, {
			id: s.baseId,
			name: l.name,
			itemClass: l.item_class,
			tags: u
		}, r)) {
			let n = {
				...s,
				level: c,
				rarity: "rare",
				mods: [...t.item.prefixes, ...t.item.suffixes].map((e) => d.get(e.id))
			};
			a.push({
				value: e.validateItem(n),
				weight: t.probability / 2
			});
		}
	}
	return a;
}
// app/lib/crafting-reveal-probabilities.ts
function Wp(e) {
	return e === "poe2" ? [
		{
			value: 1,
			weight: 80
		},
		{
			value: 2,
			weight: 15
		},
		{
			value: 3,
			weight: 5
		}
	] : [{
		value: 3,
		weight: 1
	}];
}
function Gp(e, t, n) {
	let r = /* @__PURE__ */ new Map();
	for (let e of ["exclusive", "ordinary"]) for (let i of t[e]) {
		let t = [...i.mod.groups].sort(), a = !!(n && i.mod.implicit_tags.includes(n)), o = JSON.stringify([
			e,
			t.length ? t : i.id,
			a
		]), s = r.get(o) ?? {
			entries: [],
			groups: t,
			exclusive: e === "exclusive",
			guaranteed: a,
			weight: 0
		};
		s.entries.push(i), s.weight += i.weight, r.set(o, s);
	}
	let i = [...r.values()], a = i.map((e, t) => new Set(i.flatMap((n, r) => t === r || n.groups.some((t) => e.groups.includes(t)) ? [r] : []))), o = i.map(() => 0);
	function s(e, t, n, r) {
		let c = t < n ? e.filter((e) => i[e].exclusive) : [];
		c.length || (c = e.filter((e) => !i[e].exclusive)), !t && c.some((e) => i[e].exclusive && i[e].guaranteed) && (c = c.filter((e) => i[e].guaranteed));
		let l = c.reduce((e, t) => e + i[t].weight, 0);
		for (let u of c) {
			let c = r * i[u].weight / l;
			o[u] += c, t < 2 && s(e.filter((e) => !a[u].has(e)), t + 1, n, c);
		}
	}
	let c = Wp(e), l = c.reduce((e, t) => e + t.weight, 0);
	for (let { value: e, weight: t } of c) s(i.map((e, t) => t), 0, e, t / l);
	return new Map(i.flatMap((e, t) => e.entries.map((n) => [n.id, Math.min(1, o[t] * n.weight / e.weight)])));
}
// app/lib/crafting-strongboxes.ts
function Kp(e, t) {
	return e.bases[t.baseId]?.strongbox ? e.crafting.strongboxes.find((e) => e.id === t.baseId) : void 0;
}
function qp(e, t) {
	if (t.kind === "generate") return !0;
	if (t.kind !== "currency" || t.donor) return !1;
	let n = e.crafting.currencies.find((e) => e.id === t.id);
	if (t.omens?.length) {
		let n = mp(e, t, "Strongbox");
		if (t.omens.some((e) => !n.some((t) => t.id === e))) return !1;
	}
	return n?.action === "corrupt_item" ? n.id.endsWith("/CurrencyCorrupt") : !!n && [
		"transmute_to_magic",
		"reroll_magic",
		"add_mod_to_magic",
		"transmute_to_rare",
		"upgrade_magic_to_rare",
		"reroll",
		"add_mod_to_rare",
		"remove_random_mod",
		"convert_to_normal",
		"reroll_mod_values"
	].includes(n.action);
}
// app/lib/crafting-engine.ts
var Jp = class extends Error {
	item;
	cost;
	constructor(e, t, n) {
		super(e), this.item = t, this.cost = n;
	}
};
function Yp(e) {
	let t = e >>> 0, n = () => {
		t = t + 1831565813 >>> 0;
		let e = Math.imul(t ^ t >>> 15, 1 | t);
		return e ^= e + Math.imul(e ^ e >>> 7, 61 | e), ((e ^ e >>> 14) >>> 0) / 4294967296;
	};
	return {
		pick(e) {
			let t = e.reduce((e, t) => e + t.weight, 0);
			if (!(t > 0)) throw Error("No eligible outcomes for this craft.");
			let r = n() * t;
			for (let t of e) if (r -= t.weight, r < 0) return t.value;
			return e[e.length - 1].value;
		},
		integer: (e, t) => e + Math.floor(n() * (t - e + 1))
	};
}
var Z = {
	prefixes: "item_generation_cannot_change_prefixes",
	suffixes: "item_generation_cannot_change_suffixes",
	attack: "item_generation_cannot_roll_attack_affixes",
	caster: "item_generation_cannot_roll_caster_affixes",
	multiple: "item_generation_can_have_multiple_crafted_mods"
}, Xp = /* @__PURE__ */ new Set(["item_generation_cannot_change_x_prefixes", "item_generation_cannot_change_x_suffixes"]), Zp = /\/OmenOnAbyssAdd(?:Prefixes|Suffixes)$/, Qp = /* @__PURE__ */ new Set([
	"identify",
	"transmute_to_magic",
	"reroll_magic",
	"add_mod_to_magic",
	"transmute_to_rare",
	"upgrade_magic_to_rare",
	"reroll",
	"add_mod_to_rare",
	"remove_random_mod",
	"convert_to_normal",
	"reroll_mod_values",
	"reroll_implicit_mod",
	"fracture_random_mod",
	"add_influence_mod_to_rare",
	"upgrade_influence_mod",
	"transfer_item_influence",
	"add_mod_to_rare_eldritch",
	"remove_random_mod_eldritch",
	"replace_rare_mod_veiled",
	"reroll_rare_veiled",
	"inital_imprint",
	"restore_imprint",
	"add_jewellery_quality",
	"add_alternate_quality",
	"add_armour_quality",
	"add_weapon_quality",
	"add_flask_quality",
	"add_flask_injector",
	"add_flask_seal",
	"add_magic_item_quality",
	"add_armour_quality_hellscape",
	"add_weapon_quality_hellscape",
	"reroll_rare_hellscape",
	"upgrade_mod_tier_hellscape",
	"reroll_socket_numbers_hellscape",
	"add_mod_to_rare_hellscape",
	"consume_zana_influence_upgrade_mods",
	"apply_zana_influence",
	"enchant_map_zana_influence_drops",
	"mutated_add_mod_to_magic",
	"mutated_upgrade_magic_to_rare",
	"mutated_add_mod_to_rare",
	"reroll_rare_eldritch",
	"conflict_orb",
	"corrupt_item",
	...[
		1,
		2,
		3,
		4
	].flatMap((e) => [`add_cleansing_fire_implicit_${e}`, `add_great_tangle_implicit_${e}`])
]), $p = class {
	catalog;
	domains = /* @__PURE__ */ new Map();
	recipeClasses = /* @__PURE__ */ new Map();
	essenceMods = /* @__PURE__ */ new Set();
	attributes = /* @__PURE__ */ new Map();
	weightedPools = /* @__PURE__ */ new Map();
	eldritchFamilies = /* @__PURE__ */ new Map();
	eldritchPools = /* @__PURE__ */ new Map();
	corruptedPools = /* @__PURE__ */ new Map();
	recombinations = /* @__PURE__ */ new Map();
	statIds = /* @__PURE__ */ new Set();
	baseDomains;
	constructor(e) {
		this.catalog = e, this.baseDomains = new Set(Object.values(e.bases).map((e) => e.domain));
		for (let t of bl(e)) for (let e of t.mods) this.attributes.set(e, t.mods.filter((t) => t !== e));
		for (let t of e.crafting.mapQuality) for (let e of t.stats) this.statIds.add(e);
		for (let t of e.crafting.augments) {
			this.statIds.add(t.type.socketedStat);
			for (let e of t.rules) for (let t of e.stats) this.statIds.add(t.id);
		}
		for (let [t, n] of Object.entries(e.mods)) {
			for (let e of n.stats) this.statIds.add(e.id);
			if (["searing_exarch_implicit", "eater_of_worlds_implicit"].includes(n.generation_type) && X(n)) {
				let e = qf(n), r = this.eldritchFamilies.get(e) ?? [];
				r.push({
					id: t,
					mod: n,
					weight: 0
				}), this.eldritchFamilies.set(e, r);
			}
			if (!["prefix", "suffix"].includes(n.generation_type)) continue;
			let e = this.domains.get(n.domain) ?? [];
			e.push({
				id: t,
				mod: n,
				weight: 0
			}), this.domains.set(n.domain, e);
		}
		let t = (e, t) => this.recipeClasses.set(e, /* @__PURE__ */ new Set([...this.recipeClasses.get(e) ?? [], ...t]));
		for (let n of e.crafting.bench) n.mod && t(n.mod, n.itemClasses);
		let n = Object.entries(e.crafting.classes).filter(([, e]) => e.aspects).map(([e]) => e);
		for (let r of e.crafting.beasts) r.aspectMod && r.gameMode !== 2 && t(r.aspectMod, n);
		for (let n of e.crafting.essences) for (let [e, r] of Object.entries(n.mods)) t(r, [e]), this.essenceMods.add(r);
		for (let n of e.crafting.poe2Essences) for (let e of n.rules) {
			e.mod && (t(e.mod, e.itemClasses), this.essenceMods.add(e.mod));
			for (let n of e.outcomes) t(n.mod, e.itemClasses), this.essenceMods.add(n.mod);
		}
	}
	base(e) {
		let t = this.catalog.bases[e.baseId];
		if (!t) throw Error("The item base is missing from this build.");
		return t;
	}
	map(e) {
		return this.catalog.game === "poe1" ? this.catalog.crafting.maps.find((t) => t.id === e.baseId) : void 0;
	}
	waystone(e) {
		return this.catalog.game === "poe2" ? this.catalog.crafting.waystones.find((t) => t.id === e.baseId) : void 0;
	}
	recombinationDistribution(e, t) {
		let n = JSON.stringify([e, t]), r = this.recombinations.get(n);
		return r || (r = Up(this, e, t), (this.recombinations.size >= 128 || [...this.recombinations.values()].reduce((e, t) => e + t.length, r.length) > 1e4) && this.recombinations.clear(), this.recombinations.set(n, r)), r;
	}
	mod(e) {
		let t = this.catalog.mods[e];
		if (!t) throw Error(`Unknown modifier: ${e}`);
		return t;
	}
	hasImplicitStat(e, t) {
		return e.implicits.some((e) => this.mod(e.id).stats.some((n, r) => n.id === t && (e.values[r] ?? 0) > 0));
	}
	hasFixedInfluences(e) {
		return this.hasImplicitStat(e, "local_item_can_roll_all_influences");
	}
	effectiveInfluences(e) {
		return this.hasFixedInfluences(e) ? this.catalog.crafting.influences.filter((t) => t.itemClass === this.base(e).item_class).map((e) => e.influence).sort((e, t) => e - t) : e.influences;
	}
	limits(e) {
		let t = e.rarity[0].toUpperCase() + e.rarity.slice(1), n = this.catalog.crafting.rarities[t];
		if (!n) throw Error(`Missing rarity rules: ${t}`);
		let r = this.base(e);
		if (e.rarity === "rare" && (r.item_class === "Jewel" || r.domain === "abyss_jewel") && (n = {
			min: 3,
			max: 4,
			prefixes: 2,
			suffixes: 2
		}), e.rarity === "rare" && zd(this.catalog, e) && (n = {
			min: 4,
			max: 4,
			prefixes: 2,
			suffixes: 2
		}), e.rarity === "normal") return n;
		let i = au(this.catalog, e), a = (t) => [...e.implicits, ...e.mods].reduce((e, n) => e + this.mod(n.id).stats.reduce((e, r, i) => e + (r.id === t ? n.values[i] ?? 0 : 0), 0), i.get(t) ?? 0), o = Math.max(0, n.prefixes + a("local_maximum_prefixes_allowed_+")), s = Math.max(0, n.suffixes + a("local_maximum_suffixes_allowed_+")), c = this.counts(e), l = this.catalog.game === "poe2" && e.rarity === "rare" && r.item_class === "Jewel" ? Math.max(o, c.prefixes) + Math.max(s, c.suffixes) : Math.min(n.max + a("local_maximum_mods_allowed_+"), o + s);
		return {
			min: Math.min(n.min, l),
			max: l,
			prefixes: o,
			suffixes: s
		};
	}
	craftedLimit(e) {
		return (this.hasStat(e, Z.multiple) ? 3 : 1) + Al(this.catalog, e, "local_can_have_additional_crafted_mods") + (au(this.catalog, e).get("local_can_have_additional_crafted_mods") ?? 0);
	}
	corruptedAreaLimits(e) {
		if (e.corrupted && e.rarity === "rare" && this.map(e)) return {
			min: 4,
			max: 8,
			prefixes: 4,
			suffixes: 4
		};
		if (!e.corrupted || !this.waystone(e)) return;
		let t = this.limits(e);
		if (e.rarity === "rare" && this.counts(e).prefixes > 4) {
			let n = e.mods.filter((e) => e.fractured && this.mod(e.id).generation_type === "suffix").length;
			return {
				...t,
				max: 6 + Math.min(3, n),
				prefixes: 6,
				suffixes: Math.min(3, n)
			};
		}
		return {
			...t,
			max: Math.min(8, t.max + 4),
			prefixes: 4,
			suffixes: 4
		};
	}
	counts(e) {
		return {
			prefixes: e.mods.filter((e) => this.mod(e.id).generation_type === "prefix").length,
			suffixes: e.mods.filter((e) => this.mod(e.id).generation_type === "suffix").length
		};
	}
	hasStat(e, t) {
		return e.mods.some((e) => this.mod(e.id).stats.some((n, r) => n.id === t && (e.values[r] ?? 0) > 0));
	}
	currencySupported(e) {
		return yl.has(e) ? this.catalog.game === "poe1" && !!this.catalog.crafting.allflame : e === "reroll_variable_defences" ? this.catalog.game === "poe1" : e === "add_map_alt_quality" ? this.catalog.game === "poe1" && this.catalog.crafting.mapQuality.length > 0 : e === "add_random_jewellery_quality" ? this.catalog.game === "poe1" && this.catalog.crafting.taintedCatalysts.length > 0 : e.startsWith("incursion_") && this.catalog.game === "poe2" && this.catalog.crafting.qualityInfusers.some((t) => this.catalog.crafting.currencies.some((n) => n.id === t.id && n.action === e)) ? !0 : e === "incursion_corrupt_tablet" || e === "incursion_corrupt_equipment" || e === "add_equipment_socket" || e === "use_liquid_emotion" ? this.catalog.game === "poe2" : this.catalog.game === "poe2" && e.startsWith("abyssal_bench_ticket_") ? !0 : Qp.has(e) ? this.catalog.game === "poe1" || !/influence|eldritch|veiled|imprint|mutated|hellscape|conflict_orb|implicit_\d$/.test(e) : !1;
	}
	beastOperation(e) {
		let t = this.catalog.crafting.beasts.find((t) => t.id === e && t.gameMode !== 2);
		if (this.catalog.game === "poe1" && t) {
			if (t.talismanCraft) return "talisman";
			if (t.aspectMod) return "aspect";
			if (t.augmentation) return "augment";
			if (t.metamods.length) return "metamod";
			if (t.mapCorruption === "implicit") return "map-implicit";
			if (t.mapCorruption === "twice") return "map-twice";
			if (t.maximumSockets) return "maximum-sockets";
			if (t.maximumLinks) return "maximum-links";
			if (e === "EinharMasterCraft27") return "imprint";
			if (e === "EinharMasterCraft30") return "prefix-to-suffix";
			if (e === "EinharMasterCraft31") return "suffix-to-prefix";
			if (t.mod && this.mod(t.mod).domain === "flask" && this.mod(t.mod).generation_type === "suffix") return "flask";
		}
	}
	emotionRule(e, t) {
		if (this.catalog.game === "poe2") return this.catalog.crafting.liquidEmotions.find((e) => e.id === t)?.rules.find((t) => t.base === e.baseId);
	}
	emotionSupported(e) {
		return this.catalog.game === "poe2" && this.catalog.crafting.liquidEmotions.some((t) => t.id === e);
	}
	beastRequiresLevel(e) {
		return [
			"flask",
			"prefix-to-suffix",
			"suffix-to-prefix"
		].includes(this.beastOperation(e) ?? "");
	}
	beastAugmentationEligible(e, t) {
		let n = this.catalog.crafting.beasts.find((e) => e.id === t)?.augmentation;
		return !!(n && ("itemClass" in n ? this.base(e).item_class === n.itemClass : this.effectiveInfluences(e).includes(n.influence)));
	}
	benchRecipeFor(e, t) {
		let n = (e) => {
			let t = this.mod(e);
			return JSON.stringify([
				t.type,
				t.generation_type,
				t.stats
			]);
		}, r = this.catalog.crafting.bench.filter((e) => e.mod && e.itemClasses.includes(t));
		return r.find((t) => t.mod === e) ?? r.find((t) => n(t.mod) === n(e));
	}
	beastMetamodPool(e, t) {
		let n = this.catalog.crafting.beasts.find((e) => e.id === t);
		if (this.beastOperation(t) !== "metamod" || !n) return [];
		let r = e.rarity === "normal" ? {
			...e,
			rarity: "magic"
		} : e, i = this.limits(r), a = this.counts(r);
		if (r.mods.length >= i.max) return [];
		let o = new Set(r.mods.flatMap((e) => this.mod(e.id).groups));
		return this.recipePool(r, "bench").filter((e) => n.metamods.includes(e.id) && !e.mod.groups.some((e) => o.has(e)) && (e.mod.generation_type === "prefix" ? a.prefixes < i.prefixes : a.suffixes < i.suffixes)).map((e) => ({
			...e,
			weight: 1
		}));
	}
	availableFossils(e) {
		let t = this.base(e);
		return t.strongbox ? [] : this.catalog.crafting.fossils.filter((n) => {
			let r = (e) => e.tag && t.tags.includes(e.tag) || e.itemClass === t.item_class;
			return n.name && this.fossilSupported(n) && (!n.effects.includes("Fracture") || this.canFractureWithFossil(e)) && (!n.effects.includes("CorruptedImplicit") || this.corruptedModifiers(e).length > 0) && (!n.allowed.length || n.allowed.some(r)) && !n.forbidden.some(r);
		});
	}
	fossilSupported(e) {
		return !!e.name && (e.randomOutcomes.length > 0 || !(e.corruptedEssenceChance !== 0 && e.corruptedEssenceChance !== 100 || e.quality || e.mirrored || e.whiteSockets || e.descriptions.some((e) => /Split/.test(e))));
	}
	effectiveFossils(e, t) {
		let n = e.map((e) => this.fossil(e)), r = n.find((e) => e.randomOutcomes.length);
		if (r ? !t || !r.randomOutcomes.includes(t) : t !== void 0) throw Error("Choose a revealed Tangled Fossil effect pair only when using Tangled Fossil.");
		return n.map((e) => e.randomOutcomes.length ? this.fossil(t) : e);
	}
	gildedModifiers(e) {
		return this.catalog.game !== "poe1" || !this.availableFossils(e).some((e) => e.effects.includes("BetterSellPrice")) ? [] : [{
			id: Xf,
			mod: this.mod(Xf),
			weight: 0
		}];
	}
	canFractureWithFossil(e) {
		return this.catalog.crafting.classes[this.base(e).item_class]?.fracture && !this.effectiveInfluences(e).length && !e.mods.some((e) => e.fractured);
	}
	fossilWeight(e, t, n, r, i = 1) {
		let a = n.some((e) => e.lucky);
		a && (t = Math.round(t * (60 + e.required_level) / 100)), t *= i;
		let o = [];
		for (let r of n) {
			if (r.effects.includes("NoTagless") && !e.implicit_tags.length) return 0;
			let n = r.positive.find((t) => e.implicit_tags.includes(t.tag)), i = r.negative.find((t) => e.implicit_tags.includes(t.tag));
			n && o.push(n.weight / 100), i && (t *= i.weight / 100);
		}
		return o.length && (t *= r === "multiplicative" ? o.reduce((e, t) => e * t, 1) : o.reduce((e, t) => e + t, 0)), a ? Math.round(t) : t;
	}
	corruptedEssencePool(e, t = {}) {
		let n = this.base(e), r = this.effectiveFossils(t.fossils ?? [], t.tangled), i = [...e.mods.map((e) => this.mod(e.id)), ...r.flatMap((e) => e.forced.map((e) => this.mod(e)))], a = this.limits({
			...e,
			rarity: "rare"
		});
		if (i.length >= a.max) return [];
		let o = new Set(i.flatMap((e) => e.groups)), s = /* @__PURE__ */ new Set([...n.tags, ...i.flatMap((e) => e.adds_tags)]);
		return [...new Set(this.catalog.crafting.essences.flatMap((e) => e.corrupted && e.mods[n.item_class] ? [e.mods[n.item_class]] : []))].flatMap((e) => {
			let c = this.mod(e), l = this.catalog.crafting.modRules[e], u = c.generation_type;
			if (!["prefix", "suffix"].includes(u) || c.groups.some((e) => o.has(e)) || i.filter((e) => e.generation_type === u).length >= (u === "prefix" ? a.prefixes : a.suffixes) || l?.gameMode === 2 || l?.itemClasses.length && !l.itemClasses.includes(n.item_class)) return [];
			let d = this.fossilWeight(c, 1, r, t.logic, (c.generation_weights.find((e) => s.has(e.tag))?.weight ?? 100) / 100);
			return d > 0 ? [{
				id: e,
				mod: c,
				weight: d
			}] : [];
		});
	}
	validateMethod(e) {
		let t = vf.parse(e), n = this.catalog.crafting;
		if (Sl(t)) {
			let e = Cl(this.catalog, t);
			if (this.catalog.game !== "poe1" || !e) throw Error("Allflame is unavailable for this crafting method.");
			if (e.outcomes.min !== e.outcomes.max) throw Error("This Allflame outcome-count distribution is unavailable.");
			if (t.kind === "fossils" && t.ids.some((e) => this.fossil(e).effects.includes("CorruptedImplicit"))) throw Error("Allflame cannot use a fossil that corrupts the item.");
		}
		if (t.kind === "generate") {
			if (t.breachRings !== void 0) {
				if (this.catalog.game !== "poe1" || t.id !== "rare") throw Error("Breach rings apply only to rare PoE 1 Grasping Mail generation.");
				if (t.breachRings !== "legacy" && Object.values(t.breachRings).reduce((e, t) => e + t, 0) !== 60) throw Error("Choose exactly 60 Breach rings.");
			}
			return t;
		}
		if (t.kind === "genesis") return Qf(this.catalog, t.nodes), t;
		if (hp(this.catalog, t), t.kind === "socket_jewel" || t.kind === "remove_jewel") {
			if (this.catalog.game !== "poe2") throw Error("Equipment Jewel sockets are only available in PoE 2.");
			t.kind === "socket_jewel" && t.jewel && this.validateSocketedJewel(t.jewel.item);
		} else if (t.kind === "reveal") for (let e of t.preferred) {
			let t = this.mod(e);
			if (t.domain !== this.revealDomain() && !(this.catalog.game === "poe2" && !t.is_essence_only && ["prefix", "suffix"].includes(t.generation_type) && this.baseDomains.has(t.domain))) throw Error("Reveal preferences must be eligible explicit modifiers for this game.");
		}
		else if (t.kind === "upgrade_augment") {
			if (!Zl(U(this.catalog, t.id))) throw Error("This augment does not upgrade socketed Runes.");
		} else if (t.kind === "augment") {
			if (!Jl(U(this.catalog, t.id))) throw Error("This augment has a special crafting effect that is not supported yet.");
		} else if (t.kind === "currency") {
			let e = n.currencies.find((e) => e.id === t.id);
			if (!e || !this.currencySupported(e.action)) throw Error("This currency action is not supported.");
			if (yl.has(e.action) && !Sl(t)) throw Error("This Ducat requires Allflame crafting.");
			if (["add_jewellery_quality", "add_alternate_quality"].includes(e.action) && !n.catalysts.some((e) => e.id === t.id)) throw Error("This currency has no extracted catalyst quality effect.");
			if (t.donor) {
				if (e.action !== "transfer_item_influence") throw Error("This currency does not use a donor item.");
				this.validateItem(t.donor.item);
			}
		} else if (t.kind === "recombine") {
			if (this.catalog.game !== "poe1") throw Error("This recombination model is available only in PoE 1.");
			t.donor && this.validateItem(t.donor.item);
		} else if (t.kind === "essence") {
			if (!(this.catalog.game === "poe1" ? n.essences : n.poe2Essences).find((e) => e.id === t.id)) throw Error("Unknown essence.");
			if (this.catalog.game === "poe2" && !this.essenceSupported(t.id)) throw Error("This essence requires an outcome rule that is not supported yet.");
		} else if (t.kind === "anoint") {
			for (let e of Of(t)) jf(this.catalog, e);
			if (t.additional?.length && Of(t).some((e) => jf(this.catalog, e).type !== "InfectedMap")) throw Error("Multiple oils in one craft require Blighted Map recipes.");
			if (new Set(t.oils).size !== (t.oils?.length ?? 0) || t.oils?.some((e) => !n.anointing.items.some((t) => t.id === e && [1, 2].includes(t.useType)))) throw Error("Unsupported additional anointing oil.");
		} else if (t.kind === "locus") {
			if (this.catalog.game !== "poe1" || t.id !== n.locus?.id) throw Error("Choose the extracted Locus of Corruption.");
		} else if (t.kind === "bench") {
			let e = n.bench.find((e) => e.id === t.id);
			if (!e) throw Error("Unknown bench recipe.");
			if (t.skipOnConflict && !e.mod) throw Error("Skipping conflicts is available only for bench modifier additions.");
			if (e.mod ? !["prefix", "suffix"].includes(this.mod(e.mod).generation_type) : !e.enchantment && !e.socketCount && !e.linkCount && ![
				0,
				1,
				8,
				9
			].includes(e.action ?? -1)) throw Error("This bench action is not supported.");
			if (e.mod && this.mod(e.mod).stats.some((e) => Xp.has(e.id))) throw Error("This bench craft is not supported yet.");
		} else if (t.kind === "beast") {
			if (!this.beastOperation(t.id)) throw Error("This beastcraft is not supported.");
			if (this.beastRequiresLevel(t.id)) {
				let e = n.beasts.find((e) => e.id === t.id), r = Math.max(1, ...e.components.map((e) => e.level));
				if (t.level === void 0 || t.level < r) throw Error(`Choose a beast level of at least ${r}.`);
			}
		} else if (t.kind === "harvest") {
			let e = n.harvest.find((e) => e.id === t.id);
			if (!e || e.gameMode === 2) throw Error("Unknown or Ruthless-only Harvest recipe.");
			if (!this.harvestSupported(e.id)) throw Error("This Harvest operation is not supported yet.");
		} else {
			if (new Set(t.ids).size !== t.ids.length) throw Error("A fossil can only be used once per resonator.");
			let e = n.currencies.find((e) => e.id === t.resonator);
			if (!e || !["delve_currency_upgrade", "delve_currency_reroll"].includes(e.action)) throw Error("Choose an extracted resonator.");
			if (Number(e.id.at(-1)) !== t.ids.length) throw Error("The resonator must have one socket per fossil.");
			for (let e of t.ids) {
				let t = this.fossil(e);
				if (!this.fossilSupported(t)) throw Error(`${t.name} has special rules that are not supported yet.`);
			}
			this.effectiveFossils(t.ids, t.tangled);
		}
		return t;
	}
	implicitPool(e, t, n) {
		let r = this.base(e);
		return Object.entries(this.catalog.mods).flatMap(([e, i]) => {
			if (i.generation_type !== t || n !== void 0 && X(i) !== n) return [];
			let a = this.catalog.crafting.modRules[e];
			if (a?.gameMode === 2 || a?.itemClasses.length && !a.itemClasses.includes(r.item_class)) return [];
			let o = (i.spawn_weights.find((e) => r.tags.includes(e.tag))?.weight ?? 0) * (i.generation_weights.find((e) => r.tags.includes(e.tag))?.weight ?? 100) / 100;
			return o > 0 ? [{
				id: e,
				mod: i,
				weight: o
			}] : [];
		});
	}
	corruptedModifiers(e) {
		let t = this.base(e);
		if (!this.catalog.crafting.classes[t.item_class]?.corrupt && (this.catalog.game !== "poe1" || t.item_class !== "Map" || t.domain !== "area")) return [];
		let n = /* @__PURE__ */ new Set([
			...t.tags,
			...e.mods.flatMap((e) => this.mod(e.id).adds_tags),
			...ou(this.catalog, e)
		]), r = JSON.stringify([
			e.baseId,
			e.level,
			[...n].sort()
		]), i = this.corruptedPools.get(r);
		if (i) return i;
		let a = Object.entries(this.catalog.mods).flatMap(([r, i]) => {
			let a = this.catalog.crafting.modRules[r];
			if (i.generation_type !== "corrupted" || i.domain !== t.domain || (a?.spawnLevel ?? i.required_level) > e.level || i.maximum_level > 0 && i.maximum_level < e.level || this.catalog.game === "poe1" && a?.gameMode === 2 || a?.itemClasses.length && !a.itemClasses.includes(t.item_class)) return [];
			let o = (i.spawn_weights.find((e) => n.has(e.tag))?.weight ?? 0) * (i.generation_weights.find((e) => n.has(e.tag))?.weight ?? 100) / 100;
			return o > 0 ? [{
				id: r,
				mod: i,
				weight: o
			}] : [];
		});
		return this.corruptedPools.size >= 256 && this.corruptedPools.delete(this.corruptedPools.keys().next().value), this.corruptedPools.set(r, a), a;
	}
	replaceCorruptedImplicit(e, t, n, r = !1) {
		let i = this.corruptedModifiers(e);
		if (!i.length || n && !i.some((e) => e.id === n)) throw Error("No eligible corrupted implicit for this base and item level.");
		let a = e.implicits.find((e) => this.mod(e.id).generation_type === "corrupted"), o = a && !r ? [a] : e.implicits.filter((e) => !this.mod(e.id).stats.some((e) => e.id === "local_implicit_mod_cannot_be_changed"));
		if (o.length) {
			let n = t.pick(o.map((e) => ({
				value: e,
				weight: 1
			})));
			e.implicits = e.implicits.filter((e) => e !== n);
		}
		if (r) {
			let t = new Set(e.implicits.flatMap((e) => this.mod(e.id).groups));
			if (i = i.filter((e) => !e.mod.groups.some((e) => t.has(e))), !i.length) throw Error("No compatible corrupted implicit remains for this item.");
		}
		let s = n ?? t.pick(i.map((e) => ({
			value: e.id,
			weight: e.weight
		})));
		e.implicits.push(this.rollMod(s, t)), e.corrupted = !0;
	}
	corruptionKind(e) {
		let t = this.base(e);
		if (Kp(this.catalog, e)) return "strongbox";
		if (this.map(e)) return "map";
		if (this.catalog.crafting.classes[t.item_class]?.corrupt) {
			if (t.domain === "flask") return "quality";
			if (this.catalog.game === "poe1" && (t.item_class === "Jewel" || t.domain === "abyss_jewel")) return "poe1-jewel";
			if (Vd(this.catalog, e)) return "jewel";
			if (this.waystone(e)) return "waystone";
			if (t.domain === "item" && t.tags.some((e) => [
				"armour",
				"weapon",
				"wand",
				"staff",
				"sceptre",
				"ring",
				"amulet",
				"belt",
				"quiver"
			].includes(e))) return "equipment";
		}
	}
	corruptionQualityLimit() {
		return this.catalog.game === "poe1" ? 40 : 23;
	}
	corrupt(e, t, n) {
		let r = this.corruptionKind(e);
		if (!r) throw Error("Corruption outcomes for this item class are not supported yet.");
		if (r === "strongbox") e.corrupted = !0;
		else if (r === "map") this.corruptMap(e, t);
		else {
			if (r === "quality") {
				let n = t.pick(Array.from({ length: 21 }, (e, t) => ({
					value: t - 10,
					weight: 1
				})));
				e.quality = Math.max(0, Math.min(this.corruptionQualityLimit(), e.quality + n));
			} else {
				let i = r === "poe1-jewel" ? [
					"none",
					"implicit",
					"reroll-rare",
					"unique-jewel"
				] : r === "jewel" ? [
					"none",
					"implicit",
					"values",
					"none"
				] : r === "waystone" ? [
					"none",
					"tier",
					"prefixes",
					"extra"
				] : this.catalog.game === "poe1" ? [
					"none",
					"reroll-six",
					"implicit",
					"white-sockets"
				] : [
					"none",
					"reroll",
					"implicit",
					"socket"
				], a = t.pick(i.filter((e) => !n || e !== "none").map((e) => ({
					value: e,
					weight: 1
				})));
				if (r === "waystone" && this.corruptWaystone(e, t, a), a === "socket" && Bl(this.catalog, e) > 0 && (e.sockets ?? 0) < Vl(this.catalog, {
					...e,
					corrupted: !0
				}) && (e.sockets = (e.sockets ?? 0) + 1), a === "implicit" && this.corruptedModifiers(e).length && this.replaceCorruptedImplicit(e, t), a === "reroll-six") for (delete e.socketLinks, e.rarity = "rare", e.mods = e.mods.filter((t) => this.protected(e, t)), e.reveal && !e.mods.some((t) => t.id === e.reveal.mod) && delete e.reveal; e.mods.length < 6 && this.pool(e).length;) this.add(e, t);
				if (a === "reroll-rare" && (e.rarity = "rare", this.reroll(e, t)), a === "values" && (e.mods = e.mods.map((n) => {
					if (this.protected(e, n) || this.mod(n.id).domain === "veiled") return n;
					let r = t.integer(Id.min, Id.max);
					return {
						...this.rollMod(n.id, t, n),
						corruptionScale: r
					};
				})), a === "reroll") {
					let n = e.mods.length, r = t.pick([
						1,
						2,
						3
					].map((e) => ({
						value: e,
						weight: 1
					})));
					for (let n = 0; n < r && e.mods.some((t) => !this.protected(e, t, !0)); n++) this.remove(e, t, !0);
					for (e.reveal && !e.mods.some((t) => t.id === e.reveal.mod) && delete e.reveal; e.mods.length < n && this.pool(e).length;) this.add(e, t);
				}
			}
			e.corrupted = !0;
		}
	}
	corruptLocus(e, t) {
		if (!Ld(this.catalog, e)) throw Error("This item class cannot use the Locus of Corruption.");
		let n = t.pick([
			"two-implicits",
			"white-sockets",
			"influenced-rare",
			"destroy"
		].map((e) => ({
			value: e,
			weight: 1
		})));
		if (n === "destroy" && (e.destroyed = !0), n === "two-implicits") {
			let n = e.implicits.filter((e) => !this.mod(e.id).stats.some((e) => e.id === "local_implicit_mod_cannot_be_changed"));
			for (let r = 0; r < 2 && n.length; r++) {
				let r = t.pick(n.map((e) => ({
					value: e,
					weight: 1
				})));
				n.splice(n.indexOf(r), 1), e.implicits = e.implicits.filter((e) => e !== r);
			}
			for (let n = 0; n < 2; n++) {
				let n = new Set(e.implicits.flatMap((e) => this.mod(e.id).groups)), r = this.corruptedModifiers(e).filter((e) => !e.mod.groups.some((e) => n.has(e)));
				if (!r.length) break;
				let i = t.pick(r.map((e) => ({
					value: e.id,
					weight: e.weight
				})));
				e.implicits.push(this.rollMod(i, t));
			}
		}
		if (n === "influenced-rare") {
			delete e.socketLinks;
			let n = [...new Set(this.catalog.crafting.influences.filter((t) => t.itemClass === this.base(e).item_class).map((e) => e.influence))];
			n.length && !this.effectiveInfluences(e).length && !e.mods.some((e) => e.fractured) && !e.implicits.some((e) => X(this.mod(e.id)) > 0) && (e.influences = [t.pick(n.map((e) => ({
				value: e,
				weight: 1
			})))]), e.rarity = "rare", this.reroll(e, t), e.reveal && !e.mods.some((t) => t.id === e.reveal.mod) && delete e.reveal;
		}
		e.corrupted = !0;
	}
	corruptMap(e, t, n) {
		if (e.blight) throw Error("Corruption transformations of Blighted Maps are not modeled yet.");
		if (e.memoryMap) throw Error("Corruption transformations of Memory Influenced Maps are not modeled yet.");
		let r = t.pick([
			"none",
			"transform",
			"reroll-eight",
			"implicit"
		].filter((e) => e !== n).map((e) => ({
			value: e,
			weight: 1
		})));
		if (r === "implicit" && this.corruptedModifiers(e).length && this.replaceCorruptedImplicit(e, t), r === "reroll-eight") {
			e.rarity = "rare", e.mods = e.mods.filter((t) => this.protected(e, t));
			let n = { limits: {
				max: 8,
				prefixes: 4,
				suffixes: 4
			} };
			for (; e.mods.length < 8 && this.pool(e, n).length;) this.add(e, t, n);
		}
		if (r === "transform") {
			let n = this.map(e), r = n.tier === 16 ? "Metadata/Items/Maps/MapAtlasVaalTemple" : t.pick([{
				value: !1,
				weight: 1
			}, {
				value: !0,
				weight: 1
			}]) ? n.upgrade : null;
			if (r) {
				if (!this.catalog.bases[r] || !this.map({ baseId: r })) throw Error("The transformed map is missing from this build.");
				e.baseId = r;
			}
			e.rarity = "rare", e.mods = [], e.implicits = this.base(e).implicits.map((e) => this.rollMod(e, t)), delete e.enchantments, delete e.anointments, delete e.reveal, this.reroll(e, t, {
				ignoreMeta: !0,
				limits: this.limits(e)
			});
		}
		return e.corrupted = !0, r;
	}
	corruptWaystone(e, t, n) {
		let r = 0, i = { ignoreMeta: !0 };
		if (n === "tier") {
			let n = this.waystone(e), i = t.pick([-1, 1].map((e) => ({
				value: e,
				weight: 1
			}))), a = this.catalog.crafting.waystones.find((e) => e.series === n.series && e.tier === n.tier + i);
			r = e.mods.length, e.mods = [], delete e.reveal, delete e.enchantments, delete e.anointments, a && (e.baseId = a.id, e.implicits = this.base(e).implicits.map((e) => this.rollMod(e, t)));
		} else n === "prefixes" ? (r = this.counts(e).suffixes, e.mods = e.mods.filter((e) => e.fractured || this.mod(e.id).generation_type !== "suffix"), e.reveal && !e.mods.some((t) => t.id === e.reveal.mod) && delete e.reveal, i = {
			...i,
			limits: {
				max: e.mods.length + r,
				prefixes: this.counts(e).prefixes + r,
				suffixes: 0
			}
		}) : n === "extra" && (r = Math.min(t.pick([
			0,
			1,
			2,
			3,
			4
		].map((e) => ({
			value: e,
			weight: 1
		}))), 8 - e.mods.length), i = {
			...i,
			limits: {
				max: 8,
				prefixes: 4,
				suffixes: 4
			}
		});
		for (let n = 0; n < r && this.pool(e, i).length; n++) this.add(e, t, i);
	}
	corruptTablet(e, t) {
		if (!zd(this.catalog, e)) throw Error("Ancient Infusers require a PoE 2 tablet.");
		let n = t.pick([
			"modifier",
			"uses",
			"base"
		].map((e) => ({
			value: e,
			weight: 1
		})));
		if (n === "uses" && (e.implicits[0].values[0] += 10), n === "modifier") {
			let n = this.limits(e), r = {
				ignoreMeta: !0,
				limits: {
					max: n.max + 1,
					prefixes: n.prefixes + 1,
					suffixes: n.suffixes + 1
				}
			};
			this.pool(e, r).length && this.add(e, t, r);
		}
		if (n === "base") {
			let n = e.mods.length;
			e.baseId = t.pick(Object.keys(this.catalog.bases).filter((e) => zd(this.catalog, { baseId: e })).map((e) => ({
				value: e,
				weight: 1
			}))), e.mods = [], e.implicits = this.base(e).implicits.map((e) => this.rollMod(e, t));
			for (let r = 0; r < n && this.pool(e).length; r++) this.add(e, t, { ignoreMeta: !0 });
		}
		e.corrupted = !0;
	}
	ukatoaModifiers(e, t = !1) {
		if (this.catalog.game !== "poe1" || this.base(e).item_class !== "Amulet") return [];
		let n = `ukatoa:${e.baseId}`, r = this.eldritchPools.get(n);
		return r || (r = [...this.implicitPool(e, "searing_exarch_implicit"), ...this.implicitPool(e, "eater_of_worlds_implicit")], this.eldritchPools.set(n, r)), r.filter(({ id: n, mod: r }) => (this.catalog.crafting.modRules[n]?.spawnLevel ?? r.required_level) <= e.level && (!r.maximum_level || r.maximum_level >= e.level) && (t || !["attack", "caster"].some((t) => this.hasStat(e, Z[t]) && r.implicit_tags.includes(t))));
	}
	ukatoaReplacements(e) {
		return this.catalog.game === "poe1" && this.base(e).item_class === "Amulet" && !e.corrupted && !e.mirrored && !e.destroyed && !e.implicits.some((e) => X(this.mod(e.id))) ? e.implicits : [];
	}
	replaceUkatoaImplicit(e, t, n) {
		let r = this.ukatoaReplacements(e), i = this.catalog.crafting.currencies.find((e) => e.action === "add_eldritch_implicit_amulet");
		if (!i || !r.length) throw Error("Ukatoa's Ducat requires an eligible amulet implicit and no Eldritch implicit.");
		let a = this.ukatoaModifiers(e);
		if (n && !a.some((e) => e.id === n)) throw Error("This Eldritch implicit cannot roll on this amulet.");
		let o = t.pick(r.map((e) => ({
			value: e,
			weight: 1
		})));
		if (e.implicits = e.implicits.filter((e) => e !== o), e.implicitCraft = {
			currency: i.id,
			level: e.level,
			removed: [...e.implicitCraft?.removed ?? [], ...this.base(e).implicits.includes(o.id) ? [o.id] : []]
		}, e.allflameCrafted = !0, a.length) {
			let r = n ?? t.pick(a.map((e) => ({
				value: e.id,
				weight: e.weight
			})));
			e.implicits.push(this.rollMod(r, t));
		}
	}
	eldritchModifiers(e) {
		let t = this.base(e);
		if (this.catalog.game !== "poe1" || ![
			"Body Armour",
			"Helmet",
			"Gloves",
			"Boots"
		].includes(t.item_class)) return [];
		let n = this.eldritchPools.get(e.baseId);
		if (n) return n;
		let r = [...this.implicitPool(e, "searing_exarch_implicit"), ...this.implicitPool(e, "eater_of_worlds_implicit")], i = new Map(r.map((e) => [e.id, e.weight])), a = [...new Set(r.map((e) => qf(e.mod)))].flatMap((e) => (this.eldritchFamilies.get(e) ?? []).flatMap((e) => {
			let n = this.catalog.crafting.modRules[e.id];
			return n?.gameMode === 2 || n?.itemClasses.length && !n.itemClasses.includes(t.item_class) ? [] : [{
				...e,
				weight: i.get(e.id) ?? 0
			}];
		}));
		return this.eldritchPools.set(e.baseId, a), a;
	}
	conflict(e, t) {
		this.requireEldritchArmour(e);
		let n = e.implicits.filter((e) => X(this.mod(e.id)));
		if (n.length !== 2 || this.hasImplicitStat(e, "local_implicit_mod_cannot_be_changed")) throw Error("Orb of Conflict requires both modifiable Eldritch implicits.");
		let r = new Set(this.eldritchModifiers(e).map((e) => e.id)), i = n.map((e) => {
			let t = this.mod(e.id), n = X(t), i = (this.eldritchFamilies.get(qf(t)) ?? []).filter((e) => r.has(e.id)), a = (e) => {
				let t = i.filter((t) => X(t.mod) === e);
				if (t.length !== 1) throw Error("This build does not provide an unambiguous Eldritch tier.");
				return t[0].id;
			};
			return {
				up: n === 6 ? void 0 : a(n + 1),
				down: n === 1 ? void 0 : a(n - 1)
			};
		}), a = t.pick([{
			value: 0,
			weight: 1
		}, {
			value: 1,
			weight: 1
		}]);
		e.implicits = e.implicits.flatMap((e) => {
			let r = n.indexOf(e);
			if (r < 0) return [e];
			let o = r === a ? i[r].up : i[r].down;
			return o ? [this.rollMod(o, t)] : r === a ? [e] : [];
		});
	}
	requireEldritchArmour(e) {
		if (this.catalog.game !== "poe1" || ![
			"Body Armour",
			"Helmet",
			"Gloves",
			"Boots"
		].includes(this.base(e).item_class) || this.effectiveInfluences(e).length) throw Error("Eldritch currency requires eligible, non-influenced armour.");
	}
	eldritchSide(e) {
		this.requireEldritchArmour(e);
		let t = (t) => Math.max(0, ...e.implicits.filter((e) => this.mod(e.id).generation_type === t).map((e) => X(this.mod(e.id)))), n = t("searing_exarch_implicit"), r = t("eater_of_worlds_implicit");
		if (n === r) throw Error("This craft requires a dominant Eldritch implicit.");
		return n > r ? "prefix" : "suffix";
	}
	validateSocketedJewel(e) {
		let t = this.validateItem(e);
		if (this.catalog.game !== "poe2" || this.base(t).item_class !== "Jewel" || t.destroyed || t.reveal || t.imprint || t.socketedJewel) throw Error("Choose an intact PoE 2 Jewel with all modifiers revealed.");
		return t;
	}
	validateItem(e) {
		let t = mf.parse(e), n = this.base(t);
		if (Mu(this.catalog, t), t.unidentified && !this.identificationSupported(t)) throw Error("Unidentified templates require ordinary magic or rare equipment without explicit modifiers or special crafting state.");
		let r = Kp(this.catalog, t);
		if (!!t.allflameCopies != !!t.allflameCost) throw Error("Pending Allflame copies require their crafting cost.");
		if (t.intangibility !== void 0 || t.allflameCrafted || t.allflameCopies) {
			if (this.catalog.game !== "poe1" || !this.catalog.crafting.allflame?.classes.some((e) => e.itemClass === n.item_class)) throw Error("Allflame item state requires an eligible PoE 1 item class.");
			if (t.allflameCopies) {
				if (t.corrupted || t.mirrored || t.destroyed || t.imprint) throw Error("Pending Allflame copies have an ineligible starting state.");
				for (let e of t.allflameCopies) {
					if (!e.allflameCrafted || e.corrupted && !e.corruptedBy || e.mirrored || e.destroyed && !e.destroyedBy) throw Error("Invalid pending Allflame copy.");
					this.validateItem(e);
				}
			}
		}
		if (n.strongbox && !r) throw Error("Missing extracted Strongbox definition.");
		if (r) {
			if (t.level < Math.max(1, r.minimumLevel) || t.level > r.maximumLevel) throw Error(`This Strongbox variant requires level ${Math.max(1, r.minimumLevel)}–${r.maximumLevel}.`);
			if (t.mirrored || t.split || t.imprint || t.mods.some((e) => e.crafted || e.fractured || e.origin || e.desecrated)) throw Error("Strongboxes cannot use equipment crafting states.");
		}
		if (Uf(this.catalog, t), t.split !== void 0 && this.catalog.game !== "poe1") throw Error("Split items are only available in PoE 1.");
		if (t.corruptedBy && (this.catalog.game !== "poe1" || n.item_class !== "AbyssJewel" || !t.corrupted || !t.allflameCrafted || t.mirrored || t.destroyed || t.imprint || this.catalog.crafting.currencies.find((e) => e.id === t.corruptedBy)?.action !== "add_mod_and_corrupt_rare_abyss_jewel")) throw Error("The corruption source requires an Allflame Ducat Abyss Jewel outcome.");
		if (t.twiceCorrupted && (!t.corrupted || !Rd(this.catalog, t, "incursion_corrupt_equipment"))) throw Error("Twice-corrupted outcomes require eligible corrupted PoE 2 equipment or jewels.");
		if (t.destroyedBy && (!t.destroyed || !t.allflameCrafted || t.corrupted || t.mirrored || t.imprint || this.catalog.crafting.currencies.find((e) => e.id === t.destroyedBy)?.action !== "reset_ghostliness_or_delete")) throw Error("The destruction source requires a destroyed Allflame Ducat outcome.");
		if (t.destroyed && !t.destroyedBy && !t.twiceCorrupted && !(t.corrupted && Ld(this.catalog, t))) throw Error("Destroyed outcomes require a twice-corrupted item, eligible PoE 1 Locus corruption or Allflame Ducat source.");
		if (t.memoryStrands !== void 0 && !Lu(this.catalog, t)) throw Error("Memory strands require PoE 1 equipment.");
		if (t.memoryMap) {
			if (!Nu(this.catalog, t)) throw Error("Memory Influenced Maps require a PoE 1 map.");
			if (t.memoryMap.intentions > this.catalog.crafting.memoryMaps.maximumUses) throw Error("Orb of Intention uses exceed the extracted map limit.");
		}
		if (t.putrefied && (this.catalog.game !== "poe2" || !t.corrupted || t.rarity !== "rare")) throw Error("Putrefaction requires a corrupted PoE 2 rare item.");
		if (t.putrefied && !this.catalog.crafting.desecration.some((e) => e.itemClasses.includes(n.item_class))) throw Error("Putrefaction requires a desecratable base.");
		if (t.sanctified !== void 0 && this.catalog.game !== "poe2" || t.sanctified && (!this.catalog.crafting.sanctification || t.rarity !== "rare" || t.reveal)) throw Error("Sanctification requires a PoE 2 rare item without unrevealed modifiers.");
		Af(this.catalog, t);
		for (let e of t.enchantments ?? []) {
			if (!Yf(this.catalog, t).some((t) => t.mod === e.id)) throw Error("This enchantment is not available on this item base.");
			if (e.crafted || e.fractured || e.origin || e.desecrated) throw Error("Enchantments cannot be crafted, fractured or transferred modifiers.");
		}
		if (t.enchantments?.length && t.anointments?.length) throw Error("An item cannot have both an anointment and another enchantment.");
		if (n.corrupted && !t.corrupted) throw Error("This base is intrinsically corrupted.");
		if (t.sockets && zl(this.catalog, t)) throw Error("Gem socket counts cannot be combined with Abyss sockets yet.");
		let i = Ll(this.catalog, t);
		if (i && t.sockets === void 0 && (t.sockets = i), (t.sockets ?? 0) < i) throw Error("Socket count is below this base's extracted initial socket count.");
		if (t.sockets !== void 0 && t.sockets > Vl(this.catalog, t)) throw Error("Socket count exceeds this item's supported extracted limit.");
		if (Al(this.catalog, t, "local_all_sockets_linked") && (t.socketLinks = (t.sockets ?? 0) > 1 ? Array.from({ length: t.sockets - 1 }, () => !0) : void 0), Ul(this.catalog, t), eu(this.catalog, t), t.socketedJewel) {
			if (!t.jewelSocket) throw Error("A socketed Jewel requires a converted Jewel socket.");
			t.socketedJewel = this.validateSocketedJewel(t.socketedJewel);
		}
		if (t.quality > 30 && t.quality > mu(this.catalog, t)) throw Error("Base quality exceeds this item's supported maximum quality.");
		if (t.mapQuality && !uu(this.catalog, t)) throw Error("This map quality type is unavailable for this item class.");
		if (t.catalyst) {
			if (!su(this.catalog, t).some((e) => e.id === t.catalyst.id)) throw Error("This catalyst is not available on this item class in the extracted build.");
			if (t.catalyst.quality > Su(this.catalog, t)) throw Error("Catalyst quality exceeds this item's maximum quality.");
			if (t.quality) throw Error("Items with both base and catalyst quality are not supported yet.");
		}
		if (t.imprint) {
			let e = this.validateItem(t.imprint);
			if (this.catalog.game !== "poe1" || e.baseId !== t.baseId || e.level !== t.level || e.cluster?.passive !== t.cluster?.passive || e.cluster?.nodes !== t.cluster?.nodes || e.cluster?.jewelSockets !== t.cluster?.jewelSockets || e.unidentified || e.corrupted || e.mirrored || e.destroyed || t.allflameCrafted && !e.allflameCrafted || e.mods.some((e) => e.fractured)) throw Error("The imprint does not belong to this item or has an ineligible state.");
		}
		if (!n.rarities.includes(t.rarity)) throw Error("This base cannot have that rarity.");
		if (new Set(t.influences).size !== t.influences.length) throw Error("Influences must be unique.");
		if (this.hasFixedInfluences(t) && t.influences.length) throw Error("This base has fixed influences; assigned influences must be empty.");
		let a = this.effectiveInfluences(t);
		if (t.influences.some((e) => !this.catalog.crafting.influences.some((t) => t.itemClass === n.item_class && t.influence === e))) throw Error("This base cannot have the selected influence.");
		let o = Rf(this.catalog, t);
		if (t.mods.filter((e) => ["veiled", this.revealDomain()].includes(this.mod(e.id).domain) || this.isDesecrated(e)).length > 1 && !t.putrefied) throw Error("Only one veiled or revealed modifier is allowed.");
		for (let e of t.mods) {
			if (e.attributeSource && (e.conversion || e.crafted || !this.attributes.get(e.attributeSource)?.includes(e.id))) throw Error("Invalid extracted attribute conversion source.");
			let r = e.attributeSource ?? e.conversion?.source ?? e.id, i = this.mod(r);
			if (e.essence && !this.essenceMods.has(r)) throw Error("This modifier has no extracted essence recipe.");
			if (this.catalog.game === "poe1" && e.id.includes("Royale")) throw Error("Royale modifiers are unavailable in ordinary crafting.");
			let s = e.crafted && this.recipePool(t, "emotion").some((e) => e.id === r), c = e.crafted && this.catalog.game === "poe2" && (this.recipePool(t, "essence").some((e) => e.id === r) || Fl(this.catalog, t) === e.id);
			if (!["prefix", "suffix"].includes(i.generation_type)) throw Error("Explicit modifiers must be prefixes or suffixes.");
			if (e.desecrated && (this.catalog.game !== "poe2" || e.crafted || i.is_essence_only || ![n.domain, "desecrated"].includes(i.domain) || !this.catalog.crafting.desecration.some((e) => e.itemClasses.includes(n.item_class)))) throw Error("This modifier cannot be marked as desecrated.");
			let l = t.putrefied && ["VeiledPrefix", "VeiledSuffix"].includes(e.id);
			if (!l && t.mods.slice(0, t.mods.indexOf(e)).some((n) => !(t.putrefied && ["VeiledPrefix", "VeiledSuffix"].includes(n.id)) && this.mod(e.id).groups.some((e) => this.mod(n.id).groups.includes(e)) && !zf(this.catalog, o, e, n))) throw Error("Modifiers in the same group cannot coexist.");
			if (this.catalog.game === "poe1" ? e.crafted !== (i.domain === "crafted") : e.crafted && !s && !c && !this.catalog.crafting.craftableModTypes.includes(i.type)) throw Error("Crafted modifier flags must match the build data.");
			if (e.fractured && (i.domain === "veiled" || this.isDesecrated(e) || a.length || !this.catalog.crafting.classes[n.item_class]?.fracture)) throw Error("This modifier cannot be fractured on this item.");
			let u = this.catalog.crafting.modRules[r], d = e.origin;
			if (d) {
				if (this.catalog.game !== "poe1" || e.crafted) throw Error("This modifier cannot have a transferred or beastcraft origin.");
				if (d.kind === "awakener") {
					if (u?.influence == null || t.influences.length !== 2) throw Error("An Awakener origin requires a dual-influence item and an influenced modifier.");
				} else if (d.kind === "recombine") {
					if (!Bp(this, t) || i.domain !== "item" && !up(this.catalog, {
						...t,
						level: d.level
					}, e.id) || i.is_essence_only && !Hp(this, t, e.id)) throw Error("Invalid recombination origin for this modifier.");
				} else {
					let t = this.beastOperation(d.recipe), n = this.catalog.crafting.beasts.find((e) => e.id === d.recipe), r = t === "suffix-to-prefix" ? "prefix" : "suffix";
					if (!n || ![
						"prefix-to-suffix",
						"suffix-to-prefix",
						"flask"
					].includes(t ?? "") || i.generation_type !== r || t === "flask" && n.mod !== e.id || d.level < Math.max(1, ...n.components.map((e) => e.level))) throw Error("The modifier has an invalid beastcraft origin.");
				}
			}
			if (u?.itemClasses.length && !u.itemClasses.includes(n.item_class)) throw Error("Modifier is restricted to another item class.");
			if (u?.influence != null && !a.includes(u.influence)) throw Error("This modifier requires its matching influence.");
			let f = this.recipeClasses.get(r)?.has(n.item_class) || s, p = /* @__PURE__ */ new Set([
				...n.tags,
				...ju(this.catalog, t),
				...t.blight ? this.mod(t.blight).adds_tags : [],
				...t.mods.flatMap((e) => this.mod(e.id).adds_tags),
				...ou(this.catalog, t),
				...this.catalog.crafting.influences.filter((e) => e.itemClass === n.item_class && a.includes(e.influence)).map((e) => e.tag)
			]), m = i.spawn_weights.find((e) => p.has(e.tag))?.weight ?? 0, h = [n.domain, this.revealDomain()].includes(i.domain) && m > 0 && (u?.spawnLevel ?? i.required_level) <= (d?.level ?? t.level), g = ["mercenary", "ducat_crafted"].includes(i.domain) && [...yl].some((n) => this.ducatPool({
				...t,
				mods: t.mods.filter((t) => t !== e)
			}, n, { ignoreMeta: !0 }).some((e) => e.id === r));
			if (e.desecrated && i.domain === n.domain && !h) throw Error("This ordinary modifier cannot be revealed on this base and level.");
			let _ = i.domain === "veiled" && (l || t.reveal?.mod === e.id), ee = !h && !t.putrefied && i.domain === "desecrated" && this.catalog.crafting.desecration.some((i) => i.tag && i.itemClasses.includes(n.item_class) && this.pool({
				...t,
				mods: t.mods.filter((t) => t !== e)
			}, {
				domain: "desecrated",
				extraTags: [i.tag],
				ignoreMeta: !0
			}).some((e) => e.id === r)), te = !h && !f && this.catalog.crafting.influenceUpgrades.some((t) => t.upgraded === e.id && t.highestTier);
			if (d && !h && !(d.kind === "awakener" && te) && !(d.kind === "recombine" && (rp(this.catalog, t, e.id) || cp(this.catalog, t, e.id) || Kf(this.catalog, {
				...t,
				level: d.level
			}, e.id) || up(this.catalog, {
				...t,
				level: d.level
			}, e.id) || i.is_essence_only && Hp(this, t, e.id)))) throw Error("This modifier is unavailable at its recorded crafting origin level.");
			let ne = !h && !f && !te && this.catalog.crafting.fossils.some((t) => [...t.added, ...t.forced].includes(e.id) && (!t.allowed.length || t.allowed.some((e) => e.tag && p.has(e.tag) || e.itemClass === n.item_class)) && !t.forbidden.some((e) => e.tag && p.has(e.tag) || e.itemClass === n.item_class));
			if (!f && !te && !(ne && (m > 0 || this.catalog.crafting.fossils.some((t) => t.forced.includes(e.id)))) && !h && !_ && !ee && !g && !rp(this.catalog, t, r) && !cp(this.catalog, t, r) && !Kf(this.catalog, {
				...t,
				level: d?.level ?? t.level
			}, r) && !up(this.catalog, {
				...t,
				level: d?.level ?? t.level
			}, r)) throw Error("This modifier is not available on this item base and level.");
		}
		for (let e of [
			...t.mods,
			...t.implicits,
			...t.enchantments ?? []
		]) {
			let n = this.mod(e.id);
			if (e.essence && !t.mods.includes(e)) throw Error("Essence sources apply only to explicit modifiers.");
			if (e.attributeSource && !t.mods.includes(e)) throw Error("Attribute conversion applies only to explicit modifiers.");
			if (e.conversion && !t.mods.includes(e)) throw Error("Elemental conversion applies only to explicit modifiers.");
			if (n.stats.some((e) => e.id === "mod_granted_passive_hash_essence") || e.grantedPassive) {
				if (!e.grantedPassive || !t.mods.includes(e) || Fl(this.catalog, t) !== e.id) throw Error("This modifier requires a valid allocated notable passive.");
				Pl(this.catalog, e.grantedPassive);
			}
			if (e.sanctification !== void 0) {
				let n = this.catalog.crafting.sanctification;
				if (!t.sanctified || !t.mods.includes(e) || e.fractured || !n || e.sanctification < n.min || e.sanctification > n.max) throw Error("Invalid Sanctification multiplier for this modifier.");
			}
			if (e.corruptionScale !== void 0 && (!t.corrupted || !Vd(this.catalog, t) || !t.mods.includes(e) || e.fractured || e.sanctification !== void 0 || n.domain === "veiled")) throw Error("Corruption value multipliers require revealed, unfractured PoE 2 jewel affixes.");
			if (e.values.length !== n.stats.length || e.values.some((n, r) => {
				let i = Bd(this.catalog, t, e.id, r);
				return n < i.min || n > i.max;
			})) throw Error("Modifier values are outside the extracted ranges.");
		}
		if (t.implicits.some((e) => e.origin)) throw Error("Crafting origin levels apply only to explicit modifiers.");
		if (t.implicits.some((e) => e.desecrated)) throw Error("Implicit modifiers cannot be desecrated.");
		if (t.implicits.some((e) => ["prefix", "suffix"].includes(this.mod(e.id).generation_type))) throw Error("Implicit modifiers cannot be prefixes or suffixes.");
		let s = t.implicits.filter((e) => e.id === Xf);
		if (s.length && (s.length > 1 || !this.gildedModifiers(t).length || s.some((e) => e.crafted || e.fractured))) throw Error("The item has an invalid Gilded Fossil implicit.");
		let c = t.implicits.filter((e) => this.mod(e.id).generation_type === "corrupted");
		if (c.length && (!t.corrupted || c.length > (t.twiceCorrupted || Ld(this.catalog, t) ? 2 : 1) || c.some((e, t) => c.slice(0, t).some((t) => e.id === t.id || this.mod(e.id).groups.some((e) => this.mod(t.id).groups.includes(e)))) || c.some((e) => e.fractured || e.crafted || !this.corruptedModifiers(t).some((t) => t.id === e.id)))) throw Error("The item has an invalid corrupted implicit.");
		let l = t.implicits.filter((e) => e.id !== "DoubleModSellPrice1" && this.mod(e.id).generation_type !== "corrupted"), u = l.filter((e) => X(this.mod(e.id)) > 0);
		if (t.implicitCraft && (this.catalog.game !== "poe1" || n.item_class !== "Amulet" || !t.allflameCrafted || this.catalog.crafting.currencies.find((e) => e.id === t.implicitCraft.currency)?.action !== "add_eldritch_implicit_amulet" || new Set(t.implicitCraft.removed).size !== t.implicitCraft.removed.length || t.implicitCraft.removed.some((e) => !n.implicits.includes(e)))) throw Error("Invalid Ukatoa implicit replacement record.");
		let d = n.implicits.filter((e) => !t.implicitCraft?.removed.includes(e)), f = t.implicitCraft ? l.filter((e) => !u.includes(e)) : l;
		if ((!u.length || t.implicitCraft) && (f.length < d.length - c.length || f.length > d.length || new Set(f.map((e) => e.id)).size !== f.length || f.some((e) => !d.includes(e.id)) || d.some((e) => this.mod(e).stats.some((e) => e.id === "local_implicit_mod_cannot_be_changed") && !f.some((t) => t.id === e)))) throw Error("The item has missing or unsupported implicit modifiers for this base.");
		if (u.length && (t.implicitCraft ? u.length !== 1 || u.some((e) => e.crafted || e.fractured) : this.catalog.game !== "poe1" || a.length || ![
			"Body Armour",
			"Helmet",
			"Gloves",
			"Boots"
		].includes(n.item_class) || new Set(u.map((e) => this.mod(e.id).generation_type)).size !== u.length || l.length !== u.length)) throw Error("The item has incompatible Eldritch implicits.");
		for (let e of u) if (!(t.implicitCraft ? this.ukatoaModifiers({
			...t,
			level: t.implicitCraft.level
		}, !0) : this.eldritchModifiers(t)).some((t) => t.id === e.id)) throw Error("This Eldritch implicit is not available on this base.");
		let p = t.mods.filter((e) => !t.putrefied || this.mod(e.id).domain !== "veiled");
		if (p.some((e, t) => p.slice(0, t).some((t) => e.id === t.id && !zf(this.catalog, o, e, t)))) throw Error("Duplicate modifiers are not allowed.");
		let m = this.counts(t), h = this.limits(t), g = { ...this.corruptedAreaLimits(t) ?? h };
		if (t.corruptedBy && t.rarity === "rare" && (g.max++, g.prefixes++, g.suffixes++), t.corrupted && zd(this.catalog, t) && (g.max++, g.prefixes++, g.suffixes++), this.catalog.game === "poe2" && t.rarity === "rare" && n.item_class === "Jewel") {
			let e = this.limits({
				...t,
				mods: []
			}), n = this.recipePool(t, "emotion");
			for (let t of ["prefix", "suffix"]) {
				let r = Math.max(0, ...n.flatMap(({ mod: e }) => e.stats.filter((e) => e.id === `local_maximum_${t}es_allowed_+`).map((e) => e.max))), i = t === "prefix" ? "prefixes" : "suffixes";
				g[i] = Math.max(h[i], e[i] + r);
			}
		}
		if (m.prefixes > g.prefixes || m.suffixes > g.suffixes || t.mods.length > g.max) throw Error("The item exceeds its affix limits.");
		let _ = t.mods.filter((e) => e.crafted).length, ee = _ > this.craftedLimit(t) && this.catalog.game === "poe2" && t.sockets ? 1 + Math.max(0, ...Xl(this.catalog, t).map((e) => iu(this.catalog, t, e.id).get("local_can_have_additional_crafted_mods") ?? 0)) : 0;
		if (_ > Math.max(this.craftedLimit(t), ee)) throw Error("The item has too many crafted modifiers.");
		if (t.reveal) {
			if (t.putrefied && t.reveal.index === void 0) throw Error("Putrefaction requires an indexed reveal state.");
			if (t.reveal.index !== void 0 && !t.putrefied) throw Error("Indexed reveals require a Putrefaction item.");
			let e = this.revealIndex(t);
			if (e < 0 || t.mods[e]?.id !== t.reveal.mod) throw Error("The reveal index must identify its unrevealed modifier.");
			if (t.putrefied && t.reveal.omens?.length) throw Error("Putrefaction reveals do not use directional or Lich omens.");
			if (t.reveal.echoes && (!hp(this.catalog, {
				kind: "reveal",
				preferred: [],
				omens: [t.reveal.echoes.omen]
			}).revealReroll || !t.reveal.choices.length)) throw Error("A reveal reroll requires an omen and revealed choices.");
			if (!t.mods.some((e) => e.id === t.reveal.mod && this.mod(e.id).domain === "veiled")) throw Error("The reveal state requires its veiled modifier.");
			let n = t.reveal.offeredOn;
			if (n && (!t.reveal.choices.length || n.baseId !== t.baseId)) throw Error("Retained reveal context requires choices from the same item base.");
			let r = this.revealPools(t), i = n ? this.validateItem({
				...n,
				reveal: {
					...t.reveal,
					choices: [],
					echoes: void 0,
					offeredOn: void 0
				}
			}) : t, { exclusive: a, ordinary: o } = n ? this.revealPools(i) : r, s = [...a, ...o], c = /* @__PURE__ */ new Set();
			for (let e of t.reveal.choices) {
				let t = s.find((t) => t.id === e);
				if (!t || t.mod.groups.some((e) => c.has(e))) throw Error("Invalid or conflicting reveal choices.");
				for (let e of t.mod.groups) c.add(e);
			}
			if (new Set(t.reveal.choices).size !== t.reveal.choices.length) throw Error("Duplicate reveal choices.");
			let l = this.revealTag(t);
			if (l && t.reveal.choices.length && a.some((e) => e.mod.implicit_tags.includes(l)) && !t.reveal.choices.some((e) => this.mod(e).implicit_tags.includes(l))) throw Error("The reveal choices are missing the guaranteed Lich modifier.");
			t.reveal.choices.length && !n && (t.reveal.offeredOn = ff.parse(t));
		}
		if (t.putrefied && this.unrevealedCount(t) > 0 && !t.reveal) throw Error("Unrevealed Putrefaction modifiers require an active reveal state.");
		return t;
	}
	revealDomain() {
		return this.catalog.game === "poe1" ? "unveiled" : "desecrated";
	}
	isDesecrated(e) {
		return this.catalog.game === "poe2" && (e.desecrated === !0 || this.mod(e.id).domain === "desecrated");
	}
	isAbyssalMark(e) {
		return this.catalog.game === "poe2" && this.mod(e).stats.some((e) => e.id === "essence_abyss_guaranteed_pick");
	}
	revealMinimumLevel(e) {
		if (e.putrefied) return 0;
		let t = this.catalog.crafting.desecration.find((t) => t.id === e.reveal?.source);
		return Math.max(t?.minimumModLevel ?? 0, e.reveal?.mark ? Math.floor(e.level * .4) : 0);
	}
	unrevealedCount(e) {
		return e.mods.filter((e) => this.mod(e.id).domain === "veiled").length;
	}
	revealIndex(e) {
		return e.reveal?.index ?? e.mods.findIndex((t) => t.id === e.reveal?.mod);
	}
	selectUnrevealed(e, t) {
		let n = this.validateItem(e);
		if (!n.putrefied || !n.reveal || !Number.isInteger(t) || !n.mods[t] || this.mod(n.mods[t].id).domain !== "veiled") throw Error("Choose an unrevealed Putrefaction modifier.");
		if (n.reveal.choices.length) throw Error("Choose a revealed modifier before switching to another affix.");
		return n.reveal = {
			mod: n.mods[t].id,
			index: t,
			source: n.reveal.source,
			choices: []
		}, this.validateItem(n);
	}
	revealTag(e) {
		return e.reveal ? hp(this.catalog, {
			kind: "currency",
			id: e.reveal.source,
			omens: e.reveal.omens
		}).revealTag : void 0;
	}
	revealedModifiers(e) {
		let t = {
			...e,
			rarity: "rare",
			mods: []
		}, n = {
			domain: this.revealDomain(),
			ignoreMeta: !0
		}, r = [
			...this.pool(t, n),
			...up(this.catalog, e, "JunMasterVeiledItemRarityFromRareAndUniqueEnemies_") ? [{
				id: lp,
				mod: this.mod(lp),
				weight: 0
			}] : [],
			...this.catalog.game === "poe2" && this.catalog.crafting.desecration.some((t) => t.itemClasses.includes(this.base(e).item_class)) ? this.pool(t, { ignoreMeta: !0 }) : [],
			...this.catalog.crafting.desecration.flatMap((r) => !e.putrefied && r.tag && r.itemClasses.includes(this.base(e).item_class) ? this.pool(t, {
				...n,
				extraTags: [r.tag]
			}) : [])
		];
		return [...new Map(r.map((e) => [e.id, e])).values()];
	}
	revealSources(e) {
		let t = this.base(e);
		return !t.rarities.includes("rare") || this.catalog.game === "poe1" && !this.catalog.crafting.classes[t.item_class]?.veiled ? [] : this.catalog.game === "poe1" ? this.revealedModifiers(e).length ? this.catalog.crafting.currencies.filter((e) => ["replace_rare_mod_veiled", "reroll_rare_veiled"].includes(e.action)) : [] : this.catalog.crafting.desecration.filter((t) => t.itemClasses.includes(this.base(e).item_class) && (!t.maximumItemLevel || e.level <= t.maximumItemLevel)).map((e) => this.catalog.crafting.currencies.find((t) => t.id === e.id));
	}
	revealPreview(e, t) {
		if (!this.revealSources(e).some((e) => e.id === t)) throw Error("Choose a reveal source available for this base and item level.");
		let n = [], r = /* @__PURE__ */ new Map();
		for (let i of ["VeiledPrefix", "VeiledSuffix"]) {
			let a = {
				...e,
				rarity: "rare",
				putrefied: void 0,
				mods: [{
					id: i,
					values: this.mod(i).stats.map((e) => e.min),
					fractured: !1,
					crafted: !1
				}],
				reveal: {
					mod: i,
					source: t,
					choices: []
				}
			};
			n.push(...this.revealPool(a));
			for (let [e, t] of this.revealProbabilities(a)) r.set(e, t);
		}
		return {
			pool: n,
			probabilities: r
		};
	}
	revealPool(e) {
		let { exclusive: t, ordinary: n } = this.revealPools(e);
		return [...t, ...n];
	}
	revealProbabilities(e) {
		let t = this.revealPools(e);
		return e.reveal.choices.length ? new Map([...new Set([...t.exclusive, ...t.ordinary].map(({ id: e }) => e).concat(e.reveal.choices))].map((t) => [t, +!!e.reveal.choices.includes(t)])) : Gp(this.catalog.game, t, this.revealTag(e));
	}
	revealPools(e) {
		let t = e.reveal;
		if (!t) throw Error("The item has no modifier to reveal.");
		let n = this.catalog.crafting.currencies.find((e) => e.id === t.source), r = this.catalog.crafting.desecration.find((e) => e.id === t.source);
		if (!["VeiledPrefix", "VeiledSuffix"].includes(t.mod)) throw Error("This specialised veiled modifier is not supported yet.");
		if (t.mark && (e.putrefied || !this.isAbyssalMark(t.mark) || this.mod(t.mark).generation_type !== this.mod(t.mod).generation_type || !this.recipePool(e, "essence").some((e) => e.id === t.mark))) throw Error("The reveal state has an invalid Mark of the Abyssal Lord origin.");
		if (this.catalog.game === "poe1" ? !n || !["replace_rare_mod_veiled", "reroll_rare_veiled"].includes(n.action) : !r) throw Error("The reveal source is missing from this build.");
		if (r && (!r.itemClasses.includes(this.base(e).item_class) || r.maximumItemLevel && e.level > r.maximumItemLevel)) throw Error("This desecration bone cannot be used on this item class or level.");
		let i = hp(this.catalog, {
			kind: "currency",
			id: t.source,
			omens: t.omens
		});
		if (t.mark && t.omens?.some((e) => Zp.test(e))) throw Error("Necromancy omens are not consumed when replacing an Abyssal Mark.");
		if (i.addSide && this.mod(t.mod).generation_type !== i.addSide) throw Error("The veiled modifier does not match its directional omen.");
		let a = {
			...e,
			mods: e.mods.filter((t, n) => n !== this.revealIndex(e))
		}, o = {
			side: this.mod(t.mod).generation_type,
			ignoreMeta: !0
		}, s = this.revealMinimumLevel(e), c = this.pool(a, {
			...o,
			domain: this.revealDomain()
		}).filter((e) => e.mod.required_level >= s), l = new Set(c.map((e) => e.id));
		return {
			exclusive: c,
			ordinary: [...this.catalog.game === "poe2" ? this.pool(a, o) : [], ...!e.putrefied && r?.tag ? this.pool(a, {
				...o,
				domain: this.revealDomain(),
				extraTags: [r.tag]
			}).filter((e) => !l.has(e.id)) : []].filter((e) => e.mod.required_level >= s)
		};
	}
	revealChoices(e, t) {
		let n = this.validateItem(e);
		if (!n.reveal) throw Error("The item has no modifier to reveal.");
		if (n.reveal.choices.length) return n;
		let r = this.revealPools(n);
		if (!r.exclusive.length && !r.ordinary.length) throw Error("No eligible reveal choices.");
		let i = this.revealTag(n), a = i ? r.exclusive.filter((e) => e.mod.implicit_tags.includes(i)) : [], o = this.catalog.game === "poe2" ? t.pick(Wp(this.catalog.game)) : 3, s = (e) => {
			let i = t.pick(e.map((e) => ({
				value: e,
				weight: e.weight
			})));
			n.reveal.choices.push(i.id);
			let a = (e) => e.id !== i.id && !e.mod.groups.some((e) => i.mod.groups.includes(e));
			r.exclusive = r.exclusive.filter(a), r.ordinary = r.ordinary.filter(a);
		};
		for (; n.reveal.choices.length < o && r.exclusive.length;) s(a.length && !n.reveal.choices.length ? a : r.exclusive);
		for (; n.reveal.choices.length < 3 && r.ordinary.length;) s(r.ordinary);
		return this.validateItem(n);
	}
	prepareReveal(e, t, n) {
		this.validateMethod(t);
		let r = this.validateItem(e);
		if (!r.reveal) throw Error("The item has no modifier to reveal.");
		if (r.reveal.choices.length) {
			if (t.omens?.some((e) => e !== r.reveal.echoes?.omen)) throw Error("Select reveal omens before revealing the first choices.");
			return {
				item: r,
				cost: []
			};
		}
		let i = this.revealChoices(r, n);
		return hp(this.catalog, t).revealReroll && (i.reveal.echoes = {
			omen: t.omens[0],
			remaining: 1
		}), {
			item: this.validateItem(i),
			cost: this.costs(t)
		};
	}
	rerollReveal(e, t) {
		let n = this.validateItem(e);
		if (!n.reveal?.echoes?.remaining) throw Error("This item has no reveal reroll remaining.");
		let r = n.reveal.echoes, i = this.revealChoices({
			...n,
			reveal: {
				...n.reveal,
				choices: [],
				echoes: void 0,
				offeredOn: void 0
			}
		}, t);
		return i.reveal.echoes = {
			...r,
			remaining: 0
		}, this.validateItem(i);
	}
	selectableRevealChoices(e) {
		let t = new Set(this.revealPool(e).map((e) => e.id));
		return e.reveal.choices.filter((e) => t.has(e));
	}
	chooseRevealed(e, t, n) {
		let r = this.validateItem(e);
		if (!r.reveal?.choices.includes(t)) throw Error("Choose one of the revealed modifiers.");
		if (!this.selectableRevealChoices(r).includes(t)) throw Error("This retained reveal choice conflicts with the current item.");
		let i = r.reveal.source, a = this.revealIndex(r);
		if (r.mods = r.mods.map((e, r) => r === a ? this.rollMod(t, n, this.catalog.game === "poe2" && this.mod(t).domain !== "desecrated" ? { desecrated: !0 } : {}) : e), delete r.reveal, r.putrefied) {
			let e = r.mods.findIndex((e) => this.mod(e.id).domain === "veiled");
			e >= 0 && (r.reveal = {
				mod: r.mods[e].id,
				index: e,
				source: i,
				choices: []
			});
		}
		return this.validateItem(r);
	}
	putrefy(e, t, n) {
		let r = this.catalog.crafting.desecration.find((e) => e.id === t);
		if (!r || !r.itemClasses.includes(this.base(e).item_class) || r.maximumItemLevel && e.level > r.maximumItemLevel) throw Error("This desecration bone cannot be used on this item class or level.");
		e.mods = e.mods.filter((t) => this.protected(e, t)), delete e.reveal, e.corrupted = !0, e.putrefied = !0;
		let i = this.limits(e), a = Math.min(i.max, n.pick(i.max === 4 ? [{
			value: 3,
			weight: 65
		}, {
			value: 4,
			weight: 35
		}] : [
			{
				value: 4,
				weight: 8
			},
			{
				value: 5,
				weight: 3
			},
			{
				value: 6,
				weight: 1
			}
		]));
		for (; e.mods.length < a;) {
			let r = this.counts(e), a = ["prefix", "suffix"].filter((e) => e === "prefix" ? r.prefixes < i.prefixes : r.suffixes < i.suffixes), o = n.pick(a.map((e) => ({
				value: e,
				weight: 1
			}))) === "prefix" ? "VeiledPrefix" : "VeiledSuffix", s = e.mods.length;
			e.mods.push(this.rollMod(o, n)), e.reveal ??= {
				mod: o,
				index: s,
				source: t,
				choices: []
			};
		}
	}
	addVeiled(e, t, n, r = {}) {
		if (this.catalog.game === "poe2") {
			let n = this.catalog.crafting.desecration.find((e) => e.id === t);
			if (!n || !n.itemClasses.includes(this.base(e).item_class) || n.maximumItemLevel && e.level > n.maximumItemLevel) throw Error("This desecration bone cannot be used on this item class or level.");
		}
		let i = e.mods.find((e) => this.isAbyssalMark(e.id));
		if (i) {
			let a = this.mod(i.id).generation_type === "prefix" ? "VeiledPrefix" : "VeiledSuffix", o = {
				mod: a,
				source: t,
				mark: i.id,
				choices: [],
				omens: r.omens?.filter((e) => !Zp.test(e))
			};
			e.mods = e.mods.map((e) => e === i ? this.rollMod(a, n) : e), e.reveal = o;
			return;
		}
		if (this.catalog.game === "poe2") {
			let i = this.counts(e), a = this.limits(e), o = r.side && (r.side === "prefix" ? i.prefixes >= a.prefixes : i.suffixes >= a.suffixes);
			(o || e.mods.length >= a.max) && this.remove(e, n, !1, { side: o ? r.side : void 0 });
			let s = this.counts(e), c = this.limits(e), l = ["prefix", "suffix"].filter((t) => (!r.side || t === r.side) && e.mods.length < c.max && (t === "prefix" ? s.prefixes < c.prefixes : s.suffixes < c.suffixes)), u = n.pick(l.map((e) => ({
				value: e,
				weight: 1
			}))) === "prefix" ? "VeiledPrefix" : "VeiledSuffix";
			e.mods.push(this.rollMod(u, n)), e.reveal = {
				mod: u,
				source: t,
				choices: [],
				omens: r.omens
			};
			return;
		}
		let a = this.counts(e), o = this.limits(e), s = Object.entries(this.catalog.mods).flatMap(([n, i]) => i.domain !== "veiled" || !["VeiledPrefix", "VeiledSuffix"].includes(n) || r.side && i.generation_type !== r.side || (i.generation_type === "prefix" ? a.prefixes >= o.prefixes : a.suffixes >= o.suffixes) || e.mods.length >= o.max ? [] : this.revealPool({
			...e,
			mods: [...e.mods, this.rollMod(n, Yp(0))],
			reveal: {
				mod: n,
				source: t,
				choices: [],
				omens: r.omens
			}
		}).length ? [{
			value: n,
			weight: 1
		}] : []), c = n.pick(s);
		e.mods.push(this.rollMod(c, n)), e.reveal = {
			mod: c,
			source: t,
			choices: [],
			omens: r.omens
		};
	}
	rollMod(e, t, n = {}, r = !1) {
		let i = this.mod(e);
		return {
			id: e,
			fractured: !1,
			crafted: i.domain === "crafted",
			...n,
			values: i.stats.map((e) => {
				let n = t.integer(e.min, e.max);
				return r ? Math.max(n, t.integer(e.min, e.max)) : n;
			})
		};
	}
	createItem(e, t = 86) {
		let n = this.catalog.bases[e];
		if (!n) throw Error("Unknown item base.");
		let r = Kp(this.catalog, { baseId: e }), i = mf.shape.level.parse(t), a = ku(this.catalog, { baseId: e })[0];
		return this.validateItem({
			baseId: e,
			...a ? { cluster: { passive: a.id } } : {},
			level: r ? Math.max(Math.max(1, r.minimumLevel), Math.min(i, r.maximumLevel)) : i,
			rarity: "normal",
			corrupted: n.corrupted,
			mods: [],
			implicits: n.implicits.map((e) => this.rollMod(e, Yp(0)))
		});
	}
	generationRarities(e) {
		return this.base(e).rarities;
	}
	identificationSupported(e) {
		let t = this.base(e);
		return t.domain === "item" && [
			"weapon",
			"armour",
			"ring",
			"amulet",
			"belt",
			"quiver"
		].some((e) => t.tags.includes(e)) && e.rarity !== "normal" && (this.catalog.game !== "poe1" || e.baseId !== "Metadata/Items/Armours/BodyArmours/BodyStrDexInt2" || e.rarity !== "rare") && this.generationRarities(e).includes(e.rarity) && !e.mods.length && e.implicits.every((e) => t.implicits.includes(e.id)) && !e.implicitCraft && !e.reveal && !e.imprint && !e.destroyed && !e.allflameCopies && !e.allflameCrafted && e.intangibility === void 0 && !e.sanctified && !e.putrefied && !e.twiceCorrupted && !e.split;
	}
	generate(e, t, n, r, i) {
		if (r && !Zf(this.catalog, e)) throw Error("Choose an eligible Genesis equipment base from this build.");
		if (!this.base(e).rarities.includes(t)) throw Error("This base cannot have that rarity.");
		let a = this.catalog.game === "poe1" && e.baseId === "Metadata/Items/Armours/BodyArmours/BodyStrDexInt2" && t === "rare" && !r;
		if (i !== void 0 && !a) throw Error("Breach rings require a Grasping Mail base.");
		let o = this.base(e), s = this.validateItem({
			baseId: e.baseId,
			...e.cluster ? { cluster: structuredClone(e.cluster) } : {},
			level: e.level,
			rarity: t,
			corrupted: o.corrupted,
			mods: [],
			implicits: o.implicits.map((e) => this.rollMod(e, n)),
			baseDefences: Object.fromEntries(Vf(this.catalog, e).map(({ key: e, range: t }) => [e, n.integer(t.min, t.max)]))
		});
		if (t !== "normal") {
			let e = { genesis: r };
			if (!this.pool(s, e).length) throw Error("No eligible modifiers for this base and item level.");
			if (r) for (let t = 0; t < Math.min(4, this.limits(s).max) && this.pool(s, e).length; t++) this.add(s, n, e);
			else if (a) {
				let e = n.pick([
					{
						value: 1,
						weight: 50
					},
					{
						value: 2,
						weight: 33
					},
					{
						value: 3,
						weight: 17
					}
				]);
				for (let t = 0; t < e; t++) {
					let e = n.pick(ip(this.catalog, s, i).map((e) => ({
						value: e.id,
						weight: e.weight
					})));
					s.mods.push(this.rollMod(e, n));
				}
				let t = this.rollAffixCount(s, n);
				for (; s.mods.length < t && this.pool(s).length;) this.add(s, n);
			} else this.reroll(s, n);
		}
		return this.validateItem(s);
	}
	genesisModifiers(e, t) {
		return Zf(this.catalog, e) ? this.pool({
			...this.createItem(e.baseId, e.level),
			rarity: "rare"
		}, { genesis: t }) : [];
	}
	recipePool(e, t) {
		let n = this.base(e).item_class, r = this.catalog.crafting;
		if (t === "emotion") {
			let t = r.liquidEmotions.filter((e) => this.emotionSupported(e.id)).flatMap((t) => this.emotionRule(e, t.id)?.mods ?? []);
			return [...new Set(t)].map((e) => ({
				id: e,
				mod: this.mod(e),
				weight: 0
			}));
		}
		if (t === "aspect") return r.classes[n]?.aspects ? [...new Set(r.beasts.filter((e) => e.gameMode !== 2).flatMap((e) => e.aspectMod ? [e.aspectMod] : []))].map((e) => ({
			id: e,
			mod: this.mod(e),
			weight: 0
		})) : [];
		let i = t === "bench" ? r.bench.filter((e) => e.mod && e.itemClasses.includes(n)).map((e) => e.mod) : [...r.essences.flatMap((e) => e.mods[n] ? [e.mods[n]] : []), ...r.poe2Essences.filter((e) => this.essenceSupported(e.id)).flatMap((e) => e.rules.filter((e) => e.itemClasses.includes(n)).flatMap((e) => [...e.mod ? [e.mod] : [], ...e.outcomes.map((e) => e.mod)]))];
		return [...new Set(i)].filter((e) => ["prefix", "suffix"].includes(this.mod(e).generation_type)).map((e) => ({
			id: e,
			mod: this.mod(e),
			weight: 0
		}));
	}
	influenceModifiers(e, t, n = {}) {
		return this.catalog.crafting.influences.some((n) => n.itemClass === this.base(e).item_class && n.influence === t) ? this.pool({
			...e,
			rarity: "rare",
			mods: [],
			influences: this.effectiveInfluences(e).includes(t) ? e.influences : [t]
		}, n) : [];
	}
	addStartingMod(e, t, n, r = "natural") {
		let i = this.validateItem(e);
		if (i.unidentified) throw Error("Identify the item before adding modifiers.");
		let a = this.mod(t);
		if (r === "influence") {
			let e = this.catalog.crafting.modRules[t]?.influence;
			if (e == null) throw Error("Choose an extracted influence modifier.");
			if (this.effectiveInfluences(i).includes(e) || i.influences.push(e), i.rarity === "normal" && (i.rarity = "rare"), this.validateItem(i), !this.pool(i, { ignoreMeta: !0 }).some((e) => e.id === t)) throw Error("This influence modifier is not available on the current item.");
		}
		if (r === "ukatoa") return this.replaceUkatoaImplicit(i, n, t), this.validateItem(i);
		if (r === "attribute") {
			let e = this.attributeChoices(i).find((e) => e.ids.includes(t));
			if (!e) throw Error("No eligible attribute to replace with this modifier.");
			return this.replaceAttribute(i, e.index, t, n), this.validateItem(i);
		}
		if (r === "emotion" && !this.recipePool(i, "emotion").some((e) => e.id === t)) throw Error("This emotion modifier is not available on this item base.");
		if (a.generation_type === "corrupted") this.replaceCorruptedImplicit(i, n, t);
		else if (t === "DoubleModSellPrice1") {
			if (!this.gildedModifiers(i).length) throw Error("This Gilded Fossil implicit is not available on this base.");
			i.implicits.push(this.rollMod(t, n));
		} else if (X(a)) {
			if (!this.eldritchModifiers(i).some((e) => e.id === t)) throw Error("This implicit cannot be used on this base.");
			i.implicits = [...i.implicits.filter((e) => X(this.mod(e.id)) && this.mod(e.id).generation_type !== a.generation_type), this.rollMod(t, n)];
		} else i.rarity === "normal" && (i.rarity = this.base(i).rarities.includes("rare") ? "rare" : "magic"), i.mods.push(this.rollMod(t, n, {
			...r === "essence" ? { essence: !0 } : {},
			...this.catalog.game === "poe2" ? r === "revealed" && a.domain !== "desecrated" ? { desecrated: !0 } : r === "essence" || r === "emotion" ? { crafted: !0 } : {} : {}
		}));
		return this.validateItem(i);
	}
	setStartingPassive(e, t) {
		let n = this.validateItem(e), r = Fl(this.catalog, n);
		if (!r) throw Error("This base cannot allocate a passive through an essence modifier.");
		Pl(this.catalog, t);
		let i = n.mods.find((e) => e.id === r);
		return i ? i.grantedPassive = t : (n.rarity === "normal" && (n.rarity = "rare"), n.mods.push(this.rollMod(r, Yp(0), {
			crafted: !0,
			grantedPassive: t
		}))), this.validateItem(n);
	}
	attributeChoices(e) {
		return e.mods.flatMap((e, t) => {
			let n = this.attributes.get(e.id);
			return n ? [{
				index: t,
				ids: n
			}] : [];
		});
	}
	attributeModifiers(e) {
		return [...new Set(this.attributeChoices(e).flatMap((e) => e.ids))].map((e) => ({
			id: e,
			mod: this.mod(e),
			weight: 0
		}));
	}
	replaceAttribute(e, t, n, r) {
		let i = e.mods[t], a = i.attributeSource ?? i.id;
		e.mods.splice(t, 1);
		let o = this.mod(n);
		e.mods.some((e) => this.mod(e.id).groups.some((e) => o.groups.includes(e))) || e.mods.push({
			...this.rollMod(n, r, {
				...i.origin ? { origin: i.origin } : {},
				...i.essence ? { essence: !0 } : {}
			}),
			...a === n ? {} : { attributeSource: a }
		});
	}
	ducatPool(e, t, n = {}) {
		let r = xl(this.catalog, e, t);
		return r ? this.pool(e, {
			...n,
			...r
		}) : [];
	}
	pool(e, t = {}) {
		let n = this.base(e), r = this.effectiveInfluences(e), i = t.limits ?? this.corruptedAreaLimits(e) ?? this.limits(e), a = this.counts(e);
		if (e.mods.length >= i.max) return [];
		let o = e.mods.map((e) => this.mod(e.id)), s = new Set(o.flatMap((e) => e.groups)), c = /* @__PURE__ */ new Set([
			...n.tags,
			...ju(this.catalog, e),
			...t.extraTags ?? [],
			...e.blight ? this.mod(e.blight).adds_tags : [],
			...o.flatMap((e) => e.adds_tags),
			...ou(this.catalog, e),
			...this.catalog.crafting.influences.filter((e) => e.itemClass === n.item_class && r.includes(e.influence)).map((e) => e.tag)
		]), l = t.ignoreMeta ? [] : ["attack", "caster"].filter((t) => this.hasStat(e, Z[t])), u = t.level ?? e.level, d = JSON.stringify([
			e.baseId,
			u,
			[...c].sort(),
			l,
			t.fossils,
			t.tangled,
			t.genesis,
			t.logic,
			t.influence,
			t.tag,
			t.anyTags,
			t.excludedTags,
			t.domain,
			t.affinity,
			t.catalysing ? e.catalyst : void 0
		]), f = this.weightedPools.get(d);
		if (!f) {
			let i = this.effectiveFossils(t.fossils ?? [], t.tangled), a = new Set(i.flatMap((e) => e.added));
			f = [...this.domains.get(t.domain ?? n.domain) ?? [], ...[...a].filter((e) => this.mod(e).domain !== n.domain).map((e) => ({
				id: e,
				mod: this.mod(e),
				weight: 0
			}))].flatMap(({ id: o, mod: s }) => {
				if (this.catalog.game === "poe1" && o.includes("Royale") || s.is_essence_only && !a.has(o)) return [];
				let d = this.catalog.crafting.modRules[o];
				if ((d?.spawnLevel ?? s.required_level) > u || s.maximum_level > 0 && u > s.maximum_level || d?.gameMode === 2 || d?.itemClasses.length && !d.itemClasses.includes(n.item_class) || (t.influence === "any" ? d?.influence == null || !r.includes(d.influence) : t.influence !== void 0 && d?.influence !== t.influence) || t.tag && !s.implicit_tags.includes(t.tag) || t.excludedTags?.some((e) => s.implicit_tags.includes(e)) || t.anyTags && !s.implicit_tags.some((e) => t.anyTags.includes(e)) || l.some((e) => s.implicit_tags.includes(e))) return [];
				let f = this.fossilWeight(s, s.spawn_weights.find((e) => c.has(e.tag))?.weight ?? 0, i, t.logic, (s.generation_weights.find((e) => c.has(e.tag))?.weight ?? 100) / 100);
				return t.affinity?.types.includes(s.type) && (f *= t.affinity.multiplier), t.catalysing && Cu(this.catalog, e, o) && (f *= bu(this.catalog, e)), f > 0 ? [{
					id: o,
					mod: s,
					weight: f
				}] : [];
			}), t.genesis && (f = $f(f, Qf(this.catalog, t.genesis))), this.weightedPools.size >= 256 && this.weightedPools.delete(this.weightedPools.keys().next().value), this.weightedPools.set(d, f);
		}
		let p = Bu(f, t.memoryStrands ?? 0, t.foulborn).filter(({ id: n, mod: r }) => {
			let o = r.generation_type;
			return (!t.side || o === t.side) && (o === "prefix" ? a.prefixes < i.prefixes : a.suffixes < i.suffixes) && !e.mods.some((e) => e.id === n) && !r.groups.some((e) => s.has(e));
		});
		return t.minimumLevel ? p.filter((e) => e.mod.required_level >= t.minimumLevel || !p.some((t) => t.mod.type === e.mod.type && t.mod.generation_type === e.mod.generation_type && t.mod.groups.join("|") === e.mod.groups.join("|") && t.mod.required_level > e.mod.required_level)) : p;
	}
	fossil(e) {
		let t = this.catalog.crafting.fossils.find((t) => t.id === e);
		if (!t) throw Error("Unknown fossil.");
		return t;
	}
	poe2EssenceOperation(e) {
		let t = this.catalog.crafting.currencies.find((t) => t.id === e && t.action === "use_essence")?.description;
		if (t?.startsWith("Upgrades a ")) return "upgrade";
		if (t?.startsWith("Removes a random modifier")) return "replace";
	}
	essenceSupported(e) {
		if (this.catalog.game === "poe1") return this.catalog.crafting.essences.some((t) => t.id === e);
		let t = this.catalog.crafting.poe2Essences.find((t) => t.id === e);
		return !!(t && this.poe2EssenceOperation(e) && t.replacement.every((e) => e === "Breach") && t.rules.every((e) => [e.mod, ...e.outcomes.map((e) => e.mod)].every((e) => !e || !this.mod(e).stats.some((e) => e.id === "mod_granted_passive_hash_essence"))));
	}
	harvestSupported(e) {
		let t = this.catalog.crafting.harvest.find((t) => t.id === e);
		return !!(t && t.gameMode !== 2 && (t.command === "reroll_with_mod" && /^([a-z_]+) ON rare$/.test(t.parameters) || t.command === "add_enchant_to_class" && t.enchantment || t.command === "reroll_with_influence_mod" && !t.parameters || t.command === "reroll_influence_types" && t.influenceRerollClasses || t.command === "reroll_with_current_tags_affinity_multiplier" && t.affinityMultiplier !== null || t.command === "remove_type_and_add_type_mod" && /^ANY FOR ([a-z_]+) noinfluence$/.test(t.parameters) || t.command === "convert_mod" && /^\S+(?: \S+)* CONVERT (fire|cold|lightning) (fire|cold|lightning)$/.test(t.parameters)));
	}
	protected(e, t, n = !1) {
		let r = this.mod(t.id);
		return t.fractured || this.hasStat(e, r.generation_type === "prefix" ? Z.prefixes : Z.suffixes) || n && ["attack", "caster"].some((t) => r.implicit_tags.includes(t) && this.hasStat(e, Z[t]));
	}
	add(e, t, n = {}, r = !1) {
		let i = t.pick(this.pool(e, n).map((e) => ({
			value: e.id,
			weight: e.weight
		})));
		e.mods.push(this.rollMod(i, t, {}, r));
	}
	remove(e, t, n = !1, r = {}) {
		let i = e.mods.filter((t) => !this.protected(e, t, n) && (!r.desecrated || this.mod(t.id).domain === "veiled" || this.isDesecrated(t)) && (!r.side || this.mod(t.id).generation_type === r.side));
		if (r.lowestLevel) {
			let e = Math.min(...i.map((e) => this.mod(e.id).required_level));
			i = i.filter((t) => this.mod(t.id).required_level === e);
		}
		for (let n = 0; n < (r.count ?? 1) && !(n > 0 && !i.length); n++) {
			let n = t.pick(i.map((e) => ({
				value: e,
				weight: 1
			})));
			e.mods = e.mods.filter((e) => e !== n), i = i.filter((e) => e !== n);
		}
	}
	addCraftedModifier(e, t, n, r, i) {
		let a = new Set(e.mods.flatMap((e) => this.mod(e.id).groups)), o = t.filter(({ value: t }) => !e.mods.some((e) => e.id === t) && !this.mod(t).groups.some((e) => a.has(e)));
		if (!o.length) throw Error("No compatible guaranteed modifier; conflicting modifier already present.");
		let s = (t, n) => {
			let r = {
				...e,
				mods: n
			}, i = this.counts(r), a = this.limits(r);
			return this.mod(t).generation_type === "prefix" ? i.prefixes >= a.prefixes : i.suffixes >= a.suffixes;
		}, c = (t) => o.filter(({ value: n }) => t.length < this.limits({
			...e,
			mods: t
		}).max && !s(n, t)), l = o.map(({ value: t, weight: n }) => {
			let a = i ?? (s(t, e.mods) ? this.mod(t).generation_type : void 0);
			if (r) {
				let t = e.mods.filter((t) => !this.protected(e, t) && (!a || this.mod(t.id).generation_type === a));
				if (!t.length) throw Error("No eligible modifier to remove.");
				if (t.some((t) => !c(e.mods.filter((e) => e !== t)).length)) throw Error("No open affix for the guaranteed modifier after removal.");
			}
			return {
				value: {
					id: t,
					side: a
				},
				weight: n
			};
		});
		if (!r && !c(e.mods).length) throw Error("No open affix for the guaranteed modifier.");
		let u = n.pick(l);
		r && this.remove(e, n, !1, { side: u.side });
		let d = s(u.id, e.mods) ? n.pick(c(e.mods)) : u.id;
		e.mods.push(this.rollMod(d, n, { crafted: !0 }));
	}
	scour(e) {
		e.mods = e.mods.filter((t) => this.protected(e, t));
		let t = this.counts(e), n = this.limits({
			...e,
			rarity: "magic"
		});
		e.rarity = e.mods.length === 0 ? "normal" : t.prefixes <= n.prefixes && t.suffixes <= n.suffixes && e.mods.length <= n.max ? "magic" : "rare";
	}
	rollAffixCount(e, t) {
		return this.catalog.game === "poe2" ? e.rarity === "magic" ? 1 : 4 : t.pick(e.rarity === "magic" ? [{
			value: 1,
			weight: 1
		}, {
			value: 2,
			weight: 1
		}] : this.limits(e).max === 4 ? [{
			value: 3,
			weight: 2
		}, {
			value: 4,
			weight: 1
		}] : [
			{
				value: 4,
				weight: 8
			},
			{
				value: 5,
				weight: 3
			},
			{
				value: 6,
				weight: 1
			}
		]);
	}
	reroll(e, t, n = {}, r = [], i = !0, a) {
		let o = n.tag || n.influence !== void 0, s = {
			...n,
			excludedTags: [...n.excludedTags ?? [], ...["attack", "caster"].filter((t) => !n.ignoreMeta && this.hasStat(e, Z[t]))]
		}, c = e.mods.filter((t) => t.fractured || i && this.protected(e, t) || n.side && this.mod(t.id).generation_type !== n.side);
		if (e.mods = c, n.fossils?.some((e) => this.fossil(e).corruptedEssenceChance === 100)) {
			let i = this.corruptedEssencePool(e, n);
			if (!i.length) throw Error("No eligible corrupted essence modifier for this fossil combination.");
			r = [t.pick(i.map((e) => ({
				value: e.id,
				weight: e.weight
			}))), ...r];
		}
		for (let n of r) {
			let r = this.mod(n);
			if (e.mods.some((e) => this.mod(e.id).groups.some((e) => r.groups.includes(e)))) throw Error("The guaranteed modifier conflicts with a preserved modifier.");
			e.mods.push(this.rollMod(n, t));
		}
		let l = this.limits(e);
		if (o && !this.pool(e, s).length) throw Error("No eligible modifier for the reforge guarantee.");
		let u = this.rollAffixCount(e, t);
		o && this.add(e, t, s);
		let d = n.fossils?.some((e) => this.fossil(e).lucky) ?? !1;
		if (a) {
			let r = a === "prefix" ? l.prefixes : l.suffixes;
			for (; e.mods.filter((e) => this.mod(e.id).generation_type === a).length < r;) this.add(e, t, {
				...n,
				side: a
			});
		}
		for (; e.mods.length < Math.max(u, c.length);) {
			let r = {
				...n,
				tag: void 0,
				influence: void 0
			};
			if (!this.pool(e, r).length) break;
			this.add(e, t, r, d);
		}
	}
	methodName(e) {
		let t = "omens" in e ? e.omens ?? [] : [];
		return [
			...Sl(e) ? ["Allflame"] : [],
			this.baseMethodName(e),
			...t.map((e) => this.catalog.crafting.currencies.find((t) => t.id === e)?.name ?? e)
		].join(" + ");
	}
	baseMethodName(e) {
		if (e.kind === "generate") return `Generate ${e.id} item`;
		if (e.kind === "genesis") return this.catalog.crafting.genesis?.name ?? "Genesis Tree";
		if (e.kind === "socket_jewel") return "Socket inventory Jewel";
		if (e.kind === "remove_jewel") return "Remove socketed Jewel";
		if (e.kind === "recombine") return "Recombine items";
		let t = this.catalog.crafting;
		if (e.kind === "augment") return `Socket ${U(this.catalog, e.id).name}`;
		if (e.kind === "upgrade_augment") return `Upgrade socket ${e.socket + 1} · ${U(this.catalog, e.id).name}`;
		if (e.kind === "locus") return t.locus?.name ?? e.id;
		if (e.kind === "anoint") return `${this.catalog.game === "poe1" ? "Anoint" : "Instil"} · ${Of(e).map((e) => Mf(this.catalog, e)).join(" + ")}`;
		if (e.kind === "reveal") return this.catalog.game === "poe1" ? "Unveil modifier" : "Reveal desecrated modifier";
		if (e.kind === "currency") return t.currencies.find((t) => t.id === e.id)?.name ?? e.id;
		if (e.kind === "essence") return [...t.essences, ...t.poe2Essences].find((t) => t.id === e.id)?.name ?? e.id;
		if (e.kind === "fossils") return e.ids.map((e) => this.fossil(e).name).join(" + ") + (e.tangled ? ` (${this.fossil(e.tangled).descriptions.join("; ")})` : "");
		if (e.kind === "harvest") return t.harvest.find((t) => t.id === e.id)?.name ?? e.id;
		if (e.kind === "beast") {
			let n = t.beasts.find((t) => t.id === e.id);
			return n ? `${n.category}: ${n.description}` : e.id;
		}
		let n = t.bench.find((t) => t.id === e.id);
		return n?.enchantment ? this.mod(n.enchantment.mod).text ?? n.enchantment.mod : n?.mod ? this.mod(n.mod).text ?? n.mod : n?.name ?? e.id;
	}
	costName(e) {
		return e === "generated:genesis" ? "Genesis equipment item" : e.startsWith("generated:") ? `Generated ${e.slice(10)} item` : e === "service:recombine" ? "Recombination service" : e.startsWith("donor:") ? "Donor item" : this.catalog.crafting.locus?.id === e ? this.catalog.crafting.locus.name : this.catalog.crafting.beasts.some((t) => t.id === e) ? `Beastcraft · ${this.baseMethodName({
			kind: "beast",
			id: e
		})}` : this.catalog.crafting.currencies.find((t) => t.id === e)?.name ?? this.catalog.crafting.augments.find((t) => t.id === e)?.name ?? e.split("/").at(-1);
	}
	costs(e, t) {
		if (hp(this.catalog, e), e.kind === "reveal" && t?.reveal?.choices.length) return [];
		if (t && e.kind === "bench" && this.catalog.crafting.bench.find((t) => t.id === e.id)?.mod) return this.prepareBenchCraft(t, e.id).cost;
		let n = "omens" in e ? e.omens ?? [] : [], r = [...this.baseCosts(e)];
		if (t && e.kind === "bench" && this.catalog.crafting.bench.find((t) => t.id === e.id)?.enchantment && t.enchantments?.some((e) => this.mod(e.id).generation_type === "flask_enchantment_instilling") && r.unshift(...this.benchRemovalCost(t, !0)), Sl(e)) {
			let n = this.catalog.crafting.allflame?.sulphur, i = t ? wl(this.catalog, t, e) : void 0;
			if (!n || t && !i) throw Error("Allflame sulphur cost is unavailable for this item.");
			r.push({
				id: n,
				name: this.costName(n),
				amount: i?.amount ?? 1
			});
		}
		let i = e.kind === "bench" && this.catalog.game === "poe1" && this.catalog.crafting.bench.find((t) => t.id === e.id);
		if (i && (i.socketCount || i.linkCount) && (!t || t.corrupted)) {
			let e = this.catalog.crafting.currencies.find((e) => e.action === "corrupt_item");
			if (!e) throw Error("The socket bench surcharge currency is missing from this build.");
			r.push({
				id: e.id,
				name: e.name,
				amount: r.reduce((e, t) => e + t.amount, 0)
			});
		}
		return [...r, ...n.filter((e) => !Zp.test(e) || !t?.mods.some((e) => this.isAbyssalMark(e.id))).filter((e) => !t || t.catalyst?.quality || !e.endsWith("/OmenOnExaltConsumeQuality")).map((e) => ({
			id: e,
			name: this.catalog.crafting.currencies.find((t) => t.id === e).name,
			amount: 1
		}))];
	}
	benchRemovalCost(e, t = !1) {
		let n = this.catalog.crafting.bench.find((n) => n.action === +!!t && !n.mod && !n.enchantment && n.itemClasses.includes(this.base(e).item_class));
		if (!n) throw Error("The build has no bench removal recipe for this item class.");
		return n.cost;
	}
	prepareBenchCraft(e, t) {
		let n = structuredClone(e), r = this.catalog.crafting.bench.find((e) => e.id === t), i = this.base(n);
		if (!r.itemClasses.includes(i.item_class)) throw Error("This bench recipe cannot be applied to this item class.");
		let a = n.rarity === "normal" ? "magic" : n.rarity;
		if (!i.rarities.includes(a)) throw Error("This base cannot be magic.");
		let o = [];
		this.craftedLimit(n) === 1 && n.mods.some((e) => e.crafted && !e.fractured) && (o.push(...this.benchRemovalCost(n)), n.mods = n.mods.filter((e) => !e.crafted || e.fractured));
		let s = this.mod(r.mod), c = this.limits({
			...n,
			rarity: a
		}), l = this.counts(n), u = s.generation_type === "prefix" ? "prefixes" : "suffixes", d = n.mods.filter((e) => e.crafted).length >= this.craftedLimit(n) ? "This item has no remaining crafted modifier capacity." : l[u] >= c[u] || n.mods.length >= c.max ? `This bench craft requires an open ${s.generation_type}.` : n.mods.some((e) => e.id === r.mod || this.mod(e.id).groups.some((e) => s.groups.includes(e))) ? "The bench modifier conflicts with an existing modifier." : void 0;
		return d || (n.rarity = a, o.push(...r.cost)), {
			item: n,
			cost: o,
			conflict: d
		};
	}
	baseCosts(e) {
		if (e.kind === "generate" || e.kind === "genesis") {
			let t = `generated:${e.id}`;
			return [{
				id: t,
				name: this.costName(t),
				amount: 1
			}];
		}
		if (e.kind === "socket_jewel" || e.kind === "remove_jewel") return [];
		let t = this.catalog.crafting;
		if (e.kind === "recombine") return [{
			id: "service:recombine",
			name: "Recombination service",
			amount: 1
		}, ...e.donor ? [{
			id: `donor:${e.donor.id}`,
			name: `Donor · ${e.donor.name}`,
			amount: 1
		}] : []];
		if (e.kind === "augment" || e.kind === "upgrade_augment") return [{
			id: e.id,
			name: U(this.catalog, e.id).name,
			amount: 1
		}];
		if (e.kind === "anoint") {
			let t = /* @__PURE__ */ new Map();
			for (let n of [...Of(e).flatMap((e) => jf(this.catalog, e).items), ...e.oils ?? []]) t.set(n, (t.get(n) ?? 0) + 1);
			return [...t].map(([e, t]) => ({
				id: e,
				amount: t,
				name: this.costName(e)
			}));
		}
		if (e.kind === "reveal") return [];
		if (e.kind === "beast") return [{
			id: e.id,
			name: `Beastcraft · ${this.baseMethodName(e)}`,
			amount: 1
		}];
		if (e.kind === "currency" && e.donor) return [{
			id: e.id,
			name: this.baseMethodName(e),
			amount: 1
		}, {
			id: `donor:${e.donor.id}`,
			name: `Donor · ${e.donor.name}`,
			amount: 1
		}];
		if (e.kind === "currency" && t.currencies.find((t) => t.id === e.id)?.action === "restore_imprint") return [];
		if (e.kind === "bench") return t.bench.find((t) => t.id === e.id)?.cost ?? [];
		if (e.kind === "fossils") return [...e.ids.map((e) => ({
			id: e,
			name: this.fossil(e).name,
			amount: 1
		})), {
			id: e.resonator,
			name: t.currencies.find((t) => t.id === e.resonator)?.name ?? e.resonator,
			amount: 1
		}];
		if (e.kind === "harvest") {
			let n = t.harvest.find((t) => t.id === e.id);
			if (!n) throw Error("Unknown Harvest recipe.");
			return n.cost;
		}
		return [{
			id: e.id,
			name: this.baseMethodName(e),
			amount: 1
		}];
	}
	prepareAllflame(e, t, n) {
		let r = this.validateMethod(t), i = this.validateItem(e);
		if (i.unidentified) throw Error("Identify the item before crafting.");
		let a = wl(this.catalog, i, r);
		if (!Sl(r) || !a) throw Error("Allflame is unavailable for this item and method.");
		if (i.allflameCopies || i.corrupted || i.mirrored || i.destroyed || i.reveal?.choices.length) throw Error("Allflame requires an intact, uncorrupted, unmirrored item without pending choices.");
		let o = r.kind === "currency" ? this.catalog.crafting.currencies.find((e) => e.id === r.id)?.action : void 0, s;
		if (o === "add_eldritch_implicit_amulet" && !this.ukatoaReplacements(i).length) throw Error("Ukatoa's Ducat requires an eligible amulet implicit and no Eldritch implicit.");
		if (o === "add_mod_and_corrupt_rare_abyss_jewel") {
			if (this.base(i).item_class !== "AbyssJewel" || i.rarity !== "rare") throw Error("This Ducat requires a rare Abyss Jewel.");
			let e = this.limits(i);
			if (s = i.mods.length >= e.max ? {
				max: e.max + 1,
				prefixes: e.prefixes + 1,
				suffixes: e.suffixes + 1
			} : e, !this.pool(i, { limits: s }).length) throw Error("No eligible Abyss Jewel modifier to add.");
		}
		if (o === "reroll_single_attribute_modifier" && !this.attributeChoices(i).length) throw Error("This Ducat requires a modifier with an extracted single-attribute equivalent.");
		if (o === "split_to_single_explicit" && (!i.mods.length || !this.base(i).rarities.includes("rare"))) throw Error(`${this.baseMethodName(r)} requires an explicit modifier and a base that can be rare.`);
		if (o === "reroll_rare_infamous" || o === "add_deepwater_hazard_belt_mod" || o === "add_pantheon_aspect") {
			if (i.rarity === "normal" || o !== "add_pantheon_aspect" && i.rarity !== "rare") throw Error(`${this.baseMethodName(r)} cannot craft this rarity.`);
			let e = o === "reroll_rare_infamous" ? {
				...i,
				mods: i.mods.filter((e) => this.protected(i, e))
			} : i;
			if (!this.ducatPool({
				...i,
				mods: []
			}, o, { ignoreMeta: !0 }).length || !this.ducatPool(e, o, { excludedTags: ["attack", "caster"].filter((e) => this.hasStat(i, Z[e])) }).length && (o !== "reroll_rare_infamous" || e.mods.length !== this.limits(i).max)) throw Error(`${this.baseMethodName(r)} has no eligible modifier on this item base, level and open affixes.`);
		}
		let c = n.pick([{
			value: 1,
			weight: i.intangibility ?? 0
		}, {
			value: a.bracket.outcomes.max,
			weight: 100 - (i.intangibility ?? 0)
		}]), l = {
			...r,
			allflame: void 0
		}, u = Array.from({ length: c }, () => {
			let e = structuredClone(i);
			delete e.imprint;
			let { min: t, max: c } = a.bracket.intangibility, u = n.pick(Array.from({ length: c - t + 1 }, (e, n) => ({
				value: t + n,
				weight: 1
			})));
			e.intangibility = Math.min(100, (e.intangibility ?? 0) + u), e.allflameCrafted = !0;
			let d = e;
			if (o === "reset_ghostliness_or_delete" && r.kind === "currency") n.pick([{
				value: "destroy",
				weight: 1
			}, {
				value: "reset",
				weight: 1
			}]) === "destroy" ? (d.destroyed = !0, d.destroyedBy = r.id) : d.intangibility = 0;
			else if (o === "add_mod_and_corrupt_rare_abyss_jewel" && r.kind === "currency") this.add(e, n, { limits: s }), e.corrupted = !0, e.corruptedBy = r.id;
			else if (o === "add_eldritch_implicit_amulet") this.replaceUkatoaImplicit(e, n);
			else if (o === "reroll_single_attribute_modifier") {
				let t = n.pick(this.attributeChoices(e).map((e) => ({
					value: e,
					weight: 1
				}))), r = n.pick(t.ids.map((e) => ({
					value: e,
					weight: 1
				})));
				this.replaceAttribute(e, t.index, r, n);
			} else if (o === "split_to_single_explicit") d.mods = [n.pick(e.mods.map((e) => ({
				value: e,
				weight: 1
			})))], d.rarity = "rare", d.reveal && !d.mods.some((e) => e.id === d.reveal.mod) && delete d.reveal;
			else if (o === "reroll_rare_infamous" || o === "add_deepwater_hazard_belt_mod" || o === "add_pantheon_aspect") {
				let t = { excludedTags: ["attack", "caster"].filter((t) => this.hasStat(e, Z[t])) }, r = o === "reroll_rare_infamous" ? this.rollAffixCount(e, n) : e.mods.length + 1;
				if (o === "reroll_rare_infamous" && (e.mods = e.mods.filter((e) => this.protected(d, e))), e.mods.length < r) {
					let i = n.pick(this.ducatPool(e, o, t).map((e) => ({
						value: e.id,
						weight: e.weight
					})));
					for (e.mods.push(this.rollMod(i, n)); e.mods.length < r && this.pool(e, t).length;) this.add(e, n, t);
				}
				e.reveal && !e.mods.some((t) => t.id === e.reveal.mod) && delete e.reveal;
			} else d = this.apply(e, l, n).item;
			if (d.corrupted && !d.corruptedBy || d.mirrored || d.destroyed && !d.destroyedBy) throw Error("This crafting outcome is incompatible with Allflame.");
			return Y.parse(d);
		});
		return delete i.imprint, i.allflameCopies = u, i.allflameCost = this.costs(r, e), {
			item: this.validateItem(i),
			cost: i.allflameCost
		};
	}
	chooseAllflame(e, t) {
		let n = this.validateItem(e);
		if (!Number.isInteger(t) || !n.allflameCopies?.[t]) throw Error("Choose an offered Allflame copy.");
		return this.validateItem(n.allflameCopies[t]);
	}
	apply(e, t, n, r = []) {
		let i = this.validateMethod(t);
		if (e.allflameCopies) throw Error("Choose an Allflame copy before crafting again.");
		if (Sl(i)) {
			let t = this.prepareAllflame(e, i, n), a = t.item.allflameCopies, o = 0;
			for (let e of r) {
				let t = this.validateTarget(e), n = a.findIndex((e) => this.matches(e, t));
				if (!(n < 0)) {
					o = n;
					break;
				}
			}
			return {
				item: this.chooseAllflame(t.item, o),
				cost: t.cost
			};
		}
		let a = hp(this.catalog, i), o = this.validateItem(e);
		if (i.kind === "generate") return {
			item: this.generate(o, i.id, n, void 0, i.breachRings),
			cost: this.costs(i)
		};
		if (i.kind === "genesis") return {
			item: this.generate(o, "rare", n, i.nodes),
			cost: this.costs(i)
		};
		if (i.kind === "currency" && this.catalog.crafting.currencies.find((e) => e.id === i.id)?.action === "identify") {
			if (!o.unidentified) throw Error("Choose an unidentified starting item.");
			let e = { memoryStrands: o.memoryStrands };
			if (!this.pool(o, e).length) throw Error("No eligible modifiers for this base and item level.");
			return delete o.unidentified, this.reroll(o, n, e), {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		if (o.unidentified) throw Error("Identify the item before crafting.");
		if ("donor" in i && i.donor?.item.unidentified) throw Error("Identify the donor item before crafting.");
		if (o.destroyed) throw Error("Destroyed items cannot be crafted. Undo or start a new item.");
		if (Kp(this.catalog, o) && !qp(this.catalog, i)) throw Error("This method is not supported for Strongboxes. Choose an ordinary crafting currency.");
		if (i.kind === "socket_jewel" || i.kind === "remove_jewel") {
			if (!o.jewelSocket) throw Error("This item has no converted Jewel socket.");
			if (i.kind === "socket_jewel") {
				if (!i.jewel) throw Error("Choose a Jewel from inventory.");
				if (o.socketedJewel) throw Error("Remove the socketed Jewel first.");
				o.socketedJewel = this.validateSocketedJewel(i.jewel.item);
			} else {
				if (!o.socketedJewel) throw Error("The Jewel socket is already empty.");
				delete o.socketedJewel;
			}
			return {
				item: this.validateItem(o),
				cost: []
			};
		}
		if (i.kind === "recombine") {
			if (!i.donor) throw Error("Choose a donor item from inventory.");
			let e = this.validateItem(i.donor.item), t = this.recombinationDistribution(o, e);
			return {
				item: structuredClone(n.pick(t)),
				cost: this.costs(i)
			};
		}
		if (i.kind === "upgrade_augment") return {
			item: this.validateItem($l(this.catalog, o, i.id, i.socket)),
			cost: this.costs(i)
		};
		if (i.kind === "augment") {
			let e = tu(this.catalog, o, i.id, i.replace), t = If(this.catalog, o, i.id);
			if (t) {
				let r = 1 + Math.max(-1, ...o.mods.flatMap((e) => e.conversion?.steps.map((e) => e.order) ?? [])), a = i.replace ?? e.augments.length - 1;
				e.mods = o.mods.map((e) => {
					let i = Lf(this.catalog, e.id, t);
					return e.fractured || i === e.id ? e : {
						...e,
						id: i,
						values: this.rollMod(i, n).values,
						...this.isDesecrated(e) ? { desecrated: !0 } : {},
						conversion: {
							source: e.conversion?.source ?? e.id,
							steps: [...e.conversion?.steps ?? [], {
								socket: a,
								order: r
							}]
						}
					};
				});
			}
			return {
				item: this.validateItem(e),
				cost: this.costs(i)
			};
		}
		if (o.sanctified) throw Error("Sanctified items cannot use the supported crafting methods.");
		if (i.kind === "reveal") {
			let e = this.prepareReveal(o, i, n), t = e.item, r = this.selectableRevealChoices(t);
			t.reveal.echoes?.remaining && (i.preferred.length || i.skipOnMiss) && !i.preferred.some((e) => r.includes(e)) && (t = this.rerollReveal(t, n), r = this.selectableRevealChoices(t));
			let a = i.preferred.find((e) => r.includes(e));
			if (!a && i.skipOnMiss) return {
				item: t,
				cost: e.cost
			};
			if (!r.length) throw Error("No retained reveal choices fit the current item.");
			return {
				item: this.chooseRevealed(t, a ?? r[0], n),
				cost: e.cost
			};
		}
		if (i.kind === "currency" && this.catalog.crafting.currencies.find((e) => e.id === i.id)?.action === "incursion_corrupt_equipment") {
			if (!Rd(this.catalog, o, "incursion_corrupt_equipment")) throw Error("Architect's Orbs require eligible PoE 2 equipment or jewels.");
			if (!o.corrupted || o.mirrored) throw Error("Architect's Orbs require a corrupted, unmirrored item.");
			if (o.twiceCorrupted) throw Error(wu(this.catalog.crafting.templeCorruption.alreadyTwiceCorruptedText));
			if (!this.corruptedModifiers(o).length) throw Error("No eligible corrupted implicit for this base and item level.");
			return n.pick([{
				value: "implicit",
				weight: 1
			}, {
				value: "destroy",
				weight: 1
			}]) === "destroy" ? o.destroyed = !0 : this.replaceCorruptedImplicit(o, n, void 0, !0), o.twiceCorrupted = !0, {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		if (i.kind === "anoint") {
			if (Af(this.catalog, {
				...o,
				anointments: Of(i)
			}), this.catalog.game === "poe2" && (o.corrupted || o.mirrored)) throw Error("Instilling requires an uncorrupted, unmirrored item.");
			let e = Ff(this.catalog, o);
			if (e.length !== (i.oils?.length ?? 0) || e.some((e) => !i.oils?.includes(e))) throw Error("Select the matching Tainted or Reflective Oil for this item's corruption and mirroring.");
			return o.anointments = Of(i), o.enchantments?.length && (o.enchantments = []), {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		let s = i.kind === "currency" ? this.catalog.crafting.baseQuality.find((e) => e.id === i.id) : void 0;
		if (s) {
			if (!cu(this.catalog, o).some((e) => e.id === s.id)) throw Error("This quality currency is not available on this item base.");
			if (o.mirrored || o.corrupted !== s.corrupted) throw Error(s.corrupted ? "Tainted quality currency requires a corrupted, unmirrored item." : "This quality currency requires an uncorrupted, unmirrored item.");
			if (o.catalyst) throw Error("Items with both base and catalyst quality are not supported yet.");
			let e = pu(this.catalog, o);
			if (!s.corrupted && o.quality >= e) throw Error("This item already has the maximum quality for this currency.");
			let t = n.pick(fu(this.catalog, o, s.id));
			return o.quality = s.corrupted ? t : Math.min(e, o.quality + t), {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		let c = i.kind === "currency" ? this.catalog.crafting.taintedCatalysts.find((e) => e.id === i.id) : void 0;
		if (c) {
			if (!o.corrupted || o.mirrored) throw Error("Tainted Catalyst requires a corrupted, unmirrored item.");
			let e = yu(this.catalog, o, c.id);
			if (!e.length) throw Error("Tainted Catalyst is unavailable for this item class.");
			return o.catalyst = n.pick(e), o.quality = 0, {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		let l = i.kind === "bench" ? this.catalog.crafting.bench.find((e) => e.id === i.id) : void 0;
		if (l?.socketCount || l?.linkCount) {
			if (o.mirrored) throw Error("Socket bench crafting requires an unmirrored item.");
			if (!Hl(this.catalog, o, l)) throw Error("This socket recipe exceeds the base limit or is unavailable for this item class.");
			if (l.socketCount) {
				if (o.sockets === l.socketCount) throw Error("This item already has the requested number of sockets.");
				Kl(o, l.socketCount);
			} else {
				if (l.linkCount === o.sockets && Wl(o).min === o.sockets) throw Error("All sockets are already linked.");
				ql(o, l.linkCount);
			}
			return {
				item: this.validateItem(o),
				cost: this.costs(i, e)
			};
		}
		let u = i.kind === "currency" ? this.catalog.crafting.currencies.find((e) => e.id === i.id)?.action : void 0;
		if (u === "reroll_socket_numbers_hellscape" && this.catalog.game === "poe1") {
			if (!o.corrupted || o.mirrored) throw Error("Tainted Jeweller's Orbs require a corrupted, unmirrored item.");
			let t = Bl(this.catalog, o, o.level), r = o.sockets ?? 0;
			if (!t || !r || zl(this.catalog, o)) throw Error("Tainted Jeweller's Orbs require ordinary gem sockets.");
			if (r >= t) throw Error("This item already has the maximum sockets for its item level.");
			return Kl(o, n.pick([{
				value: r + 1,
				weight: 1
			}, {
				value: Math.max(1, r - 1),
				weight: 1
			}])), {
				item: this.validateItem(o),
				cost: this.costs(i, e)
			};
		}
		let d = u === "reroll_rare_hellscape" || u === "add_mod_to_rare_hellscape" || u === "upgrade_mod_tier_hellscape";
		if (d && (o.rarity !== "rare" || !o.corrupted || o.mirrored)) throw Error("Tainted rare-item currency requires a corrupted, unmirrored rare item.");
		if (o.corrupted && !d || o.mirrored) throw Error("This craft requires an uncorrupted, unmirrored item.");
		let f = i.kind === "currency" ? this.catalog.crafting.mapQuality.find((e) => e.id === i.id) : void 0;
		if (f) {
			if (!lu(this.catalog, o).some((e) => e.id === f.id)) throw Error("This chisel is unavailable for this item class.");
			let e = uu(this.catalog, o);
			if (e?.id === f.id && o.quality >= f.maximumQuality) throw Error("This map already has maximum quality for this chisel.");
			return o.quality = Math.min(f.maximumQuality, (e?.id === f.id ? o.quality : 0) + du(o)), o.mapQuality = f.stats.includes("map_item_drop_quantity_+%") ? void 0 : f.id, {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		if (i.kind === "locus") return this.corruptLocus(o, n), {
			item: this.validateItem(o),
			cost: this.costs(i)
		};
		if (i.kind === "currency" && this.catalog.crafting.qualityInfusers.some((e) => e.id === i.id)) {
			let e = gu(this.catalog, o, i.id);
			if (!e) throw Error("This quality Infuser is not available on this item base.");
			if (e.quality < e.maximum) throw Error(`This Infuser requires at least ${e.maximum}% quality on this item.`);
			if (e.quality >= e.limit) throw Error(`This item already has the Infuser's maximum quality of ${e.limit}%.`);
			let t = Math.min(e.limit, e.quality + n.pick(e.increments));
			return e.recipe.qualityType === "catalyst" ? o.catalyst.quality = t : o.quality = t, o.corrupted = n.pick([{
				value: !1,
				weight: 100 - e.corruptionChance
			}, {
				value: !0,
				weight: e.corruptionChance
			}]), {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		let p = Fu(this.catalog, o, i), m = p ? o.memoryStrands ?? 0 : 0, h = this.base(o), g = (...e) => {
			if (!e.includes(o.rarity)) throw Error(`This craft requires a ${e.join(" or ")} item.`);
		}, _ = () => {
			if (!h.rarities.includes("rare")) throw Error("This base cannot be rare.");
			o.rarity = "rare";
		};
		if (i.kind === "currency") {
			let e = this.catalog.crafting.currencies.find((e) => e.id === i.id);
			if (!e || !this.currencySupported(e.action)) throw Error("This currency action is not supported.");
			let t = {
				memoryStrands: m,
				foulborn: e.action.startsWith("mutated_"),
				side: a.addSide,
				catalysing: a.catalysing,
				excludedTags: a.excludedWaystoneTags,
				anyTags: a.existingTags ? [...new Set(o.mods.flatMap((e) => this.mod(e.id).implicit_tags))] : void 0,
				minimumLevel: this.catalog.crafting.tieredCurrency.find((e) => e.id === i.id)?.minimumModLevel
			};
			if (e.action === "use_liquid_emotion") {
				g("rare");
				let e = this.emotionRule(o, i.id);
				if (!e) throw Error("This Liquid Emotion has no outcome for this jewel base.");
				if (o.mods.filter((e) => e.crafted).length >= this.craftedLimit(o)) throw Error("Remove the existing crafted modifier before using a Liquid Emotion.");
				this.addCraftedModifier(o, e.mods.map((e) => ({
					value: e,
					weight: 1
				})), n, !0);
			}
			if (e.action.startsWith("abyssal_bench_ticket_")) {
				if (g("rare"), a.putrefy) this.putrefy(o, i.id, n);
				else {
					if (o.mods.some((e) => this.mod(e.id).domain === "veiled" || this.isDesecrated(e))) throw Error("Remove the existing desecrated modifier first.");
					this.addVeiled(o, i.id, n, {
						side: a.addSide,
						omens: i.omens
					});
				}
			}
			let r = /^add_(cleansing_fire|great_tangle)_implicit_([1-4])$/.exec(e.action);
			if (r) {
				if (this.effectiveInfluences(o).length || this.hasImplicitStat(o, "local_implicit_mod_cannot_be_changed") || ![
					"Body Armour",
					"Helmet",
					"Gloves",
					"Boots"
				].includes(h.item_class) || o.implicits.some((e) => this.mod(e.id).generation_type.startsWith("synthesis"))) throw Error("Eldritch implicits require eligible, non-influenced, non-synthesised armour.");
				let e = r[1] === "cleansing_fire" ? "searing_exarch_implicit" : "eater_of_worlds_implicit", t = r[1] === "cleansing_fire" ? "eater_of_worlds_implicit" : "searing_exarch_implicit", i = n.pick(this.implicitPool(o, e, Number(r[2])).map((e) => ({
					value: e.id,
					weight: e.weight
				})));
				o.implicits = [...o.implicits.filter((e) => this.mod(e.id).generation_type === t), this.rollMod(i, n)];
			}
			switch (e.action) {
				case "reroll_variable_defences":
					if (!Gf(this.catalog, o)) throw Error("Sacred Orbs require armour with extracted base defences.");
					o.baseDefences = Object.fromEntries(Vf(this.catalog, o).map(({ key: e, range: t }) => [e, n.integer(t.min, t.max)]));
					break;
				case "add_flask_injector":
				case "add_flask_seal": {
					let e = Jf(this.catalog, o, i.id);
					if (!e.length) throw Error("This currency requires a utility flask with eligible enchantments.");
					let t = n.pick(e.map((e) => ({
						value: e.id,
						weight: e.weight
					})));
					o.enchantments = [this.rollMod(t, n)];
					break;
				}
				case "add_equipment_socket": {
					let e = Bl(this.catalog, o);
					if (!e) throw Error("This item base cannot have augment sockets.");
					if ((o.sockets ?? 0) >= e) throw Error("This item already has the maximum number of sockets.");
					o.sockets = (o.sockets ?? 0) + 1;
					break;
				}
				case "incursion_corrupt_tablet":
					this.corruptTablet(o, n);
					break;
				case "corrupt_item":
					this.corrupt(o, n, !!a.corruption || (au(this.catalog, o).get("soul_core_cannot_roll_no_outcome_with_corruption") ?? 0) > 0);
					break;
				case "conflict_orb":
					this.conflict(o, n);
					break;
				case "apply_zana_influence":
					if (g("normal"), !Lu(this.catalog, o)) throw Error("Remembrance requires normal equipment.");
					o.memoryStrands = n.pick(Pu);
					break;
				case "enchant_map_zana_influence_drops":
					if (!o.memoryMap || !Nu(this.catalog, o)) throw Error("Orb of Intention requires a Memory Influenced Map.");
					if (o.memoryMap.intentions >= this.catalog.crafting.memoryMaps.maximumUses) throw Error("This map has reached its Orb of Intention limit.");
					o.memoryMap.intentions++;
					break;
				case "consume_zana_influence_upgrade_mods": {
					if (!o.memoryStrands || !Lu(this.catalog, o)) throw Error("Unravelling requires equipment with memory strands.");
					if (o.mods.some((e) => !e.fractured && (e.crafted || this.mod(e.id).domain !== h.domain))) throw Error("Unravelling special or crafted modifier tiers is not modeled yet.");
					let e = this.pool({
						...o,
						rarity: "rare",
						mods: []
					}, { ignoreMeta: !0 });
					o.mods = o.mods.map((t) => {
						if (t.fractured || this.mod(t.id).is_essence_only) return t;
						let r = e.find((e) => e.id === t.id);
						if (!r) return t;
						let i = n.pick(Vu(r, e, o.memoryStrands));
						return i === t.id ? t : this.rollMod(i, n);
					}), delete o.memoryStrands;
					break;
				}
				case "add_jewellery_quality":
				case "add_alternate_quality": {
					if (!su(this.catalog, o).some((e) => e.id === i.id)) throw Error("This catalyst is not available on this item class in the extracted build.");
					let e = _u(this.catalog, o), t = o.catalyst?.id === i.id ? o.catalyst.quality : 0;
					if (t >= e) throw Error("This item already has the maximum quality for this catalyst.");
					o.catalyst = {
						id: i.id,
						quality: Math.min(e, t + n.pick(vu(this.catalog, o)))
					}, o.quality = 0;
					break;
				}
				case "transfer_item_influence": {
					if (!i.donor) throw Error("Choose a donor item from inventory.");
					let e = this.validateItem(i.donor.item);
					if (this.base(e).item_class !== h.item_class) throw Error("The donor and target must have the same item class.");
					if ([o, e].some((e) => e.influences.length !== 1 || e.corrupted || e.mirrored || e.mods.some((e) => e.fractured))) throw Error("Awakening requires two uncorrupted, unmirrored items with one influence each and no fractures.");
					if (o.influences[0] === e.influences[0]) throw Error("The donor and target must have different influences.");
					let r = [e, o].map((e) => e.mods.filter((t) => this.catalog.crafting.modRules[t.id]?.influence === e.influences[0]).map((t) => {
						let n = Math.max(e.level, t.origin?.level ?? 0);
						return n > o.level ? {
							...t,
							origin: {
								kind: "awakener",
								level: n
							}
						} : t;
					}));
					_(), o.influences = [...o.influences, e.influences[0]], delete o.reveal;
					for (let e of r) for (let t of e) try {
						this.validateItem({
							...o,
							mods: [t]
						});
					} catch {
						throw Error("A transferred modifier is unavailable on the target base. This transfer is not supported.");
					}
					let a = r.flatMap((e) => e.length ? [n.pick(e.map((e) => ({
						value: e,
						weight: 1
					})))] : []);
					a.length === 2 && this.mod(a[0].id).groups.some((e) => this.mod(a[1].id).groups.includes(e)) && (a = [n.pick(a.map((e) => ({
						value: e,
						weight: 1
					})))]), this.reroll(o, n, {
						...t,
						ignoreMeta: !0
					}, a.map((e) => e.id), !1), o.mods = o.mods.map((e) => {
						let t = a.find((t) => t.id === e.id)?.origin;
						return t ? {
							...e,
							origin: t
						} : e;
					});
					break;
				}
				case "inital_imprint":
					if (o.mods.some((e) => e.fractured)) throw Error("Fractured items cannot be imprinted.");
					o.imprint = Y.parse(o);
					break;
				case "restore_imprint":
					if (!o.imprint) throw Error("This item has no stored imprint.");
					if (o.mods.some((e) => e.fractured)) throw Error("An imprint cannot restore a fractured item.");
					return {
						item: this.validateItem(o.imprint),
						cost: []
					};
				case "replace_rare_mod_veiled":
				case "reroll_rare_veiled":
					if (g("rare"), !this.catalog.crafting.classes[h.item_class]?.veiled) throw Error("This item class cannot have veiled modifiers.");
					if (o.mods.some((e) => ["veiled", "unveiled"].includes(this.mod(e.id).domain))) throw Error("Remove the existing veiled or unveiled modifier first.");
					e.action === "replace_rare_mod_veiled" ? (this.remove(o, n), this.addVeiled(o, i.id, n)) : (o.mods = o.mods.filter((e) => this.protected(o, e)), this.addVeiled(o, i.id, n), o.mods = o.mods.filter((e) => e.id !== o.reveal.mod), this.reroll(o, n, t, [o.reveal.mod]));
					break;
				case "add_influence_mod_to_rare": {
					if (g("rare"), o.level < 68 || this.effectiveInfluences(o).length || o.mods.some((e) => e.fractured) || o.implicits.some((e) => X(this.mod(e.id)) || this.mod(e.id).generation_type.startsWith("synthesis"))) throw Error("Influenced exalted orbs require item level 68+, no influence, fracture or special implicits.");
					let e = [
						"Shaper",
						"Elder",
						"Crusader",
						"Redeemer",
						"Hunter",
						"Warlord"
					].findIndex((e) => i.id.endsWith(e));
					if (e < 0) throw Error("Unknown influence currency.");
					o.influences = [e], this.add(o, n, {
						...t,
						influence: e
					});
					break;
				}
				case "upgrade_influence_mod": {
					if (g("rare"), ![
						"Body Armour",
						"Helmet",
						"Gloves",
						"Boots"
					].includes(h.item_class)) throw Error("This item class cannot use an Orb of Dominance.");
					let e = this.catalog.crafting.influenceUpgrades, t = o.mods.filter((t) => !this.protected(o, t) && e.some((e) => e.mod === t.id || e.upgraded === t.id));
					if (t.length < 2) throw Error("At least two removable influenced modifiers are required.");
					let r = n.pick(t.map((e) => ({
						value: e,
						weight: 1
					}))), i = n.pick(t.filter((e) => e !== r).map((e) => ({
						value: e,
						weight: 1
					}))), a = e.find((e) => e.mod === i.id)?.upgraded ?? i.id;
					o.mods = o.mods.filter((e) => e !== r).map((e) => e === i ? this.rollMod(a, n) : e);
					break;
				}
				case "add_mod_to_rare_eldritch":
					g("rare"), this.add(o, n, {
						...t,
						side: this.eldritchSide(o)
					});
					break;
				case "remove_random_mod_eldritch":
					g("rare"), this.remove(o, n, !0, { side: this.eldritchSide(o) });
					break;
				case "reroll_rare_eldritch":
					g("rare"), this.reroll(o, n, {
						...t,
						side: this.eldritchSide(o)
					});
					break;
				case "transmute_to_magic":
					g("normal"), o.rarity = "magic", this.reroll(o, n, t);
					break;
				case "reroll_magic":
					g("magic"), this.reroll(o, n, t);
					break;
				case "add_mod_to_magic":
				case "mutated_add_mod_to_magic":
					g("magic"), this.add(o, n, t);
					break;
				case "transmute_to_rare":
					g(...this.catalog.game === "poe2" ? ["normal", "magic"] : ["normal"]), _(), this.reroll(o, n, t, [], !0, a.maximumSide);
					break;
				case "upgrade_magic_to_rare":
				case "mutated_upgrade_magic_to_rare":
					g("magic"), _(), this.add(o, n, t);
					break;
				case "reroll":
					if (g("rare"), a.excludedWaystoneTags) {
						if (h.item_class !== "Map") throw Error("Waystone reroll omens require a Waystone.");
						let e = o.mods.length;
						if (o.mods = o.mods.filter((e) => e.fractured), o.mods.length === e) throw Error("The Waystone has no modifiers to replace.");
						if (delete o.reveal, !this.pool(o, t).length) throw Error("No eligible Waystone modifiers remain after these exclusions.");
						for (; o.mods.length < e && this.pool(o, t).length;) this.add(o, n, t);
					} else this.catalog.game === "poe2" ? (this.remove(o, n, !1, {
						side: a.removeSide,
						lowestLevel: a.lowestLevel
					}), this.add(o, n, t)) : this.reroll(o, n, t);
					break;
				case "upgrade_mod_tier_hellscape": {
					let e = this.pool({
						...o,
						mods: []
					}, {
						ignoreMeta: !0,
						extraTags: o.mods.flatMap((e) => this.mod(e.id).adds_tags)
					});
					o.mods = o.mods.map((t) => {
						if (t.crafted || this.protected(o, t)) return t;
						let r = e.find((e) => e.id === t.id);
						if (!r) return t;
						let i = e.filter((e) => zu(e.mod) === zu(r.mod)), a = [...new Set(i.map((e) => e.mod.required_level))].sort((e, t) => e - t), s = a[a.indexOf(r.mod.required_level) + n.pick([{
							value: 1,
							weight: 1
						}, {
							value: -1,
							weight: 1
						}])];
						if (s === void 0) return t;
						let c = n.pick(i.filter((e) => e.mod.required_level === s).map((e) => ({
							value: e.id,
							weight: e.weight
						})));
						return this.rollMod(c, n);
					});
					break;
				}
				case "reroll_rare_hellscape":
					n.pick([{
						value: "reroll",
						weight: 1
					}, {
						value: "scour",
						weight: 1
					}]) === "reroll" ? this.reroll(o, n, t) : this.scour(o);
					break;
				case "add_mod_to_rare_hellscape": {
					let e = o.mods.length >= this.limits(o).max, r = o.mods.length === 0;
					if (!e && !this.pool(o, t).length) throw Error("No eligible modifier for the Tainted Exalted Orb's add outcome.");
					if (!r && !o.mods.some((e) => !this.protected(o, e, !0))) throw Error("No unprotected modifier for the Tainted Exalted Orb's remove outcome.");
					(r ? "add" : e ? "remove" : n.pick([{
						value: "add",
						weight: 1
					}, {
						value: "remove",
						weight: 1
					}])) === "add" ? this.add(o, n, t) : this.remove(o, n, !0);
					break;
				}
				case "add_mod_to_rare":
				case "mutated_add_mod_to_rare":
					g("rare");
					for (let e = 0; e < (a.addCount ?? 1) && !(e > 0 && !this.pool(o, t).length); e++) this.add(o, n, t);
					a.catalysing && o.catalyst?.quality && delete o.catalyst;
					break;
				case "remove_random_mod":
					g("magic", "rare"), this.remove(o, n, !ap(this.catalog), {
						side: a.removeSide,
						desecrated: a.removeDesecrated,
						count: a.removeCount
					});
					break;
				case "convert_to_normal":
					this.scour(o);
					break;
				case "reroll_mod_values":
					if (g("magic", "rare"), a.sanctify && (g("rare"), o.reveal)) throw Error("Reveal the desecrated modifier before Sanctification.");
					if (a.implicitsOnly) {
						if (!o.implicits.length) throw Error("The item has no implicit modifiers.");
						if (this.hasImplicitStat(o, "local_implicit_mod_cannot_be_changed")) throw Error("This item's implicit modifiers cannot be changed.");
						o.implicits = o.implicits.map((e) => this.rollMod(e.id, n, e));
					} else o.mods = o.mods.map((e) => {
						if (this.protected(o, e)) return e;
						let t = this.rollMod(e.id, n, e);
						if (a.sanctify) {
							let e = this.catalog.crafting.sanctification;
							t.sanctification = n.integer(e.min, e.max);
						}
						return t;
					}), a.sanctify && (o.sanctified = !0);
					break;
				case "reroll_implicit_mod":
					if (!o.implicits.length) throw Error("The item has no implicit modifiers.");
					if (this.hasImplicitStat(o, "local_implicit_mod_cannot_be_changed")) throw Error("This item's implicit modifiers cannot be changed.");
					o.implicits = o.implicits.map((e) => this.rollMod(e.id, n, e));
					break;
				case "fracture_random_mod": {
					if (g("rare"), o.mods.length < 4 || this.effectiveInfluences(o).length || o.mods.some((e) => e.fractured) || !this.catalog.crafting.classes[h.item_class]?.fracture) throw Error("Fracturing requires an eligible rare item with at least four modifiers and no influence or fracture.");
					let e = n.pick(o.mods.filter((e) => this.mod(e.id).domain !== "veiled" && !this.isDesecrated(e)).map((e) => ({
						value: e,
						weight: 1
					})));
					e.fractured = !0;
					break;
				}
			}
		} else if (i.kind === "beast") {
			let e = this.beastOperation(i.id);
			if (e === "maximum-sockets") {
				let e = Bl(this.catalog, o);
				if (!e || zl(this.catalog, o)) throw Error("This beastcraft requires ordinary gem sockets.");
				if (o.sockets === e) throw Error("This item already has the maximum number of sockets.");
				Kl(o, e);
			} else if (e === "maximum-links") {
				if ((o.sockets ?? 0) < 2 || zl(this.catalog, o)) throw Error("This beastcraft requires at least two ordinary gem sockets.");
				if (Wl(o).min === o.sockets) throw Error("All sockets are already linked.");
				ql(o, o.sockets);
			} else if (e === "talisman") {
				if (g("rare"), !h.tags.includes("talisman")) throw Error("This beastcraft requires a rare Talisman.");
				let e = this.catalog.crafting.beasts.find((e) => e.id === i.id);
				if (o.mods.some((e) => e.fractured)) throw Error("This Talisman beastcraft cannot be used on a fractured item.");
				if (e.talismanCraft === "imprint") o.imprint = Y.parse(o);
				else if (e.talismanCraft) {
					if (this.effectiveInfluences(o).length || o.mods.length < e.talismanCraft.minimumMods) throw Error(`This fracture recipe requires at least ${e.talismanCraft.minimumMods} modifiers and no influence.`);
					let t = o.mods.filter((e) => this.mod(e.id).domain !== "veiled");
					if (t.length < e.talismanCraft.fractures) throw Error("This Talisman has too few eligible modifiers to fracture.");
					for (let r = 0; r < e.talismanCraft.fractures; r++) {
						let e = n.pick(t.filter((e) => !e.fractured).map((e) => ({
							value: e,
							weight: 1
						})));
						e.fractured = !0;
					}
				}
			} else if (e === "metamod") {
				if (o.mods.some((e) => e.crafted && !this.mod(e.id).stats.some((e) => e.id === Z.multiple))) throw Error("Remove existing crafted modifiers other than multimod before this beastcraft.");
				let e = this.beastMetamodPool(o, i.id);
				if (!e.length) throw Error("No eligible metamod; check this item's class and open affix slots.");
				if (o.rarity === "normal") {
					if (!h.rarities.includes("magic")) throw Error("This base cannot be magic.");
					o.rarity = "magic";
				}
				let t = n.pick(e.map((e) => ({
					value: e.id,
					weight: e.weight
				})));
				o.mods.push(this.rollMod(t, n));
			} else if (e === "augment") {
				if (g("rare"), !this.beastAugmentationEligible(o, i.id)) throw Error("This beastcraft requires its stated influence or item class.");
				if (!this.pool(o).length) throw Error("No eligible modifiers for this beastcraft; check open affix slots.");
				this.add(o, n);
			} else if (e === "map-implicit" || e === "map-twice") {
				if (!this.map(o)) throw Error("This corruption beastcraft requires a map.");
				e === "map-implicit" ? this.replaceCorruptedImplicit(o, n) : this.corruptMap(o, n, this.corruptMap(o, n));
			} else if (e === "aspect") {
				if (!this.catalog.crafting.classes[h.item_class]?.aspects) throw Error("This item class cannot receive an Aspect skill.");
				let e = this.catalog.crafting.beasts.find((e) => e.id === i.id).aspectMod;
				o.rarity === "normal" && (o.rarity = "magic");
				let t = this.limits(o);
				if (this.counts(o).suffixes >= t.suffixes || o.mods.length >= t.max) throw Error("An Aspect skill requires an open suffix.");
				if (o.mods.some((t) => this.mod(t.id).groups.some((t) => this.mod(e).groups.includes(t)))) throw Error("An existing modifier conflicts with this Aspect skill.");
				o.mods.push(this.rollMod(e, n));
			} else if (e === "imprint") {
				if (g("magic"), o.mods.some((e) => e.fractured)) throw Error("Fractured items cannot be imprinted.");
				o.imprint = Y.parse(o);
			} else {
				let t = i.level, r = {
					kind: "beast",
					level: t,
					recipe: i.id
				};
				if (e === "flask") {
					if (g("normal", "magic"), h.domain !== "flask") throw Error("This beastcraft requires a flask.");
					o.rarity = "magic";
					let e = this.catalog.crafting.beasts.find((e) => e.id === i.id).mod;
					if (!this.pool(o, { level: t }).some((t) => t.id === e)) throw Error("This flask cannot receive the recipe modifier; check its type and open suffix.");
					o.mods.push(this.rollMod(e, n, { origin: r }));
				} else {
					g("rare");
					let i = e === "suffix-to-prefix" ? "prefix" : "suffix", a = i === "prefix" ? "suffix" : "prefix";
					if (!o.mods.filter((e) => !this.protected(o, e, !0) && this.mod(e.id).generation_type === a).length) throw Error(`No unprotected ${a} to remove.`);
					this.add(o, n, {
						side: i,
						level: t
					}), o.mods.at(-1).origin = r, this.remove(o, n, !0, { side: a });
				}
			}
		} else if (i.kind === "bench") {
			let e = this.catalog.crafting.bench.find((e) => e.id === i.id);
			if (!e) throw Error("Unknown bench recipe.");
			if (e.enchantment) {
				if (!e.enchantment.itemClasses.includes(h.item_class) || !Yf(this.catalog, o).some((t) => t.mod === e.enchantment.mod)) throw Error("This bench enchantment is not available on this item base.");
				o.enchantments = [this.rollMod(e.enchantment.mod, n)];
			} else if (e.mod) {
				let t = this.prepareBenchCraft(o, i.id);
				if (t.conflict) {
					if (!i.skipOnConflict) throw new Jp(t.conflict, t.item, t.cost);
				} else t.item.mods.push(this.rollMod(e.mod, n));
				return {
					item: this.validateItem(t.item),
					cost: t.cost
				};
			} else if (e.action === 8 || e.action === 9) {
				if (!e.itemClasses.includes(h.item_class)) throw Error("This bench recipe cannot be applied to this item class.");
				g("rare");
				let t = o.mods.length, r = e.action === 8 ? 3 : 1;
				for (let e = 0; e < r && o.mods.some((e) => !this.protected(o, e, !0)); e++) this.remove(o, n, !0);
				for (; o.mods.length < t && this.pool(o).length;) this.add(o, n);
			} else if (e.action === 1) {
				if (!e.itemClasses.includes(h.item_class)) throw Error("This bench recipe cannot be applied to this item class.");
				if (!o.enchantments?.length && !o.anointments?.length) throw Error("There are no enchantments to remove.");
				delete o.enchantments, delete o.anointments;
			} else {
				if (e.action !== 0) throw Error("This bench action is not supported.");
				if (!o.mods.some((e) => e.crafted && !e.fractured)) throw Error("There are no crafted modifiers to remove.");
				o.mods = o.mods.filter((e) => !e.crafted || e.fractured);
			}
		} else if (i.kind === "essence" && this.catalog.game === "poe2") {
			let e = this.catalog.crafting.poe2Essences.find((e) => e.id === i.id);
			if (!e) throw Error("Unknown PoE 2 essence.");
			if (o.mods.filter((e) => e.crafted).length >= this.craftedLimit(o)) throw Error("Remove the existing crafted modifier before using another essence.");
			let t = e.rules.find((e) => e.itemClasses.includes(h.item_class));
			if (!t) throw Error("This essence has no modifier for this item class.");
			let r = this.poe2EssenceOperation(e.id);
			g(r === "replace" ? "rare" : "magic"), r === "upgrade" && _();
			let s = t.mod ? [{
				value: t.mod,
				weight: 1
			}] : t.outcomes.flatMap((e) => {
				let t = this.mod(e.mod), n = e.weight ?? t.spawn_weights.find((e) => h.tags.includes(e.tag))?.weight ?? 0;
				return n > 0 ? [{
					value: e.mod,
					weight: n
				}] : [];
			});
			this.addCraftedModifier(o, s, n, r === "replace", a.removeSide), o.mods.at(-1).essence = !0;
		} else if (i.kind === "essence") {
			let e = this.catalog.crafting.essences.find((e) => e.id === i.id);
			if (!e) throw Error("Unknown essence.");
			if (g(...e.level >= 5 ? ["normal", "rare"] : ["normal"]), Object.values(Z).some((e) => e !== Z.multiple && this.hasStat(o, e))) throw Error("Essences cannot be used with metamods.");
			let t = e.mods[h.item_class];
			if (!t) throw Error("This essence has no modifier for this item class.");
			_(), this.reroll(o, n, {
				level: e.itemLevelLimit ? Math.min(o.level, e.itemLevelLimit) : o.level,
				ignoreMeta: !0,
				memoryStrands: m
			}, [t], !1);
			let r = o.mods.find((e) => e.id === t && !e.fractured);
			r && (r.essence = !0);
		} else if (i.kind === "fossils") {
			if (new Set(i.ids).size !== i.ids.length) throw Error("A fossil can only be used once per resonator.");
			let e = this.catalog.crafting.currencies.find((e) => e.id === i.resonator);
			if (!e || !["delve_currency_upgrade", "delve_currency_reroll"].includes(e.action)) throw Error("Choose an extracted resonator.");
			if (Number(e.id.at(-1)) !== i.ids.length) throw Error("The resonator must have one socket per fossil.");
			if (g(e.action === "delve_currency_upgrade" ? "normal" : "rare"), Object.values(Z).some((e) => e !== Z.multiple && this.hasStat(o, e))) throw Error("Fossils cannot be used with metamods.");
			let t = this.effectiveFossils(i.ids, i.tangled), r = t.some((e) => e.effects.includes("BetterSellPrice"));
			r && this.mod(Xf);
			let a = t.some((e) => e.effects.includes("CorruptedImplicit"));
			if (a && !this.corruptedModifiers(o).length) throw Error("No eligible corrupted implicit for this base and item level.");
			let s = t.some((e) => e.effects.includes("Fracture"));
			if (s && !this.canFractureWithFossil(o)) throw Error("Fractured Fossils require a fracturable base with no influence or fractured modifier.");
			for (let e of t) {
				let t = (e) => e.tag && h.tags.includes(e.tag) || e.itemClass === h.item_class;
				if (e.allowed.length && !e.allowed.some(t) || e.forbidden.some(t)) throw Error(`${e.name} cannot be used on this base.`);
			}
			_(), this.reroll(o, n, {
				fossils: i.ids,
				logic: i.logic,
				tangled: i.tangled,
				ignoreMeta: !0
			}, t.flatMap((e) => e.forced), !1), s && (n.pick(o.mods.map((e) => ({
				value: e,
				weight: 1
			}))).fractured = !0), a && this.replaceCorruptedImplicit(o, n), r && !o.implicits.some((e) => e.id === "DoubleModSellPrice1") && o.implicits.push(this.rollMod(Xf, n));
		} else {
			let e = this.catalog.crafting.harvest.find((e) => e.id === i.id);
			if (!e || e.gameMode === 2) throw Error("Unknown or Ruthless-only Harvest recipe.");
			let t = /^([a-z_]+) ON rare$/.exec(e.parameters)?.[1];
			if (e.command === "add_enchant_to_class" && e.enchantment) {
				if (!e.enchantment.itemClasses.includes(h.item_class)) throw Error("This Harvest enchantment is not available on this item class.");
				o.enchantments = [this.rollMod(e.enchantment.mod, n)], o.anointments?.length && (o.anointments = []);
			} else if (e.command === "convert_mod") {
				g("magic", "rare");
				let [t, r] = e.parameters.split(" CONVERT "), [i, a] = r.split(" "), s = o.mods.flatMap((e) => {
					let n = this.mod(e.id);
					return this.protected(o, e) || !t.split(" ").includes(n.type) ? [] : [...new Set(this.catalog.crafting.modEquivalencies.filter((t) => t.mods.includes(e.id)).flatMap((e) => e.mods))].flatMap((t) => {
						let r = this.mod(t);
						if (t === e.id || r.domain !== n.domain || r.generation_type !== n.generation_type || !r.implicit_tags.includes(a) || r.implicit_tags.includes(i)) return [];
						let s = this.rollMod(t, Yp(0), { crafted: e.crafted }), c = {
							...o,
							mods: o.mods.map((t) => t === e ? s : t)
						};
						try {
							return this.validateItem(c), [{
								value: {
									entry: e,
									id: t
								},
								weight: 1
							}];
						} catch {
							return [];
						}
					});
				}), c = n.pick(s);
				o.mods = o.mods.map((e) => e === c.entry ? this.rollMod(c.id, n, { crafted: e.crafted }) : e);
			} else if (e.command === "reroll_with_mod" && t) g("rare"), this.reroll(o, n, { tag: t });
			else if (e.command === "reroll_influence_types") {
				if (g("rare"), this.hasFixedInfluences(o)) throw Error("This base has fixed influences that cannot be randomised.");
				if (!e.influenceRerollClasses?.includes(h.item_class)) throw Error("This Harvest influence reroll is unavailable for this item class.");
				if (o.influences.length !== 1) throw Error("This influence-reroll model requires exactly one influence.");
				if (o.mods.some((e) => this.protected(o, e) && this.catalog.crafting.modRules[e.id]?.influence != null)) throw Error("Cannot randomise influence while an influenced modifier is protected.");
				let t = this.catalog.crafting.influences.filter((e) => e.itemClass === h.item_class && !o.influences.includes(e.influence));
				o.influences = [n.pick(t.map((e) => ({
					value: e.influence,
					weight: 1
				})))], this.reroll(o, n);
			} else if (e.command === "reroll_with_influence_mod") {
				if (g("rare"), !this.effectiveInfluences(o).length) throw Error("This Harvest reforge requires an influenced item.");
				this.reroll(o, n, { influence: "any" });
			} else if (e.command === "reroll_with_current_tags_affinity_multiplier" && e.affinityMultiplier !== null) g("rare"), this.reroll(o, n, { affinity: {
				types: [...new Set(o.mods.map((e) => this.mod(e.id).type))].sort(),
				multiplier: e.affinityMultiplier
			} });
			else if (e.command === "remove_type_and_add_type_mod") {
				g("rare");
				let t = /^ANY FOR ([a-z_]+) noinfluence$/.exec(e.parameters)?.[1];
				if (!t || this.effectiveInfluences(o).length) throw Error("This Harvest augment requires a non-influenced item.");
				let r = n.pick(this.pool(o, { tag: t }).map((e) => ({
					value: e.id,
					weight: e.weight
				})));
				this.remove(o, n), o.mods.push(this.rollMod(r, n));
			} else throw Error("This Harvest operation is not supported yet.");
		}
		if (o.reveal && !o.mods.some((e) => e.id === o.reveal.mod) && delete o.reveal, m && p) {
			let e = n.pick(Iu(m, p.maximum));
			e ? o.memoryStrands = e : delete o.memoryStrands;
		}
		return {
			item: this.validateItem(o),
			cost: this.costs(i, e)
		};
	}
	statTotals(e, t = "all") {
		let n = t === "all" ? au(this.catalog, e) : /* @__PURE__ */ new Map();
		if (t === "all") for (let t of uu(this.catalog, e)?.stats ?? []) n.set(t, e.quality);
		if (t === "all" && e.blight) for (let t of [e.blight, ...(e.anointments ?? []).map((e) => jf(this.catalog, e).mod)]) for (let e of this.mod(t).stats) n.set(e.id, (n.get(e.id) ?? 0) + e.min);
		let r = t === "explicit" ? e.mods : t === "implicit" ? e.implicits : [
			...e.mods,
			...e.implicits,
			...(e.enchantments ?? []).filter((e) => this.mod(e.id).generation_type.startsWith("flask_enchantment_"))
		];
		for (let t of r) {
			let r = Du(this.catalog, t, e);
			for (let [e, i] of this.mod(t.id).stats.entries()) n.set(i.id, (n.get(i.id) ?? 0) + r[e]);
		}
		return n;
	}
	matches(e, t) {
		if (e.allflameCopies) throw Error("Choose an Allflame copy before checking item requirements.");
		if (e.destroyed || e.unidentified) return !1;
		let n = t;
		if (n.expression) {
			let { operator: t, negated: r, operands: i } = n.expression, a = t === "and" ? i.every((t) => this.matches(e, t)) : i.some((t) => this.matches(e, t));
			if (r ? a : !a) return !1;
		}
		let r = [...e.mods, ...e.implicits], i = n.groups.filter((e) => {
			let t = new Set(r.filter((t) => e.mods.includes(t.id) && (!e.fractured || t.fractured)).map((e) => e.id)).size;
			return e.negated ? t < e.minimum : t >= e.minimum;
		}).length, a = this.limits(e), o = this.counts(e), s = (e, t) => !t || e >= t.min && e <= t.max, c = /* @__PURE__ */ new Map();
		return (n.grantedPassives ?? []).every((t) => e.mods.some((e) => e.grantedPassive === t)) && (n.anointments ?? []).every((t) => (e.anointments ?? []).some((e) => Nf(this.catalog, e) === Nf(this.catalog, t))) && (n.enchantments ?? []).every((t) => e.enchantments?.some((e) => e.id === t)) && (!n.rarity || e.rarity === n.rarity) && (n.corrupted === void 0 || e.corrupted === n.corrupted) && (n.mirrored === void 0 || e.mirrored === n.mirrored) && (n.split === void 0 || !!e.split === n.split) && (n.sanctified === void 0 || !!e.sanctified === n.sanctified) && Wf(this.catalog, e, n) && (!n.mapTier || !!this.map(e) && s(this.map(e).tier, n.mapTier)) && (!n.waystoneTier || !!this.waystone(e) && s(this.waystone(e).tier, n.waystoneTier)) && s(e.sockets ?? 0, n.sockets) && Gl(e, n) && (n.jewelSocket === void 0 || !!e.jewelSocket === n.jewelSocket) && (n.socketedJewel === void 0 || !!e.socketedJewel === n.socketedJewel) && s(e.quality, n.quality) && (!n.quality?.mapType || uu(this.catalog, e)?.id === n.quality.mapType) && s(e.memoryStrands ?? 0, n.memoryStrands) && s(e.intangibility ?? 0, n.intangibility) && (!n.intentions || !!e.memoryMap && s(e.memoryMap.intentions, n.intentions)) && (!n.catalyst || (!n.catalyst.id || e.catalyst?.id === n.catalyst.id) && s(e.catalyst?.quality ?? 0, n.catalyst)) && (n.influences ?? []).every((t) => this.effectiveInfluences(e).includes(t)) && s(e.mods.length, n.affixCount) && s(o.prefixes, n.prefixCount) && s(o.suffixes, n.suffixCount) && s(this.unrevealedCount(e), n.unrevealedCount) && Math.max(0, Math.min(a.max - e.mods.length, Math.max(0, a.prefixes - o.prefixes) + Math.max(0, a.suffixes - o.suffixes))) >= (n.openAffixes ?? 0) && i >= (n.minimumGroups || n.groups.length) && xp(this, e, n) && Math.max(0, a.prefixes - o.prefixes) >= n.openPrefixes && Math.max(0, a.suffixes - o.suffixes) >= n.openSuffixes && (n.stats ?? []).every((t) => {
			let n = c.get(t.scope);
			n || (n = this.statTotals(e, t.scope), c.set(t.scope, n));
			let r = n.get(t.id) ?? 0;
			return (t.min === void 0 || r >= t.min) && (t.max === void 0 || r <= t.max);
		});
	}
	validateTarget(e) {
		let t = wf.parse(e);
		for (let e of t.expression?.operands ?? []) this.validateTarget(e);
		if (t.split !== void 0 && this.catalog.game !== "poe1") throw Error("Split requirements are only available in PoE 1.");
		if (t.sanctified !== void 0 && this.catalog.game !== "poe2") throw Error("Sanctification requirements are only available in PoE 2.");
		if (t.quality?.mapType && (this.catalog.game !== "poe1" || !this.catalog.crafting.mapQuality.some((e) => e.id === t.quality.mapType))) throw Error("Unknown map quality requirement.");
		if (this.catalog.game === "poe1" && (t.affixCount?.max ?? 0) > 8) throw Error("PoE 1 affix-count requirements cannot exceed eight.");
		if (this.catalog.game === "poe1" && t.quality && t.quality.max > 40) throw Error("PoE 1 base quality requirements cannot exceed 40%.");
		if (t.sockets && this.catalog.game === "poe1" && t.sockets.max > 6) throw Error("PoE 1 socket requirements cannot exceed six.");
		if (t.linkedSockets && this.catalog.game !== "poe1") throw Error("Gem socket link requirements are only available in PoE 1.");
		if (t.jewelSocket !== void 0 && this.catalog.game !== "poe2") throw Error("Jewel socket conversion requirements are only available in PoE 2.");
		if (t.socketedJewel !== void 0 && this.catalog.game !== "poe2") throw Error("Socketed Jewel requirements are only available in PoE 2.");
		if (t.memoryStrands && this.catalog.game !== "poe1") throw Error("Memory-strand requirements are only available for PoE 1.");
		if (t.intangibility && this.catalog.game !== "poe1") throw Error("Intangibility requirements are only available in PoE 1.");
		if (t.intentions) {
			if (this.catalog.game !== "poe1" || !this.catalog.crafting.memoryMaps) throw Error("Orb of Intention requirements are only available for PoE 1.");
			if (t.intentions.max > this.catalog.crafting.memoryMaps.maximumUses) throw Error("Orb of Intention requirements exceed the extracted map limit.");
		}
		if (t.mapTier && (this.catalog.game !== "poe1" || ![t.mapTier.min, t.mapTier.max].every((e) => this.catalog.crafting.maps.some((t) => t.tier === e)))) throw Error("Map tier requirements must use tiers from the extracted PoE 1 build.");
		if (t.waystoneTier && (this.catalog.game !== "poe2" || ![t.waystoneTier.min, t.waystoneTier.max].every((e) => this.catalog.crafting.waystones.some((t) => t.tier === e)))) throw Error("Waystone tier requirements must use tiers from the extracted PoE 2 build.");
		if (t.catalyst?.id && !this.catalog.crafting.catalysts.some((e) => e.id === t.catalyst.id)) throw Error("Unknown target catalyst in the extracted game catalog.");
		if (t.influences?.some((e) => !this.catalog.crafting.influences.some((t) => t.influence === e))) throw Error("This influence requirement is unavailable in the extracted game catalog.");
		if (t.minimumGroups > t.groups.length) throw Error("Required group count exceeds the number of target groups.");
		for (let e of t.groups) {
			if (new Set(e.mods).size < e.minimum) throw Error("Target group requires more modifiers than it contains.");
			for (let t of e.mods) this.mod(t);
		}
		for (let e of t.stats ?? []) if (!this.statIds.has(e.id)) throw Error(`Unknown target stat: ${e.id}`);
		for (let e of t.anointments ?? []) jf(this.catalog, e);
		for (let e of t.grantedPassives ?? []) Pl(this.catalog, e);
		for (let e of t.enchantments ?? []) if (!Yf(this.catalog).some((t) => t.mod === e)) throw Error("Unknown or unsupported target enchantment.");
		if (new Set((t.anointments ?? []).map((e) => Nf(this.catalog, e))).size !== (t.anointments?.length ?? 0)) throw Error("Choose each anointment outcome only once.");
		return t;
	}
};
// app/lib/crafting-query-routing.ts
function em(e, t) {
	if (t === "manual") return [...e];
	let n = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = gl(t.query), r = n.get(e) ?? [];
		r.push(t), n.set(e, r);
	}
	return [...n.entries()].sort(([e], [t]) => t - e).flatMap(([, e]) => e.some((e) => e.probability == null) ? e : e.sort((e, t) => e.probability - t.probability));
}
function tm(e, t, n) {
	let r = [];
	for (let i of em(t, n)) {
		let t = hl(e, i.query);
		if (t !== "no-match") {
			if (t === "unknown") r.push(i.id);
			else return r.length ? {
				status: "unknown",
				branchId: null,
				candidates: [...r, i.id]
			} : {
				status: "matched",
				branchId: i.id,
				candidates: [i.id]
			};
		}
	}
	return {
		status: r.length ? "unknown" : "unmatched",
		branchId: null,
		candidates: r
	};
}
// app/lib/crafting-smart.ts
var nm = {
	transmute_to_magic: "Upgrade a normal item to magic",
	transmute_to_rare: "Upgrade to rare",
	upgrade_magic_to_rare: "Upgrade a magic item to rare and add a modifier",
	convert_to_normal: "Remove unprotected modifiers"
};
function rm(e, t, n) {
	let r = e.catalog.crafting, i, a = null;
	if (t.kind === "currency" && !t.allflame && !t.omens?.length) {
		let o = r.currencies.find((e) => e.id === t.id)?.action, s = r.baseQuality.find((e) => e.id === t.id), c = r.mapQuality.find((e) => e.id === t.id), l = r.catalysts.find((e) => e.id === t.id);
		if (o === "apply_zana_influence") i = "Roll 10–100 memory strands on normal equipment", a = {
			field: "memoryStrands",
			maximum: 100,
			suggested: 70
		};
		else if (s || c) {
			let t = c?.maximumQuality ?? (s.corrupted ? s.maximumQuality : n ? pu(e.catalog, n) : s.maximumQuality);
			i = s?.corrupted ? "Reroll quality" : "Increase quality", a = {
				field: "quality",
				maximum: Math.max(1, t),
				suggested: Math.max(1, t)
			};
		} else if (l) {
			i = "Increase this catalyst's quality";
			let t = n ? _u(e.catalog, n) : 20;
			a = {
				field: "catalystQuality",
				maximum: t,
				suggested: t
			};
		} else if (o === "add_equipment_socket" || o === "reroll_socket_numbers_hellscape") {
			i = o === "add_equipment_socket" ? "Add a socket" : "Add or remove a socket";
			let t = n ? Bl(e.catalog, n, n.level) : e.catalog.game === "poe1" ? 6 : 7;
			a = {
				field: "sockets",
				maximum: Math.max(1, t),
				suggested: Math.max(1, t)
			};
		} else if (o && nm[o]) i = nm[o];
		else return null;
	} else if (t.kind === "bench") {
		let e = r.bench.find((e) => e.id === t.id);
		if (!e?.socketCount && !e?.linkCount) return null;
		i = e.socketCount ? `Set ${e.socketCount} sockets` : `Link ${e.linkCount} sockets`;
	} else return null;
	let o = null, s = null;
	if (n) try {
		e.apply(n, t, Yp(0)), o = !0;
	} catch (e) {
		o = !1, s = e instanceof Error ? e.message : String(e);
	}
	return {
		effect: i,
		target: a,
		available: o,
		reason: s
	};
}
function im(e, t, n) {
	let r = rm(e, t.method);
	if (!r) throw Error("This method requires custom outcome rules.");
	if (t.inputs.length !== 1) throw Error("Simple crafts consume one input item.");
	let i = Jc.parse({ game: e.catalog.game });
	if (n.kind === "once") return {
		output: i,
		applyWhen: void 0,
		branches: [],
		ordering: "manual",
		fallback: { kind: "return" }
	};
	if (!r.target || r.target.field !== n.field) throw Error("This target cannot be produced by the selected craft.");
	let a = [{
		kind: "range",
		field: n.field,
		value: { min: n.value }
	}];
	if (t.method.kind === "currency") {
		let r = t.method.id;
		n.field === "catalystQuality" && a.push({
			kind: "base",
			field: "catalystId",
			values: [r]
		}), n.field === "quality" && e.catalog.crafting.mapQuality.some((e) => e.id === r) && a.push({
			kind: "base",
			field: "qualityType",
			values: [r]
		});
	}
	let o = {
		...i,
		groups: [{
			type: "and",
			filters: a
		}]
	};
	return {
		output: o,
		applyWhen: {
			...i,
			groups: [{
				type: "count",
				filters: a,
				value: { max: a.length - 1 }
			}]
		},
		branches: [{
			id: "smart-success",
			name: `Reached minimum ${n.field}: ${n.value}`,
			query: o,
			destination: { kind: "return" }
		}],
		ordering: "manual",
		fallback: {
			kind: "recover",
			nodeId: t.id,
			inputId: t.inputs[0].id
		}
	};
}
function am(e, t, n) {
	if (!t.smart) return;
	let r = rm(e, t.method, n);
	if (!r || r.available === !1) throw Error(r?.reason ?? "This craft has no simple outcome definition.");
	if (t.smart.kind === "minimum" && (!r.target || t.smart.value > r.target.maximum)) throw Error("The requested minimum exceeds what this craft can reach on this input.");
}
// app/lib/crafting-graph-trial.ts
var om = class extends Error {}, sm = class extends Error {
	outcomeId;
	token;
	constructor(e, t) {
		super(e), this.outcomeId = e, this.token = t;
	}
}, cm = class {
	engine;
	graph;
	random;
	options;
	nodes;
	queries;
	stocks = /* @__PURE__ */ new Map();
	live = /* @__PURE__ */ new Map();
	missing = /* @__PURE__ */ new Set();
	missingSales = /* @__PURE__ */ new Set();
	iterator;
	sequence = 0;
	state = {
		status: "running",
		outcomeId: null,
		success: !1,
		item: null,
		steps: 0,
		actions: 0,
		purchases: 0,
		consumedItems: 0,
		cost: 0,
		knownCost: 0,
		revenue: 0,
		creditedRevenue: 0,
		missingPrices: [],
		unpricedSales: [],
		excludedRecovery: 0,
		spending: {},
		visits: {},
		retained: [],
		trace: [],
		error: null
	};
	constructor(e, t, n, r = {}, i) {
		this.engine = e, this.graph = t, this.random = n, this.options = r, this.nodes = new Map(t.nodes.map((e) => [e.id, e])), this.queries = i ?? Gu(e), this.iterator = this.produce(r.entry ?? t.entry);
	}
	get done() {
		return this.state.status !== "running";
	}
	token(e) {
		let t = {
			id: `item-${++this.sequence}`,
			item: e
		};
		return this.live.set(t.id, t), t;
	}
	spend(e, t = this.graph.prices[e.id] ?? null) {
		e.amount && (this.state.spending[e.id] = (this.state.spending[e.id] ?? 0) + e.amount, t ? this.state.knownCost += e.amount * t.amount : this.missing.add(e.id));
	}
	sell(e, t, n) {
		this.live.delete(e.id), n ? this.state.creditedRevenue += n.amount : this.missingSales.add(t);
	}
	visits(e) {
		return this.state.visits[e] ??= {
			visits: 0,
			matches: {},
			branches: {},
			recovered: 0
		}, this.state.visits[e];
	}
	portQuery(e, t) {
		let n = e.inputs.find((e) => e.id === t);
		return n.query ?? this.nodes.get(n.source).output;
	}
	recordMatch(e, t) {
		this.options.trace && (this.state.nodeItems ??= {}, this.state.nodeItems[t.id] = e);
		let n = this.queries.record(e);
		if (t.kind === "craft") {
			for (let e of t.branches) if (hl(n, e.query) === "match") {
				let n = this.visits(t.id).matches;
				n[e.id] = (n[e.id] ?? 0) + 1;
			}
		}
		return n;
	}
	branches(e) {
		return e.branches.map((t) => ({
			...t,
			probability: this.options.probabilities?.get(e.id)?.get(t.id) ?? null
		}));
	}
	route(e, t, n) {
		let r = tm(n, this.branches(e), e.ordering);
		if (r.status === "unknown") throw Error(`Cannot resolve outcome conditions at ${e.name}: ${r.candidates.join(", ")}`);
		let i = e.branches.find((e) => e.id === r.branchId)?.destination ?? e.fallback;
		if (t.item.destroyed && !["discard", "terminal"].includes(i.kind)) throw Error("A destroyed item must route to discard or a discarded terminal outcome.");
		let a = this.visits(e.id), o = r.branchId ?? "fallback";
		if (a.branches[o] = (a.branches[o] ?? 0) + 1, this.options.trace && this.state.trace.push({
			nodeId: e.id,
			inputs: [],
			outputs: [t.id],
			...r.branchId ? { branchId: r.branchId } : {},
			destination: i
		}), i.kind === "return") {
			if (this.queries.matches(t.item, e.output) !== "match") throw Error(`Returned item does not establish the output query at ${e.name}.`);
			return t;
		}
		if (i.kind === "terminal") throw new sm(i.outcomeId, t);
		if (i.kind === "recover") {
			let e = this.nodes.get(i.nodeId);
			if (this.queries.matches(t.item, this.portQuery(e, i.inputId)) !== "match") throw Error(`Recovered item does not establish the input query at ${e.name}/${i.inputId}.`);
			let n = JSON.stringify([e.id, i.inputId]), r = this.stocks.get(n) ?? [];
			r.push(t), this.stocks.set(n, r), a.recovered++;
		} else if (i.kind === "sell") {
			let n = `sale:${e.id}:${o}`;
			this.sell(t, n, this.graph.prices[n] ?? i.price);
		} else this.live.delete(t.id), this.state.excludedRecovery++;
	}
	bindMethod(e, t) {
		let n = t[1];
		if (!n) return e.method;
		let r = {
			id: n.id,
			name: "Graph input",
			item: n.item
		};
		if (e.method.kind === "socket_jewel") return {
			...e.method,
			jewel: r
		};
		if (e.method.kind === "recombine" || e.method.kind === "currency") return {
			...e.method,
			donor: r
		};
		throw Error("This crafting method does not consume a second item.");
	}
	recordOdds(e, t) {
		if (e.method.kind !== "recombine" || this.options.modelOdds === !1) return;
		let n = em(this.branches(e), e.ordering), r = em(this.graph.outcomes.map((e) => ({
			...e,
			probability: this.options.probabilities?.get("$outcomes")?.get(e.id)
		})), this.graph.outcomeOrdering), i = JSON.stringify([
			e.id,
			t.map((e) => e.item),
			n,
			r
		]), a = this.options.oddsCache?.get(i);
		if (!a) {
			a = {
				attempts: 1,
				branches: {},
				outcomes: {}
			};
			for (let { value: i, weight: o } of this.engine.recombinationDistribution(t[0].item, t[1].item)) {
				let t = this.queries.record(i), s = tm(t, n, "manual");
				if (s.status === "unknown") return;
				let c = s.branchId ?? "fallback";
				a.branches[c] = (a.branches[c] ?? 0) + o;
				let l = n.find((e) => e.id === c)?.destination ?? e.fallback;
				if (e.id === this.graph.entry && l.kind === "return") {
					let e = tm(t, r, "manual");
					if (e.status === "unknown") return;
					e.branchId && (a.outcomes[e.branchId] = (a.outcomes[e.branchId] ?? 0) + o);
				}
			}
			(this.options.oddsCache?.size ?? 0) >= 128 && this.options.oddsCache.clear(), this.options.oddsCache?.set(i, a);
		}
		let o = this.visits(e.id);
		o.modelOdds ??= {
			attempts: 0,
			branches: {},
			outcomes: {}
		}, o.modelOdds.attempts++;
		for (let e of ["branches", "outcomes"]) for (let [t, n] of Object.entries(a[e])) o.modelOdds[e][t] = (o.modelOdds[e][t] ?? 0) + n;
	}
	craft(e, t) {
		let n = this.bindMethod(e, t), r;
		try {
			am(this.engine, e, t[0].item), r = Sl(n) ? this.engine.prepareAllflame(t[0].item, n, this.random) : this.engine.apply(t[0].item, n, this.random);
		} catch (t) {
			if (t instanceof Jp) for (let n of t.cost) this.spend(n, qu(this.graph.prices, e.id, n.id));
			throw t;
		}
		this.recordOdds(e, t);
		for (let e of t) {
			if (!this.live.delete(e.id)) throw Error("The graph attempted to consume an item more than once.");
			this.state.consumedItems++;
		}
		for (let n of r.cost) t.some((e) => n.id === `donor:${e.id}`) || this.spend(n, qu(this.graph.prices, e.id, n.id));
		if (this.state.actions++, r.item.allflameCopies) {
			let t = em(this.branches(e), e.ordering), n = 0, i = Infinity;
			for (let [e, a] of r.item.allflameCopies.entries()) {
				let r = t.findIndex((e) => this.queries.matches(a, e.query) === "match");
				r >= 0 && r < i && (n = e, i = r);
			}
			r.item = this.engine.chooseAllflame(r.item, n);
		}
		let i = [this.token(r.item)];
		return n.kind === "remove_jewel" && t[0].item.socketedJewel && i.push(this.token(this.engine.validateItem(t[0].item.socketedJewel))), this.options.trace && this.state.trace.push({
			nodeId: e.id,
			inputs: t.map((e) => e.id),
			outputs: i.map((e) => e.id)
		}), i;
	}
	*produce(e) {
		let t = this.nodes.get(e);
		for (;;) {
			if (this.state.steps >= this.graph.maxSteps) throw new om("Graph exceeded its step limit; expected cost is unresolved.");
			if (this.state.steps++, yield, t.kind === "acquire") {
				let e = null, n = Infinity;
				if (!this.options.acquisitions) for (let r of t.alternatives) {
					if (r.kind !== "purchase") continue;
					let i = ad(this.engine, this.graph, t, r).expectedCost;
					i !== null && i < n && (e = r.id, n = i);
				}
				let r = t.choice.mode === "pinned" ? t.choice.alternativeId : this.options.acquisitions ? this.options.acquisitions.get(t.id)?.selectedId : e, i = t.alternatives.find((e) => e.id === r);
				if (!i) throw Error(`No priced acquisition choice is available at ${t.name}; pin a choice to calculate with unknown prices.`);
				this.visits(t.id).visits++;
				let a;
				if (i.kind === "production") a = yield* this.produce(i.nodeId);
				else {
					this.state.purchases++;
					let e = `purchase:${t.id}:${i.id}`;
					this.spend({
						id: e,
						name: i.name,
						amount: 1
					}, this.graph.prices[e] ?? i.price);
					let n = [...this.nodes.values()].flatMap((e) => e.kind === "craft" && e.method.kind === "fossils" && i.sourcePreparation?.kind === "fractured-fossil-v1" && JSON.stringify(e.method) === JSON.stringify(i.sourcePreparation.fossils) && e.inputs.some((e) => e.source === t.id) ? em(this.branches(e), e.ordering).map((e) => e.query) : []), r = od(this.engine, i, this.random, n, (e) => {
						for (let n of e) this.spend(n, qu(this.graph.prices, t.id, n.id));
						this.state.actions++;
					});
					a = this.token(r.item);
				}
				if (this.options.trace && (this.state.nodeItems ??= {}, this.state.nodeItems[t.id] = a.item), i.kind === "purchase" && this.options.trace && this.state.trace.push({
					nodeId: t.id,
					inputs: [],
					outputs: [a.id],
					...i.sourcePreparation ? { preparation: td(this.engine, i.sourcePreparation) } : {}
				}), this.queries.matches(a.item, t.output) !== "match") throw Error(`Acquisition output does not establish the query at ${t.name}.`);
				return a;
			}
			let e = this.stocks.get(JSON.stringify([t.id, "$output"]))?.shift();
			if (e) return e;
			let n = [], r = !1;
			for (let e of t.inputs) {
				let i = this.stocks.get(JSON.stringify([t.id, e.id]))?.shift() ?? (yield* this.produce(e.source));
				if (this.queries.matches(i.item, this.portQuery(t, e.id)) !== "match") throw Error(`Input query was not established at ${t.name}/${e.name}.`);
				if (n.push(i), n.length === 1 && t.applyWhen) {
					let e = this.queries.matches(i.item, t.applyWhen);
					if (e === "unknown") throw Error(`Cannot resolve the apply condition at ${t.name}.`);
					if (e === "no-match") {
						r = !0;
						break;
					}
				}
			}
			if (r) {
				let e = this.visits(t.id);
				e.skipped = (e.skipped ?? 0) + 1, this.options.trace && this.state.trace.push({
					nodeId: t.id,
					inputs: [n[0].id],
					outputs: [n[0].id],
					skipped: !0
				});
			}
			let i = r ? n : this.craft(t, n), a = [];
			for (let e of i) {
				this.visits(t.id).visits++;
				let n = this.recordMatch(e.item, t), r = this.route(t, e, n);
				r && a.push(r);
			}
			if (a.length) return this.stocks.set(JSON.stringify([t.id, "$output"]), a.slice(1)), a[0];
		}
	}
	finish(e, t) {
		let n = this.graph.outcomes.find((e) => e.id === t);
		if (!n) throw Error("The final item did not match a configured terminal outcome.");
		if (e.item.destroyed && (n.success || n.disposition !== "discard")) throw Error("A destroyed item cannot be a successful or saleable outcome.");
		if (this.queries.matches(e.item, n.query) !== "match") throw Error(`Final item does not establish the terminal query: ${n.name}`);
		if (this.state.status = "terminal", this.state.outcomeId = n.id, this.state.item = e.item, this.state.success = n.success, n.disposition === "sell") {
			let t = `outcome:${n.id}`;
			this.sell(e, t, this.graph.prices[t] ?? n.price);
		}
		n.disposition === "discard" && (this.live.delete(e.id), this.state.excludedRecovery++);
	}
	advance() {
		if (!this.done) try {
			let e = this.iterator.next();
			if (!e.done) return;
			if (this.state.item = e.value.item, this.options.classify === !1) {
				this.state.status = "returned", this.state.success = !0;
				return;
			}
			let t = tm(this.queries.record(e.value.item), this.graph.outcomes.map((e) => ({
				...e,
				probability: this.options.probabilities?.get("$outcomes")?.get(e.id) ?? null
			})), this.graph.outcomeOrdering);
			if (t.status !== "matched") throw Error("The final item has no unambiguous configured terminal outcome.");
			this.finish(e.value, t.branchId);
		} catch (e) {
			let t = e;
			if (e instanceof sm) try {
				this.finish(e.token, e.outcomeId);
				return;
			} catch (e) {
				t = e;
			}
			this.state.status = t instanceof om ? "truncated" : "error", this.state.error = t instanceof Error ? t.message : String(t);
		}
	}
	result() {
		return {
			...this.state,
			cost: this.missing.size ? null : this.state.knownCost,
			revenue: this.missingSales.size ? null : this.state.creditedRevenue,
			missingPrices: [...this.missing],
			unpricedSales: [...this.missingSales],
			retained: [...this.live.values()]
		};
	}
}, lm = {
	bases: [
		{
			baseType: "Accumulator Wand",
			category: "weapon-bases",
			itemClass: "Wand",
			attributes: ["int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Agate Amulet",
			category: "accessory-bases",
			itemClass: "Amulet",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Alternating Sceptre",
			category: "weapon-bases",
			itemClass: "Sceptre",
			attributes: ["str", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Ambusher",
			category: "weapon-bases",
			itemClass: "Dagger",
			attributes: ["dex", "int"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Amethyst Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Amethyst Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Anarchic Spiritblade",
			category: "weapon-bases",
			itemClass: "One Hand Sword",
			attributes: ["str", "dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Ancient Mask",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["dex", "int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Apex Cleaver",
			category: "weapon-bases",
			itemClass: "Two Hand Axe",
			attributes: ["str", "dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Apothecary's Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Aquamarine Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Archdemon Crown",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str", "int"],
			level: 75,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Archon Kite Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str", "int"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Artillery Quiver",
			category: "weapon-bases",
			itemClass: "Quiver",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Assassin Bow",
			category: "weapon-bases",
			itemClass: "Bow",
			attributes: ["dex"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 82
				},
				{
					min: 83,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Assassin's Garb",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["dex"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Astral Leather",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["dex"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Astral Plate",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["str"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Auric Mace",
			category: "weapon-bases",
			itemClass: "One Hand Mace",
			attributes: ["str"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Banishing Blade",
			category: "weapon-bases",
			itemClass: "Two Hand Sword",
			attributes: ["str", "dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Basalt Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Battery Staff",
			category: "weapon-bases",
			itemClass: "Staff",
			attributes: ["str", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Behemoth Mace",
			category: "weapon-bases",
			itemClass: "One Hand Mace",
			attributes: ["str"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Bismuth Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Blizzard Crown",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["dex", "int"],
			level: 75,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Blue Pearl Amulet",
			category: "accessory-bases",
			itemClass: "Amulet",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Bone Helmet",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str", "int"],
			level: 73,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Boom Mace",
			category: "weapon-bases",
			itemClass: "One Hand Mace",
			attributes: ["str"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Brimstone Treads",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["str"],
			level: 80,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Cardinal Round Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str", "dex"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Carnal Armour",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["dex", "int"],
			level: 71,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Carnal Sceptre",
			category: "weapon-bases",
			itemClass: "Sceptre",
			attributes: ["str", "int"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Cerulean Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Champion Kite Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str", "int"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Chimerascale Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["str", "dex"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Chimerascale Gauntlets",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str", "dex"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Citrine Amulet",
			category: "accessory-bases",
			itemClass: "Amulet",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Cold-attuned Buckler",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Colossal Hybrid Flask",
			category: "flask-bases",
			itemClass: "Hybrid Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Colossal Tower Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str"],
			level: 67,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Conqueror's Helmet",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Conquest Helmet",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str", "dex"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Conquest Lamellar",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["str", "dex"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Convoking Wand",
			category: "weapon-bases",
			itemClass: "Wand",
			attributes: ["int"],
			level: 72,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Cord Belt",
			category: "accessory-bases",
			itemClass: "Belt",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Coronal Maul",
			category: "weapon-bases",
			itemClass: "Two Hand Mace",
			attributes: ["str"],
			level: 69,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Corundum Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Crusader Buckler",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["dex"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Cryonic Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Crystal Belt",
			category: "accessory-bases",
			itemClass: "Belt",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Demon Dagger",
			category: "weapon-bases",
			itemClass: "Rune Dagger",
			attributes: ["dex", "int"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Despot Axe",
			category: "weapon-bases",
			itemClass: "Two Hand Axe",
			attributes: ["str", "dex"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Diamond Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Diamond Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Divine Crown",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str", "int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Divine Life Flask",
			category: "flask-bases",
			itemClass: "Life Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Divine Mana Flask",
			category: "flask-bases",
			itemClass: "Mana Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Dragoon Sword",
			category: "weapon-bases",
			itemClass: "Thrusting One Hand Sword",
			attributes: ["dex"],
			level: 72,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Dreamquest Slippers",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["int"],
			level: 80,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Eclipse Staff",
			category: "weapon-bases",
			itemClass: "Staff",
			attributes: ["str", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Elegant Round Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str", "dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Enthalpic Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Eternal Life Flask",
			category: "flask-bases",
			itemClass: "Life Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Eternal Mana Flask",
			category: "flask-bases",
			itemClass: "Mana Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Eternal Sword",
			category: "weapon-bases",
			itemClass: "One Hand Sword",
			attributes: ["str", "dex"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Eventuality Rod",
			category: "weapon-bases",
			itemClass: "Warstaff",
			attributes: ["str", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Exquisite Blade",
			category: "weapon-bases",
			itemClass: "Two Hand Sword",
			attributes: ["str", "dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Eye Gouger",
			category: "weapon-bases",
			itemClass: "Claw",
			attributes: ["dex", "int"],
			level: 64,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Ezomyte Axe",
			category: "weapon-bases",
			itemClass: "Two Hand Axe",
			attributes: ["str", "dex"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Ezomyte Blade",
			category: "weapon-bases",
			itemClass: "Two Hand Sword",
			attributes: ["str", "dex"],
			level: 61,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Ezomyte Staff",
			category: "weapon-bases",
			itemClass: "Warstaff",
			attributes: ["str", "int"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Fingerless Silk Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Fleshripper",
			category: "weapon-bases",
			itemClass: "Two Hand Axe",
			attributes: ["str", "dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Focused Amulet",
			category: "accessory-bases",
			itemClass: "Amulet",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Formless Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Fugitive Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["dex", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Fugitive Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Gavel",
			category: "weapon-bases",
			itemClass: "One Hand Mace",
			attributes: ["str"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Gemini Claw",
			category: "weapon-bases",
			itemClass: "Claw",
			attributes: ["dex", "int"],
			level: 72,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Ghostflame Blade",
			category: "weapon-bases",
			itemClass: "One Hand Sword",
			attributes: ["str", "dex"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Giantslayer Helmet",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Gladius",
			category: "weapon-bases",
			itemClass: "One Hand Sword",
			attributes: ["str", "dex"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Gold Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Granite Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Grasping Mail",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: [
				"str",
				"dex",
				"int"
			],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Gripped Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Grizzly Pelt",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["dex"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Hallowed Hybrid Flask",
			category: "flask-bases",
			itemClass: "Hybrid Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Harbinger Bow",
			category: "weapon-bases",
			itemClass: "Bow",
			attributes: ["dex"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 82
				},
				{
					min: 83,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Harmonic Spirit Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["int"],
			level: 65,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Harpy Rapier",
			category: "weapon-bases",
			itemClass: "Thrusting One Hand Sword",
			attributes: ["dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Harpyskin Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["dex"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Harpyskin Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["dex"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Haunted Bascinet",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str", "dex"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Heat-attuned Tower Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Heavy Arrow Quiver",
			category: "weapon-bases",
			itemClass: "Quiver",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Heavy Belt",
			category: "accessory-bases",
			itemClass: "Belt",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Helical Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Impact Force Propagator",
			category: "weapon-bases",
			itemClass: "Two Hand Mace",
			attributes: ["str"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Imperial Bow",
			category: "weapon-bases",
			itemClass: "Bow",
			attributes: ["dex"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 82
				},
				{
					min: 83,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Imperial Buckler",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["dex"],
			level: 69,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Imperial Claw",
			category: "weapon-bases",
			itemClass: "Claw",
			attributes: ["dex", "int"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Imperial Maul",
			category: "weapon-bases",
			itemClass: "Two Hand Mace",
			attributes: ["str"],
			level: 65,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Imperial Skean",
			category: "weapon-bases",
			itemClass: "Rune Dagger",
			attributes: ["dex", "int"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Imperial Staff",
			category: "weapon-bases",
			itemClass: "Staff",
			attributes: ["str", "int"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Infernal Axe",
			category: "weapon-bases",
			itemClass: "One Hand Axe",
			attributes: ["str", "dex"],
			level: 69,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Infernal Blade",
			category: "weapon-bases",
			itemClass: "Rune Dagger",
			attributes: ["dex", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Infernal Sword",
			category: "weapon-bases",
			itemClass: "Two Hand Sword",
			attributes: ["str", "dex"],
			level: 67,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Infiltrator Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["dex", "int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Infiltrator Mitts",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["dex", "int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Iolite Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Iron Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Jade Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Jewelled Foil",
			category: "weapon-bases",
			itemClass: "Thrusting One Hand Sword",
			attributes: ["dex"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Judgement Staff",
			category: "weapon-bases",
			itemClass: "Warstaff",
			attributes: ["str", "int"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Lathi",
			category: "weapon-bases",
			itemClass: "Staff",
			attributes: ["str", "int"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Leather Belt",
			category: "accessory-bases",
			itemClass: "Belt",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Legion Plate",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["str"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Legion Sword",
			category: "weapon-bases",
			itemClass: "One Hand Sword",
			attributes: ["str", "dex"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Leviathan Gauntlets",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Leviathan Greaves",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["str"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Lich's Circlet",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Lion Sword",
			category: "weapon-bases",
			itemClass: "Two Hand Sword",
			attributes: ["str", "dex"],
			level: 65,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Maelström Staff",
			category: "weapon-bases",
			itemClass: "Warstaff",
			attributes: ["str", "int"],
			level: 64,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Majestic Pelt",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["dex"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Manifold Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Maraketh Bow",
			category: "weapon-bases",
			itemClass: "Bow",
			attributes: ["dex"],
			level: 71,
			bands: [
				{
					min: 74,
					max: 82
				},
				{
					min: 83,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Marshall's Brigandine",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["str", "dex"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Martyr Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["str", "int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Martyr Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str", "int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Meatgrinder",
			category: "weapon-bases",
			itemClass: "Two Hand Mace",
			attributes: ["str"],
			level: 63,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Midnight Blade",
			category: "weapon-bases",
			itemClass: "One Hand Sword",
			attributes: ["str", "dex"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Mirrored Spiked Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["dex", "int"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Mosaic Kite Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str", "int"],
			level: 65,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Necrotic Armour",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["dex", "int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Nexus Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Nightmare Mace",
			category: "weapon-bases",
			itemClass: "One Hand Mace",
			attributes: ["str"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Nightweave Robe",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Occultist's Vestment",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["int"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Onyx Amulet",
			category: "accessory-bases",
			itemClass: "Amulet",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Opal Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Opal Sceptre",
			category: "weapon-bases",
			itemClass: "Sceptre",
			attributes: ["str", "int"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Organic Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Paladin Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["str", "int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Paladin Crown",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str", "int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Paladin Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str", "int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Paladin's Hauberk",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["str", "int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Penitent Mask",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["str", "dex"],
			level: 75,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Pernach",
			category: "weapon-bases",
			itemClass: "One Hand Mace",
			attributes: ["str"],
			level: 64,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Phantom Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["dex", "int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Phantom Mitts",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["dex", "int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Piledriver",
			category: "weapon-bases",
			itemClass: "Two Hand Mace",
			attributes: ["str"],
			level: 61,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Pinnacle Tower Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Platinum Kris",
			category: "weapon-bases",
			itemClass: "Rune Dagger",
			attributes: ["dex", "int"],
			level: 64,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Platinum Sceptre",
			category: "weapon-bases",
			itemClass: "Sceptre",
			attributes: ["str", "int"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Pneumatic Dagger",
			category: "weapon-bases",
			itemClass: "Dagger",
			attributes: ["dex", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Precursor Gauntlets",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Precursor Greaves",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["str"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Primal Arrow Quiver",
			category: "weapon-bases",
			itemClass: "Quiver",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Profane Wand",
			category: "weapon-bases",
			itemClass: "Wand",
			attributes: ["int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Prophecy Wand",
			category: "weapon-bases",
			itemClass: "Wand",
			attributes: ["int"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Psychotic Axe",
			category: "weapon-bases",
			itemClass: "One Hand Axe",
			attributes: ["str", "dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Quartz Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Quicksilver Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Ranger Bow",
			category: "weapon-bases",
			itemClass: "Bow",
			attributes: ["dex"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 82
				},
				{
					min: 83,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Royal Axe",
			category: "weapon-bases",
			itemClass: "One Hand Axe",
			attributes: ["str", "dex"],
			level: 67,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Royal Plate",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["str"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Ruby Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Runic Crown",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: [
				"str",
				"dex",
				"int"
			],
			level: 68,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Runic Gauntlets",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: [
				"str",
				"dex",
				"int"
			],
			level: 69,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Runic Hatchet",
			category: "weapon-bases",
			itemClass: "One Hand Axe",
			attributes: ["str", "dex"],
			level: 71,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Runic Sabatons",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: [
				"str",
				"dex",
				"int"
			],
			level: 69,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Sacred Chainmail",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["str", "int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Sacred Hybrid Flask",
			category: "flask-bases",
			itemClass: "Hybrid Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Sacrificial Garb",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: [
				"str",
				"dex",
				"int"
			],
			level: 72,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Sage Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Sage Slippers",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Sai",
			category: "weapon-bases",
			itemClass: "Dagger",
			attributes: ["dex", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Sambar Sceptre",
			category: "weapon-bases",
			itemClass: "Sceptre",
			attributes: ["str", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Sanctified Life Flask",
			category: "flask-bases",
			itemClass: "Life Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Sanctified Mana Flask",
			category: "flask-bases",
			itemClass: "Mana Flask",
			attributes: [],
			level: 0,
			bands: [{
				min: 83,
				max: 100
			}],
			links: !1,
			quality: !1
		},
		{
			baseType: "Sapphire Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Silver Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Simplex Amulet",
			category: "accessory-bases",
			itemClass: "Amulet",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Solarine Bow",
			category: "weapon-bases",
			itemClass: "Bow",
			attributes: ["dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 82
				},
				{
					min: 83,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Spiked Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Spine Bow",
			category: "weapon-bases",
			itemClass: "Bow",
			attributes: ["dex"],
			level: 64,
			bands: [
				{
					min: 74,
					max: 82
				},
				{
					min: 83,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Spiny Round Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["str", "dex"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Steel Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Stibnite Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Stormrider Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["dex"],
			level: 80,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Stygian Vise",
			category: "accessory-bases",
			itemClass: "Belt",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Sulphur Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Sundering Axe",
			category: "weapon-bases",
			itemClass: "Two Hand Axe",
			attributes: ["str", "dex"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Sunfire Circlet",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Supreme Spiked Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["dex", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Synaptic Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Syndicate's Garb",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["dex"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Tempered Foil",
			category: "weapon-bases",
			itemClass: "Thrusting One Hand Sword",
			attributes: ["dex"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Terror Claw",
			category: "weapon-bases",
			itemClass: "Claw",
			attributes: ["dex", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Terror Maul",
			category: "weapon-bases",
			itemClass: "Two Hand Mace",
			attributes: ["str"],
			level: 67,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Throat Stabber",
			category: "weapon-bases",
			itemClass: "Claw",
			attributes: ["dex", "int"],
			level: 60,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Thwarting Gauntlets",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Tiger Hook",
			category: "weapon-bases",
			itemClass: "One Hand Sword",
			attributes: ["str", "dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Titanium Spirit Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["int"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Topaz Flask",
			category: "flask-bases",
			itemClass: "Utility Flask",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 79
				},
				{
					min: 80,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Tornado Wand",
			category: "weapon-bases",
			itemClass: "Wand",
			attributes: ["int"],
			level: 65,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Torturer Garb",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["dex", "int"],
			level: 78,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Torturer's Mask",
			category: "armour-bases",
			itemClass: "Helmet",
			attributes: ["dex", "int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Transfer-attuned Spirit Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Trapsetter Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["dex"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Turquoise Amulet",
			category: "accessory-bases",
			itemClass: "Amulet",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Twilight Regalia",
			category: "armour-bases",
			itemClass: "Body Armour",
			attributes: ["int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !0,
			quality: !0
		},
		{
			baseType: "Two-Stone Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Two-Toned Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["dex", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Unset Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Vaal Axe",
			category: "weapon-bases",
			itemClass: "Two Hand Axe",
			attributes: ["str", "dex"],
			level: 64,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Vaal Blade",
			category: "weapon-bases",
			itemClass: "One Hand Sword",
			attributes: ["str", "dex"],
			level: 64,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Vaal Claw",
			category: "weapon-bases",
			itemClass: "Claw",
			attributes: ["dex", "int"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Vaal Greatsword",
			category: "weapon-bases",
			itemClass: "Two Hand Sword",
			attributes: ["str", "dex"],
			level: 63,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Vaal Hatchet",
			category: "weapon-bases",
			itemClass: "One Hand Axe",
			attributes: ["str", "dex"],
			level: 65,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Vaal Rapier",
			category: "weapon-bases",
			itemClass: "Thrusting One Hand Sword",
			attributes: ["dex"],
			level: 66,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Vaal Sceptre",
			category: "weapon-bases",
			itemClass: "Sceptre",
			attributes: ["str", "int"],
			level: 64,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Vaal Spirit Shield",
			category: "armour-bases",
			itemClass: "Shield",
			attributes: ["int"],
			level: 62,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Vanguard Belt",
			category: "accessory-bases",
			itemClass: "Belt",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Velour Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["dex"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Velour Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["dex"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Vermillion Ring",
			category: "accessory-bases",
			itemClass: "Ring",
			attributes: [],
			level: 0,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Void Axe",
			category: "weapon-bases",
			itemClass: "Two Hand Axe",
			attributes: ["str", "dex"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !0,
			quality: !1
		},
		{
			baseType: "Void Fangs",
			category: "weapon-bases",
			itemClass: "Claw",
			attributes: ["dex", "int"],
			level: 70,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 81
				},
				{
					min: 82,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Void Sceptre",
			category: "weapon-bases",
			itemClass: "Sceptre",
			attributes: ["str", "int"],
			level: 68,
			bands: [
				{
					min: 74,
					max: 81
				},
				{
					min: 82,
					max: 82
				},
				{
					min: 83,
					max: 100
				}
			],
			links: !1,
			quality: !1
		},
		{
			baseType: "Warlock Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 80
				},
				{
					min: 81,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Warlock Gloves",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["int"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Wyvernscale Boots",
			category: "armour-bases",
			itemClass: "Boots",
			attributes: ["str", "dex"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 84
				},
				{
					min: 85,
					max: 85
				},
				{
					min: 86,
					max: 100
				}
			],
			links: !1,
			quality: !0
		},
		{
			baseType: "Wyvernscale Gauntlets",
			category: "armour-bases",
			itemClass: "Gloves",
			attributes: ["str", "dex"],
			level: 84,
			bands: [
				{
					min: 74,
					max: 83
				},
				{
					min: 84,
					max: 84
				},
				{
					min: 85,
					max: 100
				}
			],
			links: !1,
			quality: !0
		}
	],
	clusters: [
		{
			baseType: "Small Cluster Jewel",
			category: "cluster-jewel-bases",
			minPassives: 2,
			maxPassives: 3,
			bands: [
				{
					min: 1,
					max: 49
				},
				{
					min: 50,
					max: 67
				},
				{
					min: 68,
					max: 74
				},
				{
					min: 75,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			skills: [
				{
					id: "affliction_maximum_life",
					line: "4% increased maximum Life",
					label: "4% increased maximum Life"
				},
				{
					id: "affliction_maximum_energy_shield",
					line: "6% increased maximum Energy Shield",
					label: "6% increased maximum Energy Shield"
				},
				{
					id: "affliction_maximum_mana",
					line: "6% increased maximum Mana",
					label: "6% increased maximum Mana"
				},
				{
					id: "affliction_armour",
					line: "15% increased Armour",
					label: "15% increased Armour"
				},
				{
					id: "affliction_evasion",
					line: "15% increased Evasion Rating",
					label: "15% increased Evasion Rating"
				},
				{
					id: "affliction_chance_to_block_attack_damage",
					line: "+2% Chance to Block Attack Damage",
					label: "+2% Chance to Block Attack Damage"
				},
				{
					id: "affliction_chance_to_block_spell_damage",
					line: "2% Chance to Block Spell Damage",
					label: "2% Chance to Block Spell Damage"
				},
				{
					id: "affliction_fire_resistance",
					line: "+15% to Fire Resistance",
					label: "+15% to Fire Resistance"
				},
				{
					id: "affliction_cold_resistance",
					line: "+15% to Cold Resistance",
					label: "+15% to Cold Resistance"
				},
				{
					id: "affliction_lightning_resistance",
					line: "+15% to Lightning Resistance",
					label: "+15% to Lightning Resistance"
				},
				{
					id: "affliction_chaos_resistance",
					line: "+12% to Chaos Resistance",
					label: "+12% to Chaos Resistance"
				},
				{
					id: "affliction_chance_to_dodge_attacks",
					line: "+4% chance to Suppress Spell Damage",
					label: "+4% chance to Suppress Spell Damage"
				},
				{
					id: "affliction_strength",
					line: "+10 to Strength",
					label: "+10 to Strength"
				},
				{
					id: "affliction_dexterity",
					line: "+10 to Dexterity",
					label: "+10 to Dexterity"
				},
				{
					id: "affliction_intelligence",
					line: "+10 to Intelligence",
					label: "+10 to Intelligence"
				},
				{
					id: "affliction_reservation_efficiency_small",
					line: "6% increased Mana Reservation Efficiency of Skills",
					label: "6% increased Mana Reservation Efficiency of Skills"
				},
				{
					id: "affliction_curse_effect_small",
					line: "2% increased Effect of your Curses",
					label: "2% increased Effect of your Curses"
				}
			]
		},
		{
			baseType: "Medium Cluster Jewel",
			category: "cluster-jewel-bases",
			minPassives: 4,
			maxPassives: 6,
			bands: [
				{
					min: 1,
					max: 49
				},
				{
					min: 50,
					max: 67
				},
				{
					min: 68,
					max: 74
				},
				{
					min: 75,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			skills: [
				{
					id: "affliction_fire_damage_over_time_multiplier",
					line: "12% increased Burning Damage",
					label: "12% increased Burning Damage"
				},
				{
					id: "affliction_chaos_damage_over_time_multiplier",
					line: "12% increased Chaos Damage over Time",
					label: "12% increased Chaos Damage over Time"
				},
				{
					id: "affliction_physical_damage_over_time_multiplier",
					line: "12% increased Physical Damage over Time",
					label: "12% increased Physical Damage over Time"
				},
				{
					id: "affliction_cold_damage_over_time_multiplier",
					line: "12% increased Cold Damage over Time",
					label: "12% increased Cold Damage over Time"
				},
				{
					id: "affliction_damage_over_time_multiplier",
					line: "10% increased Damage over Time",
					label: "10% increased Damage over Time"
				},
				{
					id: "affliction_effect_of_non-damaging_ailments",
					line: "10% increased Effect of Non-Damaging Ailments",
					label: "10% increased Effect of Non-Damaging Ailments"
				},
				{
					id: "affliction_aura_effect",
					line: "3% increased effect of Non-Curse Auras from your Skills",
					label: "3% increased effect of Non-Curse Auras from your Skills"
				},
				{
					id: "affliction_curse_effect",
					line: "2% increased Effect of your Curses",
					label: "2% increased Effect of your Curses"
				},
				{
					id: "affliction_damage_while_you_have_a_herald",
					line: "10% increased Damage while affected by a Herald",
					label: "10% increased Damage while affected by a Herald"
				},
				{
					id: "affliction_minion_damage_while_you_have_a_herald",
					line: "Minions deal 10% increased Damage while you are affected by a Herald",
					label: "Minions deal 10% increased Damage while you are affected by a Herald"
				},
				{
					id: "affliction_warcry_buff_effect",
					line: "Exerted Attacks deal 20% increased Damage",
					label: "Exerted Attacks deal 20% increased Damage"
				},
				{
					id: "affliction_critical_chance",
					line: "15% increased Critical Strike Chance",
					label: "15% increased Critical Strike Chance"
				},
				{
					id: "affliction_minion_life",
					line: "Minions have 12% increased maximum Life",
					label: "Minions have 12% increased maximum Life"
				},
				{
					id: "affliction_area_damage",
					line: "10% increased Area Damage",
					label: "10% increased Area Damage"
				},
				{
					id: "affliction_projectile_damage",
					line: "10% increased Projectile Damage",
					label: "10% increased Projectile Damage"
				},
				{
					id: "affliction_trap_and_mine_damage",
					line: "12% increased Trap Damage",
					label: "12% increased Trap Damage, 12% increased Mine Damage"
				},
				{
					id: "affliction_totem_damage",
					line: "12% increased Totem Damage",
					label: "12% increased Totem Damage"
				},
				{
					id: "affliction_brand_damage",
					line: "12% increased Brand Damage",
					label: "12% increased Brand Damage"
				},
				{
					id: "affliction_channelling_skill_damage",
					line: "Channelling Skills deal 12% increased Damage",
					label: "Channelling Skills deal 12% increased Damage"
				},
				{
					id: "affliction_flask_duration",
					line: "6% increased Flask Effect Duration",
					label: "6% increased Flask Effect Duration"
				},
				{
					id: "affliction_life_and_mana_recovery_from_flasks",
					line: "10% increased Life Recovery from Flasks",
					label: "10% increased Life Recovery from Flasks, 10% increased Mana Recovery from Flasks"
				}
			]
		},
		{
			baseType: "Large Cluster Jewel",
			category: "cluster-jewel-bases",
			minPassives: 8,
			maxPassives: 12,
			bands: [
				{
					min: 1,
					max: 49
				},
				{
					min: 50,
					max: 67
				},
				{
					min: 68,
					max: 74
				},
				{
					min: 75,
					max: 83
				},
				{
					min: 84,
					max: 100
				}
			],
			skills: [
				{
					id: "affliction_axe_and_sword_damage",
					line: "Axe Attacks deal 12% increased Damage with Hits and Ailments",
					label: "Axe Attacks deal 12% increased Damage with Hits and Ailments, Sword Attacks deal 12% increased Damage with Hits and Ailments"
				},
				{
					id: "affliction_mace_and_staff_damage",
					line: "Mace or Sceptre Attacks deal 12% increased Damage with Hits and Ailments",
					label: "Mace or Sceptre Attacks deal 12% increased Damage with Hits and Ailments, Staff Attacks deal 12% increased Damage with Hits and Ailments"
				},
				{
					id: "affliction_dagger_and_claw_damage",
					line: "Dagger Attacks deal 12% increased Damage with Hits and Ailments",
					label: "Dagger Attacks deal 12% increased Damage with Hits and Ailments, Claw Attacks deal 12% increased Damage with Hits and Ailments"
				},
				{
					id: "affliction_bow_damage",
					line: "12% increased Damage with Bows",
					label: "12% increased Damage with Bows, 12% increased Damage Over Time with Bow Skills"
				},
				{
					id: "affliction_wand_damage",
					line: "Wand Attacks deal 12% increased Damage with Hits and Ailments",
					label: "Wand Attacks deal 12% increased Damage with Hits and Ailments"
				},
				{
					id: "affliction_damage_with_two_handed_melee_weapons",
					line: "12% increased Damage with Two Handed Weapons",
					label: "12% increased Damage with Two Handed Weapons"
				},
				{
					id: "affliction_attack_damage_while_dual_wielding_",
					line: "12% increased Attack Damage while Dual Wielding",
					label: "12% increased Attack Damage while Dual Wielding"
				},
				{
					id: "affliction_attack_damage_while_holding_a_shield",
					line: "12% increased Attack Damage while holding a Shield",
					label: "12% increased Attack Damage while holding a Shield"
				},
				{
					id: "affliction_attack_damage_",
					line: "10% increased Attack Damage",
					label: "10% increased Attack Damage"
				},
				{
					id: "affliction_spell_damage",
					line: "10% increased Spell Damage",
					label: "10% increased Spell Damage"
				},
				{
					id: "affliction_elemental_damage",
					line: "10% increased Elemental Damage",
					label: "10% increased Elemental Damage"
				},
				{
					id: "affliction_physical_damage",
					line: "12% increased Physical Damage",
					label: "12% increased Physical Damage"
				},
				{
					id: "affliction_fire_damage",
					line: "12% increased Fire Damage",
					label: "12% increased Fire Damage"
				},
				{
					id: "affliction_lightning_damage",
					line: "12% increased Lightning Damage",
					label: "12% increased Lightning Damage"
				},
				{
					id: "affliction_cold_damage",
					line: "12% increased Cold Damage",
					label: "12% increased Cold Damage"
				},
				{
					id: "affliction_chaos_damage",
					line: "12% increased Chaos Damage",
					label: "12% increased Chaos Damage"
				},
				{
					id: "affliction_minion_damage",
					line: "Minions deal 10% increased Damage",
					label: "Minions deal 10% increased Damage"
				}
			]
		}
	]
}, um = I({
	min: M().int(),
	max: M().int()
}), dm = I({
	bases: P(I({
		baseType: A().min(1),
		category: A().min(1),
		itemClass: A().min(1),
		attributes: P(z([
			"str",
			"dex",
			"int"
		])),
		level: M().int().nullable(),
		bands: P(um),
		links: N(),
		quality: N()
	})),
	clusters: P(I({
		baseType: A().min(1),
		category: A().min(1),
		minPassives: M().int(),
		maxPassives: M().int(),
		bands: P(um),
		skills: P(I({
			id: A().min(1),
			line: A().min(1),
			label: A().min(1)
		}))
	}))
}).parse(lm);
new Map(dm.bases.map((e) => [e.baseType, e])), new Map(dm.clusters.map((e) => [e.baseType, e])), [...[
	"corrupted",
	"mirrored",
	"fractured",
	"synthesised",
	"influenced",
	"intangible"
].map((e) => ({
	kind: "flag",
	field: e,
	value: !1
}))];
// ../../packages/poe-market/src/cohorts.ts
var fm = I({
	id: A().min(1).max(128),
	name: A().min(1).max(300),
	purpose: z([
		"base",
		"fracture",
		"isolated-modifier",
		"transfer-donor"
	]),
	query: Jc
});
I({
	format: B(1),
	game: B("poe1"),
	revision: A().min(1).max(100),
	catalogHash: A().regex(/^[a-f0-9]{64}$/),
	cohorts: P(fm).max(1e5),
	modifierIdentities: P(_l).max(2e4).optional(),
	baseIdentities: P(Xc).max(2e3).optional(),
	modifierTextModel: tl.optional(),
	sourcePreparationModel: nl.optional()
}).superRefine((e, t) => {
	let n = /* @__PURE__ */ new Set();
	for (let [r, i] of e.cohorts.entries()) n.has(i.id) && t.addIssue({
		code: "custom",
		path: [
			"cohorts",
			r,
			"id"
		],
		message: "Duplicate market cohort ID."
	}), i.query.game !== e.game && t.addIssue({
		code: "custom",
		path: [
			"cohorts",
			r,
			"query"
		],
		message: "Cohort and manifest games differ."
	}), n.add(i.id);
}), fm.extend({
	revision: A().min(1).max(100),
	catalogHash: A().regex(/^[a-f0-9]{64}$/)
});
// ../../packages/poe-market/src/coverage.ts
function pm(e, t) {
	return e?.kind === "influence-ready-v1" || t?.kind === "influence-ready-v1" ? e?.kind === t?.kind : e === void 0 || t === void 0 ? e === t : e.kind === t.kind && (e.kind !== "fractured-fossil-v1" || t.kind === "fractured-fossil-v1" && e.fractureId === t.fractureId) && e.crafted === t.crafted && e.enchanted === t.enchanted;
}
var mm = {
	fetchedAt: "2026-10-27T05:16:34.546Z",
	sources: ["https://www.pathofexile.com/api/trade/data/static", "https://www.pathofexile.com/api/trade2/data/static"],
	poe1: {
		alt: "Metadata/Items/Currency/CurrencyRerollMagic",
		fusing: "Metadata/Items/Currency/CurrencyRerollSocketLinks",
		alch: "Metadata/Items/Currency/CurrencyUpgradeToRare",
		chaos: "Metadata/Items/Currency/CurrencyRerollRare",
		gcp: "Metadata/Items/Currency/CurrencyGemQuality",
		exalted: "Metadata/Items/Currency/CurrencyAddModToRare",
		chrome: "Metadata/Items/Currency/CurrencyRerollSocketColours",
		jewellers: "Metadata/Items/Currency/CurrencyRerollSocketNumbers",
		engineers: "Metadata/Items/Currency/CurrencyStrongboxQuality",
		"infused-engineers-orb": "Metadata/Items/Currency/CurrencyStrongboxQualityInfused",
		chance: "Metadata/Items/Currency/CurrencyUpgradeRandomly",
		chisel: "Metadata/Items/Currency/CurrencyMapQuality",
		scour: "Metadata/Items/Currency/CurrencyConvertToNormal",
		blessed: "Metadata/Items/Currency/CurrencyRerollImplicit",
		regret: "Metadata/Items/Currency/CurrencyPassiveRefund",
		regal: "Metadata/Items/Currency/CurrencyUpgradeMagicToRare",
		divine: "Metadata/Items/Currency/CurrencyModValues",
		vaal: "Metadata/Items/Currency/CurrencyCorrupt",
		annul: "Metadata/Items/Currency/CurrencyRemoveMod",
		"orb-of-binding": "Metadata/Items/Currency/CurrencyUpgradeToRareAndSetSockets",
		"ancient-orb": "Metadata/Items/Currency/CurrencyRerollUnique",
		"orb-of-horizons": "Metadata/Items/Currency/CurrencyRerollMapType",
		"harbingers-orb": "Metadata/Items/Currency/CurrencyUpgradeMapTier",
		"fracturing-orb": "Metadata/Items/Currency/CurrencyFractureRare",
		wisdom: "Metadata/Items/Currency/CurrencyIdentification",
		portal: "Metadata/Items/Currency/CurrencyPortal",
		scrap: "Metadata/Items/Currency/CurrencyArmourQuality",
		whetstone: "Metadata/Items/Currency/CurrencyWeaponQuality",
		bauble: "Metadata/Items/Currency/CurrencyFlaskQuality",
		transmute: "Metadata/Items/Currency/CurrencyUpgradeToMagic",
		aug: "Metadata/Items/Currency/CurrencyAddModToMagic",
		mirror: "Metadata/Items/Currency/CurrencyDuplicate",
		eternal: "Metadata/Items/Currency/CurrencyImprintOrb",
		"rogues-marker": "Metadata/Items/Heist/HeistCoin",
		"tempering-orb": "Metadata/Items/Currency/CurrencyHeistWeaponEnchant",
		"tailoring-orb": "Metadata/Items/Currency/CurrencyHeistArmourEnchant",
		"orb-of-unmaking": "Metadata/Items/Currency/CurrencyAtlasPassiveRefund",
		"flesh-of-xesht": "Metadata/Items/Currency/CurrencyBreachUpgradeUniqueGeneral",
		"veiled-chaos-orb": "Metadata/Items/Currency/CurrencyRerollRareVeiledChaos",
		"veiled-exalted-orb": "Metadata/Items/Currency/CurrencyRerollRareVeiled",
		"enkindling-orb": "Metadata/Items/Currency/CurrencyEnkindlingOrb",
		"instilling-orb": "Metadata/Items/Currency/CurrencyInstillingOrb",
		"sacred-orb": "Metadata/Items/Currency/CurrencyRerollDefences",
		"stacked-deck": "Metadata/Items/DivinationCards/DivinationCardDeck",
		"veiled-scarab": "Metadata/Items/Currency/CurrencyStackedScarab",
		"dead-mans-sulphur": "Metadata/Items/Currency/CurrencyDeepwater",
		"shapers-exalted-orb": "Metadata/Items/Currency/CurrencyAddModToRareShaper",
		"elders-exalted-orb": "Metadata/Items/Currency/CurrencyAddModToRareElder",
		"crusaders-exalted-orb": "Metadata/Items/AtlasExiles/AddModToRareCrusader",
		"redeemers-exalted-orb": "Metadata/Items/AtlasExiles/AddModToRareRedeemer",
		"hunters-exalted-orb": "Metadata/Items/AtlasExiles/AddModToRareHunter",
		"warlords-exalted-orb": "Metadata/Items/AtlasExiles/AddModToRareWarlord",
		"awakeners-orb": "Metadata/Items/AtlasExiles/ApplyInfluence",
		"mavens-orb": "Metadata/Items/Currency/CurrencyUpgradeInfluenceMod",
		"orb-of-remembrance": "Metadata/Items/Currency/CurrencyAddZanaInfluence",
		"orb-of-unravelling": "Metadata/Items/Currency/CurrencyRemoveZanaInfluence",
		"orb-of-intention": "Metadata/Items/Currency/CurrencyMoreZanaInfluencedItems",
		"eldritch-chaos-orb": "Metadata/Items/Currency/CurrencyEldritchRerollRare",
		"eldritch-exalted-orb": "Metadata/Items/Currency/CurrencyEldritchAddModToRare",
		"eldritch-orb-of-annulment": "Metadata/Items/Currency/CurrencyEldritchRemoveMod",
		"lesser-eldritch-ember": "Metadata/Items/Currency/CurrencyEldritchEmber1",
		"greater-eldritch-ember": "Metadata/Items/Currency/CurrencyEldritchEmber2",
		"grand-eldritch-ember": "Metadata/Items/Currency/CurrencyEldritchEmber3",
		"exceptional-eldritch-ember": "Metadata/Items/Currency/CurrencyEldritchEmber4",
		"lesser-eldritch-ichor": "Metadata/Items/Currency/CurrencyEldritchIchor1",
		"greater-eldritch-ichor": "Metadata/Items/Currency/CurrencyEldritchIchor2",
		"grand-eldritch-ichor": "Metadata/Items/Currency/CurrencyEldritchIchor3",
		"exceptional-eldritch-ichor": "Metadata/Items/Currency/CurrencyEldritchIchor4",
		"orb-of-conflict": "Metadata/Items/Currency/CurrencyConflictOrb",
		"tainted-chromatic-orb": "Metadata/Items/Currency/CurrencyHellscapeRerollSocketColours",
		"tainted-orb-of-fusing": "Metadata/Items/Currency/CurrencyHellscapeRerollSocketLinks",
		"tainted-jewellers-orb": "Metadata/Items/Currency/CurrencyHellscapeRerollSocketNumbers",
		"tainted-chaos-orb": "Metadata/Items/Currency/CurrencyHellscapeRerollRare",
		"tainted-exalted-orb": "Metadata/Items/Currency/CurrencyHellscapeAddModToRare",
		"tainted-mythic-orb": "Metadata/Items/Currency/CurrencyHellscapeUpgradeToUnique",
		"tainted-armourers-scrap": "Metadata/Items/Currency/CurrencyHellscapeArmourQuality",
		"tainted-blacksmiths-whetstone": "Metadata/Items/Currency/CurrencyHellscapeWeaponQuality",
		"tainted-divine-teardrop": "Metadata/Items/Currency/CurrencyHellscapeUpgradeModTier",
		"tainted-divine-orb": "Metadata/Items/Currency/CurrencyHellscapeModValues",
		"wild-lifeforce": "Metadata/Items/Currency/HarvestSeedRed",
		"vivid-lifeforce": "Metadata/Items/Currency/HarvestSeedGreen",
		"primal-lifeforce": "Metadata/Items/Currency/HarvestSeedBlue",
		"sacred-lifeforce": "Metadata/Items/Currency/HarvestSeedBoss",
		"sandswept-lifeforce": "Metadata/Items/Currency/HarvestSeedFaridun",
		"cluster-fog": "Metadata/Items/Currency/CurrencyAfflictionRerollClusterEnchant",
		"hinekoras-lock": "Metadata/Items/Currency/CurrencyHinekorasLock",
		"mavens-chisel-of-procurement": "Metadata/Items/Currency/CurrencyMapQualityRarity",
		"mavens-chisel-of-proliferation": "Metadata/Items/Currency/CurrencyMapQualityPackSize",
		"mavens-chisel-of-divination": "Metadata/Items/Currency/CurrencyMapQualityDivinationCards",
		"mavens-chisel-of-scarabs": "Metadata/Items/Currency/CurrencyMapQualityScarabs",
		"mavens-chisel-of-avarice": "Metadata/Items/Currency/CurrencyMapQualityCurrency",
		"reflecting-mist": "Metadata/Items/Currency/ReflectiveMist",
		"transmutation-shard": "Metadata/Items/Currency/CurrencyUpgradeToMagicShard",
		"alteration-shard": "Metadata/Items/Currency/CurrencyRerollMagicShard",
		"alchemy-shard": "Metadata/Items/Currency/CurrencyUpgradeToRareShard",
		"chaos-shard": "Metadata/Items/Currency/CurrencyRerollRareShard",
		"regal-shard": "Metadata/Items/Currency/CurrencyUpgradeMagicToRareShard",
		"exalted-shard": "Metadata/Items/Currency/CurrencyAddModToRareShard",
		"annulment-shard": "Metadata/Items/Currency/CurrencyRemoveModShard",
		"fracturing-shard": "Metadata/Items/Currency/CurrencyFractureRareShard",
		"mirror-shard": "Metadata/Items/Currency/CurrencyDuplicateShard"
	},
	poe2: {
		wisdom: "Metadata/Items/Currency/CurrencyIdentification",
		transmute: "Metadata/Items/Currency/CurrencyUpgradeToMagic",
		"greater-orb-of-transmutation": "Metadata/Items/Currency/CurrencyUpgradeToMagic2",
		"perfect-orb-of-transmutation": "Metadata/Items/Currency/CurrencyUpgradeToMagic3",
		aug: "Metadata/Items/Currency/CurrencyAddModToMagic",
		"greater-orb-of-augmentation": "Metadata/Items/Currency/CurrencyAddModToMagic2",
		"perfect-orb-of-augmentation": "Metadata/Items/Currency/CurrencyAddModToMagic3",
		chance: "Metadata/Items/Currency/CurrencyUpgradeRandomly",
		alch: "Metadata/Items/Currency/CurrencyUpgradeToRare",
		chaos: "Metadata/Items/Currency/CurrencyRerollRare",
		"greater-chaos-orb": "Metadata/Items/Currency/CurrencyRerollRare2",
		"perfect-chaos-orb": "Metadata/Items/Currency/CurrencyRerollRare3",
		vaal: "Metadata/Items/Currency/CurrencyCorrupt",
		regal: "Metadata/Items/Currency/CurrencyUpgradeMagicToRare",
		"greater-regal-orb": "Metadata/Items/Currency/CurrencyUpgradeMagicToRare2",
		"perfect-regal-orb": "Metadata/Items/Currency/CurrencyUpgradeMagicToRare3",
		exalted: "Metadata/Items/Currency/CurrencyAddModToRare",
		"greater-exalted-orb": "Metadata/Items/Currency/CurrencyAddModToRare2",
		"perfect-exalted-orb": "Metadata/Items/Currency/CurrencyAddModToRare3",
		divine: "Metadata/Items/Currency/CurrencyModValues",
		annul: "Metadata/Items/Currency/CurrencyRemoveMod",
		artificers: "Metadata/Items/Currency/CurrencyAddEquipmentSocket",
		"fracturing-orb": "Metadata/Items/Currency/CurrencyFractureRare",
		mirror: "Metadata/Items/Currency/CurrencyDuplicate",
		"hinekoras-lock": "Metadata/Items/Currency/CurrencyHinekorasLock",
		"cryptic-key": "Metadata/Items/Currency/StrongboxKey",
		"lesser-jewellers-orb": "Metadata/Items/Currency/CurrencyAddSkillGemSocket3",
		"greater-jewellers-orb": "Metadata/Items/Currency/CurrencyAddSkillGemSocket4",
		"perfect-jewellers-orb": "Metadata/Items/Currency/CurrencyAddSkillGemSocket5",
		scrap: "Metadata/Items/Currency/CurrencyArmourQuality",
		whetstone: "Metadata/Items/Currency/CurrencyWeaponQuality",
		etcher: "Metadata/Items/Currency/CurrencyMagicQuality",
		bauble: "Metadata/Items/Currency/CurrencyFlaskQuality",
		gcp: "Metadata/Items/Currency/CurrencyGemQuality",
		"transmutation-shard": "Metadata/Items/Currency/CurrencyUpgradeToMagicShard",
		"chance-shard": "Metadata/Items/Currency/CurrencyUpgradeRandomlyShard",
		"regal-shard": "Metadata/Items/Currency/CurrencyUpgradeMagicToRareShard",
		"artificers-shard": "Metadata/Items/Currency/CurrencyAddEquipmentSocketShard"
	}
}, hm = F({
	id: A().min(1).max(100),
	category: A().max(100).nullable(),
	rules: P(A().max(100)).max(20),
	startAt: M().int().nonnegative().nullable(),
	endAt: M().int().nonnegative().nullable()
});
F({
	realm: z([
		"pc",
		"poe2",
		"xbox",
		"sony"
	]),
	listedAt: M().int().nonnegative(),
	rows: P(hm).min(1).max(500)
});
// ../../packages/poe-market/src/exchange.ts
var gm = A().startsWith("Metadata/Items/").max(500), _m = z([
	"pc",
	"xbox",
	"sony",
	"poe2"
]), vm = I({
	realm: _m,
	league: A().min(1).max(100),
	itemId: gm,
	quoteId: gm,
	window: B("adaptive-v1").optional(),
	conversion: z(["reference-currency-v1", "two-leg-exchange-v1"]).optional()
});
F({
	realm: _m,
	league: A().min(1).max(100),
	marketId: A().min(1).max(1001),
	hour: M().int().nonnegative().multipleOf(3600),
	volumeTraded: R(A(), M().nonnegative()).nullable(),
	lowestRatio: R(A(), M().nonnegative()).nullable(),
	highestRatio: R(A(), M().nonnegative()).nullable()
});
var ym = vm.extend({
	amount: M().positive(),
	hour: M().int().nonnegative().multipleOf(3600).nullable(),
	marketId: A().nullable(),
	low: M().positive().nullable(),
	high: M().positive().nullable(),
	itemVolume: M().positive().nullable(),
	quoteVolume: M().positive().nullable(),
	windowStart: M().int().nonnegative().multipleOf(3600).optional(),
	estimator: z([
		"traded-volume-ratio-v1",
		"adaptive-volume-ratio-v1",
		"currency-unit-v1"
	])
}), bm = ym.extend({
	estimator: z([
		"traded-volume-ratio-v1",
		"adaptive-volume-ratio-v1",
		"currency-unit-v1",
		"cross-rate-v1"
	]),
	legs: Qs([ym, ym]).optional()
}), xm = {
	chaos: "Metadata/Items/Currency/CurrencyRerollRare",
	divine: "Metadata/Items/Currency/CurrencyModValues",
	exalted: "Metadata/Items/Currency/CurrencyAddModToRare",
	mirror: "Metadata/Items/Currency/CurrencyDuplicate",
	blessed: "Metadata/Items/Currency/CurrencyRerollImplicit",
	chrome: "Metadata/Items/Currency/CurrencyRerollSocketColours",
	gcp: "Metadata/Items/Currency/CurrencyGemQuality",
	jewellers: "Metadata/Items/Currency/CurrencyRerollSocketNumbers",
	scour: "Metadata/Items/Currency/CurrencyConvertToNormal",
	regret: "Metadata/Items/Currency/CurrencyPassiveRefund",
	fusing: "Metadata/Items/Currency/CurrencyRerollSocketLinks",
	chance: "Metadata/Items/Currency/CurrencyUpgradeRandomly",
	alt: "Metadata/Items/Currency/CurrencyRerollMagic",
	alch: "Metadata/Items/Currency/CurrencyUpgradeToRare",
	regal: "Metadata/Items/Currency/CurrencyUpgradeMagicToRare",
	vaal: "Metadata/Items/Currency/CurrencyCorrupt"
}, Sm = z(Object.keys(xm));
function Cm(e) {
	let t = Sm.safeParse(e);
	return t.success ? xm[t.data] : gm.safeParse(e).success ? e : null;
}
function wm(e, t) {
	let n = mm[t];
	return Object.hasOwn(n, e) ? n[e] : Cm(e);
}
new Set(["chaos", "divine"].map((e) => wm(e, "poe1"))), new Set([
	"exalted",
	"chaos",
	"annul",
	"divine"
].map((e) => wm(e, "poe2")));
var Tm = {
	fetchedAt: "2026-10-28T03:39:41.967Z",
	sources: ["https://www.pathofexile.com/api/trade/data/items", "packages/poe-1-data/data/base_items.json"],
	transfigured: /* @__PURE__ */ JSON.parse("{\"Absolution of Inspiring\":\"Absolution\",\"Animate Guardian of Smiting\":\"Animate Guardian\",\"Animate Weapon of Ranged Arms\":\"Animate Weapon\",\"Animate Weapon of Self Reflection\":\"Animate Weapon\",\"Arc of Oscillating\":\"Arc\",\"Arc of Surging\":\"Arc\",\"Armageddon Brand of Recall\":\"Armageddon Brand\",\"Armageddon Brand of Volatility\":\"Armageddon Brand\",\"Artillery Ballista of Cross Strafe\":\"Artillery Ballista\",\"Artillery Ballista of Focus Fire\":\"Artillery Ballista\",\"Ball Lightning of Orbiting\":\"Ball Lightning\",\"Ball Lightning of Static\":\"Ball Lightning\",\"Bane of Condemnation\":\"Bane\",\"Barrage of Volley Fire\":\"Barrage\",\"Bear Trap of Skewers\":\"Bear Trap\",\"Blade Blast of Dagger Detonation\":\"Blade Blast\",\"Blade Blast of Unloading\":\"Blade Blast\",\"Blade Flurry of Incision\":\"Blade Flurry\",\"Blade Trap of Greatswords\":\"Blade Trap\",\"Blade Trap of Laceration\":\"Blade Trap\",\"Blade Vortex of the Scythe\":\"Blade Vortex\",\"Bladefall of Impaling\":\"Bladefall\",\"Bladefall of Trarthus\":\"Bladefall\",\"Bladefall of Volleys\":\"Bladefall\",\"Bladestorm of Uncertainty\":\"Bladestorm\",\"Blast Rain of Trarthus\":\"Blast Rain\",\"Blight of Atrophy\":\"Blight\",\"Blight of Contagion\":\"Blight\",\"Blink Arrow of Bombarding Clones\":\"Blink Arrow\",\"Blink Arrow of Prismatic Clones\":\"Blink Arrow\",\"Bodyswap of Sacrifice\":\"Bodyswap\",\"Boneshatter of Carnage\":\"Boneshatter\",\"Boneshatter of Complex Trauma\":\"Boneshatter\",\"Burning Arrow of Vigour\":\"Burning Arrow\",\"Caustic Arrow of Poison\":\"Caustic Arrow\",\"Chain Hook of Angling\":\"Chain Hook\",\"Chain Hook of Trarthus\":\"Chain Hook\",\"Charged Dash of Projection\":\"Charged Dash\",\"Cleave of Rage\":\"Cleave\",\"Cold Snap of Power\":\"Cold Snap\",\"Consecrated Path of Endurance\":\"Consecrated Path\",\"Contagion of Subsiding\":\"Contagion\",\"Contagion of Transference\":\"Contagion\",\"Crackling Lance of Branching\":\"Crackling Lance\",\"Crackling Lance of Disintegration\":\"Crackling Lance\",\"Creeping Frost of Floes\":\"Creeping Frost\",\"Cremation of Exhuming\":\"Cremation\",\"Cremation of the Volcano\":\"Cremation\",\"Cyclone of Tumult\":\"Cyclone\",\"Dark Bargain of Trarthus\":\"Dark Bargain\",\"Detonate Dead of Chain Reaction\":\"Detonate Dead\",\"Detonate Dead of Scavenging\":\"Detonate Dead\",\"Discharge of Misery\":\"Discharge\",\"Divine Blast of Radiance\":\"Divine Blast\",\"Divine Ire of Disintegration\":\"Divine Ire\",\"Divine Ire of Holy Lightning\":\"Divine Ire\",\"Dominating Blow of Inspiring\":\"Dominating Blow\",\"Double Strike of Impaling\":\"Double Strike\",\"Double Strike of Momentum\":\"Double Strike\",\"Dual Strike of Ambidexterity\":\"Dual Strike\",\"Earthquake of Amplification\":\"Earthquake\",\"Earthshatter of Fragility\":\"Earthshatter\",\"Earthshatter of Prominence\":\"Earthshatter\",\"Elemental Hit of the Spectrum\":\"Elemental Hit\",\"Essence Drain of Desperation\":\"Essence Drain\",\"Essence Drain of Wickedness\":\"Essence Drain\",\"Ethereal Knives of Lingering Blades\":\"Ethereal Knives\",\"Ethereal Knives of the Massacre\":\"Ethereal Knives\",\"Explosive Concoction of Destruction\":\"Explosive Concoction\",\"Explosive Trap of Magnitude\":\"Explosive Trap\",\"Explosive Trap of Shrapnel\":\"Explosive Trap\",\"Exsanguinate of Transmission\":\"Exsanguinate\",\"Eye of Winter of Finality\":\"Eye of Winter\",\"Eye of Winter of Transience\":\"Eye of Winter\",\"Fire Trap of Blasting\":\"Fire Trap\",\"Firestorm of Meteors\":\"Firestorm\",\"Firestorm of Pelting\":\"Firestorm\",\"Flame Dash of Return\":\"Flame Dash\",\"Flame Surge of Combusting\":\"Flame Surge\",\"Flameblast of Celerity\":\"Flameblast\",\"Flameblast of Contraction\":\"Flameblast\",\"Flamethrower Trap of Stability\":\"Flamethrower Trap\",\"Flicker Strike of Power\":\"Flicker Strike\",\"Forbidden Rite of Soul Sacrifice\":\"Forbidden Rite\",\"Frenzy of Onslaught\":\"Frenzy\",\"Frost Blades of Katabasis\":\"Frost Blades\",\"Frost Bomb of Forthcoming\":\"Frost Bomb\",\"Frost Bomb of Instability\":\"Frost Bomb\",\"Frostblink of Wintry Blast\":\"Frostblink\",\"Frozen Legion of Rallying\":\"Frozen Legion\",\"Galvanic Arrow of Energy\":\"Galvanic Arrow\",\"Galvanic Arrow of Surging\":\"Galvanic Arrow\",\"Galvanic Field of Intensity\":\"Galvanic Field\",\"Glacial Cascade of the Fissure\":\"Glacial Cascade\",\"Glacial Hammer of Shattering\":\"Glacial Hammer\",\"Ground Slam of Earthshaking\":\"Ground Slam\",\"Heavy Strike of Trarthus\":\"Heavy Strike\",\"Hexblast of Contradiction\":\"Hexblast\",\"Hexblast of Havoc\":\"Hexblast\",\"Holy Flame Totem of Ire\":\"Holy Flame Totem\",\"Holy Hammers of Spirals\":\"Holy Hammers\",\"Holy Sweep of Hammerfalls\":\"Holy Sweep\",\"Ice Crash of Cadence\":\"Ice Crash\",\"Ice Nova of Deep Freeze\":\"Ice Nova\",\"Ice Nova of Frostbolts\":\"Ice Nova\",\"Ice Shot of Penetration\":\"Ice Shot\",\"Ice Spear of Splitting\":\"Ice Spear\",\"Ice Trap of Hollowness\":\"Ice Trap\",\"Icicle Mine of Fanning\":\"Icicle Mine\",\"Icicle Mine of Sabotage\":\"Icicle Mine\",\"Incinerate of Expanse\":\"Incinerate\",\"Incinerate of Venting\":\"Incinerate\",\"Infernal Blow of Immolation\":\"Infernal Blow\",\"Kinetic Blast of Clustering\":\"Kinetic Blast\",\"Kinetic Bolt of Fragmentation\":\"Kinetic Bolt\",\"Kinetic Fusillade of Detonation\":\"Kinetic Fusillade\",\"Kinetic Rain of Impact\":\"Kinetic Rain\",\"Lacerate of Butchering\":\"Lacerate\",\"Lacerate of Haemorrhage\":\"Lacerate\",\"Lancing Steel of Spraying\":\"Lancing Steel\",\"Leap Slam of Groundbreaking\":\"Leap Slam\",\"Lightning Arrow of Electrocution\":\"Lightning Arrow\",\"Lightning Conduit of the Heavens\":\"Lightning Conduit\",\"Lightning Spire Trap of Overloading\":\"Lightning Spire Trap\",\"Lightning Spire Trap of Zapping\":\"Lightning Spire Trap\",\"Lightning Strike of Arcing\":\"Lightning Strike\",\"Lightning Tendrils of Eccentricity\":\"Lightning Tendrils\",\"Lightning Tendrils of Escalation\":\"Lightning Tendrils\",\"Lightning Trap of Sparking\":\"Lightning Trap\",\"Mirror Arrow of Bombarding Clones\":\"Mirror Arrow\",\"Mirror Arrow of Prismatic Clones\":\"Mirror Arrow\",\"Molten Strike of the Zenith\":\"Molten Strike\",\"Orb of Storms of Squalls\":\"Orb of Storms\",\"Penance Brand of Conduction\":\"Penance Brand\",\"Penance Brand of Dissipation\":\"Penance Brand\",\"Perforate of Bloodshed\":\"Perforate\",\"Perforate of Duality\":\"Perforate\",\"Poisonous Concoction of Bouncing\":\"Poisonous Concoction\",\"Power Siphon of the Archmage\":\"Power Siphon\",\"Puncture of Shanking\":\"Puncture\",\"Purifying Flame of Revelations\":\"Purifying Flame\",\"Pyroclast Mine of Sabotage\":\"Pyroclast Mine\",\"Rage Vortex of Berserking\":\"Rage Vortex\",\"Rain of Arrows of Artillery\":\"Rain of Arrows\",\"Rain of Arrows of Saturation\":\"Rain of Arrows\",\"Raise Spectre of Transience\":\"Raise Spectre\",\"Raise Zombie of Falling\":\"Raise Zombie\",\"Raise Zombie of Slamming\":\"Raise Zombie\",\"Reap of Butchery\":\"Reap\",\"Reave of Refraction\":\"Reave\",\"Righteous Fire of Arcane Devotion\":\"Righteous Fire\",\"Scorching Ray of Immolation\":\"Scorching Ray\",\"Scourge Arrow of Menace\":\"Scourge Arrow\",\"Searing Bond of Detonation\":\"Searing Bond\",\"Seismic Trap of Swells\":\"Seismic Trap\",\"Shattering Steel of Ammunition\":\"Shattering Steel\",\"Shield Crush of the Chieftain\":\"Shield Crush\",\"Shock Nova of Procession\":\"Shock Nova\",\"Shockwave Totem of Authority\":\"Shockwave Totem\",\"Shrapnel Ballista of Steel\":\"Shrapnel Ballista\",\"Siege Ballista of Splintering\":\"Siege Ballista\",\"Siege Ballista of Trarthus\":\"Siege Ballista\",\"Siphoning Trap of Pain\":\"Siphoning Trap\",\"Smite of Divine Judgement\":\"Smite\",\"Soulrend of Reaping\":\"Soulrend\",\"Soulrend of the Spiral\":\"Soulrend\",\"Spark of the Nova\":\"Spark\",\"Spark of Unpredictability\":\"Spark\",\"Spectral Helix of Trarthus\":\"Spectral Helix\",\"Spectral Shield Throw of Shattering\":\"Spectral Shield Throw\",\"Spectral Shield Throw of Trarthus\":\"Spectral Shield Throw\",\"Spectral Throw of Materialising\":\"Spectral Throw\",\"Spectral Throw of Trarthus\":\"Spectral Throw\",\"Split Arrow of Splitting\":\"Split Arrow\",\"Splitting Steel of Ammunition\":\"Splitting Steel\",\"Static Strike of Gathering Lightning\":\"Static Strike\",\"Storm Brand of Indecision\":\"Storm Brand\",\"Storm Burst of Repulsion\":\"Storm Burst\",\"Storm Call of Trarthus\":\"Storm Call\",\"Storm Rain of the Conduit\":\"Storm Rain\",\"Storm Rain of the Fence\":\"Storm Rain\",\"Stormbind of Teleportation\":\"Stormbind\",\"Summon Carrion Golem of Hordes\":\"Summon Carrion Golem\",\"Summon Carrion Golem of Scavenging\":\"Summon Carrion Golem\",\"Summon Chaos Golem of Hordes\":\"Summon Chaos Golem\",\"Summon Chaos Golem of the Maelström\":\"Summon Chaos Golem\",\"Summon Flame Golem of Hordes\":\"Summon Flame Golem\",\"Summon Flame Golem of the Meteor\":\"Summon Flame Golem\",\"Summon Holy Relic of Conviction\":\"Summon Holy Relic\",\"Summon Ice Golem of Hordes\":\"Summon Ice Golem\",\"Summon Ice Golem of Shattering\":\"Summon Ice Golem\",\"Summon Lightning Golem of Hordes\":\"Summon Lightning Golem\",\"Summon Raging Spirit of Enormity\":\"Summon Raging Spirit\",\"Summon Reaper of Eviscerating\":\"Summon Reaper\",\"Summon Reaper of Revenants\":\"Summon Reaper\",\"Summon Skeletons of Archers\":\"Summon Skeletons\",\"Summon Skeletons of Mages\":\"Summon Skeletons\",\"Summon Stone Golem of Hordes\":\"Summon Stone Golem\",\"Summon Stone Golem of Safeguarding\":\"Summon Stone Golem\",\"Sunder of Earthbreaking\":\"Sunder\",\"Sunder of Trarthus\":\"Sunder\",\"Tectonic Slam of Cataclysm\":\"Tectonic Slam\",\"Tornado of Elemental Turbulence\":\"Tornado\",\"Tornado Shot of Cloudburst\":\"Tornado Shot\",\"Toxic Rain of Sporeburst\":\"Toxic Rain\",\"Toxic Rain of Withering\":\"Toxic Rain\",\"Vaal Absolution (Absolution of Inspiring)\":\"Vaal Absolution\",\"Vaal Animate Weapon (Animate Weapon of Ranged Arms)\":\"Vaal Animate Weapon\",\"Vaal Animate Weapon (Animate Weapon of Self Reflection)\":\"Vaal Animate Weapon\",\"Vaal Arc (Arc of Oscillating)\":\"Vaal Arc\",\"Vaal Arc (Arc of Surging)\":\"Vaal Arc\",\"Vaal Blade Flurry (Blade Flurry of Incision)\":\"Vaal Blade Flurry\",\"Vaal Blade Vortex (Blade Vortex of the Scythe)\":\"Vaal Blade Vortex\",\"Vaal Blight (Blight of Atrophy)\":\"Vaal Blight\",\"Vaal Blight (Blight of Contagion)\":\"Vaal Blight\",\"Vaal Burning Arrow (Burning Arrow of Vigour)\":\"Vaal Burning Arrow\",\"Vaal Caustic Arrow (Caustic Arrow of Poison)\":\"Vaal Caustic Arrow\",\"Vaal Cleave (Cleave of Rage)\":\"Vaal Cleave\",\"Vaal Cold Snap (Cold Snap of Power)\":\"Vaal Cold Snap\",\"Vaal Cyclone (Cyclone of Tumult)\":\"Vaal Cyclone\",\"Vaal Detonate Dead (Detonate Dead of Chain Reaction)\":\"Vaal Detonate Dead\",\"Vaal Detonate Dead (Detonate Dead of Scavenging)\":\"Vaal Detonate Dead\",\"Vaal Domination (Dominating Blow of Inspiring)\":\"Vaal Domination\",\"Vaal Double Strike (Double Strike of Impaling)\":\"Vaal Double Strike\",\"Vaal Double Strike (Double Strike of Momentum)\":\"Vaal Double Strike\",\"Vaal Earthquake (Earthquake of Amplification)\":\"Vaal Earthquake\",\"Vaal Firestorm (Firestorm of Meteors)\":\"Vaal Firestorm\",\"Vaal Firestorm (Firestorm of Pelting)\":\"Vaal Firestorm\",\"Vaal Flameblast (Flameblast of Celerity)\":\"Vaal Flameblast\",\"Vaal Flameblast (Flameblast of Contraction)\":\"Vaal Flameblast\",\"Vaal Flicker Strike (Flicker Strike of Power)\":\"Vaal Flicker Strike\",\"Vaal Glacial Hammer (Glacial Hammer of Shattering)\":\"Vaal Glacial Hammer\",\"Vaal Ground Slam (Ground Slam of Earthshaking)\":\"Vaal Ground Slam\",\"Vaal Ice Nova (Ice Nova of Deep Freeze)\":\"Vaal Ice Nova\",\"Vaal Ice Nova (Ice Nova of Frostbolts)\":\"Vaal Ice Nova\",\"Vaal Ice Shot (Ice Shot of Penetration)\":\"Vaal Ice Shot\",\"Vaal Lightning Arrow (Lightning Arrow of Electrocution)\":\"Vaal Lightning Arrow\",\"Vaal Lightning Strike (Lightning Strike of Arcing)\":\"Vaal Lightning Strike\",\"Vaal Lightning Trap (Lightning Trap of Sparking)\":\"Vaal Lightning Trap\",\"Vaal Molten Strike (Molten Strike of the Zenith)\":\"Vaal Molten Strike\",\"Vaal Power Siphon (Power Siphon of the Archmage)\":\"Vaal Power Siphon\",\"Vaal Rain of Arrows (Rain of Arrows of Artillery)\":\"Vaal Rain of Arrows\",\"Vaal Rain of Arrows (Rain of Arrows of Saturation)\":\"Vaal Rain of Arrows\",\"Vaal Reap (Reap of Butchery)\":\"Vaal Reap\",\"Vaal Reave (Reave of Refraction)\":\"Vaal Reave\",\"Vaal Righteous Fire (Righteous Fire of Arcane Devotion)\":\"Vaal Righteous Fire\",\"Vaal Smite (Smite of Divine Judgement)\":\"Vaal Smite\",\"Vaal Spark (Spark of the Nova)\":\"Vaal Spark\",\"Vaal Spark (Spark of Unpredictability)\":\"Vaal Spark\",\"Vaal Spectral Throw (Spectral Throw of Materialising)\":\"Vaal Spectral Throw\",\"Vaal Spectral Throw (Spectral Throw of Trarthus)\":\"Vaal Spectral Throw\",\"Vaal Storm Call (Storm Call of Trarthus)\":\"Vaal Storm Call\",\"Vaal Summon Skeletons (Summon Skeletons of Archers)\":\"Vaal Summon Skeletons\",\"Vaal Summon Skeletons (Summon Skeletons of Mages)\":\"Vaal Summon Skeletons\",\"Vaal Volcanic Fissure (Volcanic Fissure of Snaking)\":\"Vaal Volcanic Fissure\",\"Viper Strike of the Mamba\":\"Viper Strike\",\"Void Sphere of Rending\":\"Void Sphere\",\"Volatile Dead of Confinement\":\"Volatile Dead\",\"Volatile Dead of Seething\":\"Volatile Dead\",\"Volcanic Fissure of Snaking\":\"Volcanic Fissure\",\"Vortex of Projection\":\"Vortex\",\"Wave of Conviction of Trarthus\":\"Wave of Conviction\",\"Wild Strike of Extremes\":\"Wild Strike\"}"),
	vaal: /* @__PURE__ */ "Vaal Absolution.Vaal Absolution (Absolution of Inspiring).Vaal Ancestral Warchief.Vaal Animate Weapon.Vaal Animate Weapon (Animate Weapon of Ranged Arms).Vaal Animate Weapon (Animate Weapon of Self Reflection).Vaal Arc.Vaal Arc (Arc of Oscillating).Vaal Arc (Arc of Surging).Vaal Arctic Armour.Vaal Blade Flurry.Vaal Blade Flurry (Blade Flurry of Incision).Vaal Blade Vortex.Vaal Blade Vortex (Blade Vortex of the Scythe).Vaal Blight.Vaal Blight (Blight of Atrophy).Vaal Blight (Blight of Contagion).Vaal Breach.Vaal Burning Arrow.Vaal Burning Arrow (Burning Arrow of Vigour).Vaal Caustic Arrow.Vaal Caustic Arrow (Caustic Arrow of Poison).Vaal Clarity.Vaal Cleave.Vaal Cleave (Cleave of Rage).Vaal Cold Snap.Vaal Cold Snap (Cold Snap of Power).Vaal Cyclone.Vaal Cyclone (Cyclone of Tumult).Vaal Detonate Dead.Vaal Detonate Dead (Detonate Dead of Chain Reaction).Vaal Detonate Dead (Detonate Dead of Scavenging).Vaal Discipline.Vaal Domination.Vaal Domination (Dominating Blow of Inspiring).Vaal Double Strike.Vaal Double Strike (Double Strike of Impaling).Vaal Double Strike (Double Strike of Momentum).Vaal Earthquake.Vaal Earthquake (Earthquake of Amplification).Vaal Fireball.Vaal Firestorm.Vaal Firestorm (Firestorm of Meteors).Vaal Firestorm (Firestorm of Pelting).Vaal FireTrap.Vaal Flameblast.Vaal Flameblast (Flameblast of Celerity).Vaal Flameblast (Flameblast of Contraction).Vaal Flesh Offering.Vaal Flicker Strike.Vaal Flicker Strike (Flicker Strike of Power).Vaal Glacial Hammer.Vaal Glacial Hammer (Glacial Hammer of Shattering).Vaal Grace.Vaal Ground Slam.Vaal Ground Slam (Ground Slam of Earthshaking).Vaal Haste.Vaal Heavy Strike.Vaal Ice Nova.Vaal Ice Nova (Ice Nova of Deep Freeze).Vaal Ice Nova (Ice Nova of Frostbolts).Vaal Ice Shot.Vaal Ice Shot (Ice Shot of Penetration).Vaal Immortal Call.Vaal Impurity of Fire.Vaal Impurity of Ice.Vaal Impurity of Lightning.Vaal Lightning Arrow.Vaal Lightning Arrow (Lightning Arrow of Electrocution).Vaal Lightning Strike.Vaal Lightning Strike (Lightning Strike of Arcing).Vaal Lightning Trap.Vaal Lightning Trap (Lightning Trap of Sparking).Vaal Lightning Warp.Vaal Molten Shell.Vaal Molten Strike.Vaal Molten Strike (Molten Strike of the Zenith).Vaal Power Siphon.Vaal Power Siphon (Power Siphon of the Archmage).Vaal Rain of Arrows.Vaal Rain of Arrows (Rain of Arrows of Artillery).Vaal Rain of Arrows (Rain of Arrows of Saturation).Vaal Reap.Vaal Reap (Reap of Butchery).Vaal Reave.Vaal Reave (Reave of Refraction).Vaal Rejuvenation Totem.Vaal Righteous Fire.Vaal Righteous Fire (Righteous Fire of Arcane Devotion).Vaal Smite.Vaal Smite (Smite of Divine Judgement).Vaal Soul Harvesting.Vaal Spark.Vaal Spark (Spark of the Nova).Vaal Spark (Spark of Unpredictability).Vaal Spectral Throw.Vaal Spectral Throw (Spectral Throw of Materialising).Vaal Spectral Throw (Spectral Throw of Trarthus).Vaal Split Arrow.Vaal Storm Call.Vaal Storm Call (Storm Call of Trarthus).Vaal Summon Skeletons.Vaal Summon Skeletons (Summon Skeletons of Archers).Vaal Summon Skeletons (Summon Skeletons of Mages).Vaal Sweep.Vaal Venom Gyre.Vaal Volcanic Fissure.Vaal Volcanic Fissure (Volcanic Fissure of Snaking)".split(".")
}, Em = Object.keys(Tm.transfigured);
new Set(Em), Tm.vaal;
// ../../packages/poe-market/src/ingest-status.ts
var Dm = z([
	"stash",
	"currency",
	"delivery"
]);
F({
	workerId: A().min(1).max(100),
	realm: z([
		"pc",
		"poe2",
		"xbox",
		"sony"
	]),
	league: A().min(1).max(100),
	state: z([
		"starting",
		"running",
		"idle",
		"error",
		"stopped"
	]),
	stage: Dm.nullable(),
	startedAt: M().int().nonnegative(),
	reportedAt: M().int().nonnegative(),
	progressAt: M().int().nonnegative(),
	completedAt: M().int().nonnegative().nullable(),
	lastSuccessAt: M().int().nonnegative().nullable(),
	failedStages: P(Dm).max(3),
	cycles: M().int().nonnegative(),
	pages: M().int().nonnegative(),
	equipmentObserved: M().int().nonnegative(),
	stashCaughtUp: N().nullable(),
	currencyNextHour: M().int().nonnegative().nullable(),
	deliveredHours: M().int().nonnegative(),
	deliveredRows: M().int().nonnegative()
}), z([
	"starting",
	"running",
	"idle",
	"error",
	"stopped",
	"stale",
	"stalled"
]);
var Om = {
	sources: ["packages/poe-1-data/data/mods.json"],
	multiLineMods: [
		[
			"#% increased Monster Attack Speed",
			"#% increased Monster Cast Speed",
			"#% increased Monster Movement Speed"
		],
		[
			"#% increased Monster Attack Speed",
			"#% increased Monster Cast Speed",
			"#% increased Monster Movement Speed",
			"Found Items have #% chance to drop Corrupted in Area"
		],
		["#% increased Monster Damage", "Found Items have #% chance to drop Corrupted in Area"],
		["#% increased number of Rare Monsters", "Rare Monsters each have # additional Modifier"],
		["#% increased number of Rare Monsters", "Rare Monsters each have # additional Modifiers"],
		["#% Monster Chaos Resistance", "#% Monster Elemental Resistances"],
		[
			"#% Monster Chaos Resistance",
			"#% Monster Elemental Resistances",
			"#% Monster Physical Damage Reduction"
		],
		[
			"#% Monster Chaos Resistance",
			"#% Monster Elemental Resistances",
			"Found Items have #% chance to drop Corrupted in Area"
		],
		["#% Monster Physical Damage Reduction", "Found Items have #% chance to drop Corrupted in Area"],
		["#% more Monster Life", "Found Items have #% chance to drop Corrupted in Area"],
		["#% more Monster Life", "Monsters cannot be Stunned"],
		[
			"#% to Monster Critical Strike Multiplier",
			"Found Items have #% chance to drop Corrupted in Area",
			"Monsters have #% increased Critical Strike Chance"
		],
		["#% to Monster Critical Strike Multiplier", "Monsters have #% increased Critical Strike Chance"],
		[
			"All Damage from Monsters' Hits can Poison",
			"Monsters Poison on Hit",
			"Monsters have #% increased Poison Duration"
		],
		["All Monster Damage can Ignite, Freeze and Shock", "Monsters Ignite, Freeze and Shock on Hit"],
		["Area has patches of desecrated ground", "Found Items have #% chance to drop Corrupted in Area"],
		["Area is inhabited by the Vaal", "Found Items have #% chance to drop Corrupted in Area"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters cannot be Leeched from"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters deal #% extra Physical Damage as Cold"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters deal #% extra Physical Damage as Fire"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters deal #% extra Physical Damage as Lightning"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters fire # additional Projectiles"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters gain #% of Maximum Life as Extra Maximum Energy Shield"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters gain #% of their Physical Damage as Extra Chaos Damage"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters have #% chance to Avoid Ailments"],
		[
			"Found Items have #% chance to drop Corrupted in Area",
			"Monsters have #% Chance to Block Attack Damage",
			"Monsters have #% Chance to Block Spell Damage"
		],
		[
			"Found Items have #% chance to drop Corrupted in Area",
			"Monsters have #% chance to Suppress Spell Damage",
			"Monsters prevent #% of Suppressed Spell Damage"
		],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters have #% increased Area of Effect"],
		["Found Items have #% chance to drop Corrupted in Area", "Monsters Overwhelm #% Physical Damage Reduction"],
		[
			"Found Items have #% chance to drop Corrupted in Area",
			"Monsters Reflect Hexes",
			"Monsters are Unaffected by Curses"
		],
		["Found Items have #% chance to drop Corrupted in Area", "Players are Cursed with Elemental Weakness"],
		["Found Items have #% chance to drop Corrupted in Area", "Players are Cursed with Enfeeble"],
		["Found Items have #% chance to drop Corrupted in Area", "Players are Cursed with Temporal Chains"],
		["Found Items have #% chance to drop Corrupted in Area", "Players are Cursed with Vulnerability"],
		[
			"Found Items have #% chance to drop Corrupted in Area",
			"Players cannot Block Attack Damage",
			"Players cannot Block Spell Damage"
		],
		["Found Items have #% chance to drop Corrupted in Area", "Players cannot gain Flask Charges"],
		["Found Items have #% chance to drop Corrupted in Area", "Players cannot Regenerate Life, Mana or Energy Shield"],
		["Found Items have #% chance to drop Corrupted in Area", "Players cannot Suppress Spell Damage"],
		["Found Items have #% chance to drop Corrupted in Area", "Players have #% less Recovery Rate of Life and Energy Shield"],
		["Found Items have #% chance to drop Corrupted in Area", "Players have #% reduced effect of Non-Curse Auras from Skills"],
		["Found Items have #% chance to drop Corrupted in Area", "Players have #% to all maximum Resistances"],
		["Found Items have #% chance to drop Corrupted in Area", "Rare Monsters have [ElementalThorns|Elemental Thorns] reflecting # Elemental Damage"],
		["Found Items have #% chance to drop Corrupted in Area", "Rare Monsters have [PhysicalThorns|Physical Thorns] reflecting # Physical Damage"],
		[
			"Found Items have #% chance to drop Corrupted in Area",
			"Unique Boss deals #% increased Damage",
			"Unique Boss has #% increased Attack and Cast Speed"
		],
		[
			"Impales are removed to Reflect their Physical Damage multiplied",
			"Monsters' Attacks Impale on Hit",
			"When a fifth Impale is inflicted on a Player,",
			"by their remaining Hits to that Player and their Allies within # metres"
		],
		[
			"Monsters cannot be Stunned",
			"Monsters' Action Speed cannot be modified to below Base Value",
			"Monsters' Movement Speed cannot be modified to below Base Value"
		],
		[
			"Monsters cannot be Taunted",
			"Monsters' Action Speed cannot be modified to below Base Value",
			"Monsters' Movement Speed cannot be modified to below Base Value"
		],
		["Monsters fire # additional Projectiles", "Monsters have #% increased Area of Effect"],
		["Monsters gain a Frenzy Charge on Hit", "Monsters have # to Maximum Frenzy Charges"],
		["Monsters gain a Power Charge on Hit", "Monsters have # to Maximum Power Charges"],
		["Monsters gain an Endurance Charge when hit", "Monsters have # to Maximum Endurance Charges"],
		["Monsters have #% increased Accuracy Rating", "Players have #% to amount of Suppressed Spell Damage Prevented"],
		["Monsters Inflict Withered for # seconds on Hit", "Monsters gain #% of their Physical Damage as Extra Chaos Damage"],
		["Monsters' Projectiles can Chain when colliding with Terrain", "Monsters' skills Chain # additional times"],
		["Player Skills which Throw Mines throw # fewer Mine", "Player Skills which Throw Traps throw # fewer Trap"],
		[
			"Players are Cursed with Elemental Weakness",
			"Players are Cursed with Temporal Chains",
			"Players are Cursed with Vulnerability"
		],
		["Players are Marked for Death for # seconds", "after killing a Rare or Unique monster"],
		["Players cannot Block", "Players cannot Suppress Spell Damage"],
		[
			"Players cannot gain Endurance Charges",
			"Players cannot gain Frenzy Charges",
			"Players cannot gain Power Charges"
		],
		["Players cannot Recharge Energy Shield", "Players cannot Regenerate Life, Mana or Energy Shield"],
		["Players have #% less Armour", "Players have #% reduced Chance to Block"],
		[
			"Players' Minions have #% less Attack Speed",
			"Players' Minions have #% less Cast Speed",
			"Players' Minions have #% less Movement Speed"
		],
		["Rare Monsters have [ElementalThorns|Elemental Thorns] reflecting # Elemental Damage", "Rare Monsters have [PhysicalThorns|Physical Thorns] reflecting # Physical Damage"],
		["Slaying Enemies close together can attract monsters from Beyond this realm", "Slaying Enemies has a #% increased chance to spawn a Beyond Portal"],
		["Unique Boss deals #% increased Damage", "Unique Boss has #% increased Attack and Cast Speed"],
		["Unique Boss has #% increased Area of Effect", "Unique Boss has #% increased Life"]
	]
}, km = /* @__PURE__ */ new Map();
for (let e of Om.multiLineMods) for (let t of new Set(e)) km.set(t, [...km.get(t) ?? [], e]);
var Am = [
	"delirium-mirror",
	"mirage",
	"wildwood",
	"apex-sentinel",
	"pandemonium-sentinel",
	"stalker-sentinel",
	"evocator-beidat",
	"evocator-ktash",
	"evocator-ghorr"
], jm = [
	"Mirror of Delirium",
	"Mirage",
	"Viridian Wildwood",
	"Apex Sentinel",
	"Pandemonium Sentinel",
	"Stalker Sentinel",
	"Evocator of Beidat",
	"Evocator of K'Tash",
	"Evocator of Ghorr"
];
[...Am], [...jm];
var Mm = [
	"shaper",
	"elder",
	"elder-guardian",
	"memory",
	"citadel"
], Nm = [
	"Shaper",
	"Elder",
	"Elder Guardian",
	"Memory",
	"Citadel"
];
[...Mm], [...Nm];
// ../../packages/poe-market/src/prices.ts
var Pm = I({
	count: M().int().positive(),
	sellers: M().int().positive(),
	min: M().positive(),
	median: M().positive(),
	max: M().positive(),
	confidence: M().min(0).max(1)
}), Fm = Pm.extend({
	listingCount: M().int().nonnegative(),
	unknownCount: M().int().nonnegative(),
	hourlyMedianMin: M().positive(),
	hourlyMedianMax: M().positive()
}), Im = Pm.extend({ windows: I({
	6: Fm.optional(),
	24: Fm.optional()
}).optional() });
I({
	realm: z([
		"pc",
		"xbox",
		"sony"
	]),
	league: A().min(1).max(100),
	hour: M().int().nonnegative().multipleOf(3600),
	revision: A().min(1).max(100),
	cohortId: A().min(1).max(128),
	listingCount: M().int().nonnegative(),
	uniqueSellers: M().int().nonnegative(),
	unknownCount: M().int().nonnegative(),
	prices: R(A().min(1).max(100), Im),
	confidenceMethod: B("asking-sellers-coverage-v1"),
	firstSeenAt: A().max(32).nullable(),
	lastSeenAt: A().max(32).nullable()
});
var Lm = I({
	realm: z([
		"pc",
		"xbox",
		"sony"
	]),
	league: A().min(1).max(100),
	cohortId: A().min(1).max(128),
	window: B("adaptive-v1").optional(),
	assumption: B("display-equivalent-v1").optional(),
	sourcePreparation: qc.optional(),
	conversion: B("exchange-v1").optional(),
	exchange: I({
		currency: Sm,
		quote: bm
	}).optional()
}).extend({ revision: A().min(1).max(100).optional() }).transform(({ revision: e, ...t }) => t), Rm = "cohort:v1:";
function zm(e) {
	if (!e?.startsWith(Rm)) return null;
	try {
		return Lm.parse(JSON.parse(decodeURIComponent(e.slice(10))));
	} catch {
		return null;
	}
}
// ../../packages/poe-market/src/stash-checkpoint.ts
var Bm = F({
	id: A().uuid(),
	realm: z([
		"pc",
		"xbox",
		"sony"
	]),
	league: A().min(1).max(100),
	cursor: A().min(1).max(255).nullable(),
	nextCursor: A().min(1).max(255),
	capturedAt: M().int().nonnegative(),
	responseHash: A().regex(/^[a-f0-9]{64}$/),
	stashCount: M().int().nonnegative(),
	itemCount: M().int().nonnegative(),
	responseBytes: M().int().nonnegative()
});
Bm.extend({ responseGzip: A().max(16e6).nullable() }), F({
	kind: z(["checkpoints", "sample"]),
	realm: Bm.shape.realm,
	league: Bm.shape.league,
	from: Mc().int().nonnegative(),
	to: Mc().int().nonnegative(),
	afterTime: Mc().int().nonnegative().optional(),
	afterId: Bm.shape.id.optional()
}).refine((e) => e.to > e.from && e.to - e.from <= 26784e5, { message: "Choose a range of at most 31 days." }).refine((e) => e.afterTime === void 0 == (e.afterId === void 0), { message: "Both pagination fields are required together." });
var Vm = {
	game: "poe1",
	build: "3.29.3.3",
	schemaSha256: "bc20b89453d307ae2782f4aac9bf3899a28fe448a82f02d60d96499b2b921d03",
	tables: {
		BestiaryCapturableMonsters: "a9a2b8286a1f18cf812eea3a40a31b187e748bfb869857f4d8f296fdf14b0514",
		MonsterVarieties: "f7ec9be9fe85c795f64a40549bb936930004ea0a40f3ef55d27716f292669684",
		BestiaryRecipeComponent: "1fce42d31749cd9d6b5bb5c27920bbeb70c7228a987391d3bbc3ee33ae33936d",
		BestiaryFamilies: "237e0a72cfef873e6ff1b5e0f8c0ba338c4190ee7cd49abc147a5f36d5771843",
		Rarity: "b142dc765a1ea8e51c780d623683b607627fd10b81ed44c62d7e1c3c904cd5aa"
	},
	classification: "Active generic AnyCreature/Rare species; named recipe, legendary, unique and disabled-only identities excluded. Unnamed columns 3/8 are cross-checked against named recipe identities; column 12 is corroborating evidence only.",
	names: /* @__PURE__ */ "Acid Slitherer.Adolescent Rhex.Alpine Devil.Alpine Shaman.Arakaali's Daughter.Arctic Wolf.Armour Cruncher.Avalanche Rider.Avian Retch.Barb Serpent.Barrow Ape.Bearded Devil.Bearded Shaman.Bearded Skycaller.Black Scorpion.Bleached Crawler.Blood Ape.Blood Chieftain.Bone Cruncher.Bone Rhoa.Bramble Cobra.Brine Vassal.Brooding Tarantula.Carnage Ape.Carnage Chieftain.Carrion Burrower.Carrion Queen.Carrion Swarmer.Cave Beast.Cave Skitterer.Cavern Drifter.Chimeric Croaker.Chrome-infused Chimeral.Chrome-infused Croaker.Chrome-infused Goliath.Chrome-touched Chimeral.Chrome-touched Croaker.Chrome-touched Goliath.Colossus Crusher.Corrupted Arach.Corrupted Beast.Corrupted Rhoa.Corrupted Spitter.Crustacean Sniper.Crypt Ambusher.Crypt Weaver.Cursed Spawn.Deep Crustacean.Devourer.Dirt Scrabbler.Dread Primate.Dune Hellion.Dust Scrabbler.Enraptured Arachnid.Enraptured Beast.Enraptured Crab.Enslaved Hellion.Escaped Rhex.Feral Chimeral.Feral Fowl.Fetid Maw.Fighting Bull.Filth Maw.Flame Hellion.Forest Beast.Freezing Wolf.Fury Hound.Glade Mamba.Gluttonous Gull.Goatman.Goatman Fire-raiser.Goatman Shaman.Goatman Stomper.Granite Eater.Gravel Eater.Grazing Taurus.Hairy Bonecruncher.Hatchling.Hill Devil.Host Adder.Host Chieftain.Host Cobra.Hybrid Arachnid.Infested Ape.Infested Crab.Infested Crawler.Infested Maw.Infested Rhoa.Infested Serpent.Infested Skitterer.Infested Tunnelfiend.Infested Ursa.Infested Vulture.Ink Spinner.Leaping Spider.Lowlands Hopper.Lurking Venom.Maternal Rhex.Merveil's Attendant.Merveil's Blessed.Merveil's Chosen.Merveil's Daughter.Merveil's Favoured.Merveil's Retainer.Mindless Scavenger.Mountain Hellion.Mountain Hellion Alpha.Mountain Lynx.Murk Runner.Mutant Arach.Night Adder.Noxious Tarantula.Obsidian Eater.Parasite.Pitbull Demon.Plagued Arachnid.Plated Parasite.Plumed Chimeral.Plummeting Ursa.Porcupine Goliath.Predatory Scorpion.Purge Hound.Ravenous Parasite.Rhoa Mare.Rock Spitter.Rooster Fiend.Rotting Vulture.Ruins Hellion.Sand Leaper.Sand Scorpion.Sand Serpent.Sand Skitterer.Savage Crab.Scalding Arachnid.Scavenging Vulture.Scum Crawler.Sewage Crawler.Sewer Drifter.Shackled Hellion.Shaggy Monstrosity.Singing Siren.Skeletal Beast.Slimy Nemesis.Snow Wolf.Soulless Watcher.Spindle Spider.Spine Serpent.Spitting Parasite.Stygian Ape.Stygian Silverback.Sulphuric Scorpion.Sulphurspawn.Swarthy Mollusc.Talon Archer.Tercel Rhoa.Thicket Hulk.Toxic Crawler.Tunnelfiend.Vaal Recluse.Vaulting Croaker.Venomous Spawn.Vicious Hound.Vicious Parasite.Virulent Spider.War Hound.Waste Lurcher.Webbed Spider.Wild Rhex.Woods Ursa".split("."),
	excludedNames: /* @__PURE__ */ "Aboriginal Chieftain.Aidan the Frenzied.Albino Rhoa.Alpha Paradisae.Amarissa, Daughter of Merveil.Ambrosia, Daughter of Merveil.Ancient Devourer.Azure Ape.Azure Shrieker.Azurite Widow.Balah, Duke.Bestial Maw.Black Death.Black Mórrigan.Bladeback Guardian.Bladetooth.Bleached Crustacean.Blinkflame.Blood Morpher.Blood Stasis .Blue Frog.Bone Scavenger.Boulderback.Brinecrack.Brood Princess.Buried Tarantula.Carrion Minion.Cave Crustacean.Cave Weta.Cavestalker.Charged Shrieker.Cintiq, the Inescapable.Common Frog.Craiceann, First of the Deep.Craicic Croaker.Craicic Maw.Craicic Sand Spitter.Craicic Savage Crab.Craicic Shield Crab.Craicic Spider Crab.Craicic Squid.Craicic Vassal.Craicic Watcher.Crazed Chieftain.Crazed Flamebeast.Crustacean Pelter.Deadly Tarantula.Death from Above.Deathflutter.Dire Wolf.Diseased Arachnid.Drifting Eye.Echo of the Verdant.Elder-Blessed Cobra.Elder-Blessed Goatman.Elder-Blessed Hellion.Elder-Blessed Retch.Elder-Blessed Rhoa.Eyepecker.Farric Ape.Farric Chieftain.Farric Flame Hellion Alpha.Farric Frost Hellion Alpha.Farric Gargantuan.Farric Goatman.Farric Goliath.Farric Lynx Alpha.Farric Magma Hound.Farric Pit Hound.Farric Taurus.Farric Tiger Alpha.Farric Ursa.Farric Wolf Alpha.Farrul, First of the Plains.Fated Siren.Fathom Screamer.Fenumal Devourer.Fenumal Hybrid Arachnid.Fenumal Plagued Arachnid.Fenumal Queen.Fenumal Scorpion.Fenumal Scrabbler.Fenumal Widow.Fenumus, First of the Night.Foreseen Spawn.Fossil Eater.Fused Crawler.Genesis Paradisae.Ghostram.Gorgol Alpha.Guardian of the Mound.Hollowskull, the Willing Host.Infected Adder.Infected Ambusher.Infected Beast.Infected Rhoa.Infected Spiker.Infected Watcher.Infested Crustacean.Infested Sniper.Inti of the Blood Moon.Invading Crustacean.Junglemare.Kamaq, Soilmaker.Konu, Maker of Wind.Lola, the Fierce.Maligaro's Inspiration.Maligaro's Muse.Marrowcrush.Maze Hatchling.Maze Needleback.Maze Slitherer.Maze Webspinner.Mother of the Hive.Mother of the Swarm.Mutated Adder.Mutated Arachnid.Mutated Broodqueen.Mutated Chieftain.Mutated Croaker.Mutated Flamebeast.Mutated Maw.Mutated Rhoa.Mutated Ursa.Mutated Watcher.Mutated Winterclaw.Mutewind Lynx.Mystic Devourer.Nadia the Soothing.Nightmarish Carrion.Nightmarish Crawler.Oozeback Bloom.Paradisae Venenum.Pewterfang.Poisonous Parasite.Primal Beast.Primal Crushclaw.Primal Cystcaller.Primal Rhex Matriarch.Primitive Ape.Primordial Rhoa.Putrid Chimeral.Putrid Serpent.Putrid Weaver.Q'uru.Quetzerxi.Rabid Broodqueen.Rabid Maw.Rabid Minion.Rabid Rhoa.Raihara, Tukohama's Loyal.Razorleaf.Rima, Deep Temptress.Risen Infested Beast.Rocco, the Bloodthirsty.Rooster Demon.Saqawal, First of the Sky.Saqawine Blood Viper.Saqawine Chimeral.Saqawine Cobra.Saqawine Retch.Saqawine Rhex.Saqawine Rhoa.Saqawine Vulture.Scrabbling Menace.Scrabbling Spitter.Sheaq, Maker of Floods.Shield Crab.Shivershell.Sickly Spinner.Simi, the Nature Touched.Siren's Spawn.Skitterling.Slimy Bloodsucker.Spider Crab.Spinesnap.Spirit of Aidan.Spirit of Nadia.Steelchaw.Strange Frog.Stranglecreep.Strangledrift.Tamipin.Tamulus.The All-seeing Eye.The Alpha Beast.The Basilisk.The Burning Menace.The Cadaver Bull.The Conqueror Wurm.The Duchess.The Dweller of the Deep.The Encephalophage.The Faun.The Great White Beast.The Great White Bones.The Hundred Foot Shadow.The Sunburst Queen.The Weaver.Thistlesage.Thornrunner.Tunnelworm.Twisted Chimeral.Tyrannursus Maximus.Ungulath.Unstable Larva.Unstable Weta.Ventarus.Vivid Abberarach.Vivid Vulture.Vivid Watcher.Wild Brambleback.Wild Bristle Matron.Wild Chimeral.Wild Hellion Alpha.Wrigglechaw.Zombie Rhoa".split(".")
}, Hm = Vm.names;
[...Vm.names, ...Vm.excludedNames], new Set(Hm);
// ../../packages/poe-trade-bridge/src/listing.ts
var Um = z(["instant", "in-person"]), Wm = I({
	id: A().min(1).max(128),
	indexed: jc({ offset: !0 }).nullable(),
	price: I({
		amount: M().positive().finite(),
		currency: A().min(1).max(64)
	}),
	sale: Um,
	item: R(A(), Bs())
});
F({
	id: A().min(1).max(128),
	listing: F({
		indexed: A().optional(),
		price: F({
			amount: M(),
			currency: A().min(1).max(64)
		}).nullish()
	}),
	item: R(A(), Bs())
});
// ../../packages/poe-trade-bridge/src/trade-api.ts
var Gm = z(["poe1", "poe2"]), Km = R(A(), Bs()), qm = A().regex(/^[\w-]{1,128}$/);
F({
	id: qm,
	result: P(qm).max(1e4),
	total: M().int().nonnegative()
}), F({ result: P(Bs()) });
// ../../packages/poe-trade-bridge/src/messages.ts
var Jm = "poe-boats", Ym = "poe-boats-extension", Q = A().min(1).max(100), Xm = I({
	stageId: Q,
	stageKey: Q,
	name: A().min(1).max(120),
	instant: Km,
	inPerson: Km.optional()
}), Zm = z([
	"done",
	"more",
	"in-person"
]), Qm = L("kind", [
	I({ kind: B("hello") }),
	I({
		kind: B("startRun"),
		runId: Q,
		graphId: Q,
		game: Gm,
		league: A().trim().min(1).max(100),
		stages: P(Xm).min(1).max(100)
	}),
	I({
		kind: B("decide"),
		runId: Q,
		batchId: Q,
		decision: Zm
	}),
	I({
		kind: B("cancelRun"),
		runId: Q
	}),
	I({
		kind: B("collect"),
		graphId: Q
	}),
	I({
		kind: B("acknowledge"),
		graphId: Q,
		batchIds: P(Q).max(1e3)
	})
]), $m = I({
	runId: Q,
	graphId: Q,
	batchId: Q,
	stageId: Q,
	stageKey: Q,
	fetches: M().int().positive(),
	sale: Um,
	total: M().int().nonnegative(),
	available: M().int().nonnegative(),
	listings: P(Wm).max(10),
	receivedAt: jc()
}), eh = z([
	"done",
	"cancelled",
	"stopped"
]), th = L("kind", [
	I({
		kind: B("ready"),
		version: A().min(1).max(40),
		bridge: M().int().positive()
	}),
	I({
		kind: B("progress"),
		runId: Q,
		stageId: Q,
		step: z([
			"waiting",
			"searching",
			"fetching"
		]),
		sale: Um,
		waitUntil: jc().optional()
	}),
	$m.extend({ kind: B("batch") }),
	I({
		kind: B("stageFailed"),
		runId: Q,
		stageId: Q,
		message: A().max(500)
	}),
	I({
		kind: B("runFinished"),
		runId: Q,
		graphId: Q,
		outcome: eh,
		reason: A().max(500).optional(),
		signIn: N().optional(),
		retryAt: jc().optional()
	}),
	I({
		kind: B("stored"),
		graphId: Q,
		batches: P($m).max(1e3)
	})
]);
I({
	source: B(Jm),
	bridge: M().int().positive(),
	message: Qm
}), I({
	source: B(Ym),
	bridge: M().int().positive(),
	message: th
});
// app/schemas/crafting-buy-in.ts
var nh = A().min(1).max(100), rh = M().int().nonnegative(), ih = z([
	"high",
	"medium",
	"low"
]), ah = I({
	results: rh,
	fetched: rh,
	matching: rh,
	nearPrice: rh,
	notMatching: rh,
	unreadable: rh,
	unconverted: rh,
	bait: rh
}), oh = I({
	key: A().min(1).max(100),
	observedAt: jc(),
	status: z(["priced", "no-listings"]),
	price: I({
		amount: M().positive(),
		currency: A().min(1).max(100)
	}).nullable(),
	sale: Um.nullable(),
	confidence: ih.nullable(),
	counts: ah,
	item: mf.nullable()
}), sh = I({
	includeInPerson: N().default(!1),
	stages: R(nh, oh).default({})
});
I({
	listing: Wm,
	status: z([
		"match",
		"no-match",
		"unreadable"
	]),
	amount: M().positive().nullable(),
	item: mf.nullable()
}), R(A().min(1).max(64), M().positive());
var ch = z([
	"fresh",
	"aging",
	"stale"
]), lh = M().nonnegative().nullable(), uh = {
	total: lh,
	probability: M().min(0).max(1).nullable(),
	meanActions: lh,
	missingPrices: P(A())
};
I({
	currency: A(),
	scratch: I(uh),
	stages: P(I({
		stageId: nh,
		name: A(),
		craftToHere: lh,
		status: z([
			"priced",
			"no-listings",
			"unpriced",
			"not-searchable"
		]),
		price: oh.shape.price,
		sale: oh.shape.sale,
		confidence: oh.shape.confidence,
		observedAt: jc().nullable(),
		freshness: ch.nullable(),
		...uh,
		error: A().optional()
	})),
	recommendation: I({
		stageId: nh.nullable(),
		total: M().nonnegative()
	}).nullable(),
	stalePrices: N()
});
// app/schemas/crafting-economy.ts
var dh = I({
	amount: M().nonnegative(),
	currency: A().min(1),
	source: z(["manual", "market"]),
	observedAt: jc().optional(),
	confidence: M().min(0).max(1).nullable(),
	samples: M().int().nonnegative().optional(),
	cohortId: A().min(1).optional()
}), fh = I({
	id: A().min(1),
	name: A().min(1),
	kind: z(["purchase", "craft"]),
	expectedCost: M().nonnegative().nullable(),
	currency: A().min(1),
	expectedActions: M().nonnegative().nullable(),
	estimated: N().optional(),
	guaranteed: N(),
	confidence: M().min(0).max(1).nullable(),
	missingPrices: P(A()).default([])
}), ph = L("mode", [I({ mode: B("automatic") }), I({
	mode: B("pinned"),
	alternativeId: A().min(1)
})]);
I({
	choice: ph,
	selectedId: A().nullable(),
	alternatives: P(fh),
	incomplete: N()
});
// app/schemas/crafting-rulesets.ts
var mh = A().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/), hh = A().regex(/^[a-f0-9]{64}$/), gh = z(["poe1", "poe2"]), _h = I({
	era: mh,
	revision: mh,
	engine: mh,
	patch: mh,
	manifestSha256: hh,
	craftingSha256: hh
}), vh = I({
	kinds: P(mh).min(1),
	disabled: P(I({
		kind: mh,
		id: A().min(1)
	})).default([]),
	allflame: N()
}), yh = I({
	sha256: hh,
	bytes: M().int().positive()
}), bh = _h.extend({
	format: B(1),
	game: gh,
	label: A().min(1).max(150),
	notes: A().max(5e3),
	publishedAt: jc(),
	catalog: yh,
	implementation: yh,
	availability: vh
});
I({
	format: B(1),
	revisions: P(bh),
	latest: P(I({
		game: gh,
		era: mh,
		revision: mh
	}))
});
// app/schemas/crafting-smart.ts
var xh = z([
	"memoryStrands",
	"quality",
	"catalystQuality",
	"sockets",
	"links"
]), Sh = L("kind", [I({ kind: B("once") }), I({
	kind: B("minimum"),
	field: xh,
	value: M().int().min(1).max(100)
})]);
F({
	effect: A(),
	target: F({
		field: xh,
		maximum: M().int().min(1).max(100),
		suggested: M().int().min(1).max(100)
	}).nullable(),
	available: N().nullable(),
	reason: A().nullable()
});
// app/schemas/crafting-graph.ts
var $ = A().min(1).max(100), Ch = A().trim().min(1).max(120), wh = F({
	x: M(),
	y: M()
}).optional(), Th = L("kind", [
	I({ kind: B("return") }),
	I({
		kind: B("recover"),
		nodeId: $,
		inputId: $
	}),
	I({ kind: B("discard") }),
	I({
		kind: B("sell"),
		price: dh.nullable()
	}),
	I({
		kind: B("terminal"),
		outcomeId: $
	})
]), Eh = I({
	id: $,
	name: Ch,
	query: Jc,
	destination: Th
}), Dh = I({
	id: $,
	name: Ch,
	source: $,
	query: Jc.optional()
}), Oh = I({
	kind: B("purchase"),
	id: $,
	name: Ch,
	item: mf,
	price: dh.nullable(),
	sourcePreparation: L("kind", [
		Wc.extend({ fossils: _f }),
		Gc,
		Kc
	]).optional()
}), kh = I({
	kind: B("production"),
	id: $,
	name: Ch,
	nodeId: $
}), Ah = L("kind", [I({
	kind: B("acquire"),
	id: $,
	name: Ch,
	position: wh,
	output: Jc,
	alternatives: P(L("kind", [Oh, kh])).min(1).max(20),
	choice: ph.default({ mode: "automatic" })
}), I({
	kind: B("craft"),
	id: $,
	name: Ch,
	position: wh,
	output: Jc,
	inputs: P(Dh).min(1).max(2),
	method: vf,
	smart: Sh.optional(),
	applyWhen: Jc.optional(),
	branches: P(Eh).max(24).default([]),
	ordering: z(["automatic", "manual"]).default("automatic"),
	fallback: Th.default({ kind: "return" })
})]), jh = I({
	id: $,
	name: Ch,
	query: Jc,
	success: N().default(!0),
	disposition: z([
		"keep",
		"sell",
		"discard"
	]).default("keep"),
	price: dh.nullable().default(null)
}), Mh = I({
	format: B(1),
	id: $,
	name: Ch,
	game: Jc.shape.game,
	ruleset: _h,
	currency: A().min(1).max(100).default("chaos"),
	league: A().min(1).max(100).optional(),
	nodes: P(Ah).min(1).max(100),
	entry: $,
	outcomes: P(jh).min(1).max(24),
	outcomeOrdering: z(["automatic", "manual"]).default("automatic"),
	prices: R(A(), dh).default({}),
	seed: M().int().min(0).max(4294967295).default(42),
	iterations: M().int().min(1).max(1e5).default(1e3),
	maxSteps: M().int().min(1).max(1e6).default(1e4),
	buyIn: sh.optional()
}), Nh = "crafting-graph-20";
function Ph(e, t) {
	return t.kind === "recombine" || t.kind === "socket_jewel" || t.kind === "currency" && e.crafting.currencies.find((e) => e.id === t.id)?.action === "transfer_item_influence" ? 2 : 1;
}
function Fh(e) {
	return e.kind === "craft" ? e.inputs.map((e) => e.source) : e.alternatives.flatMap((e) => e.kind === "production" ? [e.nodeId] : []);
}
function Ih(e) {
	let t = new Map(e.nodes.map((e) => [e.id, e])), n = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Set(), i = [];
	function a(e) {
		if (r.has(e)) throw Error("Production dependencies form a cycle. Model retries with a recovery branch to an input port.");
		if (n.has(e)) return;
		let o = t.get(e);
		if (!o) throw Error(`Unknown production node: ${e}`);
		r.add(e);
		for (let e of Fh(o)) a(e);
		r.delete(e), n.add(e), i.push(o);
	}
	for (let t of e.nodes) a(t.id);
	return i;
}
function Lh(e, t) {
	let n = Mh.parse(t);
	if (n.game !== e.game || n.ruleset.patch !== e.patch || n.ruleset.manifestSha256 !== e.manifestSha256 || n.ruleset.craftingSha256 !== e.craftingSha256) throw Error("This project requires its pinned catalog revision.");
	if (n.ruleset.engine !== "crafting-graph-20") throw Error("This project requires a different crafting engine revision.");
	let r = new $p(e), i = Gu(r), a = (e, t) => {
		if (new Set(e.map((e) => e.id)).size !== e.length) throw Error(`${t} must have unique IDs.`);
	};
	a(n.nodes, "Nodes"), a(n.outcomes, "Outcomes");
	let o = new Map(n.nodes.map((e) => [e.id, e])), s = new Set(n.outcomes.map((e) => e.id));
	if (!o.has(n.entry)) throw Error("Choose an existing entry node.");
	let c = (t) => {
		if (t.game !== n.game) throw Error("All item queries must use the project's game.");
		for (let n of t.groups) for (let t of n.filters) {
			if (t.kind === "mod" && t.ids) {
				for (let n of t.ids) if (!e.mods[n]) throw Error(`Unknown modifier in item query: ${n}`);
			}
			if (t.kind === "base" && t.field === "baseId") {
				for (let n of t.values) if (!e.bases[n]) throw Error(`Unknown base in item query: ${n}`);
			}
		}
	}, l = (e) => {
		if (e && e.currency !== n.currency) throw Error("All graph prices must use the project's comparison currency.");
	};
	for (let e of Object.values(n.prices)) l(e);
	for (let e of n.outcomes) c(e.query), l(e.price);
	for (let t of n.nodes) if (c(t.output), t.kind === "acquire") {
		if (a(t.alternatives, "Acquisition alternatives"), t.choice.mode === "pinned" && !t.alternatives.some((e) => e.id === (t.choice.mode === "pinned" ? t.choice.alternativeId : ""))) throw Error(`The pinned acquisition alternative no longer exists: ${t.name}`);
		for (let e of t.alternatives) if (e.kind === "purchase") {
			let a = n.prices[`purchase:${t.id}:${e.id}`] ?? e.price, o = a?.source === "market" ? zm(a.cohortId) : null;
			if (o && !pm(o.sourcePreparation, Xu(e))) throw Error("The saved purchase price uses a different source preparation; rebind it or enter a manual price.");
			if (Zu(n.ruleset.engine, e.sourcePreparation, e.item.baseId), rd(r, e), id(e, t.output), r.validateItem(e.item), e.item.destroyed) throw Error("A destroyed item cannot be purchased as a graph input.");
			if (l(e.price), i.matches(e.item, t.output) !== "match") throw Error(`Purchased item does not establish the output query: ${t.name}`);
		}
	} else {
		if (a(t.inputs, "Input ports"), a(t.branches, "Outcome branches"), t.inputs.length !== Ph(e, t.method)) throw Error(`${t.name} requires ${Ph(e, t.method)} item input(s).`);
		if ("donor" in t.method && t.method.donor || "jewel" in t.method && t.method.jewel) throw Error("Graph methods take their donor or Jewel from an input port, not an embedded inventory copy.");
		if (r.validateMethod(t.method), t.smart) {
			let e = im(r, t, t.smart);
			for (let n of [
				"output",
				"applyWhen",
				"branches",
				"ordering",
				"fallback"
			]) if (JSON.stringify(t[n]) !== JSON.stringify(e[n])) throw Error("Simple craft outcomes are generated from the selected goal. Configure the goal instead of editing its routes.");
		}
		t.applyWhen && c(t.applyWhen);
		for (let e of t.inputs) e.query && c(e.query);
		for (let e of t.branches) c(e.query);
		for (let e of [t.fallback, ...t.branches.map((e) => e.destination)]) {
			if (e.kind === "recover") {
				let t = o.get(e.nodeId);
				if (t?.kind !== "craft" || !t.inputs.some((t) => t.id === e.inputId)) throw Error(`Unknown recovery input: ${e.nodeId}/${e.inputId}`);
			}
			if (e.kind === "terminal" && !s.has(e.outcomeId)) throw Error(`Unknown terminal outcome: ${e.outcomeId}`);
			e.kind === "sell" && l(e.price);
		}
	}
	return Ih(n), n;
}
// app/lib/crafting-simulation.ts
function Rh(e, t) {
	if (!t) return [0, 1];
	let n = e / t, r = 1.959963984540054, i = 1 + r * r / t, a = (n + r * r / (2 * t)) / i, o = r * Math.sqrt((n * (1 - n) + r * r / (4 * t)) / t) / i;
	return [Math.max(0, a - o), Math.min(1, a + o)];
}
// app/lib/crafting-graph-simulation.ts
function zh() {
	return {
		trials: 0,
		returned: 0,
		successes: 0,
		actions: 0,
		cost: 0,
		costSquared: 0,
		revenue: 0,
		excludedRecovery: 0,
		truncated: 0,
		errors: {},
		outcomes: {},
		outcomeMatches: {},
		missingPrices: /* @__PURE__ */ new Set(),
		unpricedSales: /* @__PURE__ */ new Set(),
		visits: {},
		spending: {}
	};
}
function Bh(e, t) {
	for (let [n, r] of Object.entries(t)) e[n] = (e[n] ?? 0) + r;
}
function Vh(e, t) {
	e.trials++, e.returned += Number(t.status === "returned"), e.successes += Number(t.success), e.actions += t.actions, e.cost += t.knownCost, e.costSquared += t.knownCost ** 2, e.revenue += t.creditedRevenue, e.excludedRecovery += t.excludedRecovery, e.truncated += Number(t.status === "truncated"), t.error && t.status === "error" && Bh(e.errors, { [t.error]: 1 }), t.outcomeId && Bh(e.outcomes, { [t.outcomeId]: 1 });
	for (let n of t.missingPrices) e.missingPrices.add(n);
	for (let n of t.unpricedSales) e.unpricedSales.add(n);
	Bh(e.spending, t.spending);
	for (let [n, r] of Object.entries(t.visits)) {
		e.visits[n] ??= {
			visits: 0,
			matches: {},
			branches: {},
			recovered: 0
		};
		let t = e.visits[n];
		t.visits += r.visits, t.recovered += r.recovered, r.skipped && (t.skipped = (t.skipped ?? 0) + r.skipped), Bh(t.matches, r.matches), Bh(t.branches, r.branches), r.modelOdds && (t.modelOdds ??= {
			attempts: 0,
			branches: {},
			outcomes: {}
		}, t.modelOdds.attempts += r.modelOdds.attempts, Bh(t.modelOdds.branches, r.modelOdds.branches), Bh(t.modelOdds.outcomes, r.modelOdds.outcomes));
	}
}
function Hh(e) {
	return e.trials > 0 && e.truncated === 0 && Object.keys(e.errors).length === 0;
}
var Uh = class {
	options;
	graph;
	engine;
	queries;
	order;
	random;
	acquisitions = /* @__PURE__ */ new Map();
	estimates = /* @__PURE__ */ new Map();
	probabilities = /* @__PURE__ */ new Map();
	oddsCache = /* @__PURE__ */ new Map();
	nextNode = 0;
	stage = null;
	totals = zh();
	finalTotals = zh();
	trial = null;
	samples = [];
	work = 0;
	stopReason = "running";
	constructor(e, t, n = {}) {
		if (this.options = n, n.estimateIterations !== void 0 && (!Number.isSafeInteger(n.estimateIterations) || n.estimateIterations < 1 || n.estimateIterations > 1e4)) throw Error("Estimate iterations must be between 1 and 10,000.");
		if (n.workLimit !== void 0 && (!Number.isSafeInteger(n.workLimit) || n.workLimit < 1 || n.workLimit > 1e8)) throw Error("Work limit must be between 1 and 100,000,000.");
		this.graph = Lh(e, t), this.engine = new $p(e), this.queries = Gu(this.engine);
		let r = new Map(this.graph.nodes.map((e) => [e.id, e])), i = /* @__PURE__ */ new Set(), a = (e) => {
			if (i.has(e)) return;
			i.add(e);
			let t = r.get(e);
			if (t.kind === "craft") for (let e of t.inputs) a(e.source);
			else for (let e of t.alternatives) e.kind === "production" && (t.choice.mode === "automatic" || t.choice.alternativeId === e.id) && a(e.nodeId);
		};
		a(this.graph.entry), this.order = Ih(this.graph).filter((e) => i.has(e.id)), this.random = Yp(this.graph.seed);
	}
	get done() {
		return this.stopReason !== "running";
	}
	selectAcquisition(e) {
		let t = e.alternatives.map((t) => {
			if (t.kind === "purchase") return {
				id: t.id,
				name: t.name,
				kind: "purchase",
				currency: this.graph.currency,
				guaranteed: !0,
				...ad(this.engine, this.graph, e, t)
			};
			let n = this.estimates.get(t.nodeId);
			return {
				id: t.id,
				name: t.name,
				kind: "craft",
				currency: this.graph.currency,
				expectedCost: n?.expectedCost ?? null,
				expectedActions: n?.expectedActions ?? null,
				estimated: n !== void 0,
				guaranteed: !1,
				confidence: null,
				missingPrices: n?.missingPrices ?? []
			};
		}), n = vl(t, e.choice);
		this.acquisitions.set(e.id, n);
		let r = t.find((e) => e.id === n.selectedId), i = e.alternatives.find((e) => e.id === n.selectedId), a = i?.kind === "production" ? this.estimates.get(i.nodeId) : void 0, o = r?.missingPrices ?? [...new Set(t.flatMap((e) => e.missingPrices))];
		!r && !o.length && o.push(`acquisition:${e.id}`), this.estimates.set(e.id, {
			nodeId: e.id,
			trials: a?.trials ?? 0,
			returned: a?.returned ?? +!!r,
			returnProbability: a?.returnProbability ?? +!!r,
			returnInterval: a?.returnInterval ?? (r ? [1, 1] : [0, 1]),
			expectedCost: r?.expectedCost ?? null,
			expectedActions: r?.expectedActions ?? null,
			missingPrices: o,
			complete: a?.complete ?? r !== void 0,
			errors: a?.errors ?? {}
		});
	}
	potentialMissingPrices(e) {
		return e.kind === "acquire" ? this.estimates.get(e.id)?.missingPrices ?? [] : [...sd(this.engine, [e.method]).filter((t) => !qu(this.graph.prices, e.id, t.id)).map((e) => e.id), ...e.inputs.flatMap((e) => this.estimates.get(e.source)?.missingPrices ?? [])];
	}
	nextStage() {
		if (this.stage?.phase === "pilot") {
			let { node: e } = this.stage, t = this.totals.visits[e.id];
			e.kind === "craft" && t?.visits && this.probabilities.set(e.id, new Map(e.branches.map((e) => [e.id, (t.matches[e.id] ?? 0) / t.visits]))), this.stage = {
				node: e,
				phase: "estimate",
				trials: this.stage.trials
			}, this.totals = zh();
		} else if (this.stage?.phase === "outcome-pilot") this.probabilities.set("$outcomes", new Map(this.graph.outcomes.map((e) => [e.id, (this.totals.outcomeMatches[e.id] ?? 0) / Math.max(1, this.totals.trials)]))), this.stage = {
			node: this.stage.node,
			phase: "final",
			trials: this.graph.iterations
		}, this.totals = zh();
		else {
			if (this.stage?.phase === "estimate") {
				let e = this.totals;
				for (let t of this.potentialMissingPrices(this.stage.node)) e.missingPrices.add(t);
				let t = Hh(e);
				this.estimates.set(this.stage.node.id, {
					nodeId: this.stage.node.id,
					trials: e.trials,
					returned: e.returned,
					returnProbability: e.returned / Math.max(1, e.trials),
					returnInterval: Rh(e.returned, e.trials),
					expectedCost: t && !e.missingPrices.size && e.returned ? e.cost / e.returned : null,
					expectedActions: t && e.returned ? e.actions / e.returned : null,
					missingPrices: [...e.missingPrices],
					complete: t,
					errors: e.errors
				});
			}
			if (this.stage?.phase === "final") {
				for (let e of this.potentialMissingPrices(this.stage.node)) this.totals.missingPrices.add(e);
				this.finalTotals = this.totals, this.stopReason = "complete";
			} else {
				for (; this.nextNode < this.order.length;) {
					let e = this.order[this.nextNode++];
					if (e.kind === "acquire") this.selectAcquisition(e);
					else {
						this.stage = {
							node: e,
							phase: "pilot",
							trials: this.options.estimateIterations ?? Math.min(this.graph.iterations, 100)
						}, this.totals = zh();
						return;
					}
				}
				this.stage = {
					node: this.order.find((e) => e.id === this.graph.entry),
					phase: "outcome-pilot",
					trials: this.options.estimateIterations ?? Math.min(this.graph.iterations, 100)
				}, this.totals = zh();
			}
		}
	}
	advance() {
		if (this.done) return;
		if (this.work >= (this.options.workLimit ?? 2e6)) {
			this.stopReason = "work-limit", this.stage?.phase === "final" && (this.finalTotals = this.totals);
			return;
		}
		if (!this.stage) {
			this.nextStage();
			return;
		}
		let e = this.stage.trials;
		if (this.totals.trials >= e) this.nextStage();
		else if (this.trial ||= new cm(this.engine, this.graph, this.random, {
			entry: this.stage.node.id,
			classify: this.stage.phase === "final",
			trace: this.stage.phase === "final" && this.samples.length < 3,
			acquisitions: this.acquisitions,
			probabilities: this.probabilities,
			modelOdds: this.stage.phase === "final",
			oddsCache: this.oddsCache
		}, this.queries), this.trial.advance(), this.work++, this.trial.done) {
			let e = this.trial.result();
			if (Vh(this.totals, e), e.item && this.stage.node.id === this.graph.entry) {
				let t = this.queries.record(e.item);
				for (let e of this.graph.outcomes) hl(t, e.query) === "match" && Bh(this.totals.outcomeMatches, { [e.id]: 1 });
			}
			this.stage.phase === "final" && this.samples.length < 3 && this.samples.push(e), this.trial = null;
		}
	}
	runBatch(e = 250) {
		for (let t = 0; t < e && !this.done; t++) this.advance();
		return this.done;
	}
	result() {
		let e = this.stage?.phase === "final" ? this.totals : this.finalTotals, t = this.stopReason === "complete" && Hh(e), n = t && !e.missingPrices.size ? e.cost / e.trials : null, r = t && !e.unpricedSales.size ? e.revenue / e.trials : null, i = e.trials > 1 ? Math.max(0, (e.costSquared - e.cost ** 2 / e.trials) / (e.trials - 1)) : 0, a = e.trials > 1 ? 1.96 * Math.sqrt(i / e.trials) : null;
		return {
			kind: "sampled-graph",
			complete: t,
			stopReason: this.stopReason,
			phase: this.stage?.phase ?? "preparing",
			nodeId: this.stage?.node.id ?? null,
			work: this.work,
			trials: e.trials,
			requestedTrials: this.graph.iterations,
			meanCost: n,
			costInterval: n !== null && a !== null ? [Math.max(0, n - a), n + a] : null,
			meanRevenue: r,
			meanProfit: n !== null && r !== null ? r - n : null,
			meanActions: t ? e.actions / e.trials : null,
			observedCost: e.trials ? e.cost / e.trials : null,
			probability: t ? e.successes / e.trials : null,
			interval: e.trials ? Rh(e.successes, e.trials) : [0, 1],
			outcomes: this.graph.outcomes.map((n) => ({
				id: n.id,
				count: e.outcomes[n.id] ?? 0,
				probability: t ? (e.outcomes[n.id] ?? 0) / e.trials : null,
				interval: e.trials ? Rh(e.outcomes[n.id] ?? 0, e.trials) : [0, 1]
			})),
			missingPrices: [...e.missingPrices],
			unpricedSales: [...e.unpricedSales],
			excludedRecovery: e.excludedRecovery,
			truncated: e.truncated,
			errors: e.errors,
			acquisitions: Object.fromEntries(this.acquisitions),
			estimates: [...this.estimates.values()],
			visits: e.visits,
			spending: e.spending,
			samples: this.samples,
			unfinished: this.trial?.result() ?? null
		};
	}
}, Wh = Nh;
function Gh(e, t, n) {
	return new Uh(tf.parse(e), t, n);
}
export { Gh as createSimulation, Wh as revision };
