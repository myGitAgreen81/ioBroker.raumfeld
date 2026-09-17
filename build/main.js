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
var os = __toESM(require("node:os"));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_deviceDirectory = require("./lib/deviceDirectory");
var import_discovery = require("./lib/discovery");
var import_events = require("./lib/events");
var import_gena = require("./lib/gena");
var import_hostService = require("./lib/hostService");
var import_library = require("./lib/library");
var import_raumfeldXml = require("./lib/raumfeldXml");
var import_report = require("./lib/report");
var import_renderer = require("./lib/renderer");
class Raumfeld extends utils.Adapter {
  hostService;
  gena;
  library;
  /** Adresse der Beschreibung des MediaServers, an dem die Bibliothek haengt. */
  libraryLocation;
  /** Raum-UDN zu Objekt-ID, um Umbenennungen zu erkennen. */
  roomIds = /* @__PURE__ */ new Map();
  /** Objekt-ID zu den Laufzeitangaben des Raumes. */
  rooms = /* @__PURE__ */ new Map();
  /** Renderer-UDN zur Objekt-ID des Raumes, fuer eingehende Ereignisse. */
  roomByRenderer = /* @__PURE__ */ new Map();
  /** Geraete-UDN zur Adresse ihrer Beschreibung, aus listDevices. */
  deviceLocations = /* @__PURE__ */ new Map();
  /** Bereits aufgebaute Bedienschnittstellen je Geraet. */
  controls = /* @__PURE__ */ new Map();
  /** Geraete, deren Ereignisse bereits abonniert sind, samt verwendeter Adresse. */
  subscribed = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super({
      ...options,
      name: "raumfeld"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    await this.ensureInfoObjects();
    await this.ensureMediaObjects();
    await this.setState("info.connection", false, true);
    const address = await this.resolveHostAddress();
    if (!address) {
      this.log.error(
        "Kein Raumfeld-Host gefunden. Laeuft der Host-Lautsprecher, und steht der Adapter im selben Netzsegment? SSDP wird zwischen Segmenten nicht weitergereicht - andernfalls die Adresse des Hosts in den Einstellungen eintragen."
      );
      return;
    }
    this.log.info(`Raumfeld-Host auf ${address}`);
    await this.setState("info.hostAddress", address, true);
    if (!await this.startEventListener(address)) {
      return;
    }
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
    this.subscribeStates("rooms.*");
    this.subscribeStates("media.*");
    this.hostService.start();
  }
  /**
   * Startet den Zuhoerer fuer UPnP-Ereignisse.
   *
   * Die Adresse, unter der die Geraete zurueckfinden, wird nicht geraten,
   * sondern beim Betriebssystem erfragt: eine kurze Verbindung zum Host
   * verraet, welche Netzkarte die Routingtabelle dafuer waehlt. Auf einem
   * Rechner mit mehreren Karten - wie hier einer im Server- und einer im
   * WLAN-Segment - ist das der einzige verlaessliche Weg.
   *
   * @param hostAddress - Adresse des Raumfeld-Hosts.
   * @returns Ob der Zuhoerer bereitsteht.
   */
  async startEventListener(hostAddress) {
    var _a;
    try {
      const configured = String((_a = this.config.bindAddress) != null ? _a : "").trim();
      const local = configured.length > 0 ? configured : await (0, import_gena.localAddressTowards)(hostAddress, import_hostService.HOST_SERVICE_PORT);
      this.gena = new import_gena.GenaListener({
        debug: (message) => this.log.debug(message),
        warn: (message) => this.log.warn(message)
      });
      await this.gena.start(local);
      this.log.info(`Ereignisse werden entgegengenommen auf ${this.gena.callbackBase}`);
      return true;
    } catch (err) {
      this.log.error(
        `Der Zuhoerer fuer Geraeteereignisse liess sich nicht starten: ${asMessage(err)}. Ohne ihn melden die Lautsprecher keine Aenderungen.`
      );
      return false;
    }
  }
  /**
   * Legt die Objekte des info-Zweiges an.
   *
   * Sie stehen zwar auch als instanceObjects in der io-package.json, aber die
   * werden nur beim Einrichten einer Instanz ausgewertet. Eine Instanz, die
   * es vor dem Hinzufuegen dieser Datenpunkte schon gab, haette sie sonst
   * nie - und jeder Schreibzugriff quittierte das mit der Warnung
   * "has no existing object".
   *
   * @returns Nichts.
   */
  async ensureInfoObjects() {
    await this.defineState("info.hostAddress", "Adresse des Raumfeld-Hosts", "string", "info.ip", false);
    await this.defineState("info.hostName", "Name des Host-Geraets", "string", "text", false);
    await this.defineState("info.hostRoom", "Raum, in dem der Host steht", "string", "text", false);
    await this.defineState("info.zones", "Aktuelle Zonenaufteilung als JSON", "string", "json", false);
  }
  /**
   * Legt die Objekte des media-Zweiges an.
   *
   * @returns Nichts.
   */
  async ensureMediaObjects() {
    await this.defineState("media.browse", 'Sammlung oeffnen, Vorgabe "0"', "string", "text", true);
    await this.defineState("media.browseId", "Zuletzt geoeffnete Sammlung", "string", "text", false);
    await this.defineState("media.browseParent", "Uebergeordnete Sammlung", "string", "text", false);
    await this.defineState("media.browseResult", "Inhalt als JSON", "string", "json", false);
    await this.defineState("media.browseTotal", "Anzahl der Eintraege im Zweig", "number", "value", false);
    await this.defineState("media.search", "Suchbegriff", "string", "text", true);
    await this.defineState("media.searchIn", "Zweig, in dem gesucht wird", "string", "text", true);
    await this.defineState("media.searchResult", "Treffer als JSON", "string", "json", false);
    await this.defineState("media.sources", "Oberste Ebene der Bibliothek als JSON", "string", "json", false);
    await this.defineState("media.indexerStatus", "Stand der Bibliothekserfassung", "string", "text", false);
  }
  /**
   * Verbindet die Bibliothek des MediaServers.
   *
   * Der MediaServer laeuft auf demselben Geraet wie der Host. Seine Ports
   * wechseln wie bei allen Raumfeld-Diensten mit jedem Neustart, deshalb
   * wird die Verbindung neu aufgebaut, sobald die Beschreibung woanders liegt.
   *
   * @param location - Adresse der Geraetebeschreibung des MediaServers.
   * @returns Nichts.
   */
  async setupLibrary(location) {
    if (this.libraryLocation === location && this.library) {
      return;
    }
    try {
      const service = (await (0, import_deviceDirectory.readServices)(location)).get("ContentDirectory");
      if (!service) {
        this.log.warn("Der MediaServer bietet kein ContentDirectory an");
        return;
      }
      this.library = new import_library.LibraryClient(service);
      this.libraryLocation = location;
      this.log.debug(`Bibliothek verbunden: ${service.controlUrl}`);
      const root = await this.library.browse("0");
      await this.setState("media.sources", JSON.stringify(root.entries.map(toPlainEntry)), true);
      await this.setState("media.indexerStatus", await this.library.indexerStatus(), true);
    } catch (err) {
      this.log.warn(`Bibliothek nicht erreichbar: ${asMessage(err)}`);
    }
  }
  /**
   * Ermittelt die Adresse des Hosts: entweder aus den Einstellungen oder per
   * SSDP-Suche nach dem ConfigDevice, das es im System nur einmal gibt.
   *
   * @returns Die Adresse, oder undefined, wenn kein Host zu finden war.
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
  /**
   * Liest die unveraenderlichen Angaben des Hosts einmal aus.
   *
   * @returns Nichts.
   */
  async readHostInfo() {
    var _a, _b;
    if (!this.hostService) {
      return;
    }
    try {
      const info = await this.hostService.fetchHostInfo();
      await this.setState("info.hostName", (_a = info.hostName) != null ? _a : "", true);
      await this.setState("info.hostRoom", (_b = info.roomName) != null ? _b : "", true);
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
   * @returns Nichts.
   */
  async applyZoneConfiguration(config) {
    var _a, _b;
    this.log.debug(
      `Zonenaufteilung: ${config.zones.length} Zonen, ${config.unassignedRooms.length} einzelne Raeume`
    );
    await this.refreshDeviceLocations();
    await this.setState(
      "info.zones",
      JSON.stringify(config.zones.map((zone) => ({ udn: zone.udn, rooms: zone.rooms.map((room) => room.name) }))),
      true
    );
    const present = /* @__PURE__ */ new Set();
    for (const room of config.allRooms) {
      const id = await this.ensureRoom(room);
      present.add(id);
      this.rooms.set(id, {
        id,
        udn: room.udn,
        rendererUdn: (_b = (_a = room.renderers[0]) == null ? void 0 : _a.udn) != null ? _b : "",
        zoneUdn: room.zoneUdn
      });
      if (room.renderers[0]) {
        this.roomByRenderer.set(room.renderers[0].udn, id);
      }
      await this.writeRoomStates(id, room, true);
      await this.attachRenderer(id);
    }
    for (const [udn, id] of this.roomIds) {
      if (!present.has(id)) {
        this.log.debug(`Raum ${id} (${udn}) ist derzeit nicht gemeldet`);
        await this.setState(`rooms.${id}.online`, false, true);
      }
    }
  }
  /**
   * Holt die aktuelle Geraeteliste des Hosts.
   *
   * Die Ports der Dienste wechseln bei jedem Neustart eines Lautsprechers.
   * Deshalb wird die Liste bei jeder Aenderung der Zonen neu gelesen, statt
   * die Adressen einmal zu merken.
   *
   * @returns Nichts.
   */
  async refreshDeviceLocations() {
    if (!this.hostService) {
      return;
    }
    try {
      for (const device of await this.hostService.fetchDevices()) {
        this.deviceLocations.set(device.udn, device.location);
        if (device.type.includes("MediaServer")) {
          await this.setupLibrary(device.location);
        }
      }
    } catch (err) {
      this.log.debug(`listDevices nicht lesbar: ${asMessage(err)}`);
    }
  }
  /**
   * Verbindet den Renderer eines Raumes: Bedienschnittstelle aufbauen,
   * Ereignisse abonnieren und die Ausgangswerte einlesen.
   *
   * @param roomId - Objekt-ID des Raumes.
   * @returns Nichts.
   */
  async attachRenderer(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.rendererUdn === "") {
      return;
    }
    const control = await this.controlFor(room.rendererUdn);
    if (!control) {
      return;
    }
    const location = this.deviceLocations.get(room.rendererUdn);
    if (this.gena && location !== void 0 && this.subscribed.get(room.rendererUdn) !== location) {
      this.subscribed.set(room.rendererUdn, location);
      for (const service of ["AVTransport", "RenderingControl"]) {
        const url = control.eventUrl(service);
        if (!url) {
          continue;
        }
        try {
          await this.gena.subscribe(url, (properties) => {
            void this.onRendererEvent(room.rendererUdn, properties);
          });
        } catch (err) {
          this.log.warn(`${service} von ${roomId} nicht abonnierbar: ${asMessage(err)}`);
        }
      }
    }
    await this.readInitialValues(roomId, control);
  }
  /**
   * Baut die Bedienschnittstelle eines Geraets auf, oder liefert die
   * vorhandene.
   *
   * @param udn - Kennung des Geraets.
   * @returns Die Bedienschnittstelle, oder undefined, wenn das Geraet
   *   derzeit nicht erreichbar ist.
   */
  async controlFor(udn) {
    const location = this.deviceLocations.get(udn);
    if (location === void 0) {
      return void 0;
    }
    const known = this.controls.get(udn);
    if (known && known.location === location) {
      return known.control;
    }
    try {
      const control = new import_renderer.RendererControl(await (0, import_deviceDirectory.readServices)(location));
      this.controls.set(udn, { control, location });
      return control;
    } catch (err) {
      this.log.debug(`Geraetebeschreibung von ${udn} nicht lesbar: ${asMessage(err)}`);
      return void 0;
    }
  }
  /**
   * Liest die Werte, die nicht von selbst gemeldet werden, einmal aus.
   *
   * Die Ereignisse liefern Lautstaerke und Wiedergabezustand erst bei der
   * naechsten Aenderung. Nach einem Neustart des Adapters stuenden die
   * Datenpunkte sonst leer da, bis jemand etwas anfasst.
   *
   * @param roomId - Objekt-ID des Raumes.
   * @param control - Bedienschnittstelle des Renderers.
   * @returns Nichts.
   */
  async readInitialValues(roomId, control) {
    if (control.has("RenderingControl")) {
      try {
        await this.setState(`rooms.${roomId}.volume`, await control.volume(), true);
        await this.setState(`rooms.${roomId}.mute`, await control.mute(), true);
        const filter = await control.filter();
        await this.setState(`rooms.${roomId}.equalizer.low`, filter.low, true);
        await this.setState(`rooms.${roomId}.equalizer.mid`, filter.mid, true);
        await this.setState(`rooms.${roomId}.equalizer.high`, filter.high, true);
      } catch (err) {
        this.log.debug(`Klangwerte von ${roomId} nicht lesbar: ${asMessage(err)}`);
      }
    }
    if (control.has("AVTransport")) {
      try {
        const transport = await control.transportInfo();
        await this.setState(`rooms.${roomId}.transport.state`, transport.state, true);
        await this.setState(`rooms.${roomId}.transport.playMode`, await control.playMode(), true);
        await this.writePosition(roomId, control);
      } catch (err) {
        this.log.debug(`Wiedergabezustand von ${roomId} nicht lesbar: ${asMessage(err)}`);
      }
    }
  }
  /**
   * Schreibt Laufzeit und Dauer eines Raumes.
   *
   * @param roomId - Objekt-ID des Raumes.
   * @param control - Bedienschnittstelle des Renderers.
   * @returns Nichts.
   */
  async writePosition(roomId, control) {
    const position = await control.positionInfo();
    await this.setState(`rooms.${roomId}.transport.position`, position.position, true);
    await this.setState(`rooms.${roomId}.transport.positionSec`, (0, import_events.durationToSeconds)(position.position), true);
    await this.setState(`rooms.${roomId}.transport.duration`, position.duration, true);
    await this.setState(`rooms.${roomId}.transport.durationSec`, (0, import_events.durationToSeconds)(position.duration), true);
  }
  /**
   * Verarbeitet eine Meldung eines Renderers.
   *
   * Alles Interessante steckt im LastChange-Element; daneben kommt bei
   * AVTransport noch BufferFilled als eigene Eigenschaft an, die hier nicht
   * gebraucht wird.
   *
   * @param rendererUdn - Kennung des meldenden Renderers.
   * @param properties - Die Eigenschaften aus der Meldung.
   * @returns Nichts.
   */
  async onRendererEvent(rendererUdn, properties) {
    var _a;
    const roomId = this.roomByRenderer.get(rendererUdn);
    if (roomId === void 0 || properties.LastChange === void 0) {
      return;
    }
    const values = (0, import_events.parseLastChange)(properties.LastChange);
    const base = `rooms.${roomId}`;
    if (values.TransportState !== void 0) {
      await this.setState(`${base}.transport.state`, values.TransportState, true);
    }
    if (values.CurrentPlayMode !== void 0) {
      await this.setState(`${base}.transport.playMode`, values.CurrentPlayMode, true);
    }
    const reportedDuration = values.CurrentTrackDuration;
    if (reportedDuration !== void 0 && reportedDuration !== "0:00:00" && reportedDuration !== "NOT_IMPLEMENTED") {
      await this.setState(`${base}.transport.duration`, reportedDuration, true);
      await this.setState(`${base}.transport.durationSec`, (0, import_events.durationToSeconds)(reportedDuration), true);
    }
    if (values.AVTransportURI !== void 0) {
      await this.setState(`${base}.track.uri`, values.AVTransportURI, true);
    }
    if (values.PowerState !== void 0) {
      await this.setState(`${base}.powerState`, values.PowerState, true);
      await this.setState(`${base}.standby`, values.PowerState !== "ACTIVE", true);
    }
    const metadata = (_a = values.CurrentTrackMetaData) != null ? _a : values.AVTransportURIMetaData;
    if (metadata !== void 0) {
      const track = (0, import_events.parseDidlLite)(metadata);
      if (track) {
        await this.setState(`${base}.track.title`, track.title, true);
        await this.setState(`${base}.track.artist`, track.artist, true);
        await this.setState(`${base}.track.album`, track.album, true);
        await this.setState(`${base}.track.albumArt`, track.albumArtUri, true);
        await this.setState(`${base}.track.source`, track.section, true);
      }
    }
    if (values.Volume !== void 0) {
      await this.setState(`${base}.volume`, Number(values.Volume), true);
    }
    if (values.Mute !== void 0) {
      await this.setState(`${base}.mute`, values.Mute === "1", true);
    }
    for (const [name, id] of [
      ["LowDB", "low"],
      ["MidDB", "mid"],
      ["HighDB", "high"]
    ]) {
      if (values[name] !== void 0) {
        await this.setState(`${base}.equalizer.${id}`, Number(values[name]), true);
      }
    }
  }
  /**
   * Legt die Objekte eines Raumes an, falls sie noch fehlen.
   *
   * @param room - Der Raum, so wie der Host ihn meldet.
   * @returns Die Objekt-ID des Raumes.
   */
  async ensureRoom(room) {
    const id = (0, import_raumfeldXml.roomIdFromName)(room.name);
    const previous = this.roomIds.get(room.udn);
    if (previous !== void 0 && previous !== id) {
      this.log.warn(
        `Raum "${previous}" heisst jetzt "${room.name}". Der alte Zweig rooms.${previous} bleibt stehen und kann von Hand geloescht werden.`
      );
    }
    if (this.roomIds.get(room.udn) === id && this.rooms.has(id)) {
      return id;
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
    await this.defineState(`rooms.${id}.standby`, "Bereitschaft", "boolean", "switch.power", true);
    await this.defineState(`rooms.${id}.volume`, "Lautstaerke", "number", "level.volume", true, {
      min: 0,
      max: 100,
      unit: "%"
    });
    await this.defineState(`rooms.${id}.mute`, "Stumm", "boolean", "media.mute", true);
    for (const [channel, label] of [
      ["low", "Tiefen"],
      ["mid", "Mitten"],
      ["high", "Hoehen"]
    ]) {
      await this.defineState(`rooms.${id}.equalizer.${channel}`, `${label} in dB`, "number", "level", true, {
        unit: "dB"
      });
    }
    await this.defineState(`rooms.${id}.transport.state`, "Wiedergabezustand", "string", "media.state", false);
    await this.defineState(`rooms.${id}.transport.playMode`, "Abspielart", "string", "media.mode.repeat", true);
    await this.defineState(`rooms.${id}.transport.position`, "Laufzeit", "string", "media.elapsed.text", false);
    await this.defineState(
      `rooms.${id}.transport.positionSec`,
      "Laufzeit in Sekunden",
      "number",
      "media.elapsed",
      false,
      { unit: "s" }
    );
    await this.defineState(`rooms.${id}.transport.duration`, "Dauer", "string", "media.duration.text", false);
    await this.defineState(
      `rooms.${id}.transport.durationSec`,
      "Dauer in Sekunden",
      "number",
      "media.duration",
      false,
      { unit: "s" }
    );
    await this.defineState(`rooms.${id}.transport.seek`, "Springen nach h:mm:ss", "string", "media.seek", true);
    await this.defineState(`rooms.${id}.transport.playUri`, "Adresse abspielen", "string", "media.url", true);
    await this.defineState(
      `rooms.${id}.transport.playObject`,
      "Eintrag aus der Bibliothek abspielen",
      "string",
      "text",
      true
    );
    for (const [command, label] of [
      ["play", "Abspielen"],
      ["pause", "Anhalten"],
      ["stop", "Beenden"],
      ["next", "Naechster Titel"],
      ["previous", "Voriger Titel"]
    ]) {
      await this.defineState(`rooms.${id}.transport.${command}`, label, "boolean", `button.${command}`, true);
    }
    for (const [field, label] of [
      ["title", "Titel"],
      ["artist", "Interpret"],
      ["album", "Album"],
      ["albumArt", "Titelbild"],
      ["uri", "Adresse"],
      ["source", "Quelle"]
    ]) {
      await this.defineState(`rooms.${id}.track.${field}`, label, "string", "media.title", false);
    }
    await this.defineState(`rooms.${id}.group.joinRoom`, "Zu Raum hinzufuegen", "string", "text", true);
    await this.defineState(`rooms.${id}.group.leave`, "Aus der Zone loesen", "boolean", "button", true);
    return id;
  }
  /**
   * Schreibt die Angaben, die aus der Zonenaufteilung stammen.
   *
   * @param id - Objekt-ID des Raumes.
   * @param room - Der Raum, so wie der Host ihn meldet.
   * @param online - Ob der Raum in der aktuellen Meldung enthalten war.
   * @returns Nichts.
   */
  async writeRoomStates(id, room, online) {
    var _a, _b;
    await this.setState(`rooms.${id}.name`, room.name, true);
    await this.setState(`rooms.${id}.online`, online, true);
    const powerState = (_a = room.powerState) != null ? _a : "ACTIVE";
    await this.setState(`rooms.${id}.powerState`, powerState, true);
    await this.setState(`rooms.${id}.standby`, powerState !== "ACTIVE", true);
    await this.setState(`rooms.${id}.zone`, (_b = room.zoneUdn) != null ? _b : "", true);
    await this.setState(
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
   * @param extra - Weitere Angaben wie Einheit oder Grenzen.
   * @returns Nichts; das Objekt wird nur angelegt, wenn es noch fehlt.
   */
  async defineState(id, name, type, role, write, extra = {}) {
    await this.setObjectNotExistsAsync(id, {
      type: "state",
      common: { name, type, role, read: true, write, ...extra },
      native: {}
    });
  }
  /**
   * Waehlt den Renderer, an den ein Transportbefehl geht.
   *
   * Steckt der Raum in einer Zone, gehoert der Befehl an deren Renderer -
   * sonst spielte nur ein Lautsprecher der Gruppe. Ein Raum ohne Zone
   * bedient seinen eigenen Renderer.
   *
   * @param room - Der Raum, um den es geht.
   * @returns Die zustaendige Bedienschnittstelle, falls erreichbar.
   */
  async transportControl(room) {
    if (room.zoneUdn !== void 0 && room.zoneUdn !== "") {
      const zoneControl = await this.controlFor(room.zoneUdn);
      if (zoneControl) {
        return zoneControl;
      }
      this.log.debug(`Zonen-Renderer ${room.zoneUdn} nicht erreichbar, verwende den Raum-Renderer`);
    }
    return await this.controlFor(room.rendererUdn);
  }
  /**
   * @param id - State ID
   * @param state - State object
   */
  onStateChange(id, state) {
    if (!state || state.ack) {
      return;
    }
    void this.handleCommand(id, state).catch((err) => {
      this.log.error(`Befehl ${id} fehlgeschlagen: ${asMessage(err)}`);
    });
  }
  /**
   * Fuehrt einen vom Nutzer geschriebenen Datenpunkt aus.
   *
   * @param id - Vollstaendige Objekt-ID des Datenpunkts.
   * @param state - Der geschriebene Zustand.
   * @returns Nichts.
   */
  async handleCommand(id, state) {
    var _a;
    const media = /\.media\.(.+)$/.exec(id);
    if (media) {
      await this.handleMediaCommand(id, media[1], state);
      return;
    }
    const match = /\.rooms\.([^.]+)\.(.+)$/.exec(id);
    if (!match) {
      return;
    }
    const [, roomId, path] = match;
    const room = this.rooms.get(roomId);
    if (!room) {
      this.log.warn(`Befehl fuer unbekannten Raum ${roomId}`);
      return;
    }
    const value = state.val;
    this.log.debug(`Befehl ${path} fuer ${roomId}: ${String(value)}`);
    const own = await this.controlFor(room.rendererUdn);
    switch (path) {
      case "volume":
        await (own == null ? void 0 : own.setVolume(Number(value)));
        return;
      case "mute":
        await (own == null ? void 0 : own.setMute(Boolean(value)));
        return;
      case "standby":
        if (value) {
          await (own == null ? void 0 : own.enterManualStandby());
        } else {
          await (own == null ? void 0 : own.leaveStandby());
        }
        return;
      case "equalizer.low":
      case "equalizer.mid":
      case "equalizer.high":
        await this.applyFilter(room, path.split(".")[1], Number(value));
        return;
      case "group.joinRoom":
        await this.joinRoom(room, String(value));
        await this.setState(id, "", true);
        return;
      case "group.leave":
        await ((_a = this.hostService) == null ? void 0 : _a.connectRoomToZone(room.udn));
        await this.setState(id, false, true);
        return;
      default:
        break;
    }
    const transport = await this.transportControl(room);
    if (!transport) {
      this.log.warn(`Kein erreichbarer Renderer fuer ${roomId}`);
      return;
    }
    switch (path) {
      case "transport.play":
      case "transport.pause":
      case "transport.stop":
      case "transport.next":
      case "transport.previous": {
        const command = path.split(".")[1];
        await transport[command]();
        await this.setState(id, false, true);
        return;
      }
      case "transport.playMode":
        await transport.setPlayMode(String(value));
        return;
      case "transport.seek":
        await transport.seek(String(value));
        await this.setState(id, "", true);
        return;
      case "transport.playUri":
        await transport.setUri(String(value));
        await transport.play();
        await this.setState(id, "", true);
        return;
      case "transport.playObject":
        await this.playObject(transport, String(value), roomId);
        await this.setState(id, "", true);
        return;
      default:
        this.log.debug(`Fuer ${path} gibt es keinen Befehl`);
    }
  }
  /**
   * Spielt einen Eintrag der Bibliothek ab.
   *
   * Die Abspieladresse steht nur am Objekt selbst, nicht in der Liste seiner
   * Geschwister - deshalb wird sie hier eigens geholt. Mitgeschickt wird das
   * vollstaendige DIDL-Lite, damit der Lautsprecher Titel, Interpret und
   * Titelbild anzeigen kann.
   *
   * @param transport - Der Renderer, der abspielen soll.
   * @param objectId - Kennung des Eintrags aus der Bibliothek.
   * @param roomId - Objekt-ID des Raumes, fuer die Spieldauer.
   * @returns Nichts.
   */
  async playObject(transport, objectId, roomId) {
    if (!this.library) {
      this.log.warn("Die Bibliothek ist nicht verbunden");
      return;
    }
    const found = await this.library.metadata(objectId);
    if (!found) {
      this.log.warn(`In der Bibliothek gibt es keinen Eintrag "${objectId}"`);
      return;
    }
    if (found.entry.uri === "") {
      this.log.warn(
        `"${found.entry.title}" ist eine Sammlung ohne eigene Abspieladresse. Einzelne Titel lassen sich abspielen, ganze Sammlungen erst mit der Warteschlange.`
      );
      return;
    }
    await transport.setUri(found.entry.uri, found.didl);
    await transport.play();
    this.log.info(`Spiele "${found.entry.title}"`);
    if (found.entry.duration !== "" && roomId !== void 0) {
      await this.setState(`rooms.${roomId}.transport.duration`, found.entry.duration, true);
      await this.setState(`rooms.${roomId}.transport.durationSec`, (0, import_events.durationToSeconds)(found.entry.duration), true);
    }
  }
  /**
   * Fuehrt einen Befehl des media-Zweiges aus.
   *
   * @param id - Vollstaendige Objekt-ID des Datenpunkts.
   * @param path - Der Teil hinter "media.".
   * @param state - Der geschriebene Zustand.
   * @returns Nichts.
   */
  async handleMediaCommand(id, path, state) {
    var _a, _b, _c, _d;
    if (!this.library) {
      this.log.warn("Die Bibliothek ist nicht verbunden");
      return;
    }
    const value = String((_a = state.val) != null ? _a : "");
    if (path === "browse") {
      const objectId = value.trim() === "" ? "0" : value.trim();
      const result = await this.library.browse(objectId);
      await this.setState("media.browseId", objectId, true);
      const own = await this.library.metadata(objectId);
      await this.setState("media.browseParent", (_b = own == null ? void 0 : own.entry.parentId) != null ? _b : "", true);
      await this.setState("media.browseResult", JSON.stringify(result.entries.map(toPlainEntry)), true);
      await this.setState("media.browseTotal", result.total, true);
      await this.setState(id, objectId, true);
      this.log.debug(`${objectId}: ${result.entries.length} von ${result.total} Eintraegen gelesen`);
      return;
    }
    if (path === "search") {
      if (value.trim() === "") {
        await this.setState("media.searchResult", "[]", true);
        return;
      }
      const container = String((_d = (_c = await this.getStateAsync("media.searchIn")) == null ? void 0 : _c.val) != null ? _d : "").trim() || "0";
      const result = await this.library.search(container, value.trim());
      await this.setState("media.searchResult", JSON.stringify(result.entries.map(toPlainEntry)), true);
      await this.setState(id, value, true);
      this.log.debug(`Suche nach "${value}" in ${container}: ${result.total} Treffer`);
      return;
    }
    if (path === "searchIn") {
      await this.setState(id, value, true);
    }
  }
  /**
   * Setzt ein Band des Klangreglers.
   *
   * Das Geraet kennt nur SetFilter fuer alle drei Baender gemeinsam, also
   * werden die beiden anderen Werte mitgelesen und unveraendert mitgeschickt.
   *
   * @param room - Der betroffene Raum.
   * @param band - Welches Band geaendert wurde.
   * @param value - Der neue Wert in Dezibel.
   * @returns Nichts.
   */
  async applyFilter(room, band, value) {
    const control = await this.controlFor(room.rendererUdn);
    if (!control) {
      return;
    }
    const filter = await control.filter();
    filter[band] = value;
    await control.setFilter(filter);
  }
  /**
   * Fuegt einen Raum der Zone eines anderen Raumes hinzu.
   *
   * @param room - Der Raum, der wandern soll.
   * @param targetName - Name des Zielraums.
   * @returns Nichts.
   */
  async joinRoom(room, targetName) {
    var _a;
    const targetId = (0, import_raumfeldXml.roomIdFromName)(targetName);
    const target = this.rooms.get(targetId);
    if (!target) {
      this.log.warn(`Zielraum "${targetName}" ist nicht bekannt`);
      return;
    }
    if (target.zoneUdn === void 0 || target.zoneUdn === "") {
      this.log.warn(
        `"${targetName}" gehoert derzeit keiner Zone an. Dort muss erst etwas abgespielt werden, damit eine Zone entsteht, der sich andere Raeume anschliessen koennen.`
      );
      return;
    }
    await ((_a = this.hostService) == null ? void 0 : _a.connectRoomToZone(room.udn, target.zoneUdn));
  }
  /**
   * Beantwortet Anfragen der Konfigurationsseite.
   *
   * Die Seite kann den Adapter fragen, statt den Nutzer raten zu lassen: sie
   * laesst ihn nach Geraeten suchen, bietet die eigenen Netzkarten zur
   * Auswahl an und prueft die eingetragene Verbindung. Das funktioniert auch,
   * wenn der Adapter selbst keinen Host gefunden hat - die Instanz laeuft
   * dann zwar ohne Verbindung weiter, nimmt aber Nachrichten entgegen. Genau
   * in dieser Lage braucht man die Suche am dringendsten.
   *
   * @param obj - Die eingegangene Nachricht.
   * @returns Nichts.
   */
  async onMessage(obj) {
    if (typeof obj !== "object" || !obj.command) {
      return;
    }
    const answer = (payload) => {
      if (obj.callback) {
        this.sendTo(obj.from, obj.command, payload, obj.callback);
      }
    };
    try {
      switch (obj.command) {
        case "discoverHosts":
          answer(await this.suggestHosts());
          return;
        case "listInterfaces":
          answer(this.suggestInterfaces());
          return;
        case "testConnection":
          answer({ result: await this.describeConnection(obj.message) });
          return;
        default:
          this.log.debug(`Unbekannter Befehl aus der Oberflaeche: ${obj.command}`);
          answer({ error: `Unbekannter Befehl ${obj.command}` });
      }
    } catch (err) {
      answer({ error: asMessage(err) });
    }
  }
  /**
   * Sucht Raumfeld-Hosts und bietet sie zur Auswahl an.
   *
   * @returns Die gefundenen Adressen als Auswahlliste.
   */
  async suggestHosts() {
    var _a;
    const bindAddress = String((_a = this.config.bindAddress) != null ? _a : "").trim() || void 0;
    const result = await (0, import_discovery.discover)(bindAddress);
    const options = result.hostCandidates.map((address) => ({
      label: `${address} (Host)`,
      value: address
    }));
    for (const address of result.deviceAddresses) {
      if (!result.hostCandidates.includes(address)) {
        options.push({ label: `${address} (Lautsprecher)`, value: address });
      }
    }
    return [{ label: "automatisch suchen", value: "" }, ...options];
  }
  /**
   * Listet die eigenen Netzkarten auf.
   *
   * @returns Die verfuegbaren IPv4-Adressen als Auswahlliste.
   */
  suggestInterfaces() {
    const options = [{ label: "automatisch waehlen", value: "" }];
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
      for (const address of addresses != null ? addresses : []) {
        if (address.family === "IPv4" && !address.internal) {
          options.push({ label: `${address.address} (${name})`, value: address.address });
        }
      }
    }
    return options;
  }
  /**
   * Prueft, was unter den eingetragenen Angaben erreichbar ist.
   *
   * @param message - Die Angaben der Konfigurationsseite.
   * @returns Ein lesbarer Bericht fuer die Oberflaeche.
   */
  async describeConnection(message) {
    var _a, _b;
    const config = message != null ? message : {};
    const bindAddress = String((_a = config.bindAddress) != null ? _a : "").trim() || void 0;
    let address = String((_b = config.hostAddress) != null ? _b : "").trim();
    if (address === "") {
      const found = await (0, import_discovery.discover)(bindAddress);
      if (found.hostCandidates.length === 0) {
        return "Kein Host gefunden. SSDP wird zwischen Netzsegmenten nicht weitergereicht - steht der Adapter woanders als die Lautsprecher, muss die Adresse hier eingetragen werden.";
      }
      address = found.hostCandidates[0];
    }
    const probe = new import_hostService.RaumfeldHostService({ address });
    const info = await probe.fetchHostInfo();
    const zones = await probe.fetchZones();
    const devices = await probe.fetchDevices();
    return (0, import_report.describeSystem)(address, info, zones, devices);
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
      const gena = this.gena;
      this.gena = void 0;
      if (!gena) {
        callback();
        return;
      }
      void gena.stop().finally(() => callback());
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
      callback();
    }
  }
}
function asMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function toPlainEntry(entry) {
  const plain = {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    playable: entry.uri !== ""
  };
  for (const [key, value] of Object.entries(entry)) {
    if (key === "id" || key === "title" || key === "kind") {
      continue;
    }
    if (value !== "" && value !== 0) {
      plain[key] = value;
    }
  }
  return plain;
}
if (require.main !== module) {
  module.exports = (options) => new Raumfeld(options);
} else {
  (() => new Raumfeld())();
}
//# sourceMappingURL=main.js.map
