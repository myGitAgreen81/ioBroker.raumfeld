/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as os from 'node:os';

import * as utils from '@iobroker/adapter-core';
import { readServices } from './lib/deviceDirectory';
import { discover } from './lib/discovery';
import { durationToSeconds, parseDidlLite, parseLastChange } from './lib/events';
import { GenaListener, localAddressTowards } from './lib/gena';
import { HOST_SERVICE_PORT, RaumfeldHostService } from './lib/hostService';
import { LibraryClient } from './lib/library';
import { containerPlayUri } from './lib/playback';
import { roomIdFromName } from './lib/raumfeldXml';
import { describeSystem } from './lib/report';
import { RendererControl } from './lib/renderer';
import type { LibraryEntry, RaumfeldRoom, ZoneConfiguration } from './lib/types';

/** Was der Adapter sich zu einem Raum merkt, waehrend er laeuft. */
interface RoomRuntime {
	/** Objekt-ID des Raumes. */
	id: string;
	/** Dauerhafte Kennung des Raumes. */
	udn: string;
	/** Kennung des Renderers, der im Raum steht. */
	rendererUdn: string;
	/** Kennung der Zone, falls der Raum gerade gruppiert ist. */
	zoneUdn?: string;
}

class Raumfeld extends utils.Adapter {
	private hostService?: RaumfeldHostService;
	private gena?: GenaListener;
	private library?: LibraryClient;
	/** Adresse der Beschreibung des MediaServers, an dem die Bibliothek haengt. */
	private libraryLocation?: string;
	/** Kennung des MediaServers; wird zum Abspielen ganzer Sammlungen gebraucht. */
	private mediaServerUdn?: string;

	/** Raum-UDN zu Objekt-ID, um Umbenennungen zu erkennen. */
	private readonly roomIds = new Map<string, string>();
	/** Objekt-ID zu den Laufzeitangaben des Raumes. */
	private readonly rooms = new Map<string, RoomRuntime>();
	/** Renderer-UDN zur Objekt-ID des Raumes, fuer eingehende Ereignisse. */
	private readonly roomByRenderer = new Map<string, string>();
	/** Geraete-UDN zur Adresse ihrer Beschreibung, aus listDevices. */
	private readonly deviceLocations = new Map<string, string>();
	/** Bereits aufgebaute Bedienschnittstellen je Geraet. */
	private readonly controls = new Map<string, { control: RendererControl; location: string }>();
	/** Geraete, deren Ereignisse bereits abonniert sind, samt verwendeter Adresse. */
	private readonly subscribed = new Map<string, string>();

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'raumfeld',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		await this.ensureInfoObjects();
		await this.ensureMediaObjects();
		await this.setState('info.connection', false, true);

		const address = await this.resolveHostAddress();
		if (!address) {
			// Ohne Host gibt es keine Zonen, keine Raeume und nichts zu steuern.
			// Das ist kein Absturz, sondern ein Zustand, den der Nutzer beheben
			// muss - deshalb eine klare Meldung statt eines Fehlers.
			this.log.error(
				'Kein Raumfeld-Host gefunden. Laeuft der Host-Lautsprecher, und steht der Adapter im selben ' +
					'Netzsegment? SSDP wird zwischen Segmenten nicht weitergereicht - andernfalls die Adresse ' +
					'des Hosts in den Einstellungen eintragen.',
			);
			return;
		}

		this.log.info(`Raumfeld-Host auf ${address}`);
		await this.setState('info.hostAddress', address, true);

		if (!(await this.startEventListener(address))) {
			return;
		}

		this.hostService = new RaumfeldHostService({
			address,
			log: {
				debug: message => this.log.debug(message),
				info: message => this.log.info(message),
				warn: message => this.log.warn(message),
				error: message => this.log.error(message),
			},
		});

		this.hostService.on('connected', () => {
			this.log.info('Verbindung zum Host steht, Zonenueberwachung laeuft');
			void this.setState('info.connection', true, true);
			void this.readHostInfo();
		});

		this.hostService.on('disconnected', reason => {
			this.log.warn(`Verbindung zum Host verloren: ${reason}`);
			void this.setState('info.connection', false, true);
		});

		this.hostService.on('zones', config => {
			void this.applyZoneConfiguration(config).catch((err: unknown) => {
				this.log.error(`Zonenaufteilung konnte nicht uebernommen werden: ${asMessage(err)}`);
			});
		});

