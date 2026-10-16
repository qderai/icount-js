// Copyright 2026 Qder AI (Itay Funes). Licensed under the Apache License, Version 2.0.

export declare const ICOUNT_BASE: string;

export declare class ICountError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string);
}

export declare function shekels(agorot: number): number;

export interface IssuedDocument { docType: string; docNum: number; docUrl: string; clientId: number | null }
export interface BankAccount { id: number; bank: string; branch: string; account: string; currency: string }

export declare class ICount {
  readonly base: string;
  constructor(opts: { token: string; fetch?: typeof fetch; base?: string });
  call<T = any>(path: string, body?: Record<string, unknown>): Promise<T>;
  createDocument(doc: Record<string, unknown>): Promise<IssuedDocument>;
  cancelDocument(doctype: string, docnum: number, reason: string): Promise<any>;
  bankAccounts(): Promise<BankAccount[]>;
}

export interface Line { description: string; unitAgorot: number; quantity?: number }
export declare function items(lines: Line[], opts?: { taxExempt?: boolean }): { description: string; unitprice: number; quantity: number; tax_exempt?: true }[];

interface ClientFields { clientId?: string | number; clientName: string; email?: string | null; vatId?: string | null }
interface DocOptions { taxExempt?: boolean; lang?: "he" | "en"; sendEmail?: boolean }

export declare function deal(d: ClientFields & DocOptions & {
  id: string; lines: Line[]; dueDate?: Date | number | string; title?: string; note?: string;
}): Record<string, unknown>;

export declare function transferReceipt(r: ClientFields & DocOptions & {
  id: string; lines: Line[]; amountAgorot: number; paidAt: Date | number | string; bankAccountId: number;
  dealNum?: number | null; reference?: string | null;
}): Record<string, unknown>;
