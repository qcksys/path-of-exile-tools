//#region ../../node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/core/core.js
var e = Object.freeze({ status: "aborted" });
function t(e, t, n) {
	function r(n, r) {
		if (n._zod || Object.defineProperty(n, "_zod", {
			value: {
				def: r,
				constr: o,
				traits: /* @__PURE__ */ new Set()
			},
			enumerable: !1
		}), n._zod.traits.has(e)) return;
		n._zod.traits.add(e), t(n, r);
		let i = o.prototype, a = Object.keys(i);
		for (let e = 0; e < a.length; e++) {
			let t = a[e];
			t in n || (n[t] = i[t].bind(n));
		}
	}
	let i = n?.Parent ?? Object;
	class a extends i {}
	Object.defineProperty(a, "name", { value: e });
	function o(e) {
		var t;
		let i = n?.Parent ? new a() : this;
		r(i, e), (t = i._zod).deferred ?? (t.deferred = []);
		for (let e of i._zod.deferred) e();
		return i;
	}
	return Object.defineProperty(o, "init", { value: r }), Object.defineProperty(o, Symbol.hasInstance, { value: (t) => n?.Parent && t instanceof n.Parent ? !0 : t?._zod?.traits?.has(e) }), Object.defineProperty(o, "name", { value: e }), o;
}
var n = class extends Error {
	constructor() {
		super("Encountered Promise during synchronous parse. Use .parseAsync() instead.");
	}
}, r = class extends Error {
	constructor(e) {
		super(`Encountered unidirectional transform during encode: ${e}`), this.name = "ZodEncodeError";
	}
}, i = {};
function a(e) {
	return e && Object.assign(i, e), i;
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/core/util.js
function o(e) {
	let t = Object.values(e).filter((e) => typeof e == "number");
	return Object.entries(e).filter(([e, n]) => t.indexOf(+e) === -1).map(([e, t]) => t);
}
function s(e, t) {
	return typeof t == "bigint" ? t.toString() : t;
}
function c(e) {
	return { get value() {
		{
			let t = e();
			return Object.defineProperty(this, "value", { value: t }), t;
		}
	} };
}
function l(e) {
	return e == null;
}
function u(e) {
	let t = +!!e.startsWith("^"), n = e.endsWith("$") ? e.length - 1 : e.length;
	return e.slice(t, n);
}
function d(e, t) {
	let n = (e.toString().split(".")[1] || "").length, r = t.toString(), i = (r.split(".")[1] || "").length;
	if (i === 0 && /\d?e-\d?/.test(r)) {
		let e = r.match(/\d?e-(\d?)/);
		e?.[1] && (i = Number.parseInt(e[1]));
	}
	let a = n > i ? n : i;
	return Number.parseInt(e.toFixed(a).replace(".", "")) % Number.parseInt(t.toFixed(a).replace(".", "")) / 10 ** a;
}
var f = Symbol("evaluating");
function p(e, t, n) {
	let r;
	Object.defineProperty(e, t, {
		get() {
			if (r !== f) return r === void 0 && (r = f, r = n()), r;
		},
		set(n) {
			Object.defineProperty(e, t, { value: n });
		},
		configurable: !0
	});
}
function m(e, t, n) {
	Object.defineProperty(e, t, {
		value: n,
		writable: !0,
		enumerable: !0,
		configurable: !0
	});
}
function h(...e) {
	let t = {};
	for (let n of e) {
		let e = Object.getOwnPropertyDescriptors(n);
		Object.assign(t, e);
	}
	return Object.defineProperties({}, t);
}
function g(e) {
	return JSON.stringify(e);
}
function _(e) {
	return e.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var ee = "captureStackTrace" in Error ? Error.captureStackTrace : (...e) => {};
function v(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
var te = c(() => {
	if (typeof navigator < "u" && navigator?.userAgent?.includes("Cloudflare")) return !1;
	try {
		return Function(""), !0;
	} catch {
		return !1;
	}
});
function ne(e) {
	if (v(e) === !1) return !1;
	let t = e.constructor;
	if (t === void 0 || typeof t != "function") return !0;
	let n = t.prototype;
	return v(n) !== !1 && Object.prototype.hasOwnProperty.call(n, "isPrototypeOf") !== !1;
}
function re(e) {
	return ne(e) ? { ...e } : Array.isArray(e) ? [...e] : e;
}
var ie = /* @__PURE__ */ new Set([
	"string",
	"number",
	"symbol"
]);
function ae(e) {
	return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function y(e, t, n) {
	let r = new e._zod.constr(t ?? e._zod.def);
	return (!t || n?.parent) && (r._zod.parent = e), r;
}
function b(e) {
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
function oe(e) {
	return Object.keys(e).filter((t) => e[t]._zod.optin === "optional" && e[t]._zod.optout === "optional");
}
var se = {
	safeint: [-(2 ** 53 - 1), 2 ** 53 - 1],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function ce(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".pick() cannot be used on object schemas containing refinements");
	return y(e, h(e._zod.def, {
		get shape() {
			let e = {};
			for (let r in t) {
				if (!(r in n.shape)) throw Error(`Unrecognized key: "${r}"`);
				t[r] && (e[r] = n.shape[r]);
			}
			return m(this, "shape", e), e;
		},
		checks: []
	}));
}
function le(e, t) {
	let n = e._zod.def, r = n.checks;
	if (r && r.length > 0) throw Error(".omit() cannot be used on object schemas containing refinements");
	return y(e, h(e._zod.def, {
		get shape() {
			let r = { ...e._zod.def.shape };
			for (let e in t) {
				if (!(e in n.shape)) throw Error(`Unrecognized key: "${e}"`);
				t[e] && delete r[e];
			}
			return m(this, "shape", r), r;
		},
		checks: []
	}));
}
function ue(e, t) {
	if (!ne(t)) throw Error("Invalid input to extend: expected a plain object");
	let n = e._zod.def.checks;
	if (n && n.length > 0) {
		let n = e._zod.def.shape;
		for (let e in t) if (Object.getOwnPropertyDescriptor(n, e) !== void 0) throw Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return y(e, h(e._zod.def, { get shape() {
		let n = {
			...e._zod.def.shape,
			...t
		};
		return m(this, "shape", n), n;
	} }));
}
function de(e, t) {
	if (!ne(t)) throw Error("Invalid input to safeExtend: expected a plain object");
	return y(e, h(e._zod.def, { get shape() {
		let n = {
			...e._zod.def.shape,
			...t
		};
		return m(this, "shape", n), n;
	} }));
}
function fe(e, t) {
	return y(e, h(e._zod.def, {
		get shape() {
			let n = {
				...e._zod.def.shape,
				...t._zod.def.shape
			};
			return m(this, "shape", n), n;
		},
		get catchall() {
			return t._zod.def.catchall;
		},
		checks: []
	}));
}
function pe(e, t, n) {
	let r = t._zod.def.checks;
	if (r && r.length > 0) throw Error(".partial() cannot be used on object schemas containing refinements");
	return y(t, h(t._zod.def, {
		get shape() {
			let r = t._zod.def.shape, i = { ...r };
			if (n) for (let t in n) {
				if (!(t in r)) throw Error(`Unrecognized key: "${t}"`);
				n[t] && (i[t] = e ? new e({
					type: "optional",
					innerType: r[t]
				}) : r[t]);
			}
			else for (let t in r) i[t] = e ? new e({
				type: "optional",
				innerType: r[t]
			}) : r[t];
			return m(this, "shape", i), i;
		},
		checks: []
	}));
}
function me(e, t, n) {
	return y(t, h(t._zod.def, { get shape() {
		let r = t._zod.def.shape, i = { ...r };
		if (n) for (let t in n) {
			if (!(t in i)) throw Error(`Unrecognized key: "${t}"`);
			n[t] && (i[t] = new e({
				type: "nonoptional",
				innerType: r[t]
			}));
		}
		else for (let t in r) i[t] = new e({
			type: "nonoptional",
			innerType: r[t]
		});
		return m(this, "shape", i), i;
	} }));
}
function he(e, t = 0) {
	if (e.aborted === !0) return !0;
	for (let n = t; n < e.issues.length; n++) if (e.issues[n]?.continue !== !0) return !0;
	return !1;
}
function ge(e, t) {
	return t.map((t) => {
		var n;
		return (n = t).path ?? (n.path = []), t.path.unshift(e), t;
	});
}
function _e(e) {
	return typeof e == "string" ? e : e?.message;
}
function ve(e, t, n) {
	let r = {
		...e,
		path: e.path ?? []
	};
	return e.message || (r.message = _e(e.inst?._zod.def?.error?.(e)) ?? _e(t?.error?.(e)) ?? _e(n.customError?.(e)) ?? _e(n.localeError?.(e)) ?? "Invalid input"), delete r.inst, delete r.continue, t?.reportInput || delete r.input, r;
}
function ye(e) {
	return Array.isArray(e) ? "array" : typeof e == "string" ? "string" : "unknown";
}
function be(...e) {
	let [t, n, r] = e;
	return typeof t == "string" ? {
		message: t,
		code: "custom",
		input: n,
		inst: r
	} : { ...t };
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/core/errors.js
var xe = (e, t) => {
	e.name = "$ZodError", Object.defineProperty(e, "_zod", {
		value: e._zod,
		enumerable: !1
	}), Object.defineProperty(e, "issues", {
		value: t,
		enumerable: !1
	}), e.message = JSON.stringify(t, s, 2), Object.defineProperty(e, "toString", {
		value: () => e.message,
		enumerable: !1
	});
}, Se = t("$ZodError", xe), Ce = t("$ZodError", xe, { Parent: Error });
function we(e, t = (e) => e.message) {
	let n = {}, r = [];
	for (let i of e.issues) i.path.length > 0 ? (n[i.path[0]] = n[i.path[0]] || [], n[i.path[0]].push(t(i))) : r.push(t(i));
	return {
		formErrors: r,
		fieldErrors: n
	};
}
function Te(e, t = (e) => e.message) {
	let n = { _errors: [] }, r = (e) => {
		for (let i of e.issues) if (i.code === "invalid_union" && i.errors.length) i.errors.map((e) => r({ issues: e }));
		else if (i.code === "invalid_key") r({ issues: i.issues });
		else if (i.code === "invalid_element") r({ issues: i.issues });
		else if (i.path.length === 0) n._errors.push(t(i));
		else {
			let e = n, r = 0;
			for (; r < i.path.length;) {
				let n = i.path[r];
				r === i.path.length - 1 ? (e[n] = e[n] || { _errors: [] }, e[n]._errors.push(t(i))) : e[n] = e[n] || { _errors: [] }, e = e[n], r++;
			}
		}
	};
	return r(e), n;
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/core/parse.js
var Ee = (e) => (t, r, i, o) => {
	let s = i ? Object.assign(i, { async: !1 }) : { async: !1 }, c = t._zod.run({
		value: r,
		issues: []
	}, s);
	if (c instanceof Promise) throw new n();
	if (c.issues.length) {
		let t = new ((o?.Err) ?? e)(c.issues.map((e) => ve(e, s, a())));
		throw ee(t, o?.callee), t;
	}
	return c.value;
}, De = (e) => async (t, n, r, i) => {
	let o = r ? Object.assign(r, { async: !0 }) : { async: !0 }, s = t._zod.run({
		value: n,
		issues: []
	}, o);
	if (s instanceof Promise && (s = await s), s.issues.length) {
		let t = new ((i?.Err) ?? e)(s.issues.map((e) => ve(e, o, a())));
		throw ee(t, i?.callee), t;
	}
	return s.value;
}, Oe = (e) => (t, r, i) => {
	let o = i ? {
		...i,
		async: !1
	} : { async: !1 }, s = t._zod.run({
		value: r,
		issues: []
	}, o);
	if (s instanceof Promise) throw new n();
	return s.issues.length ? {
		success: !1,
		error: new (e ?? Se)(s.issues.map((e) => ve(e, o, a())))
	} : {
		success: !0,
		data: s.value
	};
}, ke = /* @__PURE__*/ Oe(Ce), Ae = (e) => async (t, n, r) => {
	let i = r ? Object.assign(r, { async: !0 }) : { async: !0 }, o = t._zod.run({
		value: n,
		issues: []
	}, i);
	return o instanceof Promise && (o = await o), o.issues.length ? {
		success: !1,
		error: new e(o.issues.map((e) => ve(e, i, a())))
	} : {
		success: !0,
		data: o.value
	};
}, je = /* @__PURE__*/ Ae(Ce), Me = (e) => (t, n, r) => {
	let i = r ? Object.assign(r, { direction: "backward" }) : { direction: "backward" };
	return Ee(e)(t, n, i);
}, Ne = (e) => (t, n, r) => Ee(e)(t, n, r), Pe = (e) => async (t, n, r) => {
	let i = r ? Object.assign(r, { direction: "backward" }) : { direction: "backward" };
	return De(e)(t, n, i);
}, Fe = (e) => async (t, n, r) => De(e)(t, n, r), Ie = (e) => (t, n, r) => {
	let i = r ? Object.assign(r, { direction: "backward" }) : { direction: "backward" };
	return Oe(e)(t, n, i);
}, Le = (e) => (t, n, r) => Oe(e)(t, n, r), Re = (e) => async (t, n, r) => {
	let i = r ? Object.assign(r, { direction: "backward" }) : { direction: "backward" };
	return Ae(e)(t, n, i);
}, ze = (e) => async (t, n, r) => Ae(e)(t, n, r), Be = /^[cC][^\s-]{8,}$/, Ve = /^[0-9a-z]+$/, He = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/, Ue = /^[0-9a-vA-V]{20}$/, We = /^[A-Za-z0-9]{27}$/, Ge = /^[a-zA-Z0-9_-]{21}$/, Ke = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/, qe = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/, Je = (e) => e ? RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`) : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/, Ye = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/, Xe = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
function Ze() {
	return new RegExp(Xe, "u");
}
var Qe = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, $e = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/, et = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/, tt = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, nt = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/, rt = /^[A-Za-z0-9_-]*$/, it = /^\+[1-9]\d{6,14}$/, at = "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))", ot = /*@__PURE__*/ RegExp(`^${at}$`);
function st(e) {
	let t = "(?:[01]\\d|2[0-3]):[0-5]\\d";
	return typeof e.precision == "number" ? e.precision === -1 ? `${t}` : e.precision === 0 ? `${t}:[0-5]\\d` : `${t}:[0-5]\\d\\.\\d{${e.precision}}` : `${t}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function ct(e) {
	return RegExp(`^${st(e)}$`);
}
function lt(e) {
	let t = st({ precision: e.precision }), n = ["Z"];
	e.local && n.push(""), e.offset && n.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)");
	let r = `${t}(?:${n.join("|")})`;
	return RegExp(`^${at}T(?:${r})$`);
}
var ut = (e) => {
	let t = e ? `[\\s\\S]{${e?.minimum ?? 0},${e?.maximum ?? ""}}` : "[\\s\\S]*";
	return RegExp(`^${t}$`);
}, dt = /^-?\d+$/, ft = /^-?\d+(?:\.\d+)?$/, pt = /^(?:true|false)$/i, mt = /^null$/i, ht = /^[^A-Z]*$/, gt = /^[^a-z]*$/, x = /*@__PURE__*/ t("$ZodCheck", (e, t) => {
	var n;
	e._zod ??= {}, e._zod.def = t, (n = e._zod).onattach ?? (n.onattach = []);
}), _t = {
	number: "number",
	bigint: "bigint",
	object: "date"
}, vt = /*@__PURE__*/ t("$ZodCheckLessThan", (e, t) => {
	x.init(e, t);
	let n = _t[typeof t.value];
	e._zod.onattach.push((e) => {
		let n = e._zod.bag, r = (t.inclusive ? n.maximum : n.exclusiveMaximum) ?? Infinity;
		t.value < r && (t.inclusive ? n.maximum = t.value : n.exclusiveMaximum = t.value);
	}), e._zod.check = (r) => {
		(t.inclusive ? r.value <= t.value : r.value < t.value) || r.issues.push({
			origin: n,
			code: "too_big",
			maximum: typeof t.value == "object" ? t.value.getTime() : t.value,
			input: r.value,
			inclusive: t.inclusive,
			inst: e,
			continue: !t.abort
		});
	};
}), yt = /*@__PURE__*/ t("$ZodCheckGreaterThan", (e, t) => {
	x.init(e, t);
	let n = _t[typeof t.value];
	e._zod.onattach.push((e) => {
		let n = e._zod.bag, r = (t.inclusive ? n.minimum : n.exclusiveMinimum) ?? -Infinity;
		t.value > r && (t.inclusive ? n.minimum = t.value : n.exclusiveMinimum = t.value);
	}), e._zod.check = (r) => {
		(t.inclusive ? r.value >= t.value : r.value > t.value) || r.issues.push({
			origin: n,
			code: "too_small",
			minimum: typeof t.value == "object" ? t.value.getTime() : t.value,
			input: r.value,
			inclusive: t.inclusive,
			inst: e,
			continue: !t.abort
		});
	};
}), bt = /*@__PURE__*/ t("$ZodCheckMultipleOf", (e, t) => {
	x.init(e, t), e._zod.onattach.push((e) => {
		var n;
		(n = e._zod.bag).multipleOf ?? (n.multipleOf = t.value);
	}), e._zod.check = (n) => {
		if (typeof n.value != typeof t.value) throw Error("Cannot mix number and bigint in multiple_of check.");
		(typeof n.value == "bigint" ? n.value % t.value === BigInt(0) : d(n.value, t.value) === 0) || n.issues.push({
			origin: typeof n.value,
			code: "not_multiple_of",
			divisor: t.value,
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), xt = /*@__PURE__*/ t("$ZodCheckNumberFormat", (e, t) => {
	x.init(e, t), t.format = t.format || "float64";
	let n = t.format?.includes("int"), r = n ? "int" : "number", [i, a] = se[t.format];
	e._zod.onattach.push((e) => {
		let r = e._zod.bag;
		r.format = t.format, r.minimum = i, r.maximum = a, n && (r.pattern = dt);
	}), e._zod.check = (o) => {
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
}), St = /*@__PURE__*/ t("$ZodCheckMaxLength", (e, t) => {
	var n;
	x.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag.maximum ?? Infinity;
		t.maximum < n && (e._zod.bag.maximum = t.maximum);
	}), e._zod.check = (n) => {
		let r = n.value;
		if (r.length <= t.maximum) return;
		let i = ye(r);
		n.issues.push({
			origin: i,
			code: "too_big",
			maximum: t.maximum,
			inclusive: !0,
			input: r,
			inst: e,
			continue: !t.abort
		});
	};
}), Ct = /*@__PURE__*/ t("$ZodCheckMinLength", (e, t) => {
	var n;
	x.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag.minimum ?? -Infinity;
		t.minimum > n && (e._zod.bag.minimum = t.minimum);
	}), e._zod.check = (n) => {
		let r = n.value;
		if (r.length >= t.minimum) return;
		let i = ye(r);
		n.issues.push({
			origin: i,
			code: "too_small",
			minimum: t.minimum,
			inclusive: !0,
			input: r,
			inst: e,
			continue: !t.abort
		});
	};
}), wt = /*@__PURE__*/ t("$ZodCheckLengthEquals", (e, t) => {
	var n;
	x.init(e, t), (n = e._zod.def).when ?? (n.when = (e) => {
		let t = e.value;
		return !l(t) && t.length !== void 0;
	}), e._zod.onattach.push((e) => {
		let n = e._zod.bag;
		n.minimum = t.length, n.maximum = t.length, n.length = t.length;
	}), e._zod.check = (n) => {
		let r = n.value, i = r.length;
		if (i === t.length) return;
		let a = ye(r), o = i > t.length;
		n.issues.push({
			origin: a,
			...o ? {
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
}), Tt = /*@__PURE__*/ t("$ZodCheckStringFormat", (e, t) => {
	var n, r;
	x.init(e, t), e._zod.onattach.push((e) => {
		let n = e._zod.bag;
		n.format = t.format, t.pattern && (n.patterns ??= /* @__PURE__ */ new Set(), n.patterns.add(t.pattern));
	}), t.pattern ? (n = e._zod).check ?? (n.check = (n) => {
		t.pattern.lastIndex = 0, !t.pattern.test(n.value) && n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: t.format,
			input: n.value,
			...t.pattern ? { pattern: t.pattern.toString() } : {},
			inst: e,
			continue: !t.abort
		});
	}) : (r = e._zod).check ?? (r.check = () => {});
}), Et = /*@__PURE__*/ t("$ZodCheckRegex", (e, t) => {
	Tt.init(e, t), e._zod.check = (n) => {
		t.pattern.lastIndex = 0, !t.pattern.test(n.value) && n.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: n.value,
			pattern: t.pattern.toString(),
			inst: e,
			continue: !t.abort
		});
	};
}), Dt = /*@__PURE__*/ t("$ZodCheckLowerCase", (e, t) => {
	t.pattern ??= ht, Tt.init(e, t);
}), Ot = /*@__PURE__*/ t("$ZodCheckUpperCase", (e, t) => {
	t.pattern ??= gt, Tt.init(e, t);
}), kt = /*@__PURE__*/ t("$ZodCheckIncludes", (e, t) => {
	x.init(e, t);
	let n = ae(t.includes), r = new RegExp(typeof t.position == "number" ? `^.{${t.position}}${n}` : n);
	t.pattern = r, e._zod.onattach.push((e) => {
		let t = e._zod.bag;
		t.patterns ??= /* @__PURE__ */ new Set(), t.patterns.add(r);
	}), e._zod.check = (n) => {
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
}), At = /*@__PURE__*/ t("$ZodCheckStartsWith", (e, t) => {
	x.init(e, t);
	let n = RegExp(`^${ae(t.prefix)}.*`);
	t.pattern ??= n, e._zod.onattach.push((e) => {
		let t = e._zod.bag;
		t.patterns ??= /* @__PURE__ */ new Set(), t.patterns.add(n);
	}), e._zod.check = (n) => {
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
}), jt = /*@__PURE__*/ t("$ZodCheckEndsWith", (e, t) => {
	x.init(e, t);
	let n = RegExp(`.*${ae(t.suffix)}$`);
	t.pattern ??= n, e._zod.onattach.push((e) => {
		let t = e._zod.bag;
		t.patterns ??= /* @__PURE__ */ new Set(), t.patterns.add(n);
	}), e._zod.check = (n) => {
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
}), Mt = /*@__PURE__*/ t("$ZodCheckOverwrite", (e, t) => {
	x.init(e, t), e._zod.check = (e) => {
		e.value = t.tx(e.value);
	};
}), Nt = class {
	constructor(e = []) {
		this.content = [], this.indent = 0, this && (this.args = e);
	}
	indented(e) {
		this.indent += 1, e(this), --this.indent;
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
		let e = Function, t = this?.args, n = [...(this?.content ?? [""]).map((e) => `  ${e}`)];
		return new e(...t, n.join("\n"));
	}
}, Pt = {
	major: 4,
	minor: 3,
	patch: 6
}, S = /*@__PURE__*/ t("$ZodType", (e, t) => {
	var r;
	e ??= {}, e._zod.def = t, e._zod.bag = e._zod.bag || {}, e._zod.version = Pt;
	let i = [...e._zod.def.checks ?? []];
	e._zod.traits.has("$ZodCheck") && i.unshift(e);
	for (let t of i) for (let n of t._zod.onattach) n(e);
	if (i.length === 0) (r = e._zod).deferred ?? (r.deferred = []), e._zod.deferred?.push(() => {
		e._zod.run = e._zod.parse;
	});
	else {
		let t = (e, t, r) => {
			let i = he(e), a;
			for (let o of t) {
				if (o._zod.def.when) {
					if (!o._zod.def.when(e)) continue;
				} else if (i) continue;
				let t = e.issues.length, s = o._zod.check(e);
				if (s instanceof Promise && r?.async === !1) throw new n();
				if (a || s instanceof Promise) a = (a ?? Promise.resolve()).then(async () => {
					await s, e.issues.length !== t && (i ||= he(e, t));
				});
				else {
					if (e.issues.length === t) continue;
					i ||= he(e, t);
				}
			}
			return a ? a.then(() => e) : e;
		}, r = (r, a, o) => {
			if (he(r)) return r.aborted = !0, r;
			let s = t(a, i, o);
			if (s instanceof Promise) {
				if (o.async === !1) throw new n();
				return s.then((t) => e._zod.parse(t, o));
			}
			return e._zod.parse(s, o);
		};
		e._zod.run = (a, o) => {
			if (o.skipChecks) return e._zod.parse(a, o);
			if (o.direction === "backward") {
				let t = e._zod.parse({
					value: a.value,
					issues: []
				}, {
					...o,
					skipChecks: !0
				});
				return t instanceof Promise ? t.then((e) => r(e, a, o)) : r(t, a, o);
			}
			let s = e._zod.parse(a, o);
			if (s instanceof Promise) {
				if (o.async === !1) throw new n();
				return s.then((e) => t(e, i, o));
			}
			return t(s, i, o);
		};
	}
	p(e, "~standard", () => ({
		validate: (t) => {
			try {
				let n = ke(e, t);
				return n.success ? { value: n.data } : { issues: n.error?.issues };
			} catch {
				return je(e, t).then((e) => e.success ? { value: e.data } : { issues: e.error?.issues });
			}
		},
		vendor: "zod",
		version: 1
	}));
}), Ft = /*@__PURE__*/ t("$ZodString", (e, t) => {
	S.init(e, t), e._zod.pattern = [...e?._zod.bag?.patterns ?? []].pop() ?? ut(e._zod.bag), e._zod.parse = (n, r) => {
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
}), C = /*@__PURE__*/ t("$ZodStringFormat", (e, t) => {
	Tt.init(e, t), Ft.init(e, t);
}), It = /*@__PURE__*/ t("$ZodGUID", (e, t) => {
	t.pattern ??= qe, C.init(e, t);
}), Lt = /*@__PURE__*/ t("$ZodUUID", (e, t) => {
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
		t.pattern ??= Je(e);
	} else t.pattern ??= Je();
	C.init(e, t);
}), Rt = /*@__PURE__*/ t("$ZodEmail", (e, t) => {
	t.pattern ??= Ye, C.init(e, t);
}), zt = /*@__PURE__*/ t("$ZodURL", (e, t) => {
	C.init(e, t), e._zod.check = (n) => {
		try {
			let r = n.value.trim(), i = new URL(r);
			t.hostname && (t.hostname.lastIndex = 0, t.hostname.test(i.hostname) || n.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid hostname",
				pattern: t.hostname.source,
				input: n.value,
				inst: e,
				continue: !t.abort
			})), t.protocol && (t.protocol.lastIndex = 0, t.protocol.test(i.protocol.endsWith(":") ? i.protocol.slice(0, -1) : i.protocol) || n.issues.push({
				code: "invalid_format",
				format: "url",
				note: "Invalid protocol",
				pattern: t.protocol.source,
				input: n.value,
				inst: e,
				continue: !t.abort
			})), n.value = t.normalize ? i.href : r;
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
}), Bt = /*@__PURE__*/ t("$ZodEmoji", (e, t) => {
	t.pattern ??= Ze(), C.init(e, t);
}), Vt = /*@__PURE__*/ t("$ZodNanoID", (e, t) => {
	t.pattern ??= Ge, C.init(e, t);
}), Ht = /*@__PURE__*/ t("$ZodCUID", (e, t) => {
	t.pattern ??= Be, C.init(e, t);
}), Ut = /*@__PURE__*/ t("$ZodCUID2", (e, t) => {
	t.pattern ??= Ve, C.init(e, t);
}), Wt = /*@__PURE__*/ t("$ZodULID", (e, t) => {
	t.pattern ??= He, C.init(e, t);
}), Gt = /*@__PURE__*/ t("$ZodXID", (e, t) => {
	t.pattern ??= Ue, C.init(e, t);
}), Kt = /*@__PURE__*/ t("$ZodKSUID", (e, t) => {
	t.pattern ??= We, C.init(e, t);
}), qt = /*@__PURE__*/ t("$ZodISODateTime", (e, t) => {
	t.pattern ??= lt(t), C.init(e, t);
}), Jt = /*@__PURE__*/ t("$ZodISODate", (e, t) => {
	t.pattern ??= ot, C.init(e, t);
}), Yt = /*@__PURE__*/ t("$ZodISOTime", (e, t) => {
	t.pattern ??= ct(t), C.init(e, t);
}), Xt = /*@__PURE__*/ t("$ZodISODuration", (e, t) => {
	t.pattern ??= Ke, C.init(e, t);
}), Zt = /*@__PURE__*/ t("$ZodIPv4", (e, t) => {
	t.pattern ??= Qe, C.init(e, t), e._zod.bag.format = "ipv4";
}), Qt = /*@__PURE__*/ t("$ZodIPv6", (e, t) => {
	t.pattern ??= $e, C.init(e, t), e._zod.bag.format = "ipv6", e._zod.check = (n) => {
		try {
			new URL(`http://[${n.value}]`);
		} catch {
			n.issues.push({
				code: "invalid_format",
				format: "ipv6",
				input: n.value,
				inst: e,
				continue: !t.abort
			});
		}
	};
}), $t = /*@__PURE__*/ t("$ZodCIDRv4", (e, t) => {
	t.pattern ??= et, C.init(e, t);
}), en = /*@__PURE__*/ t("$ZodCIDRv6", (e, t) => {
	t.pattern ??= tt, C.init(e, t), e._zod.check = (n) => {
		let r = n.value.split("/");
		try {
			if (r.length !== 2) throw Error();
			let [e, t] = r;
			if (!t) throw Error();
			let n = Number(t);
			if (`${n}` !== t || n < 0 || n > 128) throw Error();
			new URL(`http://[${e}]`);
		} catch {
			n.issues.push({
				code: "invalid_format",
				format: "cidrv6",
				input: n.value,
				inst: e,
				continue: !t.abort
			});
		}
	};
});
function tn(e) {
	if (e === "") return !0;
	if (e.length % 4 != 0) return !1;
	try {
		return atob(e), !0;
	} catch {
		return !1;
	}
}
var nn = /*@__PURE__*/ t("$ZodBase64", (e, t) => {
	t.pattern ??= nt, C.init(e, t), e._zod.bag.contentEncoding = "base64", e._zod.check = (n) => {
		tn(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
});
function rn(e) {
	if (!rt.test(e)) return !1;
	let t = e.replace(/[-_]/g, (e) => e === "-" ? "+" : "/");
	return tn(t.padEnd(Math.ceil(t.length / 4) * 4, "="));
}
var an = /*@__PURE__*/ t("$ZodBase64URL", (e, t) => {
	t.pattern ??= rt, C.init(e, t), e._zod.bag.contentEncoding = "base64url", e._zod.check = (n) => {
		rn(n.value) || n.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), on = /*@__PURE__*/ t("$ZodE164", (e, t) => {
	t.pattern ??= it, C.init(e, t);
});
function sn(e, t = null) {
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
var cn = /*@__PURE__*/ t("$ZodJWT", (e, t) => {
	C.init(e, t), e._zod.check = (n) => {
		sn(n.value, t.alg) || n.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: n.value,
			inst: e,
			continue: !t.abort
		});
	};
}), ln = /*@__PURE__*/ t("$ZodNumber", (e, t) => {
	S.init(e, t), e._zod.pattern = e._zod.bag.pattern ?? ft, e._zod.parse = (n, r) => {
		if (t.coerce) try {
			n.value = Number(n.value);
		} catch {}
		let i = n.value;
		if (typeof i == "number" && !Number.isNaN(i) && Number.isFinite(i)) return n;
		let a = typeof i == "number" ? Number.isNaN(i) ? "NaN" : Number.isFinite(i) ? void 0 : "Infinity" : void 0;
		return n.issues.push({
			expected: "number",
			code: "invalid_type",
			input: i,
			inst: e,
			...a ? { received: a } : {}
		}), n;
	};
}), un = /*@__PURE__*/ t("$ZodNumberFormat", (e, t) => {
	xt.init(e, t), ln.init(e, t);
}), dn = /*@__PURE__*/ t("$ZodBoolean", (e, t) => {
	S.init(e, t), e._zod.pattern = pt, e._zod.parse = (n, r) => {
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
}), fn = /*@__PURE__*/ t("$ZodNull", (e, t) => {
	S.init(e, t), e._zod.pattern = mt, e._zod.values = /* @__PURE__ */ new Set([null]), e._zod.parse = (t, n) => {
		let r = t.value;
		return r === null || t.issues.push({
			expected: "null",
			code: "invalid_type",
			input: r,
			inst: e
		}), t;
	};
}), pn = /*@__PURE__*/ t("$ZodUnknown", (e, t) => {
	S.init(e, t), e._zod.parse = (e) => e;
}), mn = /*@__PURE__*/ t("$ZodNever", (e, t) => {
	S.init(e, t), e._zod.parse = (t, n) => (t.issues.push({
		expected: "never",
		code: "invalid_type",
		input: t.value,
		inst: e
	}), t);
});
function hn(e, t, n) {
	e.issues.length && t.issues.push(...ge(n, e.issues)), t.value[n] = e.value;
}
var gn = /*@__PURE__*/ t("$ZodArray", (e, t) => {
	S.init(e, t), e._zod.parse = (n, r) => {
		let i = n.value;
		if (!Array.isArray(i)) return n.issues.push({
			expected: "array",
			code: "invalid_type",
			input: i,
			inst: e
		}), n;
		n.value = Array(i.length);
		let a = [];
		for (let e = 0; e < i.length; e++) {
			let o = i[e], s = t.element._zod.run({
				value: o,
				issues: []
			}, r);
			s instanceof Promise ? a.push(s.then((t) => hn(t, n, e))) : hn(s, n, e);
		}
		return a.length ? Promise.all(a).then(() => n) : n;
	};
});
function _n(e, t, n, r, i) {
	if (e.issues.length) {
		if (i && !(n in r)) return;
		t.issues.push(...ge(n, e.issues));
	}
	e.value === void 0 ? n in r && (t.value[n] = void 0) : t.value[n] = e.value;
}
function vn(e) {
	let t = Object.keys(e.shape);
	for (let n of t) if (!e.shape?.[n]?._zod?.traits?.has("$ZodType")) throw Error(`Invalid element at key "${n}": expected a Zod schema`);
	let n = oe(e.shape);
	return {
		...e,
		keys: t,
		keySet: new Set(t),
		numKeys: t.length,
		optionalKeys: new Set(n)
	};
}
function yn(e, t, n, r, i, a) {
	let o = [], s = i.keySet, c = i.catchall._zod, l = c.def.type, u = c.optout === "optional";
	for (let i in t) {
		if (s.has(i)) continue;
		if (l === "never") {
			o.push(i);
			continue;
		}
		let a = c.run({
			value: t[i],
			issues: []
		}, r);
		a instanceof Promise ? e.push(a.then((e) => _n(e, n, i, t, u))) : _n(a, n, i, t, u);
	}
	return o.length && n.issues.push({
		code: "unrecognized_keys",
		keys: o,
		input: t,
		inst: a
	}), e.length ? Promise.all(e).then(() => n) : n;
}
var bn = /*@__PURE__*/ t("$ZodObject", (e, t) => {
	if (S.init(e, t), !Object.getOwnPropertyDescriptor(t, "shape")?.get) {
		let e = t.shape;
		Object.defineProperty(t, "shape", { get: () => {
			let n = { ...e };
			return Object.defineProperty(t, "shape", { value: n }), n;
		} });
	}
	let n = c(() => vn(t));
	p(e._zod, "propValues", () => {
		let e = t.shape, n = {};
		for (let t in e) {
			let r = e[t]._zod;
			if (r.values) {
				n[t] ?? (n[t] = /* @__PURE__ */ new Set());
				for (let e of r.values) n[t].add(e);
			}
		}
		return n;
	});
	let r = v, i = t.catchall, a;
	e._zod.parse = (t, o) => {
		a ??= n.value;
		let s = t.value;
		if (!r(s)) return t.issues.push({
			expected: "object",
			code: "invalid_type",
			input: s,
			inst: e
		}), t;
		t.value = {};
		let c = [], l = a.shape;
		for (let e of a.keys) {
			let n = l[e], r = n._zod.optout === "optional", i = n._zod.run({
				value: s[e],
				issues: []
			}, o);
			i instanceof Promise ? c.push(i.then((n) => _n(n, t, e, s, r))) : _n(i, t, e, s, r);
		}
		return i ? yn(c, s, t, o, n.value, e) : c.length ? Promise.all(c).then(() => t) : t;
	};
}), xn = /*@__PURE__*/ t("$ZodObjectJIT", (e, t) => {
	bn.init(e, t);
	let n = e._zod.parse, r = c(() => vn(t)), a = (e) => {
		let t = new Nt([
			"shape",
			"payload",
			"ctx"
		]), n = r.value, i = (e) => {
			let t = g(e);
			return `shape[${t}]._zod.run({ value: input[${t}], issues: [] }, ctx)`;
		};
		t.write("const input = payload.value;");
		let a = Object.create(null), o = 0;
		for (let e of n.keys) a[e] = `key_${o++}`;
		t.write("const newResult = {};");
		for (let r of n.keys) {
			let n = a[r], o = g(r), s = e[r]?._zod?.optout === "optional";
			t.write(`const ${n} = ${i(r)};`), s ? t.write(`
        if (${n}.issues.length) {
          if (${o} in input) {
            payload.issues = payload.issues.concat(${n}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${o}, ...iss.path] : [${o}]
            })));
          }
        }
        
        if (${n}.value === undefined) {
          if (${o} in input) {
            newResult[${o}] = undefined;
          }
        } else {
          newResult[${o}] = ${n}.value;
        }
        
      `) : t.write(`
        if (${n}.issues.length) {
          payload.issues = payload.issues.concat(${n}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${o}, ...iss.path] : [${o}]
          })));
        }
        
        if (${n}.value === undefined) {
          if (${o} in input) {
            newResult[${o}] = undefined;
          }
        } else {
          newResult[${o}] = ${n}.value;
        }
        
      `);
		}
		t.write("payload.value = newResult;"), t.write("return payload;");
		let s = t.compile();
		return (t, n) => s(e, t, n);
	}, o, s = v, l = !i.jitless, u = l && te.value, d = t.catchall, f;
	e._zod.parse = (i, c) => {
		f ??= r.value;
		let p = i.value;
		return s(p) ? l && u && c?.async === !1 && c.jitless !== !0 ? (o ||= a(t.shape), i = o(i, c), d ? yn([], p, i, c, f, e) : i) : n(i, c) : (i.issues.push({
			expected: "object",
			code: "invalid_type",
			input: p,
			inst: e
		}), i);
	};
});
function Sn(e, t, n, r) {
	for (let n of e) if (n.issues.length === 0) return t.value = n.value, t;
	let i = e.filter((e) => !he(e));
	return i.length === 1 ? (t.value = i[0].value, i[0]) : (t.issues.push({
		code: "invalid_union",
		input: t.value,
		inst: n,
		errors: e.map((e) => e.issues.map((e) => ve(e, r, a())))
	}), t);
}
var Cn = /*@__PURE__*/ t("$ZodUnion", (e, t) => {
	S.init(e, t), p(e._zod, "optin", () => t.options.some((e) => e._zod.optin === "optional") ? "optional" : void 0), p(e._zod, "optout", () => t.options.some((e) => e._zod.optout === "optional") ? "optional" : void 0), p(e._zod, "values", () => {
		if (t.options.every((e) => e._zod.values)) return new Set(t.options.flatMap((e) => Array.from(e._zod.values)));
	}), p(e._zod, "pattern", () => {
		if (t.options.every((e) => e._zod.pattern)) {
			let e = t.options.map((e) => e._zod.pattern);
			return RegExp(`^(${e.map((e) => u(e.source)).join("|")})$`);
		}
	});
	let n = t.options.length === 1, r = t.options[0]._zod.run;
	e._zod.parse = (i, a) => {
		if (n) return r(i, a);
		let o = !1, s = [];
		for (let e of t.options) {
			let t = e._zod.run({
				value: i.value,
				issues: []
			}, a);
			if (t instanceof Promise) s.push(t), o = !0;
			else {
				if (t.issues.length === 0) return t;
				s.push(t);
			}
		}
		return o ? Promise.all(s).then((t) => Sn(t, i, e, a)) : Sn(s, i, e, a);
	};
}), wn = /*@__PURE__*/ t("$ZodDiscriminatedUnion", (e, t) => {
	t.inclusive = !1, Cn.init(e, t);
	let n = e._zod.parse;
	p(e._zod, "propValues", () => {
		let e = {};
		for (let n of t.options) {
			let r = n._zod.propValues;
			if (!r || Object.keys(r).length === 0) throw Error(`Invalid discriminated union option at index "${t.options.indexOf(n)}"`);
			for (let [t, n] of Object.entries(r)) {
				e[t] || (e[t] = /* @__PURE__ */ new Set());
				for (let r of n) e[t].add(r);
			}
		}
		return e;
	});
	let r = c(() => {
		let e = t.options, n = /* @__PURE__ */ new Map();
		for (let r of e) {
			let e = r._zod.propValues?.[t.discriminator];
			if (!e || e.size === 0) throw Error(`Invalid discriminated union option at index "${t.options.indexOf(r)}"`);
			for (let t of e) {
				if (n.has(t)) throw Error(`Duplicate discriminator value "${String(t)}"`);
				n.set(t, r);
			}
		}
		return n;
	});
	e._zod.parse = (i, a) => {
		let o = i.value;
		if (!v(o)) return i.issues.push({
			code: "invalid_type",
			expected: "object",
			input: o,
			inst: e
		}), i;
		let s = r.value.get(o?.[t.discriminator]);
		return s ? s._zod.run(i, a) : t.unionFallback ? n(i, a) : (i.issues.push({
			code: "invalid_union",
			errors: [],
			note: "No matching discriminator",
			discriminator: t.discriminator,
			input: o,
			path: [t.discriminator],
			inst: e
		}), i);
	};
}), Tn = /*@__PURE__*/ t("$ZodIntersection", (e, t) => {
	S.init(e, t), e._zod.parse = (e, n) => {
		let r = e.value, i = t.left._zod.run({
			value: r,
			issues: []
		}, n), a = t.right._zod.run({
			value: r,
			issues: []
		}, n);
		return i instanceof Promise || a instanceof Promise ? Promise.all([i, a]).then(([t, n]) => Dn(e, t, n)) : Dn(e, i, a);
	};
});
function En(e, t) {
	if (e === t || e instanceof Date && t instanceof Date && +e == +t) return {
		valid: !0,
		data: e
	};
	if (ne(e) && ne(t)) {
		let n = Object.keys(t), r = Object.keys(e).filter((e) => n.indexOf(e) !== -1), i = {
			...e,
			...t
		};
		for (let n of r) {
			let r = En(e[n], t[n]);
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
			let i = e[r], a = t[r], o = En(i, a);
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
function Dn(e, t, n) {
	let r = /* @__PURE__ */ new Map(), i;
	for (let n of t.issues) if (n.code === "unrecognized_keys") {
		i ??= n;
		for (let e of n.keys) r.has(e) || r.set(e, {}), r.get(e).l = !0;
	} else e.issues.push(n);
	for (let t of n.issues) if (t.code === "unrecognized_keys") for (let e of t.keys) r.has(e) || r.set(e, {}), r.get(e).r = !0;
	else e.issues.push(t);
	let a = [...r].filter(([, e]) => e.l && e.r).map(([e]) => e);
	if (a.length && i && e.issues.push({
		...i,
		keys: a
	}), he(e)) return e;
	let o = En(t.value, n.value);
	if (!o.valid) throw Error(`Unmergable intersection. Error path: ${JSON.stringify(o.mergeErrorPath)}`);
	return e.value = o.data, e;
}
var On = /*@__PURE__*/ t("$ZodTuple", (e, t) => {
	S.init(e, t);
	let n = t.items;
	e._zod.parse = (r, i) => {
		let a = r.value;
		if (!Array.isArray(a)) return r.issues.push({
			input: a,
			inst: e,
			expected: "tuple",
			code: "invalid_type"
		}), r;
		r.value = [];
		let o = [], s = [...n].reverse().findIndex((e) => e._zod.optin !== "optional"), c = s === -1 ? 0 : n.length - s;
		if (!t.rest) {
			let t = a.length > n.length, i = a.length < c - 1;
			if (t || i) return r.issues.push({
				...t ? {
					code: "too_big",
					maximum: n.length,
					inclusive: !0
				} : {
					code: "too_small",
					minimum: n.length
				},
				input: a,
				inst: e,
				origin: "array"
			}), r;
		}
		let l = -1;
		for (let e of n) {
			if (l++, l >= a.length && l >= c) continue;
			let t = e._zod.run({
				value: a[l],
				issues: []
			}, i);
			t instanceof Promise ? o.push(t.then((e) => kn(e, r, l))) : kn(t, r, l);
		}
		if (t.rest) {
			let e = a.slice(n.length);
			for (let n of e) {
				l++;
				let e = t.rest._zod.run({
					value: n,
					issues: []
				}, i);
				e instanceof Promise ? o.push(e.then((e) => kn(e, r, l))) : kn(e, r, l);
			}
		}
		return o.length ? Promise.all(o).then(() => r) : r;
	};
});
function kn(e, t, n) {
	e.issues.length && t.issues.push(...ge(n, e.issues)), t.value[n] = e.value;
}
var An = /*@__PURE__*/ t("$ZodRecord", (e, t) => {
	S.init(e, t), e._zod.parse = (n, r) => {
		let i = n.value;
		if (!ne(i)) return n.issues.push({
			expected: "record",
			code: "invalid_type",
			input: i,
			inst: e
		}), n;
		let o = [], s = t.keyType._zod.values;
		if (s) {
			n.value = {};
			let a = /* @__PURE__ */ new Set();
			for (let e of s) if (typeof e == "string" || typeof e == "number" || typeof e == "symbol") {
				a.add(typeof e == "number" ? e.toString() : e);
				let s = t.valueType._zod.run({
					value: i[e],
					issues: []
				}, r);
				s instanceof Promise ? o.push(s.then((t) => {
					t.issues.length && n.issues.push(...ge(e, t.issues)), n.value[e] = t.value;
				})) : (s.issues.length && n.issues.push(...ge(e, s.issues)), n.value[e] = s.value);
			}
			let c;
			for (let e in i) a.has(e) || (c ??= [], c.push(e));
			c && c.length > 0 && n.issues.push({
				code: "unrecognized_keys",
				input: i,
				inst: e,
				keys: c
			});
		} else {
			n.value = {};
			for (let s of Reflect.ownKeys(i)) {
				if (s === "__proto__") continue;
				let c = t.keyType._zod.run({
					value: s,
					issues: []
				}, r);
				if (c instanceof Promise) throw Error("Async schemas not supported in object keys currently");
				if (typeof s == "string" && ft.test(s) && c.issues.length) {
					let e = t.keyType._zod.run({
						value: Number(s),
						issues: []
					}, r);
					if (e instanceof Promise) throw Error("Async schemas not supported in object keys currently");
					e.issues.length === 0 && (c = e);
				}
				if (c.issues.length) {
					t.mode === "loose" ? n.value[s] = i[s] : n.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: c.issues.map((e) => ve(e, r, a())),
						input: s,
						path: [s],
						inst: e
					});
					continue;
				}
				let l = t.valueType._zod.run({
					value: i[s],
					issues: []
				}, r);
				l instanceof Promise ? o.push(l.then((e) => {
					e.issues.length && n.issues.push(...ge(s, e.issues)), n.value[c.value] = e.value;
				})) : (l.issues.length && n.issues.push(...ge(s, l.issues)), n.value[c.value] = l.value);
			}
		}
		return o.length ? Promise.all(o).then(() => n) : n;
	};
}), jn = /*@__PURE__*/ t("$ZodEnum", (e, t) => {
	S.init(e, t);
	let n = o(t.entries), r = new Set(n);
	e._zod.values = r, e._zod.pattern = RegExp(`^(${n.filter((e) => ie.has(typeof e)).map((e) => typeof e == "string" ? ae(e) : e.toString()).join("|")})$`), e._zod.parse = (t, i) => {
		let a = t.value;
		return r.has(a) || t.issues.push({
			code: "invalid_value",
			values: n,
			input: a,
			inst: e
		}), t;
	};
}), Mn = /*@__PURE__*/ t("$ZodLiteral", (e, t) => {
	if (S.init(e, t), t.values.length === 0) throw Error("Cannot create literal schema with no valid values");
	let n = new Set(t.values);
	e._zod.values = n, e._zod.pattern = RegExp(`^(${t.values.map((e) => typeof e == "string" ? ae(e) : e ? ae(e.toString()) : String(e)).join("|")})$`), e._zod.parse = (r, i) => {
		let a = r.value;
		return n.has(a) || r.issues.push({
			code: "invalid_value",
			values: t.values,
			input: a,
			inst: e
		}), r;
	};
}), Nn = /*@__PURE__*/ t("$ZodTransform", (e, t) => {
	S.init(e, t), e._zod.parse = (i, a) => {
		if (a.direction === "backward") throw new r(e.constructor.name);
		let o = t.transform(i.value, i);
		if (a.async) return (o instanceof Promise ? o : Promise.resolve(o)).then((e) => (i.value = e, i));
		if (o instanceof Promise) throw new n();
		return i.value = o, i;
	};
});
function Pn(e, t) {
	return e.issues.length && t === void 0 ? {
		issues: [],
		value: void 0
	} : e;
}
var Fn = /*@__PURE__*/ t("$ZodOptional", (e, t) => {
	S.init(e, t), e._zod.optin = "optional", e._zod.optout = "optional", p(e._zod, "values", () => t.innerType._zod.values ? /* @__PURE__ */ new Set([...t.innerType._zod.values, void 0]) : void 0), p(e._zod, "pattern", () => {
		let e = t.innerType._zod.pattern;
		return e ? RegExp(`^(${u(e.source)})?$`) : void 0;
	}), e._zod.parse = (e, n) => {
		if (t.innerType._zod.optin === "optional") {
			let r = t.innerType._zod.run(e, n);
			return r instanceof Promise ? r.then((t) => Pn(t, e.value)) : Pn(r, e.value);
		}
		return e.value === void 0 ? e : t.innerType._zod.run(e, n);
	};
}), In = /*@__PURE__*/ t("$ZodExactOptional", (e, t) => {
	Fn.init(e, t), p(e._zod, "values", () => t.innerType._zod.values), p(e._zod, "pattern", () => t.innerType._zod.pattern), e._zod.parse = (e, n) => t.innerType._zod.run(e, n);
}), Ln = /*@__PURE__*/ t("$ZodNullable", (e, t) => {
	S.init(e, t), p(e._zod, "optin", () => t.innerType._zod.optin), p(e._zod, "optout", () => t.innerType._zod.optout), p(e._zod, "pattern", () => {
		let e = t.innerType._zod.pattern;
		return e ? RegExp(`^(${u(e.source)}|null)$`) : void 0;
	}), p(e._zod, "values", () => t.innerType._zod.values ? /* @__PURE__ */ new Set([...t.innerType._zod.values, null]) : void 0), e._zod.parse = (e, n) => e.value === null ? e : t.innerType._zod.run(e, n);
}), Rn = /*@__PURE__*/ t("$ZodDefault", (e, t) => {
	S.init(e, t), e._zod.optin = "optional", p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		if (e.value === void 0) return e.value = t.defaultValue, e;
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => zn(e, t)) : zn(r, t);
	};
});
function zn(e, t) {
	return e.value === void 0 && (e.value = t.defaultValue), e;
}
var Bn = /*@__PURE__*/ t("$ZodPrefault", (e, t) => {
	S.init(e, t), e._zod.optin = "optional", p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => (n.direction === "backward" || e.value === void 0 && (e.value = t.defaultValue), t.innerType._zod.run(e, n));
}), Vn = /*@__PURE__*/ t("$ZodNonOptional", (e, t) => {
	S.init(e, t), p(e._zod, "values", () => {
		let e = t.innerType._zod.values;
		return e ? new Set([...e].filter((e) => e !== void 0)) : void 0;
	}), e._zod.parse = (n, r) => {
		let i = t.innerType._zod.run(n, r);
		return i instanceof Promise ? i.then((t) => Hn(t, e)) : Hn(i, e);
	};
});
function Hn(e, t) {
	return !e.issues.length && e.value === void 0 && e.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: e.value,
		inst: t
	}), e;
}
var Un = /*@__PURE__*/ t("$ZodCatch", (e, t) => {
	S.init(e, t), p(e._zod, "optin", () => t.innerType._zod.optin), p(e._zod, "optout", () => t.innerType._zod.optout), p(e._zod, "values", () => t.innerType._zod.values), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then((r) => (e.value = r.value, r.issues.length && (e.value = t.catchValue({
			...e,
			error: { issues: r.issues.map((e) => ve(e, n, a())) },
			input: e.value
		}), e.issues = []), e)) : (e.value = r.value, r.issues.length && (e.value = t.catchValue({
			...e,
			error: { issues: r.issues.map((e) => ve(e, n, a())) },
			input: e.value
		}), e.issues = []), e);
	};
}), Wn = /*@__PURE__*/ t("$ZodPipe", (e, t) => {
	S.init(e, t), p(e._zod, "values", () => t.in._zod.values), p(e._zod, "optin", () => t.in._zod.optin), p(e._zod, "optout", () => t.out._zod.optout), p(e._zod, "propValues", () => t.in._zod.propValues), e._zod.parse = (e, n) => {
		if (n.direction === "backward") {
			let r = t.out._zod.run(e, n);
			return r instanceof Promise ? r.then((e) => Gn(e, t.in, n)) : Gn(r, t.in, n);
		}
		let r = t.in._zod.run(e, n);
		return r instanceof Promise ? r.then((e) => Gn(e, t.out, n)) : Gn(r, t.out, n);
	};
});
function Gn(e, t, n) {
	return e.issues.length ? (e.aborted = !0, e) : t._zod.run({
		value: e.value,
		issues: e.issues
	}, n);
}
var Kn = /*@__PURE__*/ t("$ZodReadonly", (e, t) => {
	S.init(e, t), p(e._zod, "propValues", () => t.innerType._zod.propValues), p(e._zod, "values", () => t.innerType._zod.values), p(e._zod, "optin", () => t.innerType?._zod?.optin), p(e._zod, "optout", () => t.innerType?._zod?.optout), e._zod.parse = (e, n) => {
		if (n.direction === "backward") return t.innerType._zod.run(e, n);
		let r = t.innerType._zod.run(e, n);
		return r instanceof Promise ? r.then(qn) : qn(r);
	};
});
function qn(e) {
	return e.value = Object.freeze(e.value), e;
}
var Jn = /*@__PURE__*/ t("$ZodLazy", (e, t) => {
	S.init(e, t), p(e._zod, "innerType", () => t.getter()), p(e._zod, "pattern", () => e._zod.innerType?._zod?.pattern), p(e._zod, "propValues", () => e._zod.innerType?._zod?.propValues), p(e._zod, "optin", () => e._zod.innerType?._zod?.optin ?? void 0), p(e._zod, "optout", () => e._zod.innerType?._zod?.optout ?? void 0), e._zod.parse = (t, n) => e._zod.innerType._zod.run(t, n);
}), Yn = /*@__PURE__*/ t("$ZodCustom", (e, t) => {
	x.init(e, t), S.init(e, t), e._zod.parse = (e, t) => e, e._zod.check = (n) => {
		let r = n.value, i = t.fn(r);
		if (i instanceof Promise) return i.then((t) => Xn(t, n, r, e));
		Xn(i, n, r, e);
	};
});
function Xn(e, t, n, r) {
	if (!e) {
		let e = {
			code: "custom",
			input: n,
			inst: r,
			path: [...r._zod.def.path ?? []],
			continue: !r._zod.def.abort
		};
		r._zod.def.params && (e.params = r._zod.def.params), t.issues.push(be(e));
	}
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/core/registries.js
var Zn, Qn = class {
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
function $n() {
	return new Qn();
}
(Zn = globalThis).__zod_globalRegistry ?? (Zn.__zod_globalRegistry = $n());
var er = globalThis.__zod_globalRegistry;
//#endregion
//#region ../../node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function tr(e, t) {
	return new e({
		type: "string",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function nr(e, t) {
	return new e({
		type: "string",
		format: "email",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function rr(e, t) {
	return new e({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ir(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ar(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v4",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function or(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v6",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function sr(e, t) {
	return new e({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: !1,
		version: "v7",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function cr(e, t) {
	return new e({
		type: "string",
		format: "url",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function lr(e, t) {
	return new e({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function ur(e, t) {
	return new e({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function dr(e, t) {
	return new e({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function fr(e, t) {
	return new e({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function pr(e, t) {
	return new e({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function mr(e, t) {
	return new e({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function hr(e, t) {
	return new e({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function gr(e, t) {
	return new e({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function _r(e, t) {
	return new e({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function vr(e, t) {
	return new e({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function yr(e, t) {
	return new e({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function br(e, t) {
	return new e({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function xr(e, t) {
	return new e({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Sr(e, t) {
	return new e({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Cr(e, t) {
	return new e({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: !1,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function wr(e, t) {
	return new e({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: !1,
		local: !1,
		precision: null,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Tr(e, t) {
	return new e({
		type: "string",
		format: "date",
		check: "string_format",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Er(e, t) {
	return new e({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Dr(e, t) {
	return new e({
		type: "string",
		format: "duration",
		check: "string_format",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Or(e, t) {
	return new e({
		type: "number",
		checks: [],
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function kr(e, t) {
	return new e({
		type: "number",
		check: "number_format",
		abort: !1,
		format: "safeint",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Ar(e, t) {
	return new e({
		type: "boolean",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function jr(e, t) {
	return new e({
		type: "null",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Mr(e) {
	return new e({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function Nr(e, t) {
	return new e({
		type: "never",
		...b(t)
	});
}
// @__NO_SIDE_EFFECTS__
function Pr(e, t) {
	return new vt({
		check: "less_than",
		...b(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function Fr(e, t) {
	return new vt({
		check: "less_than",
		...b(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function Ir(e, t) {
	return new yt({
		check: "greater_than",
		...b(t),
		value: e,
		inclusive: !1
	});
}
// @__NO_SIDE_EFFECTS__
function Lr(e, t) {
	return new yt({
		check: "greater_than",
		...b(t),
		value: e,
		inclusive: !0
	});
}
// @__NO_SIDE_EFFECTS__
function Rr(e, t) {
	return new bt({
		check: "multiple_of",
		...b(t),
		value: e
	});
}
// @__NO_SIDE_EFFECTS__
function zr(e, t) {
	return new St({
		check: "max_length",
		...b(t),
		maximum: e
	});
}
// @__NO_SIDE_EFFECTS__
function Br(e, t) {
	return new Ct({
		check: "min_length",
		...b(t),
		minimum: e
	});
}
// @__NO_SIDE_EFFECTS__
function Vr(e, t) {
	return new wt({
		check: "length_equals",
		...b(t),
		length: e
	});
}
// @__NO_SIDE_EFFECTS__
function Hr(e, t) {
	return new Et({
		check: "string_format",
		format: "regex",
		...b(t),
		pattern: e
	});
}
// @__NO_SIDE_EFFECTS__
function Ur(e) {
	return new Dt({
		check: "string_format",
		format: "lowercase",
		...b(e)
	});
}
// @__NO_SIDE_EFFECTS__
function Wr(e) {
	return new Ot({
		check: "string_format",
		format: "uppercase",
		...b(e)
	});
}
// @__NO_SIDE_EFFECTS__
function Gr(e, t) {
	return new kt({
		check: "string_format",
		format: "includes",
		...b(t),
		includes: e
	});
}
// @__NO_SIDE_EFFECTS__
function Kr(e, t) {
	return new At({
		check: "string_format",
		format: "starts_with",
		...b(t),
		prefix: e
	});
}
// @__NO_SIDE_EFFECTS__
function qr(e, t) {
	return new jt({
		check: "string_format",
		format: "ends_with",
		...b(t),
		suffix: e
	});
}
// @__NO_SIDE_EFFECTS__
function Jr(e) {
	return new Mt({
		check: "overwrite",
		tx: e
	});
}
// @__NO_SIDE_EFFECTS__
function Yr(e) {
	return /* @__PURE__ */ Jr((t) => t.normalize(e));
}
// @__NO_SIDE_EFFECTS__
function Xr() {
	return /* @__PURE__ */ Jr((e) => e.trim());
}
// @__NO_SIDE_EFFECTS__
function Zr() {
	return /* @__PURE__ */ Jr((e) => e.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function Qr() {
	return /* @__PURE__ */ Jr((e) => e.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function $r() {
	return /* @__PURE__ */ Jr((e) => _(e));
}
// @__NO_SIDE_EFFECTS__
function ei(e, t, n) {
	return new e({
		type: "array",
		element: t,
		...b(n)
	});
}
// @__NO_SIDE_EFFECTS__
function ti(e, t, n) {
	return new e({
		type: "custom",
		check: "custom",
		fn: t,
		...b(n)
	});
}
// @__NO_SIDE_EFFECTS__
function ni(e) {
	let t = /* @__PURE__ */ ri((n) => (n.addIssue = (e) => {
		if (typeof e == "string") n.issues.push(be(e, n.value, t._zod.def));
		else {
			let r = e;
			r.fatal && (r.continue = !1), r.code ??= "custom", r.input ??= n.value, r.inst ??= t, r.continue ??= !t._zod.def.abort, n.issues.push(be(r));
		}
	}, e(n.value, n)));
	return t;
}
// @__NO_SIDE_EFFECTS__
function ri(e, t) {
	let n = new x({
		check: "custom",
		...b(t)
	});
	return n._zod.check = e, n;
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/core/to-json-schema.js
function ii(e) {
	let t = e?.target ?? "draft-2020-12";
	return t === "draft-4" && (t = "draft-04"), t === "draft-7" && (t = "draft-07"), {
		processors: e.processors ?? {},
		metadataRegistry: e?.metadata ?? er,
		target: t,
		unrepresentable: e?.unrepresentable ?? "throw",
		override: e?.override ?? (() => {}),
		io: e?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		cycles: e?.cycles ?? "ref",
		reused: e?.reused ?? "inline",
		external: e?.external ?? void 0
	};
}
function w(e, t, n = {
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
	t.seen.set(e, o);
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
		a && (o.ref ||= a, w(a, t, r), t.seen.get(a).isParent = !0);
	}
	let c = t.metadataRegistry.get(e);
	return c && Object.assign(o.schema, c), t.io === "input" && T(e) && (delete o.schema.examples, delete o.schema.default), t.io === "input" && o.schema._prefault && ((r = o.schema).default ?? (r.default = o.schema._prefault)), delete o.schema._prefault, t.seen.get(e).schema;
}
function ai(e, t) {
	let n = e.seen.get(t);
	if (!n) throw Error("Unprocessed schema. This is a bug in Zod.");
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
				ref: `${i("__shared")}#/${r}/${a}`
			};
		}
		if (t[1] === n) return { ref: "#" };
		let i = `#/${r}/`, a = t[1].schema.id ?? `__schema${e.counter++}`;
		return {
			defId: a,
			ref: i + a
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
		if (t === n[0]) {
			a(n);
			continue;
		}
		if (e.external) {
			let r = e.external.registry.get(n[0])?.id;
			if (t !== n[0] && r) {
				a(n);
				continue;
			}
		}
		if (e.metadataRegistry.get(n[0])?.id) {
			a(n);
			continue;
		}
		if (r.cycle) {
			a(n);
			continue;
		}
		if (r.count > 1 && e.reused === "ref") {
			a(n);
			continue;
		}
	}
}
function oi(e, t) {
	let n = e.seen.get(t);
	if (!n) throw Error("Unprocessed schema. This is a bug in Zod.");
	let r = (t) => {
		let n = e.seen.get(t);
		if (n.ref === null) return;
		let i = n.def ?? n.schema, a = { ...i }, o = n.ref;
		if (n.ref = null, o) {
			r(o);
			let n = e.seen.get(o), s = n.schema;
			if (s.$ref && (e.target === "draft-07" || e.target === "draft-04" || e.target === "openapi-3.0") ? (i.allOf = i.allOf ?? [], i.allOf.push(s)) : Object.assign(i, s), Object.assign(i, a), t._zod.parent === o) for (let e in i) e !== "$ref" && e !== "allOf" && (e in a || delete i[e]);
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
	for (let t of [...e.seen.entries()].reverse()) r(t[0]);
	let i = {};
	if (e.target === "draft-2020-12" ? i.$schema = "https://json-schema.org/draft/2020-12/schema" : e.target === "draft-07" ? i.$schema = "http://json-schema.org/draft-07/schema#" : e.target === "draft-04" ? i.$schema = "http://json-schema.org/draft-04/schema#" : e.target, e.external?.uri) {
		let n = e.external.registry.get(t)?.id;
		if (!n) throw Error("Schema is missing an `id` property");
		i.$id = e.external.uri(n);
	}
	Object.assign(i, n.def ?? n.schema);
	let a = e.external?.defs ?? {};
	for (let t of e.seen.entries()) {
		let e = t[1];
		e.def && e.defId && (a[e.defId] = e.def);
	}
	e.external || Object.keys(a).length > 0 && (e.target === "draft-2020-12" ? i.$defs = a : i.definitions = a);
	try {
		let n = JSON.parse(JSON.stringify(i));
		return Object.defineProperty(n, "~standard", {
			value: {
				...t["~standard"],
				jsonSchema: {
					input: ci(t, "input", e.processors),
					output: ci(t, "output", e.processors)
				}
			},
			enumerable: !1,
			writable: !1
		}), n;
	} catch {
		throw Error("Error converting schema to JSON.");
	}
}
function T(e, t) {
	let n = t ?? { seen: /* @__PURE__ */ new Set() };
	if (n.seen.has(e)) return !1;
	n.seen.add(e);
	let r = e._zod.def;
	if (r.type === "transform") return !0;
	if (r.type === "array") return T(r.element, n);
	if (r.type === "set") return T(r.valueType, n);
	if (r.type === "lazy") return T(r.getter(), n);
	if (r.type === "promise" || r.type === "optional" || r.type === "nonoptional" || r.type === "nullable" || r.type === "readonly" || r.type === "default" || r.type === "prefault") return T(r.innerType, n);
	if (r.type === "intersection") return T(r.left, n) || T(r.right, n);
	if (r.type === "record" || r.type === "map") return T(r.keyType, n) || T(r.valueType, n);
	if (r.type === "pipe") return T(r.in, n) || T(r.out, n);
	if (r.type === "object") {
		for (let e in r.shape) if (T(r.shape[e], n)) return !0;
		return !1;
	}
	if (r.type === "union") {
		for (let e of r.options) if (T(e, n)) return !0;
		return !1;
	}
	if (r.type === "tuple") {
		for (let e of r.items) if (T(e, n)) return !0;
		return !!(r.rest && T(r.rest, n));
	}
	return !1;
}
var si = (e, t = {}) => (n) => {
	let r = ii({
		...n,
		processors: t
	});
	return w(e, r), ai(r, e), oi(r, e);
}, ci = (e, t, n = {}) => (r) => {
	let { libraryOptions: i, target: a } = r ?? {}, o = ii({
		...i ?? {},
		target: a,
		io: t,
		processors: n
	});
	return w(e, o), ai(o, e), oi(o, e);
}, li = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
}, ui = (e, t, n, r) => {
	let i = n;
	i.type = "string";
	let { minimum: a, maximum: o, format: s, patterns: c, contentEncoding: l } = e._zod.bag;
	if (typeof a == "number" && (i.minLength = a), typeof o == "number" && (i.maxLength = o), s && (i.format = li[s] ?? s, i.format === "" && delete i.format, s === "time" && delete i.format), l && (i.contentEncoding = l), c && c.size > 0) {
		let e = [...c];
		e.length === 1 ? i.pattern = e[0].source : e.length > 1 && (i.allOf = [...e.map((e) => ({
			...t.target === "draft-07" || t.target === "draft-04" || t.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: e.source
		}))]);
	}
}, di = (e, t, n, r) => {
	let i = n, { minimum: a, maximum: o, format: s, multipleOf: c, exclusiveMaximum: l, exclusiveMinimum: u } = e._zod.bag;
	i.type = typeof s == "string" && s.includes("int") ? "integer" : "number", typeof u == "number" && (t.target === "draft-04" || t.target === "openapi-3.0" ? (i.minimum = u, i.exclusiveMinimum = !0) : i.exclusiveMinimum = u), typeof a == "number" && (i.minimum = a, typeof u == "number" && t.target !== "draft-04" && (u >= a ? delete i.minimum : delete i.exclusiveMinimum)), typeof l == "number" && (t.target === "draft-04" || t.target === "openapi-3.0" ? (i.maximum = l, i.exclusiveMaximum = !0) : i.exclusiveMaximum = l), typeof o == "number" && (i.maximum = o, typeof l == "number" && t.target !== "draft-04" && (l <= o ? delete i.maximum : delete i.exclusiveMaximum)), typeof c == "number" && (i.multipleOf = c);
}, fi = (e, t, n, r) => {
	n.type = "boolean";
}, pi = (e, t, n, r) => {
	t.target === "openapi-3.0" ? (n.type = "string", n.nullable = !0, n.enum = [null]) : n.type = "null";
}, mi = (e, t, n, r) => {
	n.not = {};
}, hi = (e, t, n, r) => {
	let i = e._zod.def, a = o(i.entries);
	a.every((e) => typeof e == "number") && (n.type = "number"), a.every((e) => typeof e == "string") && (n.type = "string"), n.enum = a;
}, gi = (e, t, n, r) => {
	let i = e._zod.def, a = [];
	for (let e of i.values) if (e === void 0) {
		if (t.unrepresentable === "throw") throw Error("Literal `undefined` cannot be represented in JSON Schema");
	} else if (typeof e == "bigint") {
		if (t.unrepresentable === "throw") throw Error("BigInt literals cannot be represented in JSON Schema");
		a.push(Number(e));
	} else a.push(e);
	if (a.length !== 0) {
		if (a.length === 1) {
			let e = a[0];
			n.type = e === null ? "null" : typeof e, t.target === "draft-04" || t.target === "openapi-3.0" ? n.enum = [e] : n.const = e;
		} else a.every((e) => typeof e == "number") && (n.type = "number"), a.every((e) => typeof e == "string") && (n.type = "string"), a.every((e) => typeof e == "boolean") && (n.type = "boolean"), a.every((e) => e === null) && (n.type = "null"), n.enum = a;
	}
}, _i = (e, t, n, r) => {
	if (t.unrepresentable === "throw") throw Error("Custom types cannot be represented in JSON Schema");
}, vi = (e, t, n, r) => {
	if (t.unrepresentable === "throw") throw Error("Transforms cannot be represented in JSON Schema");
}, yi = (e, t, n, r) => {
	let i = n, a = e._zod.def, { minimum: o, maximum: s } = e._zod.bag;
	typeof o == "number" && (i.minItems = o), typeof s == "number" && (i.maxItems = s), i.type = "array", i.items = w(a.element, t, {
		...r,
		path: [...r.path, "items"]
	});
}, bi = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object", i.properties = {};
	let o = a.shape;
	for (let e in o) i.properties[e] = w(o[e], t, {
		...r,
		path: [
			...r.path,
			"properties",
			e
		]
	});
	let s = new Set(Object.keys(o)), c = new Set([...s].filter((e) => {
		let n = a.shape[e]._zod;
		return t.io === "input" ? n.optin === void 0 : n.optout === void 0;
	}));
	c.size > 0 && (i.required = Array.from(c)), a.catchall?._zod.def.type === "never" ? i.additionalProperties = !1 : a.catchall ? a.catchall && (i.additionalProperties = w(a.catchall, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	})) : t.io === "output" && (i.additionalProperties = !1);
}, xi = (e, t, n, r) => {
	let i = e._zod.def, a = i.inclusive === !1, o = i.options.map((e, n) => w(e, t, {
		...r,
		path: [
			...r.path,
			a ? "oneOf" : "anyOf",
			n
		]
	}));
	a ? n.oneOf = o : n.anyOf = o;
}, Si = (e, t, n, r) => {
	let i = e._zod.def, a = w(i.left, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			0
		]
	}), o = w(i.right, t, {
		...r,
		path: [
			...r.path,
			"allOf",
			1
		]
	}), s = (e) => "allOf" in e && Object.keys(e).length === 1;
	n.allOf = [...s(a) ? a.allOf : [a], ...s(o) ? o.allOf : [o]];
}, Ci = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "array";
	let o = t.target === "draft-2020-12" ? "prefixItems" : "items", s = t.target === "draft-2020-12" || t.target === "openapi-3.0" ? "items" : "additionalItems", c = a.items.map((e, n) => w(e, t, {
		...r,
		path: [
			...r.path,
			o,
			n
		]
	})), l = a.rest ? w(a.rest, t, {
		...r,
		path: [
			...r.path,
			s,
			...t.target === "openapi-3.0" ? [a.items.length] : []
		]
	}) : null;
	t.target === "draft-2020-12" ? (i.prefixItems = c, l && (i.items = l)) : t.target === "openapi-3.0" ? (i.items = { anyOf: c }, l && i.items.anyOf.push(l), i.minItems = c.length, l || (i.maxItems = c.length)) : (i.items = c, l && (i.additionalItems = l));
	let { minimum: u, maximum: d } = e._zod.bag;
	typeof u == "number" && (i.minItems = u), typeof d == "number" && (i.maxItems = d);
}, wi = (e, t, n, r) => {
	let i = n, a = e._zod.def;
	i.type = "object";
	let o = a.keyType, s = o._zod.bag?.patterns;
	if (a.mode === "loose" && s && s.size > 0) {
		let e = w(a.valueType, t, {
			...r,
			path: [
				...r.path,
				"patternProperties",
				"*"
			]
		});
		i.patternProperties = {};
		for (let t of s) i.patternProperties[t.source] = e;
	} else (t.target === "draft-07" || t.target === "draft-2020-12") && (i.propertyNames = w(a.keyType, t, {
		...r,
		path: [...r.path, "propertyNames"]
	})), i.additionalProperties = w(a.valueType, t, {
		...r,
		path: [...r.path, "additionalProperties"]
	});
	let c = o._zod.values;
	if (c) {
		let e = [...c].filter((e) => typeof e == "string" || typeof e == "number");
		e.length > 0 && (i.required = e);
	}
}, Ti = (e, t, n, r) => {
	let i = e._zod.def, a = w(i.innerType, t, r), o = t.seen.get(e);
	t.target === "openapi-3.0" ? (o.ref = i.innerType, n.nullable = !0) : n.anyOf = [a, { type: "null" }];
}, Ei = (e, t, n, r) => {
	let i = e._zod.def;
	w(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, Di = (e, t, n, r) => {
	let i = e._zod.def;
	w(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.default = JSON.parse(JSON.stringify(i.defaultValue));
}, Oi = (e, t, n, r) => {
	let i = e._zod.def;
	w(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, t.io === "input" && (n._prefault = JSON.parse(JSON.stringify(i.defaultValue)));
}, ki = (e, t, n, r) => {
	let i = e._zod.def;
	w(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
	let o;
	try {
		o = i.catchValue(void 0);
	} catch {
		throw Error("Dynamic catch values are not supported in JSON Schema");
	}
	n.default = o;
}, Ai = (e, t, n, r) => {
	let i = e._zod.def, a = t.io === "input" ? i.in._zod.def.type === "transform" ? i.out : i.in : i.out;
	w(a, t, r);
	let o = t.seen.get(e);
	o.ref = a;
}, ji = (e, t, n, r) => {
	let i = e._zod.def;
	w(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType, n.readOnly = !0;
}, Mi = (e, t, n, r) => {
	let i = e._zod.def;
	w(i.innerType, t, r);
	let a = t.seen.get(e);
	a.ref = i.innerType;
}, Ni = (e, t, n, r) => {
	let i = e._zod.innerType;
	w(i, t, r);
	let a = t.seen.get(e);
	a.ref = i;
}, Pi = /*@__PURE__*/ t("ZodISODateTime", (e, t) => {
	qt.init(e, t), k.init(e, t);
});
function Fi(e) {
	return /* @__PURE__ */ wr(Pi, e);
}
var Ii = /*@__PURE__*/ t("ZodISODate", (e, t) => {
	Jt.init(e, t), k.init(e, t);
});
function Li(e) {
	return /* @__PURE__ */ Tr(Ii, e);
}
var Ri = /*@__PURE__*/ t("ZodISOTime", (e, t) => {
	Yt.init(e, t), k.init(e, t);
});
function zi(e) {
	return /* @__PURE__ */ Er(Ri, e);
}
var Bi = /*@__PURE__*/ t("ZodISODuration", (e, t) => {
	Xt.init(e, t), k.init(e, t);
});
function Vi(e) {
	return /* @__PURE__ */ Dr(Bi, e);
}
//#endregion
//#region ../../node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/classic/errors.js
var Hi = (e, t) => {
	Se.init(e, t), e.name = "ZodError", Object.defineProperties(e, {
		format: { value: (t) => Te(e, t) },
		flatten: { value: (t) => we(e, t) },
		addIssue: { value: (t) => {
			e.issues.push(t), e.message = JSON.stringify(e.issues, s, 2);
		} },
		addIssues: { value: (t) => {
			e.issues.push(...t), e.message = JSON.stringify(e.issues, s, 2);
		} },
		isEmpty: { get() {
			return e.issues.length === 0;
		} }
	});
};
t("ZodError", Hi);
var E = t("ZodError", Hi, { Parent: Error }), Ui = /* @__PURE__ */ Ee(E), Wi = /* @__PURE__ */ De(E), Gi = /* @__PURE__ */ Oe(E), Ki = /* @__PURE__ */ Ae(E), qi = /* @__PURE__ */ Me(E), Ji = /* @__PURE__ */ Ne(E), Yi = /* @__PURE__ */ Pe(E), Xi = /* @__PURE__ */ Fe(E), Zi = /* @__PURE__ */ Ie(E), Qi = /* @__PURE__ */ Le(E), $i = /* @__PURE__ */ Re(E), ea = /* @__PURE__ */ ze(E), D = /*@__PURE__*/ t("ZodType", (e, t) => (S.init(e, t), Object.assign(e["~standard"], { jsonSchema: {
	input: ci(e, "input"),
	output: ci(e, "output")
} }), e.toJSONSchema = si(e, {}), e.def = t, e.type = t.type, Object.defineProperty(e, "_def", { value: t }), e.check = (...n) => e.clone(h(t, { checks: [...t.checks ?? [], ...n.map((e) => typeof e == "function" ? { _zod: {
	check: e,
	def: { check: "custom" },
	onattach: []
} } : e)] }), { parent: !0 }), e.with = e.check, e.clone = (t, n) => y(e, t, n), e.brand = () => e, e.register = ((t, n) => (t.add(e, n), e)), e.parse = (t, n) => Ui(e, t, n, { callee: e.parse }), e.safeParse = (t, n) => Gi(e, t, n), e.parseAsync = async (t, n) => Wi(e, t, n, { callee: e.parseAsync }), e.safeParseAsync = async (t, n) => Ki(e, t, n), e.spa = e.safeParseAsync, e.encode = (t, n) => qi(e, t, n), e.decode = (t, n) => Ji(e, t, n), e.encodeAsync = async (t, n) => Yi(e, t, n), e.decodeAsync = async (t, n) => Xi(e, t, n), e.safeEncode = (t, n) => Zi(e, t, n), e.safeDecode = (t, n) => Qi(e, t, n), e.safeEncodeAsync = async (t, n) => $i(e, t, n), e.safeDecodeAsync = async (t, n) => ea(e, t, n), e.refine = (t, n) => e.check(ho(t, n)), e.superRefine = (t) => e.check(go(t)), e.overwrite = (t) => e.check(/* @__PURE__ */ Jr(t)), e.optional = () => Ja(e), e.exactOptional = () => Xa(e), e.nullable = () => Qa(e), e.nullish = () => Ja(Qa(e)), e.nonoptional = (t) => io(e, t), e.array = () => M(e), e.or = (t) => Fa([e, t]), e.and = (t) => Ra(e, t), e.transform = (t) => co(e, Ka(t)), e.default = (t) => eo(e, t), e.prefault = (t) => no(e, t), e.catch = (t) => oo(e, t), e.pipe = (t) => co(e, t), e.readonly = () => uo(e), e.describe = (t) => {
	let n = e.clone();
	return er.add(n, { description: t }), n;
}, Object.defineProperty(e, "description", {
	get() {
		return er.get(e)?.description;
	},
	configurable: !0
}), e.meta = (...t) => {
	if (t.length === 0) return er.get(e);
	let n = e.clone();
	return er.add(n, t[0]), n;
}, e.isOptional = () => e.safeParse(void 0).success, e.isNullable = () => e.safeParse(null).success, e.apply = (t) => t(e), e)), ta = /*@__PURE__*/ t("_ZodString", (e, t) => {
	Ft.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => ui(e, t, n, r);
	let n = e._zod.bag;
	e.format = n.format ?? null, e.minLength = n.minimum ?? null, e.maxLength = n.maximum ?? null, e.regex = (...t) => e.check(/* @__PURE__ */ Hr(...t)), e.includes = (...t) => e.check(/* @__PURE__ */ Gr(...t)), e.startsWith = (...t) => e.check(/* @__PURE__ */ Kr(...t)), e.endsWith = (...t) => e.check(/* @__PURE__ */ qr(...t)), e.min = (...t) => e.check(/* @__PURE__ */ Br(...t)), e.max = (...t) => e.check(/* @__PURE__ */ zr(...t)), e.length = (...t) => e.check(/* @__PURE__ */ Vr(...t)), e.nonempty = (...t) => e.check(/* @__PURE__ */ Br(1, ...t)), e.lowercase = (t) => e.check(/* @__PURE__ */ Ur(t)), e.uppercase = (t) => e.check(/* @__PURE__ */ Wr(t)), e.trim = () => e.check(/* @__PURE__ */ Xr()), e.normalize = (...t) => e.check(/* @__PURE__ */ Yr(...t)), e.toLowerCase = () => e.check(/* @__PURE__ */ Zr()), e.toUpperCase = () => e.check(/* @__PURE__ */ Qr()), e.slugify = () => e.check(/* @__PURE__ */ $r());
}), na = /*@__PURE__*/ t("ZodString", (e, t) => {
	Ft.init(e, t), ta.init(e, t), e.email = (t) => e.check(/* @__PURE__ */ nr(ra, t)), e.url = (t) => e.check(/* @__PURE__ */ cr(oa, t)), e.jwt = (t) => e.check(/* @__PURE__ */ Cr(xa, t)), e.emoji = (t) => e.check(/* @__PURE__ */ lr(sa, t)), e.guid = (t) => e.check(/* @__PURE__ */ rr(ia, t)), e.uuid = (t) => e.check(/* @__PURE__ */ ir(aa, t)), e.uuidv4 = (t) => e.check(/* @__PURE__ */ ar(aa, t)), e.uuidv6 = (t) => e.check(/* @__PURE__ */ or(aa, t)), e.uuidv7 = (t) => e.check(/* @__PURE__ */ sr(aa, t)), e.nanoid = (t) => e.check(/* @__PURE__ */ ur(ca, t)), e.guid = (t) => e.check(/* @__PURE__ */ rr(ia, t)), e.cuid = (t) => e.check(/* @__PURE__ */ dr(la, t)), e.cuid2 = (t) => e.check(/* @__PURE__ */ fr(ua, t)), e.ulid = (t) => e.check(/* @__PURE__ */ pr(da, t)), e.base64 = (t) => e.check(/* @__PURE__ */ br(va, t)), e.base64url = (t) => e.check(/* @__PURE__ */ xr(ya, t)), e.xid = (t) => e.check(/* @__PURE__ */ mr(fa, t)), e.ksuid = (t) => e.check(/* @__PURE__ */ hr(pa, t)), e.ipv4 = (t) => e.check(/* @__PURE__ */ gr(ma, t)), e.ipv6 = (t) => e.check(/* @__PURE__ */ _r(ha, t)), e.cidrv4 = (t) => e.check(/* @__PURE__ */ vr(ga, t)), e.cidrv6 = (t) => e.check(/* @__PURE__ */ yr(_a, t)), e.e164 = (t) => e.check(/* @__PURE__ */ Sr(ba, t)), e.datetime = (t) => e.check(Fi(t)), e.date = (t) => e.check(Li(t)), e.time = (t) => e.check(zi(t)), e.duration = (t) => e.check(Vi(t));
});
function O(e) {
	return /* @__PURE__ */ tr(na, e);
}
var k = /*@__PURE__*/ t("ZodStringFormat", (e, t) => {
	C.init(e, t), ta.init(e, t);
}), ra = /*@__PURE__*/ t("ZodEmail", (e, t) => {
	Rt.init(e, t), k.init(e, t);
}), ia = /*@__PURE__*/ t("ZodGUID", (e, t) => {
	It.init(e, t), k.init(e, t);
}), aa = /*@__PURE__*/ t("ZodUUID", (e, t) => {
	Lt.init(e, t), k.init(e, t);
}), oa = /*@__PURE__*/ t("ZodURL", (e, t) => {
	zt.init(e, t), k.init(e, t);
}), sa = /*@__PURE__*/ t("ZodEmoji", (e, t) => {
	Bt.init(e, t), k.init(e, t);
}), ca = /*@__PURE__*/ t("ZodNanoID", (e, t) => {
	Vt.init(e, t), k.init(e, t);
}), la = /*@__PURE__*/ t("ZodCUID", (e, t) => {
	Ht.init(e, t), k.init(e, t);
}), ua = /*@__PURE__*/ t("ZodCUID2", (e, t) => {
	Ut.init(e, t), k.init(e, t);
}), da = /*@__PURE__*/ t("ZodULID", (e, t) => {
	Wt.init(e, t), k.init(e, t);
}), fa = /*@__PURE__*/ t("ZodXID", (e, t) => {
	Gt.init(e, t), k.init(e, t);
}), pa = /*@__PURE__*/ t("ZodKSUID", (e, t) => {
	Kt.init(e, t), k.init(e, t);
}), ma = /*@__PURE__*/ t("ZodIPv4", (e, t) => {
	Zt.init(e, t), k.init(e, t);
}), ha = /*@__PURE__*/ t("ZodIPv6", (e, t) => {
	Qt.init(e, t), k.init(e, t);
}), ga = /*@__PURE__*/ t("ZodCIDRv4", (e, t) => {
	$t.init(e, t), k.init(e, t);
}), _a = /*@__PURE__*/ t("ZodCIDRv6", (e, t) => {
	en.init(e, t), k.init(e, t);
}), va = /*@__PURE__*/ t("ZodBase64", (e, t) => {
	nn.init(e, t), k.init(e, t);
}), ya = /*@__PURE__*/ t("ZodBase64URL", (e, t) => {
	an.init(e, t), k.init(e, t);
}), ba = /*@__PURE__*/ t("ZodE164", (e, t) => {
	on.init(e, t), k.init(e, t);
}), xa = /*@__PURE__*/ t("ZodJWT", (e, t) => {
	cn.init(e, t), k.init(e, t);
}), Sa = /*@__PURE__*/ t("ZodNumber", (e, t) => {
	ln.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => di(e, t, n, r), e.gt = (t, n) => e.check(/* @__PURE__ */ Ir(t, n)), e.gte = (t, n) => e.check(/* @__PURE__ */ Lr(t, n)), e.min = (t, n) => e.check(/* @__PURE__ */ Lr(t, n)), e.lt = (t, n) => e.check(/* @__PURE__ */ Pr(t, n)), e.lte = (t, n) => e.check(/* @__PURE__ */ Fr(t, n)), e.max = (t, n) => e.check(/* @__PURE__ */ Fr(t, n)), e.int = (t) => e.check(wa(t)), e.safe = (t) => e.check(wa(t)), e.positive = (t) => e.check(/* @__PURE__ */ Ir(0, t)), e.nonnegative = (t) => e.check(/* @__PURE__ */ Lr(0, t)), e.negative = (t) => e.check(/* @__PURE__ */ Pr(0, t)), e.nonpositive = (t) => e.check(/* @__PURE__ */ Fr(0, t)), e.multipleOf = (t, n) => e.check(/* @__PURE__ */ Rr(t, n)), e.step = (t, n) => e.check(/* @__PURE__ */ Rr(t, n)), e.finite = () => e;
	let n = e._zod.bag;
	e.minValue = Math.max(n.minimum ?? -Infinity, n.exclusiveMinimum ?? -Infinity) ?? null, e.maxValue = Math.min(n.maximum ?? Infinity, n.exclusiveMaximum ?? Infinity) ?? null, e.isInt = (n.format ?? "").includes("int") || Number.isSafeInteger(n.multipleOf ?? .5), e.isFinite = !0, e.format = n.format ?? null;
});
function A(e) {
	return /* @__PURE__ */ Or(Sa, e);
}
var Ca = /*@__PURE__*/ t("ZodNumberFormat", (e, t) => {
	un.init(e, t), Sa.init(e, t);
});
function wa(e) {
	return /* @__PURE__ */ kr(Ca, e);
}
var Ta = /*@__PURE__*/ t("ZodBoolean", (e, t) => {
	dn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => fi(e, t, n, r);
});
function j(e) {
	return /* @__PURE__ */ Ar(Ta, e);
}
var Ea = /*@__PURE__*/ t("ZodNull", (e, t) => {
	fn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => pi(e, t, n, r);
});
function Da(e) {
	return /* @__PURE__ */ jr(Ea, e);
}
var Oa = /*@__PURE__*/ t("ZodUnknown", (e, t) => {
	pn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (e, t, n) => void 0;
});
function ka() {
	return /* @__PURE__ */ Mr(Oa);
}
var Aa = /*@__PURE__*/ t("ZodNever", (e, t) => {
	mn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => mi(e, t, n, r);
});
function ja(e) {
	return /* @__PURE__ */ Nr(Aa, e);
}
var Ma = /*@__PURE__*/ t("ZodArray", (e, t) => {
	gn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => yi(e, t, n, r), e.element = t.element, e.min = (t, n) => e.check(/* @__PURE__ */ Br(t, n)), e.nonempty = (t) => e.check(/* @__PURE__ */ Br(1, t)), e.max = (t, n) => e.check(/* @__PURE__ */ zr(t, n)), e.length = (t, n) => e.check(/* @__PURE__ */ Vr(t, n)), e.unwrap = () => e.element;
});
function M(e, t) {
	return /* @__PURE__ */ ei(Ma, e, t);
}
var Na = /*@__PURE__*/ t("ZodObject", (e, t) => {
	xn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => bi(e, t, n, r), p(e, "shape", () => t.shape), e.keyof = () => L(Object.keys(e._zod.def.shape)), e.catchall = (t) => e.clone({
		...e._zod.def,
		catchall: t
	}), e.passthrough = () => e.clone({
		...e._zod.def,
		catchall: ka()
	}), e.loose = () => e.clone({
		...e._zod.def,
		catchall: ka()
	}), e.strict = () => e.clone({
		...e._zod.def,
		catchall: ja()
	}), e.strip = () => e.clone({
		...e._zod.def,
		catchall: void 0
	}), e.extend = (t) => ue(e, t), e.safeExtend = (t) => de(e, t), e.merge = (t) => fe(e, t), e.pick = (t) => ce(e, t), e.omit = (t) => le(e, t), e.partial = (...t) => pe(qa, e, t[0]), e.required = (...t) => me(ro, e, t[0]);
});
function N(e, t) {
	return new Na({
		type: "object",
		shape: e ?? {},
		...b(t)
	});
}
function P(e, t) {
	return new Na({
		type: "object",
		shape: e,
		catchall: ja(),
		...b(t)
	});
}
var Pa = /*@__PURE__*/ t("ZodUnion", (e, t) => {
	Cn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => xi(e, t, n, r), e.options = t.options;
});
function Fa(e, t) {
	return new Pa({
		type: "union",
		options: e,
		...b(t)
	});
}
var Ia = /*@__PURE__*/ t("ZodDiscriminatedUnion", (e, t) => {
	Pa.init(e, t), wn.init(e, t);
});
function F(e, t, n) {
	return new Ia({
		type: "union",
		options: t,
		discriminator: e,
		...b(n)
	});
}
var La = /*@__PURE__*/ t("ZodIntersection", (e, t) => {
	Tn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Si(e, t, n, r);
});
function Ra(e, t) {
	return new La({
		type: "intersection",
		left: e,
		right: t
	});
}
var za = /*@__PURE__*/ t("ZodTuple", (e, t) => {
	On.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Ci(e, t, n, r), e.rest = (t) => e.clone({
		...e._zod.def,
		rest: t
	});
});
function Ba(e, t, n) {
	let r = t instanceof S;
	return new za({
		type: "tuple",
		items: e,
		rest: r ? t : null,
		...b(r ? n : t)
	});
}
var Va = /*@__PURE__*/ t("ZodRecord", (e, t) => {
	An.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => wi(e, t, n, r), e.keyType = t.keyType, e.valueType = t.valueType;
});
function I(e, t, n) {
	return new Va({
		type: "record",
		keyType: e,
		valueType: t,
		...b(n)
	});
}
function Ha(e, t, n) {
	let r = y(e);
	return r._zod.values = void 0, new Va({
		type: "record",
		keyType: r,
		valueType: t,
		...b(n)
	});
}
var Ua = /*@__PURE__*/ t("ZodEnum", (e, t) => {
	jn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => hi(e, t, n, r), e.enum = t.entries, e.options = Object.values(t.entries);
	let n = new Set(Object.keys(t.entries));
	e.extract = (e, r) => {
		let i = {};
		for (let r of e) if (n.has(r)) i[r] = t.entries[r];
		else throw Error(`Key ${r} not found in enum`);
		return new Ua({
			...t,
			checks: [],
			...b(r),
			entries: i
		});
	}, e.exclude = (e, r) => {
		let i = { ...t.entries };
		for (let t of e) if (n.has(t)) delete i[t];
		else throw Error(`Key ${t} not found in enum`);
		return new Ua({
			...t,
			checks: [],
			...b(r),
			entries: i
		});
	};
});
function L(e, t) {
	return new Ua({
		type: "enum",
		entries: Array.isArray(e) ? Object.fromEntries(e.map((e) => [e, e])) : e,
		...b(t)
	});
}
var Wa = /*@__PURE__*/ t("ZodLiteral", (e, t) => {
	Mn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => gi(e, t, n, r), e.values = new Set(t.values), Object.defineProperty(e, "value", { get() {
		if (t.values.length > 1) throw Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return t.values[0];
	} });
});
function R(e, t) {
	return new Wa({
		type: "literal",
		values: Array.isArray(e) ? e : [e],
		...b(t)
	});
}
var Ga = /*@__PURE__*/ t("ZodTransform", (e, t) => {
	Nn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => vi(e, t, n, r), e._zod.parse = (n, i) => {
		if (i.direction === "backward") throw new r(e.constructor.name);
		n.addIssue = (r) => {
			if (typeof r == "string") n.issues.push(be(r, n.value, t));
			else {
				let t = r;
				t.fatal && (t.continue = !1), t.code ??= "custom", t.input ??= n.value, t.inst ??= e, n.issues.push(be(t));
			}
		};
		let a = t.transform(n.value, n);
		return a instanceof Promise ? a.then((e) => (n.value = e, n)) : (n.value = a, n);
	};
});
function Ka(e) {
	return new Ga({
		type: "transform",
		transform: e
	});
}
var qa = /*@__PURE__*/ t("ZodOptional", (e, t) => {
	Fn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Mi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Ja(e) {
	return new qa({
		type: "optional",
		innerType: e
	});
}
var Ya = /*@__PURE__*/ t("ZodExactOptional", (e, t) => {
	In.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Mi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Xa(e) {
	return new Ya({
		type: "optional",
		innerType: e
	});
}
var Za = /*@__PURE__*/ t("ZodNullable", (e, t) => {
	Ln.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Ti(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function Qa(e) {
	return new Za({
		type: "nullable",
		innerType: e
	});
}
var $a = /*@__PURE__*/ t("ZodDefault", (e, t) => {
	Rn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Di(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeDefault = e.unwrap;
});
function eo(e, t) {
	return new $a({
		type: "default",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : re(t);
		}
	});
}
var to = /*@__PURE__*/ t("ZodPrefault", (e, t) => {
	Bn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Oi(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function no(e, t) {
	return new to({
		type: "prefault",
		innerType: e,
		get defaultValue() {
			return typeof t == "function" ? t() : re(t);
		}
	});
}
var ro = /*@__PURE__*/ t("ZodNonOptional", (e, t) => {
	Vn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Ei(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function io(e, t) {
	return new ro({
		type: "nonoptional",
		innerType: e,
		...b(t)
	});
}
var ao = /*@__PURE__*/ t("ZodCatch", (e, t) => {
	Un.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => ki(e, t, n, r), e.unwrap = () => e._zod.def.innerType, e.removeCatch = e.unwrap;
});
function oo(e, t) {
	return new ao({
		type: "catch",
		innerType: e,
		catchValue: typeof t == "function" ? t : () => t
	});
}
var so = /*@__PURE__*/ t("ZodPipe", (e, t) => {
	Wn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Ai(e, t, n, r), e.in = t.in, e.out = t.out;
});
function co(e, t) {
	return new so({
		type: "pipe",
		in: e,
		out: t
	});
}
var lo = /*@__PURE__*/ t("ZodReadonly", (e, t) => {
	Kn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => ji(e, t, n, r), e.unwrap = () => e._zod.def.innerType;
});
function uo(e) {
	return new lo({
		type: "readonly",
		innerType: e
	});
}
var fo = /*@__PURE__*/ t("ZodLazy", (e, t) => {
	Jn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => Ni(e, t, n, r), e.unwrap = () => e._zod.def.getter();
});
function po(e) {
	return new fo({
		type: "lazy",
		getter: e
	});
}
var mo = /*@__PURE__*/ t("ZodCustom", (e, t) => {
	Yn.init(e, t), D.init(e, t), e._zod.processJSONSchema = (t, n, r) => _i(e, t, n, r);
});
function ho(e, t = {}) {
	return /* @__PURE__ */ ti(mo, e, t);
}
function go(e) {
	return /* @__PURE__ */ ni(e);
}
function _o(e) {
	let t = po(() => Fa([
		O(e),
		A(),
		j(),
		Da(),
		M(t),
		I(O(), t)
	]));
	return t;
}
function vo(e, t) {
	return co(Ka(e), t);
}
//#endregion
//#region ../../packages/poe-item-query/src/schema.ts
var yo = L(["poe1", "poe2"]), bo = L([
	"Normal",
	"Magic",
	"Rare",
	"Unique",
	"Currency",
	"Gem",
	"Relic"
]), z = O().min(1).max(500), B = A().int().nonnegative(), xo = _o().meta({ type: [
	"string",
	"number",
	"boolean",
	"null",
	"array",
	"object"
] }), So = P({
	min: A().optional(),
	max: A().optional()
}).refine((e) => e.min === void 0 || e.max === void 0 || e.min <= e.max, "Minimum must not exceed maximum."), Co = N({
	fractured: j().optional(),
	crafted: j().optional(),
	desecrated: j().optional(),
	mutated: j().optional(),
	vestigial: j().optional()
}).catchall(xo), wo = Fa([O(), N({
	description: O(),
	flags: Co.optional(),
	mods: M(N({
		name: O(),
		tier: O(),
		level: B.optional()
	}).catchall(xo)).optional()
}).catchall(xo)]), To = N({
	id: O().optional(),
	name: O().optional(),
	typeLine: O().optional(),
	baseType: z,
	ilvl: B.optional(),
	itemLevel: B.optional(),
	rarity: bo.optional(),
	frameType: B.optional(),
	frameTypeId: O().optional(),
	identified: j().optional(),
	corrupted: j().optional(),
	duplicated: j().optional(),
	fractured: j().optional(),
	split: j().optional(),
	synthesised: j().optional(),
	sanctified: j().optional(),
	influences: I(O(), j()).optional(),
	sockets: M(N({
		group: B,
		attr: O().optional(),
		sColour: O().optional(),
		type: O().optional(),
		item: O().optional()
	}).catchall(xo)).optional(),
	explicitMods: M(wo).optional(),
	implicitMods: M(wo).optional(),
	craftedMods: M(O()).optional(),
	fracturedMods: M(O()).optional(),
	extended: N({
		prefixes: B.optional(),
		suffixes: B.optional()
	}).catchall(xo).optional()
}).catchall(xo), Eo = P({
	id: z.optional(),
	possibleIds: M(z).min(2).max(100).refine((e) => new Set(e).size === e.length, "Possible identities must be distinct.").optional(),
	name: O().optional(),
	side: L([
		"prefix",
		"suffix",
		"implicit"
	]).optional(),
	tier: B.optional(),
	fractured: j().optional(),
	crafted: j().optional()
}).refine((e) => e.id === void 0 || e.possibleIds === void 0, "Use an exact identity or possible identities, not both."), Do = P({
	baseId: z.optional(),
	itemClass: z.optional(),
	qualityType: z.optional(),
	catalystId: z.optional(),
	quality: B.optional(),
	catalystQuality: B.optional(),
	modifiers: M(Eo).max(100).default([]),
	modifiersComplete: j().default(!1),
	prefixes: B.optional(),
	suffixes: B.optional(),
	prefixLimit: B.optional(),
	memoryStrands: B.optional(),
	memoryStrandsSpent: B.optional(),
	suffixLimit: B.optional(),
	socketCount: B.optional(),
	linkedSockets: P({
		min: B,
		max: B
	}).refine((e) => e.min <= e.max).optional(),
	stats: N({
		explicit: I(O(), A()).default({}),
		implicit: I(O(), A()).default({}),
		total: I(O(), A()).default({})
	}).prefault({}),
	statsComplete: j().default(!1),
	destroyed: j().default(!1)
});
P({
	game: yo,
	source: L([
		"stash",
		"trade",
		"paste",
		"craft"
	]),
	item: To,
	facts: Do.prefault({})
});
var Oo = F("kind", [
	P({
		kind: R("base"),
		field: L([
			"baseType",
			"baseId",
			"itemClass",
			"qualityType",
			"catalystId"
		]),
		values: M(z).min(1).max(100)
	}),
	P({
		kind: R("rarity"),
		values: M(bo).min(1).max(7)
	}),
	P({
		kind: R("range"),
		field: L([
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
		value: So
	}),
	P({
		kind: R("flag"),
		field: L([
			"identified",
			"corrupted",
			"mirrored",
			"fractured",
			"split",
			"synthesised",
			"sanctified",
			"influenced",
			"destroyed"
		]),
		value: j()
	}),
	P({
		kind: R("influence"),
		values: M(z).min(1).max(10)
	}),
	P({
		kind: R("mod"),
		ids: M(z).min(1).max(100).optional(),
		names: M(z).min(1).max(100).optional(),
		tier: So.optional(),
		side: Eo.shape.side,
		fractured: j().optional(),
		crafted: j().optional(),
		count: So.default({ min: 1 })
	}),
	P({
		kind: R("stat"),
		id: z,
		scope: L([
			"explicit",
			"implicit",
			"total"
		]).default("total"),
		value: So
	})
]), ko = P({
	type: L([
		"and",
		"or",
		"not",
		"count"
	]),
	filters: M(Oo).min(1).max(64),
	value: So.optional()
}).refine((e) => e.type !== "count" || e.value !== void 0, "Count groups need a count range."), Ao = P({
	format: R(1).default(1),
	game: yo,
	groups: M(ko).max(16).default([])
}).refine((e) => e.groups.reduce((e, t) => e + t.filters.length, 0) <= 128, "A query may contain at most 128 conditions.");
//#endregion
//#region ../../packages/poe-item-query/src/normalize.ts
function jo(e) {
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
//#endregion
//#region ../../packages/poe-item-query/src/match.ts
function Mo(e) {
	return e.includes("no-match") ? "no-match" : e.includes("unknown") ? "unknown" : "match";
}
function No(e, t) {
	return e === void 0 ? "unknown" : e >= (t.min ?? -Infinity) && e <= (t.max ?? Infinity) ? "match" : "no-match";
}
function Po(e, t) {
	return e === void 0 ? "unknown" : t.includes(e) ? "match" : "no-match";
}
function Fo(e, t, n = !1) {
	let r = e.filter((e) => e === "match").length, i = n ? Infinity : r + e.filter((e) => e === "unknown").length;
	return i < (t.min ?? 0) || r > (t.max ?? Infinity) ? "no-match" : r >= (t.min ?? 0) && i <= (t.max ?? Infinity) ? "match" : "unknown";
}
function Io(e, t) {
	let n = [];
	if (t.ids) {
		if (e.id !== void 0 || !e.possibleIds) n.push(Po(e.id, t.ids));
		else {
			let r = e.possibleIds.filter((e) => t.ids.includes(e)).length;
			n.push(r === e.possibleIds.length ? "match" : r === 0 ? "no-match" : "unknown");
		}
	}
	return t.names && n.push(Po(e.name, t.names)), t.tier && n.push(No(e.tier, t.tier)), t.side && n.push(Po(e.side, [t.side])), t.fractured !== void 0 && n.push(Po(e.fractured, [t.fractured])), t.crafted !== void 0 && n.push(Po(e.crafted, [t.crafted])), Mo(n);
}
function Lo(e, t) {
	let { item: n, facts: r } = e;
	switch (t.kind) {
		case "base": return Po(t.field === "baseType" ? n.baseType : r[t.field], t.values);
		case "rarity": return Po(jo(n), t.values);
		case "influence": return t.values.some((e) => n.influences?.[e] === !0) ? "match" : "no-match";
		case "flag": {
			let e;
			return e = t.field === "destroyed" ? r.destroyed : t.field === "mirrored" ? n.duplicated ?? !1 : t.field === "influenced" ? Object.values(n.influences ?? {}).some(Boolean) : t.field === "fractured" ? n.fractured === !0 || !!n.fracturedMods?.length || r.modifiers.some((e) => e.fractured) || (n.explicitMods ?? []).some((e) => typeof e != "string" && e.flags?.fractured === !0) : n[t.field] ?? (t.field === "identified" && void 0), Po(e, [t.value]);
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
			return No(i, t.value);
		}
		case "mod": return Fo(r.modifiers.map((e) => Io(e, t)), t.count, !r.modifiersComplete);
		case "stat": return No(r.stats[t.scope][t.id] ?? (r.statsComplete ? 0 : void 0), t.value);
	}
}
function Ro(e, t) {
	let n = t.filters.map((t) => Lo(e, t));
	return t.type === "and" ? Mo(n) : t.type === "or" ? Fo(n, { min: 1 }) : t.type === "not" ? Fo(n, { max: 0 }) : Fo(n, t.value);
}
function zo(e, t) {
	return e.game === t.game ? Mo(t.groups.map((t) => Ro(e, t))) : "no-match";
}
function Bo(e) {
	return e.groups.reduce((e, t) => e + t.filters.length, 0);
}
P({
	minimumLevel: j().default(!0),
	rarity: j().default(!0),
	flags: j().default(!0),
	modifiers: j().default(!0),
	implicitModifiers: j().default(!1),
	openAffixes: j().default(!1),
	sockets: j().default(!1)
}), P({
	id: O().min(1).max(500),
	name: O().min(1).max(300),
	side: L(["prefix", "suffix"]),
	level: A().int().nonnegative(),
	text: O().max(5e3).nullable()
});
//#endregion
//#region ../../packages/poe-item-query/src/modifier-ranges.ts
var Vo = P({
	stats: M(P({
		id: O(),
		min: A().int(),
		max: A().int(),
		scalable: j()
	})).max(32),
	descriptions: M(A().int().nonnegative()).max(32)
}), Ho = P({
	statDescriptions: M(P({
		ids: M(O()).max(32),
		rules: M(P({
			conditions: M(O()),
			text: O(),
			handlers: M(O())
		})).max(500)
	})).max(2e4),
	statLookups: I(O(), I(O(), O()))
}), Uo = O().min(1).max(500);
P({
	format: R(1),
	identityFamilies: M(M(Uo).min(2).max(100)).max(1e3).optional(),
	unsupportedImplicitTexts: M(O().max(5e3)).max(1e3).optional(),
	translations: Ho.optional(),
	catalysts: M(P({
		name: O(),
		maximum: A().int().min(0).max(100)
	})).max(100).optional(),
	modifiers: M(P({
		id: Uo,
		name: O(),
		side: L(["prefix", "suffix"]),
		groups: M(Uo),
		crafted: j(),
		text: O().max(5e3).nullable(),
		unsupported: j().optional(),
		scaling: Vo.nullable().optional(),
		catalysts: M(O()).max(100).optional()
	})).max(2e4),
	bases: M(P({
		baseType: Uo,
		modifiers: M(P({
			id: Uo,
			tier: A().int().nonnegative().optional()
		})).max(2e4).optional(),
		tiers: I(Uo, A().int().nonnegative()).optional(),
		catalystProperties: M(O()).max(100).optional(),
		unsupported: j().optional(),
		magnitude: P({
			prefix: A().int().min(0).max(1e3),
			suffix: A().int().min(0).max(1e3),
			texts: M(O()).max(32)
		}).optional()
	})).max(2e3)
});
//#endregion
//#region app/lib/crafting-acquisition.ts
function Wo(e, t) {
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
//#endregion
//#region ../../packages/poe-game-data/src/crafting-genesis.ts
function Go(e) {
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
//#endregion
//#region ../../packages/poe-game-data/src/model.ts
var V = A().int(), H = V.nullable().default(null), U = O().nullable().default(null), Ko = P({
	min: V,
	max: V
}).refine((e) => e.min <= e.max, "Invalid range"), qo = Ko.safeExtend({ id: O() }), Jo = P({
	tag: O(),
	weight: V.nonnegative()
}), Yo = P({
	adds_tags: M(O()),
	domain: O(),
	generation_type: O(),
	generation_weights: M(Jo),
	grants_effects: M(P({
		granted_effect_id: O(),
		level: V
	})),
	groups: M(O()),
	implicit_tags: M(O()),
	is_essence_only: j(),
	name: O(),
	required_level: V,
	maximum_level: V,
	spawn_weights: M(Jo),
	stats: M(qo),
	text: O().nullable(),
	type: O(),
	gold_value: H
}), Xo = P({
	armour: Ko.nullable().default(null),
	energy_shield: Ko.nullable().default(null),
	evasion: Ko.nullable().default(null),
	ward: Ko.nullable().default(null),
	movement_speed: H,
	block: H,
	description: U,
	directions: U,
	stack_size: H,
	stack_size_currency_tab: H,
	full_stack_turns_into: U,
	charges_max: H,
	charges_per_use: H,
	duration: H,
	life_per_use: H,
	mana_per_use: H,
	attack_time: H,
	reload_time: V.nonnegative().nullable().default(null),
	critical_strike_chance: H,
	physical_damage_max: H,
	physical_damage_min: H,
	range: H,
	mana_burn_ms: H,
	cooldown_ms: H,
	monster_id: U,
	monster_ability_text: U,
	monster_category: U
}), Zo = P({
	domain: O(),
	drop_level: V,
	implicits: M(O()),
	inventory_height: V,
	inventory_width: V,
	inherits_from: U,
	item_class: O(),
	name: O(),
	properties: Xo,
	release_state: L([
		"released",
		"unique_only",
		"unreleased",
		"legacy"
	]),
	tags: M(O()),
	visual_identity: P({
		dds_file: O(),
		id: O()
	}),
	requirements: P({
		strength: V,
		dexterity: V,
		intelligence: V,
		level: V
	}).nullable().default(null),
	grants_buff: P({
		id: O(),
		stats: I(O(), V)
	}).nullable().default(null),
	skills_granted: M(O()).nullable().default(null)
}), Qo = P({
	alias: P({
		when_in_main_hand: U,
		when_in_off_hand: U
	}),
	is_aliased: j(),
	is_local: j()
}), $o = P({
	name: O(),
	category: U,
	category_id: U,
	influence_tags: M(O()).nullable().default(null)
}), es = (e) => I(O(), e).refine((e) => Object.keys(e).length > 0, "Empty dataset").meta({ minProperties: 1 }), ts = es(Zo), ns = es(Yo), rs = es(Qo), is = M(O()).min(1), as = es($o);
I(O(), P({
	name: O(),
	used_in_crafting: j().optional()
})), I(O(), I(O(), Fa([
	O(),
	A().finite(),
	j(),
	M(O())
])));
var os = O().regex(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)){2,5}$/);
function ss(e) {
	os.parse(e);
	let t = e.split(".");
	return t.slice(0, 3).join(".") + (t.length > 3 ? `-build.${t.slice(3).join(".")}` : "");
}
var cs = O().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-build\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))*)?$/), ls = O().regex(/^[a-f0-9]{64}$/);
P({
	format: R(1),
	game: L(["poe1", "poe2"]),
	version: cs,
	client_build: os,
	source_manifest_sha256: ls,
	dat_schema_sha256: ls,
	extractor_sha256: ls,
	zod_schema_sha256: ls,
	crafting_data_sha256: ls.optional(),
	weight_provenance: R("client-extracted; PoE 2 values are not Craft of Exile empirical weights"),
	files: I(O(), P({
		sha256: ls,
		bytes: A().int().positive(),
		schema: O().regex(/^json-schema\/[a-z_]+\.schema\.json$/)
	})).refine((e) => Object.keys(e).length > 0).meta({ minProperties: 1 })
}).superRefine((e, t) => {
	os.safeParse(e.client_build).success && e.version !== ss(e.client_build) && t.addIssue({
		code: "custom",
		path: ["version"],
		message: "Package version must match the client build"
	}), e.client_build.startsWith(e.game === "poe1" ? "3." : "4.") || t.addIssue({
		code: "custom",
		path: ["client_build"],
		message: "Client build does not match the game"
	});
}), P({
	base_items: ts,
	mods: ns,
	stats: rs,
	tags: is,
	item_classes: as
});
//#endregion
//#region ../../packages/poe-game-data/src/crafting-data-model.ts
var W = O().min(1), G = A().int(), us = O().regex(/^[a-f0-9]{64}$/), ds = N({
	id: W,
	itemClasses: M(W).min(1),
	maximumQuality: G.positive().max(200)
}), fs = N({
	id: W,
	name: W,
	amount: G.positive()
}), ps = N({
	id: W,
	name: O(),
	action: O(),
	description: O(),
	directions: O()
}), ms = N({
	id: W,
	name: W,
	inheritsFrom: W,
	baseItem: W.nullable(),
	tags: M(W),
	mods: M(W),
	minimumLevel: G.nonnegative(),
	maximumLevel: G.nonnegative(),
	spawnWeight: G.nonnegative(),
	spawnWeightIncreaseStat: W.nullable(),
	spawnWeightHardmode: G.nonnegative(),
	basicSpawnChanceStat: W.nullable(),
	requiredSpawnStats: M(W),
	blockingSpawnStats: M(W)
}), hs = N({
	name: W,
	hash: G.nonnegative(),
	notable: j(),
	stats: M(qo),
	text: O().nullable()
}), gs = N({
	sulphur: W,
	description: W,
	intangibilityDescription: W,
	ghostlyCopyDescription: W,
	classes: M(N({
		itemClass: W,
		costPercent: G.positive(),
		levelScaling: j()
	})).min(1),
	levels: M(N({
		level: G.min(1).max(100),
		costIncreasePercent: G.min(-99)
	})).min(1),
	currencies: M(N({
		id: W,
		currency: W,
		tier: G.nonnegative(),
		outcomes: N({
			min: G.positive(),
			max: G.positive()
		}),
		sulphurCost: G.nonnegative(),
		intangibility: N({
			min: G.min(0).max(100),
			max: G.min(0).max(100)
		})
	})).min(1)
}), _s = N({
	format: R(1),
	game: L(["poe1", "poe2"]),
	patch: W,
	source: N({
		basesSha256: us,
		modsSha256: us,
		schemaSha256: us,
		tables: I(W, us)
	}),
	currencies: M(ps),
	allflame: gs.nullable(),
	genesis: N({
		name: W,
		fruit: W,
		asset: W,
		itemClasses: M(W).min(1),
		passives: I(W, hs)
	}).nullable(),
	strongboxes: M(ms),
	clusterJewels: N({
		bases: I(W, N({
			size: W,
			minNodes: G.positive(),
			maxNodes: G.positive(),
			socketIndices: M(G.nonnegative())
		})),
		skills: I(W, hs.extend({
			size: W,
			tag: W
		})),
		passives: I(W, hs.extend({ id: W }))
	}).nullable(),
	augmentTags: I(W, W),
	taggedModifierEffects: M(N({
		stat: W,
		tags: M(W).min(1),
		explicit: j(),
		implicit: j(),
		prefix: j(),
		suffix: j()
	})),
	augments: M(N({
		id: W,
		name: W,
		requiredLevel: G.nonnegative(),
		type: N({
			id: W,
			name: W,
			effectStat: W.nullable(),
			socketedStat: W
		}),
		limit: N({
			id: W,
			amount: G.positive(),
			text: O()
		}).nullable(),
		higherTier: W.nullable(),
		socketBound: j(),
		martialArtist: j(),
		unique: j(),
		jewellery: j(),
		corruptedSanctified: j(),
		description: O().nullable(),
		extraDescription: O().nullable(),
		rules: M(N({
			category: W,
			display: O(),
			itemClasses: M(W).min(1),
			scope: L([
				"classes",
				"martial",
				"armour",
				"all"
			]),
			stats: M(qo),
			bondedStats: M(qo),
			text: O().nullable(),
			bondedText: O().nullable(),
			statDescriptions: M(G.nonnegative()),
			bondedDescriptions: M(G.nonnegative())
		}))
	})),
	locus: N({
		id: W,
		name: W,
		tier: G.positive(),
		description: W
	}).nullable(),
	templeCorruption: N({
		currencies: M(N({
			id: W,
			itemClasses: M(W).min(1)
		})).min(1),
		twiceCorruptedText: W,
		alreadyTwiceCorruptedText: W
	}).nullable(),
	maps: M(N({
		id: W,
		tier: G.nonnegative(),
		generation: G.nonnegative(),
		upgrade: W.nullable(),
		areaLevel: G.positive()
	})),
	waystones: M(N({
		id: W,
		tier: G.positive(),
		series: G.nonnegative(),
		areaLevel: G.positive()
	})),
	baseQuality: M(ds.extend({ corrupted: j() })),
	taintedCatalysts: M(ds),
	mapQuality: M(ds.extend({
		qualityType: W,
		description: W,
		stats: M(W).min(1)
	})),
	qualityInfusers: M(N({
		id: W,
		itemClasses: M(W).min(1),
		qualityType: L(["base", "catalyst"]),
		extraMaximumQuality: G.positive().max(200)
	})),
	memoryStrandCosts: I(W, G.positive()),
	memoryMaps: N({
		currency: W,
		maximumUses: G.positive(),
		influenceMod: W,
		enchantmentMod: W
	}).nullable(),
	keywords: I(W, N({
		term: W,
		definition: W
	})),
	sanctification: N({
		min: G.positive(),
		max: G.positive()
	}).nullable(),
	recombinableClasses: M(W).refine((e) => new Set(e).size === e.length, "Duplicate recombinable item class."),
	craftableModTypes: M(W),
	passiveTree: N({
		asset: W,
		notables: I(W, hs.extend({
			ascendancy: W.nullable(),
			visibleForAscendancy: W.nullable()
		}))
	}).nullable(),
	anointing: N({
		maps: M(N({
			mod: W,
			maximumAnointments: G.positive().max(9),
			ravaged: j()
		})),
		items: M(N({
			id: W,
			useType: G.nonnegative(),
			tier: G.nonnegative()
		})),
		recipes: M(N({
			id: W,
			type: W.nullable(),
			items: M(W).min(1),
			mod: W.nullable(),
			passive: W.nullable()
		})),
		passives: I(W, hs)
	}),
	liquidEmotions: M(N({
		id: W,
		rules: M(N({
			base: W,
			mods: M(W).min(1)
		})).min(1)
	})),
	scalableStats: M(W),
	catalysts: M(N({
		id: W,
		qualityType: W,
		description: W,
		maximumQuality: G.positive().max(200),
		itemClasses: M(W).min(1),
		tags: M(W),
		explicit: j(),
		implicit: j(),
		prefix: j(),
		suffix: j()
	})),
	modEquivalencies: M(N({
		id: W,
		mods: M(W)
	})),
	elementalConversions: M(N({
		id: W,
		resistance: j(),
		mods: N({
			fire: W.nullable(),
			cold: W.nullable(),
			lightning: W.nullable(),
			chaos: W.nullable()
		})
	})),
	desecration: M(N({
		id: W,
		itemClasses: M(W),
		maximumItemLevel: G.nonnegative(),
		minimumModLevel: G.nonnegative(),
		tag: W.nullable()
	})),
	baseRules: I(W, N({
		corrupted: j(),
		unmodifiable: j(),
		initialSockets: G.min(0).max(6)
	})),
	tieredCurrency: M(N({
		id: W,
		tier: G,
		minimumModLevel: G.nonnegative()
	})),
	poe2Essences: M(N({
		id: W,
		name: O(),
		tier: G,
		perfect: j(),
		replacement: M(W),
		rules: M(N({
			itemClasses: M(W),
			mod: W.nullable(),
			text: O(),
			outcomes: M(N({
				mod: W,
				weight: G.nonnegative().nullable()
			}))
		}))
	})),
	rarities: I(W, N({
		min: G.nonnegative(),
		max: G.nonnegative(),
		prefixes: G.nonnegative(),
		suffixes: G.nonnegative()
	})),
	classes: I(W, N({
		influence: j(),
		fracture: j(),
		veiled: j(),
		corrupt: j(),
		doubleCorrupt: j(),
		aspects: j(),
		upgrade: j(),
		unmodifiable: j()
	})),
	influences: M(N({
		itemClass: W,
		influence: G.min(0).max(5),
		tag: W,
		name: W
	})),
	influenceUpgrades: M(N({
		mod: W,
		upgraded: W,
		highestTier: j()
	})),
	modRules: I(W, N({
		itemClasses: M(W),
		influence: G.min(0).max(5).nullable(),
		spawnLevel: G.nullable(),
		gameMode: G.nullable()
	})),
	statDescriptions: M(N({
		ids: M(W),
		rules: M(N({
			conditions: M(O()),
			text: O(),
			handlers: M(O())
		}))
	})),
	modDescriptions: I(W, M(G.nonnegative())),
	modTexts: I(W, W),
	statLookups: I(W, I(O(), O())),
	essences: M(N({
		id: W,
		name: O(),
		level: G,
		itemLevelLimit: G.nonnegative(),
		corrupted: j(),
		mods: I(W, W)
	})),
	flaskEnchantments: M(N({
		id: W,
		itemClasses: M(W).min(1),
		mods: M(W).min(1)
	})),
	bench: M(N({
		id: W,
		name: O(),
		mod: W.nullable(),
		itemClasses: M(W),
		cost: M(fs),
		level: G.nonnegative(),
		action: G.nullable(),
		socketCount: G.min(1).max(6).nullable(),
		linkCount: G.min(2).max(6).nullable(),
		enchantment: N({
			mod: W,
			itemClasses: M(W).min(1)
		}).nullable()
	})),
	fossils: M(N({
		id: W,
		name: O(),
		positive: M(N({
			tag: W,
			weight: G.nonnegative()
		})),
		negative: M(N({
			tag: W,
			weight: G.nonnegative()
		})),
		added: M(W),
		forced: M(W),
		allowed: M(N({
			tag: W.nullable(),
			itemClass: O()
		})),
		forbidden: M(N({
			tag: W.nullable(),
			itemClass: O()
		})),
		descriptions: M(O()),
		effects: M(W),
		randomOutcomes: M(W),
		lucky: j(),
		quality: j(),
		mirrored: j(),
		whiteSockets: j(),
		corruptedEssenceChance: G.min(0).max(100)
	})),
	harvest: M(N({
		id: W,
		name: O(),
		command: O(),
		parameters: O(),
		enchantment: N({
			mod: W,
			itemClasses: M(W).min(1)
		}).nullable(),
		affinityMultiplier: A().finite().positive().nullable(),
		influenceRerollClasses: M(W).min(1).nullable(),
		lifeforceType: G,
		lifeforce: G.nonnegative(),
		sacred: G.nonnegative(),
		gameMode: G.nullable()
	})),
	beasts: M(N({
		id: W,
		category: O(),
		description: O(),
		notes: O(),
		components: M(N({
			id: W,
			level: G
		})),
		mod: W.nullable(),
		aspectMod: W.nullable(),
		metamods: M(W),
		augmentation: Fa([N({ influence: G.min(0).max(5) }), N({ itemClass: W })]).nullable(),
		mapCorruption: L(["implicit", "twice"]).nullable(),
		maximumSockets: j(),
		maximumLinks: j(),
		talismanCraft: Fa([R("imprint"), N({
			fractures: G.min(1).max(2),
			minimumMods: G.positive()
		})]).nullable(),
		gameMode: G.nullable()
	}))
}), vs = {
	min: 78,
	max: 122
};
function ys(e, t) {
	return !!(e.game === "poe1" && e.crafting.locus && e.crafting.classes[e.bases[t.baseId].item_class]?.doubleCorrupt);
}
function bs(e, t, n) {
	let r = e.crafting.currencies.find((e) => e.action === n);
	return !!(r && e.crafting.templeCorruption?.currencies.find((e) => e.id === r.id)?.itemClasses.includes(e.bases[t.baseId].item_class));
}
function xs(e, t) {
	return bs(e, t, "incursion_corrupt_tablet");
}
function Ss(e, t, n, r) {
	let i = e.mods[n].stats[r], a = t.corrupted && xs(e, t) && e.bases[t.baseId].implicits[0] === n && r === 0;
	return {
		min: i.min,
		max: i.max + (a ? 10 : 0)
	};
}
function Cs(e, t) {
	let n = e.bases[t.baseId];
	return e.game === "poe2" && n.item_class === "Jewel" && e.crafting.classes[n.item_class]?.corrupt;
}
//#endregion
//#region app/schemas/crafting.ts
var ws = Xo.pick({
	armour: !0,
	evasion: !0,
	energy_shield: !0,
	ward: !0
}).strip(), Ts = ws.keyof(), Es = Ha(Ts, Ko.shape.min.nonnegative()), Ds = Xo.pick({
	attack_time: !0,
	reload_time: !0,
	critical_strike_chance: !0,
	physical_damage_min: !0,
	physical_damage_max: !0,
	block: !0
}).strip(), Os = Xo.pick({
	charges_max: !0,
	charges_per_use: !0,
	duration: !0,
	life_per_use: !0,
	mana_per_use: !0
}).strip(), ks = L([
	"elementalResistance",
	"totalResistance",
	"flatLife"
]), As = L([
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
	...ks.options
]), js = Zo.pick({
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
	strongbox: R(!0).optional(),
	levelRules: N({
		inventory_type: O().nullable().default(null),
		no_level_requirement: L(["true", "false"]).default("false")
	}).prefault({}),
	defences: ws,
	combat: Ds.prefault({}),
	flask: Os.prefault({}),
	rarities: M(L([
		"normal",
		"magic",
		"rare"
	])),
	corrupted: j(),
	initialSockets: _s.shape.baseRules.valueType.shape.initialSockets,
	socketInfo: M(N({
		count: A().int().min(0).max(6),
		level: A().int().nonnegative(),
		weight: A().int().nonnegative()
	})).default([])
}), Ms = Yo.omit({
	grants_effects: !0,
	gold_value: !0
}).strip(), Ns = N({
	format: R(1),
	game: L(["poe1", "poe2"]),
	patch: O(),
	manifestSha256: O().regex(/^[a-f0-9]{64}$/),
	craftingSha256: O().regex(/^[a-f0-9]{64}$/),
	bases: I(O(), js),
	mods: I(O(), Ms),
	crafting: _s
}), K = O().min(1), Ps = A().int().min(1).max(100), Fs = A().int().min(0).max(200), Is = A().int().min(0).max(100), Ls = N({ intentions: A().int().nonnegative() }), Rs = A().int().min(0).max(200), zs = N({
	id: K,
	quality: Fs
}), Bs = M(A().int().min(0).max(5)).max(6).refine((e) => new Set(e).size === e.length, "Influences must be unique."), Vs = N({
	id: K,
	essence: R(!0).optional(),
	values: M(A().int()),
	fractured: j().default(!1),
	crafted: j().default(!1),
	desecrated: R(!0).optional(),
	sanctification: A().int().positive().optional(),
	corruptionScale: A().int().min(vs.min).max(vs.max).optional(),
	grantedPassive: K.optional(),
	attributeSource: K.optional(),
	conversion: N({
		source: K,
		steps: M(N({
			socket: A().int().min(0).max(6),
			order: A().int().min(0).max(6)
		})).min(1).max(7)
	}).optional(),
	origin: F("kind", [
		N({
			kind: R("awakener"),
			level: Ps
		}),
		N({
			kind: R("recombine"),
			level: Ps
		}),
		N({
			kind: R("beast"),
			level: Ps,
			recipe: K
		})
	]).optional()
}).meta({ id: "CraftingRolledModifier" }), Hs = N({
	baseId: K,
	level: Ps,
	rarity: L([
		"normal",
		"magic",
		"rare"
	]),
	unidentified: R(!0).optional(),
	influences: Bs.max(2).default([]),
	mods: M(Vs).max(9),
	implicits: M(Vs).max(6),
	implicitCraft: N({
		currency: K,
		level: Ps,
		removed: M(K).max(6)
	}).optional(),
	anointments: M(K).max(9).optional(),
	blight: K.optional(),
	cluster: N({
		passive: K,
		nodes: A().int().positive().optional(),
		jewelSockets: A().int().nonnegative().optional()
	}).optional(),
	enchantments: M(Vs).max(1).optional(),
	corrupted: j().default(!1),
	corruptedBy: K.optional(),
	destroyed: R(!0).optional(),
	destroyedBy: K.optional(),
	twiceCorrupted: R(!0).optional(),
	mirrored: j().default(!1),
	split: j().optional(),
	sanctified: j().optional(),
	putrefied: R(!0).optional(),
	quality: Rs.default(0),
	baseDefences: Es.optional(),
	mapQuality: K.optional(),
	sockets: A().int().min(0).max(7).optional(),
	socketLinks: M(j().nullable()).min(1).max(5).optional(),
	augments: M(K).max(7).optional(),
	jewelSocket: K.optional(),
	catalyst: zs.optional(),
	memoryStrands: Is.optional(),
	intangibility: _s.shape.allflame.unwrap().shape.currencies.element.shape.intangibility.shape.max.optional(),
	allflameCrafted: R(!0).optional(),
	memoryMap: Ls.optional()
}), Us = Hs.extend({ socketedJewel: Hs.strict().optional() }), Ws = Hs.extend({ reveal: N({
	mod: K,
	source: K,
	mark: K.optional(),
	index: A().int().min(0).max(5).optional(),
	choices: M(K).max(3),
	offeredOn: Us.optional(),
	omens: M(K).max(4).optional(),
	echoes: N({
		omen: K,
		remaining: Fa([R(0), R(1)])
	}).optional()
}).optional() }).meta({ id: "CraftingItemCore" }), q = Ws.extend({ socketedJewel: Ws.strict().optional() }).meta({ id: "CraftingItemState" });
Ws.pick({
	corrupted: !0,
	mirrored: !0,
	split: !0,
	sanctified: !0
}).keyof();
var Gs = q.extend({
	imprint: q.optional(),
	allflameCopies: M(q).min(1).max(4).optional(),
	allflameCost: _s.shape.bench.element.shape.cost.min(1).optional()
}).meta({ id: "CraftingItem" }), Ks = O().trim().min(1).max(60).refine((e) => e !== "Unfiled", "Unfiled is reserved for items without a tab."), qs = N({
	id: K,
	name: O().min(1).max(100),
	item: Gs,
	tab: Ks.optional()
}), Js = N({
	kind: R("fossils"),
	allflame: R(!0).optional(),
	tangled: K.optional(),
	ids: M(K).min(1).max(4),
	resonator: K,
	logic: L(["additive", "multiplicative"]).default("additive")
}), Ys = vo((t, n) => t && typeof t == "object" && "allflame" in t && t.allflame !== void 0 && (!("kind" in t) || ![
	"currency",
	"essence",
	"fossils"
].includes(String(t.kind))) ? (n.issues.push({
	code: "custom",
	message: "Allflame requires an eligible itemized currency, essence or resonator.",
	input: t
}), e) : t, F("kind", [
	N({
		kind: R("genesis"),
		id: R("genesis"),
		nodes: M(K).max(100).default([])
	}),
	N({
		kind: R("generate"),
		id: q.shape.rarity,
		breachRings: Fa([R("legacy"), I(L([
			"Xoph",
			"Tul",
			"Esh",
			"Uul-Netol",
			"Chayula"
		]), A().int().min(0).max(60))]).optional()
	}),
	N({
		kind: R("socket_jewel"),
		id: R("socket_jewel"),
		jewel: qs.optional()
	}),
	N({
		kind: R("remove_jewel"),
		id: R("remove_jewel")
	}),
	N({
		kind: R("recombine"),
		id: R("recombine"),
		donor: qs.optional()
	}),
	N({
		kind: R("currency"),
		id: K,
		allflame: R(!0).optional(),
		omens: M(K).max(4).optional(),
		donor: qs.optional()
	}),
	N({
		kind: R("essence"),
		id: K,
		omens: M(K).max(4).optional(),
		allflame: R(!0).optional()
	}),
	N({
		kind: R("bench"),
		id: K,
		skipOnConflict: j().optional()
	}),
	N({
		kind: R("augment"),
		id: K,
		replace: A().int().min(0).max(6).optional()
	}),
	N({
		kind: R("upgrade_augment"),
		id: K,
		socket: A().int().min(0).max(6).default(0)
	}),
	N({
		kind: R("locus"),
		id: K
	}),
	N({
		kind: R("anoint"),
		id: K,
		additional: M(K).max(8).optional(),
		oils: M(K).max(2).optional()
	}),
	Js,
	N({
		kind: R("harvest"),
		id: K
	}),
	N({
		kind: R("beast"),
		id: K,
		level: Ps.optional()
	}),
	N({
		kind: R("reveal"),
		preferred: M(K).max(100).default([]),
		skipOnMiss: j().optional(),
		omens: M(K).max(4).optional()
	})
])).meta({ id: "CraftingMethod" }), Xs = N({
	min: A().int().min(0).max(9),
	max: A().int().min(0).max(9)
}).refine((e) => e.min <= e.max, "Minimum affix count exceeds maximum."), Zs = Xs.refine((e) => e.max <= 6, "Maximum affix count exceeds six."), Qs = N({
	id: K,
	scope: L([
		"all",
		"explicit",
		"implicit"
	]).default("all"),
	min: A().int().optional(),
	max: A().int().optional()
}).refine((e) => e.min !== void 0 || e.max !== void 0, "Choose a minimum or maximum stat value.").refine((e) => e.min === void 0 || e.max === void 0 || e.min <= e.max, "Minimum stat value exceeds maximum."), $s = N({
	groups: M(N({
		mods: M(K).min(1).max(100),
		minimum: A().int().min(1).max(9).default(1),
		fractured: j().optional(),
		negated: j().optional()
	})).max(12),
	minimumGroups: A().int().min(0).max(12).default(0),
	openPrefixes: A().int().min(0).max(6).default(0),
	openSuffixes: A().int().min(0).max(6).default(0),
	openAffixes: A().int().min(0).max(9).optional(),
	rarity: q.shape.rarity.optional(),
	corrupted: q.shape.corrupted.unwrap().optional(),
	mirrored: q.shape.mirrored.unwrap().optional(),
	split: q.shape.split,
	sanctified: q.shape.sanctified,
	jewelSocket: j().optional(),
	socketedJewel: j().optional(),
	baseDefences: Ha(Ts, Ko.refine((e) => e.min >= 0, "Base defence requirements cannot be negative.")).optional(),
	properties: Ha(As, N({
		min: A().finite().optional(),
		max: A().finite().optional()
	}).refine((e) => e.min !== void 0 || e.max !== void 0, "Choose a minimum or maximum item property value.").refine((e) => e.min === void 0 || e.max === void 0 || e.min <= e.max, "Minimum item property value exceeds maximum.")).refine((e) => Object.entries(e).every(([e, t]) => ks.options.some((t) => t === e) || (t.min === void 0 || t.min >= 0) && (t.max === void 0 || t.max >= 0)), "Only resistance and flat-life requirements can be negative.").optional(),
	mapTier: N({
		min: _s.shape.maps.element.shape.tier.positive(),
		max: _s.shape.maps.element.shape.tier.positive()
	}).refine((e) => e.min <= e.max, "Minimum map tier exceeds maximum.").optional(),
	waystoneTier: N({
		min: _s.shape.waystones.element.shape.tier,
		max: _s.shape.waystones.element.shape.tier
	}).refine((e) => e.min <= e.max, "Minimum Waystone tier exceeds maximum.").optional(),
	sockets: N({
		min: q.shape.sockets.unwrap(),
		max: q.shape.sockets.unwrap()
	}).refine((e) => e.min <= e.max, "Minimum socket count exceeds maximum.").optional(),
	linkedSockets: N({
		min: q.shape.sockets.unwrap().max(6),
		max: q.shape.sockets.unwrap().max(6)
	}).refine((e) => e.min <= e.max, "Minimum linked sockets exceeds maximum.").optional(),
	quality: N({
		min: Rs,
		max: Rs,
		mapType: q.shape.mapQuality
	}).refine((e) => e.min <= e.max, "Minimum base quality exceeds maximum.").optional(),
	memoryStrands: N({
		min: Is,
		max: Is
	}).refine((e) => e.min <= e.max, "Minimum memory strands exceeds maximum.").optional(),
	intangibility: N({
		min: q.shape.intangibility.unwrap(),
		max: q.shape.intangibility.unwrap()
	}).refine((e) => e.min <= e.max, "Minimum intangibility exceeds maximum.").optional(),
	intentions: N({
		min: Ls.shape.intentions,
		max: Ls.shape.intentions
	}).refine((e) => e.min <= e.max, "Minimum Intention uses exceeds maximum.").optional(),
	catalyst: zs.pick({ id: !0 }).partial().extend({
		min: Fs,
		max: Fs
	}).refine((e) => e.min <= e.max, "Minimum catalyst quality exceeds maximum.").optional(),
	influences: Bs.optional(),
	affixCount: Xs.optional(),
	prefixCount: Zs.optional(),
	suffixCount: Zs.optional(),
	unrevealedCount: Zs.optional(),
	anointments: M(K).max(9).optional(),
	enchantments: M(K).max(1).optional(),
	grantedPassives: M(K).max(1).optional(),
	stats: M(Qs).max(12).refine((e) => new Set(e.map((e) => e.id)).size === e.length, "Choose each target stat only once.").optional()
});
function ec(e) {
	return $s.extend({ expression: e ? N({
		operator: L(["and", "or"]),
		negated: j().optional(),
		operands: M(ec(e - 1)).min(1).max(12)
	}).optional() : ja({ error: "Requirements exceed the maximum nesting depth." }).meta({
		type: "object",
		not: {}
	}).optional() });
}
var tc = ec(8).refine((e) => {
	let t = [e];
	for (let e = 0; e < t.length; e++) {
		if (t.length > 64) return !1;
		t.push(...t[e].expression?.operands ?? []);
	}
	return !0;
}, "Requirements cannot exceed 64 condition nodes."), nc = N({
	id: K.refine((e) => e !== "fail", "The fallback route ID is reserved."),
	condition: tc,
	destination: K
}), rc = N({
	id: K,
	name: O().max(120).optional(),
	description: O().max(1e3).optional(),
	position: N({
		x: A().finite(),
		y: A().finite()
	}).optional(),
	method: Ys.optional(),
	condition: tc,
	onSuccess: O().default("success"),
	onFailure: O().default("failure"),
	branches: M(nc).max(12).refine((e) => new Set(e.map((e) => e.id)).size === e.length, "Route IDs must be unique within a step.").optional()
});
N({
	format: R(1),
	game: L(["poe1", "poe2"]),
	patch: O(),
	item: Gs,
	inventory: M(qs).max(100).default([]),
	inventoryTabs: M(Ks).max(20).refine((e) => new Set(e).size === e.length, "Inventory tab names must be unique.").optional(),
	target: tc,
	method: Ys,
	steps: M(rc).max(50),
	useProcess: j().default(!1),
	baseCost: A().finite().nonnegative().optional(),
	prices: I(O(), A().finite().nonnegative()),
	seed: A().int().min(0).max(4294967295),
	iterations: A().int().min(1).max(1e6),
	simulationLimit: F("kind", [N({
		kind: L(["successes", "actions"]),
		count: A().int().min(1).max(1e6)
	}), N({ kind: R("manual") })]).optional(),
	sampleStorage: N({
		mode: L([
			"all",
			"successes",
			"none"
		]),
		limit: A().int().min(1).max(1e3)
	}).optional(),
	successDistribution: j().optional(),
	maxActions: A().int().min(1).max(1e4)
}).pick({
	format: !0,
	game: !0,
	patch: !0,
	inventory: !0,
	inventoryTabs: !0
});
//#endregion
//#region app/lib/crafting-allflame.ts
var ic = /* @__PURE__ */ new Set([
	"reset_ghostliness_or_delete",
	"split_to_single_explicit",
	"reroll_rare_infamous",
	"add_deepwater_hazard_belt_mod",
	"add_pantheon_aspect",
	"reroll_single_attribute_modifier",
	"add_mod_and_corrupt_rare_abyss_jewel",
	"add_eldritch_implicit_amulet"
]);
function ac(e) {
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
function oc(e, t, n) {
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
function sc(e) {
	return "allflame" in e && e.allflame === !0;
}
function cc(e, t) {
	let n = t.kind === "fossils" ? t.resonator : t.kind === "currency" || t.kind === "essence" ? t.id : void 0;
	return e.crafting.allflame?.currencies.filter((e) => e.currency === n).sort((e, t) => t.tier - e.tier)[0];
}
function lc(e, t, n) {
	let r = e.crafting.allflame, i = cc(e, n), a = e.bases[t.baseId]?.item_class, o = r?.classes.find((e) => e.itemClass === a), s = r?.levels.find((e) => e.level === t.level);
	if (!r || !i || !o || !s) return null;
	let c = Math.round(i.sulphurCost * o.costPercent / 100 * (o.levelScaling ? 1 + s.costIncreasePercent / 100 : 1));
	return {
		bracket: i,
		sulphur: r.sulphur,
		amount: c
	};
}
//#endregion
//#region app/lib/crafting-heist.ts
var uc = /* @__PURE__ */ new WeakMap();
function dc(e, t) {
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
function fc(e, t) {
	if (e.game !== "poe1") return [];
	let n = uc.get(e);
	if (!n) {
		let t = [...new Set(Object.values(e.bases).filter((e) => e.tags.includes("weapon")).map((e) => e.item_class))];
		n = Object.entries(e.mods).flatMap(([e, n]) => {
			let r = dc(e, n);
			return r ? [{
				mod: e,
				itemClasses: r === "weapon" ? t : ["Body Armour"],
				recipe: r === "weapon" ? "Tempering Orb" : "Tailoring Orb"
			}] : [];
		}), uc.set(e, n);
	}
	return t ? n.filter((n) => n.itemClasses.includes(e.bases[t.baseId].item_class) && e.mods[n.mod].required_level <= t.level) : n;
}
function pc(e, t, n) {
	return (t.enchantments ?? []).reduce((t, r) => t + (e.mods[r.id]?.stats ?? []).reduce((e, t, i) => e + (t.id === n ? r.values[i] : 0), 0), 0);
}
function mc(e, t, n) {
	return e.game !== "poe1" || !["prefix", "suffix"].includes(n.generation_type) ? 0 : n.implicit_tags.reduce((n, r) => n + pc(e, t, `heist_enchantment_${r === "defences" ? "defence" : r === "caster_damage" ? "casterdamage" : r}_mod_effect_+%`), 0);
}
//#endregion
//#region app/lib/crafting-sockets.ts
var hc = /* @__PURE__ */ new Map([
	["local_item_benefit_socketable_as_if_helmet", "Helmet"],
	["local_item_benefit_socketable_as_if_body_armour", "Body Armour"],
	["local_item_benefit_socketable_as_if_gloves", "Gloves"],
	["local_item_benefit_socketable_as_if_boots", "Boots"],
	["local_item_benefit_socketable_as_if_shield", "Shield"]
]);
function gc(e, t) {
	if (e.game !== "poe2" || t.jewelSocket) return 0;
	let n = e.bases[t.baseId];
	return Math.max(n.initialSockets, ...n.implicits.flatMap((t) => e.mods[t].stats.filter((e) => e.id === "local_has_X_sockets").map((e) => e.min)));
}
function _c(e, t) {
	let n = e.bases[t.baseId], r = n.item_class, i = [
		...n.initialSockets ? n.implicits.map((t) => ({
			id: t,
			values: e.mods[t].stats.map((e) => e.min)
		})) : [],
		...t.implicits,
		...t.mods
	];
	for (let t of i) for (let [n, i] of (e.mods[t.id]?.stats ?? []).entries()) t.values[n] && hc.has(i.id) && (r = hc.get(i.id));
	return r;
}
function vc(e, t) {
	return e.game === "poe1" && [...t.implicits, ...t.mods].some((t) => e.mods[t.id].stats.some((e, n) => e.id === "local_has_X_abyss_sockets" && t.values[n] > 0));
}
function yc(e, t, n = 100) {
	if (t.jewelSocket) return 0;
	let r = e.bases[t.baseId].socketInfo.filter((e) => e.weight > 0), i = gc(e, t), a = Math.max(i, ...r.map((e) => e.count)), o = Math.max(i, ...r.filter((e) => e.level <= n).map((e) => e.count));
	return Math.max(0, Math.min(o, a + pc(e, t, "local_maximum_sockets_+")));
}
function bc(e, t) {
	let n = yc(e, t);
	if (e.game !== "poe2") return n;
	let r = e.bases[t.baseId];
	return Math.min(r.inventory_width * r.inventory_height, n + (n > 0 && t.corrupted ? 1 : 0));
}
function xc(e, t, n) {
	return !!(e.game === "poe1" && !vc(e, t) && (n.socketCount || n.linkCount) && n.itemClasses.includes(e.bases[t.baseId].item_class) && (n.socketCount ? n.socketCount <= yc(e, t) : n.linkCount <= (t.sockets ?? 0)));
}
function Sc(e, t) {
	if (t.socketLinks && (e.game !== "poe1" || vc(e, t) || t.socketLinks.length !== (t.sockets ?? 0) - 1)) throw Error("Socket links require one connection per adjacent pair of ordinary PoE 1 gem sockets.");
}
function Cc(e) {
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
function wc(e, t) {
	if (!t.linkedSockets) return !0;
	let n = Cc(e), r = t.linkedSockets;
	if (n.min >= r.min && n.max <= r.max) return !0;
	if (n.max < r.min || n.min > r.max) return !1;
	throw Error("Socket links are not fully known. Set the starting links or use a craft that guarantees this requirement; remaining-link probabilities are unavailable.");
}
function Tc(e, t) {
	e.sockets = t, delete e.socketLinks;
}
function Ec(e, t) {
	e.socketLinks = Array.from({ length: e.sockets - 1 }, (e, n) => n < t - 1 || n !== t - 1 && null);
}
var Dc = /* @__PURE__ */ new WeakMap();
function Oc(e) {
	let t = Dc.get(e);
	if (t) return t;
	let n = e.game === "poe2" ? Object.fromEntries([...Object.entries(e.crafting.anointing.passives).filter(([, e]) => e.notable), ...Object.entries(e.crafting.passiveTree?.notables ?? {}).filter(([, e]) => !e.ascendancy && !e.visibleForAscendancy)]) : {};
	return Dc.set(e, n), n;
}
function kc(e, t) {
	let n = Oc(e)[t];
	if (!n) throw Error("Unknown allocated notable passive in this build.");
	return n;
}
function Ac(e, t) {
	if (e.game !== "poe2") return;
	let n = e.bases[t.baseId]?.item_class;
	return e.crafting.poe2Essences.flatMap((e) => e.rules).find((t) => t.itemClasses.includes(n) && t.mod && e.mods[t.mod]?.stats.some((e) => e.id === "mod_granted_passive_hash_essence"))?.mod ?? void 0;
}
//#endregion
//#region app/lib/crafting-quality.ts
function jc(e, t) {
	let n = e.bases[t.baseId].item_class;
	return e.crafting.catalysts.filter((e) => e.itemClasses.includes(n));
}
function Mc(e, t) {
	let n = e.bases[t.baseId].item_class;
	return e.crafting.baseQuality.filter((t) => t.itemClasses.includes(n) && (e.game === "poe1" || !t.corrupted));
}
function Nc(e, t) {
	if (e.game !== "poe1") return [];
	let n = e.bases[t.baseId].item_class;
	return e.crafting.mapQuality.filter((e) => e.itemClasses.includes(n));
}
function Pc(e, t) {
	return Nc(e, t).find((e) => t.mapQuality ? e.id === t.mapQuality : e.stats.includes("map_item_drop_quantity_+%"));
}
function Fc(e) {
	return e.rarity === "normal" ? 5 : e.rarity === "magic" ? 2 : 1;
}
function Ic(e, t, n) {
	let r = e.crafting.baseQuality.find((e) => e.id === n);
	return r.corrupted ? Array.from({ length: r.maximumQuality + 1 }, (e, t) => ({
		value: t,
		weight: 1
	})) : Gc(e, t, r.maximumQuality);
}
function Lc(e, t) {
	let n = Mc(e, t).find((e) => !e.corrupted)?.maximumQuality ?? 0;
	if (e.game !== "poe2") return n;
	let r = 0;
	for (let i of t.augments ?? []) {
		let a = sl(e, t, i);
		n = a.get("local_maximum_quality_is_%") ?? n, r += a.get("local_maximum_quality_+") ?? 0;
	}
	return n + r;
}
function Rc(e, t) {
	if (e.game === "poe1") return t.corrupted && e.bases[t.baseId].domain === "flask" ? 40 : 30;
	let n = zc(e, t).find((e) => e.qualityType === "base")?.extraMaximumQuality ?? 0, r = Math.max(30, Lc(e, t) + n), i = e.bases[t.baseId].item_class;
	for (let a of e.crafting.augments) {
		if (!Y(e, t, a)?.stats.some((e) => e.id === "local_maximum_quality_is_%")) continue;
		let o = {
			...t,
			augments: [a.id]
		};
		r = Math.max(r, Lc(e, o) + n);
		for (let s of e.crafting.poe2Essences) for (let c of s.rules) {
			if (!c.mod || !c.itemClasses.includes(i)) continue;
			let s = e.mods[c.mod];
			s.stats.some((e) => e.id === a.type.effectStat || e.id === "local_socketed_items_effect_+%") && (r = Math.max(r, Lc(e, {
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
function zc(e, t) {
	if (e.game !== "poe2") return [];
	let n = e.bases[t.baseId].item_class;
	return e.crafting.qualityInfusers.filter((e) => e.itemClasses.includes(n));
}
function Bc(e, t, n) {
	let r = zc(e, t).find((e) => e.id === n);
	if (!r) return;
	let i = r.qualityType === "catalyst" ? jc(e, t)[0].maximumQuality : Mc(e, t).find((e) => !e.corrupted).maximumQuality, a = r.qualityType === "catalyst" ? Vc(e, t) : Lc(e, t), o = r.qualityType === "catalyst" ? t.catalyst?.quality ?? 0 : t.quality;
	return {
		recipe: r,
		quality: o,
		maximum: a,
		limit: a + r.extraMaximumQuality,
		increments: Gc(e, t, i),
		corruptionChance: Math.min(100, Math.max(0, 5 * (o - a)))
	};
}
function Vc(e, t) {
	let n = jc(e, t)[0]?.maximumQuality ?? 0, r = 0;
	for (let i of [...t.implicits, ...t.mods]) for (let [t, a] of e.mods[i.id].stats.entries()) {
		let e = Math.round(i.values[t] * (i.sanctification ?? i.corruptionScale ?? 100) / 100);
		a.id === "local_maximum_quality_is_%" && (n = e), a.id === "local_maximum_quality_+" && (r += e);
	}
	return n + r;
}
function Hc(e, t) {
	return Gc(e, t, e.crafting.catalysts[0]?.maximumQuality ?? 0);
}
function Uc(e, t, n) {
	if (e.game !== "poe1") return [];
	let r = e.crafting.taintedCatalysts.find((e) => e.id === n);
	return r?.itemClasses.includes(e.bases[t.baseId].item_class) ? jc(e, t).flatMap((e) => Array.from({ length: r.maximumQuality }, (t, n) => ({
		value: {
			id: e.id,
			quality: n + 1
		},
		weight: 1
	}))) : [];
}
function Wc(e, t) {
	if (e.game !== "poe2" || !t.catalyst?.quality) return 1;
	let n = e.crafting.catalysts.find((e) => e.id === t.catalyst.id).maximumQuality, r = t.catalyst.quality;
	return 1 + (20 * Math.min(r, n) + 12 * Math.max(0, r - n)) / 100;
}
function Gc(e, t, n) {
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
function Kc(e, t) {
	if (e.game !== "poe2") return Vc(e, t);
	let n = {
		...t,
		implicits: [...t.implicits, ...e.bases[t.baseId].implicits.filter((n) => !t.implicits.some((e) => e.id === n) && e.mods[n].stats.some((e) => ["local_maximum_quality_+", "local_maximum_quality_is_%"].includes(e.id))).map((t) => ({
			id: t,
			values: e.mods[t].stats.map((e) => e.max),
			crafted: !1,
			fractured: !1
		}))]
	}, r = Vc(e, n), i = e.bases[t.baseId].item_class, a = e.crafting.poe2Essences.flatMap((r) => r.rules.flatMap((r) => {
		if (!r.mod || !r.itemClasses.includes(i)) return [];
		let a = e.mods[r.mod];
		return a.stats.some((e) => e.id === "local_maximum_quality_+") ? Vc(e, {
			...n,
			mods: [...t.mods.filter((t) => !e.mods[t.id].groups.some((e) => a.groups.includes(e))), {
				id: r.mod,
				values: a.stats.map((e) => e.max),
				crafted: !0,
				fractured: !1
			}]
		}) : [];
	})), o = zc(e, t).find((e) => e.qualityType === "catalyst");
	return Math.max(r, ...a) + (o?.extraMaximumQuality ?? 0);
}
function qc(e, t, n) {
	if (!t.catalyst) return 0;
	let r = e.crafting.catalysts.find((e) => e.id === t.catalyst.id), i = e.mods[n];
	return !r || (["prefix", "suffix"].includes(i.generation_type) ? !r.explicit : !r.implicit) || (r.prefix || r.suffix) && (i.generation_type === "prefix" ? !r.prefix : !r.suffix) || r.tags.length && !r.tags.some((e) => i.implicit_tags.includes(e)) ? 0 : t.catalyst.quality;
}
//#endregion
//#region app/lib/crafting-text.ts
function Jc(e) {
	return e.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
}
var Yc = {
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
function Xc(e, t, n) {
	let r = e.mods[n], i = qc(e, t, n), a = r.generation_type, o = a === "prefix" || a === "suffix", s = /* @__PURE__ */ new Set([...o ? Yc[a] : [], ...e.crafting.taggedModifierEffects.filter((e) => (o ? e.explicit : e.implicit) && (!(e.prefix || e.suffix) || (a === "prefix" ? e.prefix : e.suffix)) && e.tags.some((e) => r.implicit_tags.includes(e))).map((e) => e.stat)]);
	return i + mc(e, t, r) + [...t.implicits, ...t.mods].reduce((t, n) => t + e.mods[n.id].stats.reduce((e, t, r) => e + (s.has(t.id) ? Math.round(n.values[r] * (n.sanctification ?? n.corruptionScale ?? 100) / 100) : 0), 0), 0);
}
function Zc(e, t, n) {
	let r = n ? Xc(e, n, t.id) : 0;
	return e.mods[t.id].stats.map((n, i) => {
		let a = Math.round(t.values[i] * (t.sanctification ?? t.corruptionScale ?? 100) / 100);
		return r && e.crafting.scalableStats.includes(n.id) ? Math.trunc(a * (100 + r) / 100) : a;
	});
}
//#endregion
//#region app/lib/crafting-augments.ts
function J(e, t) {
	let n = e.crafting.augments.find((e) => e.id === t);
	if (!n || e.game !== "poe2") throw Error("Unknown socketable augment.");
	return n;
}
function Qc(e) {
	return e.rules.some((e) => e.stats.length > 0) && !e.rules.some((e) => e.stats.some((e) => /^dummy_display_stat_rune_(?!(?:(?:fire|cold|lightning|chaos)_convert|create_jewel_socket)$)/.test(e.id)));
}
function Y(e, t, n) {
	let r = e.bases[t.baseId];
	if (!r || e.game !== "poe2" || [
		"Ring",
		"Amulet",
		"Belt"
	].includes(r.item_class) && !n.jewellery) return;
	let i = _c(e, t), a = {
		classes: 0,
		martial: 1,
		armour: 2,
		all: 3
	};
	return n.rules.filter((e) => e.stats.length && e.itemClasses.includes(i)).sort((e, t) => a[e.scope] - a[t.scope])[0];
}
function $c(e, t) {
	return yc(e, t) ? e.crafting.augments.filter((n) => Qc(n) && Y(e, t, n)?.stats.length) : [];
}
function el(e) {
	return e.rules.some((e) => e.stats.some((e) => e.id === "dummy_display_stat_rune_upgrade" && e.min > 0));
}
function tl(e) {
	return e.rules.some((e) => e.stats.some((e) => e.id === "dummy_display_stat_rune_create_jewel_socket" && e.min > 0));
}
function nl(e, t, n, r) {
	let i = J(e, n);
	if (!el(i) || !Y(e, t, i)) throw Error("This augment cannot upgrade Runes on this item.");
	if ((t.corrupted || t.sanctified) && !i.corruptedSanctified) throw Error("This augment cannot be used on a corrupted or Sanctified item.");
	let a = t.augments?.[r];
	if (!a) throw Error("Choose an occupied Rune socket to upgrade.");
	let o = J(e, a);
	if (o.type.socketedStat !== "num_socketed_runes" || !o.higherTier) throw Error("This socketed augment has no higher Rune tier in this build.");
	return il(e, t, o.higherTier, r);
}
function rl(e, t) {
	if (t.jewelSocket) {
		let n = J(e, t.jewelSocket);
		if (!tl(n) || !Y(e, t, n)) throw Error("This item has no valid extracted Jewel socket conversion.");
		if (t.sockets || t.augments?.length) throw Error("A converted Jewel socket cannot coexist with augment sockets.");
	}
	if ((t.augments?.length ?? 0) > (t.sockets ?? 0)) throw Error("Socketed augments exceed the item's socket count.");
	for (let n of t.augments ?? []) {
		let r = J(e, n);
		if (!Qc(r)) throw Error("This augment has a special crafting effect that is not supported yet.");
		if (tl(r)) throw Error("This augment creates a Jewel socket and cannot remain socketed.");
		if (!Y(e, t, r)?.stats.length) throw Error("This augment has no effect for this item class.");
		if (r.limit && t.augments.filter((t) => r.limit.text ? J(e, t).limit?.id === r.limit.id : t === r.id).length > r.limit.amount) throw Error(`${r.name} exceeds its extracted augment limit of ${r.limit.amount}.`);
	}
}
function il(e, t, n, r) {
	let i = J(e, n);
	if ((t.corrupted || t.sanctified) && !i.corruptedSanctified) throw Error("This augment cannot be socketed into a corrupted or Sanctified item.");
	if (t.jewelSocket) throw Error("A converted Jewel socket cannot receive augments or become augment sockets.");
	if (!Y(e, t, i)?.stats.length) throw Error("This augment has no effect for this item class.");
	if (tl(i) && t.augments?.some((t) => J(e, t).socketBound)) throw Error("A Jewel socket conversion cannot destroy socket-bound augments.");
	let a = [...t.augments ?? []];
	if (r !== void 0) {
		let t = a[r];
		if (!t) throw Error("Choose an occupied augment socket to replace.");
		if (J(e, t).socketBound) throw Error("A socket-bound augment cannot be replaced.");
		a[r] = n;
	} else {
		if (a.length >= (t.sockets ?? 0)) throw Error("Add an empty augment socket or choose an augment to replace.");
		a.push(n);
	}
	let o = tl(i) ? {
		...t,
		sockets: 0,
		augments: [],
		jewelSocket: i.id
	} : {
		...t,
		augments: a
	};
	return rl(e, o), o;
}
function al(e, t, n) {
	return n.type.socketedStat === "num_socketed_idols" && (t.augments ?? []).some((n) => Y(e, t, J(e, n))?.stats.some((e) => e.id === "local_idols_gain_additional_socketable_mods" && e.min > 0));
}
function ol(e, t, n, r) {
	let i = [...t.mods, ...t.implicits].reduce((t, r) => t + (e.mods[r.id]?.stats ?? []).reduce((e, t, i) => e + (t.id === n.type.effectStat || t.id === "local_socketed_items_effect_+%" ? Math.round(r.values[i] * (r.sanctification ?? r.corruptionScale ?? 100) / 100) : 0), 0), 0), a = (t.augments ?? []).reduce((r, i) => r + (Y(e, t, J(e, i))?.stats ?? []).reduce((e, t) => e + (t.id === n.type.effectStat || t.id === "local_socketed_items_effect_+%" ? t.min : 0), 0), 0);
	return new Map(r.map((t) => [t.id, e.crafting.scalableStats.includes(t.id) ? Math.trunc(t.min * (100 + i + a) / 100) : t.min]));
}
function sl(e, t, n) {
	let r = J(e, n), i = Y(e, t, r);
	if (!i) return /* @__PURE__ */ new Map();
	let a = ol(e, t, r, i.stats);
	if (al(e, t, r)) for (let [n, o] of ol(e, t, r, i.bondedStats)) a.set(n, (a.get(n) ?? 0) + o);
	return a;
}
function cl(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of t.augments ?? []) {
		for (let [i, a] of sl(e, t, r)) n.set(i, (n.get(i) ?? 0) + a);
		let i = J(e, r).type.socketedStat;
		n.set(i, (n.get(i) ?? 0) + 1);
	}
	return n;
}
function ll(e, t) {
	return [...cl(e, t)].flatMap(([t, n]) => n > 0 && e.crafting.augmentTags[t] ? [e.crafting.augmentTags[t]] : []);
}
//#endregion
//#region app/lib/crafting-anointing.ts
function ul(e, t) {
	return e.crafting.anointing.maps.find((e) => e.mod === t.blight);
}
function dl(e) {
	return [e.id, ...e.additional ?? []];
}
function fl(e) {
	return e.crafting.anointing.maps.find((e) => !e.ravaged)?.maximumAnointments ?? 0;
}
function pl(e, t) {
	let n = ul(e, t);
	if (t.blight && (!n || e.game !== "poe1" || e.bases[t.baseId]?.item_class !== "Map")) throw Error("Blight requires an extracted PoE 1 Blighted Map modifier on a map.");
	if ((t.anointments?.length ?? 0) > (n?.maximumAnointments ?? 1)) throw Error("Anointment count exceeds this item's supported limit.");
	if (!t.anointments?.length) return;
	let r = new Set(_l(e, t).map((e) => e.id));
	for (let i of t.anointments ?? []) {
		if (!r.has(i)) throw Error("This anointment is not available on this item base.");
		if (n && (t.anointments?.filter((e) => e === i).length ?? 0) > fl(e)) throw Error(`A Blighted Map cannot use more than ${fl(e)} of the same oil.`);
	}
}
function ml(e, t) {
	let n = e.crafting.anointing.recipes.find((e) => e.id === t);
	if (!n || !n.passive && !n.mod) throw Error("This anointing recipe has no resolved outcome in the extracted build.");
	return n;
}
function hl(e, t) {
	let n = ml(e, t);
	return n.passive ? `Allocates ${e.crafting.anointing.passives[n.passive].name}` : Jc(e.mods[n.mod].text ?? n.mod);
}
function gl(e, t) {
	let n = ml(e, t);
	return n.passive ? `passive:${n.passive}` : `mod:${n.mod}`;
}
function _l(e, t) {
	let n = e.bases[t.baseId];
	if (n?.item_class === "Map" && ul(e, t)) return e.crafting.anointing.recipes.filter((e) => e.type === "InfectedMap" && !!e.mod);
	let r = (cl(e, t).get("local_item_can_be_instilled") ?? 0) > 0 || [...t.mods, ...t.implicits].some((t) => e.mods[t.id].stats.some((e, n) => ["local_can_be_anointed", "local_item_can_be_instilled"].includes(e.id) && (t.values[n] ?? 0) > 0));
	return e.crafting.anointing.recipes.filter((t) => t.passive ? (e.game === "poe2" || t.type === "UniqueOrAmulet") && (n?.item_class === "Amulet" || r) : e.game === "poe1" && t.mod && t.type === "Ring" && n?.item_class === "Ring");
}
function vl(e, t) {
	return e.game === "poe1" ? e.crafting.anointing.items.filter((e) => e.useType === 1 && t.corrupted || e.useType === 2 && t.mirrored).map((e) => e.id) : [];
}
//#endregion
//#region app/lib/crafting-clusters.ts
function yl(e, t) {
	return e.game === "poe1" ? e.crafting.clusterJewels?.bases[t.baseId] : void 0;
}
function bl(e, t) {
	let n = yl(e, t);
	return Object.entries(e.crafting.clusterJewels?.skills ?? {}).filter(([, e]) => n && e.size === n.size).map(([e, t]) => ({
		id: e,
		...t
	}));
}
function xl(e, t) {
	return t.cluster ? e.crafting.clusterJewels?.skills[t.cluster.passive] : void 0;
}
function Sl(e, t) {
	let n = xl(e, t);
	return n ? [n.tag] : [];
}
function Cl(e, t) {
	let n = yl(e, t);
	if (!n) {
		if (t.cluster) throw Error("Cluster passive state requires a PoE 1 Cluster Jewel.");
		return;
	}
	let r = xl(e, t);
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
//#endregion
//#region app/lib/crafting-conversions.ts
function wl(e, t, n) {
	let r = Y(e, t, J(e, n));
	for (let e of [
		"fire",
		"cold",
		"lightning",
		"chaos"
	]) if (r?.stats.some((t) => t.id === `dummy_display_stat_rune_${e}_convert` && t.min > 0)) return e;
}
function Tl(e, t, n) {
	return e.crafting.elementalConversions.find((e) => !e.resistance && [
		"fire",
		"cold",
		"lightning"
	].some((r) => r !== n && e.mods[r] === t))?.mods[n] ?? t;
}
function El(e, t) {
	let n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map();
	for (let a of t.mods) {
		let o = a.conversion, s = [{
			id: o?.source ?? a.id,
			order: -1
		}];
		if (i.set(a, s), o) {
			if (e.game !== "poe2" || a.origin || !e.mods[o.source]) throw Error("Invalid elemental conversion source.");
			for (let i of o.steps) {
				let a = s.at(-1), o = t.augments?.[i.socket], c = o && wl(e, t, o);
				if (i.order <= a.order || !c || !J(e, o).socketBound || n.has(i.order) && n.get(i.order) !== i.socket || r.has(i.socket) && r.get(i.socket) !== i.order) throw Error("Invalid elemental conversion socket history.");
				let l = Tl(e, a.id, c);
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
		let n = Tl(e, a.findLast((e) => e.order < r).id, wl(e, t, t.augments[i]));
		if (a.findLast((e) => e.order <= r).id !== n) throw Error("The modifier is missing an elemental conversion step.");
	}
	return i;
}
function Dl(e, t, n, r) {
	if (!n.conversion && !r.conversion) return !1;
	let i = t.get(n), a = t.get(r);
	return [...new Set([...i, ...a].map((e) => e.order))].some((t) => {
		let n = i.findLast((e) => e.order <= t).id, r = a.findLast((e) => e.order <= t).id;
		return n !== r && !e.mods[n].groups.some((t) => e.mods[r].groups.includes(t));
	});
}
//#endregion
//#region app/lib/crafting-defences.ts
var Ol = {
	armour: "Armour",
	evasion: "Evasion Rating",
	energy_shield: "Energy Shield",
	ward: "Ward"
};
function kl(e, t) {
	let n = e.bases[t.baseId].defences;
	return Ts.options.flatMap((e) => n[e] ? [{
		key: e,
		range: n[e],
		name: Ol[e]
	}] : []);
}
function Al(e, t, n) {
	let r = e.bases[t.baseId].defences[n];
	return r ? t.baseDefences?.[n] ?? (r.min === r.max ? r.min : void 0) : 0;
}
function jl(e, t) {
	for (let n of Ts.options) {
		let r = t.baseDefences?.[n];
		if (r === void 0) continue;
		let i = e.bases[t.baseId].defences[n];
		if (!i || r < i.min || r > i.max) throw Error(`Base ${Ol[n]} must be within this base's extracted range.`);
	}
}
function Ml(e, t, n) {
	return Ts.options.every((r) => {
		let i = n.baseDefences?.[r];
		if (!i) return !0;
		let a = Al(e, t, r);
		if (a === void 0) throw Error(`Set the starting Base ${Ol[r]} roll before checking this requirement.`);
		return a >= i.min && a <= i.max;
	});
}
function Nl(e, t) {
	let n = e.crafting.currencies.find((e) => e.action === "add_armour_quality");
	return e.game === "poe1" && kl(e, t).length > 0 && e.crafting.baseQuality.some((r) => r.id === n?.id && r.itemClasses.includes(e.bases[t.baseId].item_class));
}
//#endregion
//#region app/lib/crafting-eldritch.ts
function X(e) {
	let t = e.spawn_weights.map((e) => /^no_tier_(\d)_eldritch_implicit$/.exec(e.tag)?.[1]).find(Boolean);
	return t ? 7 - Number(t) : 0;
}
function Pl(e) {
	return JSON.stringify([
		e.generation_type,
		e.type,
		[...e.groups].sort(),
		e.stats.map((e) => e.id),
		e.spawn_weights.filter((e) => !e.tag.startsWith("no_tier_")).map((e) => e.tag)
	]);
}
//#endregion
//#region app/lib/crafting-enchantments.ts
function Fl(e, t, n) {
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
function Il(e, t) {
	let n = t ? e.bases[t.baseId].item_class : void 0, r = e.crafting.harvest.flatMap((e) => e.gameMode !== 2 && e.enchantment && (!n || e.enchantment.itemClasses.includes(n)) ? [{
		...e.enchantment,
		recipe: e.id
	}] : []), i = e.crafting.flaskEnchantments.flatMap((n) => (t ? Fl(e, t, n.id).map((e) => e.id) : n.mods).map((e) => ({
		mod: e,
		itemClasses: n.itemClasses,
		recipe: n.id
	})));
	return [
		...r,
		...i,
		...fc(e, t)
	];
}
//#endregion
//#region app/lib/crafting-fossils.ts
var Ll = "DoubleModSellPrice1";
//#endregion
//#region app/lib/crafting-memory.ts
function Rl(e, t) {
	let n = e.bases[t.baseId];
	return !!(e.game === "poe1" && e.crafting.memoryMaps && n?.domain === "area" && n.item_class === "Map");
}
var zl = [
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
function Bl(e, t, n) {
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
function Vl(e, t) {
	let n = Array.from({ length: Math.min(e, t + 1) }, (t, n) => ({
		value: e - n,
		weight: 1
	}));
	return t >= e && n.push({
		value: 0,
		weight: t - e + 1
	}), n;
}
function Hl(e, t) {
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
function Ul(e, t, n = !1) {
	if (!t && !n) return e;
	let r = t > 0 ? 5 * t + 295 + (n ? 150 : 0) : 350;
	return Math.floor(200 * (e - 1) / r) + 1;
}
function Z(e) {
	return JSON.stringify([
		e.domain,
		e.generation_type,
		e.type,
		[...e.groups].sort()
	]);
}
function Wl(e, t, n = !1) {
	if (!t && !n) return e;
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = Z(t.mod), n = r.get(e) ?? /* @__PURE__ */ new Set();
		n.add(t.mod.required_level), r.set(e, n);
	}
	let i = new Map([...r].map(([e, r]) => {
		let i = [...r].sort((e, t) => t - e);
		return [e, i[Ul(i.length, t, n) - 1]];
	}));
	return e.filter((e) => e.mod.required_level >= i.get(Z(e.mod)));
}
function Gl(e, t, n) {
	let r = Z(e.mod), i = t.filter((t) => Z(t.mod) === r && t.mod.required_level > e.mod.required_level).sort((e, t) => t.mod.required_level - e.mod.required_level), a = t.reduce((t, n) => t + (n.mod.generation_type === e.mod.generation_type ? n.weight : 0), 0), o = i.reduce((e, t) => e + t.weight, 0);
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
//#endregion
//#region app/lib/crafting-genesis.ts
function Kl(e, t) {
	let n = e.bases[t.baseId];
	return !!(e.game === "poe1" && e.crafting.genesis?.itemClasses.includes(n?.item_class ?? "") && n?.rarities.includes("rare") && !n.corrupted);
}
function ql(e, t) {
	let n = e.crafting.genesis;
	if (e.game !== "poe1" || !n) throw Error("Genesis crafting is unavailable in this build.");
	if (new Set(t).size !== t.length) throw Error("Choose each Genesis passive only once.");
	return t.flatMap((e) => {
		let t = n.passives[e];
		if (!t?.stats.length || t.stats.some((e) => !Go(e))) throw Error("Choose an extracted Genesis modifier-weight or tier-rating passive.");
		return t.stats.map((e) => Go(e));
	});
}
function Jl(e, t) {
	let n = t.reduce((e, t) => e + (t.kind === "tier" ? t.value : 0), 0), r = /* @__PURE__ */ new Map();
	for (let { mod: t } of e) {
		let e = Z(t), n = r.get(e) ?? /* @__PURE__ */ new Set();
		n.add(t.required_level), r.set(e, n);
	}
	let i = new Map([...r].map(([e, t]) => {
		let r = [...t].sort((e, t) => e - t);
		return [e, r[Math.floor(r.length * n / (100 + n))]];
	}));
	return e.flatMap((e) => {
		if (e.mod.required_level < i.get(Z(e.mod))) return [];
		let n = t.reduce((t, n) => t + (n.kind === "weight" && e.mod.implicit_tags.includes(n.tag) ? n.value : 0), 100), r = Math.max(0, Math.round(e.weight * n / 100));
		return r ? [{
			...e,
			weight: r
		}] : [];
	});
}
var Yl = {
	Xoph: 12,
	Tul: 12,
	Esh: 12,
	"Uul-Netol": 12,
	Chayula: 12
}, Xl = [
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
], Zl = new Set(Xl.map(([, e]) => e));
function Ql(e, t, n) {
	return e.game === "poe1" && e.bases[t.baseId]?.item_class === "Body Armour" && Zl.has(n);
}
function $l(e, t, n = Yl) {
	if (e.game !== "poe1" || t.baseId !== "Metadata/Items/Armours/BodyArmours/BodyStrDexInt2") return [];
	let r = t.mods.map((t) => e.mods[t.id]), i = Xl.flatMap(([t, n, i]) => {
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
//#endregion
//#region app/lib/crafting-incursion.ts
var eu = [
	"FireResistEnhancedModAilments",
	"ColdResistEnhancedModAilments__",
	"LightningResistEnhancedModAilments"
];
function tu(e, t, n) {
	return e.game === "poe1" && e.bases[t.baseId]?.item_class === "Gloves" && eu.some((e) => e === n);
}
//#endregion
//#region app/lib/crafting-janus.ts
var nu = "JunMasterVeiledItemRarityFromRareAndUniqueEnemies_";
function ru(e, t, n) {
	let r = e.mods[n];
	return e.game === "poe1" && n === "JunMasterVeiledItemRarityFromRareAndUniqueEnemies_" && e.bases[t.baseId]?.item_class === "Helmet" && r?.domain === "unveiled" && t.level >= r.required_level;
}
//#endregion
//#region app/lib/crafting-omens.ts
var iu = {
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
}, au = /* @__PURE__ */ new WeakMap();
function ou(e, t) {
	if (e.game === "poe2") {
		if (t.kind === "reveal") return "reveal";
		if (t.kind === "currency") {
			let n = e.crafting.currencies.find((e) => e.id === t.id)?.action;
			return n?.startsWith("abyssal_bench_ticket_") ? "desecrate" : n;
		}
		if (t.kind === "essence" && e.crafting.poe2Essences.some((e) => e.id === t.id && (e.perfect || e.id.includes("/CurrencyCorruptedEssence")))) return "perfect_essence";
	}
}
function su(e, t, n) {
	let r = ou(e, t);
	if (!r) return [];
	let i = au.get(e);
	i || (i = e.crafting.currencies.filter((e) => iu[e.id.split("/").at(-1)]), au.set(e, i));
	let a = t.kind === "currency" ? e.crafting.currencies.find((e) => e.id === t.id)?.action : void 0;
	return i.filter((t) => {
		let i = iu[t.id.split("/").at(-1)];
		return i && i.action === r && (!i.sanctify || e.crafting.sanctification !== null) && (!i.waystoneTag || !n || n === "Map") && (!i.catalysing || !n || e.crafting.catalysts.some((e) => e.itemClasses.includes(n))) && (!i.revealTag || /^abyssal_bench_ticket_(weapon|jewellery|breach)(_|$)/.test(a ?? ""));
	});
}
function cu(e, t) {
	let n = "omens" in t ? t.omens ?? [] : [], r = {};
	if (!n.length) return r;
	if (new Set(n).size !== n.length) throw Error("An omen can only be used once per craft.");
	let i = su(e, t);
	for (let e of n) {
		if (!i.some((t) => t.id === e)) throw Error("This omen does not apply to the selected craft.");
		let { action: t, waystoneTag: n, ...a } = iu[e.split("/").at(-1)];
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
//#endregion
//#region app/lib/crafting-properties.ts
var lu = {
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
}, uu = {
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
}, du = (e) => Math.round((e + 2 ** -52 * Math.max(1, e)) * 100) / 100;
function fu(e, t) {
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
	], c = Math.max(o, ...s.map((t) => Math.floor(e.mod(t).required_level * 4 / 5)), ...(t.augments ?? []).map((t) => e.catalog.crafting.augments.find((e) => e.id === t).requiredLevel), t.socketedJewel ? fu(e, t.socketedJewel) ?? 0 : 0);
	return c > 1 ? c : 0;
}
function pu(e, t) {
	let n = {};
	if (t.destroyed) return n;
	let r = fu(e, t);
	r !== void 0 && (n.requiredLevel = r);
	let i = e.statTotals(t);
	for (let n of t.enchantments ?? []) {
		let r = e.mod(n.id);
		if (r.generation_type.startsWith("flask_enchantment_")) continue;
		let a = Zc(e.catalog, n, t);
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
	for (let r of Ts.options) {
		let [i, ...o] = uu[r];
		if (!e.base(t).defences[r] && !a(i)) continue;
		let s = Al(e.catalog, t, r), c = o.reduce((e, t) => e + a(t), 0) + (r === "ward" ? 0 : a("local_armour_and_evasion_and_energy_shield_+%"));
		n[r] = s === void 0 ? void 0 : Math.max(0, Math.round((s + a(i)) * (1 + c / 100) * p("defences")));
	}
	let m = e.base(t).combat;
	if (m.block !== null && (m.block > 0 || a("local_additional_block_chance_%") > 0) && (n.blockChance = Math.floor(Math.max(0, (m.block + a("local_additional_block_chance_%")) * (1 + a("local_block_chance_+%") / 100)))), m.attack_time && m.attack_time > 0) {
		let e = a("local_attack_speed_+%") + d("local_attack_speed_+%_per_8%_quality", 8), t = du(Math.max(0, 1e3 / m.attack_time * (1 + e / 100)));
		n.attacksPerSecond = t, m.reload_time && m.reload_time > 0 && (n.reloadTime = du(m.reload_time / 1e3 / (1 + (e + a("local_reload_speed_+%")) / 100))), m.critical_strike_chance !== null && (n.criticalStrikeChance = du(Math.max(0, (m.critical_strike_chance + a("local_critical_strike_chance")) / 100 * (1 + (a("local_critical_strike_chance_+%") + d("local_critical_strike_chance_+%_per_4%_quality", 4)) / 100))));
		let r = (e) => {
			let n = e === "physical", r = e !== "physical" && e !== "chaos", i = (1 + (a(`local_${e}_damage_+%`) + (r ? a("local_elemental_damage_+%") + d("local_elemental_damage_+%_per_2%_quality", 2) : 0)) / 100) * (n ? p("physical_damage") : 1);
			return (Math.max(0, Math.round(((n ? m.physical_damage_min ?? 0 : 0) + a(`local_minimum_added_${e}_damage`)) * i)) + Math.max(0, Math.round(((n ? m.physical_damage_max ?? 0 : 0) + a(`local_maximum_added_${e}_damage`)) * i))) / 2 * t;
		}, i = r("physical"), o = r("fire") + r("cold") + r("lightning"), s = r("chaos");
		n.physicalDps = du(i), n.elementalDps = du(o), n.chaosDps = du(s), n.totalDps = du(i + o + s);
	}
	return n;
}
function mu(e, t, n) {
	if (!Object.keys(n.properties ?? {}).length) return !0;
	let r = pu(e, t);
	return As.options.every((e) => {
		let t = n.properties?.[e];
		if (!t) return !0;
		if (Object.hasOwn(r, e) && r[e] === void 0) throw Error(`Set the starting Base ${lu[e]} roll before checking final item properties.`);
		let i = r[e] ?? 0;
		return (t.min === void 0 || i >= t.min) && (t.max === void 0 || i <= t.max);
	});
}
//#endregion
//#region app/schemas/recombinator-catalog.ts
var hu = Ba([O(), A().nonnegative()]), gu = N({
	id: O().min(1),
	name: O().min(1),
	itemClass: O().min(1),
	tags: M(O())
}), _u = N({
	id: O().min(1),
	name: O(),
	text: O().min(1),
	side: L(["prefixes", "suffixes"]),
	level: A().int().nonnegative(),
	maxLevel: A().int().nonnegative(),
	groups: M(O().min(1)).min(1),
	addsTags: M(O()),
	spawn: M(hu),
	generation: M(hu),
	crafted: j().optional(),
	exclusive: j().optional()
}), vu = N({
	id: O(),
	name: O(),
	kind: L(["essence", "bench"]),
	mod: O(),
	itemClasses: M(O()),
	cost: M(N({
		name: O(),
		amount: A().int().positive()
	}))
});
N({
	format: R(1),
	game: R("poe1"),
	patch: O().min(1),
	source: N({
		manifestSha256: O().regex(/^[a-f0-9]{64}$/),
		basesSha256: O().regex(/^[a-f0-9]{64}$/),
		modsSha256: O().regex(/^[a-f0-9]{64}$/),
		craftingSha256: O().regex(/^[a-f0-9]{64}$/).optional(),
		craftingDataSha256: O().regex(/^[a-f0-9]{64}$/).optional()
	}),
	bases: M(gu).min(1),
	mods: M(_u).min(1),
	recipes: M(vu).optional()
});
//#endregion
//#region app/schemas/recombinator.ts
var yu = O().trim().min(1).max(80), bu = N({
	id: O().trim().min(1).max(256),
	label: O().min(1).max(2e3).optional(),
	group: O().trim().min(1).max(256),
	groups: M(O().min(1).max(256)).min(1).optional(),
	exclusive: j(),
	nonNative: j().default(!1),
	spawn: M(Ba([O(), A().nonnegative()])).optional(),
	crafted: j().optional()
}), xu = M(bu).max(3), Su = N({
	kind: L(["essence", "bench"]),
	side: L(["prefixes", "suffixes"]),
	affix: bu,
	itemClasses: M(O()).min(1),
	keepInputMods: j().optional()
});
N({
	items: M(N({
		id: yu,
		name: yu,
		item: N({
			prefixes: xu,
			suffixes: xu,
			base: gu.optional()
		}).superRefine((e, t) => {
			for (let n of ["prefixes", "suffixes"]) {
				let r = e[n].flatMap(Cu);
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
		})
	})).min(2).max(12),
	steps: M(N({
		id: yu,
		name: yu,
		left: yu,
		right: yu,
		leftPreparation: Su.optional(),
		rightPreparation: Su.optional(),
		removeCrafted: j().optional()
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
			Cu(i).toSorted(),
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
function Cu(e) {
	return [.../* @__PURE__ */ new Set([e.group, ...e.groups ?? []])];
}
function wu(e, t) {
	let n = new Set(Cu(e));
	return Cu(t).some((e) => n.has(e));
}
//#endregion
//#region app/lib/recombinator.ts
var Tu = [
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
function Eu(e) {
	return JSON.stringify([
		e.prefixes.map((e) => e.id).sort(),
		e.suffixes.map((e) => e.id).sort(),
		e.base?.id
	]);
}
function Du(e, t) {
	return e.nonNative ? 0 : e.exclusive || !e.spawn || !t ? 1e3 : e.spawn.find(([e]) => t.tags.includes(e))?.[1] ?? 0;
}
function Ou(e, t, n) {
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
		for (let t of e) i(e.filter((e) => !wu(e, t) && !(t.exclusive && e.exclusive)), [...a, t], o * n(t) / s);
	}
	return i(e, [], 1), [...r.values()];
}
function ku(e, t, n = !1, r = !1) {
	let i = Tu[e.length], a = i.reduce((e, t) => e + t, 0);
	return i.flatMap((i, o) => i === 0 ? [] : Ou(e.filter((e) => Du(e, t) > 0 && !(n && e.exclusive)), o, (e) => r ? Du(e, t) : 1).map((e) => ({
		...e,
		probability: e.probability * i / a
	})));
}
function Au(e, t, n) {
	let r = Eu(t), i = e.get(r);
	i ? i.probability += n : e.set(r, {
		item: t,
		probability: n
	});
}
function ju(e, t, n) {
	let r = [...e.prefixes, ...t.prefixes], i = [...e.suffixes, ...t.suffixes];
	if (r.some((e) => i.some((t) => wu(e, t)))) throw Error("A mod group appears in both prefixes and suffixes. This model does not support that combination; use compatible bases and modifier groups.");
	if (![e, t].every((e) => e.prefixes.length === 1 && e.suffixes.length === 1 && [...e.prefixes, ...e.suffixes].some((e) => e.exclusive && e.crafted)) && [r, i].some((e) => e.filter((e) => e.exclusive).length > 1)) throw Error("This step can combine more than one exclusive modifier on the same affix side. Only two one-mod magic items with an exclusive bench craft each support this setup.");
	if ([...r, ...i].filter((e) => e.exclusive).length === 2 && (r.length !== 2 || i.length !== 2 || [e, t].some((e) => e.prefixes.length !== 1 || e.suffixes.length !== 1))) throw Error("More than one exclusive modifier is supported only for two one-mod magic items with opposite-side bench crafts.");
	if (r.length === 1 && i.length === 1 && e.prefixes.length + e.suffixes.length === 1 && t.prefixes.length + t.suffixes.length === 1 && [...r, ...i].every((e) => !e.exclusive)) {
		let e = r.filter((e) => Du(e, n) > 0), t = i.filter((e) => Du(e, n) > 0), a = /* @__PURE__ */ new Map();
		for (let r of [
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
		]) Au(a, {
			...r,
			...n ? { base: n } : {}
		}, 1 / 3);
		return [...a.values()];
	}
	let a = /* @__PURE__ */ new Map(), o = [...r, ...i].some((e) => e.exclusive), s = o ? ["prefixes", "suffixes"] : ["prefixes"];
	for (let e of s) {
		let t = e === "prefixes" ? "suffixes" : "prefixes", c = {
			prefixes: r,
			suffixes: i
		};
		for (let r of ku(c[e], n, !1, o)) for (let i of ku(c[t], n, r.affixes.some((e) => e.exclusive), o)) {
			let o = {
				prefixes: [],
				suffixes: [],
				...n ? { base: n } : {}
			};
			o[e] = r.affixes, o[t] = i.affixes, Au(a, o, r.probability * i.probability / s.length);
		}
	}
	return [...a.values()];
}
//#endregion
//#region app/lib/crafting-recombination.ts
function Mu(e, t) {
	let n = e.catalog.bases[t.baseId];
	return e.catalog.game === "poe1" && n.domain === "item" && e.catalog.crafting.recombinableClasses.includes(n.item_class);
}
function Nu(e, t) {
	let n = e.base(t), r = e.effectiveInfluences(t);
	return [...n.tags, ...e.catalog.crafting.influences.filter((e) => e.itemClass === n.item_class && r.includes(e.influence)).map((e) => e.tag)];
}
function Pu(e, t, n) {
	let r = e.base(t).item_class;
	return e.catalog.game === "poe1" && e.catalog.crafting.essences.some((e) => e.mods[r] === n);
}
function Fu(e, t, n) {
	for (let r of [t, n]) {
		if (e.validateItem(r), !Mu(e, r)) throw Error("Recombination requires an extracted PoE 1 equipment class.");
		if (r.corrupted || r.mirrored || r.destroyed || r.reveal) throw Error("Corrupted, mirrored, destroyed and unrevealed recombination inputs are not supported.");
		let t = e.limits({
			...r,
			rarity: "rare"
		});
		if (t.prefixes !== 3 || t.suffixes !== 3 || t.max !== 6) throw Error("Recombination with altered affix limits is not supported yet.");
		if (r.imprint) throw Error("Recombination of imprint checkpoints is not modeled yet.");
		let n = Nu(e, r);
		for (let t of r.mods) {
			let i = e.mod(t.id);
			if (!(i.domain === "item" && (i.spawn_weights.find((e) => n.includes(e.tag))?.weight ?? 0) > 0 && (i.generation_weights.find((e) => n.includes(e.tag))?.weight ?? 100) > 0 || Pu(e, r, t.id) || Ql(e.catalog, r, t.id) || tu(e.catalog, r, t.id) || ru(e.catalog, {
				...r,
				level: t.origin?.level ?? r.level
			}, t.id) || i.domain === "crafted" && i.implicit_tags.includes("unveiled_mod"))) throw Error("This recombination model supports natural and extracted essence modifiers, Breach modifiers, the three Incursion glove suffixes, Janus helmet rarity and unveiled bench crafts.");
		}
	}
	if (e.base(t).item_class !== e.base(n).item_class) throw Error("Recombination inputs must have the same item class.");
	let r = Math.min(Math.max(t.level, n.level), Math.floor((t.level + n.level) / 2) + 2), i = [];
	for (let [a, o] of [t, n].entries()) {
		let s = e.base(o), c = Nu(e, o), l = /* @__PURE__ */ new Map(), u = (t, n) => {
			let i = {
				prefixes: [],
				suffixes: []
			};
			for (let [o, s] of t.mods.entries()) {
				let u = e.mod(s.id), d = `${n}:${o}`;
				l.set(d, {
					...s,
					...s.attributeSource ? { attributeSource: void 0 } : {},
					...!s.crafted && (s.origin || t.level > r) ? { origin: {
						kind: "recombine",
						level: Math.max(s.origin?.level ?? 0, t.level)
					} } : {}
				});
				let f = (u.generation_weights.find((e) => c.includes(e.tag))?.weight ?? 100) / 100;
				i[u.generation_type === "prefix" ? "prefixes" : "suffixes"].push({
					id: d,
					group: u.groups[0],
					groups: u.groups,
					exclusive: s.crafted || u.is_essence_only || Ql(e.catalog, t, s.id) || tu(e.catalog, t, s.id) || ru(e.catalog, {
						...t,
						level: s.origin?.level ?? t.level
					}, s.id),
					nonNative: s.fractured && n !== a,
					crafted: s.crafted,
					spawn: u.spawn_weights.map((e) => [e.tag, e.weight * f])
				});
			}
			return i;
		}, d = u(t, 0), f = u(n, 1);
		for (let t of ju(d, f, {
			id: o.baseId,
			name: s.name,
			itemClass: s.item_class,
			tags: c
		})) {
			let n = {
				...o,
				level: r,
				rarity: "rare",
				mods: [...t.item.prefixes, ...t.item.suffixes].map((e) => l.get(e.id))
			};
			i.push({
				value: e.validateItem(n),
				weight: t.probability / 2
			});
		}
	}
	return i;
}
//#endregion
//#region app/lib/crafting-reveal-probabilities.ts
function Iu(e) {
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
function Lu(e, t, n) {
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
	let c = Iu(e), l = c.reduce((e, t) => e + t.weight, 0);
	for (let { value: e, weight: t } of c) s(i.map((e, t) => t), 0, e, t / l);
	return new Map(i.flatMap((e, t) => e.entries.map((n) => [n.id, Math.min(1, o[t] * n.weight / e.weight)])));
}
//#endregion
//#region app/lib/crafting-strongboxes.ts
function Ru(e, t) {
	return e.bases[t.baseId]?.strongbox ? e.crafting.strongboxes.find((e) => e.id === t.baseId) : void 0;
}
function zu(e, t) {
	if (t.kind === "generate") return !0;
	if (t.kind !== "currency" || t.donor) return !1;
	let n = e.crafting.currencies.find((e) => e.id === t.id);
	if (t.omens?.length) {
		let n = su(e, t, "Strongbox");
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
//#endregion
//#region app/lib/crafting-engine.ts
var Bu = class extends Error {
	item;
	cost;
	constructor(e, t, n) {
		super(e), this.item = t, this.cost = n;
	}
};
function Vu(e) {
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
var Q = {
	prefixes: "item_generation_cannot_change_prefixes",
	suffixes: "item_generation_cannot_change_suffixes",
	attack: "item_generation_cannot_roll_attack_affixes",
	caster: "item_generation_cannot_roll_caster_affixes",
	multiple: "item_generation_can_have_multiple_crafted_mods"
}, Hu = /\/OmenOnAbyssAdd(?:Prefixes|Suffixes)$/, Uu = /* @__PURE__ */ new Set([
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
]), Wu = class {
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
		for (let t of ac(e)) for (let e of t.mods) this.attributes.set(e, t.mods.filter((t) => t !== e));
		for (let t of e.crafting.mapQuality) for (let e of t.stats) this.statIds.add(e);
		for (let t of e.crafting.augments) {
			this.statIds.add(t.type.socketedStat);
			for (let e of t.rules) for (let t of e.stats) this.statIds.add(t.id);
		}
		for (let [t, n] of Object.entries(e.mods)) {
			for (let e of n.stats) this.statIds.add(e.id);
			if (["searing_exarch_implicit", "eater_of_worlds_implicit"].includes(n.generation_type) && X(n)) {
				let e = Pl(n), r = this.eldritchFamilies.get(e) ?? [];
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
		return r || (r = Fu(this, e, t), (this.recombinations.size >= 128 || [...this.recombinations.values()].reduce((e, t) => e + t.length, r.length) > 1e4) && this.recombinations.clear(), this.recombinations.set(n, r)), r;
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
		}), e.rarity === "rare" && xs(this.catalog, e) && (n = {
			min: 4,
			max: 4,
			prefixes: 2,
			suffixes: 2
		}), e.rarity === "normal") return n;
		let i = cl(this.catalog, e), a = (t) => [...e.implicits, ...e.mods].reduce((e, n) => e + this.mod(n.id).stats.reduce((e, r, i) => e + (r.id === t ? n.values[i] ?? 0 : 0), 0), i.get(t) ?? 0), o = Math.max(0, n.prefixes + a("local_maximum_prefixes_allowed_+")), s = Math.max(0, n.suffixes + a("local_maximum_suffixes_allowed_+")), c = this.counts(e), l = this.catalog.game === "poe2" && e.rarity === "rare" && r.item_class === "Jewel" ? Math.max(o, c.prefixes) + Math.max(s, c.suffixes) : Math.min(n.max + a("local_maximum_mods_allowed_+"), o + s);
		return {
			min: Math.min(n.min, l),
			max: l,
			prefixes: o,
			suffixes: s
		};
	}
	craftedLimit(e) {
		return (this.hasStat(e, Q.multiple) ? 3 : 1) + pc(this.catalog, e, "local_can_have_additional_crafted_mods") + (cl(this.catalog, e).get("local_can_have_additional_crafted_mods") ?? 0);
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
		return ic.has(e) ? this.catalog.game === "poe1" && !!this.catalog.crafting.allflame : e === "reroll_variable_defences" ? this.catalog.game === "poe1" : e === "add_map_alt_quality" ? this.catalog.game === "poe1" && this.catalog.crafting.mapQuality.length > 0 : e === "add_random_jewellery_quality" ? this.catalog.game === "poe1" && this.catalog.crafting.taintedCatalysts.length > 0 : e.startsWith("incursion_") && this.catalog.game === "poe2" && this.catalog.crafting.qualityInfusers.some((t) => this.catalog.crafting.currencies.some((n) => n.id === t.id && n.action === e)) ? !0 : e === "incursion_corrupt_tablet" || e === "incursion_corrupt_equipment" || e === "add_equipment_socket" || e === "use_liquid_emotion" ? this.catalog.game === "poe2" : this.catalog.game === "poe2" && e.startsWith("abyssal_bench_ticket_") ? !0 : Uu.has(e) ? this.catalog.game === "poe1" || !/influence|eldritch|veiled|imprint|mutated|hellscape|conflict_orb|implicit_\d$/.test(e) : !1;
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
			id: Ll,
			mod: this.mod(Ll),
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
		let t = Ys.parse(e), n = this.catalog.crafting;
		if (sc(t)) {
			let e = cc(this.catalog, t);
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
		if (t.kind === "genesis") return ql(this.catalog, t.nodes), t;
		if (cu(this.catalog, t), t.kind === "socket_jewel" || t.kind === "remove_jewel") {
			if (this.catalog.game !== "poe2") throw Error("Equipment Jewel sockets are only available in PoE 2.");
			t.kind === "socket_jewel" && t.jewel && this.validateSocketedJewel(t.jewel.item);
		} else if (t.kind === "reveal") for (let e of t.preferred) {
			let t = this.mod(e);
			if (t.domain !== this.revealDomain() && !(this.catalog.game === "poe2" && !t.is_essence_only && ["prefix", "suffix"].includes(t.generation_type) && this.baseDomains.has(t.domain))) throw Error("Reveal preferences must be eligible explicit modifiers for this game.");
		}
		else if (t.kind === "upgrade_augment") {
			if (!el(J(this.catalog, t.id))) throw Error("This augment does not upgrade socketed Runes.");
		} else if (t.kind === "augment") {
			if (!Qc(J(this.catalog, t.id))) throw Error("This augment has a special crafting effect that is not supported yet.");
		} else if (t.kind === "currency") {
			let e = n.currencies.find((e) => e.id === t.id);
			if (!e || !this.currencySupported(e.action)) throw Error("This currency action is not supported.");
			if (ic.has(e.action) && !sc(t)) throw Error("This Ducat requires Allflame crafting.");
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
			for (let e of dl(t)) ml(this.catalog, e);
			if (t.additional?.length && dl(t).some((e) => ml(this.catalog, e).type !== "InfectedMap")) throw Error("Multiple oils in one craft require Blighted Map recipes.");
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
			...ll(this.catalog, e)
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
		if (Ru(this.catalog, e)) return "strongbox";
		if (this.map(e)) return "map";
		if (this.catalog.crafting.classes[t.item_class]?.corrupt) {
			if (t.domain === "flask") return "quality";
			if (this.catalog.game === "poe1" && (t.item_class === "Jewel" || t.domain === "abyss_jewel")) return "poe1-jewel";
			if (Cs(this.catalog, e)) return "jewel";
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
		if (r === "strongbox") {
			e.corrupted = !0;
			return;
		}
		if (r === "map") {
			this.corruptMap(e, t);
			return;
		}
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
			if (r === "waystone" && this.corruptWaystone(e, t, a), a === "socket" && yc(this.catalog, e) > 0 && (e.sockets ?? 0) < bc(this.catalog, {
				...e,
				corrupted: !0
			}) && (e.sockets = (e.sockets ?? 0) + 1), a === "implicit" && this.corruptedModifiers(e).length && this.replaceCorruptedImplicit(e, t), a === "reroll-six") for (delete e.socketLinks, e.rarity = "rare", e.mods = e.mods.filter((t) => this.protected(e, t)), e.reveal && !e.mods.some((t) => t.id === e.reveal.mod) && delete e.reveal; e.mods.length < 6 && this.pool(e).length;) this.add(e, t);
			if (a === "reroll-rare" && (e.rarity = "rare", this.reroll(e, t)), a === "values" && (e.mods = e.mods.map((n) => {
				if (this.protected(e, n) || this.mod(n.id).domain === "veiled") return n;
				let r = t.integer(vs.min, vs.max);
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
	corruptLocus(e, t) {
		if (!ys(this.catalog, e)) throw Error("This item class cannot use the Locus of Corruption.");
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
		if (!xs(this.catalog, e)) throw Error("Ancient Infusers require a PoE 2 tablet.");
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
			e.baseId = t.pick(Object.keys(this.catalog.bases).filter((e) => xs(this.catalog, { baseId: e })).map((e) => ({
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
		return r || (r = [...this.implicitPool(e, "searing_exarch_implicit"), ...this.implicitPool(e, "eater_of_worlds_implicit")], this.eldritchPools.set(n, r)), r.filter(({ id: n, mod: r }) => (this.catalog.crafting.modRules[n]?.spawnLevel ?? r.required_level) <= e.level && (!r.maximum_level || r.maximum_level >= e.level) && (t || !["attack", "caster"].some((t) => this.hasStat(e, Q[t]) && r.implicit_tags.includes(t))));
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
		let r = [...this.implicitPool(e, "searing_exarch_implicit"), ...this.implicitPool(e, "eater_of_worlds_implicit")], i = new Map(r.map((e) => [e.id, e.weight])), a = [...new Set(r.map((e) => Pl(e.mod)))].flatMap((e) => (this.eldritchFamilies.get(e) ?? []).flatMap((e) => {
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
			let t = this.mod(e.id), n = X(t), i = (this.eldritchFamilies.get(Pl(t)) ?? []).filter((e) => r.has(e.id)), a = (e) => {
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
		let t = Gs.parse(e), n = this.base(t);
		if (Cl(this.catalog, t), t.unidentified && !this.identificationSupported(t)) throw Error("Unidentified templates require ordinary magic or rare equipment without explicit modifiers or special crafting state.");
		let r = Ru(this.catalog, t);
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
		if (jl(this.catalog, t), t.split !== void 0 && this.catalog.game !== "poe1") throw Error("Split items are only available in PoE 1.");
		if (t.corruptedBy && (this.catalog.game !== "poe1" || n.item_class !== "AbyssJewel" || !t.corrupted || !t.allflameCrafted || t.mirrored || t.destroyed || t.imprint || this.catalog.crafting.currencies.find((e) => e.id === t.corruptedBy)?.action !== "add_mod_and_corrupt_rare_abyss_jewel")) throw Error("The corruption source requires an Allflame Ducat Abyss Jewel outcome.");
		if (t.twiceCorrupted && (!t.corrupted || !bs(this.catalog, t, "incursion_corrupt_equipment"))) throw Error("Twice-corrupted outcomes require eligible corrupted PoE 2 equipment or jewels.");
		if (t.destroyedBy && (!t.destroyed || !t.allflameCrafted || t.corrupted || t.mirrored || t.imprint || this.catalog.crafting.currencies.find((e) => e.id === t.destroyedBy)?.action !== "reset_ghostliness_or_delete")) throw Error("The destruction source requires a destroyed Allflame Ducat outcome.");
		if (t.destroyed && !t.destroyedBy && !t.twiceCorrupted && !(t.corrupted && ys(this.catalog, t))) throw Error("Destroyed outcomes require a twice-corrupted item, eligible PoE 1 Locus corruption or Allflame Ducat source.");
		if (t.memoryStrands !== void 0 && !Hl(this.catalog, t)) throw Error("Memory strands require PoE 1 equipment.");
		if (t.memoryMap) {
			if (!Rl(this.catalog, t)) throw Error("Memory Influenced Maps require a PoE 1 map.");
			if (t.memoryMap.intentions > this.catalog.crafting.memoryMaps.maximumUses) throw Error("Orb of Intention uses exceed the extracted map limit.");
		}
		if (t.putrefied && (this.catalog.game !== "poe2" || !t.corrupted || t.rarity !== "rare")) throw Error("Putrefaction requires a corrupted PoE 2 rare item.");
		if (t.putrefied && !this.catalog.crafting.desecration.some((e) => e.itemClasses.includes(n.item_class))) throw Error("Putrefaction requires a desecratable base.");
		if (t.sanctified !== void 0 && this.catalog.game !== "poe2" || t.sanctified && (!this.catalog.crafting.sanctification || t.rarity !== "rare" || t.reveal)) throw Error("Sanctification requires a PoE 2 rare item without unrevealed modifiers.");
		pl(this.catalog, t);
		for (let e of t.enchantments ?? []) {
			if (!Il(this.catalog, t).some((t) => t.mod === e.id)) throw Error("This enchantment is not available on this item base.");
			if (e.crafted || e.fractured || e.origin || e.desecrated) throw Error("Enchantments cannot be crafted, fractured or transferred modifiers.");
		}
		if (t.enchantments?.length && t.anointments?.length) throw Error("An item cannot have both an anointment and another enchantment.");
		if (n.corrupted && !t.corrupted) throw Error("This base is intrinsically corrupted.");
		if (t.sockets && vc(this.catalog, t)) throw Error("Gem socket counts cannot be combined with Abyss sockets yet.");
		let i = gc(this.catalog, t);
		if (i && t.sockets === void 0 && (t.sockets = i), (t.sockets ?? 0) < i) throw Error("Socket count is below this base's extracted initial socket count.");
		if (t.sockets !== void 0 && t.sockets > bc(this.catalog, t)) throw Error("Socket count exceeds this item's supported extracted limit.");
		if (pc(this.catalog, t, "local_all_sockets_linked") && (t.socketLinks = (t.sockets ?? 0) > 1 ? Array.from({ length: t.sockets - 1 }, () => !0) : void 0), Sc(this.catalog, t), rl(this.catalog, t), t.socketedJewel) {
			if (!t.jewelSocket) throw Error("A socketed Jewel requires a converted Jewel socket.");
			t.socketedJewel = this.validateSocketedJewel(t.socketedJewel);
		}
		if (t.quality > 30 && t.quality > Rc(this.catalog, t)) throw Error("Base quality exceeds this item's supported maximum quality.");
		if (t.mapQuality && !Pc(this.catalog, t)) throw Error("This map quality type is unavailable for this item class.");
		if (t.catalyst) {
			if (!jc(this.catalog, t).some((e) => e.id === t.catalyst.id)) throw Error("This catalyst is not available on this item class in the extracted build.");
			if (t.catalyst.quality > Kc(this.catalog, t)) throw Error("Catalyst quality exceeds this item's maximum quality.");
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
		let o = El(this.catalog, t);
		if (t.mods.filter((e) => ["veiled", this.revealDomain()].includes(this.mod(e.id).domain) || this.isDesecrated(e)).length > 1 && !t.putrefied) throw Error("Only one veiled or revealed modifier is allowed.");
		for (let e of t.mods) {
			if (e.attributeSource && (e.conversion || e.crafted || !this.attributes.get(e.attributeSource)?.includes(e.id))) throw Error("Invalid extracted attribute conversion source.");
			let r = e.attributeSource ?? e.conversion?.source ?? e.id, i = this.mod(r);
			if (e.essence && !this.essenceMods.has(r)) throw Error("This modifier has no extracted essence recipe.");
			if (this.catalog.game === "poe1" && e.id.includes("Royale")) throw Error("Royale modifiers are unavailable in ordinary crafting.");
			let s = e.crafted && this.recipePool(t, "emotion").some((e) => e.id === r), c = e.crafted && this.catalog.game === "poe2" && (this.recipePool(t, "essence").some((e) => e.id === r) || Ac(this.catalog, t) === e.id);
			if (!["prefix", "suffix"].includes(i.generation_type)) throw Error("Explicit modifiers must be prefixes or suffixes.");
			if (e.desecrated && (this.catalog.game !== "poe2" || e.crafted || i.is_essence_only || ![n.domain, "desecrated"].includes(i.domain) || !this.catalog.crafting.desecration.some((e) => e.itemClasses.includes(n.item_class)))) throw Error("This modifier cannot be marked as desecrated.");
			let l = t.putrefied && ["VeiledPrefix", "VeiledSuffix"].includes(e.id);
			if (!l && t.mods.slice(0, t.mods.indexOf(e)).some((n) => !(t.putrefied && ["VeiledPrefix", "VeiledSuffix"].includes(n.id)) && this.mod(e.id).groups.some((e) => this.mod(n.id).groups.includes(e)) && !Dl(this.catalog, o, e, n))) throw Error("Modifiers in the same group cannot coexist.");
			if (this.catalog.game === "poe1" ? e.crafted !== (i.domain === "crafted") : e.crafted && !s && !c && !this.catalog.crafting.craftableModTypes.includes(i.type)) throw Error("Crafted modifier flags must match the build data.");
			if (e.fractured && (i.domain === "veiled" || this.isDesecrated(e) || a.length || !this.catalog.crafting.classes[n.item_class]?.fracture)) throw Error("This modifier cannot be fractured on this item.");
			let u = this.catalog.crafting.modRules[r], d = e.origin;
			if (d) {
				if (this.catalog.game !== "poe1" || e.crafted) throw Error("This modifier cannot have a transferred or beastcraft origin.");
				if (d.kind === "awakener") {
					if (u?.influence == null || t.influences.length !== 2) throw Error("An Awakener origin requires a dual-influence item and an influenced modifier.");
				} else if (d.kind === "recombine") {
					if (!Mu(this, t) || i.domain !== "item" && !ru(this.catalog, {
						...t,
						level: d.level
					}, e.id) || i.is_essence_only && !Pu(this, t, e.id)) throw Error("Invalid recombination origin for this modifier.");
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
				...Sl(this.catalog, t),
				...t.blight ? this.mod(t.blight).adds_tags : [],
				...t.mods.flatMap((e) => this.mod(e.id).adds_tags),
				...ll(this.catalog, t),
				...this.catalog.crafting.influences.filter((e) => e.itemClass === n.item_class && a.includes(e.influence)).map((e) => e.tag)
			]), m = i.spawn_weights.find((e) => p.has(e.tag))?.weight ?? 0, h = [n.domain, this.revealDomain()].includes(i.domain) && m > 0 && (u?.spawnLevel ?? i.required_level) <= (d?.level ?? t.level), g = ["mercenary", "ducat_crafted"].includes(i.domain) && [...ic].some((n) => this.ducatPool({
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
			}).some((e) => e.id === r)), v = !h && !f && this.catalog.crafting.influenceUpgrades.some((t) => t.upgraded === e.id && t.highestTier);
			if (d && !h && !(d.kind === "awakener" && v) && !(d.kind === "recombine" && (Ql(this.catalog, t, e.id) || tu(this.catalog, t, e.id) || ru(this.catalog, {
				...t,
				level: d.level
			}, e.id) || i.is_essence_only && Pu(this, t, e.id)))) throw Error("This modifier is unavailable at its recorded crafting origin level.");
			let te = !h && !f && !v && this.catalog.crafting.fossils.some((t) => [...t.added, ...t.forced].includes(e.id) && (!t.allowed.length || t.allowed.some((e) => e.tag && p.has(e.tag) || e.itemClass === n.item_class)) && !t.forbidden.some((e) => e.tag && p.has(e.tag) || e.itemClass === n.item_class));
			if (!f && !v && !(te && (m > 0 || this.catalog.crafting.fossils.some((t) => t.forced.includes(e.id)))) && !h && !_ && !ee && !g && !Ql(this.catalog, t, r) && !tu(this.catalog, t, r) && !ru(this.catalog, {
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
				if (!e.grantedPassive || !t.mods.includes(e) || Ac(this.catalog, t) !== e.id) throw Error("This modifier requires a valid allocated notable passive.");
				kc(this.catalog, e.grantedPassive);
			}
			if (e.sanctification !== void 0) {
				let n = this.catalog.crafting.sanctification;
				if (!t.sanctified || !t.mods.includes(e) || e.fractured || !n || e.sanctification < n.min || e.sanctification > n.max) throw Error("Invalid Sanctification multiplier for this modifier.");
			}
			if (e.corruptionScale !== void 0 && (!t.corrupted || !Cs(this.catalog, t) || !t.mods.includes(e) || e.fractured || e.sanctification !== void 0 || n.domain === "veiled")) throw Error("Corruption value multipliers require revealed, unfractured PoE 2 jewel affixes.");
			if (e.values.length !== n.stats.length || e.values.some((n, r) => {
				let i = Ss(this.catalog, t, e.id, r);
				return n < i.min || n > i.max;
			})) throw Error("Modifier values are outside the extracted ranges.");
		}
		if (t.implicits.some((e) => e.origin)) throw Error("Crafting origin levels apply only to explicit modifiers.");
		if (t.implicits.some((e) => e.desecrated)) throw Error("Implicit modifiers cannot be desecrated.");
		if (t.implicits.some((e) => ["prefix", "suffix"].includes(this.mod(e.id).generation_type))) throw Error("Implicit modifiers cannot be prefixes or suffixes.");
		let s = t.implicits.filter((e) => e.id === Ll);
		if (s.length && (s.length > 1 || !this.gildedModifiers(t).length || s.some((e) => e.crafted || e.fractured))) throw Error("The item has an invalid Gilded Fossil implicit.");
		let c = t.implicits.filter((e) => this.mod(e.id).generation_type === "corrupted");
		if (c.length && (!t.corrupted || c.length > (t.twiceCorrupted || ys(this.catalog, t) ? 2 : 1) || c.some((e, t) => c.slice(0, t).some((t) => e.id === t.id || this.mod(e.id).groups.some((e) => this.mod(t.id).groups.includes(e)))) || c.some((e) => e.fractured || e.crafted || !this.corruptedModifiers(t).some((t) => t.id === e.id)))) throw Error("The item has an invalid corrupted implicit.");
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
		if (p.some((e, t) => p.slice(0, t).some((t) => e.id === t.id && !Dl(this.catalog, o, e, t)))) throw Error("Duplicate modifiers are not allowed.");
		let m = this.counts(t), h = this.limits(t), g = { ...this.corruptedAreaLimits(t) ?? h };
		if (t.corruptedBy && t.rarity === "rare" && (g.max++, g.prefixes++, g.suffixes++), t.corrupted && xs(this.catalog, t) && (g.max++, g.prefixes++, g.suffixes++), this.catalog.game === "poe2" && t.rarity === "rare" && n.item_class === "Jewel") {
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
		let _ = t.mods.filter((e) => e.crafted).length, ee = _ > this.craftedLimit(t) && this.catalog.game === "poe2" && t.sockets ? 1 + Math.max(0, ...$c(this.catalog, t).map((e) => sl(this.catalog, t, e.id).get("local_can_have_additional_crafted_mods") ?? 0)) : 0;
		if (_ > Math.max(this.craftedLimit(t), ee)) throw Error("The item has too many crafted modifiers.");
		if (t.reveal) {
			if (t.putrefied && t.reveal.index === void 0) throw Error("Putrefaction requires an indexed reveal state.");
			if (t.reveal.index !== void 0 && !t.putrefied) throw Error("Indexed reveals require a Putrefaction item.");
			let e = this.revealIndex(t);
			if (e < 0 || t.mods[e]?.id !== t.reveal.mod) throw Error("The reveal index must identify its unrevealed modifier.");
			if (t.putrefied && t.reveal.omens?.length) throw Error("Putrefaction reveals do not use directional or Lich omens.");
			if (t.reveal.echoes && (!cu(this.catalog, {
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
			t.reveal.choices.length && !n && (t.reveal.offeredOn = Us.parse(t));
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
		return e.reveal ? cu(this.catalog, {
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
			...ru(this.catalog, e, "JunMasterVeiledItemRarityFromRareAndUniqueEnemies_") ? [{
				id: nu,
				mod: this.mod(nu),
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
		return e.reveal.choices.length ? new Map([...new Set([...t.exclusive, ...t.ordinary].map(({ id: e }) => e).concat(e.reveal.choices))].map((t) => [t, +!!e.reveal.choices.includes(t)])) : Lu(this.catalog.game, t, this.revealTag(e));
	}
	revealPools(e) {
		let t = e.reveal;
		if (!t) throw Error("The item has no modifier to reveal.");
		let n = this.catalog.crafting.currencies.find((e) => e.id === t.source), r = this.catalog.crafting.desecration.find((e) => e.id === t.source);
		if (!["VeiledPrefix", "VeiledSuffix"].includes(t.mod)) throw Error("This specialised veiled modifier is not supported yet.");
		if (t.mark && (e.putrefied || !this.isAbyssalMark(t.mark) || this.mod(t.mark).generation_type !== this.mod(t.mod).generation_type || !this.recipePool(e, "essence").some((e) => e.id === t.mark))) throw Error("The reveal state has an invalid Mark of the Abyssal Lord origin.");
		if (this.catalog.game === "poe1" ? !n || !["replace_rare_mod_veiled", "reroll_rare_veiled"].includes(n.action) : !r) throw Error("The reveal source is missing from this build.");
		if (r && (!r.itemClasses.includes(this.base(e).item_class) || r.maximumItemLevel && e.level > r.maximumItemLevel)) throw Error("This desecration bone cannot be used on this item class or level.");
		let i = cu(this.catalog, {
			kind: "currency",
			id: t.source,
			omens: t.omens
		});
		if (t.mark && t.omens?.some((e) => Hu.test(e))) throw Error("Necromancy omens are not consumed when replacing an Abyssal Mark.");
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
		let i = this.revealTag(n), a = i ? r.exclusive.filter((e) => e.mod.implicit_tags.includes(i)) : [], o = this.catalog.game === "poe2" ? t.pick(Iu(this.catalog.game)) : 3, s = (e) => {
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
		return cu(this.catalog, t).revealReroll && (i.reveal.echoes = {
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
				omens: r.omens?.filter((e) => !Hu.test(e))
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
			mods: [...e.mods, this.rollMod(n, Vu(0))],
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
		let r = Ru(this.catalog, { baseId: e }), i = Gs.shape.level.parse(t), a = bl(this.catalog, { baseId: e })[0];
		return this.validateItem({
			baseId: e,
			...a ? { cluster: { passive: a.id } } : {},
			level: r ? Math.max(Math.max(1, r.minimumLevel), Math.min(i, r.maximumLevel)) : i,
			rarity: "normal",
			corrupted: n.corrupted,
			mods: [],
			implicits: n.implicits.map((e) => this.rollMod(e, Vu(0)))
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
		if (r && !Kl(this.catalog, e)) throw Error("Choose an eligible Genesis equipment base from this build.");
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
			baseDefences: Object.fromEntries(kl(this.catalog, e).map(({ key: e, range: t }) => [e, n.integer(t.min, t.max)]))
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
					let e = n.pick($l(this.catalog, s, i).map((e) => ({
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
		return Kl(this.catalog, e) ? this.pool({
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
		let n = this.validateItem(e), r = Ac(this.catalog, n);
		if (!r) throw Error("This base cannot allocate a passive through an essence modifier.");
		kc(this.catalog, t);
		let i = n.mods.find((e) => e.id === r);
		return i ? i.grantedPassive = t : (n.rarity === "normal" && (n.rarity = "rare"), n.mods.push(this.rollMod(r, Vu(0), {
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
		let r = oc(this.catalog, e, t);
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
			...Sl(this.catalog, e),
			...t.extraTags ?? [],
			...e.blight ? this.mod(e.blight).adds_tags : [],
			...o.flatMap((e) => e.adds_tags),
			...ll(this.catalog, e),
			...this.catalog.crafting.influences.filter((e) => e.itemClass === n.item_class && r.includes(e.influence)).map((e) => e.tag)
		]), l = t.ignoreMeta ? [] : ["attack", "caster"].filter((t) => this.hasStat(e, Q[t])), u = t.level ?? e.level, d = JSON.stringify([
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
				return t.affinity?.types.includes(s.type) && (f *= t.affinity.multiplier), t.catalysing && qc(this.catalog, e, o) && (f *= Wc(this.catalog, e)), f > 0 ? [{
					id: o,
					mod: s,
					weight: f
				}] : [];
			}), t.genesis && (f = Jl(f, ql(this.catalog, t.genesis))), this.weightedPools.size >= 256 && this.weightedPools.delete(this.weightedPools.keys().next().value), this.weightedPools.set(d, f);
		}
		let p = Wl(f, t.memoryStrands ?? 0, t.foulborn).filter(({ id: n, mod: r }) => {
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
		return t.fractured || this.hasStat(e, r.generation_type === "prefix" ? Q.prefixes : Q.suffixes) || n && ["attack", "caster"].some((t) => r.implicit_tags.includes(t) && this.hasStat(e, Q[t]));
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
			excludedTags: [...n.excludedTags ?? [], ...["attack", "caster"].filter((t) => !n.ignoreMeta && this.hasStat(e, Q[t]))]
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
			...sc(e) ? ["Allflame"] : [],
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
		if (e.kind === "augment") return `Socket ${J(this.catalog, e.id).name}`;
		if (e.kind === "upgrade_augment") return `Upgrade socket ${e.socket + 1} · ${J(this.catalog, e.id).name}`;
		if (e.kind === "locus") return t.locus?.name ?? e.id;
		if (e.kind === "anoint") return `${this.catalog.game === "poe1" ? "Anoint" : "Instil"} · ${dl(e).map((e) => hl(this.catalog, e)).join(" + ")}`;
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
		if (cu(this.catalog, e), e.kind === "reveal" && t?.reveal?.choices.length) return [];
		if (t && e.kind === "bench" && this.catalog.crafting.bench.find((t) => t.id === e.id)?.mod) return this.prepareBenchCraft(t, e.id).cost;
		let n = "omens" in e ? e.omens ?? [] : [], r = [...this.baseCosts(e)];
		if (t && e.kind === "bench" && this.catalog.crafting.bench.find((t) => t.id === e.id)?.enchantment && t.enchantments?.some((e) => this.mod(e.id).generation_type === "flask_enchantment_instilling") && r.unshift(...this.benchRemovalCost(t, !0)), sc(e)) {
			let n = this.catalog.crafting.allflame?.sulphur, i = t ? lc(this.catalog, t, e) : void 0;
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
		return [...r, ...n.filter((e) => !Hu.test(e) || !t?.mods.some((e) => this.isAbyssalMark(e.id))).filter((e) => !t || t.catalyst?.quality || !e.endsWith("/OmenOnExaltConsumeQuality")).map((e) => ({
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
			name: J(this.catalog, e.id).name,
			amount: 1
		}];
		if (e.kind === "anoint") {
			let t = /* @__PURE__ */ new Map();
			for (let n of [...dl(e).flatMap((e) => ml(this.catalog, e).items), ...e.oils ?? []]) t.set(n, (t.get(n) ?? 0) + 1);
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
			let r = [
				"",
				"Red",
				"Green",
				"Blue"
			][n.lifeforceType], i = t.currencies.find((e) => e.id.endsWith(`HarvestSeed${r}`)), a = t.currencies.find((e) => e.id.endsWith("HarvestSeedBoss"));
			if (!i || n.sacred && !a) throw Error("Lifeforce currency is missing from the build.");
			return [{
				id: i.id,
				name: i.name,
				amount: n.lifeforce
			}, ...n.sacred && a ? [{
				id: a.id,
				name: a.name,
				amount: n.sacred
			}] : []];
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
		let a = lc(this.catalog, i, r);
		if (!sc(r) || !a) throw Error("Allflame is unavailable for this item and method.");
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
			}, o, { ignoreMeta: !0 }).length || !this.ducatPool(e, o, { excludedTags: ["attack", "caster"].filter((e) => this.hasStat(i, Q[e])) }).length && (o !== "reroll_rare_infamous" || e.mods.length !== this.limits(i).max)) throw Error(`${this.baseMethodName(r)} has no eligible modifier on this item base, level and open affixes.`);
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
				let t = { excludedTags: ["attack", "caster"].filter((t) => this.hasStat(e, Q[t])) }, r = o === "reroll_rare_infamous" ? this.rollAffixCount(e, n) : e.mods.length + 1;
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
			return q.parse(d);
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
		if (sc(i)) {
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
		let a = cu(this.catalog, i), o = this.validateItem(e);
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
		if (Ru(this.catalog, o) && !zu(this.catalog, i)) throw Error("This method is not supported for Strongboxes. Choose an ordinary crafting currency.");
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
			item: this.validateItem(nl(this.catalog, o, i.id, i.socket)),
			cost: this.costs(i)
		};
		if (i.kind === "augment") {
			let e = il(this.catalog, o, i.id, i.replace), t = wl(this.catalog, o, i.id);
			if (t) {
				let r = 1 + Math.max(-1, ...o.mods.flatMap((e) => e.conversion?.steps.map((e) => e.order) ?? [])), a = i.replace ?? e.augments.length - 1;
				e.mods = o.mods.map((e) => {
					let i = Tl(this.catalog, e.id, t);
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
			if (!bs(this.catalog, o, "incursion_corrupt_equipment")) throw Error("Architect's Orbs require eligible PoE 2 equipment or jewels.");
			if (!o.corrupted || o.mirrored) throw Error("Architect's Orbs require a corrupted, unmirrored item.");
			if (o.twiceCorrupted) throw Error(Jc(this.catalog.crafting.templeCorruption.alreadyTwiceCorruptedText));
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
			if (pl(this.catalog, {
				...o,
				anointments: dl(i)
			}), this.catalog.game === "poe2" && (o.corrupted || o.mirrored)) throw Error("Instilling requires an uncorrupted, unmirrored item.");
			let e = vl(this.catalog, o);
			if (e.length !== (i.oils?.length ?? 0) || e.some((e) => !i.oils?.includes(e))) throw Error("Select the matching Tainted or Reflective Oil for this item's corruption and mirroring.");
			return o.anointments = dl(i), o.enchantments?.length && (o.enchantments = []), {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		let s = i.kind === "currency" ? this.catalog.crafting.baseQuality.find((e) => e.id === i.id) : void 0;
		if (s) {
			if (!Mc(this.catalog, o).some((e) => e.id === s.id)) throw Error("This quality currency is not available on this item base.");
			if (o.mirrored || o.corrupted !== s.corrupted) throw Error(s.corrupted ? "Tainted quality currency requires a corrupted, unmirrored item." : "This quality currency requires an uncorrupted, unmirrored item.");
			if (o.catalyst) throw Error("Items with both base and catalyst quality are not supported yet.");
			let e = Lc(this.catalog, o);
			if (!s.corrupted && o.quality >= e) throw Error("This item already has the maximum quality for this currency.");
			let t = n.pick(Ic(this.catalog, o, s.id));
			return o.quality = s.corrupted ? t : Math.min(e, o.quality + t), {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		let c = i.kind === "currency" ? this.catalog.crafting.taintedCatalysts.find((e) => e.id === i.id) : void 0;
		if (c) {
			if (!o.corrupted || o.mirrored) throw Error("Tainted Catalyst requires a corrupted, unmirrored item.");
			let e = Uc(this.catalog, o, c.id);
			if (!e.length) throw Error("Tainted Catalyst is unavailable for this item class.");
			return o.catalyst = n.pick(e), o.quality = 0, {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		let l = i.kind === "bench" ? this.catalog.crafting.bench.find((e) => e.id === i.id) : void 0;
		if (l?.socketCount || l?.linkCount) {
			if (o.mirrored) throw Error("Socket bench crafting requires an unmirrored item.");
			if (!xc(this.catalog, o, l)) throw Error("This socket recipe exceeds the base limit or is unavailable for this item class.");
			if (l.socketCount) {
				if (o.sockets === l.socketCount) throw Error("This item already has the requested number of sockets.");
				Tc(o, l.socketCount);
			} else {
				if (l.linkCount === o.sockets && Cc(o).min === o.sockets) throw Error("All sockets are already linked.");
				Ec(o, l.linkCount);
			}
			return {
				item: this.validateItem(o),
				cost: this.costs(i, e)
			};
		}
		let u = i.kind === "currency" ? this.catalog.crafting.currencies.find((e) => e.id === i.id)?.action : void 0;
		if (u === "reroll_socket_numbers_hellscape" && this.catalog.game === "poe1") {
			if (!o.corrupted || o.mirrored) throw Error("Tainted Jeweller's Orbs require a corrupted, unmirrored item.");
			let t = yc(this.catalog, o, o.level), r = o.sockets ?? 0;
			if (!t || !r || vc(this.catalog, o)) throw Error("Tainted Jeweller's Orbs require ordinary gem sockets.");
			if (r >= t) throw Error("This item already has the maximum sockets for its item level.");
			return Tc(o, n.pick([{
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
			if (!Nc(this.catalog, o).some((e) => e.id === f.id)) throw Error("This chisel is unavailable for this item class.");
			let e = Pc(this.catalog, o);
			if (e?.id === f.id && o.quality >= f.maximumQuality) throw Error("This map already has maximum quality for this chisel.");
			return o.quality = Math.min(f.maximumQuality, (e?.id === f.id ? o.quality : 0) + Fc(o)), o.mapQuality = f.stats.includes("map_item_drop_quantity_+%") ? void 0 : f.id, {
				item: this.validateItem(o),
				cost: this.costs(i)
			};
		}
		if (i.kind === "locus") return this.corruptLocus(o, n), {
			item: this.validateItem(o),
			cost: this.costs(i)
		};
		if (i.kind === "currency" && this.catalog.crafting.qualityInfusers.some((e) => e.id === i.id)) {
			let e = Bc(this.catalog, o, i.id);
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
		let p = Bl(this.catalog, o, i), m = p ? o.memoryStrands ?? 0 : 0, h = this.base(o), g = (...e) => {
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
					if (!Nl(this.catalog, o)) throw Error("Sacred Orbs require armour with extracted base defences.");
					o.baseDefences = Object.fromEntries(kl(this.catalog, o).map(({ key: e, range: t }) => [e, n.integer(t.min, t.max)]));
					break;
				case "add_flask_injector":
				case "add_flask_seal": {
					let e = Fl(this.catalog, o, i.id);
					if (!e.length) throw Error("This currency requires a utility flask with eligible enchantments.");
					let t = n.pick(e.map((e) => ({
						value: e.id,
						weight: e.weight
					})));
					o.enchantments = [this.rollMod(t, n)];
					break;
				}
				case "add_equipment_socket": {
					let e = yc(this.catalog, o);
					if (!e) throw Error("This item base cannot have augment sockets.");
					if ((o.sockets ?? 0) >= e) throw Error("This item already has the maximum number of sockets.");
					o.sockets = (o.sockets ?? 0) + 1;
					break;
				}
				case "incursion_corrupt_tablet":
					this.corruptTablet(o, n);
					break;
				case "corrupt_item":
					this.corrupt(o, n, !!a.corruption || (cl(this.catalog, o).get("soul_core_cannot_roll_no_outcome_with_corruption") ?? 0) > 0);
					break;
				case "conflict_orb":
					this.conflict(o, n);
					break;
				case "apply_zana_influence":
					if (g("normal"), !Hl(this.catalog, o)) throw Error("Remembrance requires normal equipment.");
					o.memoryStrands = n.pick(zl);
					break;
				case "enchant_map_zana_influence_drops":
					if (!o.memoryMap || !Rl(this.catalog, o)) throw Error("Orb of Intention requires a Memory Influenced Map.");
					if (o.memoryMap.intentions >= this.catalog.crafting.memoryMaps.maximumUses) throw Error("This map has reached its Orb of Intention limit.");
					o.memoryMap.intentions++;
					break;
				case "consume_zana_influence_upgrade_mods": {
					if (!o.memoryStrands || !Hl(this.catalog, o)) throw Error("Unravelling requires equipment with memory strands.");
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
						let i = n.pick(Gl(r, e, o.memoryStrands));
						return i === t.id ? t : this.rollMod(i, n);
					}), delete o.memoryStrands;
					break;
				}
				case "add_jewellery_quality":
				case "add_alternate_quality": {
					if (!jc(this.catalog, o).some((e) => e.id === i.id)) throw Error("This catalyst is not available on this item class in the extracted build.");
					let e = Vc(this.catalog, o), t = o.catalyst?.id === i.id ? o.catalyst.quality : 0;
					if (t >= e) throw Error("This item already has the maximum quality for this catalyst.");
					o.catalyst = {
						id: i.id,
						quality: Math.min(e, t + n.pick(Hc(this.catalog, o)))
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
					o.imprint = q.parse(o);
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
						let i = e.filter((e) => Z(e.mod) === Z(r.mod)), a = [...new Set(i.map((e) => e.mod.required_level))].sort((e, t) => e - t), s = a[a.indexOf(r.mod.required_level) + n.pick([{
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
					g("magic", "rare"), this.remove(o, n, !0, {
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
				let e = yc(this.catalog, o);
				if (!e || vc(this.catalog, o)) throw Error("This beastcraft requires ordinary gem sockets.");
				if (o.sockets === e) throw Error("This item already has the maximum number of sockets.");
				Tc(o, e);
			} else if (e === "maximum-links") {
				if ((o.sockets ?? 0) < 2 || vc(this.catalog, o)) throw Error("This beastcraft requires at least two ordinary gem sockets.");
				if (Cc(o).min === o.sockets) throw Error("All sockets are already linked.");
				Ec(o, o.sockets);
			} else if (e === "talisman") {
				if (g("rare"), !h.tags.includes("talisman")) throw Error("This beastcraft requires a rare Talisman.");
				let e = this.catalog.crafting.beasts.find((e) => e.id === i.id);
				if (o.mods.some((e) => e.fractured)) throw Error("This Talisman beastcraft cannot be used on a fractured item.");
				if (e.talismanCraft === "imprint") o.imprint = q.parse(o);
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
				if (o.mods.some((e) => e.crafted && !this.mod(e.id).stats.some((e) => e.id === Q.multiple))) throw Error("Remove existing crafted modifiers other than multimod before this beastcraft.");
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
				o.imprint = q.parse(o);
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
				if (!e.enchantment.itemClasses.includes(h.item_class) || !Il(this.catalog, o).some((t) => t.mod === e.enchantment.mod)) throw Error("This bench enchantment is not available on this item base.");
				o.enchantments = [this.rollMod(e.enchantment.mod, n)];
			} else if (e.mod) {
				let t = this.prepareBenchCraft(o, i.id);
				if (t.conflict) {
					if (!i.skipOnConflict) throw new Bu(t.conflict, t.item, t.cost);
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
			if (g(...e.level >= 5 ? ["normal", "rare"] : ["normal"]), Object.values(Q).some((e) => e !== Q.multiple && this.hasStat(o, e))) throw Error("Essences cannot be used with metamods.");
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
			if (g(e.action === "delve_currency_upgrade" ? "normal" : "rare"), Object.values(Q).some((e) => e !== Q.multiple && this.hasStat(o, e))) throw Error("Fossils cannot be used with metamods.");
			let t = this.effectiveFossils(i.ids, i.tangled), r = t.some((e) => e.effects.includes("BetterSellPrice"));
			r && this.mod(Ll);
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
			}))).fractured = !0), a && this.replaceCorruptedImplicit(o, n), r && !o.implicits.some((e) => e.id === "DoubleModSellPrice1") && o.implicits.push(this.rollMod(Ll, n));
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
						let s = this.rollMod(t, Vu(0), { crafted: e.crafted }), c = {
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
			let e = n.pick(Vl(m, p.maximum));
			e ? o.memoryStrands = e : delete o.memoryStrands;
		}
		return {
			item: this.validateItem(o),
			cost: this.costs(i, e)
		};
	}
	statTotals(e, t = "all") {
		let n = t === "all" ? cl(this.catalog, e) : /* @__PURE__ */ new Map();
		if (t === "all") for (let t of Pc(this.catalog, e)?.stats ?? []) n.set(t, e.quality);
		if (t === "all" && e.blight) for (let t of [e.blight, ...(e.anointments ?? []).map((e) => ml(this.catalog, e).mod)]) for (let e of this.mod(t).stats) n.set(e.id, (n.get(e.id) ?? 0) + e.min);
		let r = t === "explicit" ? e.mods : t === "implicit" ? e.implicits : [
			...e.mods,
			...e.implicits,
			...(e.enchantments ?? []).filter((e) => this.mod(e.id).generation_type.startsWith("flask_enchantment_"))
		];
		for (let t of r) {
			let r = Zc(this.catalog, t, e);
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
		return (n.grantedPassives ?? []).every((t) => e.mods.some((e) => e.grantedPassive === t)) && (n.anointments ?? []).every((t) => (e.anointments ?? []).some((e) => gl(this.catalog, e) === gl(this.catalog, t))) && (n.enchantments ?? []).every((t) => e.enchantments?.some((e) => e.id === t)) && (!n.rarity || e.rarity === n.rarity) && (n.corrupted === void 0 || e.corrupted === n.corrupted) && (n.mirrored === void 0 || e.mirrored === n.mirrored) && (n.split === void 0 || !!e.split === n.split) && (n.sanctified === void 0 || !!e.sanctified === n.sanctified) && Ml(this.catalog, e, n) && (!n.mapTier || !!this.map(e) && s(this.map(e).tier, n.mapTier)) && (!n.waystoneTier || !!this.waystone(e) && s(this.waystone(e).tier, n.waystoneTier)) && s(e.sockets ?? 0, n.sockets) && wc(e, n) && (n.jewelSocket === void 0 || !!e.jewelSocket === n.jewelSocket) && (n.socketedJewel === void 0 || !!e.socketedJewel === n.socketedJewel) && s(e.quality, n.quality) && (!n.quality?.mapType || Pc(this.catalog, e)?.id === n.quality.mapType) && s(e.memoryStrands ?? 0, n.memoryStrands) && s(e.intangibility ?? 0, n.intangibility) && (!n.intentions || !!e.memoryMap && s(e.memoryMap.intentions, n.intentions)) && (!n.catalyst || (!n.catalyst.id || e.catalyst?.id === n.catalyst.id) && s(e.catalyst?.quality ?? 0, n.catalyst)) && (n.influences ?? []).every((t) => this.effectiveInfluences(e).includes(t)) && s(e.mods.length, n.affixCount) && s(o.prefixes, n.prefixCount) && s(o.suffixes, n.suffixCount) && s(this.unrevealedCount(e), n.unrevealedCount) && Math.max(0, Math.min(a.max - e.mods.length, Math.max(0, a.prefixes - o.prefixes) + Math.max(0, a.suffixes - o.suffixes))) >= (n.openAffixes ?? 0) && i >= (n.minimumGroups || n.groups.length) && mu(this, e, n) && Math.max(0, a.prefixes - o.prefixes) >= n.openPrefixes && Math.max(0, a.suffixes - o.suffixes) >= n.openSuffixes && (n.stats ?? []).every((t) => {
			let n = c.get(t.scope);
			n || (n = this.statTotals(e, t.scope), c.set(t.scope, n));
			let r = n.get(t.id) ?? 0;
			return (t.min === void 0 || r >= t.min) && (t.max === void 0 || r <= t.max);
		});
	}
	validateTarget(e) {
		let t = tc.parse(e);
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
		for (let e of t.anointments ?? []) ml(this.catalog, e);
		for (let e of t.grantedPassives ?? []) kc(this.catalog, e);
		for (let e of t.enchantments ?? []) if (!Il(this.catalog).some((t) => t.mod === e)) throw Error("Unknown or unsupported target enchantment.");
		if (new Set((t.anointments ?? []).map((e) => gl(this.catalog, e))).size !== (t.anointments?.length ?? 0)) throw Error("Choose each anointment outcome only once.");
		return t;
	}
};
//#endregion
//#region app/lib/crafting-modifier-details.ts
function Gu(e, t, n = "ordinary", r) {
	let i = e.createItem(t), a = e.base(i), o = e.catalog, s = new Set((n === "essence" ? ["essence"] : [
		"bench",
		"aspect",
		"emotion"
	]).flatMap((t) => e.recipePool(i, t).map((e) => e.id))), c = /* @__PURE__ */ new Set([
		...a.tags,
		...Sl(o, { cluster: r ?? i.cluster }),
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
			Z(t),
			r?.influence ?? null,
			t.stats.map((e) => e.id)
		]), u = l.get(i) ?? [], d = t.stats.reduce((e, t) => e + Math.abs(t.min) + Math.abs(t.max), 0);
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
		for (let r of e) (!n || r.mod.required_level !== n.mod.required_level || r.power !== n.power) && t++, u.set(r.id, t), n = r;
	}
	return u;
}
//#endregion
//#region app/lib/crafting-item-query.ts
var Ku = [
	"shaper",
	"elder",
	"crusader",
	"redeemer",
	"hunter",
	"warlord"
], qu = {
	normal: "Normal",
	magic: "Magic",
	rare: "Rare"
};
function Ju(e) {
	let t = /* @__PURE__ */ new Map();
	function n(n) {
		let r = e.base(n), i = e.limits(n), a = e.counts(n), o = JSON.stringify([n.baseId, n.cluster]), s = t.get(o);
		s || (s = {
			ordinary: Gu(e, n.baseId, "ordinary", n.cluster),
			essence: Gu(e, n.baseId, "essence", n.cluster)
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
				rarity: qu[n.rarity],
				identified: l,
				corrupted: n.corrupted,
				duplicated: n.mirrored,
				fractured: n.mods.some((e) => e.fractured),
				synthesised: n.implicits.some((t) => e.mod(t.id).generation_type.startsWith("synthesis")),
				split: !!n.split,
				sanctified: !!n.sanctified,
				influences: Object.fromEntries(e.effectiveInfluences(n).map((e) => [Ku[e], !0]))
			},
			facts: {
				baseId: n.baseId,
				itemClass: r.item_class,
				quality: n.quality,
				qualityType: Pc(e.catalog, n)?.id ?? "base",
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
				linkedSockets: e.catalog.game === "poe1" ? Cc(n) : void 0,
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
		matches: (e, t) => zo(n(e), t)
	};
}
//#endregion
//#region app/lib/crafting-query-routing.ts
function Yu(e, t) {
	if (t === "manual") return [...e];
	let n = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = Bo(t.query), r = n.get(e) ?? [];
		r.push(t), n.set(e, r);
	}
	return [...n.entries()].sort(([e], [t]) => t - e).flatMap(([, e]) => e.some((e) => e.probability == null) ? e : e.sort((e, t) => e.probability - t.probability));
}
function Xu(e, t, n) {
	let r = [];
	for (let i of Yu(t, n)) {
		let t = zo(e, i.query);
		if (t !== "no-match") {
			if (t === "unknown") {
				r.push(i.id);
				continue;
			}
			return r.length ? {
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
//#endregion
//#region app/lib/crafting-smart.ts
var Zu = {
	transmute_to_magic: "Upgrade a normal item to magic",
	transmute_to_rare: "Upgrade to rare",
	upgrade_magic_to_rare: "Upgrade a magic item to rare and add a modifier",
	convert_to_normal: "Remove unprotected modifiers"
};
function Qu(e, t, n) {
	let r = e.catalog.crafting, i, a = null;
	if (t.kind === "currency" && !t.allflame && !t.omens?.length) {
		let o = r.currencies.find((e) => e.id === t.id)?.action, s = r.baseQuality.find((e) => e.id === t.id), c = r.mapQuality.find((e) => e.id === t.id), l = r.catalysts.find((e) => e.id === t.id);
		if (o === "apply_zana_influence") i = "Roll 10–100 memory strands on normal equipment", a = {
			field: "memoryStrands",
			maximum: 100,
			suggested: 70
		};
		else if (s || c) {
			let t = c?.maximumQuality ?? (s.corrupted ? s.maximumQuality : n ? Lc(e.catalog, n) : s.maximumQuality);
			i = s?.corrupted ? "Reroll quality" : "Increase quality", a = {
				field: "quality",
				maximum: Math.max(1, t),
				suggested: Math.max(1, t)
			};
		} else if (l) {
			i = "Increase this catalyst's quality";
			let t = n ? Vc(e.catalog, n) : 20;
			a = {
				field: "catalystQuality",
				maximum: t,
				suggested: t
			};
		} else if (o === "add_equipment_socket" || o === "reroll_socket_numbers_hellscape") {
			i = o === "add_equipment_socket" ? "Add a socket" : "Add or remove a socket";
			let t = n ? yc(e.catalog, n, n.level) : e.catalog.game === "poe1" ? 6 : 7;
			a = {
				field: "sockets",
				maximum: Math.max(1, t),
				suggested: Math.max(1, t)
			};
		} else if (o && Zu[o]) i = Zu[o];
		else return null;
	} else if (t.kind === "bench") {
		let e = r.bench.find((e) => e.id === t.id);
		if (!e?.socketCount && !e?.linkCount) return null;
		i = e.socketCount ? `Set ${e.socketCount} sockets` : `Link ${e.linkCount} sockets`;
	} else return null;
	let o = null, s = null;
	if (n) try {
		e.apply(n, t, Vu(0)), o = !0;
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
function $u(e, t, n) {
	let r = Qu(e, t.method);
	if (!r) throw Error("This method requires custom outcome rules.");
	if (t.inputs.length !== 1) throw Error("Simple crafts consume one input item.");
	let i = Ao.parse({ game: e.catalog.game });
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
function ed(e, t, n) {
	if (!t.smart) return;
	let r = Qu(e, t.method, n);
	if (!r || r.available === !1) throw Error(r?.reason ?? "This craft has no simple outcome definition.");
	if (t.smart.kind === "minimum" && (!r.target || t.smart.value > r.target.maximum)) throw Error("The requested minimum exceeds what this craft can reach on this input.");
}
//#endregion
//#region app/lib/crafting-graph-trial.ts
var td = class extends Error {}, nd = class extends Error {
	outcomeId;
	token;
	constructor(e, t) {
		super(e), this.outcomeId = e, this.token = t;
	}
}, rd = class {
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
		this.engine = e, this.graph = t, this.random = n, this.options = r, this.nodes = new Map(t.nodes.map((e) => [e.id, e])), this.queries = i ?? Ju(e), this.iterator = this.produce(r.entry ?? t.entry);
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
			for (let e of t.branches) if (zo(n, e.query) === "match") {
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
		let r = Xu(n, this.branches(e), e.ordering);
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
		if (i.kind === "terminal") throw new nd(i.outcomeId, t);
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
		let n = Yu(this.branches(e), e.ordering), r = Yu(this.graph.outcomes.map((e) => ({
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
				let t = this.queries.record(i), s = Xu(t, n, "manual");
				if (s.status === "unknown") return;
				let c = s.branchId ?? "fallback";
				a.branches[c] = (a.branches[c] ?? 0) + o;
				let l = n.find((e) => e.id === c)?.destination ?? e.fallback;
				if (e.id === this.graph.entry && l.kind === "return") {
					let e = Xu(t, r, "manual");
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
			ed(this.engine, e, t[0].item), r = sc(n) ? this.engine.prepareAllflame(t[0].item, n, this.random) : this.engine.apply(t[0].item, n, this.random);
		} catch (e) {
			if (e instanceof Bu) for (let t of e.cost) this.spend(t);
			throw e;
		}
		this.recordOdds(e, t);
		for (let e of t) {
			if (!this.live.delete(e.id)) throw Error("The graph attempted to consume an item more than once.");
			this.state.consumedItems++;
		}
		for (let e of r.cost) t.some((t) => e.id === `donor:${t.id}`) || this.spend(e);
		if (this.state.actions++, r.item.allflameCopies) {
			let t = Yu(this.branches(e), e.ordering), n = 0, i = Infinity;
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
			if (this.state.steps >= this.graph.maxSteps) throw new td("Graph exceeded its step limit; expected cost is unresolved.");
			if (this.state.steps++, yield, t.kind === "acquire") {
				let e = null, n = Infinity;
				if (!this.options.acquisitions) for (let r of t.alternatives) {
					if (r.kind !== "purchase") continue;
					let i = this.graph.prices[`purchase:${t.id}:${r.id}`] ?? r.price;
					i && i.amount < n && (e = r.id, n = i.amount);
				}
				let r = t.choice.mode === "pinned" ? t.choice.alternativeId : this.options.acquisitions ? this.options.acquisitions.get(t.id)?.selectedId : e, i = t.alternatives.find((e) => e.id === r);
				if (!i) throw Error(`No priced acquisition choice is available at ${t.name}; pin a choice to calculate with unknown prices.`);
				this.visits(t.id).visits++;
				let a = i.kind === "production" ? yield* this.produce(i.nodeId) : this.token(structuredClone(i.item));
				if (this.options.trace && (this.state.nodeItems ??= {}, this.state.nodeItems[t.id] = a.item), i.kind === "purchase") {
					this.state.purchases++;
					let e = `purchase:${t.id}:${i.id}`;
					this.spend({
						id: e,
						name: i.name,
						amount: 1
					}, this.graph.prices[e] ?? i.price), this.options.trace && this.state.trace.push({
						nodeId: t.id,
						inputs: [],
						outputs: [a.id]
					});
				}
				if (this.queries.matches(a.item, t.output) !== "match") throw Error(`Acquisition output does not establish the query at ${t.name}.`);
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
			let t = Xu(this.queries.record(e.value.item), this.graph.outcomes.map((e) => ({
				...e,
				probability: this.options.probabilities?.get("$outcomes")?.get(e.id) ?? null
			})), this.graph.outcomeOrdering);
			if (t.status !== "matched") throw Error("The final item has no unambiguous configured terminal outcome.");
			this.finish(e.value, t.branchId);
		} catch (e) {
			let t = e;
			if (e instanceof nd) try {
				this.finish(e.token, e.outcomeId);
				return;
			} catch (e) {
				t = e;
			}
			this.state.status = t instanceof td ? "truncated" : "error", this.state.error = t instanceof Error ? t.message : String(t);
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
}, id = P({
	amount: A().nonnegative(),
	currency: O().min(1),
	source: L(["manual", "market"]),
	observedAt: Fi().optional(),
	confidence: A().min(0).max(1).nullable(),
	samples: A().int().nonnegative().optional(),
	cohortId: O().min(1).optional()
}), ad = P({
	id: O().min(1),
	name: O().min(1),
	kind: L(["purchase", "craft"]),
	expectedCost: A().nonnegative().nullable(),
	currency: O().min(1),
	expectedActions: A().nonnegative().nullable(),
	guaranteed: j(),
	confidence: A().min(0).max(1).nullable(),
	missingPrices: M(O()).default([])
}), od = F("mode", [P({ mode: R("automatic") }), P({
	mode: R("pinned"),
	alternativeId: O().min(1)
})]);
P({
	choice: od,
	selectedId: O().nullable(),
	alternatives: M(ad),
	incomplete: j()
});
//#endregion
//#region app/schemas/crafting-rulesets.ts
var sd = O().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/), cd = O().regex(/^[a-f0-9]{64}$/), ld = L(["poe1", "poe2"]), ud = P({
	era: sd,
	revision: sd,
	engine: sd,
	patch: sd,
	manifestSha256: cd,
	craftingSha256: cd
}), dd = P({
	kinds: M(sd).min(1),
	disabled: M(P({
		kind: sd,
		id: O().min(1)
	})).default([]),
	allflame: j()
}), fd = P({
	sha256: cd,
	bytes: A().int().positive()
}), pd = ud.extend({
	format: R(1),
	game: ld,
	label: O().min(1).max(150),
	notes: O().max(5e3),
	publishedAt: Fi(),
	catalog: fd,
	implementation: fd,
	availability: dd
});
P({
	format: R(1),
	revisions: M(pd),
	latest: M(P({
		game: ld,
		era: sd,
		revision: sd
	}))
});
//#endregion
//#region app/schemas/crafting-smart.ts
var md = L([
	"memoryStrands",
	"quality",
	"catalystQuality",
	"sockets",
	"links"
]), hd = F("kind", [P({ kind: R("once") }), P({
	kind: R("minimum"),
	field: md,
	value: A().int().min(1).max(100)
})]);
N({
	effect: O(),
	target: N({
		field: md,
		maximum: A().int().min(1).max(100),
		suggested: A().int().min(1).max(100)
	}).nullable(),
	available: j().nullable(),
	reason: O().nullable()
});
//#endregion
//#region app/schemas/crafting-graph.ts
var $ = O().min(1).max(100), gd = O().trim().min(1).max(120), _d = N({
	x: A(),
	y: A()
}).optional(), vd = F("kind", [
	P({ kind: R("return") }),
	P({
		kind: R("recover"),
		nodeId: $,
		inputId: $
	}),
	P({ kind: R("discard") }),
	P({
		kind: R("sell"),
		price: id.nullable()
	}),
	P({
		kind: R("terminal"),
		outcomeId: $
	})
]), yd = P({
	id: $,
	name: gd,
	query: Ao,
	destination: vd
}), bd = P({
	id: $,
	name: gd,
	source: $,
	query: Ao.optional()
}), xd = P({
	kind: R("purchase"),
	id: $,
	name: gd,
	item: Gs,
	price: id.nullable()
}), Sd = P({
	kind: R("production"),
	id: $,
	name: gd,
	nodeId: $
}), Cd = F("kind", [P({
	kind: R("acquire"),
	id: $,
	name: gd,
	position: _d,
	output: Ao,
	alternatives: M(F("kind", [xd, Sd])).min(1).max(20),
	choice: od.default({ mode: "automatic" })
}), P({
	kind: R("craft"),
	id: $,
	name: gd,
	position: _d,
	output: Ao,
	inputs: M(bd).min(1).max(2),
	method: Ys,
	smart: hd.optional(),
	applyWhen: Ao.optional(),
	branches: M(yd).max(24).default([]),
	ordering: L(["automatic", "manual"]).default("automatic"),
	fallback: vd.default({ kind: "return" })
})]), wd = P({
	id: $,
	name: gd,
	query: Ao,
	success: j().default(!0),
	disposition: L([
		"keep",
		"sell",
		"discard"
	]).default("keep"),
	price: id.nullable().default(null)
}), Td = P({
	format: R(1),
	id: $,
	name: gd,
	game: Ao.shape.game,
	ruleset: ud,
	currency: O().min(1).max(100).default("chaos"),
	league: O().min(1).max(100).optional(),
	nodes: M(Cd).min(1).max(100),
	entry: $,
	outcomes: M(wd).min(1).max(24),
	outcomeOrdering: L(["automatic", "manual"]).default("automatic"),
	prices: I(O(), id).default({}),
	seed: A().int().min(0).max(4294967295).default(42),
	iterations: A().int().min(1).max(1e5).default(1e3),
	maxSteps: A().int().min(1).max(1e6).default(1e4)
}), Ed = "crafting-graph-7";
function Dd(e, t) {
	return t.kind === "recombine" || t.kind === "socket_jewel" || t.kind === "currency" && e.crafting.currencies.find((e) => e.id === t.id)?.action === "transfer_item_influence" ? 2 : 1;
}
function Od(e) {
	return e.kind === "craft" ? e.inputs.map((e) => e.source) : e.alternatives.flatMap((e) => e.kind === "production" ? [e.nodeId] : []);
}
function kd(e) {
	let t = new Map(e.nodes.map((e) => [e.id, e])), n = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Set(), i = [];
	function a(e) {
		if (r.has(e)) throw Error("Production dependencies form a cycle. Model retries with a recovery branch to an input port.");
		if (n.has(e)) return;
		let o = t.get(e);
		if (!o) throw Error(`Unknown production node: ${e}`);
		r.add(e);
		for (let e of Od(o)) a(e);
		r.delete(e), n.add(e), i.push(o);
	}
	for (let t of e.nodes) a(t.id);
	return i;
}
function Ad(e, t) {
	let n = Td.parse(t);
	if (n.game !== e.game || n.ruleset.patch !== e.patch || n.ruleset.manifestSha256 !== e.manifestSha256 || n.ruleset.craftingSha256 !== e.craftingSha256) throw Error("This project requires its pinned catalog revision.");
	if (n.ruleset.engine !== "crafting-graph-7") throw Error("This project requires a different crafting engine revision.");
	let r = new Wu(e), i = Ju(r), a = (e, t) => {
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
			if (r.validateItem(e.item), e.item.destroyed) throw Error("A destroyed item cannot be purchased as a graph input.");
			if (l(e.price), i.matches(e.item, t.output) !== "match") throw Error(`Purchased item does not establish the output query: ${t.name}`);
		}
	} else {
		if (a(t.inputs, "Input ports"), a(t.branches, "Outcome branches"), t.inputs.length !== Dd(e, t.method)) throw Error(`${t.name} requires ${Dd(e, t.method)} item input(s).`);
		if ("donor" in t.method && t.method.donor || "jewel" in t.method && t.method.jewel) throw Error("Graph methods take their donor or Jewel from an input port, not an embedded inventory copy.");
		if (r.validateMethod(t.method), t.smart) {
			let e = $u(r, t, t.smart);
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
	return kd(n), n;
}
//#endregion
//#region app/lib/crafting-simulation.ts
function jd(e, t) {
	if (!t) return [0, 1];
	let n = e / t, r = 1.959963984540054, i = 1 + r * r / t, a = (n + r * r / (2 * t)) / i, o = r * Math.sqrt((n * (1 - n) + r * r / (4 * t)) / t) / i;
	return [Math.max(0, a - o), Math.min(1, a + o)];
}
//#endregion
//#region app/lib/crafting-graph-simulation.ts
function Md() {
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
function Nd(e, t) {
	for (let [n, r] of Object.entries(t)) e[n] = (e[n] ?? 0) + r;
}
function Pd(e, t) {
	e.trials++, e.returned += Number(t.status === "returned"), e.successes += Number(t.success), e.actions += t.actions, e.cost += t.knownCost, e.costSquared += t.knownCost ** 2, e.revenue += t.creditedRevenue, e.excludedRecovery += t.excludedRecovery, e.truncated += Number(t.status === "truncated"), t.error && t.status === "error" && Nd(e.errors, { [t.error]: 1 }), t.outcomeId && Nd(e.outcomes, { [t.outcomeId]: 1 });
	for (let n of t.missingPrices) e.missingPrices.add(n);
	for (let n of t.unpricedSales) e.unpricedSales.add(n);
	Nd(e.spending, t.spending);
	for (let [n, r] of Object.entries(t.visits)) {
		e.visits[n] ??= {
			visits: 0,
			matches: {},
			branches: {},
			recovered: 0
		};
		let t = e.visits[n];
		t.visits += r.visits, t.recovered += r.recovered, r.skipped && (t.skipped = (t.skipped ?? 0) + r.skipped), Nd(t.matches, r.matches), Nd(t.branches, r.branches), r.modelOdds && (t.modelOdds ??= {
			attempts: 0,
			branches: {},
			outcomes: {}
		}, t.modelOdds.attempts += r.modelOdds.attempts, Nd(t.modelOdds.branches, r.modelOdds.branches), Nd(t.modelOdds.outcomes, r.modelOdds.outcomes));
	}
}
function Fd(e) {
	return e.trials > 0 && e.truncated === 0 && Object.keys(e.errors).length === 0;
}
var Id = class {
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
	totals = Md();
	finalTotals = Md();
	trial = null;
	samples = [];
	work = 0;
	stopReason = "running";
	constructor(e, t, n = {}) {
		if (this.options = n, n.estimateIterations !== void 0 && (!Number.isSafeInteger(n.estimateIterations) || n.estimateIterations < 1 || n.estimateIterations > 1e4)) throw Error("Estimate iterations must be between 1 and 10,000.");
		if (n.workLimit !== void 0 && (!Number.isSafeInteger(n.workLimit) || n.workLimit < 1 || n.workLimit > 1e8)) throw Error("Work limit must be between 1 and 100,000,000.");
		this.graph = Ad(e, t), this.engine = new Wu(e), this.queries = Ju(this.engine), this.order = kd(this.graph), this.random = Vu(this.graph.seed);
	}
	get done() {
		return this.stopReason !== "running";
	}
	selectAcquisition(e) {
		let t = e.alternatives.map((t) => {
			if (t.kind === "purchase") {
				let n = `purchase:${e.id}:${t.id}`, r = this.graph.prices[n] ?? t.price;
				return {
					id: t.id,
					name: t.name,
					kind: "purchase",
					currency: this.graph.currency,
					expectedCost: r?.amount ?? null,
					expectedActions: 0,
					guaranteed: !0,
					confidence: r?.confidence ?? null,
					missingPrices: r ? [] : [n]
				};
			}
			let n = this.estimates.get(t.nodeId);
			return {
				id: t.id,
				name: t.name,
				kind: "craft",
				currency: this.graph.currency,
				expectedCost: n?.expectedCost ?? null,
				expectedActions: n?.expectedActions ?? null,
				guaranteed: !1,
				confidence: null,
				missingPrices: n?.missingPrices ?? []
			};
		}), n = Wo(t, e.choice);
		this.acquisitions.set(e.id, n);
		let r = t.find((e) => e.id === n.selectedId), i = e.alternatives.find((e) => e.id === n.selectedId), a = i?.kind === "production" ? this.estimates.get(i.nodeId) : void 0;
		this.estimates.set(e.id, {
			nodeId: e.id,
			trials: a?.trials ?? 0,
			returned: a?.returned ?? +!!r,
			returnProbability: a?.returnProbability ?? +!!r,
			returnInterval: a?.returnInterval ?? (r ? [1, 1] : [0, 1]),
			expectedCost: r?.expectedCost ?? null,
			expectedActions: r?.expectedActions ?? null,
			missingPrices: r?.missingPrices ?? [],
			complete: a?.complete ?? r !== void 0,
			errors: a?.errors ?? {}
		});
	}
	nextStage() {
		if (this.stage?.phase === "pilot") {
			let { node: e } = this.stage, t = this.totals.visits[e.id];
			e.kind === "craft" && t?.visits && this.probabilities.set(e.id, new Map(e.branches.map((e) => [e.id, (t.matches[e.id] ?? 0) / t.visits]))), this.stage = {
				node: e,
				phase: "estimate",
				trials: this.stage.trials
			}, this.totals = Md();
			return;
		}
		if (this.stage?.phase === "outcome-pilot") {
			this.probabilities.set("$outcomes", new Map(this.graph.outcomes.map((e) => [e.id, (this.totals.outcomeMatches[e.id] ?? 0) / Math.max(1, this.totals.trials)]))), this.stage = {
				node: this.stage.node,
				phase: "final",
				trials: this.graph.iterations
			}, this.totals = Md();
			return;
		}
		if (this.stage?.phase === "estimate") {
			let e = this.totals, t = Fd(e);
			this.estimates.set(this.stage.node.id, {
				nodeId: this.stage.node.id,
				trials: e.trials,
				returned: e.returned,
				returnProbability: e.returned / Math.max(1, e.trials),
				returnInterval: jd(e.returned, e.trials),
				expectedCost: t && !e.missingPrices.size && e.returned ? e.cost / e.returned : null,
				expectedActions: t && e.returned ? e.actions / e.returned : null,
				missingPrices: [...e.missingPrices],
				complete: t,
				errors: e.errors
			});
		}
		if (this.stage?.phase === "final") {
			this.finalTotals = this.totals, this.stopReason = "complete";
			return;
		}
		for (; this.nextNode < this.order.length;) {
			let e = this.order[this.nextNode++];
			if (e.kind === "acquire") {
				this.selectAcquisition(e);
				continue;
			}
			this.stage = {
				node: e,
				phase: "pilot",
				trials: this.options.estimateIterations ?? Math.min(this.graph.iterations, 100)
			}, this.totals = Md();
			return;
		}
		this.stage = {
			node: this.order.find((e) => e.id === this.graph.entry),
			phase: "outcome-pilot",
			trials: this.options.estimateIterations ?? Math.min(this.graph.iterations, 100)
		}, this.totals = Md();
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
		if (this.totals.trials >= e) {
			this.nextStage();
			return;
		}
		if (this.trial ||= new rd(this.engine, this.graph, this.random, {
			entry: this.stage.node.id,
			classify: this.stage.phase === "final",
			trace: this.stage.phase === "final" && this.samples.length < 3,
			acquisitions: this.acquisitions,
			probabilities: this.probabilities,
			modelOdds: this.stage.phase === "final",
			oddsCache: this.oddsCache
		}, this.queries), this.trial.advance(), this.work++, this.trial.done) {
			let e = this.trial.result();
			if (Pd(this.totals, e), e.item && this.stage.node.id === this.graph.entry) {
				let t = this.queries.record(e.item);
				for (let e of this.graph.outcomes) zo(t, e.query) === "match" && Nd(this.totals.outcomeMatches, { [e.id]: 1 });
			}
			this.stage.phase === "final" && this.samples.length < 3 && this.samples.push(e), this.trial = null;
		}
	}
	runBatch(e = 250) {
		for (let t = 0; t < e && !this.done; t++) this.advance();
		return this.done;
	}
	result() {
		let e = this.stage?.phase === "final" ? this.totals : this.finalTotals, t = this.stopReason === "complete" && Fd(e), n = t && !e.missingPrices.size ? e.cost / e.trials : null, r = t && !e.unpricedSales.size ? e.revenue / e.trials : null, i = e.trials > 1 ? Math.max(0, (e.costSquared - e.cost ** 2 / e.trials) / (e.trials - 1)) : 0, a = e.trials > 1 ? 1.96 * Math.sqrt(i / e.trials) : null;
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
			interval: e.trials ? jd(e.successes, e.trials) : [0, 1],
			outcomes: this.graph.outcomes.map((n) => ({
				id: n.id,
				count: e.outcomes[n.id] ?? 0,
				probability: t ? (e.outcomes[n.id] ?? 0) / e.trials : null,
				interval: e.trials ? jd(e.outcomes[n.id] ?? 0, e.trials) : [0, 1]
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
}, Ld = Ed;
function Rd(e, t, n) {
	return new Id(Ns.parse(e), t, n);
}
//#endregion
export { Rd as createSimulation, Ld as revision };
