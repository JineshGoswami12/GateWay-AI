import fs from 'fs';
import path from 'path';

export class LocalStore {
  constructor(baseDir = process.cwd()) {
    this.storeDir = path.join(baseDir, '.gateway-ai');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
  }

  _getFilePath(name) {
    return path.join(this.storeDir, `${name}.json`);
  }

  read(collection) {
    const file = this._getFilePath(collection);
    if (!fs.existsSync(file)) {
      return [];
    }
    try {
      const data = fs.readFileSync(file, 'utf-8');
      return JSON.parse(data || '[]');
    } catch {
      return [];
    }
  }

  write(collection, items) {
    this._ensureDir();
    const file = this._getFilePath(collection);
    fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf-8');
  }

  append(collection, item) {
    const items = this.read(collection);
    items.unshift(item); // prepend latest
    this.write(collection, items);
    return item;
  }

  find(collection, predicate) {
    const items = this.read(collection);
    return items.find(predicate);
  }

  update(collection, predicate, updates) {
    const items = this.read(collection);
    const index = items.findIndex(predicate);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates };
      this.write(collection, items);
      return items[index];
    }
    return null;
  }

  clear(collection) {
    if (collection) {
      this.write(collection, []);
    } else {
      ['orders', 'payments', 'webhooks', 'errors'].forEach(col => this.write(col, []));
    }
  }
}

export const defaultStore = new LocalStore();
