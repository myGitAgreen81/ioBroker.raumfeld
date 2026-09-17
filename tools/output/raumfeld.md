# Raumfeld-Erkundung

Aufgenommen am 2026-09-17 11:34:04 von 10.10.11.30 aus.

## Gefundene Geraete

| Adresse | Name | Typ | Modell | UDN |
|---|---|---|---|---|
| 10.10.11.31 | Teufel Raumfeld Device | RaumfeldDevice | Teufel One S | `uuid:e9485fab-bb6b-4534-8a9c-9a036dd2ee30` |
| 10.10.11.31 | Speaker AngisOnes | MediaRenderer | Teufel One S | `uuid:edcad4d1-3a7b-4513-a1ec-f7cbe0d99dba` |
| 10.10.11.31 | Raumfeld MediaServer | MediaServer | Teufel One S | `uuid:c7b0990e-70d1-4e40-81fd-79acb2ba1aa5` |
| 10.10.11.31 | Raumfeld ConfigDevice | ConfigDevice | Teufel One S | `uuid:a37aa81b-41d5-4bdc-b531-6f2d04fd878d` |
| 10.10.11.32 | Speaker AlexOneS #2 | MediaRenderer | Teufel One S | `uuid:717def93-31a9-4ac1-b384-8631187cd78a` |
| 10.10.11.32 | Teufel Raumfeld Device | RaumfeldDevice | Teufel One S | `uuid:9bc6df03-e5d3-4a4c-bb43-f47da8dfc997` |

## Teufel Raumfeld Device — 10.10.11.31

- Geraetetyp: `urn:schemas-raumfeld-com:device:RaumfeldDevice:1`
- UDN: `uuid:e9485fab-bb6b-4534-8a9c-9a036dd2ee30`
- Seriennummer: `50:1e:2d:53:a1:8e`
- Raumfeld-Protokollfassung: 16351
- Raumfeld-Hardwaretyp: 23
- Beschreibung: http://10.10.11.31:55504/e9485fab-bb6b-4534-8a9c-9a036dd2ee30.xml

### SetupService

- Typ: `urn:schemas-raumfeld-com:service:SetupService:1`
- Steuerung: http://10.10.11.31:55504/SetupService/ctrl
- Ereignisse: http://10.10.11.31:55504/SetupService/evt
- 8 Aktionen, 6 Zustandsvariablen, davon 2 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `GetInfo` | — | SoftwareVersion: string |
| `CheckForUpdate` | Throttle: ui4 | — |
| `GetUpdateInfo` | — | Version: string, SecondsSinceLastCheck: ui4 |
| `DoUpdate` | Version: string | — |
| `GetDevice` | Service: string | UniqueDeviceName: string |
| `GetNetworkInfo` | — | Address: string, AccessPoint: string, SignalStrength: ui4 |
| `SendReport` | SystemID: string, ReportID: string, UserMessage: string, UserName: string, UserEmail: string, UserPhone: string | — |
| `GetDeviceMode` | — | Mode: string |

**Meldet Aenderungen fuer:** `UpdateAvailable` (string), `UpdateState` (string)

## Speaker AngisOnes — 10.10.11.31

- Geraetetyp: `urn:schemas-upnp-org:device:MediaRenderer:1`
- UDN: `uuid:edcad4d1-3a7b-4513-a1ec-f7cbe0d99dba`
- Seriennummer: `50:1e:2d:53:a1:8e`
- Raumfeld-Protokollfassung: 16351
- Raumfeld-Hardwaretyp: 23
- Beschreibung: http://10.10.11.31:60110/edcad4d1-3a7b-4513-a1ec-f7cbe0d99dba.xml

### RenderingControl

