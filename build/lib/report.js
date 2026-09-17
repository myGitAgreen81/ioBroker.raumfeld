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
var report_exports = {};
__export(report_exports, {
  describeSystem: () => describeSystem
});
module.exports = __toCommonJS(report_exports);
var import_deviceDirectory = require("./deviceDirectory");
function describeSystem(address, info, zones, devices) {
  var _a, _b, _c;
  const rooms = zones.allRooms.map((room) => room.name).join(", ") || "keine";
  const byAddress = /* @__PURE__ */ new Map();
  for (const device of devices) {
    let host = device.location;
    try {
      host = new URL(device.location).hostname;
    } catch {
    }
    const roles = (_a = byAddress.get(host)) != null ? _a : [];
    roles.push((0, import_deviceDirectory.shortServiceName)(device.type));
    byAddress.set(host, roles);
  }
  const breakdown = [...byAddress.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([host, roles]) => `   ${host}: ${[...roles].sort().join(", ")}`);
  return [
    `Host ${address} antwortet.`,
    `Geraet: ${(_b = info.hostName) != null ? _b : "unbekannt"}, steht im Raum ${(_c = info.roomName) != null ? _c : "unbekannt"}.`,
    `${zones.numRooms} Raeume (${rooms}), ${zones.zones.length} Zonen.`,
    `${byAddress.size} Geraete im Netz mit zusammen ${devices.length} UPnP-Diensten:`,
    ...breakdown
  ].join("\n");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  describeSystem
});
//# sourceMappingURL=report.js.map
