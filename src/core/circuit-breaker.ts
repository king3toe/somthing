import db from '../db';
export type BreakerState = 'CLOSED' | 'OPEN' | 'PROBING';

export interface CircuitBreakerState {
   state: BreakerState;
   retryAfter: number;
   currentBackoff: number;
   disabled: boolean;
}

// In-Memory global breaker state
const registry = new Map<number, CircuitBreakerState>();

let initialized = false;

export function getBreaker(providerId: number): CircuitBreakerState {
   if (!initialized) {
       initialized = true;
       try {
           const keys = db.prepare('SELECT id, is_active FROM ProviderKeys').all() as any[];
           for (const k of keys) {
               if (k.is_active === 0) {
                   registry.set(k.id, { state: 'OPEN', retryAfter: Date.now() + 999999999, currentBackoff: 999999999, disabled: true });
               }
           }
       } catch(e) {}
   }
   if (!registry.has(providerId)) {
       const k = db.prepare('SELECT is_active FROM ProviderKeys WHERE id = ?').get(providerId) as any;
       if (k && k.is_active === 0) {
           registry.set(providerId, { state: 'OPEN', retryAfter: Date.now() + 999999999, currentBackoff: 999999999, disabled: true });
       } else {
           registry.set(providerId, { state: 'CLOSED', retryAfter: 0, currentBackoff: 0, disabled: false });
       }
   }
   return registry.get(providerId)!;
}

export function canUseKey(providerId: number): boolean {
   const b = getBreaker(providerId);
   if (b.disabled) return false;
   if (b.state === 'CLOSED') return true;

   if (b.state === 'OPEN') {
       if (Date.now() > b.retryAfter) {
           // Atomic half-open transition
           b.state = 'PROBING';
           return true;
       }
       return false;
   }

   // If already PROBING, only the first request won. Others must fail fast.
   return false;
}

export function recordSuccess(providerId: number) {
   const b = getBreaker(providerId);
   if (b.state === 'PROBING' || b.state === 'OPEN') {
      b.state = 'CLOSED';
      b.retryAfter = 0;
      b.currentBackoff = 0;
   }
}

export function recordFailure(providerId: number, errMessage: string) {
   const b = getBreaker(providerId);

   // Exclude client aborts
   if (errMessage === 'client_disconnected' || errMessage.includes('AbortError')) return;

   let cooldownMs = 0;

   if (errMessage.includes('401') || errMessage.includes('403')) {
      b.disabled = true;
      b.state = 'OPEN';
      return;
   } else if (errMessage.includes('429')) {
      // Typically we parse Retry-After here, for MVP we use exponential bounds
      cooldownMs = b.currentBackoff === 0 ? 20000 : Math.min(b.currentBackoff * 2, 300000);
   } else if (errMessage.includes('500') || errMessage.includes('502') || errMessage.includes('503')) {
      cooldownMs = b.currentBackoff === 0 ? 5000 : Math.min(b.currentBackoff * 3, 120000);
   } else {
      cooldownMs = b.currentBackoff === 0 ? 10000 : Math.min(b.currentBackoff * 2, 120000);
   }

   b.state = 'OPEN';
   b.currentBackoff = cooldownMs;
   b.retryAfter = Date.now() + cooldownMs;
}

export function resetBreaker(providerId: number) {
   const b = getBreaker(providerId);
   b.state = 'CLOSED';
   b.retryAfter = 0;
   b.currentBackoff = 0;
   b.disabled = false;
}