- Typ: `urn:schemas-upnp-org:service:RenderingControl:1`
- Steuerung: http://10.10.11.31:60110/RenderingControl/ctrl
- Ereignisse: http://10.10.11.31:60110/RenderingControl/evt
- 17 Aktionen, 15 Zustandsvariablen, davon 2 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `PlaySystemSound` | InstanceID: ui4, Sound: string | — |
| `GetMute` | InstanceID: ui4, Channel: string | CurrentMute: boolean |
| `SetMute` | InstanceID: ui4, Channel: string, DesiredMute: boolean | — |
| `GetVolume` | InstanceID: ui4, Channel: string | CurrentVolume: ui2 |
| `SetVolume` | InstanceID: ui4, Channel: string, DesiredVolume: ui2 | — |
| `ChangeVolume` | InstanceID: ui4, Amount: i1 | — |
| `GetVolumeDB` | InstanceID: ui4, Channel: string | CurrentVolume: i2 |
| `SetVolumeDB` | InstanceID: ui4, Channel: string, DesiredVolume: i2 | — |
| `GetBalance` | InstanceID: ui4 | CurrentBalance: i2 |
| `SetBalance` | InstanceID: ui4, DesiredBalance: i2 | — |
| `GetLineInStreamURL` | — | URL: string, Mimetype: string |
| `SetFilter` | InstanceID: ui4, LowDB: i4, MidDB: i4, HighDB: i4 | — |
| `GetFilter` | InstanceID: ui4 | LowDB: i4, MidDB: i4, HighDB: i4 |
| `ToggleFilter` | InstanceID: ui4, FilterName: string, Enable: boolean | — |
| `QueryFilter` | InstanceID: ui4, FilterName: string | Enabled: boolean |
| `SetDeviceSetting` | InstanceID: ui4, Name: string, Value: string | — |
| `GetDeviceSetting` | InstanceID: ui4, Name: string | Value: string |

**Meldet Aenderungen fuer:** `LastChange` (string), `Balance` (i2)

### ConnectionManager

- Typ: `urn:schemas-upnp-org:service:ConnectionManager:1`
- Steuerung: http://10.10.11.31:60110/ConnectionManager/ctrl
- Ereignisse: http://10.10.11.31:60110/ConnectionManager/evt
- 1 Aktionen, 2 Zustandsvariablen, davon 1 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `GetProtocolInfo` | — | Source: string, Sink: string |

**Meldet Aenderungen fuer:** `SinkProtocolInfo` (string)

### AVTransport

- Typ: `urn:schemas-upnp-org:service:AVTransport:1`
- Steuerung: http://10.10.11.31:60110/AVTransport/ctrl
- Ereignisse: http://10.10.11.31:60110/AVTransport/evt
- 19 Aktionen, 20 Zustandsvariablen, davon 2 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `SetAVTransportURI` | InstanceID: ui4, CurrentURI: string, CurrentURIMetaData: string | — |
| `SetNextAVTransportURI` | InstanceID: ui4, NextURI: string, NextURIMetaData: string | — |
| `SetNextStartTriggerTime` | InstanceID: ui4, TimeService: string, StartTime: string | — |
| `GetPositionInfo` | InstanceID: ui4 | TrackDuration: string, RelTime: string |
| `GetTransportInfo` | InstanceID: ui4 | CurrentTransportState: string, CurrentTransportStatus: string, CurrentSpeed: string |
| `GetTransportSettings` | InstanceID: ui4 | PlayMode: string |
| `Stop` | InstanceID: ui4 | — |
| `Rewind` | InstanceID: ui4 | Position: string |
| `FastForward` | InstanceID: ui4 | Position: string |
| `Pause` | InstanceID: ui4 | — |
| `Play` | InstanceID: ui4, Speed: string | — |
| `Next` | InstanceID: ui4 | — |
| `Previous` | InstanceID: ui4 | — |
| `Seek` | InstanceID: ui4, Unit: string, Target: string | — |
| `SetPlayMode` | InstanceID: ui4, NewPlayMode: string | — |
| `EnterManualStandby` | InstanceID: ui4 | — |
| `EnterAutomaticStandby` | InstanceID: ui4 | — |
| `LeaveStandby` | InstanceID: ui4 | — |
| `GetSpotifyPreset` | InstanceID: ui4, Button: ui4 | Preset: string, Metadata: string |

**Meldet Aenderungen fuer:** `BufferFilled` (ui4), `LastChange` (string)

### RaumfeldGenerator

