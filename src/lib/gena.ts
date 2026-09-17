/**
 * GENA: das Abonnement von UPnP-Ereignissen.
 *
 * Damit ein Geraet Aenderungen melden kann, muss der Adapter selbst einen
 * HTTP-Zuhoerer betreiben, den das Geraet erreicht. Es verbindet sich also von
 * sich aus zurueck - genau deshalb reicht es nicht, die Lautsprecher erreichen
 * zu koennen, sie muessen auch den Adapter erreichen. Steht er in einem anderen
 * Netzsegment, braucht es dafuer eine Firewallregel in der Gegenrichtung.
 *
 * Abonnements laufen ab. Das Geraet nennt in der Antwort eine Gueltigkeit
 * ("TIMEOUT: Second-300"), und wer nicht rechtzeitig verlaengert, bekommt
 * schlicht keine Meldungen mehr - ohne Fehler, ohne Hinweis. Deshalb wird hier
 * bei zwei Dritteln der Laufzeit erneuert.
 */

import * as http from 'node:http';
import * as net from 'node:net';
import { parsePropertySet } from './events';

/** Wird bei jeder Meldung eines abonnierten Dienstes gerufen. */
export type EventHandler = (properties: Record<string, string>) => void;

/** Eine Protokollsenke, wie der ioBroker-Adapter sie bereitstellt. */
export interface GenaLogger {
	/** Einzelheiten, die nur bei der Fehlersuche interessieren. */
	debug: (message: string) => void;
	/** Auffaelligkeiten, die den Betrieb nicht verhindern. */
	warn: (message: string) => void;
}

interface Subscription {
	eventSubUrl: string;
	sid: string;
	handler: EventHandler;
	timer?: NodeJS.Timeout;
}

/**
 * Ermittelt, mit welcher eigenen Adresse dieser Rechner ein bestimmtes Geraet
 * erreicht.
 *
 * Das ist verlaesslicher als eine Liste der Netzkarten: bei mehreren Karten
 * entscheidet die Routingtabelle, und genau deren Entscheidung wird hier
 * abgefragt. Die Verbindung wird sofort wieder geschlossen.
 *
 * @param host - Adresse des Geraets.
 * @param port - Ein Port, auf dem das Geraet erreichbar ist.
 * @param timeoutMs - Abbruch nach dieser Zeit.
 * @returns Die eigene Adresse auf dem Weg zu diesem Geraet.
 */
export function localAddressTowards(host: string, port: number, timeoutMs = 5_000): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.connect({ host, port });
		socket.setTimeout(timeoutMs);

		const fail = (err: Error): void => {
			socket.destroy();
			reject(err);
		};

		socket.on('connect', () => {
			const address = socket.localAddress;
			socket.destroy();
			if (address) {
				resolve(address.replace(/^::ffff:/, ''));
			} else {
				reject(new Error('Eigene Adresse nicht ermittelbar'));
			}
		});
		socket.on('timeout', () => fail(new Error(`Zeitablauf beim Verbinden mit ${host}:${port}`)));
		socket.on('error', fail);
	});
}

/** Nimmt UPnP-Ereignisse entgegen und haelt die Abonnements gueltig. */
export class GenaListener {
	private server?: http.Server;
	private address?: string;
	private port = 0;
	private readonly subscriptions = new Map<string, Subscription>();
	private readonly log: GenaLogger;
	private stopped = false;

	/**
	 * @param log - Wohin protokolliert wird.
	 */
	public constructor(log: GenaLogger) {
		this.log = log;
	}

	/**
	 * Startet den Zuhoerer.
	 *
	 * @param bindAddress - Adresse, auf der gelauscht wird. Sie muss fuer die
	 *   Geraete erreichbar sein.
	 * @param port - Gewuenschter Port; 0 laesst das Betriebssystem waehlen.
	 * @returns Nichts; danach steht callbackBase bereit.
	 */
	public start(bindAddress: string, port = 0): Promise<void> {
		this.stopped = false;
		return new Promise((resolve, reject) => {
			const server = http.createServer((req, res) => this.onRequest(req, res));
			server.on('error', reject);
			server.listen(port, bindAddress, () => {
				const info = server.address();
				if (info === null || typeof info === 'string') {
					reject(new Error('Zuhoerer konnte nicht gestartet werden'));
					return;
				}
				this.server = server;
				this.address = bindAddress;
				this.port = info.port;
				resolve();
			});
		});
	}

	/** Die Adresse, unter der die Geraete den Adapter erreichen. */
	public get callbackBase(): string {
		return `http://${this.address}:${this.port}`;
	}

