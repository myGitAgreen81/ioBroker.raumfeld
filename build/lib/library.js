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
var library_exports = {};
__export(library_exports, {
  LibraryClient: () => LibraryClient,
  parseLibraryEntries: () => parseLibraryEntries
});
module.exports = __toCommonJS(library_exports);
var import_fast_xml_parser = require("fast-xml-parser");
var import_soap = require("./soap");
const parser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  processEntities: true,
  parseTagValue: false,
  isArray: (name) => ["container", "item", "res"].includes(name)
});
function asText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return asText(value[0]);
  }
  if (typeof value === "object" && value !== null) {
    return asText(value["#text"]);
  }
  return "";
}
function parseLibraryEntries(xml) {
  var _a, _b, _c, _d;
  if (xml.trim().length === 0) {
    return [];
  }
  const doc = parser.parse(xml);
  const didl = (_a = doc["DIDL-Lite"]) != null ? _a : {};
  const entries = [];
  for (const [kind, key] of [
    ["container", "container"],
    ["item", "item"]
  ]) {
    for (const node of (_b = didl[key]) != null ? _b : []) {
      const resources = (_c = node.res) != null ? _c : [];
      const first = resources[0];
      entries.push({
        id: asText(node["@id"]),
        parentId: asText(node["@parentID"]),
        kind,
        title: asText(node["dc:title"]),
        upnpClass: asText(node["upnp:class"]),
        section: asText(node["raumfeld:section"]),
        childCount: Number(asText(node["@childCount"])) || 0,
        artist: asText((_d = node["upnp:artist"]) != null ? _d : node["dc:creator"]),
        album: asText(node["upnp:album"]),
        albumArt: asText(node["upnp:albumArtURI"]),
        duration: first ? asText(first["@duration"]) : "",
        uri: first ? asText(first) : ""
      });
    }
  }
  return entries;
}
class LibraryClient {
  service;
  /**
   * @param service - Der ContentDirectory-Dienst des MediaServers.
   */
  constructor(service) {
    this.service = service;
  }
  /**
   * Liest den Inhalt einer Sammlung.
   *
   * @param objectId - Kennung der Sammlung; "0" ist die Wurzel.
   * @param start - Ab welchem Eintrag gelesen wird.
   * @param count - Wie viele Eintraege hoechstens geliefert werden.
   * @returns Die Eintraege und die Gesamtzahl im Zweig.
   */
  async browse(objectId, start = 0, count = 100) {
    var _a, _b;
    const result = await (0, import_soap.soapCall)(this.service.controlUrl, this.service.serviceType, "Browse", {
      ObjectID: objectId,
      BrowseFlag: "BrowseDirectChildren",
      Filter: "*",
      StartingIndex: start,
      RequestedCount: count,
      SortCriteria: ""
    });
    return {
      entries: parseLibraryEntries((_a = result.Result) != null ? _a : ""),
      total: Number((_b = result.TotalMatches) != null ? _b : 0)
    };
  }
  /**
   * Liest die Angaben zu einem einzelnen Objekt.
   *
   * Das ist der Weg zur Abspieladresse: die res-Angabe steht nur am Objekt
   * selbst, nicht in der Liste seiner Geschwister.
   *
   * @param objectId - Kennung des Objekts.
   * @returns Der Eintrag samt DIDL-Lite, oder undefined, wenn es ihn nicht gibt.
   */
  async metadata(objectId) {
    var _a;
    const result = await (0, import_soap.soapCall)(this.service.controlUrl, this.service.serviceType, "Browse", {
      ObjectID: objectId,
      BrowseFlag: "BrowseMetadata",
      Filter: "*",
      StartingIndex: 0,
      RequestedCount: 1,
      SortCriteria: ""
    });
    const didl = (_a = result.Result) != null ? _a : "";
    const entry = parseLibraryEntries(didl)[0];
    return entry ? { entry, didl } : void 0;
  }
  /**
   * Sucht in einem Zweig der Bibliothek.
   *
   * **Der Server sucht nicht.** Seine Search-Aktion nimmt zwar ein
   * SearchCriteria entgegen und GetSearchCapabilities meldet dc:title, aber
   * ausgewertet wird die Bedingung nicht: nachgemessen an den vier
   * Demo-Titeln lieferten "Rock", "Electro" und ein frei erfundener Begriff
   * jeweils dieselbe vollstaendige Liste. Search verhaelt sich damit wie
   * Browse.
   *
   * Deshalb wird hier selbst gefiltert. Das hat eine Grenze, die man kennen
   * muss: gesucht wird nur unter den unmittelbaren Kindern des angegebenen
   * Zweiges, nicht in der Tiefe. Wer den ganzen Bestand durchsuchen will,
   * muss den passenden Zweig vorgeben - etwa "0/My Music/AllTracks".
   *
   * @param containerId - In welchem Zweig gesucht wird.
   * @param term - Der Suchbegriff, Gross- und Kleinschreibung egal.
   * @param count - Wie viele Eintraege hoechstens durchgesehen werden.
   * @returns Die Treffer und deren Anzahl.
   */
  async search(containerId, term, count = 500) {
    const { entries } = await this.browse(containerId, 0, count);
    const needle = term.toLowerCase();
    const hits = entries.filter(
      (entry) => entry.title.toLowerCase().includes(needle) || entry.artist.toLowerCase().includes(needle)
    );
    return { entries: hits, total: hits.length };
  }
  /**
   * Fragt ab, ob der Server gerade seine Bibliothek einliest.
   *
   * @returns Der Status, der bei untaetigem Server auch leer sein kann.
   */
  async indexerStatus() {
    var _a;
    const result = await (0, import_soap.soapCall)(this.service.controlUrl, this.service.serviceType, "GetIndexerStatus");
    return (_a = result.Status) != null ? _a : "";
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LibraryClient,
  parseLibraryEntries
});
//# sourceMappingURL=library.js.map