- Typ: `urn:schemas-raumfeld-com:service:RaumfeldGenerator:1`
- Steuerung: http://10.10.11.31:60110/RaumfeldGenerator/ctrl
- Ereignisse: http://10.10.11.31:60110/RaumfeldGenerator/evt
- 0 Aktionen, 1 Zustandsvariablen, davon 1 mit Ereignismeldung

**Meldet Aenderungen fuer:** `TransportControlButtons` (string)

## Raumfeld MediaServer — 10.10.11.31

- Geraetetyp: `urn:schemas-upnp-org:device:MediaServer:1`
- UDN: `uuid:c7b0990e-70d1-4e40-81fd-79acb2ba1aa5`
- Seriennummer: `197165da-1dd2-11b2-83f3-501e2d53a18e`
- Raumfeld-Protokollfassung: 16351
- Raumfeld-Hardwaretyp: 23
- Beschreibung: http://10.10.11.31:51099/c7b0990e-70d1-4e40-81fd-79acb2ba1aa5.xml

### ContentDirectory

- Typ: `urn:schemas-upnp-org:service:ContentDirectory:1`
- Steuerung: http://10.10.11.31:51099/cd/Control
- Ereignisse: http://10.10.11.31:51099/cd/Event
- 21 Aktionen, 27 Zustandsvariablen, davon 4 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `Browse` | ObjectID: string, BrowseFlag: string, Filter: string, StartingIndex: ui4, RequestedCount: ui4, SortCriteria: string | Result: string, NumberReturned: ui4, TotalMatches: ui4, UpdateID: ui4 |
| `Search` | ContainerID: string, SearchCriteria: string, Filter: string, StartingIndex: ui4, RequestedCount: ui4, SortCriteria: string | Result: string, NumberReturned: ui4, TotalMatches: ui4, UpdateID: ui4 |
| `Shuffle` | ContainerID: string, Selection: string | PlaylistID: string, PlaylistMetadata: string |
| `GetSearchCapabilities` | — | SearchCaps: string |
| `GetSortCapabilities` | — | SortCaps: string |
| `CreateReference` | ContainerID: string, ObjectID: string | NewID: string |
| `AddContainerToQueue` | QueueID: string, ContainerID: string, SourceID: string, SearchCriteria: string, SortCriteria: string, StartIndex: ui4, EndIndex: ui4, Position: ui4 | — |
| `AddItemToQueue` | QueueID: string, ObjectID: string, Position: ui4 | — |
| `RemoveFromQueue` | QueueID: string, FromPosition: ui4, ToPosition: ui4 | ContainerUpdateID: ui4 |
| `CreateQueue` | DesiredName: string, ContainerID: string | GivenName: string, QueueID: string, MetaData: string |
| `RenameQueue` | QueueID: string, DesiredName: string | GivenName: string |
| `MoveInQueue` | ObjectID: string, NewPosition: ui4 | ContainerUpdateID: ui4 |
| `DestroyObject` | ObjectID: string | — |
| `ResetDatabase` | Scope: string | — |
| `GetSystemUpdateID` | — | Id: ui4 |
| `GetIndexerStatus` | — | Status: string |
| `GetSourceInfo` | SourceID: string | NumTracks: ui4, TotalSize: ui4, TotalDuration: ui4, IndexerResult: string |
| `RescanSource` | SourceID: string, RescanMode: string | — |
| `QueryDatabaseState` | — | CurrentNumResources: ui4, CriticalNumResources: ui4, CurrentDiskUsage: ui4, MaxDiskUsage: ui4 |
| `AssignStationButton` | Renderer: string, Button: ui4, ObjectID: string, OptionalMetadata: string | — |
| `GetStationButtonAssignment` | Renderer: string, Button: ui4 | ObjectID: string |

**Meldet Aenderungen fuer:** `SystemUpdateID` (ui4), `ContainerUpdateIDs` (string), `IndexerStatus` (string), `A_ARG_TYPE_Scope` (string)

### ConnectionManager

