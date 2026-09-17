/**
 * Der Bericht, den die Konfigurationsseite nach einer Verbindungspruefung
 * anzeigt.
 *
 * Bewusst eine reine Funktion ohne Netzzugriff: so laesst sich der Text
 * pruefen, und vor allem gibt es ihn nur einmal. Die vorige Fassung stand
 * zusaetzlich im Pruefwerkzeug unter tools/, und prompt zeigten beide etwas
 * anderes an.
 */

import { shortServiceName } from './deviceDirectory';
import type { HostInfo, RaumfeldDeviceEntry, ZoneConfiguration } from './types';

/**
 * Beschreibt, was unter einer Adresse vorgefunden wurde.
 *
 * Die Anzahl aus listDevices wird dabei nicht einfach weitergereicht: sie
 * zaehlt UPnP-Geraete, nicht Lautsprecher. Ein einziger One S meldet sich
 * mehrfach - als MediaRenderer und als RaumfeldDevice -, auf dem Host kommen
 * MediaServer und ConfigDevice hinzu. Zwei Lautsprecher ergeben so sechs
 * Eintraege, was beim Lesen zwangslaeufig stutzig macht. Aufgeschluesselt nach
 * Adresse ist dagegen sofort erkennbar, wie viele Geraete tatsaechlich im Netz
 * stehen.
 *
 * @param address - Die gepruefte Adresse des Hosts.
 * @param info - Die Angaben aus getHostInfo.
 * @param zones - Die Zonenaufteilung aus getZones.
 * @param devices - Die Geraeteliste aus listDevices.
 * @returns Ein mehrzeiliger, lesbarer Bericht.
 */
export function describeSystem(
	address: string,
	info: HostInfo,
	zones: ZoneConfiguration,
	devices: RaumfeldDeviceEntry[],
): string {
	const rooms = zones.allRooms.map(room => room.name).join(', ') || 'keine';

	const byAddress = new Map<string, string[]>();
	for (const device of devices) {
		let host = device.location;
		try {
			host = new URL(device.location).hostname;
		} catch {
			// Eine unbrauchbare Adresse soll den Bericht nicht verhindern; dann
			// steht sie eben unveraendert da.
		}
		const roles = byAddress.get(host) ?? [];
		roles.push(shortServiceName(device.type));
		byAddress.set(host, roles);
	}

	const breakdown = [...byAddress.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([host, roles]) => `   ${host}: ${[...roles].sort().join(', ')}`);

	return [
		`Host ${address} antwortet.`,
		`Geraet: ${info.hostName ?? 'unbekannt'}, steht im Raum ${info.roomName ?? 'unbekannt'}.`,
		`${zones.numRooms} Raeume (${rooms}), ${zones.zones.length} Zonen.`,
		`${byAddress.size} Geraete im Netz mit zusammen ${devices.length} UPnP-Diensten:`,
		...breakdown,
	].join('\n');
}
