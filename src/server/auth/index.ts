import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../../db';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

export const verifyAdminToken = (token: string) => {
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
};

export const generateAdminToken = () => {
  return jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
};

export const getAdminPasswordHash = () => {
  const row = db.prepare('SELECT config_value FROM SystemConfigs WHERE config_key = ?').get('admin_password_hash') as { config_value: string } | undefined;
  return row?.config_value;
};

export const initAdminPassword = () => {
  let hash = getAdminPasswordHash();
  if (!hash) {
    const rawPass = process.env.EVERYROUTE_ADMIN_PASSWORD || crypto.randomBytes(8).toString('hex');
    hash = bcrypt.hashSync(rawPass, 10);
    db.prepare('INSERT INTO SystemConfigs (config_key, config_value) VALUES (?, ?)').run('admin_password_hash', hash);
  }
};

export const verifyPassword = (password: string) => {
  const hash = getAdminPasswordHash();
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
};

export const updatePassword = (newPassword: string) => {
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`INSERT INTO SystemConfigs (config_key, config_value) VALUES (?, ?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value`).run('admin_password_hash', hash);
};