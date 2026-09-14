import { describe, it, expect } from "vitest";
import {
  isValidIpv4,
  isValidCidr,
  parseSubnet,
  ipToLong,
  longToIp,
  getIpRange,
} from "./network.ts";

describe("isValidIpv4", () => {
  it("aceita IPs válidos", () => {
    expect(isValidIpv4("192.168.1.1")).toBe(true);
    expect(isValidIpv4("0.0.0.0")).toBe(true);
    expect(isValidIpv4("255.255.255.255")).toBe(true);
    expect(isValidIpv4("10.0.0.1")).toBe(true);
  });
  it("rejeita IPs inválidos", () => {
    expect(isValidIpv4("")).toBe(false);
    expect(isValidIpv4("256.0.0.1")).toBe(false);
    expect(isValidIpv4("1.2.3")).toBe(false);
    expect(isValidIpv4("1.2.3.4.5")).toBe(false);
    expect(isValidIpv4("abc.def.ghi.jkl")).toBe(false);
    expect(isValidIpv4("192.168.1.1/24")).toBe(false);
  });
});

describe("isValidCidr", () => {
  it("aceita CIDRs válidos", () => {
    expect(isValidCidr(0)).toBe(true);
    expect(isValidCidr(24)).toBe(true);
    expect(isValidCidr(32)).toBe(true);
  });
  it("rejeita CIDRs inválidos", () => {
    expect(isValidCidr(-1)).toBe(false);
    expect(isValidCidr(33)).toBe(false);
    expect(isValidCidr(1.5)).toBe(false);
    expect(isValidCidr(NaN)).toBe(false);
  });
});

describe("parseSubnet", () => {
  it("retorna ParsedSubnet para formato válido", () => {
    expect(parseSubnet("192.168.1.0/24")).toEqual({ baseIp: "192.168.1.0", cidr: 24 });
    expect(parseSubnet("10.0.0.0/8")).toEqual({ baseIp: "10.0.0.0", cidr: 8 });
    expect(parseSubnet("0.0.0.0/0")).toEqual({ baseIp: "0.0.0.0", cidr: 0 });
  });
  it("retorna null para formatos inválidos", () => {
    expect(parseSubnet("")).toBeNull();
    expect(parseSubnet("192.168.1.0")).toBeNull();
    expect(parseSubnet("192.168.1.0/abc")).toBeNull();
    expect(parseSubnet("192.168.1.0/33")).toBeNull();
    expect(parseSubnet("256.0.0.0/24")).toBeNull();
  });
});

describe("ipToLong / longToIp (round-trip)", () => {
  it("converte ida e volta sem perda", () => {
    const cases = ["0.0.0.0", "127.0.0.1", "192.168.1.100", "255.255.255.255", "10.20.30.40"];
    for (const ip of cases) {
      expect(longToIp(ipToLong(ip))).toBe(ip);
    }
  });
  it("ipToLong retorna unsigned 32-bit", () => {
    expect(ipToLong("255.255.255.255")).toBe(0xffffffff >>> 0);
    expect(ipToLong("0.0.0.0")).toBe(0);
    expect(ipToLong("192.168.1.1")).toBe((192 << 24 | 168 << 16 | 1 << 8 | 1) >>> 0);
  });
});

describe("getIpRange", () => {
  it("/32 retorna array vazio", () => {
    expect(getIpRange("192.168.1.1/32")).toEqual([]);
  });
  it("/31 retorna array vazio (sem hosts)", () => {
    expect(getIpRange("192.168.1.0/31")).toEqual([]);
  });
  it("/30 retorna 2 hosts utilizáveis", () => {
    expect(getIpRange("192.168.1.0/30")).toEqual(["192.168.1.1", "192.168.1.2"]);
  });
  it("/28 retorna 14 hosts", () => {
    const range = getIpRange("10.0.0.0/28");
    expect(range).toHaveLength(14);
    expect(range[0]).toBe("10.0.0.1");
    expect(range[13]).toBe("10.0.0.14");
  });
  it("subnet inválido retorna []", () => {
    expect(getIpRange("")).toEqual([]);
    expect(getIpRange("abc/24")).toEqual([]);
  });
});
