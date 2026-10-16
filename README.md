# icount-js

A small, typed client for the [iCount](https://www.icount.co.il) API, the Israeli invoicing and bookkeeping
service. No dependencies; runs anywhere `fetch` does (Node 18+, Cloudflare Workers, Deno, browsers).

```js
import { ICount, deal, transferReceipt } from "@qderai/icount";

const icount = new ICount({ token: process.env.ICOUNT_TOKEN });

// Ask for payment by bank transfer (a חשבון עסקה).
const d = await icount.createDocument(deal({
  id: "inv_2026_10_42",                 // your id: a retry never issues a second document
  clientId: "cust_42",
  clientName: "מסעדה לדוגמה בע\"מ",
  email: "billing@example.co.il",
  lines: [{ description: "מנוי חודשי", unitAgorot: 119000 }],
  dueDate: "2026-11-01",
  note: "לתשלום בהעברה בנקאית. אסמכתא: INV-42",
}));

// The money arrived: a קבלה that closes the deal.
const [account] = await icount.bankAccounts();
await icount.createDocument(transferReceipt({
  id: "inv_2026_10_42",
  clientId: "cust_42",
  clientName: "מסעדה לדוגמה בע\"מ",
  lines: [{ description: "מנוי חודשי", unitAgorot: 119000 }],
  amountAgorot: 119000,
  paidAt: new Date(),
  bankAccountId: account.id,
  dealNum: d.docNum,
  reference: "TRX-9981",
}));
```

## What it does for you

- **Errors are errors.** iCount answers HTTP 200 with `status: false` when it refuses a request. That throws an
  `ICountError` whose `reason` is iCount's own reason code.
- **Money in agorot.** Pass integers (`119000` = ₪1,190.00); the client sends shekels. No float drift in your code.
- **Retries are safe.** The builders set iCount's `sanity_string` from your own id, so sending the same document
  twice issues it once.
- **Exempt dealers.** `taxExempt: true` marks every line exempt (עוסק פטור).
- **Any document.** `createDocument()` takes any iCount document body; `deal()` and `transferReceipt()` are
  builders for the two most common ones, `cancelDocument()` cancels, and `call(path, body)` reaches the rest of
  the API.
- The token is held privately and never appears in errors.

## Tests

```sh
npm test
```

All tests run against a mocked `fetch`; nothing is sent to iCount.

## License

Apache-2.0. Copyright 2026 Qder AI. iCount is a trademark of its owner; this is an independent client and is not
affiliated with or endorsed by iCount.