- Typ: `urn:schemas-upnp-org:service:ConnectionManager:1`
- Steuerung: http://10.10.11.31:51099/cm/Control
- Ereignisse: http://10.10.11.31:51099/cm/Event
- 3 Aktionen, 10 Zustandsvariablen, davon 3 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `GetCurrentConnectionIDs` | — | ConnectionIDs: string |
| `GetCurrentConnectionInfo` | ConnectionID: i4 | RcsID: i4, AVTransportID: i4, ProtocolInfo: string, PeerConnectionManager: string, PeerConnectionID: i4, Direction: string, Status: string |
| `GetProtocolInfo` | — | Source: string, Sink: string |

**Meldet Aenderungen fuer:** `SourceProtocolInfo` (string), `SinkProtocolInfo` (string), `CurrentConnectionIDs` (string)

## Raumfeld ConfigDevice — 10.10.11.31

- Geraetetyp: `urn:schemas-raumfeld-com:device:ConfigDevice:1`
- UDN: `uuid:a37aa81b-41d5-4bdc-b531-6f2d04fd878d`
- Seriennummer: `197165da-1dd2-11b2-83f3-501e2d53a18e`
- Raumfeld-Protokollfassung: 16351
- Raumfeld-Hardwaretyp: 23
- Beschreibung: http://10.10.11.31:53996/a37aa81b-41d5-4bdc-b531-6f2d04fd878d.xml

### ConfigService

- Typ: `urn:schemas-raumfeld-com:service:ConfigService:1`
- Steuerung: http://10.10.11.31:53996/ConfigService/Control
- Ereignisse: http://10.10.11.31:53996/ConfigService/Event
- 5 Aktionen, 5 Zustandsvariablen, davon 3 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `GetPublicKey` | — | Key: string |
| `GetRevision` | — | Revision: ui4 |
| `SetPreferences` | Preferences: string, LeastCommonChangedNode: string, ExpectedRevision: ui4, OnConflict: string | — |
| `GetPreferences` | PublicKey: string | Preferences: string, Revision: ui4 |
| `GetDevice` | Service: string | UniqueDeviceName: string |

**Meldet Aenderungen fuer:** `LastChange` (string), `Revision` (ui4), `ARG_TYPE_OnConflict` (string)

## Speaker AlexOneS #2 — 10.10.11.32

- Geraetetyp: `urn:schemas-upnp-org:device:MediaRenderer:1`
- UDN: `uuid:717def93-31a9-4ac1-b384-8631187cd78a`
- Seriennummer: `50:1e:2d:49:93:88`
- Raumfeld-Protokollfassung: 16351
- Raumfeld-Hardwaretyp: 23
- Beschreibung: http://10.10.11.32:51156/717def93-31a9-4ac1-b384-8631187cd78a.xml

### RenderingControl

- Typ: `urn:schemas-upnp-org:service:RenderingControl:1`
- Steuerung: http://10.10.11.32:51156/RenderingControl/ctrl
- Ereignisse: http://10.10.11.32:51156/RenderingControl/evt
- 17 Aktionen, 15 Zustandsvariablen, davon 2 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `PlaySystemSound` | InstanceID: ui4, Sound: string | — |
| `GetMute` | InstanceID: ui4, Channel: string | CurrentMute: boolean |
| `SetMute` | InstanceID: ui4, Channel: string, DesiredMute: boolean | — |
| `GetVolume` | InstanceID: ui4, Channel: string | CurrentVolume: ui2 |
| `SetVolume` | InstanceID: ui4, Channel: string, DesiredVolume: ui2 | — |
| `ChangeVolume` | InstanceID: ui4, Amount: i1 | — |
| `GetVolumeDB` | InstanceID: ui4, Channel: string | CurrentVolume: i2 |
| `SetVolumeDB` | InstanceID: ui4, Channel: string, DesiredVolume: i2 | — |
| `GetBalance` | InstanceID: ui4 | CurrentBalance: i2 |
| `SetBalance` | InstanceID: ui4, DesiredBalance: i2 | — |
| `GetLineInStreamURL` | — | URL: string, Mimetype: string |
| `SetFilter` | InstanceID: ui4, LowDB: i4, MidDB: i4, HighDB: i4 | — |
| `GetFilter` | InstanceID: ui4 | LowDB: i4, MidDB: i4, HighDB: i4 |
| `ToggleFilter` | InstanceID: ui4, FilterName: string, Enable: boolean | — |
| `QueryFilter` | InstanceID: ui4, FilterName: string | Enabled: boolean |
| `SetDeviceSetting` | InstanceID: ui4, Name: string, Value: string | — |
| `GetDeviceSetting` | InstanceID: ui4, Name: string | Value: string |

