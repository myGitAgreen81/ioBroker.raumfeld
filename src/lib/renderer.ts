/**
 * Die Befehle eines Raumfeld-Renderers.
 *
 * Es gibt hier nur, was die Geraete laut ihrer eigenen SCPD-Beschreibung
 * tatsaechlich anbieten. Aus dem UPnP-Standard fehlen bei Raumfeld etwa
 * GetMediaInfo und GetDeviceCapabilities - wer sie aufruft, bekommt einen
 * Fehler statt einer Antwort. Dafuer gibt es drei eigene Erweiterungen fuer
 * den Bereitschaftszustand, ohne die ein schlafender Lautsprecher aus ioBroker
 * heraus nicht zu wecken waere.
 */

import { soapCall } from './soap';
import type { ServiceEndpoint, TransportInfo, PositionInfo, ToneFilter } from './types';

/** Alle Aktionen beziehen sich auf die einzige Instanz eines Renderers. */
const INSTANCE = 0;

/** Fasst die Dienste eines Renderers zu bedienbaren Befehlen zusammen. */
export class RendererControl {
	private readonly services: Map<string, ServiceEndpoint>;

	/**
	 * @param services - Die Dienste aus der Geraetebeschreibung, nach Kurznamen.
	 */
	public constructor(services: Map<string, ServiceEndpoint>) {
		this.services = services;
	}

	/**
	 * Prueft, ob ein Dienst vorhanden ist.
	 *
	 * @param name - Kurzname des Dienstes, etwa "RenderingControl".
	 * @returns Ob das Geraet diesen Dienst anbietet.
	 */
	public has(name: string): boolean {
		return this.services.has(name);
	}

	/**
	 * Die Ereignis-URL eines Dienstes, fuer das GENA-Abonnement.
	 *
	 * @param name - Kurzname des Dienstes.
	 * @returns Die URL, oder undefined, wenn der Dienst fehlt.
	 */
	public eventUrl(name: string): string | undefined {
		return this.services.get(name)?.eventSubUrl;
	}

	/**
	 * Ruft eine Aktion eines Dienstes auf.
	 *
	 * @param name - Kurzname des Dienstes.
	 * @param action - Name der Aktion.
	 * @param args - Weitere Argumente neben der InstanceID.
	 * @returns Die Ausgangsargumente der Aktion.
	 */
	private async call(
		name: string,
		action: string,
		args: Record<string, string | number> = {},
	): Promise<Record<string, string>> {
		const service = this.services.get(name);
		if (!service) {
			throw new Error(`Dienst ${name} ist auf diesem Geraet nicht vorhanden`);
		}
		return await soapCall(service.controlUrl, service.serviceType, action, args);
	}

	// ---- AVTransport ------------------------------------------------------

	/**
	 * Startet die Wiedergabe.
	 *
	 * @returns Nichts.
	 */
	public async play(): Promise<void> {
		await this.call('AVTransport', 'Play', { InstanceID: INSTANCE, Speed: '1' });
	}

	/**
	 * Haelt die Wiedergabe an.
	 *
	 * @returns Nichts.
	 */
	public async pause(): Promise<void> {
		await this.call('AVTransport', 'Pause', { InstanceID: INSTANCE });
	}

	/**
	 * Beendet die Wiedergabe.
	 *
	 * @returns Nichts.
	 */
	public async stop(): Promise<void> {
		await this.call('AVTransport', 'Stop', { InstanceID: INSTANCE });
	}

	/**
	 * Springt zum naechsten Titel.
	 *
	 * @returns Nichts.
	 */
	public async next(): Promise<void> {
		await this.call('AVTransport', 'Next', { InstanceID: INSTANCE });
	}

	/**
	 * Springt zum vorigen Titel.
	 *
	 * @returns Nichts.
	 */
	public async previous(): Promise<void> {
		await this.call('AVTransport', 'Previous', { InstanceID: INSTANCE });
	}

	/**
	 * Springt an eine Stelle des laufenden Titels.
	 *
	 * @param position - Zielzeit in der Form h:mm:ss.
	 * @returns Nichts.
	 */
	public async seek(position: string): Promise<void> {
		await this.call('AVTransport', 'Seek', { InstanceID: INSTANCE, Unit: 'REL_TIME', Target: position });
	}

	/**
	 * Setzt die Abspielart.
	 *
	 * @param mode - NORMAL, REPEAT_ALL, SHUFFLE oder SHUFFLE_NOREPEAT.
	 * @returns Nichts.
	 */
	public async setPlayMode(mode: string): Promise<void> {
		await this.call('AVTransport', 'SetPlayMode', { InstanceID: INSTANCE, NewPlayMode: mode });
	}

	/**
	 * Gibt eine Adresse zur Wiedergabe vor.
	 *
	 * @param uri - Die abzuspielende Adresse.
	 * @param metadata - Zugehoerige DIDL-Lite-Angaben, meist leer.
	 * @returns Nichts.
	 */
	public async setUri(uri: string, metadata = ''): Promise<void> {
		await this.call('AVTransport', 'SetAVTransportURI', {
			InstanceID: INSTANCE,
			CurrentURI: uri,
			CurrentURIMetaData: metadata,
		});
	}

	/**
	 * Weckt das Geraet aus dem Bereitschaftszustand.
	 *
	 * @returns Nichts.
	 */
	public async leaveStandby(): Promise<void> {
		await this.call('AVTransport', 'LeaveStandby', { InstanceID: INSTANCE });
	}

