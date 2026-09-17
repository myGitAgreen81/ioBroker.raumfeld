/**
 * Liest Geraetebeschreibungen und haelt fest, wo die Dienste eines Geraets zu
 * erreichen sind.
 *
 * Die Ports der Dienste sind bei Raumfeld nicht fest: jedes Geraet vergibt sie
 * beim Start neu, und nach einem Neustart eines Lautsprechers stimmen die alten
 * URLs nicht mehr. Deshalb wird die Beschreibung bei Bedarf neu gelesen, statt
 * die Adressen einmal zu merken.
 */

import { XMLParser } from 'fast-xml-parser';
import type { ServiceEndpoint } from './types';
import { asText } from './xmlText';

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@',
	isArray: name => ['service', 'device'].includes(name),
});

/** Ein Knoten des zerlegten XML-Baums. */
type XmlNode = Record<string, unknown>;

/**
 * Kuerzt einen Diensttyp auf den sprechenden Teil.
 *
 * Aus "urn:schemas-upnp-org:service:AVTransport:1" wird "AVTransport". Damit
 * laesst sich ein Dienst nachschlagen, ohne die volle URN zu kennen.
 *
 * @param urn - Der volle Diensttyp.
 * @returns Der Kurzname des Dienstes.
 */
export function shortServiceName(urn: string): string {
	const parts = urn.split(':');
	return parts.length >= 2 ? parts[parts.length - 2] : urn;
}

/**
 * Liest eine Geraetebeschreibung und sammelt alle darin genannten Dienste.
 *
 * Untergeraete werden mit durchsucht, weil Raumfeld-Beschreibungen sie
 * verwenden koennen und die gesuchten Dienste sonst uebersehen wuerden.
 *
 * @param location - URL der Geraetebeschreibung.
 * @param timeoutMs - Abbruch nach dieser Zeit.
 * @returns Die Dienste, nachschlagbar unter ihrem Kurznamen.
 */
export async function readServices(location: string, timeoutMs = 8_000): Promise<Map<string, ServiceEndpoint>> {
	const res = await fetch(location, { signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok) {
		throw new Error(`Geraetebeschreibung ${location}: HTTP ${res.status} ${res.statusText}`);
	}
	const doc = parser.parse(await res.text()) as XmlNode;

	const services = new Map<string, ServiceEndpoint>();
	const queue: XmlNode[] = [...((((doc.root ?? {}) as XmlNode).device as XmlNode[] | undefined) ?? [])];

	while (queue.length > 0) {
		const device = queue.shift();
		if (!device) {
			continue;
		}
		const children = (device.deviceList as XmlNode | undefined)?.device as XmlNode[] | undefined;
		if (children) {
			queue.push(...children);
		}

		const list = (device.serviceList as XmlNode | undefined)?.service as XmlNode[] | undefined;
		for (const service of list ?? []) {
			const serviceType = asText(service.serviceType);
			if (serviceType === '') {
				continue;
			}
			services.set(shortServiceName(serviceType), {
				serviceType,
				controlUrl: new URL(asText(service.controlURL), location).toString(),
				eventSubUrl: new URL(asText(service.eventSubURL), location).toString(),
			});
		}
	}

	return services;
}