		this.subscribeStates('rooms.*');
		this.subscribeStates('media.*');
		this.hostService.start();
	}

	/**
	 * Startet den Zuhoerer fuer UPnP-Ereignisse.
	 *
	 * Die Adresse, unter der die Geraete zurueckfinden, wird nicht geraten,
	 * sondern beim Betriebssystem erfragt: eine kurze Verbindung zum Host
	 * verraet, welche Netzkarte die Routingtabelle dafuer waehlt. Auf einem
	 * Rechner mit mehreren Karten - wie hier einer im Server- und einer im
	 * WLAN-Segment - ist das der einzige verlaessliche Weg.
	 *
	 * @param hostAddress - Adresse des Raumfeld-Hosts.
	 * @returns Ob der Zuhoerer bereitsteht.
	 */
	private async startEventListener(hostAddress: string): Promise<boolean> {
		try {
			const configured = String(this.config.bindAddress ?? '').trim();
			const local =
				configured.length > 0 ? configured : await localAddressTowards(hostAddress, HOST_SERVICE_PORT);

			this.gena = new GenaListener({
				debug: message => this.log.debug(message),
				warn: message => this.log.warn(message),
			});
			await this.gena.start(local);
			this.log.info(`Ereignisse werden entgegengenommen auf ${this.gena.callbackBase}`);
			return true;
		} catch (err) {
			this.log.error(
				`Der Zuhoerer fuer Geraeteereignisse liess sich nicht starten: ${asMessage(err)}. ` +
					'Ohne ihn melden die Lautsprecher keine Aenderungen.',
			);
			return false;
		}
	}

	/**
	 * Legt die Objekte des info-Zweiges an.
	 *
	 * Sie stehen zwar auch als instanceObjects in der io-package.json, aber die
	 * werden nur beim Einrichten einer Instanz ausgewertet. Eine Instanz, die
	 * es vor dem Hinzufuegen dieser Datenpunkte schon gab, haette sie sonst
	 * nie - und jeder Schreibzugriff quittierte das mit der Warnung
	 * "has no existing object".
	 *
	 * @returns Nichts.
	 */
	private async ensureInfoObjects(): Promise<void> {
		await this.defineState('info.hostAddress', 'Adresse des Raumfeld-Hosts', 'string', 'info.ip', false);
		await this.defineState('info.hostName', 'Name des Host-Geraets', 'string', 'text', false);
		await this.defineState('info.hostRoom', 'Raum, in dem der Host steht', 'string', 'text', false);
		await this.defineState('info.zones', 'Aktuelle Zonenaufteilung als JSON', 'string', 'json', false);
	}

	/**
	 * Legt die Objekte des media-Zweiges an.
	 *
	 * @returns Nichts.
	 */
	private async ensureMediaObjects(): Promise<void> {
		await this.defineState('media.browse', 'Sammlung oeffnen, Vorgabe "0"', 'string', 'text', true);
		await this.defineState('media.browseId', 'Zuletzt geoeffnete Sammlung', 'string', 'text', false);
		await this.defineState('media.browseParent', 'Uebergeordnete Sammlung', 'string', 'text', false);
		await this.defineState('media.browseResult', 'Inhalt als JSON', 'string', 'json', false);
		await this.defineState('media.browseTotal', 'Anzahl der Eintraege im Zweig', 'number', 'value', false);
		await this.defineState('media.search', 'Suchbegriff', 'string', 'text', true);
		await this.defineState('media.searchIn', 'Zweig, in dem gesucht wird', 'string', 'text', true);
		await this.defineState('media.searchResult', 'Treffer als JSON', 'string', 'json', false);
		await this.defineState('media.sources', 'Oberste Ebene der Bibliothek als JSON', 'string', 'json', false);
		await this.defineState('media.indexerStatus', 'Stand der Bibliothekserfassung', 'string', 'text', false);
	}

	/**
	 * Verbindet die Bibliothek des MediaServers.
	 *
	 * Der MediaServer laeuft auf demselben Geraet wie der Host. Seine Ports
	 * wechseln wie bei allen Raumfeld-Diensten mit jedem Neustart, deshalb
	 * wird die Verbindung neu aufgebaut, sobald die Beschreibung woanders liegt.
	 *
	 * @param location - Adresse der Geraetebeschreibung des MediaServers.
	 * @returns Nichts.
	 */
	private async setupLibrary(location: string): Promise<void> {
		if (this.libraryLocation === location && this.library) {
			return;
		}
		try {
			const service = (await readServices(location)).get('ContentDirectory');
			if (!service) {
				this.log.warn('Der MediaServer bietet kein ContentDirectory an');
				return;
			}
			this.library = new LibraryClient(service);
			this.libraryLocation = location;
			this.log.debug(`Bibliothek verbunden: ${service.controlUrl}`);

			const root = await this.library.browse('0');
			await this.setState('media.sources', JSON.stringify(root.entries.map(toPlainEntry)), true);
			await this.setState('media.indexerStatus', await this.library.indexerStatus(), true);
		} catch (err) {
			this.log.warn(`Bibliothek nicht erreichbar: ${asMessage(err)}`);
		}
	}

	/**
	 * Ermittelt die Adresse des Hosts: entweder aus den Einstellungen oder per
	 * SSDP-Suche nach dem ConfigDevice, das es im System nur einmal gibt.
	 *
	 * @returns Die Adresse, oder undefined, wenn kein Host zu finden war.
	 */
	private async resolveHostAddress(): Promise<string | undefined> {
		const configured = String(this.config.hostAddress ?? '').trim();
		if (configured.length > 0) {
			this.log.debug(`Host-Adresse aus den Einstellungen: ${configured}`);
			return configured;
		}

		const bindAddress = String(this.config.bindAddress ?? '').trim() || undefined;
		this.log.debug(`Suche den Host per SSDP${bindAddress ? `, gesendet von ${bindAddress}` : ''} ...`);

		try {
			const result = await discover(bindAddress);
			if (result.hostCandidates.length > 1) {
				this.log.warn(
					`Mehrere Geraete melden ein ConfigDevice (${result.hostCandidates.join(', ')}). ` +
						'Das erste wird verwendet; bei Problemen die Adresse fest eintragen.',
				);
			}
			if (result.hostCandidates.length > 0) {
				return result.hostCandidates[0];
			}

			this.log.debug(
				`Kein ConfigDevice gefunden, gefundene Raumfeld-Geraete: ${result.deviceAddresses.join(', ') || 'keine'}`,
			);
		} catch (err) {
			this.log.warn(`SSDP-Suche fehlgeschlagen: ${asMessage(err)}`);
		}
		return undefined;
	}

	/**
	 * Liest die unveraenderlichen Angaben des Hosts einmal aus.
	 *
	 * @returns Nichts.
	 */
	private async readHostInfo(): Promise<void> {
		if (!this.hostService) {
			return;
		}
		try {
			const info = await this.hostService.fetchHostInfo();
			await this.setState('info.hostName', info.hostName ?? '', true);
			await this.setState('info.hostRoom', info.roomName ?? '', true);
		} catch (err) {
			this.log.debug(`getHostInfo nicht lesbar: ${asMessage(err)}`);
		}
	}

	/**
	 * Uebertraegt eine neue Zonenaufteilung in den Objektbaum.
	 *
	 * Raeume, die verschwunden sind, werden nicht geloescht, sondern auf
	 * online=false gesetzt. Ein Lautsprecher im Tiefschlaf oder mit kurzzeitig
	 * gestoertem WLAN faellt aus getZones heraus - wuerde der Adapter dabei
	 * Objekte loeschen, waeren mit ihnen auch die Verlaufsdaten weg.
	 *
	 * @param config - Die vom Host gemeldete Zonenaufteilung.
	 * @returns Nichts.
	 */
	private async applyZoneConfiguration(config: ZoneConfiguration): Promise<void> {
		this.log.debug(
			`Zonenaufteilung: ${config.zones.length} Zonen, ${config.unassignedRooms.length} einzelne Raeume`,
		);

		await this.refreshDeviceLocations();

		await this.setState(
			'info.zones',
			JSON.stringify(config.zones.map(zone => ({ udn: zone.udn, rooms: zone.rooms.map(room => room.name) }))),
			true,
		);

		const present = new Set<string>();
		for (const room of config.allRooms) {
			const id = await this.ensureRoom(room);
			present.add(id);

			this.rooms.set(id, {
				id,
				udn: room.udn,
				rendererUdn: room.renderers[0]?.udn ?? '',
				zoneUdn: room.zoneUdn,
			});
			if (room.renderers[0]) {
				this.roomByRenderer.set(room.renderers[0].udn, id);
			}

			await this.writeRoomStates(id, room, true);
			await this.attachRenderer(id);
		}

		for (const [udn, id] of this.roomIds) {
			if (!present.has(id)) {
				this.log.debug(`Raum ${id} (${udn}) ist derzeit nicht gemeldet`);
				await this.setState(`rooms.${id}.online`, false, true);
			}
		}
	}

	/**
	 * Holt die aktuelle Geraeteliste des Hosts.
	 *
	 * Die Ports der Dienste wechseln bei jedem Neustart eines Lautsprechers.
	 * Deshalb wird die Liste bei jeder Aenderung der Zonen neu gelesen, statt
	 * die Adressen einmal zu merken.
	 *
	 * @returns Nichts.
	 */
	private async refreshDeviceLocations(): Promise<void> {
		if (!this.hostService) {
			return;
		}
		try {
			for (const device of await this.hostService.fetchDevices()) {
				this.deviceLocations.set(device.udn, device.location);
				if (device.type.includes('MediaServer')) {
					this.mediaServerUdn = device.udn;
					await this.setupLibrary(device.location);
				}
			}
		} catch (err) {
			this.log.debug(`listDevices nicht lesbar: ${asMessage(err)}`);
		}
	}

	/**
	 * Verbindet den Renderer eines Raumes: Bedienschnittstelle aufbauen,
	 * Ereignisse abonnieren und die Ausgangswerte einlesen.
	 *
	 * @param roomId - Objekt-ID des Raumes.
	 * @returns Nichts.
	 */
	private async attachRenderer(roomId: string): Promise<void> {
		const room = this.rooms.get(roomId);
		if (!room || room.rendererUdn === '') {
			return;
		}

		const control = await this.controlFor(room.rendererUdn);
		if (!control) {
			return;
		}

		const location = this.deviceLocations.get(room.rendererUdn);
		if (this.gena && location !== undefined && this.subscribed.get(room.rendererUdn) !== location) {
			// Eine neue Adresse heisst: das Geraet wurde neu gestartet. Das alte
			// Abonnement kennt es nicht mehr, also frisch abonnieren.
			this.subscribed.set(room.rendererUdn, location);
			for (const service of ['AVTransport', 'RenderingControl']) {
				const url = control.eventUrl(service);
				if (!url) {
					continue;
				}
				try {
					await this.gena.subscribe(url, properties => {
						void this.onRendererEvent(room.rendererUdn, properties);
					});
				} catch (err) {
					this.log.warn(`${service} von ${roomId} nicht abonnierbar: ${asMessage(err)}`);
				}
			}
		}

		await this.readInitialValues(roomId, control);
	}

	/**
	 * Baut die Bedienschnittstelle eines Geraets auf, oder liefert die
	 * vorhandene.
	 *
	 * @param udn - Kennung des Geraets.
	 * @returns Die Bedienschnittstelle, oder undefined, wenn das Geraet
	 *   derzeit nicht erreichbar ist.
	 */
	private async controlFor(udn: string): Promise<RendererControl | undefined> {
		const location = this.deviceLocations.get(udn);
		if (location === undefined) {
			return undefined;
		}

		const known = this.controls.get(udn);
		if (known && known.location === location) {
			return known.control;
		}

		try {
			const control = new RendererControl(await readServices(location));
			this.controls.set(udn, { control, location });
			return control;
		} catch (err) {
			this.log.debug(`Geraetebeschreibung von ${udn} nicht lesbar: ${asMessage(err)}`);
			return undefined;
		}
	}

	/**
	 * Liest die Werte, die nicht von selbst gemeldet werden, einmal aus.
	 *
	 * Die Ereignisse liefern Lautstaerke und Wiedergabezustand erst bei der
	 * naechsten Aenderung. Nach einem Neustart des Adapters stuenden die
	 * Datenpunkte sonst leer da, bis jemand etwas anfasst.
	 *
	 * @param roomId - Objekt-ID des Raumes.
	 * @param control - Bedienschnittstelle des Renderers.
	 * @returns Nichts.
	 */
	private async readInitialValues(roomId: string, control: RendererControl): Promise<void> {
		if (control.has('RenderingControl')) {
			try {
				await this.setState(`rooms.${roomId}.volume`, await control.volume(), true);
				await this.setState(`rooms.${roomId}.mute`, await control.mute(), true);
				const filter = await control.filter();
				await this.setState(`rooms.${roomId}.equalizer.low`, filter.low, true);
				await this.setState(`rooms.${roomId}.equalizer.mid`, filter.mid, true);
				await this.setState(`rooms.${roomId}.equalizer.high`, filter.high, true);
			} catch (err) {
				this.log.debug(`Klangwerte von ${roomId} nicht lesbar: ${asMessage(err)}`);
			}
		}

		if (control.has('AVTransport')) {
			try {
				const transport = await control.transportInfo();
				await this.setState(`rooms.${roomId}.transport.state`, transport.state, true);
				await this.setState(`rooms.${roomId}.transport.playMode`, await control.playMode(), true);
				await this.writePosition(roomId, control);
			} catch (err) {
				this.log.debug(`Wiedergabezustand von ${roomId} nicht lesbar: ${asMessage(err)}`);
			}
		}
	}

	/**
	 * Schreibt Laufzeit und Dauer eines Raumes.
	 *
	 * @param roomId - Objekt-ID des Raumes.
	 * @param control - Bedienschnittstelle des Renderers.
	 * @returns Nichts.
	 */
	private async writePosition(roomId: string, control: RendererControl): Promise<void> {
		const position = await control.positionInfo();
		// Raumfeld antwortet fuer gestreamte Inhalte mit Platzhaltern statt mit
		// Zeiten: "NOT_IMPLEMENTED", wenn gar nichts laeuft, und "0:00:00" als
		// Dauer, wenn es die Laenge nicht kennt. Beides als Zeitangabe
		// durchzureichen waere eine Falschaussage; leer ist ehrlicher.
		const usable = (value: string): string => (value === 'NOT_IMPLEMENTED' || value === '0:00:00' ? '' : value);

		const elapsed = usable(position.position);
		const total = usable(position.duration);
		await this.setState(`rooms.${roomId}.transport.position`, elapsed, true);
		await this.setState(`rooms.${roomId}.transport.positionSec`, durationToSeconds(elapsed), true);
		await this.setState(`rooms.${roomId}.transport.duration`, total, true);
		await this.setState(`rooms.${roomId}.transport.durationSec`, durationToSeconds(total), true);
	}

	/**
	 * Verarbeitet eine Meldung eines Renderers.
	 *
	 * Alles Interessante steckt im LastChange-Element; daneben kommt bei
	 * AVTransport noch BufferFilled als eigene Eigenschaft an, die hier nicht
	 * gebraucht wird.
	 *
	 * @param rendererUdn - Kennung des meldenden Renderers.
	 * @param properties - Die Eigenschaften aus der Meldung.
	 * @returns Nichts.
	 */
	private async onRendererEvent(rendererUdn: string, properties: Record<string, string>): Promise<void> {
		const roomId = this.roomByRenderer.get(rendererUdn);
		if (roomId === undefined || properties.LastChange === undefined) {
			return;
		}

		const values = parseLastChange(properties.LastChange);
		const base = `rooms.${roomId}`;

		if (values.TransportState !== undefined) {
			await this.setState(`${base}.transport.state`, values.TransportState, true);
		}
		if (values.CurrentPlayMode !== undefined) {
			await this.setState(`${base}.transport.playMode`, values.CurrentPlayMode, true);
		}
		// "0:00:00" und "NOT_IMPLEMENTED" sind keine Dauer, sondern Platzhalter:
		// bei gestreamten Titeln fuehrt Raumfeld die Laufzeit nicht mit.
		// Nachgemessen meldet das Geraet beim Abspielen eines Demo-Titels
		// TrackDuration 0:00:00 und eine RelTime im Bereich von Wochen. Wuerden
		// diese Werte uebernommen, loeschten sie die richtige Dauer wieder, die
		// beim Starten aus der Bibliothek kam.
		const reportedDuration = values.CurrentTrackDuration;
		if (
			reportedDuration !== undefined &&
			reportedDuration !== '0:00:00' &&
			reportedDuration !== 'NOT_IMPLEMENTED'
		) {
			await this.setState(`${base}.transport.duration`, reportedDuration, true);
			await this.setState(`${base}.transport.durationSec`, durationToSeconds(reportedDuration), true);
		}
		if (values.AVTransportURI !== undefined) {
			await this.setState(`${base}.track.uri`, values.AVTransportURI, true);
		}
		// PowerState ist eine Raumfeld-Erweiterung und kommt im selben Ereignis
		// wie der Wiedergabezustand - schneller als ueber getZones.
		if (values.PowerState !== undefined) {
			await this.setState(`${base}.powerState`, values.PowerState, true);
			await this.setState(`${base}.standby`, values.PowerState !== 'ACTIVE', true);
		}

		const metadata = values.CurrentTrackMetaData ?? values.AVTransportURIMetaData;
		if (metadata !== undefined) {
			const track = parseDidlLite(metadata);
			if (track) {
				await this.setState(`${base}.track.title`, track.title, true);
				await this.setState(`${base}.track.artist`, track.artist, true);
				await this.setState(`${base}.track.album`, track.album, true);
				await this.setState(`${base}.track.albumArt`, track.albumArtUri, true);
				await this.setState(`${base}.track.source`, track.section, true);
			}
		}

		if (values.Volume !== undefined) {
			await this.setState(`${base}.volume`, Number(values.Volume), true);
		}
		if (values.Mute !== undefined) {
			await this.setState(`${base}.mute`, values.Mute === '1', true);
		}
		for (const [name, id] of [
			['LowDB', 'low'],
			['MidDB', 'mid'],
			['HighDB', 'high'],
		] as const) {
			if (values[name] !== undefined) {
				await this.setState(`${base}.equalizer.${id}`, Number(values[name]), true);
			}
		}
	}

	/**
	 * Legt die Objekte eines Raumes an, falls sie noch fehlen.
	 *
	 * @param room - Der Raum, so wie der Host ihn meldet.
	 * @returns Die Objekt-ID des Raumes.
	 */
	private async ensureRoom(room: RaumfeldRoom): Promise<string> {
		const id = roomIdFromName(room.name);

		const previous = this.roomIds.get(room.udn);
		if (previous !== undefined && previous !== id) {
			this.log.warn(
				`Raum "${previous}" heisst jetzt "${room.name}". Der alte Zweig rooms.${previous} bleibt stehen ` +
					'und kann von Hand geloescht werden.',
			);
		}
		if (this.roomIds.get(room.udn) === id && this.rooms.has(id)) {
			return id;
		}
		this.roomIds.set(room.udn, id);

		await this.setObjectNotExistsAsync(`rooms.${id}`, {
			type: 'device',
			common: { name: room.name },
			// Die UDN ist die verlaessliche Kennung des Raumes und wird fuer
			// jeden Befehl an den Host gebraucht.
			native: { udn: room.udn },
		});

		await this.defineState(`rooms.${id}.name`, 'Name des Raumes', 'string', 'text', false);
		await this.defineState(`rooms.${id}.online`, 'Raum wird gemeldet', 'boolean', 'indicator.reachable', false);
		await this.defineState(`rooms.${id}.powerState`, 'Betriebszustand', 'string', 'text', false);
		await this.defineState(`rooms.${id}.zone`, 'Zone, in der der Raum steckt', 'string', 'text', false);
		await this.defineState(
			`rooms.${id}.spotifyConnect`,
			'Spotify Connect angemeldet',
			'boolean',
			'indicator',
			false,
		);
		await this.defineState(`rooms.${id}.standby`, 'Bereitschaft', 'boolean', 'switch.power', true);
		await this.defineState(`rooms.${id}.volume`, 'Lautstaerke', 'number', 'level.volume', true, {
			min: 0,
			max: 100,
			unit: '%',
		});
		await this.defineState(`rooms.${id}.mute`, 'Stumm', 'boolean', 'media.mute', true);

		for (const [channel, label] of [
			['low', 'Tiefen'],
			['mid', 'Mitten'],
			['high', 'Hoehen'],
		] as const) {
			await this.defineState(`rooms.${id}.equalizer.${channel}`, `${label} in dB`, 'number', 'level', true, {
				unit: 'dB',
			});
		}

		await this.defineState(`rooms.${id}.transport.state`, 'Wiedergabezustand', 'string', 'media.state', false);
		await this.defineState(`rooms.${id}.transport.playMode`, 'Abspielart', 'string', 'media.mode.repeat', true);
		await this.defineState(`rooms.${id}.transport.position`, 'Laufzeit', 'string', 'media.elapsed.text', false);
		await this.defineState(
			`rooms.${id}.transport.positionSec`,
			'Laufzeit in Sekunden',
			'number',
			'media.elapsed',
			false,
			{ unit: 's' },
		);
		await this.defineState(`rooms.${id}.transport.duration`, 'Dauer', 'string', 'media.duration.text', false);
		await this.defineState(
			`rooms.${id}.transport.durationSec`,
			'Dauer in Sekunden',
			'number',
			'media.duration',
			false,
			{ unit: 's' },
		);
		await this.defineState(`rooms.${id}.transport.seek`, 'Springen nach h:mm:ss', 'string', 'media.seek', true);
		await this.defineState(`rooms.${id}.transport.playUri`, 'Adresse abspielen', 'string', 'media.url', true);
		await this.defineState(
			`rooms.${id}.transport.playObject`,
			'Eintrag aus der Bibliothek abspielen',
			'string',
			'text',
			true,
		);
		for (const [command, label] of [
			['play', 'Abspielen'],
			['pause', 'Anhalten'],
			['stop', 'Beenden'],
			['next', 'Naechster Titel'],
			['previous', 'Voriger Titel'],
		] as const) {
			await this.defineState(`rooms.${id}.transport.${command}`, label, 'boolean', `button.${command}`, true);
		}

		for (const [field, label] of [
			['title', 'Titel'],
			['artist', 'Interpret'],
			['album', 'Album'],
			['albumArt', 'Titelbild'],
			['uri', 'Adresse'],
			['source', 'Quelle'],
		] as const) {
			await this.defineState(`rooms.${id}.track.${field}`, label, 'string', 'media.title', false);
		}

		await this.defineState(`rooms.${id}.group.joinRoom`, 'Zu Raum hinzufuegen', 'string', 'text', true);
		await this.defineState(`rooms.${id}.group.leave`, 'Aus der Zone loesen', 'boolean', 'button', true);

		return id;
	}

	/**
	 * Schreibt die Angaben, die aus der Zonenaufteilung stammen.
	 *
	 * @param id - Objekt-ID des Raumes.
	 * @param room - Der Raum, so wie der Host ihn meldet.
	 * @param online - Ob der Raum in der aktuellen Meldung enthalten war.
	 * @returns Nichts.
	 */
	private async writeRoomStates(id: string, room: RaumfeldRoom, online: boolean): Promise<void> {
		await this.setState(`rooms.${id}.name`, room.name, true);
		await this.setState(`rooms.${id}.online`, online, true);
		// Fehlt powerState, ist der Raum wach - der Host laesst das Attribut
		// dann weg, statt ACTIVE zu schreiben.
		const powerState = room.powerState ?? 'ACTIVE';
		await this.setState(`rooms.${id}.powerState`, powerState, true);
		await this.setState(`rooms.${id}.standby`, powerState !== 'ACTIVE', true);
		await this.setState(`rooms.${id}.zone`, room.zoneUdn ?? '', true);
		await this.setState(
			`rooms.${id}.spotifyConnect`,
			room.renderers.some(renderer => renderer.spotifyConnect),
			true,
		);
	}

	/**
	 * Kurzform fuer die immer gleiche Objektdefinition eines Zustands.
	 *
	 * @param id - Objekt-ID des Zustands, ohne den Namensraum des Adapters.
	 * @param name - Anzeigename in der Oberflaeche.
	 * @param type - Datentyp des Wertes.
	 * @param role - ioBroker-Rolle, die der Oberflaeche sagt, was der Wert bedeutet.
	 * @param write - Ob der Datenpunkt beschrieben werden darf.
	 * @param extra - Weitere Angaben wie Einheit oder Grenzen.
	 * @returns Nichts; das Objekt wird nur angelegt, wenn es noch fehlt.
	 */
	private async defineState(
		id: string,
		name: string,
		type: ioBroker.CommonType,
		role: string,
		write: boolean,
		extra: Partial<ioBroker.StateCommon> = {},
	): Promise<void> {
		await this.setObjectNotExistsAsync(id, {
			type: 'state',
			common: { name, type, role, read: true, write, ...extra },
			native: {},
		});
	}

	/**
	 * Waehlt den Renderer, an den ein Transportbefehl geht.
	 *
	 * Steckt der Raum in einer Zone, gehoert der Befehl an deren Renderer -
	 * sonst spielte nur ein Lautsprecher der Gruppe. Ein Raum ohne Zone
	 * bedient seinen eigenen Renderer.
	 *
	 * @param room - Der Raum, um den es geht.
	 * @returns Die zustaendige Bedienschnittstelle, falls erreichbar.
	 */
	private async transportControl(room: RoomRuntime): Promise<RendererControl | undefined> {
		if (room.zoneUdn !== undefined && room.zoneUdn !== '') {
			const zoneControl = await this.controlFor(room.zoneUdn);
			if (zoneControl) {
				return zoneControl;
			}
			this.log.debug(`Zonen-Renderer ${room.zoneUdn} nicht erreichbar, verwende den Raum-Renderer`);
		}
		return await this.controlFor(room.rendererUdn);
	}

	/**
	 * @param id - State ID
	 * @param state - State object
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (!state || state.ack) {
			return;
		}
		void this.handleCommand(id, state).catch((err: unknown) => {
			this.log.error(`Befehl ${id} fehlgeschlagen: ${asMessage(err)}`);
		});
	}

	/**
	 * Fuehrt einen vom Nutzer geschriebenen Datenpunkt aus.
	 *
	 * @param id - Vollstaendige Objekt-ID des Datenpunkts.
	 * @param state - Der geschriebene Zustand.
	 * @returns Nichts.
	 */
	private async handleCommand(id: string, state: ioBroker.State): Promise<void> {
		const media = /\.media\.(.+)$/.exec(id);
		if (media) {
			await this.handleMediaCommand(id, media[1], state);
			return;
		}

		const match = /\.rooms\.([^.]+)\.(.+)$/.exec(id);
		if (!match) {
			return;
		}
		const [, roomId, path] = match;
		const room = this.rooms.get(roomId);
		if (!room) {
			this.log.warn(`Befehl fuer unbekannten Raum ${roomId}`);
			return;
		}

		const value = state.val;
		this.log.debug(`Befehl ${path} fuer ${roomId}: ${String(value)}`);

		// Lautstaerke, Klang und Bereitschaft gehoeren zum Raum-Renderer,
		// Transportbefehle zur Zone - siehe transportControl.
		const own = await this.controlFor(room.rendererUdn);

		switch (path) {
			case 'volume':
				await own?.setVolume(Number(value));
				return;
			case 'mute':
				await own?.setMute(Boolean(value));
				return;
			case 'standby':
				if (value) {
					await own?.enterManualStandby();
				} else {
					await own?.leaveStandby();
				}
				return;
			case 'equalizer.low':
			case 'equalizer.mid':
			case 'equalizer.high':
				await this.applyFilter(room, path.split('.')[1] as 'low' | 'mid' | 'high', Number(value));
				return;
			case 'group.joinRoom':
				await this.joinRoom(room, String(value));
				await this.setState(id, '', true);
				return;
			case 'group.leave':
				await this.hostService?.connectRoomToZone(room.udn);
				await this.setState(id, false, true);
				return;
			default:
				break;
		}

		// Abspielen laeuft bei Raumfeld ueber die Zone. Steht der Raum in
		// keiner, wird sie hier gebildet - sonst gaebe es keinen
		// Zonen-Renderer, der eine ganze Sammlung annehmen koennte.
		if (path === 'transport.playObject' || path === 'transport.playUri') {
			await this.ensureZone(room);
		}

		const transport = await this.transportControl(room);
		if (!transport) {
			this.log.warn(`Kein erreichbarer Renderer fuer ${roomId}`);
			return;
		}

		switch (path) {
			case 'transport.play':
			case 'transport.pause':
			case 'transport.stop':
			case 'transport.next':
			case 'transport.previous': {
				const command = path.split('.')[1] as 'play' | 'pause' | 'stop' | 'next' | 'previous';
				await transport[command]();
				await this.setState(id, false, true);
				return;
			}
			case 'transport.playMode':
				await transport.setPlayMode(String(value));
				return;
			case 'transport.seek':
				await transport.seek(String(value));
				await this.setState(id, '', true);
				return;
			case 'transport.playUri':
				await transport.setUri(String(value));
				await transport.play();
				await this.setState(id, '', true);
				return;
			case 'transport.playObject':
				await this.playObject(transport, String(value), roomId);
				await this.setState(id, '', true);
				return;
			default:
				this.log.debug(`Fuer ${path} gibt es keinen Befehl`);
		}
	}

	/**
	 * Spielt einen Eintrag der Bibliothek ab.
	 *
	 * Die Abspieladresse steht nur am Objekt selbst, nicht in der Liste seiner
	 * Geschwister - deshalb wird sie hier eigens geholt. Mitgeschickt wird das
	 * vollstaendige DIDL-Lite, damit der Lautsprecher Titel, Interpret und
	 * Titelbild anzeigen kann.
	 *
	 * @param transport - Der Renderer, der abspielen soll.
	 * @param objectId - Kennung des Eintrags aus der Bibliothek.
	 * @param roomId - Objekt-ID des Raumes, fuer die Spieldauer.
	 * @returns Nichts.
	 */
	private async playObject(transport: RendererControl, objectId: string, roomId?: string): Promise<void> {
		if (!this.library) {
			this.log.warn('Die Bibliothek ist nicht verbunden');
			return;
		}
		const found = await this.library.metadata(objectId);
		if (!found) {
			this.log.warn(`In der Bibliothek gibt es keinen Eintrag "${objectId}"`);
			return;
		}
		// Sammlungen tragen keine eigene Abspieladresse. Statt eine
		// Warteschlange zusammenzubauen, bekommt der Renderer eine
		// dlna-playcontainer-Adresse und arbeitet die Sammlung selbst ab.
		const uri =
			found.entry.uri !== ''
				? found.entry.uri
				: this.mediaServerUdn !== undefined
					? containerPlayUri(this.mediaServerUdn, found.entry.id)
					: '';
		if (uri === '') {
			this.log.warn(`"${found.entry.title}" ist eine Sammlung, und die Kennung des MediaServers ist unbekannt.`);
			return;
		}

		// Bei einer Sammlung werden keine Metadaten mitgeschickt: der Renderer
		// holt sich die Angaben zu jedem Titel selbst.
		await transport.setUri(uri, found.entry.uri !== '' ? found.didl : '');
		await transport.play();
		this.log.info(`Spiele "${found.entry.title}"`);

		// Die Spieldauer steht in der Bibliothek, aber nicht beim Renderer:
		// nachgemessen meldet der beim Abspielen eines solchen Titels
		// TrackDuration 0:00:00 und eine RelTime im Bereich von Wochen. Solange
		// die Bibliothek es besser weiss, wird ihr Wert genommen.
		if (found.entry.duration !== '' && roomId !== undefined) {
			await this.setState(`rooms.${roomId}.transport.duration`, found.entry.duration, true);
			await this.setState(`rooms.${roomId}.transport.durationSec`, durationToSeconds(found.entry.duration), true);
		}
	}

	/**
	 * Fuehrt einen Befehl des media-Zweiges aus.
	 *
	 * @param id - Vollstaendige Objekt-ID des Datenpunkts.
	 * @param path - Der Teil hinter "media.".
	 * @param state - Der geschriebene Zustand.
	 * @returns Nichts.
	 */
	private async handleMediaCommand(id: string, path: string, state: ioBroker.State): Promise<void> {
		if (!this.library) {
			this.log.warn('Die Bibliothek ist nicht verbunden');
			return;
		}
		const value = String(state.val ?? '');

		if (path === 'browse') {
			// Ohne Angabe wird die Wurzel geoeffnet; das macht den Datenpunkt
			// bedienbar, ohne die Kennungen zu kennen.
			const objectId = value.trim() === '' ? '0' : value.trim();
			const result = await this.library.browse(objectId);
			await this.setState('media.browseId', objectId, true);
			// Der parentID der Kinder ist die geoeffnete Sammlung selbst und
			// taugt deshalb nicht zum Zurueckgehen. Die uebergeordnete Sammlung
			// steht nur in den Angaben zum Objekt selbst.
			const own = await this.library.metadata(objectId);
			await this.setState('media.browseParent', own?.entry.parentId ?? '', true);
			await this.setState('media.browseResult', JSON.stringify(result.entries.map(toPlainEntry)), true);
			await this.setState('media.browseTotal', result.total, true);
			await this.setState(id, objectId, true);
			this.log.debug(`${objectId}: ${result.entries.length} von ${result.total} Eintraegen gelesen`);
			return;
		}

		if (path === 'search') {
			if (value.trim() === '') {
				await this.setState('media.searchResult', '[]', true);
				return;
			}
			const container = String((await this.getStateAsync('media.searchIn'))?.val ?? '').trim() || '0';
			const result = await this.library.search(container, value.trim());
			await this.setState('media.searchResult', JSON.stringify(result.entries.map(toPlainEntry)), true);
			await this.setState(id, value, true);
			this.log.debug(`Suche nach "${value}" in ${container}: ${result.total} Treffer`);
			return;
		}

		if (path === 'searchIn') {
			await this.setState(id, value, true);
		}
	}

	/**
	 * Setzt ein Band des Klangreglers.
	 *
	 * Das Geraet kennt nur SetFilter fuer alle drei Baender gemeinsam, also
	 * werden die beiden anderen Werte mitgelesen und unveraendert mitgeschickt.
	 *
	 * @param room - Der betroffene Raum.
	 * @param band - Welches Band geaendert wurde.
	 * @param value - Der neue Wert in Dezibel.
	 * @returns Nichts.
	 */
	private async applyFilter(room: RoomRuntime, band: 'low' | 'mid' | 'high', value: number): Promise<void> {
		const control = await this.controlFor(room.rendererUdn);
		if (!control) {
			return;
		}
		const filter = await control.filter();
		filter[band] = value;
		await control.setFilter(filter);
	}

	/**
	 * Sorgt dafuer, dass ein Raum einer Zone angehoert, und liefert deren
	 * Kennung.
	 *
	 * Abspielen geht bei Raumfeld ueber die Zone, nicht ueber den Raum. Ein
	 * Raum ohne Zone - der Zustand nach einem Neustart des Systems - bekommt
	 * deshalb zuerst eine. Das erledigt connectRoomToZone mit leerem zoneUDN,
	 * an der Anlage nachgemessen und ohne dass dafuer etwas laufen muesste.
	 *
	 * Anschliessend wird die Geraeteliste aufgefrischt: der Zonen-Renderer
	 * taucht in listDevices erst auf, wenn es die Zone gibt.
	 *
	 * @param room - Der betroffene Raum.
	 * @returns Die Kennung der Zone, oder undefined, wenn sich keine bilden liess.
	 */
	private async ensureZone(room: RoomRuntime): Promise<string | undefined> {
		if (room.zoneUdn !== undefined && room.zoneUdn !== '') {
			return room.zoneUdn;
		}
		if (!this.hostService) {
			return undefined;
		}

		await this.hostService.connectRoomToZone(room.udn);
		const fresh = await this.hostService.fetchZones();
		const zoneUdn = fresh.allRooms.find(entry => entry.udn === room.udn)?.zoneUdn;
		if (zoneUdn !== undefined && zoneUdn !== '') {
			room.zoneUdn = zoneUdn;
			await this.refreshDeviceLocations();
		}
		return zoneUdn;
	}

	/**
	 * Fuegt einen Raum der Zone eines anderen Raumes hinzu.
	 *
	 * @param room - Der Raum, der wandern soll.
	 * @param targetName - Name des Zielraums. Gehoert dieser noch keiner Zone
	 *   an, wird zuerst eine fuer ihn gebildet.
	 * @returns Nichts.
	 */
	private async joinRoom(room: RoomRuntime, targetName: string): Promise<void> {
		const targetId = roomIdFromName(targetName);
		const target = this.rooms.get(targetId);
		if (!target) {
			this.log.warn(`Zielraum "${targetName}" ist nicht bekannt`);
			return;
		}
		if (target.udn === room.udn) {
			this.log.warn('Ein Raum kann sich nicht selbst beitreten');
			return;
		}

		const zoneUdn = await this.ensureZone(target);
		if (zoneUdn === undefined || zoneUdn === '') {
			this.log.warn(`Fuer "${targetName}" liess sich keine Zone bilden`);
			return;
		}
		await this.hostService?.connectRoomToZone(room.udn, zoneUdn);
	}

	/**
	 * Beantwortet Anfragen der Konfigurationsseite.
	 *
	 * Die Seite kann den Adapter fragen, statt den Nutzer raten zu lassen: sie
	 * laesst ihn nach Geraeten suchen, bietet die eigenen Netzkarten zur
	 * Auswahl an und prueft die eingetragene Verbindung. Das funktioniert auch,
	 * wenn der Adapter selbst keinen Host gefunden hat - die Instanz laeuft
	 * dann zwar ohne Verbindung weiter, nimmt aber Nachrichten entgegen. Genau
	 * in dieser Lage braucht man die Suche am dringendsten.
	 *
	 * @param obj - Die eingegangene Nachricht.
	 * @returns Nichts.
	 */
	private async onMessage(obj: ioBroker.Message): Promise<void> {
		if (typeof obj !== 'object' || !obj.command) {
			return;
		}

		const answer = (payload: unknown): void => {
			if (obj.callback) {
				this.sendTo(obj.from, obj.command, payload as ioBroker.MessagePayload, obj.callback);
			}
		};

		try {
			switch (obj.command) {
				case 'discoverHosts':
					answer(await this.suggestHosts());
					return;
				case 'listInterfaces':
					answer(this.suggestInterfaces());
					return;
				case 'testConnection':
					answer({ result: await this.describeConnection(obj.message) });
					return;
				default:
					this.log.debug(`Unbekannter Befehl aus der Oberflaeche: ${obj.command}`);
					answer({ error: `Unbekannter Befehl ${obj.command}` });
			}
		} catch (err) {
			answer({ error: asMessage(err) });
		}
	}

	/**
	 * Sucht Raumfeld-Hosts und bietet sie zur Auswahl an.
	 *
	 * @returns Die gefundenen Adressen als Auswahlliste.
	 */
	private async suggestHosts(): Promise<{ label: string; value: string }[]> {
		const bindAddress = String(this.config.bindAddress ?? '').trim() || undefined;
		const result = await discover(bindAddress);

		const options = result.hostCandidates.map(address => ({
			label: `${address} (Host)`,
			value: address,
		}));
		for (const address of result.deviceAddresses) {
			if (!result.hostCandidates.includes(address)) {
				options.push({ label: `${address} (Lautsprecher)`, value: address });
			}
		}
		// Die leere Auswahl bleibt moeglich: ohne Eintrag sucht der Adapter bei
		// jedem Start selbst, was der Normalfall bleiben soll.
		return [{ label: 'automatisch suchen', value: '' }, ...options];
	}

	/**
	 * Listet die eigenen Netzkarten auf.
	 *
	 * @returns Die verfuegbaren IPv4-Adressen als Auswahlliste.
	 */
	private suggestInterfaces(): { label: string; value: string }[] {
		const options: { label: string; value: string }[] = [{ label: 'automatisch waehlen', value: '' }];
		for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
			for (const address of addresses ?? []) {
				if (address.family === 'IPv4' && !address.internal) {
					options.push({ label: `${address.address} (${name})`, value: address.address });
				}
			}
		}
		return options;
	}

	/**
	 * Prueft, was unter den eingetragenen Angaben erreichbar ist.
	 *
	 * @param message - Die Angaben der Konfigurationsseite.
	 * @returns Ein lesbarer Bericht fuer die Oberflaeche.
	 */
	private async describeConnection(message: unknown): Promise<string> {
		const config = (message ?? {}) as { hostAddress?: string; bindAddress?: string };
		const bindAddress = String(config.bindAddress ?? '').trim() || undefined;
		let address = String(config.hostAddress ?? '').trim();

		if (address === '') {
			const found = await discover(bindAddress);
			if (found.hostCandidates.length === 0) {
				return (
					'Kein Host gefunden. SSDP wird zwischen Netzsegmenten nicht weitergereicht - steht der ' +
					'Adapter woanders als die Lautsprecher, muss die Adresse hier eingetragen werden.'
				);
			}
			address = found.hostCandidates[0];
		}

		const probe = new RaumfeldHostService({ address });
		const info = await probe.fetchHostInfo();
		const zones = await probe.fetchZones();
		const devices = await probe.fetchDevices();

		return describeSystem(address, info, zones, devices);
	}

	/**
	 * Wird beim Beenden gerufen. Die Rueckmeldung muss in jedem Fall erfolgen,
	 * sonst wartet der Controller bis zum Zwangsabbruch.
	 *
	 * @param callback - Meldet dem Controller, dass aufgeraeumt wurde.
	 */
	private onUnload(callback: () => void): void {
		try {
			this.hostService?.stop();
			this.hostService = undefined;

			const gena = this.gena;
			this.gena = undefined;
			if (!gena) {
				callback();
				return;
			}
			// Abbestellen ist eine Hoeflichkeit gegenueber den Geraeten; klappt
			// es nicht, laufen die Abonnements von selbst ab. Auf keinen Fall
			// darf die Rueckmeldung daran haengen bleiben.
			void gena.stop().finally(() => callback());
		} catch (error) {
			this.log.error(`Error during unloading: ${(error as Error).message}`);
			callback();
		}
	}
}