	/**
	 * Abonniert einen Dienst.
	 *
	 * @param eventSubUrl - Die Ereignis-URL des Dienstes aus seiner Beschreibung.
	 * @param handler - Wird bei jeder Meldung gerufen.
	 * @returns Die Abonnementkennung, unter der das Geraet meldet.
	 */
	public async subscribe(eventSubUrl: string, handler: EventHandler): Promise<string> {
		const res = await fetch(eventSubUrl, {
			method: 'SUBSCRIBE',
			headers: {
				CALLBACK: `<${this.callbackBase}/>`,
				NT: 'upnp:event',
				TIMEOUT: 'Second-300',
			},
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) {
			throw new Error(`SUBSCRIBE ${eventSubUrl}: HTTP ${res.status} ${res.statusText}`);
		}
		const sid = res.headers.get('sid');
		if (!sid) {
			throw new Error(`SUBSCRIBE ${eventSubUrl}: keine Abonnementkennung erhalten`);
		}

		const subscription: Subscription = { eventSubUrl, sid, handler };
		this.subscriptions.set(sid, subscription);
		this.scheduleRenewal(subscription, this.secondsFromTimeout(res.headers.get('timeout')));
		this.log.debug(`Abonniert: ${eventSubUrl} (${sid})`);
		return sid;
	}

	/** Beendet alle Abonnements und schliesst den Zuhoerer. */
	public async stop(): Promise<void> {
		this.stopped = true;
		const open = [...this.subscriptions.values()];
		this.subscriptions.clear();

		for (const subscription of open) {
			if (subscription.timer) {
				clearTimeout(subscription.timer);
			}
			try {
				await fetch(subscription.eventSubUrl, {
					method: 'UNSUBSCRIBE',
					headers: { SID: subscription.sid },
					signal: AbortSignal.timeout(4_000),
				});
			} catch (err) {
				// Beim Herunterfahren ist das folgenlos: das Abonnement laeuft
				// von selbst ab, spaetestens nach fuenf Minuten.
				this.log.debug(`Abbestellen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		await new Promise<void>(resolve => {
			if (!this.server) {
				resolve();
				return;
			}
			this.server.close(() => resolve());
			this.server = undefined;
		});
	}

	/**
	 * Liest die Gueltigkeit aus der TIMEOUT-Kopfzeile.
	 *
	 * @param value - Der Inhalt der Kopfzeile, etwa "Second-300".
	 * @returns Die Gueltigkeit in Sekunden; im Zweifel 300.
	 */
	private secondsFromTimeout(value: string | null): number {
		const seconds = Number(/Second-(\d+)/i.exec(value ?? '')?.[1]);
		return Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
	}

	/**
	 * Plant die Erneuerung eines Abonnements.
	 *
	 * @param subscription - Das zu erneuernde Abonnement.
	 * @param seconds - Die vom Geraet genannte Gueltigkeit.
	 */
	private scheduleRenewal(subscription: Subscription, seconds: number): void {
		// Zwei Drittel der Laufzeit: frueh genug, dass eine misslungene
		// Erneuerung noch einen zweiten Versuch erlaubt, bevor das Abonnement
		// tatsaechlich verfaellt.
		const delay = Math.max(30, Math.floor(seconds * (2 / 3))) * 1000;
		subscription.timer = setTimeout(() => {
			void this.renew(subscription);
		}, delay);
	}

	/**
	 * Erneuert ein Abonnement, oder legt es bei Ablehnung neu an.
	 *
	 * @param subscription - Das zu erneuernde Abonnement.
	 */
	private async renew(subscription: Subscription): Promise<void> {
		if (this.stopped || !this.subscriptions.has(subscription.sid)) {
			return;
		}
		try {
			const res = await fetch(subscription.eventSubUrl, {
				method: 'SUBSCRIBE',
				headers: { SID: subscription.sid, TIMEOUT: 'Second-300' },
				signal: AbortSignal.timeout(10_000),
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status} ${res.statusText}`);
			}
			this.scheduleRenewal(subscription, this.secondsFromTimeout(res.headers.get('timeout')));
		} catch (err) {
			this.log.debug(
				`Erneuern von ${subscription.sid} fehlgeschlagen, neues Abonnement: ${err instanceof Error ? err.message : String(err)}`,
			);
			// Ein Geraet, das zwischenzeitlich neu gestartet ist, kennt die alte
			// Kennung nicht mehr. Dann hilft nur ein frisches Abonnement.
			this.subscriptions.delete(subscription.sid);
			try {
				await this.subscribe(subscription.eventSubUrl, subscription.handler);
			} catch (again) {
				this.log.warn(
					`Abonnement fuer ${subscription.eventSubUrl} verloren: ${again instanceof Error ? again.message : String(again)}`,
				);
			}
		}
	}

	/**
	 * Nimmt eine NOTIFY-Anfrage entgegen.
	 *
	 * @param req - Die eingehende Anfrage.
	 * @param res - Die zu beantwortende Antwort.
	 */
	private onRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		if (req.method !== 'NOTIFY') {
			res.writeHead(405);
			res.end();
			return;
		}

		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => {
			// Immer sofort quittieren: ein Geraet, das keine Antwort bekommt,
			// wiederholt die Meldung und kann das Abonnement verwerfen.
			res.writeHead(200);
			res.end();

			const sid = String(req.headers.sid ?? '');
			const subscription = this.subscriptions.get(sid);
			if (!subscription) {
				this.log.debug(`Meldung fuer unbekanntes Abonnement ${sid} verworfen`);
				return;
			}
			try {
				subscription.handler(parsePropertySet(Buffer.concat(chunks).toString('utf8')));
			} catch (err) {
				this.log.warn(`Meldung nicht auswertbar: ${err instanceof Error ? err.message : String(err)}`);
			}
		});
	}
}
