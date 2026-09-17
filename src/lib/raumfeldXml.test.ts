/**
 * Pruefungen der XML-Auswertung.
 *
 * Die Vorlagen sind keine erfundenen Beispiele, sondern die woertlichen
 * Antworten der beiden Teufel One S mit Firmware 2.19.3, abgenommen mit
 * tools/explore.mts. Nur der Fall "Raeume in einer Zone" ist nachgebildet,
 * weil dafuer beide Lautsprecher gruppiert sein muessten.
 */

import { expect } from 'chai';
import { parseDeviceList, parseHostInfo, parseZoneConfiguration, roomIdFromName } from './raumfeldXml';

const ZONES_UNASSIGNED = `<?xml version='1.0' encoding='UTF-8'?>
<zoneConfig numRooms='2' spotifyMode='singleRoom'>
 <unassignedRooms>
  <room name='AlexOneS' udn='uuid:4aaee87e-81da-440c-aba9-1473aca55b44' powerState='AUTOMATIC_STANDBY'>
   <renderer udn='uuid:717def93-31a9-4ac1-b384-8631187cd78a' name='Speaker AlexOneS #2' spotifyConnect='active'></renderer>
  </room>
  <room name='AngisOnes' udn='uuid:6b816b4a-7f81-407c-b299-d15a6fd85581' powerState='AUTOMATIC_STANDBY'>
   <renderer udn='uuid:edcad4d1-3a7b-4513-a1ec-f7cbe0d99dba' name='Speaker AngisOnes' spotifyConnect='active'></renderer>
  </room>
 </unassignedRooms>
</zoneConfig>`;

// Nachgebildet: so sieht die Antwort aus, sobald Raeume gruppiert sind.
const ZONES_GROUPED = `<?xml version='1.0' encoding='UTF-8'?>
<zoneConfig numRooms='2' spotifyMode='multiRoom'>
 <zones>
  <zone udn='uuid:11111111-2222-3333-4444-555555555555'>
   <room name='AlexOneS' udn='uuid:4aaee87e-81da-440c-aba9-1473aca55b44' powerState='ACTIVE'>
    <renderer udn='uuid:717def93-31a9-4ac1-b384-8631187cd78a' name='Speaker AlexOneS #2' spotifyConnect='active'></renderer>
   </room>
   <room name='AngisOnes' udn='uuid:6b816b4a-7f81-407c-b299-d15a6fd85581' powerState='ACTIVE'>
    <renderer udn='uuid:edcad4d1-3a7b-4513-a1ec-f7cbe0d99dba' name='Speaker AngisOnes' spotifyConnect='active'></renderer>
   </room>
  </zone>
 </zones>
 <unassignedRooms></unassignedRooms>
</zoneConfig>`;

const DEVICE_LIST = `<?xml version='1.0' encoding='UTF-8'?>
<devices>
 <device udn='uuid:717def93-31a9-4ac1-b384-8631187cd78a' type='urn:schemas-upnp-org:device:MediaRenderer:1' location='http://10.10.11.32:51156/717def93-31a9-4ac1-b384-8631187cd78a.xml'>Speaker AlexOneS #2</device>
 <device udn='uuid:a37aa81b-41d5-4bdc-b531-6f2d04fd878d' type='urn:schemas-raumfeld-com:device:ConfigDevice:1' location='http://10.10.11.31:53996/a37aa81b-41d5-4bdc-b531-6f2d04fd878d.xml'>Raumfeld ConfigDevice</device>
 <device udn='uuid:c7b0990e-70d1-4e40-81fd-79acb2ba1aa5' type='urn:schemas-upnp-org:device:MediaServer:1' location='http://10.10.11.31:51099/c7b0990e-70d1-4e40-81fd-79acb2ba1aa5.xml'>Raumfeld MediaServer</device>
</devices>`;

const HOST_INFO = `<?xml version='1.0' encoding='UTF-8'?>
<hostInfo>
 <hostName>Teufel One S</hostName>
 <roomName>AngisOnes</roomName>
</hostInfo>`;

