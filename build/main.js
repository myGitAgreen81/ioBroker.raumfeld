"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var utils = __toESM(require("@iobroker/adapter-core"));
var import_discovery = require("./lib/discovery");
var import_hostService = require("./lib/hostService");
var import_raumfeldXml = require("./lib/raumfeldXml");
class Raumfeld extends utils.Adapter {
  hostService;
  /**
   * Raum-UDN zu Objekt-ID. Ueber diese Zuordnung faellt auf, wenn ein Raum in
   * der Raumfeld-App umbenannt wurde: die UDN bleibt, die ID aendert sich.
   */
  roomIds = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super({
      ...options,
      name: "raumfeld"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    await this.ensureInfoObjects();
    await this.setState("info.connection", false, true);
    const address = await this.resolveHostAddress();
    if (!address) {
      this.log.error(
        "Kein Raumfeld-Host gefunden. Laeuft der Host-Lautsprecher, und steht der Adapter im selben Netzsegment? SSDP wird zwischen Segmenten nicht weitergereicht - andernfalls die Adresse des Hosts in den Einstellungen eintragen."
      );
      return;
    }
    this.log.info(`Raumfeld-Host auf ${address}`);
    await this.setStateAsync("info.hostAddress", address, true);
    this.hostService = new import_hostService.RaumfeldHostService({
      address,
      log: {
        debug: (message) => this.log.debug(message),
        info: (message) => this.log.info(message),
        warn: (message) => this.log.warn(message),
        error: (message) => this.log.error(message)
      }
    });
    this.hostService.on("connected", () => {
      this.log.info("Verbindung zum Host steht, Zonenueberwachung laeuft");
      void this.setState("info.connection", true, true);
      void this.readHostInfo();
    });
    this.hostService.on("disconnected", (reason) => {
      this.log.warn(`Verbindung zum Host verloren: ${reason}`);
      void this.setState("info.connection", false, true);
    });
    this.hostService.on("zones", (config) => {
      void this.applyZoneConfiguration(config).catch((err) => {
        this.log.error(`Zonenaufteilung konnte nicht uebernommen werden: ${asMessage(err)}`);
      });
    });
    this.hostService.start();
  }
  /**
   * Legt die Objekte des info-Zweiges an.
   *
   * Sie stehen zwar auch als instanceObjects in der io-package.json, aber die
   * werden nur beim Einrichten einer Instanz ausgewertet. Eine Instanz, die
   * es vor dem Hinzufuegen dieser Datenpunkte schon gab, haette sie sonst
   * nie - und jeder Schreibzugriff quittierte das mit der Warnung
   * "has no existing object".
   */
  async ensureInfoObjects() {
    await this.defineState("info.hostAddress", "Adresse des Raumfeld-Hosts", "string", "info.ip", false);
    await this.defineState("info.hostName", "Name des Host-Geraets", "string", "text", false);
    await this.defineState("info.hostRoom", "Raum, in dem der Host steht", "string", "text", false);
    await this.defineState("info.zones", "Aktuelle Zonenaufteilung als JSON", "string", "json", false);
  }
  /**
   * Ermittelt die Adresse des Hosts: entweder aus den Einstellungen oder per
   * SSDP-Suche nach dem ConfigDevice, das es im System nur einmal gibt.
   */
  async resolveHostAddress() {
    var _a, _b;
    const configured = String((_a = this.config.hostAddress) != null ? _a : "").trim();
    if (configured.length > 0) {
      this.log.debug(`Host-Adresse aus den Einstellungen: ${configured}`);
      return configured;
    }
    const bindAddress = String((_b = this.config.bindAddress) != null ? _b : "").trim() || void 0;
    this.log.debug(`Suche den Host per SSDP${bindAddress ? `, gesendet von ${bindAddress}` : ""} ...`);
    try {
      const result = await (0, import_discovery.discover)(bindAddress);
      if (result.hostCandidates.length > 1) {
        this.log.warn(
          `Mehrere Geraete melden ein ConfigDevice (${result.hostCandidates.join(", ")}). Das erste wird verwendet; bei Problemen die Adresse fest eintragen.`
        );
      }
      if (result.hostCandidates.length > 0) {
        return result.hostCandidates[0];
      }
      this.log.debug(
        `Kein ConfigDevice gefunden, gefundene Raumfeld-Geraete: ${result.deviceAddresses.join(", ") || "keine"}`
      );
    } catch (err) {
      this.log.warn(`SSDP-Suche fehlgeschlagen: ${asMessage(err)}`);
    }
    return void 0;
  }
  /** Liest die unveraenderlichen Angaben des Hosts einmal aus. */
  async readHostInfo() {
    var _a, _b;
    if (!this.hostService) {
      return;
    }
    try {
      const info = await this.hostService.fetchHostInfo();
      await this.setStateAsync("info.hostName", (_a = info.hostName) != null ? _a : "", true);
      await this.setStateAsync("info.hostRoom", (_b = info.roomName) != null ? _b : "", true);
    } catch (err) {
      this.log.debug(`getHostInfo nicht lesbar: ${asMessage(err)}`);
    }
  }
  /**
   * Uebertraegt eine neue Zonenaufteilung in den Objektbaum.
   *
   * Raeume, die verschwunden sind, werden nicht geloescht, sondern auf
   * online=false gesetzt. Ein Lautsprecher im Tiefschlaf oder mit kurzzeitig
   * gestoertem WLAN faellt aus getZones heraus - wuerde der Adapter dabei
   * Objekte loeschen, waeren mit ihnen auch die Verlaufsdaten weg.
   *
   * @param config - Die vom Host gemeldete Zonenaufteilung.
   */
  async applyZoneConfiguration(config) {
    this.log.debug(
      `Zonenaufteilung: ${config.zones.length} Zonen, ${config.unassignedRooms.length} einzelne Raeume`
    );
    await this.setStateAsync(
      "info.zones",
      JSON.stringify(config.zones.map((zone) => ({ udn: zone.udn, rooms: zone.rooms.map((room) => room.name) }))),
      true
    );
    const present = /* @__PURE__ */ new Set();
    for (const room of config.allRooms) {
      const id = await this.ensureRoom(room);
      present.add(id);
      await this.writeRoomStates(id, room, true);
    }
    for (const [udn, id] of this.roomIds) {
      if (!present.has(id)) {
        this.log.debug(`Raum ${id} (${udn}) ist derzeit nicht gemeldet`);
        await this.setStateAsync(`rooms.${id}.online`, false, true);
      }
    }
  }
  /**
   * Legt die Objekte eines Raumes an, falls sie noch fehlen.
   *
   * @param room - Der Raum, so wie der Host ihn meldet.
   */
  async ensureRoom(room) {
    const id = (0, import_raumfeldXml.roomIdFromName)(room.name);
    const previous = this.roomIds.get(room.udn);
    if (previous !== void 0 && previous !== id) {
      this.log.warn(
        `Raum "${previous}" heisst jetzt "${room.name}". Der alte Zweig rooms.${previous} bleibt stehen und kann von Hand geloescht werden.`
      );
    }
    this.roomIds.set(room.udn, id);
    await this.setObjectNotExistsAsync(`rooms.${id}`, {
      type: "device",
      common: { name: room.name },
      // Die UDN ist die verlaessliche Kennung des Raumes und wird fuer
      // jeden Befehl an den Host gebraucht.
      native: { udn: room.udn }
    });
    await this.defineState(`rooms.${id}.name`, "Name des Raumes", "string", "text", false);
    await this.defineState(`rooms.${id}.online`, "Raum wird gemeldet", "boolean", "indicator.reachable", false);
    await this.defineState(`rooms.${id}.powerState`, "Betriebszustand", "string", "text", false);
    await this.defineState(`rooms.${id}.zone`, "Zone, in der der Raum steckt", "string", "text", false);
    await this.defineState(
      `rooms.${id}.spotifyConnect`,
      "Spotify Connect angemeldet",
      "boolean",
      "indicator",
      false
    );
    return id;
  }
  /**
   * @param id - Objekt-ID des Raumes.
   * @param room - Der Raum, so wie der Host ihn meldet.
   * @param online - Ob der Raum in der aktuellen Meldung enthalten war.
   */
  async writeRoomStates(id, room, online) {
    var _a, _b;
    await this.setStateAsync(`rooms.${id}.name`, room.name, true);
    await this.setStateAsync(`rooms.${id}.online`, online, true);
    await this.setStateAsync(`rooms.${id}.powerState`, (_a = room.powerState) != null ? _a : "ACTIVE", true);
    await this.setStateAsync(`rooms.${id}.zone`, (_b = room.zoneUdn) != null ? _b : "", true);
    await this.setStateAsync(
      `rooms.${id}.spotifyConnect`,
      room.renderers.some((renderer) => renderer.spotifyConnect),
      true
    );
  }
  /**
   * Kurzform fuer die immer gleiche Objektdefinition eines Zustands.
   *
   * @param id - Objekt-ID des Zustands, ohne den Namensraum des Adapters.
   * @param name - Anzeigename in der Oberflaeche.
   * @param type - Datentyp des Wertes.
   * @param role - ioBroker-Rolle, die der Oberflaeche sagt, was der Wert bedeutet.
   * @param write - Ob der Datenpunkt beschrieben werden darf.
   * @returns Nichts; das Objekt wird nur angelegt, wenn es noch fehlt.
   */
  async defineState(id, name, type, role, write) {
    await this.setObjectNotExistsAsync(id, {
      type: "state",
      common: { name, type, role, read: true, write },
      native: {}
    });
  }
  /**
   * Wird beim Beenden gerufen. Die Rueckmeldung muss in jedem Fall erfolgen,
   * sonst wartet der Controller bis zum Zwangsabbruch.
   *
   * @param callback - Meldet dem Controller, dass aufgeraeumt wurde.
   */
  onUnload(callback) {
    var _a;
    try {
      (_a = this.hostService) == null ? void 0 : _a.stop();
      this.hostService = void 0;
      callback();
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
      callback();
    }
  }
  /**
   * @param id - State ID
   * @param state - State object
   */
  onStateChange(id, state) {
    if (!state || state.ack) {
      return;
    }
    this.log.debug(`Befehl fuer ${id} erhalten: ${String(state.val)}`);
  }
}
function asMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
if (require.main !== module) {
  module.exports = (options) => new Raumfeld(options);
} else {
  (() => new Raumfeld())();
}
//# sourceMappingURL=main.js.map
