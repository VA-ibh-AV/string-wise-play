/** The real path of one HTTPS request, as data. Addresses are RFC 5737 documentation ranges. */

export type HopTag = 'DNS' | 'TCP' | 'TLS' | 'NAT' | 'ROUTE' | 'LB' | 'KERNEL' | 'APP';

export interface PacketHeader {
  src: string;
  sport: number | null;
  dst: string;
  dport: number | null;
  ttl: number;
  proto: 'UDP' | 'TCP' | '—';
  flags: string;
  seq: string;
  ack: string;
  state: string;
}

export interface Hop {
  /** Position along the track, 0..1. */
  u: number;
  tag: HopTag;
  title: string;
  /** Label on the planet beside the track. */
  station: string;
  /** Shown after passing: one or two plain sentences. */
  text: string;
  /** Shown before reaching it, so you know what is coming. */
  next: string;
  set: Partial<PacketHeader>;
  /** tcpdump -n style line. */
  log: string;
  /** Simulated latency this step adds. */
  ms: number;
  /** Packet colour from here on (NAT turns it amber). */
  color?: number;
}

export interface Zone {
  id: string;
  name: string;
  from: number;
  to: number;
  color: number;
}

export const ZONES: Zone[] = [
  { id: 'laptop', name: 'Your laptop', from: 0, to: 0.06, color: 0x7ff0d0 },
  { id: 'dns', name: 'DNS', from: 0.06, to: 0.12, color: 0xb89bff },
  { id: 'tcp', name: 'TCP handshake', from: 0.12, to: 0.26, color: 0xffe7a8 },
  { id: 'tls', name: 'TLS 1.3', from: 0.26, to: 0.33, color: 0xff9bd2 },
  { id: 'nat', name: 'Home router (NAT)', from: 0.33, to: 0.4, color: 0xffb38a },
  { id: 'internet', name: 'The internet', from: 0.4, to: 0.62, color: 0x8fb8ff },
  { id: 'dc', name: 'Data centre', from: 0.62, to: 0.7, color: 0x9ef0b8 },
  { id: 'kernel', name: 'Server kernel', from: 0.7, to: 0.88, color: 0xffb38a },
  { id: 'app', name: 'nginx', from: 0.88, to: 1.0001, color: 0xffe7a8 },
];

export const zoneAt = (u: number) => ZONES.find(z => u >= z.from && u < z.to) ?? ZONES[ZONES.length - 1];

export const START_HEADER: PacketHeader = {
  src: '192.168.1.23', sport: null, dst: '?', dport: null, ttl: 64, proto: '—', flags: '', seq: '', ack: '', state: 'about to ask',
};

