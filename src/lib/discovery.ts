/**
 * Auffinden des Raumfeld-Hosts im Netz.
 *
 * Gesucht wird per SSDP nach dem ConfigDevice: dieses Geraet gibt es im
 * gesamten System genau einmal, naemlich auf dem Host. Damit ist es das
 * verlaesslichste Erkennungsmerkmal - die Lautsprecher selbst sind daran
 * nicht zu unterscheiden, sie melden alle dieselben Geraetetypen.
 *
 * Wichtig: SSDP laeuft ueber Multicast auf 239.255.255.250. Das wird zwischen
 * Netzsegmenten nicht weitergereicht. Steht der Adapter in einem anderen
 * Segment als die Lautsprecher, findet diese Suche nichts und die Adresse des
 * Hosts muss in den Einstellungen fest eingetragen werden.
 */

import * as dgram from 'node:dgram';

const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;

/** Der Dienst, den es nur auf dem Host gibt. */
const HOST_SEARCH_TARGET = 'urn:schemas-raumfeld-com:device:ConfigDevice:1';

/** Fallback: irgendein Raumfeld-Geraet, um wenigstens Kandidaten zu haben. */
const ANY_DEVICE_TARGET = 'urn:schemas-raumfeld-com:device:RaumfeldDevice:1';

/** Was eine SSDP-Suche im Netz gefunden hat. */
export interface DiscoveryResult {
	/** Adressen, die auf die ConfigDevice-Suche geantwortet haben. */
	hostCandidates: string[];
	/** Alle Adressen, die sich ueberhaupt als Raumfeld-Geraet gemeldet haben. */
	deviceAddresses: string[];
}

/**
 * Schickt eine SSDP-Suche und sammelt die antwortenden Adressen je Suchziel.
 *
 * @param bindAddress - Quelladresse, an die der Socket gebunden wird. Ohne
 *   Angabe waehlt das Betriebssystem die Karte, was bei mehreren Netzkarten
 *   die falsche sein kann.
 * @param timeoutMs - Wie lange auf Antworten gewartet wird.
 * @returns Die antwortenden Adressen, getrennt nach Host-Kandidaten und allen
 *   Raumfeld-Geraeten.
 */
export function discover(bindAddress?: string, timeoutMs = 4000): Promise<DiscoveryResult> {
	return new Promise((resolve, reject) => {
		const byTarget = new Map<string, Set<string>>([
			[HOST_SEARCH_TARGET, new Set<string>()],
			[ANY_DEVICE_TARGET, new Set<string>()],
		]);

		const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
		let settled = false;

		const finish = (error?: Error): void => {
			if (settled) {
				return;
			}
			settled = true;
			try {
				socket.close();
			} catch {
				// Beim Schliessen eines bereits geschlossenen Sockets ist nichts zu retten.
			}
			if (error) {
				reject(error);
				return;
			}
			resolve({
				hostCandidates: [...(byTarget.get(HOST_SEARCH_TARGET) ?? [])],
				deviceAddresses: [
					...new Set([
						...(byTarget.get(HOST_SEARCH_TARGET) ?? []),
						...(byTarget.get(ANY_DEVICE_TARGET) ?? []),
					]),
				],
			});
		};

		socket.on('error', err => finish(err));

		socket.on('message', (msg, rinfo) => {
			const text = msg.toString('utf8');
			// Die Antwort nennt das Suchziel im ST-Kopf. Nur so laesst sich
			// zuordnen, ob hier der Host oder irgendein Geraet geantwortet hat.
			const st = /^ST:\s*(.+)$/im.exec(text)?.[1]?.trim();
			if (st && byTarget.has(st)) {
				byTarget.get(st)!.add(rinfo.address);
			}
		});

		socket.bind(0, bindAddress, () => {
			try {
				if (bindAddress) {
					socket.setMulticastInterface(bindAddress);
				}
				socket.setMulticastTTL(2);
				for (const target of byTarget.keys()) {
					const search =
						'M-SEARCH * HTTP/1.1\r\n' +
						`HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\n` +
						'MAN: "ssdp:discover"\r\n' +
						'MX: 2\r\n' +
						`ST: ${target}\r\n\r\n`;
					socket.send(search, SSDP_PORT, SSDP_ADDRESS);
				}
			} catch (err) {
				finish(err as Error);
				return;
			}
			setTimeout(() => finish(), timeoutMs);
		});
	});
}
