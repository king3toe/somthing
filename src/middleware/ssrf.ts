import dns from 'dns';
import { promisify } from 'util';
import ipaddr from 'ipaddr.js';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

export async function resolveAndCheckIP(hostname: string): Promise<string> {
   if (ipaddr.isValid(hostname)) {
      if (isPrivateIP(hostname)) throw new Error(`SSRF blocked: ${hostname}`);
      return hostname;
   }

   let ips: string[] = [];
   try { ips = await resolve4(hostname); } catch (e) {
      try { ips = await resolve6(hostname); } catch (err) { throw new Error(`DNS resolution failed for ${hostname}`); }
   }

   if (!ips.length) throw new Error(`No IP resolved for ${hostname}`);

   const ip = ips[0];
   if (isPrivateIP(ip)) throw new Error(`SSRF blocked: ${hostname} resolves to private IP ${ip}`);
   return ip;
}

function isPrivateIP(ip: string): boolean {
   try {
      const parsed = ipaddr.parse(ip);
      const range = parsed.range();
      return ['unspecified', 'broadcast', 'multicast', 'linkLocal', 'loopback', 'private', 'carrierGradeNat'].includes(range);
   } catch (e) {
      return true; // fail secure
   }
}


export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const urlObj = new URL(url);
  // Rebind protection: Ensure hostname resolves to public IP
  const safeIp = await resolveAndCheckIP(urlObj.hostname);

  // Replace the hostname with the resolved IP to prevent DNS rebinding mid-flight
  // Keep original host in header
  const headers = new Headers(options?.headers);
  if (!headers.has('Host')) {
     headers.set('Host', urlObj.hostname);
  }

  const safeUrl = new URL(urlObj.toString());
  safeUrl.hostname = safeIp;

  return fetch(safeUrl.toString(), {
    redirect: 'manual',
    ...options,
    headers
  });
}
