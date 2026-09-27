export type Algo = 'rr' | 'random' | 'least' | 'p2c' | 'hash';

export const ALGOS: Record<Algo, { label: string; desc: string; nginx: string; haproxy: string }> = {
  rr: { label: 'Round robin', desc: 'Each planet in turn. Fair when every planet is equally fast, and blind when one of them slows down.', nginx: 'upstream planets {\n  server s1; server s2; server s3;\n}', haproxy: 'balance roundrobin' },
  random: { label: 'Random', desc: 'Any planet at random. It evens out over time, but short bursts can pile onto one planet.', nginx: 'upstream planets {\n  random;\n  server s1; server s2; server s3;\n}', haproxy: 'balance random' },
  least: { label: 'Least conn', desc: 'The planet with the fewest requests in flight. A slow planet holds its requests longer, so it naturally gets fewer new ones.', nginx: 'upstream planets {\n  least_conn;\n  server s1; server s2; server s3;\n}', haproxy: 'balance leastconn' },
  p2c: { label: 'Two choices', desc: 'Pick two planets at random and send to the less busy one. Almost as good as least-conn, with no global view needed.', nginx: 'upstream planets {\n  random two least_conn;\n  server s1; server s2; server s3;\n}', haproxy: 'balance random(2)' },
  hash: { label: 'Consistent hash', desc: 'The crystal decides the planet, so the same crystal always comes from the same planet and its local cache stays warm. When a planet leaves, only its own keys move.', nginx: 'upstream planets {\n  hash $request_uri consistent;\n  server s1; server s2; server s3;\n}', haproxy: 'balance uri\n  hash-type consistent' },
};

export const lbConfig = (a: Algo) => `# nginx\n${ALGOS[a].nginx}\n\n# HAProxy\nbackend planets\n  ${ALGOS[a].haproxy}`;
