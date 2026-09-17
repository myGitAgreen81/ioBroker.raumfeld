/**
 * Pruefungen der Ereignisauswertung.
 *
 * Die beiden Vorlagen sind woertlich mitgeschnittene GENA-Meldungen eines
 * Teufel One S mit Firmware 2.19.3 - einschliesslich der dreifachen
 * Verschachtelung: propertyset, darin maskiert das LastChange-Dokument, darin
 * noch einmal maskiert das DIDL-Lite mit den Titelangaben.
 */

import { expect } from 'chai';
import { durationToSeconds, parseDidlLite, parseLastChange, parsePropertySet } from './events';

const AV_TRANSPORT_NOTIFY = `<?xml version="1.0"?><e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0"><e:property><LastChange>&lt;Event xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/AVT/&quot;&gt;&lt;InstanceID val=&quot;0&quot;&gt;&lt;AVTransportURIMetaData val=&quot;&amp;lt;DIDL-Lite xmlns=&amp;quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&amp;quot; xmlns:raumfeld=&amp;quot;urn:schemas-raumfeld-com:meta-data/raumfeld&amp;quot; xmlns:upnp=&amp;quot;urn:schemas-upnp-org:metadata-1-0/upnp/&amp;quot; xmlns:dc=&amp;quot;http://purl.org/dc/elements/1.1/&amp;quot;&amp;gt;&amp;lt;item id=&amp;quot;0/Spotify/Track&amp;quot; parentID=&amp;quot;0/Spotify&amp;quot; restricted=&amp;quot;0&amp;quot;&amp;gt;&amp;lt;upnp:class&amp;gt;object.item.audioItem.musicTrack&amp;lt;/upnp:class&amp;gt;&amp;lt;raumfeld:section&amp;gt;Spotify&amp;lt;/raumfeld:section&amp;gt;&amp;lt;dc:title&amp;gt;Teststueck&amp;lt;/dc:title&amp;gt;&amp;lt;upnp:artist&amp;gt;Testkuenstler&amp;lt;/upnp:artist&amp;gt;&amp;lt;/item&amp;gt;&amp;lt;/DIDL-Lite&amp;gt;&quot;/&gt;&lt;CurrentTrackDuration val=&quot;0:03:14&quot;/&gt;&lt;PowerState val=&quot;AUTOMATIC_STANDBY&quot;/&gt;&lt;AVTransportURI val=&quot;spotify://playback&quot;/&gt;&lt;CurrentPlayMode val=&quot;NORMAL&quot;/&gt;&lt;TransportState val=&quot;PAUSED_PLAYBACK&quot;/&gt;&lt;OwnsAudioResource val=&quot;0&quot;/&gt;&lt;CurrentTransportActions val=&quot;Play&quot;/&gt;&lt;TransportStatus val=&quot;OK&quot;/&gt;&lt;/InstanceID&gt;&lt;/Event&gt;</LastChange></e:property><e:property><BufferFilled>0</BufferFilled></e:property></e:propertyset>`;

const RENDERING_CONTROL_NOTIFY = `<?xml version="1.0"?><e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0"><e:property><LastChange>&lt;Event xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/RCS/&quot;&gt;&lt;InstanceID val=&quot;0&quot;&gt;&lt;LowDB val=&quot;0.000000&quot;/&gt;&lt;Mute Channel=&quot;Master&quot; val=&quot;0&quot;/&gt;&lt;MidDB val=&quot;0.000000&quot;/&gt;&lt;Volume Channel=&quot;Master&quot; val=&quot;40&quot;/&gt;&lt;HighDB val=&quot;0.000000&quot;/&gt;&lt;/InstanceID&gt;&lt;/Event&gt;</LastChange></e:property></e:propertyset>`;

describe('parsePropertySet', () => {
	it('trennt LastChange von den eigenstaendigen Eigenschaften', () => {
		const properties = parsePropertySet(AV_TRANSPORT_NOTIFY);

		expect(properties).to.have.property('BufferFilled', '0');
		expect(properties.LastChange).to.be.a('string');
		// Die Maskierung muss aufgeloest sein, sonst laesst sich das Ergebnis
		// nicht weiterverarbeiten.
		expect(properties.LastChange).to.contain('<TransportState');
	});
});

describe('parseLastChange', () => {
	it('liest den Wiedergabezustand samt Raumfeld-Erweiterungen', () => {
		const values = parseLastChange(parsePropertySet(AV_TRANSPORT_NOTIFY).LastChange);

		expect(values.TransportState).to.equal('PAUSED_PLAYBACK');
		expect(values.CurrentPlayMode).to.equal('NORMAL');
		expect(values.CurrentTrackDuration).to.equal('0:03:14');
		expect(values.AVTransportURI).to.equal('spotify://playback');
		// PowerState steht nicht im UPnP-Standard, Raumfeld liefert ihn hier mit.
		expect(values.PowerState).to.equal('AUTOMATIC_STANDBY');
	});

	it('liest Lautstaerke, Stummschaltung und Klangregler', () => {
		const values = parseLastChange(parsePropertySet(RENDERING_CONTROL_NOTIFY).LastChange);

		expect(values.Volume).to.equal('40');
		expect(values.Mute).to.equal('0');
		expect(values.LowDB).to.equal('0.000000');
		expect(values.MidDB).to.equal('0.000000');
		expect(values.HighDB).to.equal('0.000000');
	});

	it('uebernimmt nur den Kanal Master', () => {
		const xml =
			'<Event><InstanceID val="0">' +
			'<Volume Channel="Master" val="40"/>' +
			'<Volume Channel="LF" val="11"/>' +
			'</InstanceID></Event>';
		expect(parseLastChange(xml).Volume).to.equal('40');
	});

	it('kommt mit einem leeren Ereignis zurecht', () => {
		expect(parseLastChange('<Event><InstanceID val="0"></InstanceID></Event>')).to.deep.equal({});
	});
});

describe('parseDidlLite', () => {
	it('liest die Titelangaben aus dem eingebetteten DIDL-Lite', () => {
		const values = parseLastChange(parsePropertySet(AV_TRANSPORT_NOTIFY).LastChange);
		const track = parseDidlLite(values.AVTransportURIMetaData);

		expect(track).to.not.be.undefined;
		expect(track?.title).to.equal('Teststueck');
		expect(track?.artist).to.equal('Testkuenstler');
		// Raumfeld vermerkt die Quelle in einem eigenen Namensraum.
		expect(track?.section).to.equal('Spotify');
		expect(track?.objectId).to.equal('0/Spotify/Track');
	});

	it('liefert undefined, wenn nichts enthalten ist', () => {
		expect(parseDidlLite('')).to.be.undefined;
		expect(parseDidlLite('<DIDL-Lite></DIDL-Lite>')).to.be.undefined;
	});
});

describe('durationToSeconds', () => {
	it('rechnet h:mm:ss in Sekunden um', () => {
		expect(durationToSeconds('0:03:14')).to.equal(194);
		expect(durationToSeconds('1:00:00')).to.equal(3600);
		expect(durationToSeconds('0:00:00')).to.equal(0);
	});

	it('liefert 0 bei unbrauchbaren Angaben', () => {
		expect(durationToSeconds('NOT_IMPLEMENTED')).to.equal(0);
		expect(durationToSeconds('')).to.equal(0);
	});
});
