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
var renderer_exports = {};
__export(renderer_exports, {
  RendererControl: () => RendererControl
});
module.exports = __toCommonJS(renderer_exports);
var import_soap = require("./soap");
const INSTANCE = 0;
class RendererControl {
  services;
  /**
   * @param services - Die Dienste aus der Geraetebeschreibung, nach Kurznamen.
   */
  constructor(services) {
    this.services = services;
  }
  /**
   * Prueft, ob ein Dienst vorhanden ist.
   *
   * @param name - Kurzname des Dienstes, etwa "RenderingControl".
   * @returns Ob das Geraet diesen Dienst anbietet.
   */
  has(name) {
    return this.services.has(name);
  }
  /**
   * Die Ereignis-URL eines Dienstes, fuer das GENA-Abonnement.
   *
   * @param name - Kurzname des Dienstes.
   * @returns Die URL, oder undefined, wenn der Dienst fehlt.
   */
  eventUrl(name) {
    var _a;
    return (_a = this.services.get(name)) == null ? void 0 : _a.eventSubUrl;
  }
  /**
   * Ruft eine Aktion eines Dienstes auf.
   *
   * @param name - Kurzname des Dienstes.
   * @param action - Name der Aktion.
   * @param args - Weitere Argumente neben der InstanceID.
   * @returns Die Ausgangsargumente der Aktion.
   */
  async call(name, action, args = {}) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Dienst ${name} ist auf diesem Geraet nicht vorhanden`);
    }
    return await (0, import_soap.soapCall)(service.controlUrl, service.serviceType, action, args);
  }
  // ---- AVTransport ------------------------------------------------------
  /**
   * Startet die Wiedergabe.
   *
   * @returns Nichts.
   */
  async play() {
    await this.call("AVTransport", "Play", { InstanceID: INSTANCE, Speed: "1" });
  }
  /**
   * Haelt die Wiedergabe an.
   *
   * @returns Nichts.
   */
  async pause() {
    await this.call("AVTransport", "Pause", { InstanceID: INSTANCE });
  }
  /**
   * Beendet die Wiedergabe.
   *
   * @returns Nichts.
   */
  async stop() {
    await this.call("AVTransport", "Stop", { InstanceID: INSTANCE });
  }
  /**
   * Springt zum naechsten Titel.
   *
   * @returns Nichts.
   */
  async next() {
    await this.call("AVTransport", "Next", { InstanceID: INSTANCE });
  }
  /**
   * Springt zum vorigen Titel.
   *
   * @returns Nichts.
   */
  async previous() {
    await this.call("AVTransport", "Previous", { InstanceID: INSTANCE });
  }
  /**
   * Springt an eine Stelle des laufenden Titels.
   *
   * @param position - Zielzeit in der Form h:mm:ss.
   * @returns Nichts.
   */
  async seek(position) {
    await this.call("AVTransport", "Seek", { InstanceID: INSTANCE, Unit: "REL_TIME", Target: position });
  }
  /**
   * Setzt die Abspielart.
   *
   * @param mode - NORMAL, REPEAT_ALL, SHUFFLE oder SHUFFLE_NOREPEAT.
   * @returns Nichts.
   */
  async setPlayMode(mode) {
    await this.call("AVTransport", "SetPlayMode", { InstanceID: INSTANCE, NewPlayMode: mode });
  }
  /**
   * Gibt eine Adresse zur Wiedergabe vor.
   *
   * @param uri - Die abzuspielende Adresse.
   * @param metadata - Zugehoerige DIDL-Lite-Angaben, meist leer.
   * @returns Nichts.
   */
  async setUri(uri, metadata = "") {
    await this.call("AVTransport", "SetAVTransportURI", {
      InstanceID: INSTANCE,
      CurrentURI: uri,
      CurrentURIMetaData: metadata
    });
  }
  /**
   * Weckt das Geraet aus dem Bereitschaftszustand.
   *
   * @returns Nichts.
   */
  async leaveStandby() {
    await this.call("AVTransport", "LeaveStandby", { InstanceID: INSTANCE });
  }
  /**
   * Schickt das Geraet in den Bereitschaftszustand.
   *
   * @returns Nichts.
   */
  async enterManualStandby() {
    await this.call("AVTransport", "EnterManualStandby", { InstanceID: INSTANCE });
  }
  /**
   * Fragt den Wiedergabezustand ab.
   *
   * @returns Zustand und Status des Transports.
   */
  async transportInfo() {
    var _a, _b;
    const result = await this.call("AVTransport", "GetTransportInfo", { InstanceID: INSTANCE });
    return {
      state: (_a = result.CurrentTransportState) != null ? _a : "",
      status: (_b = result.CurrentTransportStatus) != null ? _b : ""
    };
  }
  /**
   * Fragt Laufzeit und Dauer des laufenden Titels ab.
   *
   * Raumfeld liefert hier nur diese beiden Angaben; die Titelangaben kommen
   * ueber die Ereignisse, nicht ueber diese Aktion.
   *
   * @returns Verstrichene Zeit und Gesamtdauer.
   */
  async positionInfo() {
    var _a, _b;
    const result = await this.call("AVTransport", "GetPositionInfo", { InstanceID: INSTANCE });
    return {
      duration: (_a = result.TrackDuration) != null ? _a : "0:00:00",
      position: (_b = result.RelTime) != null ? _b : "0:00:00"
    };
  }
  /**
   * Fragt die Abspielart ab.
   *
   * @returns Die eingestellte Abspielart.
   */
  async playMode() {
    var _a;
    const result = await this.call("AVTransport", "GetTransportSettings", { InstanceID: INSTANCE });
    return (_a = result.PlayMode) != null ? _a : "NORMAL";
  }
  // ---- RenderingControl -------------------------------------------------
  /**
   * Fragt die Lautstaerke ab.
   *
   * @returns Die Lautstaerke zwischen 0 und 100.
   */
  async volume() {
    var _a;
    const result = await this.call("RenderingControl", "GetVolume", {
      InstanceID: INSTANCE,
      Channel: "Master"
    });
    return Number((_a = result.CurrentVolume) != null ? _a : 0);
  }
  /**
   * Setzt die Lautstaerke.
   *
   * @param value - Zielwert zwischen 0 und 100.
   * @returns Nichts.
   */
  async setVolume(value) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    await this.call("RenderingControl", "SetVolume", {
      InstanceID: INSTANCE,
      Channel: "Master",
      DesiredVolume: clamped
    });
  }
  /**
   * Fragt ab, ob der Ton abgeschaltet ist.
   *
   * @returns Ob stummgeschaltet ist.
   */
  async mute() {
    const result = await this.call("RenderingControl", "GetMute", {
      InstanceID: INSTANCE,
      Channel: "Master"
    });
    return result.CurrentMute === "1" || result.CurrentMute === "true";
  }
  /**
   * Schaltet den Ton ab oder wieder an.
   *
   * @param value - true schaltet stumm.
   * @returns Nichts.
   */
  async setMute(value) {
    await this.call("RenderingControl", "SetMute", {
      InstanceID: INSTANCE,
      Channel: "Master",
      DesiredMute: value ? 1 : 0
    });
  }
  /**
   * Fragt die Balance ab.
   *
   * @returns Der Balancewert des Geraets.
   */
  async balance() {
    var _a;
    const result = await this.call("RenderingControl", "GetBalance", { InstanceID: INSTANCE });
    return Number((_a = result.CurrentBalance) != null ? _a : 0);
  }
  /**
   * Setzt die Balance.
   *
   * @param value - Der gewuenschte Wert.
   * @returns Nichts.
   */
  async setBalance(value) {
    await this.call("RenderingControl", "SetBalance", {
      InstanceID: INSTANCE,
      DesiredBalance: Math.round(value)
    });
  }
  /**
   * Fragt den Klangregler ab.
   *
   * @returns Die drei Baender in Dezibel.
   */
  async filter() {
    var _a, _b, _c;
    const result = await this.call("RenderingControl", "GetFilter", { InstanceID: INSTANCE });
    return {
      low: Number((_a = result.LowDB) != null ? _a : 0),
      mid: Number((_b = result.MidDB) != null ? _b : 0),
      high: Number((_c = result.HighDB) != null ? _c : 0)
    };
  }
  /**
   * Setzt den Klangregler.
   *
   * Die drei Baender lassen sich nur gemeinsam setzen - eine Aktion fuer ein
   * einzelnes Band gibt es nicht. Wer eines aendert, muss die anderen beiden
   * mitschicken.
   *
   * @param filter - Die drei Baender in Dezibel.
   * @returns Nichts.
   */
  async setFilter(filter) {
    await this.call("RenderingControl", "SetFilter", {
      InstanceID: INSTANCE,
      LowDB: Math.round(filter.low),
      MidDB: Math.round(filter.mid),
      HighDB: Math.round(filter.high)
    });
  }
  /**
   * Spielt einen Systemton ab.
   *
   * @param sound - Name des Tons, wie ihn das Geraet kennt.
   * @returns Nichts.
   */
  async playSystemSound(sound) {
    await this.call("RenderingControl", "PlaySystemSound", { InstanceID: INSTANCE, Sound: sound });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RendererControl
});
//# sourceMappingURL=renderer.js.map
