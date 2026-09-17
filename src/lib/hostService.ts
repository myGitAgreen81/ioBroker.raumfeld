/**
 * Anbindung an den Raumfeld-Host-Webservice auf Port 47365.
 *
 * Der Webservice arbeitet mit einem eigenwilligen, aber wirksamen Verfahren,
 * das hier den Kern bildet:
 *
 *   1. Der erste Aufruf von /getZones antwortet mit 307 und leitet auf eine
 *      Sitzungs-URL der Form /<uuid>/getZones um. Im Kopf der Antwort steht
 *      "updateID".
 *   2. Ein erneuter Aufruf derselben Sitzungs-URL mit genau dieser updateID im
 *      Kopf **blockiert**, bis sich etwas aendert. Dann kommt der neue Stand
 *      samt neuer updateID zurueck.
 *
 * Damit meldet der Host Aenderungen von sich aus und es muss nicht regelmaessig
 * abgefragt werden. Nachgemessen: der zweite Aufruf haelt die Verbindung offen,
 * solange nichts passiert.
 */

import { EventEmitter } from 'node:events';
import { parseDeviceList, parseHostInfo, parseZoneConfiguration } from './raumfeldXml';
import type { HostInfo, RaumfeldDeviceEntry, ZoneConfiguration } from './types';

/** Der Port ist bei Raumfeld fest, er laesst sich nicht umstellen. */
export const HOST_SERVICE_PORT = 47365;

/** Eine Protokollsenke, wie der ioBroker-Adapter sie bereitstellt. */
export interface HostServiceLogger {
	/** Einzelheiten, die nur bei der Fehlersuche interessieren. */
	debug: (message: string) => void;
	/** Meldungen ueber den normalen Betrieb. */
	info: (message: string) => void;
	/** Auffaelligkeiten, die den Betrieb nicht verhindern. */
	warn: (message: string) => void;
	/** Fehler, die Eingreifen erfordern. */
	error: (message: string) => void;
}

/** Einstellungen fuer die Anbindung an einen Host. */
export interface HostServiceOptions {
	/** IP-Adresse oder Name des Host-Geraets. */
	address: string;
	/** Abweichender Port; im Normalfall nicht noetig. */
	port?: number;
	/**
	 * Wie lange eine wartende Anfrage offen bleiben darf, bevor sie abgebrochen
	 * und neu gestellt wird. Das ist kein Fehlerfall, sondern nur eine
	 * Auffrischung der Verbindung.
	 */
	pollTimeoutMs?: number;
	/** Kuerzeste Wartezeit nach einem Fehler, verdoppelt sich bis maxBackoffMs. */
	minBackoffMs?: number;
	/** Laengste Wartezeit zwischen zwei Versuchen nach Fehlern. */
	maxBackoffMs?: number;
	/** Wohin protokolliert wird; ohne Angabe wird nichts geschrieben. */
	log?: HostServiceLogger;
}

/** Die Ereignisse, die dieser Dienst meldet. */
export declare interface RaumfeldHostService {
	/**
	 * Eine neue Zonenaufteilung liegt vor - auch beim ersten Abruf.
	 *
	 * @param event - Ereignisname.
	 * @param listener - Empfaengt die neue Aufteilung.
	 */
	on(event: 'zones', listener: (config: ZoneConfiguration) => void): this;
	/**
	 * Die Verbindung zum Host steht wieder.
	 *
	 * @param event - Ereignisname.
	 * @param listener - Wird ohne Argumente gerufen.
	 */
	on(event: 'connected', listener: () => void): this;
	/**
	 * Die Verbindung ist abgerissen.
	 *
	 * @param event - Ereignisname.
	 * @param listener - Empfaengt die Begruendung.
	 */
	on(event: 'disconnected', listener: (reason: string) => void): this;
}

/** Haelt die Verbindung zum Host und meldet Aenderungen der Zonenaufteilung. */
export class RaumfeldHostService extends EventEmitter {
	private readonly baseUrl: string;
	private readonly pollTimeoutMs: number;
	private readonly minBackoffMs: number;
	private readonly maxBackoffMs: number;
	private readonly log: HostServiceLogger;

