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
var deviceDirectory_exports = {};
__export(deviceDirectory_exports, {
  readServices: () => readServices,
  shortServiceName: () => shortServiceName
});
module.exports = __toCommonJS(deviceDirectory_exports);
var import_fast_xml_parser = require("fast-xml-parser");
var import_xmlText = require("./xmlText");
const parser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  isArray: (name) => ["service", "device"].includes(name)
});
function shortServiceName(urn) {
  const parts = urn.split(":");
  return parts.length >= 2 ? parts[parts.length - 2] : urn;
}
async function readServices(location, timeoutMs = 8e3) {
  var _a, _b, _c, _d;
  const res = await fetch(location, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`Geraetebeschreibung ${location}: HTTP ${res.status} ${res.statusText}`);
  }
  const doc = parser.parse(await res.text());
  const services = /* @__PURE__ */ new Map();
  const queue = [...(_b = ((_a = doc.root) != null ? _a : {}).device) != null ? _b : []];
  while (queue.length > 0) {
    const device = queue.shift();
    if (!device) {
      continue;
    }
    const children = (_c = device.deviceList) == null ? void 0 : _c.device;
    if (children) {
      queue.push(...children);
    }
    const list = (_d = device.serviceList) == null ? void 0 : _d.service;
    for (const service of list != null ? list : []) {
      const serviceType = (0, import_xmlText.asText)(service.serviceType);
      if (serviceType === "") {
        continue;
      }
      services.set(shortServiceName(serviceType), {
        serviceType,
        controlUrl: new URL((0, import_xmlText.asText)(service.controlURL), location).toString(),
        eventSubUrl: new URL((0, import_xmlText.asText)(service.eventSubURL), location).toString()
      });
    }
  }
  return services;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  readServices,
  shortServiceName
});
//# sourceMappingURL=deviceDirectory.js.map
