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
var events_exports = {};
__export(events_exports, {
  durationToSeconds: () => durationToSeconds,
  parseDidlLite: () => parseDidlLite,
  parseLastChange: () => parseLastChange,
  parsePropertySet: () => parsePropertySet
});
module.exports = __toCommonJS(events_exports);
var import_fast_xml_parser = require("fast-xml-parser");
var import_xmlText = require("./xmlText");
const parser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // Entitaeten werden aufgeloest, sonst kaeme das eingebettete LastChange
  // als maskierter Text und nicht als auswertbares XML heraus.
  processEntities: true,
  parseAttributeValue: false,
  parseTagValue: false
});
function parsePropertySet(xml) {
  var _a, _b, _c;
  const doc = parser.parse(xml);
  const set = (_b = (_a = doc["e:propertyset"]) != null ? _a : doc.propertyset) != null ? _b : {};
  const raw = (_c = set["e:property"]) != null ? _c : set.property;
  const properties = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const result = {};
  for (const property of properties) {
    for (const [name, value] of Object.entries(property)) {
      if (name.startsWith("@")) {
        continue;
      }
      result[name] = (0, import_xmlText.asText)(value);
    }
  }
  return result;
}
function parseLastChange(xml) {
  var _a, _b, _c;
  const doc = parser.parse(xml);
  const event = (_a = doc.Event) != null ? _a : {};
  const instance = (_b = event.InstanceID) != null ? _b : {};
  const result = {};
  for (const [name, value] of Object.entries(instance)) {
    if (name.startsWith("@")) {
      continue;
    }
    const nodes = Array.isArray(value) ? value : [value];
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) {
        continue;
      }
      const channel = (0, import_xmlText.asText)((_c = node["@Channel"]) != null ? _c : node["@channel"]);
      if (channel !== "" && channel !== "Master") {
        continue;
      }
      result[name] = (0, import_xmlText.asText)(node["@val"]);
    }
  }
  return result;
}
function parseDidlLite(xml) {
  var _a, _b, _c;
  if (xml.trim().length === 0) {
    return void 0;
  }
  const doc = parser.parse(xml);
  const didl = (_a = doc["DIDL-Lite"]) != null ? _a : {};
  const raw = (_b = didl.item) != null ? _b : didl.container;
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item) {
    return void 0;
  }
  return {
    title: (0, import_xmlText.asText)(item["dc:title"]),
    artist: (0, import_xmlText.asText)((_c = item["upnp:artist"]) != null ? _c : item["dc:creator"]),
    album: (0, import_xmlText.asText)(item["upnp:album"]),
    albumArtUri: (0, import_xmlText.asText)(item["upnp:albumArtURI"]),
    // Raumfeld vermerkt hier die Quelle, etwa "Spotify" oder "TuneIn".
    section: (0, import_xmlText.asText)(item["raumfeld:section"]),
    objectId: (0, import_xmlText.asText)(item["@id"])
  };
}
function durationToSeconds(value) {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return 0;
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  durationToSeconds,
  parseDidlLite,
  parseLastChange,
  parsePropertySet
});
//# sourceMappingURL=events.js.map
