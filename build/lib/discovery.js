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
var discovery_exports = {};
__export(discovery_exports, {
  discover: () => discover
});
module.exports = __toCommonJS(discovery_exports);
var dgram = __toESM(require("node:dgram"));
const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
const HOST_SEARCH_TARGET = "urn:schemas-raumfeld-com:device:ConfigDevice:1";
const ANY_DEVICE_TARGET = "urn:schemas-raumfeld-com:device:RaumfeldDevice:1";
function discover(bindAddress, timeoutMs = 4e3) {
  return new Promise((resolve, reject) => {
    const byTarget = /* @__PURE__ */ new Map([
      [HOST_SEARCH_TARGET, /* @__PURE__ */ new Set()],
      [ANY_DEVICE_TARGET, /* @__PURE__ */ new Set()]
    ]);
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;
    const finish = (error) => {
      var _a, _b, _c;
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.close();
      } catch {
      }
      if (error) {
        reject(error);
        return;
      }
      resolve({
        hostCandidates: [...(_a = byTarget.get(HOST_SEARCH_TARGET)) != null ? _a : []],
        deviceAddresses: [
          .../* @__PURE__ */ new Set([
            ...(_b = byTarget.get(HOST_SEARCH_TARGET)) != null ? _b : [],
            ...(_c = byTarget.get(ANY_DEVICE_TARGET)) != null ? _c : []
          ])
        ]
      });
    };
    socket.on("error", (err) => finish(err));
    socket.on("message", (msg, rinfo) => {
      var _a, _b;
      const text = msg.toString("utf8");
      const st = (_b = (_a = /^ST:\s*(.+)$/im.exec(text)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim();
      if (st && byTarget.has(st)) {
        byTarget.get(st).add(rinfo.address);
      }
    });
    socket.bind(0, bindAddress, () => {
      try {
        if (bindAddress) {
          socket.setMulticastInterface(bindAddress);
        }
        socket.setMulticastTTL(2);
        for (const target of byTarget.keys()) {
          const search = `M-SEARCH * HTTP/1.1\r
HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r
MAN: "ssdp:discover"\r
MX: 2\r
ST: ${target}\r
\r
`;
          socket.send(search, SSDP_PORT, SSDP_ADDRESS);
        }
      } catch (err) {
        finish(err);
        return;
      }
      setTimeout(() => finish(), timeoutMs);
    });
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  discover
});
//# sourceMappingURL=discovery.js.map
