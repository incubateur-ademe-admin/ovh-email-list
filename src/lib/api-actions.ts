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

/**
 * Fetch all available domains
 */
export async function fetchDomainsAction(initialDomain?: string): Promise<ApiResponse<string[]>> {
  try {
    const data = await ovhClient.requestPromised("GET", `/email/domain${initialDomain ? `/${encodeURIComponent(initialDomain)}` : ''}`);

    return {
      success: true,
      data: Array.isArray(data) ? data : [data.domain],
    };
  } catch (error) {
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
    const redirectionIds: string[] = await ovhClient.requestPromised("GET", `/email/domain/${domain}/redirection`);

    if (redirectionIds.length === 0) {
      return {
        success: true,
        data: {
          domain,
          redirections: [],
        },
      };
    }

    const redirections: Redirection[] = await Promise.all(
      redirectionIds.map(
        async (id) => ovhClient.requestPromised("GET", `/email/domain/${domain}/redirection/${id}`)
      )
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
        const returned = await ovhClient.requestPromised("POST", `/email/domain/${domain}/redirection`, {
          from: request.from,
          to,
          localCopy: false,
        });

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
    await ovhClient.requestPromised("DELETE", `/email/domain/${domain}/redirection/${request.id}`);

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

  console.log("password", password, process.env.BASIC_AUTH_PASS);

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