**Meldet Aenderungen fuer:** `LastChange` (string), `Balance` (i2)

### ConnectionManager

- Typ: `urn:schemas-upnp-org:service:ConnectionManager:1`
- Steuerung: http://10.10.11.32:51156/ConnectionManager/ctrl
- Ereignisse: http://10.10.11.32:51156/ConnectionManager/evt
- 1 Aktionen, 2 Zustandsvariablen, davon 1 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `GetProtocolInfo` | — | Source: string, Sink: string |

**Meldet Aenderungen fuer:** `SinkProtocolInfo` (string)

### AVTransport

- Typ: `urn:schemas-upnp-org:service:AVTransport:1`
- Steuerung: http://10.10.11.32:51156/AVTransport/ctrl
- Ereignisse: http://10.10.11.32:51156/AVTransport/evt
- 19 Aktionen, 20 Zustandsvariablen, davon 2 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `SetAVTransportURI` | InstanceID: ui4, CurrentURI: string, CurrentURIMetaData: string | — |
| `SetNextAVTransportURI` | InstanceID: ui4, NextURI: string, NextURIMetaData: string | — |
| `SetNextStartTriggerTime` | InstanceID: ui4, TimeService: string, StartTime: string | — |
| `GetPositionInfo` | InstanceID: ui4 | TrackDuration: string, RelTime: string |
| `GetTransportInfo` | InstanceID: ui4 | CurrentTransportState: string, CurrentTransportStatus: string, CurrentSpeed: string |
| `GetTransportSettings` | InstanceID: ui4 | PlayMode: string |
| `Stop` | InstanceID: ui4 | — |
| `Rewind` | InstanceID: ui4 | Position: string |
| `FastForward` | InstanceID: ui4 | Position: string |
| `Pause` | InstanceID: ui4 | — |
| `Play` | InstanceID: ui4, Speed: string | — |
| `Next` | InstanceID: ui4 | — |
| `Previous` | InstanceID: ui4 | — |
| `Seek` | InstanceID: ui4, Unit: string, Target: string | — |
| `SetPlayMode` | InstanceID: ui4, NewPlayMode: string | — |
| `EnterManualStandby` | InstanceID: ui4 | — |
| `EnterAutomaticStandby` | InstanceID: ui4 | — |
| `LeaveStandby` | InstanceID: ui4 | — |
| `GetSpotifyPreset` | InstanceID: ui4, Button: ui4 | Preset: string, Metadata: string |

**Meldet Aenderungen fuer:** `BufferFilled` (ui4), `LastChange` (string)

### RaumfeldGenerator

- Typ: `urn:schemas-raumfeld-com:service:RaumfeldGenerator:1`
- Steuerung: http://10.10.11.32:51156/RaumfeldGenerator/ctrl
- Ereignisse: http://10.10.11.32:51156/RaumfeldGenerator/evt
- 0 Aktionen, 1 Zustandsvariablen, davon 1 mit Ereignismeldung

**Meldet Aenderungen fuer:** `TransportControlButtons` (string)

## Teufel Raumfeld Device — 10.10.11.32

- Geraetetyp: `urn:schemas-raumfeld-com:device:RaumfeldDevice:1`
- UDN: `uuid:9bc6df03-e5d3-4a4c-bb43-f47da8dfc997`
- Seriennummer: `50:1e:2d:49:93:88`
- Raumfeld-Protokollfassung: 16351
- Raumfeld-Hardwaretyp: 23
- Beschreibung: http://10.10.11.32:53909/9bc6df03-e5d3-4a4c-bb43-f47da8dfc997.xml

### SetupService

- Typ: `urn:schemas-raumfeld-com:service:SetupService:1`
- Steuerung: http://10.10.11.32:53909/SetupService/ctrl
- Ereignisse: http://10.10.11.32:53909/SetupService/evt
- 8 Aktionen, 6 Zustandsvariablen, davon 2 mit Ereignismeldung