	private sessionUrl?: string;
	private updateId?: string;
	private stopped = true;
	private connected = false;
	private controller?: AbortController;
	private backoffTimer?: NodeJS.Timeout;

	/**
	 * @param options - Adresse des Hosts und die Feineinstellungen der Schleife.
	 */
	public constructor(options: HostServiceOptions) {
		super();
		this.baseUrl = `http://${options.address}:${options.port ?? HOST_SERVICE_PORT}`;
		this.pollTimeoutMs = options.pollTimeoutMs ?? 300_000;
		this.minBackoffMs = options.minBackoffMs ?? 2_000;
		this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
		this.log = options.log ?? {
			debug: () => undefined,
			info: () => undefined,
			warn: () => undefined,
			error: () => undefined,
		};
	}

	/** Die Basisadresse des Webservice, wie sie tatsaechlich verwendet wird. */
	public get address(): string {
		return this.baseUrl;
	}

	/**
	 * Ein einfacher Abruf ohne Warten, fuer alles ausser der Zonenueberwachung.
	 *
	 * @param endpoint - Name des Endpunkts, etwa "getHostInfo".
	 * @param timeoutMs - Abbruch nach dieser Zeit.
	 * @returns Der Rumpf der Antwort als Text.
	 */
	private async fetchOnce(endpoint: string, timeoutMs = 8_000): Promise<string> {
		const res = await fetch(`${this.baseUrl}/${endpoint}`, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!res.ok) {
			throw new Error(`${endpoint}: HTTP ${res.status} ${res.statusText}`);
		}
		return await res.text();
	}

	/**
	 * Fragt die Zonenaufteilung einmalig ab.
	 *
	 * @returns Die aktuelle Aufteilung.
	 */
	public async fetchZones(): Promise<ZoneConfiguration> {
		return parseZoneConfiguration(await this.fetchOnce('getZones'));
	}

	/**
	 * Fragt die Geraeteliste ab.
	 *
	 * @returns Alle Geraete, die der Host kennt.
	 */
	public async fetchDevices(): Promise<RaumfeldDeviceEntry[]> {
		return parseDeviceList(await this.fetchOnce('listDevices'));
	}

	/**
	 * Fragt die Angaben zum Host ab.
	 *
	 * @returns Name des Host-Geraets und sein Raum.
	 */
	public async fetchHostInfo(): Promise<HostInfo> {
		return parseHostInfo(await this.fetchOnce('getHostInfo'));
	}

	/**
	 * Verschiebt einen Raum in eine Zone. Der einzige Zonenbefehl, den der
	 * Webservice kennt - dropRoom, createZone und renameZone gibt es nicht,
	 * die antworten alle mit 404.
	 *
	 * @param roomUdn - UDN des Raumes.
	 * @param zoneUdn - Ziel-Zone. **Ohne Angabe** setzt der Host den Raum in
	 *   eine neue, eigene Zone - das ist zugleich der Weg, einen Raum aus einer
	 *   Gruppe zu loesen und der Weg, ueberhaupt eine erste Zone zu bilden. An
	 *   der Anlage nachgemessen: aus zwei Raeumen ohne Zone entstand so eine
	 *   Zone mit einem Raum, ohne dass dafuer etwas abgespielt werden musste.
	 * @returns Nichts; ein Fehler wird geworfen, wenn der Host ablehnt.
	 */
	public async connectRoomToZone(roomUdn: string, zoneUdn?: string): Promise<void> {
		const query = new URLSearchParams({ roomUDN: roomUdn });
		query.set('zoneUDN', zoneUdn ?? '');
		const res = await fetch(`${this.baseUrl}/connectRoomToZone?${query.toString()}`, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) {
			throw new Error(`connectRoomToZone: HTTP ${res.status} ${res.statusText}`);
		}
	}

	/**
	 * Startet die Ueberwachung.
	 *
	 * Ein eigener Erstabruf ist nicht noetig: der erste Durchgang der Schleife
	 * hat noch keine updateID, der Host antwortet deshalb sofort mit dem
	 * aktuellen Stand. Das "zones"-Ereignis kommt also gleich nach dem Start,
	 * ohne dass auf eine Aenderung gewartet werden muesste.
	 */
	public start(): void {
		this.stopped = false;
		void this.watchZones();
	}

