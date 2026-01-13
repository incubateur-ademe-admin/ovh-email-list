export const OVH_ENDPOINT = process.env.OVH_ENDPOINT || "ovh-eu";
export const OVH_APP_KEY = process.env.OVH_APP_KEY || "";
export const OVH_APP_SECRET = process.env.OVH_APP_SECRET || "";
export const OVH_CONSUMER_KEY = process.env.OVH_CONSUMER_KEY || "";
export const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || "admin";
export const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS;
export const APP_DOMAIN = process.env.APP_DOMAIN || "localhost";
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Cookie settings
export const COOKIE_NAME = 'email-lists-basic-auth';
export const COOKIE_MAX_AGE = 5 * 60; // 5 minutes en secondes
export const COOKIE_SECRET = process.env.COOKIE_SECRET || "";
