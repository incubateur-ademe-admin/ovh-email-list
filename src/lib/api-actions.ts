"use server";

import type {
  Redirection,
  CreateMultipleRedirectionsRequest,
  DeleteRedirectionRequest,
  ApiResponse,
  DomainRedirectionsResponse,
} from "@/types/api";
import { isOvhError, ovhClient } from './ovh';

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
    const newRedirections: Redirection[] = request.toEmails.map((to, index) => ({
      id: `${Date.now()}-${index}`,
      from: request.from,
      to,
    }));

    await Promise.all(
      newRedirections.map((redirection) =>
        ovhClient.requestPromised("POST", `/email/domain/${domain}/redirection`, {
          from: redirection.from,
          to: redirection.to,
          localCopy: false, // Assuming local copy is not needed
        })
      )
    );
    
    return {
      success: true,
      data: newRedirections,
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
