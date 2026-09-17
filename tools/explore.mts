/**
 * Erkundungswerkzeug fuer das Raumfeld-System.
 *
 * Zweck: einmal alles einsammeln, was die Geraete ueber sich preisgeben,
 * bevor eine Zeile Adaptercode entsteht. Der alte Testadapter und die
 * vorhandenen Fremdbibliotheken sind Jahre alt; was die Geraete mit der
 * aktuellen Firmware tatsaechlich koennen, steht nur in ihren eigenen
 * Beschreibungen.
 *
 * Gesammelt wird:
 *   - alle per SSDP auffindbaren Raumfeld-Geraete samt Geraetebeschreibung
 *   - je Dienst die vollstaendige SCPD-Beschreibung, also alle SOAP-Aktionen
 *     mit ihren Argumenten und den zugehoerigen Zustandsvariablen
 *   - die Antworten des Host-Webservice auf Port 47365 (Zonen, Raeume,
 *     Geraeteliste, Host-Angaben)
 *   - die oberste Ebene des MediaServer-Inhaltsverzeichnisses
 *
 * Ausgabe: tools/output/raumfeld.json (vollstaendig, maschinenlesbar) und
 * tools/output/raumfeld.md (lesbarer Bericht).
 *
 * Aufruf:  node tools/explore.mts
 *          RAUMFELD_IFACE=10.10.11.30 node tools/explore.mts
 *
 * Node 24 fuehrt TypeScript direkt aus, ein Uebersetzungsschritt ist nicht
 * noetig. Das Skript gehoert bewusst nicht zum Adapter selbst - es steht in
 * tools/ und wird ueber das "files"-Feld der package.json nicht mitgeliefert.
 */

import * as dgram from 'node:dgram';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

/**
 * Quelladresse fuer die SSDP-Suche. Sie muss im Segment der Lautsprecher
 * liegen, weil SSDP ueber Multicast laeuft und die pfSense 239.255.255.250
 * nicht weiterreicht - der Avahi-Reflector dort bedient nur mDNS.
 */
const SOURCE_IP = process.env.RAUMFELD_IFACE ?? '10.10.11.30';
const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const HOST_SERVICE_PORT = 47365;
const OUT_DIR = path.join(import.meta.dirname, 'output');

const xml = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@',
	// Einzelne Kinder sollen trotzdem als Liste ankommen, sonst muss jede
	// Auswertung zwischen "ein Dienst" und "mehrere Dienste" unterscheiden.
	isArray: name => ['service', 'device', 'action', 'argument', 'stateVariable', 'allowedValue'].includes(name),
});

interface ActionArgument {
	name: string;
	direction: string;
	relatedStateVariable: string;
	dataType?: string;
}

interface ActionInfo {
	name: string;
	arguments: ActionArgument[];
}

interface StateVariableInfo {
	name: string;
	dataType: string;
	sendEvents: boolean;
	allowedValues?: string[];
}

interface ServiceInfo {
	serviceType: string;
	serviceId: string;
	scpdUrl: string;
	controlUrl: string;
	eventSubUrl: string;
	actions: ActionInfo[];
	stateVariables: StateVariableInfo[];
	scpdError?: string;
}

interface DeviceInfo {
	address: string;
	location: string;
	deviceType: string;
	friendlyName: string;
	modelName?: string;
	modelNumber?: string;
	serialNumber?: string;
	udn: string;
	protocolVersion?: string;
	hardwareType?: string;
	services: ServiceInfo[];
}

interface EndpointResult {
	url?: string;
	status?: number;
	body?: string;
	error?: string;
}

/**
 * Holt eine URL als Text und bricht bei Zeitueberschreitung sauber ab.
 * @param url
 * @param timeoutMs
 */
