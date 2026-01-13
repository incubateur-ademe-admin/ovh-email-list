"use server";

import type {
  Redirection,
  CreateMultipleRedirectionsRequest,
  DeleteRedirectionRequest,
  ApiResponse,
  DomainRedirectionsResponse,
} from "@/types/api";
import { isOvhError, ovhClient } from './ovh';
import { cookies } from 'next/headers';
import { APP_DOMAIN, COOKIE_MAX_AGE, COOKIE_NAME, IS_PRODUCTION } from './config';
import { createSignedCookieValue, verifyPassword } from './auth';

// Simple request wrapper with retries for transient server errors (5xx)
async function requestWithRetries<T>(method: string, path: string, body?: unknown, maxAttempts = 4, baseDelay = 300) {
  let attempt = 0;
  while (true) {
    try {
      // OVH client may throw or return errors; let caller handle non-2xx content
      // For POST/DELETE we still retry conservatively but be aware of non-idempotence.
      const res = await ovhClient.requestPromised(method, path, body);
      return res as T;
    } catch (err: unknown) {
      attempt += 1;
        const isServerError = (e: unknown): boolean => {
          if (!e || typeof e !== 'object') return false;
          const maybe = e as Record<string, unknown>;
          if (typeof maybe.error === 'number') {
            const code = maybe.error as number;
            return code >= 500 && code < 600;
          }
          return false;
        };

      // If error looks like an OVH 5xx, we can retry
      if (isServerError(err) && attempt < maxAttempts) {
        const jitter = Math.random() * 100;
        const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
        console.warn(`OVH server error on ${method} ${path}, attempt ${attempt}/${maxAttempts}, retrying in ${Math.round(delay)}ms`, err);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // For unexpected rejections where err is not an Error, normalize and rethrow
      if (err && typeof err === 'object' && !(err instanceof Error)) {
        throw new Error(JSON.stringify(err));
      }

      throw err;
    }
  }
}

/**
 * Fetch all available domains
 */
export async function fetchDomainsAction(initialDomain?: string): Promise<ApiResponse<string[]>> {
  try {
    const path = `/email/domain${initialDomain ? `/${encodeURIComponent(initialDomain)}` : ''}`;
    const data = await requestWithRetries<Record<string, unknown> | string[] | { domain: string }>("GET", path);

    const domains: string[] = Array.isArray(data) ? (data as string[]) : [((data as { domain?: unknown }).domain as string) || String(data)];
    return {
      success: true,
      data: domains,
    };
  } catch (error: unknown) {
    if (isOvhError(error)) {
      if (error.error === 404) {
        return {
          success: false,
          error: "Domain(s) not found",
        };
      }
    }
    
    console.error("Error fetching domains:", error);
    return {
      success: false,
      error: "Failed to fetch domains",
    };
  }
}

/**
 * Fetch redirections for a specific domain
 */
export async function fetchRedirectionsByDomainAction(
  domain: string,
): Promise<ApiResponse<DomainRedirectionsResponse>> {
  try {
    // first fetch the list of redirection ids with retries for transient errors
    const redirectionIds: string[] = await requestWithRetries<string[]>("GET", `/email/domain/${domain}/redirection`);

    if (!Array.isArray(redirectionIds) || redirectionIds.length === 0) {
      return {
        success: true,
        data: {
          domain,
          redirections: [],
        },
      };
    }

    // Fetch individual redirections in parallel, but tolerate occasional failures per-id
    const redirections: Redirection[] = [];
    await Promise.all(
      redirectionIds.map(async (id) => {
        try {
          const r = await requestWithRetries<Redirection>("GET", `/email/domain/${domain}/redirection/${id}`);
          if (r) redirections.push(r);
        } catch (e: unknown) {
          // Log and skip this id — keep other successful ones
          console.warn(`Failed to fetch redirection ${id} for ${domain}:`, e);
        }
      }),
    );

    return {
      success: true,
      data: {
        domain,
        redirections,
      },
    };
  } catch (error: unknown) {
    console.error(`Error fetching redirections for ${domain}:`, error);
    return {
      success: false,
      error: `Failed to fetch redirections for ${domain}`,
    };
  }
}

/**
 * Create multiple redirections for a single "from" email
 */
export async function createRedirectionsAction(
  request: CreateMultipleRedirectionsRequest,
): Promise<ApiResponse<Redirection[]>> {
  const domain = request.from.split("@")[1];

  try {
    // Call OVH API and collect returned IDs for each created redirection
    const createdRedirections: Redirection[] = await Promise.all(
      request.toEmails.map(async (to, index) => {
        const returned = await requestWithRetries<string | number>("POST", `/email/domain/${domain}/redirection`, {
          from: request.from,
          to,
          localCopy: false,
        }, 2);

        // OVH may return the newly created redirection id (string or number)
        const id = typeof returned === "string" || typeof returned === "number" ? String(returned) : `${Date.now()}-${index}`;

        return {
          id,
          from: request.from,
          to,
        };
      }),
    );

    return {
      success: true,
      data: createdRedirections,
    };
  } catch (error: unknown) {
    console.error(`Error creating redirections for ${request.from}:`, error);

    return {
      success: false,
      error: "Failed to create redirections",
    };
  }
}

/**
 * Delete a specific redirection
 */
export async function deleteRedirectionAction(request: DeleteRedirectionRequest): Promise<ApiResponse<void>> {
  const domain = request.from.split("@")[1];

  try {
    await requestWithRetries<void>("DELETE", `/email/domain/${domain}/redirection/${request.id}`, undefined, 2);

    return {
      success: true,
    };
  } catch (error: unknown) {
    console.error(`Error deleting redirection ${request.id} for ${request.from}:`, error);
    return {
      success: false,
      error: "Failed to delete redirection",
    };
  }
}

export async function login(password: string): Promise<ApiResponse<void>> {
  if (!password) {
    return {
      success: false,
      error: "Password is required",
    };
  }

  // Verify password (supports hashed env var)
  const ok = await verifyPassword(password);
  if (!ok) {
    return { success: false, error: 'Invalid password' };
  }

  const cookieValue = await createSignedCookieValue(COOKIE_MAX_AGE);
  const _cookies = await cookies();
  _cookies.set({
    name: COOKIE_NAME,
    value: cookieValue,
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: IS_PRODUCTION,
    path: '/',
    sameSite: 'lax',
    domain: IS_PRODUCTION ? APP_DOMAIN : undefined,
  });

  return { success: true };
}