describe('parseZoneConfiguration', () => {
	it('liest nicht zugeordnete Raeume samt Renderer', () => {
		const config = parseZoneConfiguration(ZONES_UNASSIGNED);

		expect(config.numRooms).to.equal(2);
		expect(config.spotifyMode).to.equal('singleRoom');
		expect(config.zones).to.be.empty;
		expect(config.unassignedRooms).to.have.lengthOf(2);

		const room = config.unassignedRooms[0];
		expect(room.name).to.equal('AlexOneS');
		expect(room.udn).to.equal('uuid:4aaee87e-81da-440c-aba9-1473aca55b44');
		expect(room.powerState).to.equal('AUTOMATIC_STANDBY');
		expect(room.zoneUdn).to.be.undefined;
		expect(room.renderers).to.have.lengthOf(1);
		expect(room.renderers[0].name).to.equal('Speaker AlexOneS #2');
		expect(room.renderers[0].spotifyConnect).to.be.true;
	});

	it('vermerkt bei gruppierten Raeumen die Zone', () => {
		const config = parseZoneConfiguration(ZONES_GROUPED);

		expect(config.zones).to.have.lengthOf(1);
		expect(config.unassignedRooms).to.be.empty;
		expect(config.zones[0].rooms).to.have.lengthOf(2);

		for (const room of config.zones[0].rooms) {
			expect(room.zoneUdn).to.equal('uuid:11111111-2222-3333-4444-555555555555');
			expect(room.powerState).to.equal('ACTIVE');
		}
	});

	it('fuehrt gruppierte und einzelne Raeume in allRooms zusammen', () => {
		expect(parseZoneConfiguration(ZONES_UNASSIGNED).allRooms).to.have.lengthOf(2);
		expect(parseZoneConfiguration(ZONES_GROUPED).allRooms).to.have.lengthOf(2);
	});

	it('kommt mit einem System ohne Raeume zurecht', () => {
		const config = parseZoneConfiguration(`<?xml version='1.0'?><zoneConfig numRooms='0'></zoneConfig>`);
		expect(config.numRooms).to.equal(0);
		expect(config.allRooms).to.be.empty;
	});
});

describe('parseDeviceList', () => {
	it('liest UDN, Typ, Adresse und Namen', () => {
		const devices = parseDeviceList(DEVICE_LIST);

		expect(devices).to.have.lengthOf(3);
		expect(devices[0].udn).to.equal('uuid:717def93-31a9-4ac1-b384-8631187cd78a');
		expect(devices[0].type).to.equal('urn:schemas-upnp-org:device:MediaRenderer:1');
		expect(devices[0].name).to.equal('Speaker AlexOneS #2');
		expect(devices[0].location).to.contain('10.10.11.32');
	});

	it('findet das ConfigDevice, an dem der Host erkannt wird', () => {
		const config = parseDeviceList(DEVICE_LIST).filter(device => device.type.includes('ConfigDevice'));
		expect(config).to.have.lengthOf(1);
		expect(config[0].location).to.contain('10.10.11.31');
	});
});

describe('parseHostInfo', () => {
	it('liest Hostnamen und Raum', () => {
		expect(parseHostInfo(HOST_INFO)).to.deep.equal({
			hostName: 'Teufel One S',
			roomName: 'AngisOnes',
		});
	});
});

describe('roomIdFromName', () => {
	it('laesst unbedenkliche Namen unveraendert', () => {
		expect(roomIdFromName('AngisOnes')).to.equal('AngisOnes');
	});

	it('ersetzt die in ioBroker unzulaessigen Zeichen', () => {
		expect(roomIdFromName('Wohnzimmer oben')).to.equal('Wohnzimmer_oben');
		expect(roomIdFromName('Kueche.Essen')).to.equal('Kueche_Essen');
		expect(roomIdFromName('Bad*neu')).to.equal('Bad_neu');
	});

	it('fasst Folgen zusammen und schneidet Raender ab', () => {
		expect(roomIdFromName('  Buero   unten  ')).to.equal('Buero_unten');
	});

	it('liefert fuer einen leeren Namen einen brauchbaren Ersatz', () => {
		expect(roomIdFromName('   ')).to.equal('unbenannt');
	});
});