	/**
	 * Schickt das Geraet in den Bereitschaftszustand.
	 *
	 * @returns Nichts.
	 */
	public async enterManualStandby(): Promise<void> {
		await this.call('AVTransport', 'EnterManualStandby', { InstanceID: INSTANCE });
	}

	/**
	 * Fragt den Wiedergabezustand ab.
	 *
	 * @returns Zustand und Status des Transports.
	 */
	public async transportInfo(): Promise<TransportInfo> {
		const result = await this.call('AVTransport', 'GetTransportInfo', { InstanceID: INSTANCE });
		return {
			state: result.CurrentTransportState ?? '',
			status: result.CurrentTransportStatus ?? '',
		};
	}

	/**
	 * Fragt Laufzeit und Dauer des laufenden Titels ab.
	 *
	 * Raumfeld liefert hier nur diese beiden Angaben; die Titelangaben kommen
	 * ueber die Ereignisse, nicht ueber diese Aktion.
	 *
	 * @returns Verstrichene Zeit und Gesamtdauer.
	 */
	public async positionInfo(): Promise<PositionInfo> {
		const result = await this.call('AVTransport', 'GetPositionInfo', { InstanceID: INSTANCE });
		return {
			duration: result.TrackDuration ?? '0:00:00',
			position: result.RelTime ?? '0:00:00',
		};
	}

	/**
	 * Fragt die Abspielart ab.
	 *
	 * @returns Die eingestellte Abspielart.
	 */
	public async playMode(): Promise<string> {
		const result = await this.call('AVTransport', 'GetTransportSettings', { InstanceID: INSTANCE });
		return result.PlayMode ?? 'NORMAL';
	}

	// ---- RenderingControl -------------------------------------------------

	/**
	 * Fragt die Lautstaerke ab.
	 *
	 * @returns Die Lautstaerke zwischen 0 und 100.
	 */
	public async volume(): Promise<number> {
		const result = await this.call('RenderingControl', 'GetVolume', {
			InstanceID: INSTANCE,
			Channel: 'Master',
		});
		return Number(result.CurrentVolume ?? 0);
	}

	/**
	 * Setzt die Lautstaerke.
	 *
	 * @param value - Zielwert zwischen 0 und 100.
	 * @returns Nichts.
	 */
	public async setVolume(value: number): Promise<void> {
		const clamped = Math.max(0, Math.min(100, Math.round(value)));
		await this.call('RenderingControl', 'SetVolume', {
			InstanceID: INSTANCE,
			Channel: 'Master',
			DesiredVolume: clamped,
		});
	}

	/**
	 * Fragt ab, ob der Ton abgeschaltet ist.
	 *
	 * @returns Ob stummgeschaltet ist.
	 */
	public async mute(): Promise<boolean> {
		const result = await this.call('RenderingControl', 'GetMute', {
			InstanceID: INSTANCE,
			Channel: 'Master',
		});
		return result.CurrentMute === '1' || result.CurrentMute === 'true';
	}

	/**
	 * Schaltet den Ton ab oder wieder an.
	 *
	 * @param value - true schaltet stumm.
	 * @returns Nichts.
	 */
	public async setMute(value: boolean): Promise<void> {
		await this.call('RenderingControl', 'SetMute', {
			InstanceID: INSTANCE,
			Channel: 'Master',
			DesiredMute: value ? 1 : 0,
		});
	}

	/**
	 * Fragt die Balance ab.
	 *
	 * @returns Der Balancewert des Geraets.
	 */
	public async balance(): Promise<number> {
		const result = await this.call('RenderingControl', 'GetBalance', { InstanceID: INSTANCE });
		return Number(result.CurrentBalance ?? 0);
	}

	/**
	 * Setzt die Balance.
	 *
	 * @param value - Der gewuenschte Wert.
	 * @returns Nichts.
	 */
	public async setBalance(value: number): Promise<void> {
		await this.call('RenderingControl', 'SetBalance', {
			InstanceID: INSTANCE,
			DesiredBalance: Math.round(value),
		});
	}

	/**
	 * Fragt den Klangregler ab.
	 *
	 * @returns Die drei Baender in Dezibel.
	 */
	public async filter(): Promise<ToneFilter> {
		const result = await this.call('RenderingControl', 'GetFilter', { InstanceID: INSTANCE });
		return {
			low: Number(result.LowDB ?? 0),
			mid: Number(result.MidDB ?? 0),
			high: Number(result.HighDB ?? 0),
		};
	}

	/**
	 * Setzt den Klangregler.
	 *
	 * Die drei Baender lassen sich nur gemeinsam setzen - eine Aktion fuer ein
	 * einzelnes Band gibt es nicht. Wer eines aendert, muss die anderen beiden
	 * mitschicken.
	 *
	 * @param filter - Die drei Baender in Dezibel.
	 * @returns Nichts.
	 */
	public async setFilter(filter: ToneFilter): Promise<void> {
		await this.call('RenderingControl', 'SetFilter', {
			InstanceID: INSTANCE,
			LowDB: Math.round(filter.low),
			MidDB: Math.round(filter.mid),
			HighDB: Math.round(filter.high),
		});
	}

	/**
	 * Spielt einen Systemton ab.
	 *
	 * @param sound - Name des Tons, wie ihn das Geraet kennt.
	 * @returns Nichts.
	 */
	public async playSystemSound(sound: string): Promise<void> {
		await this.call('RenderingControl', 'PlaySystemSound', { InstanceID: INSTANCE, Sound: sound });
	}
}
