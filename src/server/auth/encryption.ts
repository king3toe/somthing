import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from '../../db';

const ALGORITHM = 'aes-256-gcm';
let MASTER_KEY: Buffer | null = null;

export const initEncryptionKey = () => {
   if (process.env.EVERYROUTE_MASTER_KEY) {
      MASTER_KEY = Buffer.from(process.env.EVERYROUTE_MASTER_KEY, 'hex');
      return;
   }
   const keyPath = path.resolve(__dirname, '../../../data/.master.key');
   if (!fs.existsSync(path.dirname(keyPath))) fs.mkdirSync(path.dirname(keyPath), { recursive: true });
   if (fs.existsSync(keyPath)) {
      MASTER_KEY = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
   } else {
      const key = crypto.randomBytes(32);
      fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
      MASTER_KEY = key;
   }
};

export const encryptKey = (text: string): string => {
   if (!text) return text;
   if (text.startsWith('enc:')) return text;
   if (!MASTER_KEY) throw new Error("Encryption key not initialized");
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
   let encrypted = cipher.update(text, 'utf8', 'hex');
   encrypted += cipher.final('hex');
   const authTag = cipher.getAuthTag().toString('hex');
   return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
};

export const decryptKey = (encText: string): string => {
   if (!encText || !encText.startsWith('enc:')) return encText;
   if (!MASTER_KEY) throw new Error("Encryption key not initialized");
   const parts = encText.split(':');
   if (parts.length !== 4) throw new Error("Invalid encrypted format");
   const iv = Buffer.from(parts[1], 'hex');
   const authTag = Buffer.from(parts[2], 'hex');
   const ciphertext = parts[3];
   const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
   decipher.setAuthTag(authTag);
   let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
   decrypted += decipher.final('utf8');
   return decrypted;
};

export const maskKey = (key: string): string => {
   if (!key) return key;
   const decrypted = decryptKey(key);
   if (decrypted.length <= 8) return '****';
   return `${decrypted.substring(0, 3)}...${decrypted.slice(-4)}`;
};