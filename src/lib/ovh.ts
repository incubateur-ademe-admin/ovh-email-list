import ovh from "@ovhcloud/node-ovh";
import { OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY, OVH_ENDPOINT } from './config';

export const ovhClient = ovh({
  appKey: OVH_APP_KEY,
  appSecret: OVH_APP_SECRET,
  consumerKey: OVH_CONSUMER_KEY,
  endpoint: OVH_ENDPOINT,
});

export function isOvhError(error: unknown): error is { message: string, error: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'error' in error &&
    typeof (error as { message: string, error: number }).message === 'string' &&
    typeof (error as { message: string, error: number }).error === 'number'
  );
}