async function get(url: string, timeoutMs = 8000): Promise<string> {
	const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} ${res.statusText}`);
	}
	return await res.text();
}

/**
 * Schickt eine SOAP-Aktion an einen Dienst. Wird hier nur lesend benutzt,
 * um das Inhaltsverzeichnis des MediaServers anzusehen.
 * @param controlUrl
 * @param serviceType
 * @param action
 * @param args
 */
async function soap(
	controlUrl: string,
	serviceType: string,
	action: string,
	args: Record<string, string> = {},
): Promise<string> {
	const inner = Object.entries(args)
		.map(([key, value]) => `<${key}>${value}</${key}>`)
		.join('');
	const body =
		'<?xml version="1.0" encoding="utf-8"?>' +
		'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
		's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
		`<u:${action} xmlns:u="${serviceType}">${inner}</u:${action}>` +
		'</s:Body></s:Envelope>';

	const res = await fetch(controlUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'text/xml; charset="utf-8"',
			SOAPAction: `"${serviceType}#${action}"`,
		},
		body,
		signal: AbortSignal.timeout(10000),
	});
	return await res.text();
}

/**
 * SSDP-Suche. Es werden mehrere Suchziele geschickt, weil Raumfeld-Geraete
 * je nach Rolle unterschiedlich antworten und "ssdp:all" allein nicht bei
 * jedem Geraet alle Beschreibungen zutage foerdert.
 * @param timeoutMs
 */
function discover(timeoutMs = 5000): Promise<Map<string, Set<string>>> {
	const targets = [
		'ssdp:all',
		'upnp:rootdevice',
		'urn:schemas-upnp-org:device:MediaRenderer:1',
		'urn:schemas-upnp-org:device:MediaServer:1',
		'urn:schemas-raumfeld-com:device:RaumfeldDevice:1',
		'urn:schemas-raumfeld-com:device:ConfigDevice:1',
	];

	return new Promise((resolve, reject) => {
		const found = new Map<string, Set<string>>();
		const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

		socket.on('error', err => {
			socket.close();
			reject(err);
		});

		socket.on('message', (msg, rinfo) => {
			const match = /^LOCATION:\s*(.+)$/im.exec(msg.toString('utf8'));
			if (!match) {
				return;
			}
			const location = match[1].trim();
			// Nur Antworten mit abrufbarer Beschreibung sind brauchbar; Raumfeld
			// meldet daneben Eintraege, die statt einer URL nur die IP tragen.
			if (!location.startsWith('http')) {
				return;
			}
			let known = found.get(rinfo.address);
			if (!known) {
				known = new Set();
				found.set(rinfo.address, known);
			}
			known.add(location);
		});

		socket.bind(0, SOURCE_IP, () => {
			socket.setMulticastInterface(SOURCE_IP);
			socket.setMulticastTTL(2);
			for (const st of targets) {
				const search =
					'M-SEARCH * HTTP/1.1\r\n' +
					`HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\n` +
					'MAN: "ssdp:discover"\r\n' +
					'MX: 2\r\n' +
					`ST: ${st}\r\n\r\n`;
				socket.send(search, SSDP_PORT, SSDP_ADDRESS);
			}
			setTimeout(() => {
				socket.close();
				resolve(found);
			}, timeoutMs);
		});
	});
}

/**
 * Loest eine in der Beschreibung angegebene, meist relative URL auf.
 * @param base
 * @param relative
 */
function resolveUrl(base: string, relative: string): string {
	return new URL(relative, base).toString();
}

/**
 * Liest die SCPD-Beschreibung eines Dienstes: Aktionen und Zustandsvariablen.
 * @param scpdUrl
 */
async function readScpd(scpdUrl: string): Promise<Pick<ServiceInfo, 'actions' | 'stateVariables'>> {
	const doc = xml.parse(await get(scpdUrl));
	const scpd = doc.scpd ?? {};

	const stateVariables: StateVariableInfo[] = (scpd.serviceStateTable?.stateVariable ?? []).map((variable: any) => ({
		name: String(variable.name),
		dataType: String(variable.dataType),
		sendEvents: variable['@sendEvents'] === 'yes',
		allowedValues: variable.allowedValueList?.allowedValue?.map(String),
	}));

	// Der Datentyp eines Arguments steht nicht am Argument, sondern an der
	// verknuepften Zustandsvariablen - genau das brauchen wir spaeter, um die
	// ioBroker-Datenpunkte richtig zu typisieren.
	const typeOf = new Map(stateVariables.map(variable => [variable.name, variable.dataType]));

	const actions: ActionInfo[] = (scpd.actionList?.action ?? []).map((action: any) => ({
		name: String(action.name),
		arguments: (action.argumentList?.argument ?? []).map((arg: any) => ({
			name: String(arg.name),
			direction: String(arg.direction),
			relatedStateVariable: String(arg.relatedStateVariable),
			dataType: typeOf.get(String(arg.relatedStateVariable)),
		})),
	}));

	return { actions, stateVariables };
}

/**
 * Liest eine Geraetebeschreibung samt aller darin genannten Dienste.
 * @param address
 * @param location
 */
async function readDevice(address: string, location: string): Promise<DeviceInfo[]> {
	const doc = xml.parse(await get(location));
	const result: DeviceInfo[] = [];

	// Geraete koennen Untergeraete enthalten (deviceList), deshalb iterativ.
	const queue: any[] = [...(doc.root?.device ?? [])];
	while (queue.length > 0) {
		const dev = queue.shift();
		if (dev.deviceList?.device) {
			queue.push(...dev.deviceList.device);
		}

		const services: ServiceInfo[] = [];
		for (const svc of dev.serviceList?.service ?? []) {
			const scpdUrl = resolveUrl(location, String(svc.SCPDURL));
			const entry: ServiceInfo = {
				serviceType: String(svc.serviceType),
				serviceId: String(svc.serviceId),
				scpdUrl,
				controlUrl: resolveUrl(location, String(svc.controlURL)),
				eventSubUrl: resolveUrl(location, String(svc.eventSubURL)),
				actions: [],
				stateVariables: [],
			};
			try {
				Object.assign(entry, await readScpd(scpdUrl));
			} catch (err) {
				entry.scpdError = err instanceof Error ? err.message : String(err);
			}
			services.push(entry);
		}

		result.push({
			address,
			location,
			deviceType: String(dev.deviceType ?? ''),
			friendlyName: String(dev.friendlyName ?? ''),
			modelName: dev.modelName ? String(dev.modelName) : undefined,
			modelNumber: dev.modelNumber ? String(dev.modelNumber) : undefined,
			serialNumber: dev.serialNumber ? String(dev.serialNumber) : undefined,
			udn: String(dev.UDN ?? ''),
			protocolVersion: dev['raumfeld:protocolVersion'] ? String(dev['raumfeld:protocolVersion']) : undefined,
			hardwareType: dev['raumfeld:hardwareType'] ? String(dev['raumfeld:hardwareType']) : undefined,
			services,
		});
	}

	return result;
}

/**
 * Fragt den Host-Webservice ab. Jeder Aufruf wird per 307 auf eine
 * Sitzungs-URL umgeleitet; fetch folgt dem von selbst. Ueber genau diese
 * Sitzungs-URLs laeuft spaeter das Long-Polling, mit dem Raumfeld
 * Zonenaenderungen meldet.
 * @param address
 */
async function readHostService(address: string): Promise<Record<string, EndpointResult>> {
	// Nur diese drei Endpunkte existieren tatsaechlich. Ausprobiert und mit
	// HTTP 404 auf /PageMissing beantwortet wurden ausserdem getRooms,
	// getRendererState und getMediaServerState - die Raumliste steckt statt
	// dessen bereits in der Antwort von getZones.
	const endpoints = ['getHostInfo', 'listDevices', 'getZones'];
	const result: Record<string, EndpointResult> = {};

	for (const endpoint of endpoints) {
		const url = `http://${address}:${HOST_SERVICE_PORT}/${endpoint}`;
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
			result[endpoint] = { url: res.url, status: res.status, body: (await res.text()).trim() };
		} catch (err) {
			result[endpoint] = { error: err instanceof Error ? err.message : String(err) };
		}
	}
	return result;
}