	/** Beendet die Ueberwachung und bricht eine wartende Anfrage ab. */
	public stop(): void {
		this.stopped = true;
		if (this.backoffTimer) {
			clearTimeout(this.backoffTimer);
			this.backoffTimer = undefined;
		}
		this.controller?.abort();
		this.controller = undefined;
	}

	/**
	 * Die Warteschleife. Sie laeuft, bis stop() gerufen wird, und unterscheidet
	 * drei Ausgaenge: neuer Stand, abgelaufene Wartezeit ohne Aenderung, Fehler.
	 * Nur der dritte fuehrt zu einer Pause.
	 *
	 * @returns Kehrt erst zurueck, wenn die Ueberwachung beendet wurde.
	 */
	private async watchZones(): Promise<void> {
		let backoff = this.minBackoffMs;

		while (!this.stopped) {
			try {
				const changed = await this.requestZones();
				if (this.stopped) {
					return;
				}

				if (!this.connected) {
					this.connected = true;
					this.emit('connected');
				}
				backoff = this.minBackoffMs;

				if (changed) {
					this.emit('zones', changed);
				}
			} catch (err) {
				if (this.stopped) {
					return;
				}

				const message = err instanceof Error ? err.message : String(err);
				if (this.connected) {
					this.connected = false;
					this.emit('disconnected', message);
				}
				this.log.debug(`Zonenueberwachung unterbrochen: ${message}`);

				// Die Sitzung ist nach einem Fehler nicht mehr verlaesslich -
				// beim naechsten Versuch wird sie neu aufgebaut.
				this.sessionUrl = undefined;
				this.updateId = undefined;

				await this.wait(backoff);
				backoff = Math.min(backoff * 2, this.maxBackoffMs);
			}
		}
	}

	/**
	 * Ein Durchgang der Warteschleife.
	 *
	 * @returns Die neue Zonenaufteilung, oder undefined, wenn die Wartezeit
	 *   ohne Aenderung ablief - dann wird schlicht erneut gefragt.
	 */
	private async requestZones(): Promise<ZoneConfiguration | undefined> {
		this.controller = new AbortController();
		const timer = setTimeout(() => this.controller?.abort(), this.pollTimeoutMs);

		try {
			const waiting = this.sessionUrl !== undefined && this.updateId !== undefined;
			const url = this.sessionUrl ?? `${this.baseUrl}/getZones`;
			const headers: Record<string, string> = {};
			if (waiting && this.updateId !== undefined) {
				// Genau diese Kopfzeile laesst den Host warten, bis sich etwas
				// aendert. Ohne sie antwortet er sofort mit dem aktuellen Stand.
				headers.updateID = this.updateId;
			}

			const res = await fetch(url, { headers, signal: this.controller.signal });
			if (!res.ok) {
				throw new Error(`getZones: HTTP ${res.status} ${res.statusText}`);
			}

			// Die Umleitung fuehrt auf die Sitzungs-URL; fetch folgt ihr von
			// selbst, res.url traegt danach das Ziel.
			this.sessionUrl = res.url;
			const updateId = res.headers.get('updateID') ?? res.headers.get('updateid');
			const body = await res.text();

			const unchanged = waiting && updateId === this.updateId;
			this.updateId = updateId ?? this.updateId;

			if (unchanged || body.trim().length === 0) {
				return undefined;
			}
			return parseZoneConfiguration(body);
		} catch (err) {
			// Der eigene Zeitablauf ist kein Fehler: es hat sich nur nichts
			// getan. Die Anfrage wird einfach erneut gestellt.
			if (!this.stopped && err instanceof Error && err.name === 'AbortError') {
				return undefined;
			}
			throw err;
		} finally {
			clearTimeout(timer);
			this.controller = undefined;
		}
	}

	/**
	 * Wartet eine Weile, abbrechbar ueber stop().
	 *
	 * @param ms - Wartezeit in Millisekunden.
	 * @returns Ein Versprechen, das nach Ablauf eingeloest wird.
	 */
	private wait(ms: number): Promise<void> {
		return new Promise(resolve => {
			this.backoffTimer = setTimeout(resolve, ms);
		});
	}
}
