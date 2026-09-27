export const COMMANDS: { cmd: string; what: string }[] = [
  { cmd: 'dig +short string-wise.com A', what: 'The DNS step: ask for the A record.' },
  { cmd: 'traceroute -n string-wise.com', what: 'Every router on the way, found by sending packets with TTL 1, 2, 3…' },
  { cmd: 'sudo tcpdump -n -i any "tcp port 443 and host string-wise.com"', what: 'Watch the handshake flags yourself: [S], [S.], [.], [P.].' },
  { cmd: "curl -so /dev/null -w 'dns %{time_namelookup}  tcp %{time_connect}  tls %{time_appconnect}  first byte %{time_starttransfer}\\n' https://string-wise.com", what: 'The three round trips, timed.' },
  { cmd: 'sudo conntrack -L -p tcp --dport 443', what: 'On your router: the NAT mapping it remembers for replies.' },
  { cmd: 'ss -tni state established "( dport = :443 )"', what: 'Your end of the connection: RTT, congestion window, bytes sent.' },
];

export const TAKEAWAY =
  'Three round trips (DNS, TCP, TLS) happen before a single byte of your request is sent. That is why keep-alive, TLS resumption and DNS caching matter so much.';