/**
 * Holt eine lesbare Meldung aus einem unbekannten Fehlerwert.
 *
 * @param err - Der abgefangene Wert, der nicht zwingend ein Error ist.
 * @returns Die Fehlermeldung als Text.
 */
function asMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Bringt einen Bibliothekseintrag in die Form, die als JSON im Datenpunkt
 * landet.
 *
 * Leere Felder fliegen heraus, damit ein Blick in den Datenpunkt nicht von
 * einem Dutzend leerer Zeichenketten je Eintrag erschlagen wird. "playable"
 * kommt hinzu, weil die Unterscheidung zwischen Sammlung und abspielbarem
 * Eintrag die haeufigste Frage an diese Liste ist.
 *
 * @param entry - Der Eintrag, wie die Bibliothek ihn liefert.
 * @returns Der Eintrag ohne leere Felder.
 */
function toPlainEntry(entry: LibraryEntry): Record<string, unknown> {
	const plain: Record<string, unknown> = {
		id: entry.id,
		title: entry.title,
		kind: entry.kind,
		playable: entry.uri !== '',
	};
	for (const [key, value] of Object.entries(entry)) {
		if (key === 'id' || key === 'title' || key === 'kind') {
			continue;
		}
		if (value !== '' && value !== 0) {
			plain[key] = value;
		}
	}
	return plain;
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Raumfeld(options);
} else {
	// otherwise start the instance directly
	(() => new Raumfeld())();
}
