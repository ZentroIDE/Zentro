// SPDX-License-Identifier: GPL-3.0-only

const base =
    ((import.meta.env.VITE_APP_URL as string | undefined) ?? '').replace(/\/$/, '') ||
    'https://zentro-ide.com';
const apiBase =
    ((import.meta.env.VITE_APP_API_URL as string | undefined) ?? '').replace(/\/$/, '') || '';

export const APP_URL = base;
export const APP_API_URL = apiBase;
export const PRICING_URL = `${base}/pricing`;
export const DOWNLOADS_URL = `${base}/downloads`;
export const PRIVACY_POLICY_URL = `${base}/privacy-policy`;
export const TERMS_URL = `${base}/terms`;
export const EULA_URL = `${base}/eula`;
