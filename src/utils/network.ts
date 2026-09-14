export interface ParsedSubnet {
  baseIp: string;
  cidr: number;
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

export function isValidCidr(cidr: number): boolean {
  return Number.isInteger(cidr) && cidr >= 0 && cidr <= 32;
}

export function parseSubnet(subnet: string): ParsedSubnet | null {
  if (!subnet || typeof subnet !== "string") return null;
  const [baseIp, cidrStr] = subnet.split("/");
  if (!isValidIpv4(baseIp)) return null;
  const cidr = Number(cidrStr);
  if (!isValidCidr(cidr)) return null;
  return { baseIp, cidr };
}

export function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function longToIp(long: number): string {
  return [(long >>> 24) & 255, (long >>> 16) & 255, (long >>> 8) & 255, long & 255].join(".");
}

// Retorna os hosts utilizáveis (exclui network/broadcast). Retorna [] para /32.
export function getIpRange(subnet: string): string[] {
  const parsed = parseSubnet(subnet);
  if (!parsed) return [];
  const { baseIp, cidr } = parsed;
  if (cidr >= 31) return [];
  const base = ipToLong(baseIp);
  const hostBits = 32 - cidr;
  const mask = hostBits >= 32 ? 0 : (~0 << hostBits) >>> 0;
  const network = (base & mask) >>> 0;
  const broadcast = (network | ~mask) >>> 0;
  const ips: string[] = [];
  for (let i = (network + 1) >>> 0; i < broadcast; i = (i + 1) >>> 0) {
    ips.push(longToIp(i));
  }
  return ips;
}