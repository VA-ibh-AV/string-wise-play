/** TCP connections by comm: every process named on the left talks to every one named on the right. */
export const CONNECTIONS: [string, string][] = [
  ['nginx: worker', 'envoy'],
  ['envoy', 'checkout-api'],
  ['checkout-api', 'postgres: app checkout SELECT'],
  ['checkout-api', 'postgres: app checkout idle'],
  ['checkout-api', 'redis-server'],
];
