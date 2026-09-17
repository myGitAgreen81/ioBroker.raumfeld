"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var gena_exports = {};
__export(gena_exports, {
  GenaListener: () => GenaListener,
  localAddressTowards: () => localAddressTowards
});
module.exports = __toCommonJS(gena_exports);
var http = __toESM(require("node:http"));
var net = __toESM(require("node:net"));
var import_events = require("./events");
function localAddressTowards(host, port, timeoutMs = 5e3) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    const fail = (err) => {
      socket.destroy();
      reject(err);
    };
    socket.on("connect", () => {
      const address = socket.localAddress;
      socket.destroy();
      if (address) {
        resolve(address.replace(/^::ffff:/, ""));
      } else {
        reject(new Error("Eigene Adresse nicht ermittelbar"));
      }
    });
    socket.on("timeout", () => fail(new Error(`Zeitablauf beim Verbinden mit ${host}:${port}`)));
    socket.on("error", fail);
  });
}
class GenaListener {
  server;
  address;
  port = 0;
  subscriptions = /* @__PURE__ */ new Map();
  log;
  stopped = false;
  /**
   * @param log - Wohin protokolliert wird.
   */
  constructor(log) {
    this.log = log;
  }
  /**
   * Startet den Zuhoerer.
   *
   * @param bindAddress - Adresse, auf der gelauscht wird. Sie muss fuer die
   *   Geraete erreichbar sein.
   * @param port - Gewuenschter Port; 0 laesst das Betriebssystem waehlen.
   * @returns Nichts; danach steht callbackBase bereit.
   */
  start(bindAddress, port = 0) {
    this.stopped = false;
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.onRequest(req, res));
      server.on("error", reject);
      server.listen(port, bindAddress, () => {
        const info = server.address();
        if (info === null || typeof info === "string") {
          reject(new Error("Zuhoerer konnte nicht gestartet werden"));
          return;
        }
        this.server = server;
        this.address = bindAddress;
        this.port = info.port;
        resolve();
      });
    });
  }
  /** Die Adresse, unter der die Geraete den Adapter erreichen. */
  get callbackBase() {
    return `http://${this.address}:${this.port}`;
  }
  /**
   * Abonniert einen Dienst.
   *
   * @param eventSubUrl - Die Ereignis-URL des Dienstes aus seiner Beschreibung.
   * @param handler - Wird bei jeder Meldung gerufen.
   * @returns Die Abonnementkennung, unter der das Geraet meldet.
   */
  async subscribe(eventSubUrl, handler) {
    const res = await fetch(eventSubUrl, {
      method: "SUBSCRIBE",
      headers: {
        CALLBACK: `<${this.callbackBase}/>`,
        NT: "upnp:event",
        TIMEOUT: "Second-300"
      },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) {
      throw new Error(`SUBSCRIBE ${eventSubUrl}: HTTP ${res.status} ${res.statusText}`);
    }
    const sid = res.headers.get("sid");
    if (!sid) {
      throw new Error(`SUBSCRIBE ${eventSubUrl}: keine Abonnementkennung erhalten`);
    }
    const subscription = { eventSubUrl, sid, handler };
    this.subscriptions.set(sid, subscription);
    this.scheduleRenewal(subscription, this.secondsFromTimeout(res.headers.get("timeout")));
    this.log.debug(`Abonniert: ${eventSubUrl} (${sid})`);
    return sid;
  }
  /** Beendet alle Abonnements und schliesst den Zuhoerer. */
  async stop() {
    this.stopped = true;
    const open = [...this.subscriptions.values()];
    this.subscriptions.clear();
    for (const subscription of open) {
      if (subscription.timer) {
        clearTimeout(subscription.timer);
      }
      try {
        await fetch(subscription.eventSubUrl, {
          method: "UNSUBSCRIBE",
          headers: { SID: subscription.sid },
          signal: AbortSignal.timeout(4e3)
        });
      } catch (err) {
        this.log.debug(`Abbestellen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = void 0;
    });
  }
  /**
   * Liest die Gueltigkeit aus der TIMEOUT-Kopfzeile.
   *
   * @param value - Der Inhalt der Kopfzeile, etwa "Second-300".
   * @returns Die Gueltigkeit in Sekunden; im Zweifel 300.
   */
  secondsFromTimeout(value) {
    var _a;
    const seconds = Number((_a = /Second-(\d+)/i.exec(value != null ? value : "")) == null ? void 0 : _a[1]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
  }
  /**
   * Plant die Erneuerung eines Abonnements.
   *
   * @param subscription - Das zu erneuernde Abonnement.
   * @param seconds - Die vom Geraet genannte Gueltigkeit.
   */
  scheduleRenewal(subscription, seconds) {
    const delay = Math.max(30, Math.floor(seconds * (2 / 3))) * 1e3;
    subscription.timer = setTimeout(() => {
      void this.renew(subscription);
    }, delay);
  }
  /**
   * Erneuert ein Abonnement, oder legt es bei Ablehnung neu an.
   *
   * @param subscription - Das zu erneuernde Abonnement.
   */
  async renew(subscription) {
    if (this.stopped || !this.subscriptions.has(subscription.sid)) {
      return;
    }
    try {
      const res = await fetch(subscription.eventSubUrl, {
        method: "SUBSCRIBE",
        headers: { SID: subscription.sid, TIMEOUT: "Second-300" },
        signal: AbortSignal.timeout(1e4)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      this.scheduleRenewal(subscription, this.secondsFromTimeout(res.headers.get("timeout")));
    } catch (err) {
      this.log.debug(
        `Erneuern von ${subscription.sid} fehlgeschlagen, neues Abonnement: ${err instanceof Error ? err.message : String(err)}`
      );
      this.subscriptions.delete(subscription.sid);
      try {
        await this.subscribe(subscription.eventSubUrl, subscription.handler);
      } catch (again) {
        this.log.warn(
          `Abonnement fuer ${subscription.eventSubUrl} verloren: ${again instanceof Error ? again.message : String(again)}`
        );
      }
    }
  }
  /**
   * Nimmt eine NOTIFY-Anfrage entgegen.
   *
   * @param req - Die eingehende Anfrage.
   * @param res - Die zu beantwortende Antwort.
   */
  onRequest(req, res) {
    if (req.method !== "NOTIFY") {
      res.writeHead(405);
      res.end();
      return;
    }
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      var _a;
      res.writeHead(200);
      res.end();
      const sid = String((_a = req.headers.sid) != null ? _a : "");
      const subscription = this.subscriptions.get(sid);
      if (!subscription) {
        this.log.debug(`Meldung fuer unbekanntes Abonnement ${sid} verworfen`);
        return;
      }
      try {
        subscription.handler((0, import_events.parsePropertySet)(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        this.log.warn(`Meldung nicht auswertbar: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GenaListener,
  localAddressTowards
});
//# sourceMappingURL=gena.js.map