export const HOPS: Hop[] = [
  {
    u: 0.085, tag: 'DNS', title: 'DNS lookup', station: 'resolver',
    next: 'First, find out where string-wise.com lives.',
    text: 'The laptop asks a DNS resolver for string-wise.com’s A record, and gets back an IP address: 203.0.113.10. Nothing can be sent until it knows where to send it.',
    set: { dst: '203.0.113.10', proto: 'UDP', sport: 53112, dport: 53, state: 'resolved' },
    log: 'IP 192.168.1.23.53112 > 192.0.2.53.53: A? string-wise.com.', ms: 12,
  },
  {
    u: 0.15, tag: 'TCP', title: 'SYN', station: 'SYN',
    next: 'Open a TCP connection: step one of three.',
    text: 'Your packet says “let’s talk” with the SYN flag and a starting sequence number. The connection is now SYN_SENT.',
    set: { proto: 'TCP', sport: 52814, dport: 443, flags: '[S]', seq: '1000', ack: '', state: 'SYN_SENT' },
    log: 'IP 192.168.1.23.52814 > 203.0.113.10.443: Flags [S], seq 1000', ms: 1,
  },
  {
    u: 0.19, tag: 'TCP', title: 'SYN-ACK', station: 'SYN-ACK',
    next: 'Wait for the server to answer the SYN.',
    text: 'The server answers with SYN-ACK: it agrees, and acknowledges your sequence number. That reply is one full round trip.',
    set: { flags: '[S.]', ack: '5001' },
    log: 'IP 203.0.113.10.443 > 192.168.1.23.52814: Flags [S.], seq 5000, ack 1001', ms: 38,
  },
  {
    u: 0.23, tag: 'TCP', title: 'ACK', station: 'ACK',
    next: 'Finish the three-way handshake.',
    text: 'Your ACK completes the three-way handshake. The connection is ESTABLISHED, but no request has been sent yet.',
    set: { flags: '[.]', state: 'ESTABLISHED' },
    log: 'IP 192.168.1.23.52814 > 203.0.113.10.443: Flags [.], ack 5001', ms: 1,
  },
  {
    u: 0.3, tag: 'TLS', title: 'ClientHello', station: 'TLS 1.3',
    next: 'Encrypt the connection with TLS.',
    text: 'TLS 1.3 agrees on keys: another round trip. From here on, routers only see IP and TCP headers. Your actual request is encrypted.',
    set: { flags: '[P.]', seq: '1001:1518', state: 'ESTABLISHED · TLS' },
    log: 'IP 192.168.1.23.52814 > 203.0.113.10.443: Flags [P.], seq 1001:1518, length 517', ms: 38,
  },
  {
    u: 0.365, tag: 'NAT', title: 'Home router (NAT)', station: 'NAT',
    next: 'Leave your home network through the router.',
    text: 'Your router swaps your private address for its public one (NAT), and conntrack remembers the mapping so replies find their way back to you.',
    set: { src: '198.51.100.7', sport: 40122 },
    log: 'IP 198.51.100.7.40122 > 203.0.113.10.443: Flags [P.], seq 1001:1518', ms: 2, color: 0xffb38a,
  },
  {
    u: 0.45, tag: 'ROUTE', title: 'ISP router', station: 'ISP',
    next: 'Out onto the internet.',
    text: 'Every router lowers TTL by one. If TTL hits zero the packet is dropped and the router says so: that is exactly how traceroute maps a path.',
    set: { ttl: 63 },
    log: 'IP 198.51.100.7.40122 > 203.0.113.10.443: Flags [P.], ttl 63', ms: 4,
  },
  {
    u: 0.51, tag: 'ROUTE', title: 'Backbone (BGP)', station: 'backbone',
    next: 'Cross the backbone.',
    text: 'Big networks choose paths to each other with BGP: which network can reach which addresses, and at what cost.',
    set: { ttl: 62 },
    log: 'IP 198.51.100.7.40122 > 203.0.113.10.443: Flags [P.], ttl 62', ms: 9,
  },
  {
    u: 0.57, tag: 'ROUTE', title: 'IX peering', station: 'exchange',
    next: 'Switch networks at an internet exchange.',
    text: 'At an internet exchange, your ISP hands the packet to the hosting provider’s network directly, over a shared switch.',
    set: { ttl: 61 },
    log: 'IP 198.51.100.7.40122 > 203.0.113.10.443: Flags [P.], ttl 61', ms: 7,
  },
  {
    u: 0.66, tag: 'LB', title: 'Load balancer', station: 'LB',
    next: 'Arrive at the data centre’s load balancer.',
    text: 'The load balancer picks a backend and rewrites the destination to it (10.1.2.7). It keeps state so the reply goes back the same way.',
    set: { dst: '10.1.2.7', ttl: 60 },
    log: 'IP 198.51.100.7.40122 > 10.1.2.7.443: Flags [P.], ttl 60', ms: 1,
  },
  {
    u: 0.75, tag: 'KERNEL', title: 'NIC → IRQ → softirq', station: 'NIC',
    next: 'Into the server’s network card.',
    text: 'The network card copies the packet into memory and raises an interrupt. The kernel’s NET_RX softirq wraps it in an sk_buff and walks it up the stack.',
    set: { state: 'sk_buff' },
    log: '[kernel] eth0: rx, NET_RX softirq → ip_rcv → tcp_v4_rcv', ms: 0.05,
  },
  {
    u: 0.83, tag: 'KERNEL', title: 'TCP receive queue', station: 'socket',
    next: 'Onto the socket’s receive queue.',
    text: 'TCP puts the data on the socket’s receive queue and wakes the process waiting in epoll_wait.',
    set: { state: 'queued · reader woken' },
    log: '[kernel] tcp_data_queue → sk_data_ready → ep_poll_callback (wakes nginx)', ms: 0.02,
  },
  {
    u: 0.92, tag: 'APP', title: 'nginx reads the request', station: 'nginx',
    next: 'Deliver it to nginx.',
    text: 'nginx returns from epoll_wait, reads the bytes from the socket buffer, decrypts them, and finally sees your request: GET /.',
    set: { state: 'delivered' },
    log: '[nginx] recv(fd 12) → "GET / HTTP/1.1  Host: string-wise.com"', ms: 0.3,
  },
];

/** What the header should look like after a full flight (tests). */
export const FINAL_HEADER: PacketHeader = HOPS.reduce((h, hop) => ({ ...h, ...hop.set }), START_HEADER);

/** 73 control points, about 2,700 units of gently winding track. */
export function trackPoints(): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 73; i++) {
    pts.push([
      Math.sin(i * 0.35) * 55 + Math.sin(i * 0.11) * 90,
      Math.sin(i * 0.23) * 22 + Math.sin(i * 0.07) * 14,
      -i * 36,
    ]);
  }
  return pts;
}
