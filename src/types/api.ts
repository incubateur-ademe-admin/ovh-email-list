export interface Redirection {
  id: string
  from: string
  to: string
}

export interface CreateRedirectionRequest {
  from: string
  to: string
}

export interface CreateMultipleRedirectionsRequest {
  from: string
  toEmails: string[]
}

export interface UpdateRedirectionRequest {
  id: string
  from: string
  to: string
}

export interface DeleteRedirectionRequest {
  id: string
  from: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface DomainRedirectionsResponse {
  domain: string
  redirections: Redirection[]
}
