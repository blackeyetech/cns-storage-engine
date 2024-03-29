// imports here
import CNShell, { HttpError } from "cn-shell";
import levelup from "levelup";
import leveldown from "leveldown";

// Interfaces here
interface StoreDetails {
  lastAccessed: number;
  name: string;
  db: any;
}

// Config consts here
const CFG_STORAGE_DIR = "STORAGE_DIR";
const CFG_KEEP_OPEN_INTERVAL = "KEEP_OPEN_INTERVAL";

const DEFAULT_CFG_KEEP_OPEN_INTERVAL = "0";

// Route consts here:
const ROUTE_DATA = "/data";

const QRY_STRING_STORE = "store";

// Class CNStorageEngine here
export class CNStorageEngine extends CNShell {
  // Properties here
  private _storageDir: string;
  private _keepOpenInterval: number;
  private _closeStorageTimer: NodeJS.Timeout;
  private _stores: Map<string, StoreDetails>;

  // Constructor here
  constructor(name: string) {
    super(name);

    this._storageDir = this.getRequiredCfg(CFG_STORAGE_DIR);
    this.info("Setting storage directory to (%s)", this._storageDir);

    let keepOpenInterval = this.getCfg(
      CFG_KEEP_OPEN_INTERVAL,
      DEFAULT_CFG_KEEP_OPEN_INTERVAL,
    );
    this._keepOpenInterval = parseInt(keepOpenInterval, 10) * 1000;
    this.info("Setting keep open interval to %ds", keepOpenInterval);

    this._stores = new Map();

    this.setupCreateRoute();
    this.setupReadRoute();
  }

  // Methods here
  async start(): Promise<boolean> {
    if (this._keepOpenInterval !== 0) {
      this._closeStorageTimer = setInterval(
        () => this.checkStorage(),
        this._keepOpenInterval,
      );
    }

    return true;
  }

  async stop(): Promise<void> {
    clearInterval(this._closeStorageTimer);

    for (const [, v] of this._stores) {
      this.info("Closing Storage (%s)", v.name);
      await v.db.close();
    }
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  // Private methods here
  private async checkStorage(): Promise<void> {
    let now = Date.now();
    let closed: StoreDetails[] = [];

    // Check if any stores have not been accessed in the alloacted interval
    for (const [, v] of this._stores) {
      if (now - v.lastAccessed > this._keepOpenInterval) {
        closed.push(v);
      }
    }

    // Remove and close the selected stores
    for (let details of closed) {
      this.info("Closing storage (%s)", details.name);
      await details.db.close();
      this._stores.delete(details.name);
    }
  }

  private setupCreateRoute() {
    this.createRoute(ROUTE_DATA, async body => {
      if (
        body.name === undefined ||
        body.key === undefined ||
        body.value === undefined
      ) {
        let error: HttpError = { status: 404, message: "Body invalid!" };
        throw error;
      }

      let written = await this.write(body.name, body.key, body.value);

      if (written === false) {
        let error: HttpError = {
          status: 500,
          message: "Ooops - we have had a problem!",
        };
        throw error;
      }

      return body.key;
    });
  }

  private setupReadRoute() {
    this.simpleReadRoute(ROUTE_DATA, async (id, query) => {
      if (id === undefined) {
        let error: HttpError = { status: 404, message: "No ID specified!" };
        throw error;
      }

      if (query === undefined || query[QRY_STRING_STORE] === undefined) {
        let error: HttpError = { status: 400, message: "No store specified!" };
        throw error;
      }

      if (Array.isArray(query[QRY_STRING_STORE])) {
        let error: HttpError = {
          status: 400,
          message: "Can only specify one store!",
        };
        throw error;
      }

      // We know this is a string because we checked if it was an arrray above
      let name = <string>query[QRY_STRING_STORE];
      let value = await this.get(name, id);

      if (value === null) {
        let error: HttpError = {
          status: 404,
          message: "Ooops - can't find that key!",
        };
        throw error;
      }

      return value;
    });
  }

  private getStore(name: string): StoreDetails {
    let now = Date.now();
    let details = this._stores.get(name);

    if (details !== undefined) {
      details.lastAccessed = now;
      return details;
    }

    this.info("Creating/Opening storage (%s)", name);

    details = {
      name,
      lastAccessed: now,
      db: levelup(leveldown(`${this._storageDir}/${name}`)),
    };

    this._stores.set(name, details);

    return details;
  }

  // Public methods here
  async get(name: string, key: string): Promise<string | null> {
    let store = this.getStore(name);

    let value = await store.db.get(key).catch((e: Error) => {
      this.error(
        "Error (%s) while attempting to get key (%s) from store (%s)",
        e,
        key,
        name,
      );
    });

    if (value === undefined) {
      return null;
    }

    return value.toString();
  }

  async write(name: string, key: string, value: string): Promise<boolean> {
    let store = this.getStore(name);

    let written = true;

    await store.db.put(key, value).catch((e: Error) => {
      this.error(
        "Error (%s) while attempting to write key (%s) from store (%s)",
        e,
        key,
        name,
      );
      written = false;
    });

    return written;
  }

  async del(name: string, key: string): Promise<boolean> {
    let store = this.getStore(name);

    let deleted = true;

    await store.db.del(key).catch((e: Error) => {
      this.error(
        "Error (%s) while attempting to delete key (%s) from store (%s)",
        e,
        key,
        name,
      );
      deleted = false;
    });

    return deleted;
  }
}