| Aktion | hinein | heraus |
|---|---|---|
| `GetInfo` | — | SoftwareVersion: string |
| `CheckForUpdate` | Throttle: ui4 | — |
| `GetUpdateInfo` | — | Version: string, SecondsSinceLastCheck: ui4 |
| `DoUpdate` | Version: string | — |
| `GetDevice` | Service: string | UniqueDeviceName: string |
| `GetNetworkInfo` | — | Address: string, AccessPoint: string, SignalStrength: ui4 |
| `SendReport` | SystemID: string, ReportID: string, UserMessage: string, UserName: string, UserEmail: string, UserPhone: string | — |
| `GetDeviceMode` | — | Mode: string |

**Meldet Aenderungen fuer:** `UpdateAvailable` (string), `UpdateState` (string)

## Host-Webservice — 10.10.11.31:47365

### /getHostInfo

Umgeleitet auf `http://10.10.11.31:47365/f99dbd46-6888-451d-a962-b2cc6cfb43af/getHostInfo` (HTTP 200)

```xml
<?xml version='1.0' encoding='UTF-8'?>
<hostInfo>
 <hostName>Teufel One S</hostName>
 <roomName>AngisOnes</roomName>
</hostInfo>
```

### /listDevices

Umgeleitet auf `http://10.10.11.31:47365/11e27cde-e11d-49f2-9f3d-c417abbf464b/listDevices` (HTTP 200)

```xml
<?xml version='1.0' encoding='UTF-8'?>
<devices>
 <device udn='uuid:717def93-31a9-4ac1-b384-8631187cd78a' type='urn:schemas-upnp-org:device:MediaRenderer:1' location='http://10.10.11.32:51156/717def93-31a9-4ac1-b384-8631187cd78a.xml'>Speaker AlexOneS #2</device>
 <device udn='uuid:9bc6df03-e5d3-4a4c-bb43-f47da8dfc997' type='urn:schemas-raumfeld-com:device:RaumfeldDevice:1' location='http://10.10.11.32:53909/9bc6df03-e5d3-4a4c-bb43-f47da8dfc997.xml'>Teufel Raumfeld Device</device>
 <device udn='uuid:a37aa81b-41d5-4bdc-b531-6f2d04fd878d' type='urn:schemas-raumfeld-com:device:ConfigDevice:1' location='http://10.10.11.31:53996/a37aa81b-41d5-4bdc-b531-6f2d04fd878d.xml'>Raumfeld ConfigDevice</device>
 <device udn='uuid:c7b0990e-70d1-4e40-81fd-79acb2ba1aa5' type='urn:schemas-upnp-org:device:MediaServer:1' location='http://10.10.11.31:51099/c7b0990e-70d1-4e40-81fd-79acb2ba1aa5.xml'>Raumfeld MediaServer</device>
 <device udn='uuid:e9485fab-bb6b-4534-8a9c-9a036dd2ee30' type='urn:schemas-raumfeld-com:device:RaumfeldDevice:1' location='http://10.10.11.31:55504/e9485fab-bb6b-4534-8a9c-9a036dd2ee30.xml'>Teufel Raumfeld Device</device>
 <device udn='uuid:edcad4d1-3a7b-4513-a1ec-f7cbe0d99dba' type='urn:schemas-upnp-org:device:MediaRenderer:1' location='http://10.10.11.31:60110/edcad4d1-3a7b-4513-a1ec-f7cbe0d99dba.xml'>Speaker AngisOnes</device>
</devices>
```

### /getZones

Umgeleitet auf `http://10.10.11.31:47365/89bde44d-9e32-4d92-b648-9c8e2de7b740/getZones` (HTTP 200)

```xml
<?xml version='1.0' encoding='UTF-8'?>
<zoneConfig numRooms='2' spotifyMode='singleRoom'>
 <unassignedRooms>
  <room name='AlexOneS' udn='uuid:4aaee87e-81da-440c-aba9-1473aca55b44' powerState='AUTOMATIC_STANDBY'>
   <renderer udn='uuid:717def93-31a9-4ac1-b384-8631187cd78a' name='Speaker AlexOneS #2' spotifyConnect='active'></renderer>
  </room>
  <room name='AngisOnes' udn='uuid:6b816b4a-7f81-407c-b299-d15a6fd85581' powerState='AUTOMATIC_STANDBY'>
   <renderer udn='uuid:edcad4d1-3a7b-4513-a1ec-f7cbe0d99dba' name='Speaker AngisOnes' spotifyConnect='active'></renderer>
  </room>
 </unassignedRooms>
</zoneConfig>
```