/**
 * Sieht die oberste Ebene des MediaServer-Inhaltsverzeichnisses an.
 * @param service
 */
async function browseRoot(service: ServiceInfo): Promise<string> {
	return await soap(service.controlUrl, service.serviceType, 'Browse', {
		ObjectID: '0',
		BrowseFlag: 'BrowseDirectChildren',
		Filter: '*',
		StartingIndex: '0',
		RequestedCount: '50',
		SortCriteria: '',
	});
}

/**
 * Kuerzt einen UPnP-Typ auf den sprechenden Teil, z.B. "AVTransport".
 * @param urn
 */
function shortType(urn: string): string {
	const parts = urn.split(':');
	return parts.length >= 2 ? parts[parts.length - 2] : urn;
}

/**
 * Baut den lesbaren Bericht.
 * @param devices
 * @param hostAddress
 * @param hostService
 * @param contentRoot
 */
function buildReport(
	devices: DeviceInfo[],
	hostAddress: string | undefined,
	hostService: Record<string, EndpointResult>,
	contentRoot: string | undefined,
): string {
	const lines: string[] = [];
	const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

	lines.push('# Raumfeld-Erkundung', '', `Aufgenommen am ${now} von ${SOURCE_IP} aus.`, '');

	lines.push('## Gefundene Geraete', '');
	lines.push('| Adresse | Name | Typ | Modell | UDN |');
	lines.push('|---|---|---|---|---|');
	for (const dev of devices) {
		lines.push(
			`| ${dev.address} | ${dev.friendlyName} | ${shortType(dev.deviceType)} | ${dev.modelName ?? '-'} | \`${dev.udn}\` |`,
		);
	}
	lines.push('');

	for (const dev of devices) {
		lines.push(`## ${dev.friendlyName} — ${dev.address}`, '');
		lines.push(`- Geraetetyp: \`${dev.deviceType}\``);
		lines.push(`- UDN: \`${dev.udn}\``);
		if (dev.serialNumber) {
			lines.push(`- Seriennummer: \`${dev.serialNumber}\``);
		}
		if (dev.protocolVersion) {
			lines.push(`- Raumfeld-Protokollfassung: ${dev.protocolVersion}`);
		}
		if (dev.hardwareType) {
			lines.push(`- Raumfeld-Hardwaretyp: ${dev.hardwareType}`);
		}
		lines.push(`- Beschreibung: ${dev.location}`, '');

		for (const svc of dev.services) {
			lines.push(`### ${shortType(svc.serviceType)}`, '');
			lines.push(`- Typ: \`${svc.serviceType}\``);
			lines.push(`- Steuerung: ${svc.controlUrl}`);
			lines.push(`- Ereignisse: ${svc.eventSubUrl}`);

			if (svc.scpdError) {
				lines.push(`- **SCPD nicht lesbar:** ${svc.scpdError}`, '');
				continue;
			}

			const evented = svc.stateVariables.filter(variable => variable.sendEvents);
			lines.push(
				`- ${svc.actions.length} Aktionen, ${svc.stateVariables.length} Zustandsvariablen, davon ${evented.length} mit Ereignismeldung`,
				'',
			);

			if (svc.actions.length > 0) {
				lines.push('| Aktion | hinein | heraus |');
				lines.push('|---|---|---|');
				for (const action of svc.actions) {
					const format = (direction: string): string =>
						action.arguments
							.filter(arg => arg.direction === direction)
							.map(arg => `${arg.name}: ${arg.dataType ?? '?'}`)
							.join(', ') || '—';
					lines.push(`| \`${action.name}\` | ${format('in')} | ${format('out')} |`);
				}
				lines.push('');
			}

			if (evented.length > 0) {
				lines.push(
					`**Meldet Aenderungen fuer:** ${evented.map(v => `\`${v.name}\` (${v.dataType})`).join(', ')}`,
					'',
				);
			}
		}
	}

	if (hostAddress) {
		lines.push(`## Host-Webservice — ${hostAddress}:${HOST_SERVICE_PORT}`, '');
		for (const [endpoint, value] of Object.entries(hostService)) {
			lines.push(`### /${endpoint}`, '');
			if (value.error) {
				lines.push('```', value.error, '```', '');
			} else {
				lines.push(`Umgeleitet auf \`${value.url}\` (HTTP ${value.status})`, '');
				lines.push('```xml', value.body?.slice(0, 3000) || '(leere Antwort)', '```', '');
			}
		}
	}

	if (contentRoot) {
		lines.push('## MediaServer — oberste Ebene', '');
		lines.push('```xml', contentRoot.slice(0, 3000), '```', '');
	}

	return `${lines.join('\n')}\n`;
}

/**
 *
 */
async function main(): Promise<void> {
	console.log(`Suche Raumfeld-Geraete, gesendet von ${SOURCE_IP} ...`);
	const found = await discover();
	console.log(`  ${found.size} antwortende Adressen`);

	const devices: DeviceInfo[] = [];
	const seenUdn = new Set<string>();

	for (const [address, locations] of found) {
		for (const location of locations) {
			try {
				for (const dev of await readDevice(address, location)) {
					// Dasselbe Geraet antwortet auf mehrere Suchziele; ueber die
					// UDN faellt das zusammen.
					if (seenUdn.has(dev.udn)) {
						continue;
					}
					seenUdn.add(dev.udn);
					devices.push(dev);
					console.log(`  ${address}  ${dev.friendlyName} (${dev.services.length} Dienste)`);
				}
			} catch (err) {
				console.log(`  ${address}  ${location} nicht lesbar: ${err instanceof Error ? err.message : err}`);
			}
		}
	}

	// Im selben Segment stehen auch Fremdgeraete (Yamaha, Harmony); nur die
	// Raumfeld-Geraete gehoeren in den Bericht.
	const raumfeld = devices.filter(
		dev =>
			dev.modelName?.includes('Teufel') ||
			dev.deviceType.includes('raumfeld') ||
			dev.friendlyName.includes('Raumfeld'),
	);

	// Der Host ist das Geraet, dessen Webservice auf 47365 antwortet.
	let hostAddress: string | undefined;
	let hostService: Record<string, EndpointResult> = {};
	for (const address of new Set(raumfeld.map(dev => dev.address))) {
		try {
			await get(`http://${address}:${HOST_SERVICE_PORT}/getZones`, 4000);
			hostAddress = address;
			break;
		} catch {
			// Kein Host - das ist bei reinen Client-Geraeten der Normalfall.
		}
	}
	if (hostAddress) {
		console.log(`Host-Webservice auf ${hostAddress}:${HOST_SERVICE_PORT}`);
		hostService = await readHostService(hostAddress);
	} else {
		console.log('Kein Host-Webservice gefunden - laeuft der Host-Lautsprecher?');
	}

	let contentRoot: string | undefined;
	const contentDirectory = raumfeld
		.flatMap(dev => dev.services)
		.find(svc => svc.serviceType.includes('ContentDirectory'));
	if (contentDirectory) {
		try {
			contentRoot = await browseRoot(contentDirectory);
			console.log('Inhaltsverzeichnis des MediaServers gelesen');
		} catch (err) {
			console.log(`Inhaltsverzeichnis nicht lesbar: ${err instanceof Error ? err.message : err}`);
		}
	}

	await mkdir(OUT_DIR, { recursive: true });
	const jsonPath = path.join(OUT_DIR, 'raumfeld.json');
	const mdPath = path.join(OUT_DIR, 'raumfeld.md');
	await writeFile(
		jsonPath,
		JSON.stringify(
			{
				sourceIp: SOURCE_IP,
				takenAt: new Date().toISOString(),
				hostAddress,
				devices: raumfeld,
				hostService,
				contentRoot,
			},
			null,
			'\t',
		),
		'utf8',
	);
	await writeFile(mdPath, buildReport(raumfeld, hostAddress, hostService, contentRoot), 'utf8');

	console.log('');
	console.log(
		`${raumfeld.length} Raumfeld-Geraete, ${raumfeld.reduce((sum, dev) => sum + dev.services.length, 0)} Dienste`,
	);
	console.log(`Geschrieben: ${jsonPath}`);
	console.log(`Geschrieben: ${mdPath}`);
}

await main();
