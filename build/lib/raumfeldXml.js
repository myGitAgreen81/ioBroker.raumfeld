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
var raumfeldXml_exports = {};
__export(raumfeldXml_exports, {
  parseDeviceList: () => parseDeviceList,
  parseHostInfo: () => parseHostInfo,
  parseZoneConfiguration: () => parseZoneConfiguration,
  roomIdFromName: () => roomIdFromName
});
module.exports = __toCommonJS(raumfeldXml_exports);
var import_fast_xml_parser = require("fast-xml-parser");
const parser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // Einzelne Kinder sollen trotzdem als Liste ankommen. Ohne das muesste
  // jede Stelle unterscheiden, ob gerade ein Raum oder mehrere geliefert
  // wurden - genau dort entstehen sonst die Fehler, die erst auffallen,
  // wenn jemand einen zweiten Lautsprecher kauft.
  isArray: (name) => ["zone", "room", "renderer", "device"].includes(name)
});
function asText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
function attr(node, name) {
  const value = node[`@${name}`];
  return value === void 0 || value === null ? void 0 : asText(value);
}
function parseRenderer(node) {
  var _a, _b;
  return {
    udn: (_a = attr(node, "udn")) != null ? _a : "",
    name: (_b = attr(node, "name")) != null ? _b : "",
    spotifyConnect: attr(node, "spotifyConnect") === "active"
  };
}
function parseRoom(node, zoneUdn) {
  var _a, _b, _c;
  const renderers = (_a = node.renderer) != null ? _a : [];
  return {
    udn: (_b = attr(node, "udn")) != null ? _b : "",
    name: (_c = attr(node, "name")) != null ? _c : "",
    powerState: attr(node, "powerState"),
    renderers: renderers.map(parseRenderer),
    zoneUdn
  };
}
function parseZoneConfiguration(xml) {
  var _a, _b, _c, _d;
  const doc = parser.parse(xml);
  const config = (_a = doc.zoneConfig) != null ? _a : {};
  const zoneNodes = (_b = config.zones) == null ? void 0 : _b.zone;
  const zones = (zoneNodes != null ? zoneNodes : []).map((node) => {
    var _a2, _b2;
    const udn = (_a2 = attr(node, "udn")) != null ? _a2 : "";
    const rooms = ((_b2 = node.room) != null ? _b2 : []).map((room) => parseRoom(room, udn));
    return { udn, rooms };
  });
  const unassignedNodes = (_c = config.unassignedRooms) == null ? void 0 : _c.room;
  const unassignedRooms = (unassignedNodes != null ? unassignedNodes : []).map((room) => parseRoom(room));
  const numRooms = Number((_d = attr(config, "numRooms")) != null ? _d : NaN);
  return {
    numRooms: Number.isFinite(numRooms) ? numRooms : zones.reduce((sum, zone) => sum + zone.rooms.length, 0) + unassignedRooms.length,
    spotifyMode: attr(config, "spotifyMode"),
    zones,
    unassignedRooms,
    allRooms: [...zones.flatMap((zone) => zone.rooms), ...unassignedRooms]
  };
}
function parseDeviceList(xml) {
  var _a;
  const doc = parser.parse(xml);
  const nodes = ((_a = doc.devices) != null ? _a : {}).device;
  return (nodes != null ? nodes : []).map((node) => {
    var _a2, _b, _c;
    return {
      udn: (_a2 = attr(node, "udn")) != null ? _a2 : "",
      type: (_b = attr(node, "type")) != null ? _b : "",
      location: (_c = attr(node, "location")) != null ? _c : "",
      // Der Geraetename steht als Textinhalt im Element, nicht als Attribut.
      name: asText(node["#text"])
    };
  });
}
function parseHostInfo(xml) {
  var _a;
  const doc = parser.parse(xml);
  const info = (_a = doc.hostInfo) != null ? _a : {};
  return {
    hostName: info.hostName === void 0 ? void 0 : asText(info.hostName),
    roomName: info.roomName === void 0 ? void 0 : asText(info.roomName)
  };
}
function roomIdFromName(name) {
  const cleaned = name.replace(/[.*,;'"\\[\]\s]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return cleaned.length > 0 ? cleaned : "unbenannt";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseDeviceList,
  parseHostInfo,
  parseZoneConfiguration,
  roomIdFromName
});
//# sourceMappingURL=raumfeldXml.js.map
