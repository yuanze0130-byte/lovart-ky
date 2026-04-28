import crypto from 'crypto';

export type XunhuChannel = 'alipay';

export interface XunhuCreatePaymentInput {
  orderNo: string;
  amount: number;
  title: string;
  notifyUrl: string;
  returnUrl?: string;
}

export interface XunhuCreatePaymentResult {
  request: Record<string, string>;
  response: unknown;
  payUrl: string | null;
  raw: unknown;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name}_NOT_CONFIGURED`);
  }
  return value;
}

export function getXunhuConfig() {
  const appId = requiredEnv('XUNHU_APP_ID');
  const appSecret = requiredEnv('XUNHU_APP_SECRET');
  const apiBaseUrl = (process.env.XUNHU_API_BASE_URL || 'https://api.xunhupay.com').trim().replace(/\/+$/, '');
  const wapUrl = (process.env.XUNHU_WAP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const wapName = (process.env.XUNHU_WAP_NAME || 'Lovart KY').trim();

  if (!wapUrl) {
    throw new Error('XUNHU_WAP_URL_NOT_CONFIGURED');
  }

  return {
    appId,
    appSecret,
    apiBaseUrl,
    wapUrl,
    wapName,
  };
}

function normalizeParamValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export function getXunhuHash(params: Record<string, unknown>, appSecret: string) {
  const sorted = Object.keys(params)
    .filter((key) => key !== 'hash')
    .map((key) => [key, normalizeParamValue(params[key])] as const)
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('md5').update(`${sorted}${appSecret}`, 'utf8').digest('hex');
}

export function verifyXunhuNotification(payload: Record<string, unknown>) {
  const { appSecret } = getXunhuConfig();
  const actualHash = normalizeParamValue(payload.hash).toLowerCase();
  if (!actualHash) return false;
  const expectedHash = getXunhuHash(payload, appSecret).toLowerCase();
  return actualHash === expectedHash;
}

function buildPaymentPayload(input: XunhuCreatePaymentInput) {
  const { appId, appSecret, wapName, wapUrl } = getXunhuConfig();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();

  const params: Record<string, string> = {
    version: '1.1',
    appid: appId,
    trade_order_id: input.orderNo,
    total_fee: input.amount.toFixed(2),
    title: input.title,
    time: String(nowSeconds),
    notify_url: input.notifyUrl,
    nonce_str: nonce,
    type: 'WAP',
    wap_url: input.returnUrl?.trim() || wapUrl,
    wap_name: wapName,
  };

  params.hash = getXunhuHash(params, appSecret);
  return params;
}

function extractPayUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const candidates = [record.url, record.pay_url, record.payUrl, record.redirect, record.redirect_url, record.qrcode];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  if (record.data && typeof record.data === 'object') {
    return extractPayUrl(record.data);
  }
  return null;
}

export async function createXunhuPayment(input: XunhuCreatePaymentInput): Promise<XunhuCreatePaymentResult> {
  const { apiBaseUrl } = getXunhuConfig();
  const request = buildPaymentPayload(input);
  const body = new URLSearchParams(request);

  const response = await fetch(`${apiBaseUrl}/payment/do.html`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const rawText = await response.text();
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = rawText;
  }

  if (!response.ok) {
    throw new Error(`XUNHU_CREATE_ORDER_FAILED:${response.status}:${rawText.slice(0, 300)}`);
  }

  return {
    request,
    response: parsed,
    payUrl: extractPayUrl(parsed),
    raw: parsed,
  };
}
