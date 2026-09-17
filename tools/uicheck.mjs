/**
 * Prueft die Bausteine, aus denen die Konfigurationsseite ihre Angaben holt -
 * dieselben Funktionen, die der Adapter auf eine Nachricht hin aufruft.
 */

import { createRequire } from 'node:module';
import * as os from 'node:os';

const require = createRequire('/opt/dev/ioBroker.raumfeld/');
const { discover } = require('/opt/dev/ioBroker.raumfeld/build/lib/discovery.js');
const { RaumfeldHostService } = require('/opt/dev/ioBroker.raumfeld/build/lib/hostService.js');

const bindAddress = '10.10.11.30';

console.log('=== discoverHosts ===');
const found = await discover(bindAddress);
const options = [{ label: 'automatisch suchen', value: '' }];
for (const address of found.hostCandidates) {
	options.push({ label: `${address} (Host)`, value: address });
}
for (const address of found.deviceAddresses) {
	if (!found.hostCandidates.includes(address)) {
		options.push({ label: `${address} (Lautsprecher)`, value: address });
	}
}
for (const option of options) {
	console.log(`   ${option.label.padEnd(30)} -> ${JSON.stringify(option.value)}`);
}

console.log('\n=== listInterfaces ===');
console.log('   automatisch waehlen            -> ""');
for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
	for (const address of addresses ?? []) {
		if (address.family === 'IPv4' && !address.internal) {
			console.log(`   ${`${address.address} (${name})`.padEnd(30)} -> "${address.address}"`);
		}
	}
}

console.log('\n=== testConnection (ohne eingetragene Adresse) ===');
const host = found.hostCandidates[0];
const probe = new RaumfeldHostService({ address: host });
const info = await probe.fetchHostInfo();
const zones = await probe.fetchZones();
const devices = await probe.fetchDevices();
const rooms = zones.allRooms.map((room) => room.name).join(', ') || 'keine';
console.log(
	[
		`Host ${host} antwortet.`,
		`Geraet: ${info.hostName ?? 'unbekannt'}, steht im Raum ${info.roomName ?? 'unbekannt'}.`,
		`${zones.numRooms} Raeume (${rooms}), ${zones.zones.length} Zonen.`,
		`${devices.length} Geraete im System.`,
	]
		.map((line) => `   ${line}`)
		.join('\n'),
);
