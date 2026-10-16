// Copyright 2026 Qder AI. Licensed under the Apache License, Version 2.0.
/**
 * A small client for the iCount API (https://api.icount.co.il), the Israeli invoicing and bookkeeping service.
 *
 * - One call shape: POST JSON to api/v3.php/<path> with a Bearer token. iCount answers HTTP 200 with
 *   `status: false` on failure; that is thrown here as an ICountError with iCount's `reason`.
 * - Money goes in as agorot (integers) and is sent as shekels, so no float ever accumulates in your code.
 * - `sanity_string` (iCount's idempotency key) is set from your own id, so a retried request never issues a
 *   second document.
 * Works in Node 18+, Cloudflare Workers, Deno and browsers (anything with fetch). The token is never logged.
 */

export const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php/";

export class ICountError extends Error {
  /** @param {string} reason iCount's machine reason (or http_<status>) @param {string} [message] */
  constructor(reason, message) {
    super(message ?? reason);
    this.name = "ICountError";
    this.reason = reason;
  }
}

/** Agorot (integer) to shekels with two decimals. */
export const shekels = (agorot) => Math.round(Number(agorot)) / 100;
const isoDay = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

export class ICount {
  /**
   * @param {{ token: string, fetch?: typeof fetch, base?: string }} opts
   */
  constructor({ token, fetch: fetcher = globalThis.fetch, base = ICOUNT_BASE } = {}) {
    if (!token || !String(token).trim()) throw new ICountError("not_configured", "An iCount API token is required");
    this.#token = String(token).trim();
    this.#fetch = fetcher;
    this.base = base;
  }
  #token;
  #fetch;

  /** One API call. Resolves with iCount's JSON; throws ICountError when iCount says no. */
  async call(path, body = {}) {
    const res = await this.#fetch(this.base + String(path).replace(/^\/+/, ""), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.#token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.status === false) {
      const reason = String(data?.reason ?? data?.error ?? `http_${res.status}`);
      throw new ICountError(reason, `iCount ${path}: ${reason}${data?.error_description ? ` (${data.error_description})` : ""}`);
    }
    return data;
  }

  /** Create any document (doctype "invrec", "invoice", "receipt", "deal", "refund", ...). */
  async createDocument(doc) {
    return issued(await this.call("doc/create", doc));
  }

  /** Cancel a document. iCount records the cancellation as a document of its own. */
  cancelDocument(doctype, docnum, reason) {
    return this.call("doc/cancel", { doctype, docnum, reason });
  }

  /**
   * The company's bank accounts. iCount does not document this response's field names, so several spellings are
   * read and anything missing comes back as an empty string rather than an error.
   */
  async bankAccounts() {
    const d = await this.call("bank/accounts");
    const raw = d?.bank_accounts ?? d?.accounts ?? {};
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    return list.map((a) => ({
      id: Number(a.id ?? a.account_id ?? a.bank_account_id ?? 0),
      bank: String(a.bank_name ?? a.bank ?? a.bank_number ?? ""),
      branch: String(a.branch ?? a.bank_branch ?? a.branch_number ?? ""),
      account: String(a.account ?? a.bank_account ?? a.account_number ?? ""),
      currency: String(a.currency_code ?? "ILS"),
    }));
  }
}

function issued(d) {
  return { docType: String(d.doctype ?? ""), docNum: Number(d.docnum), docUrl: String(d.doc_url ?? ""), clientId: d.client_id ? Number(d.client_id) : null };
}

/* ------------------------------------------------------------ document builders (pure) */

/**
 * Your lines as iCount items. `unitAgorot` is the price per unit in agorot.
 * @param {{ description: string, unitAgorot: number, quantity?: number }[]} lines
 * @param {{ taxExempt?: boolean }} [opts]
 */
export function items(lines, { taxExempt = false } = {}) {
  return lines.map((l) => ({
    description: String(l.description).slice(0, 200),
    unitprice: shekels(l.unitAgorot),
    quantity: l.quantity ?? 1,
    ...(taxExempt ? { tax_exempt: true } : {}),
  }));
}

const client = (c) => ({
  ...(c.clientId != null ? { custom_client_id: String(c.clientId) } : {}),
  client_name: String(c.clientName).slice(0, 120),
  ...(c.email ? { email: c.email } : {}),
  ...(c.vatId ? { vat_id: c.vatId } : {}),
});

/**
 * A חשבון עסקה (doctype "deal"): asks for payment, e.g. by bank transfer. `id` is your own id for it, used as the
 * idempotency key, so a retry never issues a second deal.
 */
export function deal({ id, clientId, clientName, email, vatId, lines, dueDate, title, note, taxExempt = false, lang = "he", sendEmail = false }) {
  return {
    doctype: "deal",
    ...client({ clientId, clientName, email, vatId }),
    ...(title ? { doc_title: title } : {}),
    ...(dueDate ? { paydate: isoDay(dueDate) } : {}),
    currency_code: "ILS",
    ...(taxExempt ? { tax_exempt: true } : {}),
    items: items(lines, { taxExempt }),
    ...(note ? { hwc: note } : {}),
    sanity_string: String(id).slice(0, 30),
    doc_lang: lang,
    send_email: sendEmail,
  };
}

/**
 * A קבלה (doctype "receipt") for a bank transfer that arrived, optionally closing the deal it pays.
 * `bankAccountId` is the account in iCount the money landed in (see ICount#bankAccounts).
 */
export function transferReceipt({ id, clientId, clientName, email, vatId, lines, amountAgorot, paidAt, bankAccountId, dealNum, reference, taxExempt = false, lang = "he", sendEmail = false }) {
  return {
    doctype: "receipt",
    ...client({ clientId, clientName, email, vatId }),
    doc_date: isoDay(paidAt),
    currency_code: "ILS",
    ...(taxExempt ? { tax_exempt: true } : {}),
    items: items(lines, { taxExempt }),
    banktransfer: { sum: shekels(amountAgorot), date: isoDay(paidAt), account: bankAccountId },
    ...(dealNum ? { based_on: [{ doctype: "deal", docnum: dealNum }] } : {}),
    ...(reference ? { hwc: `אסמכתת העברה: ${String(reference).slice(0, 120)}` } : {}),
    sanity_string: `r-${id}`.slice(0, 30),
    doc_lang: lang,
    send_email: sendEmail,
  };
}
