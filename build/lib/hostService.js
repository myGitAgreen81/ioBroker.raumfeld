"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var hostService_exports = {};
__export(hostService_exports, {
  HOST_SERVICE_PORT: () => HOST_SERVICE_PORT,
  RaumfeldHostService: () => RaumfeldHostService
});
module.exports = __toCommonJS(hostService_exports);
var import_node_events = require("node:events");
var import_raumfeldXml = require("./raumfeldXml");
const HOST_SERVICE_PORT = 47365;
class RaumfeldHostService extends import_node_events.EventEmitter {
  baseUrl;
  pollTimeoutMs;
  minBackoffMs;
  maxBackoffMs;
  log;
  sessionUrl;
  updateId;
  stopped = true;
  connected = false;
  controller;
  backoffTimer;
  /**
   * @param options - Adresse des Hosts und die Feineinstellungen der Schleife.
   */
  constructor(options) {
    var _a, _b, _c, _d, _e;
    super();
    this.baseUrl = `http://${options.address}:${(_a = options.port) != null ? _a : HOST_SERVICE_PORT}`;
    this.pollTimeoutMs = (_b = options.pollTimeoutMs) != null ? _b : 3e5;
    this.minBackoffMs = (_c = options.minBackoffMs) != null ? _c : 2e3;
    this.maxBackoffMs = (_d = options.maxBackoffMs) != null ? _d : 6e4;
    this.log = (_e = options.log) != null ? _e : {
      debug: () => void 0,
      info: () => void 0,
      warn: () => void 0,
      error: () => void 0
    };
  }
  /** Die Basisadresse des Webservice, wie sie tatsaechlich verwendet wird. */
  get address() {
    return this.baseUrl;
  }
  /**
   * Ein einfacher Abruf ohne Warten, fuer alles ausser der Zonenueberwachung.
   *
   * @param endpoint - Name des Endpunkts, etwa "getHostInfo".
   * @param timeoutMs - Abbruch nach dieser Zeit.
   * @returns Der Rumpf der Antwort als Text.
   */
  async fetchOnce(endpoint, timeoutMs = 8e3) {
    const res = await fetch(`${this.baseUrl}/${endpoint}`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      throw new Error(`${endpoint}: HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  }
  /**
   * Fragt die Zonenaufteilung einmalig ab.
   *
   * @returns Die aktuelle Aufteilung.
   */
  async fetchZones() {
    return (0, import_raumfeldXml.parseZoneConfiguration)(await this.fetchOnce("getZones"));
  }
  /**
   * Fragt die Geraeteliste ab.
   *
   * @returns Alle Geraete, die der Host kennt.
   */
  async fetchDevices() {
    return (0, import_raumfeldXml.parseDeviceList)(await this.fetchOnce("listDevices"));
  }
  /**
   * Fragt die Angaben zum Host ab.
   *
   * @returns Name des Host-Geraets und sein Raum.
   */
  async fetchHostInfo() {
    return (0, import_raumfeldXml.parseHostInfo)(await this.fetchOnce("getHostInfo"));
  }
  /**
   * Verschiebt einen Raum in eine Zone. Der einzige Zonenbefehl, den der
   * Webservice kennt - dropRoom, createZone und renameZone gibt es nicht,
   * die antworten alle mit 404.
   *
   * @param roomUdn - UDN des Raumes.
   * @param zoneUdn - Ziel-Zone. Ohne Angabe soll der Raum in eine eigene Zone
   *   wandern, was zugleich das Loesen aus einer Gruppe waere. Das ist noch
   *   nicht an echter Hardware bestaetigt.
   * @returns Nichts; ein Fehler wird geworfen, wenn der Host ablehnt.
   */
  async connectRoomToZone(roomUdn, zoneUdn) {
    const query = new URLSearchParams({ roomUDN: roomUdn });
    query.set("zoneUDN", zoneUdn != null ? zoneUdn : "");
    const res = await fetch(`${this.baseUrl}/connectRoomToZone?${query.toString()}`, {
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      throw new Error(`connectRoomToZone: HTTP ${res.status} ${res.statusText}`);
    }
  }
  /**
   * Startet die Ueberwachung.
   *
   * Ein eigener Erstabruf ist nicht noetig: der erste Durchgang der Schleife
   * hat noch keine updateID, der Host antwortet deshalb sofort mit dem
   * aktuellen Stand. Das "zones"-Ereignis kommt also gleich nach dem Start,
   * ohne dass auf eine Aenderung gewartet werden muesste.
   */
  start() {
    this.stopped = false;
    void this.watchZones();
  }
  /** Beendet die Ueberwachung und bricht eine wartende Anfrage ab. */
  stop() {
    var _a;
    this.stopped = true;
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = void 0;
    }
    (_a = this.controller) == null ? void 0 : _a.abort();
    this.controller = void 0;
  }
  /**
   * Die Warteschleife. Sie laeuft, bis stop() gerufen wird, und unterscheidet
   * drei Ausgaenge: neuer Stand, abgelaufene Wartezeit ohne Aenderung, Fehler.
   * Nur der dritte fuehrt zu einer Pause.
   *
   * @returns Kehrt erst zurueck, wenn die Ueberwachung beendet wurde.
   */
  async watchZones() {
    let backoff = this.minBackoffMs;
    while (!this.stopped) {
      try {
        const changed = await this.requestZones();
        if (this.stopped) {
          return;
        }
        if (!this.connected) {
          this.connected = true;
          this.emit("connected");
        }
        backoff = this.minBackoffMs;
        if (changed) {
          this.emit("zones", changed);
        }
      } catch (err) {
        if (this.stopped) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        if (this.connected) {
          this.connected = false;
          this.emit("disconnected", message);
        }
        this.log.debug(`Zonenueberwachung unterbrochen: ${message}`);
        this.sessionUrl = void 0;
        this.updateId = void 0;
        await this.wait(backoff);
        backoff = Math.min(backoff * 2, this.maxBackoffMs);
      }
    }
  }
  /**
   * Ein Durchgang der Warteschleife.
   *
   * @returns Die neue Zonenaufteilung, oder undefined, wenn die Wartezeit
   *   ohne Aenderung ablief - dann wird schlicht erneut gefragt.
   */
  async requestZones() {
    var _a, _b;
    this.controller = new AbortController();
    const timer = setTimeout(() => {
      var _a2;
      return (_a2 = this.controller) == null ? void 0 : _a2.abort();
    }, this.pollTimeoutMs);
    try {
      const waiting = this.sessionUrl !== void 0 && this.updateId !== void 0;
      const url = (_a = this.sessionUrl) != null ? _a : `${this.baseUrl}/getZones`;
      const headers = {};
      if (waiting && this.updateId !== void 0) {
        headers.updateID = this.updateId;
      }
      const res = await fetch(url, { headers, signal: this.controller.signal });
      if (!res.ok) {
        throw new Error(`getZones: HTTP ${res.status} ${res.statusText}`);
      }
      this.sessionUrl = res.url;
      const updateId = (_b = res.headers.get("updateID")) != null ? _b : res.headers.get("updateid");
      const body = await res.text();
      const unchanged = waiting && updateId === this.updateId;
      this.updateId = updateId != null ? updateId : this.updateId;
      if (unchanged || body.trim().length === 0) {
        return void 0;
      }
      return (0, import_raumfeldXml.parseZoneConfiguration)(body);
    } catch (err) {
      if (!this.stopped && err instanceof Error && err.name === "AbortError") {
        return void 0;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      this.controller = void 0;
    }
  }
  /**
   * Wartet eine Weile, abbrechbar ueber stop().
   *
   * @param ms - Wartezeit in Millisekunden.
   * @returns Ein Versprechen, das nach Ablauf eingeloest wird.
   */
  wait(ms) {
    return new Promise((resolve) => {
      this.backoffTimer = setTimeout(resolve, ms);
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HOST_SERVICE_PORT,
  RaumfeldHostService
});
//# sourceMappingURL=hostService.js.map
