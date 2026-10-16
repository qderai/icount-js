// Copyright 2026 Qder AI. Licensed under the Apache License, Version 2.0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ICount, ICountError, deal, items, shekels, transferReceipt } from "../src/index.js";

const ok = (body) => new Response(JSON.stringify({ status: true, ...body }), { status: 200, headers: { "content-type": "application/json" } });

function fake(answer) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return answer(url, init); };
  return { fetch, calls };
}

test("a call posts JSON with the bearer token to api/v3.php/<path>", async () => {
  const f = fake(() => ok({ doctype: "deal", docnum: 1001, doc_url: "https://example.test/d/1001", client_id: 7 }));
  const ic = new ICount({ token: " tok-123 ", fetch: f.fetch });
  const doc = await ic.createDocument({ doctype: "deal" });
  assert.deepEqual(doc, { docType: "deal", docNum: 1001, docUrl: "https://example.test/d/1001", clientId: 7 });
  assert.equal(f.calls[0].url, "https://api.icount.co.il/api/v3.php/doc/create");
  assert.equal(f.calls[0].init.headers.authorization, "Bearer tok-123");
  assert.equal(f.calls[0].init.method, "POST");
});

test("iCount's 200 with status:false is an error carrying its reason; so is an HTTP error", async () => {
  const no = new ICount({ token: "t", fetch: async () => new Response(JSON.stringify({ status: false, reason: "bad_doctype", error_description: "no such doctype" }), { status: 200 }) });
  await assert.rejects(no.call("doc/create", {}), (e) => e instanceof ICountError && e.reason === "bad_doctype" && /no such doctype/.test(e.message));
  const down = new ICount({ token: "t", fetch: async () => new Response("<html>", { status: 502 }) });
  await assert.rejects(down.call("doc/create"), (e) => e.reason === "http_502");
});

test("no token, no client; the token never appears in an error", async () => {
  assert.throws(() => new ICount({ token: "  " }), ICountError);
  const ic = new ICount({ token: "secret-token-value", fetch: async () => new Response(JSON.stringify({ status: false, reason: "auth" }), { status: 200 }) });
  await assert.rejects(ic.call("x"), (e) => !String(e.message).includes("secret-token-value"));
});

test("money: agorot in, shekels out, no float drift", () => {
  assert.equal(shekels(119000), 1190);
  assert.equal(shekels(1999), 19.99);
  assert.deepEqual(items([{ description: "Plan", unitAgorot: 99000, quantity: 3 }], { taxExempt: true }), [{ description: "Plan", unitprice: 990, quantity: 3, tax_exempt: true }]);
});

test("a deal: client, due date, items, note, and your id as the idempotency key", () => {
  const d = deal({ id: "inv_2026_10_abc", clientId: "c1", clientName: "מסעדה בע\"מ", email: "a@example.test", lines: [{ description: "מנוי", unitAgorot: 119000 }], dueDate: "2026-11-01T00:00:00Z", title: "מנוי אוקטובר", note: "לתשלום בהעברה", taxExempt: true });
  assert.equal(d.doctype, "deal");
  assert.equal(d.custom_client_id, "c1");
  assert.equal(d.paydate, "2026-11-01");
  assert.equal(d.items[0].unitprice, 1190);
  assert.equal(d.sanity_string, "inv_2026_10_abc");
  assert.equal(d.tax_exempt, true);
  assert.equal(d.send_email, false);
  assert.equal("vat_id" in d, false);
});

test("a transfer receipt closes the deal it pays", () => {
  const r = transferReceipt({ id: "inv_1", clientName: "X", lines: [{ description: "Plan", unitAgorot: 50000 }], amountAgorot: 50000, paidAt: Date.UTC(2026, 9, 3), bankAccountId: 4, dealNum: 1001, reference: "TRX-9" });
  assert.deepEqual(r.banktransfer, { sum: 500, date: "2026-10-03", account: 4 });
  assert.deepEqual(r.based_on, [{ doctype: "deal", docnum: 1001 }]);
  assert.equal(r.sanity_string, "r-inv_1");
  assert.match(r.hwc, /TRX-9/);
});

test("bank accounts are read whatever iCount names the fields", async () => {
  const ic = new ICount({ token: "t", fetch: async () => ok({ bank_accounts: { a: { id: "3", bank_name: "12", branch: "600", account: "123456" }, b: { account_id: 9, bank: "10", bank_branch: "1", bank_account: "9", currency_code: "USD" } } }) });
  assert.deepEqual(await ic.bankAccounts(), [
    { id: 3, bank: "12", branch: "600", account: "123456", currency: "ILS" },
    { id: 9, bank: "10", branch: "1", account: "9", currency: "USD" },
  ]);
});
