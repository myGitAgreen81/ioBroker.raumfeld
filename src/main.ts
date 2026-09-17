/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as utils from '@iobroker/adapter-core';
import { discover } from './lib/discovery';
import { RaumfeldHostService } from './lib/hostService';
import { roomIdFromName } from './lib/raumfeldXml';
import type { RaumfeldRoom, ZoneConfiguration } from './lib/types';

class Raumfeld extends utils.Adapter {
	private hostService?: RaumfeldHostService;

	/**
	 * Raum-UDN zu Objekt-ID. Ueber diese Zuordnung faellt auf, wenn ein Raum in
	 * der Raumfeld-App umbenannt wurde: die UDN bleibt, die ID aendert sich.
	 */
	private readonly roomIds = new Map<string, string>();

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'raumfeld',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		await this.ensureInfoObjects();
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
		await this.setStateAsync('info.hostAddress', address, true);

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

		this.hostService.start();
	}

	/**
	 * Legt die Objekte des info-Zweiges an.
	 *
	 * Sie stehen zwar auch als instanceObjects in der io-package.json, aber die
	 * werden nur beim Einrichten einer Instanz ausgewertet. Eine Instanz, die
	 * es vor dem Hinzufuegen dieser Datenpunkte schon gab, haette sie sonst
	 * nie - und jeder Schreibzugriff quittierte das mit der Warnung
	 * "has no existing object".
	 */
	private async ensureInfoObjects(): Promise<void> {
		await this.defineState('info.hostAddress', 'Adresse des Raumfeld-Hosts', 'string', 'info.ip', false);
		await this.defineState('info.hostName', 'Name des Host-Geraets', 'string', 'text', false);
		await this.defineState('info.hostRoom', 'Raum, in dem der Host steht', 'string', 'text', false);
		await this.defineState('info.zones', 'Aktuelle Zonenaufteilung als JSON', 'string', 'json', false);
	}

	/**
	 * Ermittelt die Adresse des Hosts: entweder aus den Einstellungen oder per
	 * SSDP-Suche nach dem ConfigDevice, das es im System nur einmal gibt.
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

	/** Liest die unveraenderlichen Angaben des Hosts einmal aus. */
	private async readHostInfo(): Promise<void> {
		if (!this.hostService) {
			return;
		}
		try {
			const info = await this.hostService.fetchHostInfo();
			await this.setStateAsync('info.hostName', info.hostName ?? '', true);
			await this.setStateAsync('info.hostRoom', info.roomName ?? '', true);
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
	 */
	private async applyZoneConfiguration(config: ZoneConfiguration): Promise<void> {
		this.log.debug(
			`Zonenaufteilung: ${config.zones.length} Zonen, ${config.unassignedRooms.length} einzelne Raeume`,
		);

		await this.setStateAsync(
			'info.zones',
			JSON.stringify(config.zones.map(zone => ({ udn: zone.udn, rooms: zone.rooms.map(room => room.name) }))),
			true,
		);

		const present = new Set<string>();
		for (const room of config.allRooms) {
			const id = await this.ensureRoom(room);
			present.add(id);
			await this.writeRoomStates(id, room, true);
		}

		for (const [udn, id] of this.roomIds) {
			if (!present.has(id)) {
				this.log.debug(`Raum ${id} (${udn}) ist derzeit nicht gemeldet`);
				await this.setStateAsync(`rooms.${id}.online`, false, true);
			}
		}
	}

	/**
	 * Legt die Objekte eines Raumes an, falls sie noch fehlen.
	 *
	 * @param room - Der Raum, so wie der Host ihn meldet.
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

		return id;
	}

	/**
	 * @param id - Objekt-ID des Raumes.
	 * @param room - Der Raum, so wie der Host ihn meldet.
	 * @param online - Ob der Raum in der aktuellen Meldung enthalten war.
	 */
	private async writeRoomStates(id: string, room: RaumfeldRoom, online: boolean): Promise<void> {
		await this.setStateAsync(`rooms.${id}.name`, room.name, true);
		await this.setStateAsync(`rooms.${id}.online`, online, true);
		// Fehlt powerState, ist der Raum wach - der Host laesst das Attribut
		// dann weg, statt ACTIVE zu schreiben.
		await this.setStateAsync(`rooms.${id}.powerState`, room.powerState ?? 'ACTIVE', true);
		await this.setStateAsync(`rooms.${id}.zone`, room.zoneUdn ?? '', true);
		await this.setStateAsync(
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
	 * @returns Nichts; das Objekt wird nur angelegt, wenn es noch fehlt.
	 */
	private async defineState(
		id: string,
		name: string,
		type: ioBroker.CommonType,
		role: string,
		write: boolean,
	): Promise<void> {
		await this.setObjectNotExistsAsync(id, {
			type: 'state',
			common: { name, type, role, read: true, write },
			native: {},
		});
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
			callback();
		} catch (error) {
			this.log.error(`Error during unloading: ${(error as Error).message}`);
			callback();
		}
	}

	/**
	 * @param id - State ID
	 * @param state - State object
	 */
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		if (!state || state.ack) {
			return;
		}
		// Schreibbare Datenpunkte kommen mit der Anbindung der Renderer dazu;
		// bis dahin gibt es hier nichts zu tun.
		this.log.debug(`Befehl fuer ${id} erhalten: ${String(state.val)}`);
	}
}

/**
 * Holt eine lesbare Meldung aus einem unbekannten Fehlerwert.
 *
 * @param err - Der abgefangene Wert, der nicht zwingend ein Error ist.
 */
function asMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Raumfeld(options);
} else {
	// otherwise start the instance directly
	(() => new Raumfeld())();
}