## MediaServer — oberste Ebene

```xml
<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><Result>&lt;DIDL-Lite xmlns=&quot;urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/&quot; xmlns:raumfeld=&quot;urn:schemas-raumfeld-com:meta-data/raumfeld&quot; xmlns:upnp=&quot;urn:schemas-upnp-org:metadata-1-0/upnp/&quot; xmlns:dc=&quot;http://purl.org/dc/elements/1.1/&quot; lang=&quot;en&quot;&gt;&lt;container parentID=&quot;0&quot; id=&quot;0/My Music&quot; restricted=&quot;1&quot; childCount=&quot;9&quot;&gt;&lt;raumfeld:name&gt;My Music&lt;/raumfeld:name&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;raumfeld:section&gt;My Music&lt;/raumfeld:section&gt;&lt;dc:title&gt;My Music&lt;/dc:title&gt;&lt;/container&gt;&lt;container parentID=&quot;0&quot; id=&quot;0/Playlists&quot; restricted=&quot;1&quot; childCount=&quot;2&quot;&gt;&lt;raumfeld:name&gt;Playlists&lt;/raumfeld:name&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;raumfeld:section&gt;Playlists&lt;/raumfeld:section&gt;&lt;dc:title&gt;Playlists&lt;/dc:title&gt;&lt;/container&gt;&lt;container parentID=&quot;0&quot; id=&quot;0/RadioTime&quot; restricted=&quot;1&quot; childCount=&quot;6&quot;&gt;&lt;raumfeld:name&gt;RadioTime&lt;/raumfeld:name&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;raumfeld:section&gt;RadioTime&lt;/raumfeld:section&gt;&lt;dc:title&gt;TuneIn&lt;/dc:title&gt;&lt;/container&gt;&lt;container parentID=&quot;0&quot; id=&quot;0/Spotify&quot; restricted=&quot;1&quot; childCount=&quot;0&quot;&gt;&lt;raumfeld:name&gt;Spotify&lt;/raumfeld:name&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;raumfeld:section&gt;Spotify&lt;/raumfeld:section&gt;&lt;dc:title&gt;Spotify&lt;/dc:title&gt;&lt;/container&gt;&lt;container parentID=&quot;0&quot; id=&quot;0/Line In&quot; restricted=&quot;1&quot;&gt;&lt;raumfeld:name&gt;Line In&lt;/raumfeld:name&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;raumfeld:section&gt;Line In&lt;/raumfeld:section&gt;&lt;dc:title&gt;Line-in&lt;/dc:title&gt;&lt;/container&gt;&lt;container parentID=&quot;0&quot; id=&quot;0/Favorites&quot; restricted=&quot;1&quot; childCount=&quot;5&quot;&gt;&lt;raumfeld:name&gt;Favorites&lt;/raumfeld:name&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;raumfeld:section&gt;Favorites&lt;/raumfeld:section&gt;&lt;dc:title&gt;Teufel Favourites&lt;/dc:title&gt;&lt;/container&gt;&lt;container parentID=&quot;0&quot; id=&quot;0/Zones&quot; restricted=&quot;1&quot;&gt;&lt;raumfeld:name&gt;Zones&lt;/raumfeld:name&gt;&lt;upnp:class&gt;object.container&lt;/upnp:class&gt;&lt;raumfeld:section&gt;Zones&lt;/raumfeld:section&gt;&lt;dc:title&gt;Zones&lt;/dc:title&gt;&lt;/container&gt;&lt;container parentID=&quot;0&quot; id=&quot;0/Renderers&quot; restricted=&quot;1&quot;&gt;&lt;raumfeld:name&gt;Renderers&lt;/raumfeld:name&gt;&lt;upnp:class&gt;object.contain
```

